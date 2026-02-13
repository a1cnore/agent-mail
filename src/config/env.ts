import { readFile } from "node:fs/promises";
import dotenv from "dotenv";
import { z } from "zod";
import type { MailEnvConfig } from "../types";
import { AGENTMAIL_ENV_FILE } from "./paths";

const numberFromString = z.preprocess((value) => {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return value;
}, z.number().int().min(1).max(65535));

const booleanFromString = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }

    if (normalized === "false") {
      return false;
    }
  }

  return value;
}, z.boolean());

const rawEnvSchema = z.object({
  AGENTMAIL_EMAIL: z.string().trim().email(),
  SMTP_HOST: z.string().trim().min(1),
  SMTP_PORT: numberFromString,
  SMTP_SECURE: booleanFromString,
  SMTP_USER: z.string().trim().min(1),
  SMTP_PASS: z.string().min(1),
  IMAP_HOST: z.string().trim().min(1),
  IMAP_PORT: numberFromString,
  IMAP_SECURE: booleanFromString,
  IMAP_USER: z.string().trim().min(1),
  IMAP_PASS: z.string().min(1)
});

const parsedEnvSchema = rawEnvSchema.transform((raw): MailEnvConfig => ({
  email: raw.AGENTMAIL_EMAIL,
  smtp: {
    host: raw.SMTP_HOST,
    port: raw.SMTP_PORT,
    secure: raw.SMTP_SECURE,
    user: raw.SMTP_USER,
    pass: raw.SMTP_PASS
  },
  imap: {
    host: raw.IMAP_HOST,
    port: raw.IMAP_PORT,
    secure: raw.IMAP_SECURE,
    user: raw.IMAP_USER,
    pass: raw.IMAP_PASS
  }
}));

export const REQUIRED_ENV_KEYS = [
  "AGENTMAIL_EMAIL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "IMAP_HOST",
  "IMAP_PORT",
  "IMAP_SECURE",
  "IMAP_USER",
  "IMAP_PASS"
] as const;

export type RequiredEnvKey = (typeof REQUIRED_ENV_KEYS)[number];

export function safeParseMailEnv(raw: Record<string, string | undefined>) {
  return parsedEnvSchema.safeParse(raw);
}

export function parseMailEnv(raw: Record<string, string | undefined>): MailEnvConfig {
  return parsedEnvSchema.parse(raw);
}

async function readEnvFileRaw(envFilePath: string): Promise<Record<string, string | undefined>> {
  const fileContents = await readFile(envFilePath, "utf8");
  return dotenv.parse(fileContents);
}

function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "config";
    return `${path}: ${issue.message}`;
  });
}

export async function loadMailEnvConfig(envFilePath = AGENTMAIL_ENV_FILE): Promise<MailEnvConfig> {
  let rawConfig: Record<string, string | undefined>;

  try {
    rawConfig = await readEnvFileRaw(envFilePath);
  } catch (error) {
    const ioError = error as NodeJS.ErrnoException;
    if (ioError.code === "ENOENT") {
      throw new Error(
        `Environment file not found at ${envFilePath}. Create it using .env.example values.`
      );
    }

    throw error;
  }

  const parsed = safeParseMailEnv(rawConfig);
  if (!parsed.success) {
    const issueSummary = formatZodIssues(parsed.error).join("; ");
    throw new Error(`Invalid environment configuration: ${issueSummary}`);
  }

  return parsed.data;
}

export interface EnvValidationResult {
  isValid: boolean;
  envFilePath: string;
  exists: boolean;
  missingKeys: RequiredEnvKey[];
  issues: string[];
}

export async function validateEnvFile(envFilePath = AGENTMAIL_ENV_FILE): Promise<EnvValidationResult> {
  let rawConfig: Record<string, string | undefined> = {};
  let exists = true;

  try {
    rawConfig = await readEnvFileRaw(envFilePath);
  } catch (error) {
    const ioError = error as NodeJS.ErrnoException;
    if (ioError.code === "ENOENT") {
      exists = false;
    } else {
      throw error;
    }
  }

  const missingKeys = REQUIRED_ENV_KEYS.filter((key) => {
    const value = rawConfig[key];
    return value === undefined || value.trim() === "";
  });

  const parsed = safeParseMailEnv(rawConfig);
  const issues = parsed.success ? [] : formatZodIssues(parsed.error);

  return {
    isValid: exists && parsed.success,
    envFilePath,
    exists,
    missingKeys,
    issues
  };
}
