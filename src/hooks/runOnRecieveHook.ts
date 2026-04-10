import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { ON_RECIEVE_HOOK_FILE } from "../config/paths";
import type { SavedMessageMetadata } from "../types";

export interface RunOnRecieveHookInput {
  profileId: string;
  accountEmail: string;
  mailbox: string;
  messageDir: string;
  metadata: SavedMessageMetadata;
}

export interface RunOnRecieveHookResult {
  executed: boolean;
}

export interface RunOnRecieveHookOptions {
  hookFilePath?: string;
}

function stringifyNullable(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }

  return value;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function runHookProcess(scriptPath: string, env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", [scriptPath], {
      env,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      if (signal) {
        reject(new Error(`Hook exited with signal ${signal}.`));
        return;
      }

      reject(new Error(`Hook exited with code ${String(code)}.`));
    });
  });
}

export async function runOnRecieveHook(
  input: RunOnRecieveHookInput,
  options: RunOnRecieveHookOptions = {}
): Promise<RunOnRecieveHookResult> {
  const hookFilePath = options.hookFilePath ?? ON_RECIEVE_HOOK_FILE;

  if (!(await fileExists(hookFilePath))) {
    return { executed: false };
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    AGENTMAIL_HOOK_EVENT: "on_recieve",
    AGENTMAIL_PROFILE: input.profileId,
    AGENTMAIL_ACCOUNT_EMAIL: input.accountEmail,
    AGENTMAIL_MAILBOX: input.mailbox,
    AGENTMAIL_MESSAGE_UID: String(input.metadata.uid),
    AGENTMAIL_MESSAGE_ID: stringifyNullable(input.metadata.messageId),
    AGENTMAIL_MESSAGE_IN_REPLY_TO: stringifyNullable(input.metadata.inReplyTo),
    AGENTMAIL_MESSAGE_REFERENCES: input.metadata.references.join(","),
    AGENTMAIL_MESSAGE_SUBJECT: stringifyNullable(input.metadata.subject),
    AGENTMAIL_MESSAGE_FROM: input.metadata.from.join(","),
    AGENTMAIL_MESSAGE_TO: input.metadata.to.join(","),
    AGENTMAIL_MESSAGE_CC: input.metadata.cc.join(","),
    AGENTMAIL_MESSAGE_BCC: input.metadata.bcc.join(","),
    AGENTMAIL_MESSAGE_REPLY_TO: input.metadata.replyTo.join(","),
    AGENTMAIL_NORMALIZED_FROM_EMAIL: stringifyNullable(input.metadata.normalizedSenderEmail),
    AGENTMAIL_MESSAGE_SAVED_AT: input.metadata.savedAt,
    AGENTMAIL_MESSAGE_DATE: stringifyNullable(input.metadata.date),
    AGENTMAIL_MESSAGE_DIR: input.messageDir,
    AGENTMAIL_MESSAGE_METADATA_FILE: path.join(input.messageDir, "metadata.json")
  };

  await runHookProcess(hookFilePath, env);
  return { executed: true };
}
