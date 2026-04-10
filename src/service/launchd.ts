import os from "node:os";
import path from "node:path";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import {
  listProfilesWithPollingConfig,
  resolveAgentmailPaths,
  type AgentmailPaths
} from "../config/paths";
import { tryReadPollingConfig } from "../config/polling";
import { DEFAULT_MAIL_DISPATCH_CONFIG_FILE } from "../dispatch/worker";

export interface LaunchdServiceDefinition {
  label: string;
  plistPath: string;
  profileId: string | null;
  kind: "watcher" | "dispatcher";
}

export interface LaunchdServiceStatus extends LaunchdServiceDefinition {
  installed: boolean;
  loaded: boolean;
}

const LAUNCH_AGENTS_DIR = path.join(os.homedir(), "Library", "LaunchAgents");

function currentGuiDomain(): string {
  const uid = process.getuid?.();
  if (typeof uid !== "number") {
    throw new Error("launchd service management is not supported on this platform.");
  }

  return `gui/${uid}`;
}

function sanitizeLabelSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9.-]+/g, "-");
}

function watcherLabel(profileId: string): string {
  return `com.agentmail.receive.${sanitizeLabelSegment(profileId)}`;
}

function dispatcherLabel(): string {
  return "com.agentmail.dispatch";
}

function watcherPlistPath(profileId: string): string {
  return path.join(LAUNCH_AGENTS_DIR, `${watcherLabel(profileId)}.plist`);
}

function dispatcherPlistPath(): string {
  return path.join(LAUNCH_AGENTS_DIR, `${dispatcherLabel()}.plist`);
}

function plistTemplate(options: {
  label: string;
  command: string;
  workingDirectory: string;
  logFile: string;
}): string {
  const pathValue = `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${path.join(os.homedir(), ".local", "bin")}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${options.label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>${options.command}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${options.workingDirectory}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${os.homedir()}</string>
    <key>PATH</key>
    <string>${pathValue}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>${options.logFile}</string>
  <key>StandardErrorPath</key>
  <string>${options.logFile}</string>
</dict>
</plist>
`;
}

async function runLaunchctl(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("launchctl", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `launchctl exited with code ${String(code)}`));
    });
  });
}

async function isLaunchdLabelLoaded(label: string): Promise<boolean> {
  try {
    await runLaunchctl(["print", `${currentGuiDomain()}/${label}`]);
    return true;
  } catch {
    return false;
  }
}

async function resolveWatchTargets(): Promise<AgentmailPaths[]> {
  const profileIds = await listProfilesWithPollingConfig();
  const targets = profileIds.map((profileId) => resolveAgentmailPaths(profileId));
  const legacyPaths = resolveAgentmailPaths();
  if (targets.length === 0 && (await tryReadPollingConfig(legacyPaths.pollingConfigFile))) {
    return [legacyPaths];
  }

  return targets;
}

export async function installLaunchdServices(
  options: {
    dispatcherConfigFilePath?: string;
    workingDirectory?: string;
  } = {}
): Promise<LaunchdServiceDefinition[]> {
  const workingDirectory = options.workingDirectory ?? path.join(os.homedir(), "Developer", "agent-mail");
  const dispatcherConfig = options.dispatcherConfigFilePath ?? DEFAULT_MAIL_DISPATCH_CONFIG_FILE;
  const watchTargets = await resolveWatchTargets();
  const serviceDefinitions: LaunchdServiceDefinition[] = [];

  await mkdir(LAUNCH_AGENTS_DIR, { recursive: true });
  await mkdir(path.join(os.homedir(), ".agentmail", "logs"), { recursive: true });

  for (const paths of watchTargets) {
    const label = watcherLabel(paths.profileId);
    const plistPath = watcherPlistPath(paths.profileId);
    const command =
      paths.profile === null
        ? "agentmail receive watch"
        : `agentmail --profile "${paths.profile}" receive watch`;
    const logFile = path.join(os.homedir(), ".agentmail", "logs", `receive-${sanitizeLabelSegment(paths.profileId)}.log`);
    await writeFile(
      plistPath,
      plistTemplate({
        label,
        command,
        workingDirectory,
        logFile
      }),
      "utf8"
    );
    try {
      await runLaunchctl(["bootout", currentGuiDomain(), plistPath]);
    } catch {}
    await runLaunchctl(["bootstrap", currentGuiDomain(), plistPath]);
    serviceDefinitions.push({
      label,
      plistPath,
      profileId: paths.profileId,
      kind: "watcher"
    });
  }

  const dispatchLabelValue = dispatcherLabel();
  const dispatchPlist = dispatcherPlistPath();
  const dispatchLog = path.join(os.homedir(), ".agentmail", "logs", "dispatch.log");
  await writeFile(
    dispatchPlist,
    plistTemplate({
      label: dispatchLabelValue,
      command: `agentmail dispatch run --config "${dispatcherConfig}"`,
      workingDirectory,
      logFile: dispatchLog
    }),
    "utf8"
  );
  try {
    await runLaunchctl(["bootout", currentGuiDomain(), dispatchPlist]);
  } catch {}
  await runLaunchctl(["bootstrap", currentGuiDomain(), dispatchPlist]);
  serviceDefinitions.push({
    label: dispatchLabelValue,
    plistPath: dispatchPlist,
    profileId: null,
    kind: "dispatcher"
  });

  return serviceDefinitions;
}

export async function uninstallLaunchdServices(): Promise<LaunchdServiceDefinition[]> {
  const definitions = await listLaunchdServices();

  for (const definition of definitions) {
    try {
      await runLaunchctl(["bootout", currentGuiDomain(), definition.plistPath]);
    } catch {}
    await rm(definition.plistPath, { force: true });
  }

  return definitions;
}

export async function listLaunchdServices(): Promise<LaunchdServiceDefinition[]> {
  const definitions: LaunchdServiceDefinition[] = [];

  try {
    const entries = await readdir(LAUNCH_AGENTS_DIR);
    for (const entry of entries) {
      if (!entry.startsWith("com.agentmail.") || !entry.endsWith(".plist")) {
        continue;
      }

      const plistPath = path.join(LAUNCH_AGENTS_DIR, entry);
      if (entry === `${dispatcherLabel()}.plist`) {
        definitions.push({
          label: dispatcherLabel(),
          plistPath,
          profileId: null,
          kind: "dispatcher"
        });
        continue;
      }

      let profileId: string | null = entry
        .replace(/^com\.agentmail\.receive\./, "")
        .replace(/\.plist$/, "");
      try {
        const contents = await readFile(plistPath, "utf8");
        const explicitProfile = contents.match(/agentmail --profile "([^"]+)" receive watch/);
        if (explicitProfile?.[1]) {
          profileId = explicitProfile[1];
        } else if (contents.includes("agentmail receive watch")) {
          profileId = "default";
        }
      } catch {}
      definitions.push({
        label: entry.replace(/\.plist$/, ""),
        plistPath,
        profileId,
        kind: "watcher"
      });
    }
  } catch (error) {
    const ioError = error as NodeJS.ErrnoException;
    if (ioError.code !== "ENOENT") {
      throw error;
    }
  }

  return definitions.sort((left, right) => left.label.localeCompare(right.label));
}

export async function getLaunchdServiceStatus(): Promise<LaunchdServiceStatus[]> {
  const definitions = await listLaunchdServices();
  const statuses: LaunchdServiceStatus[] = [];

  for (const definition of definitions) {
    statuses.push({
      ...definition,
      installed: true,
      loaded: await isLaunchdLabelLoaded(definition.label)
    });
  }

  return statuses;
}
