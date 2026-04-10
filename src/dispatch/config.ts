import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MailDispatcherConfig } from "./worker";
import {
  DEFAULT_MAIL_DISPATCH_CONFIG_FILE,
  readMailDispatcherConfig
} from "./worker";

export interface BindDispatchAccountInput {
  profile: string;
  agentId: string;
  enabled?: boolean;
  configFilePath?: string;
}

const DEFAULT_DISPATCHER_CONFIG: MailDispatcherConfig = {
  accounts: {},
  worker: {
    pollIntervalMs: 1000,
    maxConcurrentSessions: 4
  }
};

export async function ensureMailDispatcherConfig(
  configFilePath = DEFAULT_MAIL_DISPATCH_CONFIG_FILE
): Promise<MailDispatcherConfig> {
  try {
    return await readMailDispatcherConfig(configFilePath);
  } catch (error) {
    const ioError = error as NodeJS.ErrnoException;
    if (ioError.code !== "ENOENT") {
      throw error;
    }

    await mkdir(path.dirname(configFilePath), { recursive: true });
    await writeFile(
      configFilePath,
      `${JSON.stringify(DEFAULT_DISPATCHER_CONFIG, null, 2)}\n`,
      "utf8"
    );
    return DEFAULT_DISPATCHER_CONFIG;
  }
}

export async function bindDispatchAccount(
  input: BindDispatchAccountInput
): Promise<MailDispatcherConfig> {
  const configFilePath = input.configFilePath ?? DEFAULT_MAIL_DISPATCH_CONFIG_FILE;
  const config = await ensureMailDispatcherConfig(configFilePath);
  const nextConfig: MailDispatcherConfig = {
    ...config,
    accounts: {
      ...config.accounts,
      [input.profile]: {
        agentId: input.agentId,
        enabled: input.enabled ?? true
      }
    }
  };

  await writeFile(configFilePath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
  return nextConfig;
}

export async function readRawDispatchConfig(
  configFilePath = DEFAULT_MAIL_DISPATCH_CONFIG_FILE
): Promise<unknown> {
  const content = await readFile(configFilePath, "utf8");
  return JSON.parse(content) as unknown;
}
