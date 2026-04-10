import os from "node:os";
import path from "node:path";
import { access, mkdir, readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";

const PROFILE_NAME_PATTERN = /^[A-Za-z0-9._@-]+$/;

export interface AgentmailPaths {
  profile: string | null;
  profileId: string;
  rootDir: string;
  envFile: string;
  pollingConfigFile: string;
  messagesDir: string;
  sentMessagesDir: string;
  hooksDir: string;
  onRecieveHookFile: string;
  receiveWatchLockFile: string;
  databaseFile: string;
}

export const AGENTMAIL_DIR = path.join(os.homedir(), ".agentmail");
export const AGENTMAIL_PROFILES_DIR = path.join(AGENTMAIL_DIR, "profiles");
export const AGENTMAIL_DATABASE_FILE = path.join(AGENTMAIL_DIR, "agentmail.db");

export function resolveAgentmailProfileId(profile: string | null | undefined): string {
  return parseAgentmailProfile(profile) ?? "default";
}

export function parseAgentmailProfile(profile: string | null | undefined): string | undefined {
  if (profile === undefined || profile === null) {
    return undefined;
  }

  const trimmed = profile.trim();
  if (trimmed.length === 0) {
    throw new Error("Profile name must not be empty.");
  }

  if (trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error("Profile name must not include path separators.");
  }

  if (trimmed === "." || trimmed === ".." || trimmed.includes("..")) {
    throw new Error("Profile name must not include '..'.");
  }

  if (!PROFILE_NAME_PATTERN.test(trimmed)) {
    throw new Error("Profile name may contain only letters, numbers, dot, underscore, hyphen, or @.");
  }

  return trimmed;
}

export function resolveAgentmailPaths(profile?: string): AgentmailPaths {
  const parsedProfile = parseAgentmailProfile(profile);
  const profileId = parsedProfile ?? "default";
  const rootDir =
    parsedProfile === undefined ? AGENTMAIL_DIR : path.join(AGENTMAIL_PROFILES_DIR, parsedProfile);
  const hooksDir = path.join(rootDir, "hooks");

  return {
    profile: parsedProfile ?? null,
    profileId,
    rootDir,
    envFile: path.join(rootDir, ".env"),
    pollingConfigFile: path.join(rootDir, "polling.json"),
    messagesDir: path.join(rootDir, "messages"),
    sentMessagesDir: path.join(rootDir, "sent"),
    hooksDir,
    onRecieveHookFile: path.join(hooksDir, "on_recieve.sh"),
    receiveWatchLockFile: path.join(rootDir, "receive-watch.lock"),
    databaseFile: AGENTMAIL_DATABASE_FILE
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    const ioError = error as NodeJS.ErrnoException;
    if (ioError.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export async function listProfilesWithPollingConfig(
  profilesDir = AGENTMAIL_PROFILES_DIR
): Promise<string[]> {
  let profileEntries: Dirent[];

  try {
    profileEntries = await readdir(profilesDir, { withFileTypes: true });
  } catch (error) {
    const ioError = error as NodeJS.ErrnoException;
    if (ioError.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const profileNames = profileEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const pollingFiles = await Promise.all(
    profileNames.map(async (profileName) => ({
      profileName,
      hasPollingConfig: await fileExists(path.join(profilesDir, profileName, "polling.json"))
    }))
  );

  return pollingFiles
    .filter((entry) => entry.hasPollingConfig)
    .map((entry) => entry.profileName);
}

const LEGACY_PATHS = resolveAgentmailPaths();

export const AGENTMAIL_ENV_FILE = LEGACY_PATHS.envFile;
export const POLLING_CONFIG_FILE = LEGACY_PATHS.pollingConfigFile;
export const MESSAGES_DIR = LEGACY_PATHS.messagesDir;
export const SENT_MESSAGES_DIR = LEGACY_PATHS.sentMessagesDir;
export const HOOKS_DIR = LEGACY_PATHS.hooksDir;
export const ON_RECIEVE_HOOK_FILE = LEGACY_PATHS.onRecieveHookFile;
export const RECEIVE_WATCH_LOCK_FILE = LEGACY_PATHS.receiveWatchLockFile;
export const AGENTMAIL_PROFILE_ID = LEGACY_PATHS.profileId;

export async function ensureAgentmailDirectories(paths: AgentmailPaths = LEGACY_PATHS): Promise<void> {
  await mkdir(paths.messagesDir, { recursive: true });
  await mkdir(paths.sentMessagesDir, { recursive: true });
  await mkdir(paths.hooksDir, { recursive: true });
}
