import os from "node:os";
import path from "node:path";
import { mkdir } from "node:fs/promises";

export const AGENTMAIL_DIR = path.join(os.homedir(), ".agentmail");
export const AGENTMAIL_ENV_FILE = path.join(AGENTMAIL_DIR, ".env");
export const POLLING_CONFIG_FILE = path.join(AGENTMAIL_DIR, "polling.json");
export const MESSAGES_DIR = path.join(AGENTMAIL_DIR, "messages");
export const SENT_MESSAGES_DIR = path.join(AGENTMAIL_DIR, "sent");
export const RECEIVE_WATCH_LOCK_FILE = path.join(AGENTMAIL_DIR, "receive-watch.lock");

export async function ensureAgentmailDirectories(): Promise<void> {
  await mkdir(MESSAGES_DIR, { recursive: true });
  await mkdir(SENT_MESSAGES_DIR, { recursive: true });
}
