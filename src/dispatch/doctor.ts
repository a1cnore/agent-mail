import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  AGENTMAIL_DIR,
  listProfilesWithPollingConfig,
  resolveAgentmailPaths
} from "../config/paths";
import { validateEnvFile } from "../config/env";
import { tryReadPollingConfig } from "../config/polling";
import { listDispatchQueue } from "../storage/database";
import {
  DEFAULT_MAIL_DISPATCH_CONFIG_FILE,
  readMailDispatcherConfig
} from "./worker";

export interface MailBridgeDoctorProfile {
  profileId: string;
  envValid: boolean;
  envExists: boolean;
  pollingConfigured: boolean;
  bindingAgentId: string | null;
  bindingEnabled: boolean;
  watcherPid: number | null;
  watcherAlive: boolean;
  failedJobs: number;
  stalledJobs: number;
}

export interface MailBridgeDoctorReport {
  dispatcherConfigPath: string;
  dispatcherConfigExists: boolean;
  stalledThresholdSeconds: number;
  profiles: MailBridgeDoctorProfile[];
  issues: string[];
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const ioError = error as NodeJS.ErrnoException;
    if (ioError.code === "ESRCH") {
      return false;
    }

    if (ioError.code === "EPERM") {
      return true;
    }

    throw error;
  }
}

async function readPidFromLockFile(lockFilePath: string): Promise<number | null> {
  try {
    const contents = await readFile(lockFilePath, "utf8");
    const parsed = JSON.parse(contents) as { pid?: unknown };
    return typeof parsed.pid === "number" && Number.isInteger(parsed.pid) ? parsed.pid : null;
  } catch {
    return null;
  }
}

export async function runMailBridgeDoctor(
  options: {
    configFilePath?: string;
    stalledThresholdSeconds?: number;
    databaseFile?: string;
  } = {}
): Promise<MailBridgeDoctorReport> {
  const configFilePath = options.configFilePath ?? DEFAULT_MAIL_DISPATCH_CONFIG_FILE;
  const stalledThresholdSeconds = options.stalledThresholdSeconds ?? 60;
  const issues: string[] = [];

  let dispatcherConfigExists = true;
  let dispatcherConfig;
  try {
    dispatcherConfig = await readMailDispatcherConfig(configFilePath);
  } catch (error) {
    const ioError = error as NodeJS.ErrnoException;
    dispatcherConfigExists = false;
    if (ioError.code !== "ENOENT") {
      throw error;
    }
    issues.push(`Dispatcher config missing: ${configFilePath}`);
    dispatcherConfig = {
      accounts: {},
      worker: {
        pollIntervalMs: 1000,
        maxConcurrentSessions: 4
      }
    };
  }

  const profileIds = new Set<string>(Object.keys(dispatcherConfig.accounts));
  const configuredProfiles = await listProfilesWithPollingConfig();
  for (const profileId of configuredProfiles) {
    profileIds.add(profileId);
  }

  const legacyPolling = await tryReadPollingConfig(path.join(AGENTMAIL_DIR, "polling.json"));
  if (legacyPolling) {
    profileIds.add("default");
  }

  const profiles: MailBridgeDoctorProfile[] = [];

  for (const profileId of [...profileIds].sort()) {
    const paths = resolveAgentmailPaths(profileId === "default" ? undefined : profileId);
    const validation = await validateEnvFile(paths.envFile);
    const pollingConfig = await tryReadPollingConfig(paths.pollingConfigFile);
    const binding = dispatcherConfig.accounts[profileId];
    const watcherPid = await readPidFromLockFile(paths.receiveWatchLockFile);
    const watcherAlive = watcherPid !== null ? isProcessAlive(watcherPid) : false;
    const failedJobs = listDispatchQueue(
      {
        profileId,
        statuses: ["failed", "deadletter"],
        limit: 200
      },
      options.databaseFile
    ).length;
    const stalledJobs = listDispatchQueue(
      {
        profileId,
        statuses: ["pending"],
        limit: 200
      },
      options.databaseFile
    ).filter((entry) => Date.parse(entry.savedAt) <= Date.now() - stalledThresholdSeconds * 1000).length;

    if (!validation.isValid) {
      issues.push(`Invalid env for profile ${profileId}: ${paths.envFile}`);
    }
    if (!pollingConfig) {
      issues.push(`Missing polling config for profile ${profileId}: ${paths.pollingConfigFile}`);
    }
    if (!binding || !binding.enabled) {
      issues.push(`Missing or disabled dispatcher binding for profile ${profileId}.`);
    }
    if (pollingConfig && !watcherAlive) {
      issues.push(`Watcher not running for profile ${profileId}.`);
    }
    if (stalledJobs > 0) {
      issues.push(`Profile ${profileId} has ${stalledJobs} stalled pending job(s).`);
    }
    if (failedJobs > 0) {
      issues.push(`Profile ${profileId} has ${failedJobs} failed/deadletter job(s).`);
    }

    profiles.push({
      profileId,
      envValid: validation.isValid,
      envExists: validation.exists,
      pollingConfigured: Boolean(pollingConfig),
      bindingAgentId: binding?.agentId ?? null,
      bindingEnabled: binding?.enabled ?? false,
      watcherPid,
      watcherAlive,
      failedJobs,
      stalledJobs
    });
  }

  return {
    dispatcherConfigPath: configFilePath,
    dispatcherConfigExists,
    stalledThresholdSeconds,
    profiles,
    issues
  };
}
