import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import type { AgentmailPaths } from "../config/paths";
import { ensureAgentmailDirectories, parseAgentmailProfile, resolveAgentmailPaths } from "../config/paths";
import { DEFAULT_POLLING_CONFIG, writePollingConfig } from "../config/polling";

const emailSchema = z.string().trim().email();

export interface CreateAccountInput {
  name: string;
  email?: string;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  };
  imap: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  };
  mailbox?: string;
  intervalSeconds?: number;
  force?: boolean;
  paths?: AgentmailPaths;
}

export interface CreatedAccountResult {
  profile: string;
  accountEmail: string;
  paths: AgentmailPaths;
}

function escapeEnvValue(value: string | number | boolean): string {
  return JSON.stringify(String(value));
}

function resolveAccountEmail(name: string, email: string | undefined): string {
  if (email) {
    return emailSchema.parse(email);
  }

  return emailSchema.parse(name);
}

function buildEnvFileContents(input: CreateAccountInput, accountEmail: string): string {
  return [
    `AGENTMAIL_EMAIL=${escapeEnvValue(accountEmail)}`,
    "",
    `SMTP_HOST=${escapeEnvValue(input.smtp.host)}`,
    `SMTP_PORT=${escapeEnvValue(input.smtp.port)}`,
    `SMTP_SECURE=${escapeEnvValue(input.smtp.secure)}`,
    `SMTP_USER=${escapeEnvValue(input.smtp.user)}`,
    `SMTP_PASS=${escapeEnvValue(input.smtp.pass)}`,
    "",
    `IMAP_HOST=${escapeEnvValue(input.imap.host)}`,
    `IMAP_PORT=${escapeEnvValue(input.imap.port)}`,
    `IMAP_SECURE=${escapeEnvValue(input.imap.secure)}`,
    `IMAP_USER=${escapeEnvValue(input.imap.user)}`,
    `IMAP_PASS=${escapeEnvValue(input.imap.pass)}`,
    ""
  ].join("\n");
}

export async function createAccount(input: CreateAccountInput): Promise<CreatedAccountResult> {
  const profile = parseAgentmailProfile(input.name);
  if (!profile) {
    throw new Error("Account name must not be empty.");
  }

  const accountEmail = resolveAccountEmail(profile, input.email);
  const paths = input.paths ?? resolveAgentmailPaths(profile);

  await mkdir(paths.rootDir, { recursive: true });
  await ensureAgentmailDirectories(paths);

  if (!input.force) {
    try {
      await readFile(paths.envFile, "utf8");
      throw new Error(`Environment file already exists at ${paths.envFile}. Use --force to overwrite it.`);
    } catch (error) {
      const ioError = error as NodeJS.ErrnoException;
      if (ioError.code !== "ENOENT") {
        throw error;
      }
    }
  }

  await writeFile(paths.envFile, buildEnvFileContents(input, accountEmail), "utf8");
  await chmod(paths.envFile, 0o600);
  await writePollingConfig(
    {
      mailbox: input.mailbox ?? DEFAULT_POLLING_CONFIG.mailbox,
      intervalSeconds: input.intervalSeconds ?? DEFAULT_POLLING_CONFIG.intervalSeconds
    },
    paths.pollingConfigFile
  );

  return {
    profile,
    accountEmail,
    paths
  };
}
