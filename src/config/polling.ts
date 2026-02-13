import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { PollingConfig } from "../types";
import { POLLING_CONFIG_FILE } from "./paths";

const pollingSchema = z.object({
  mailbox: z.string().trim().min(1),
  intervalSeconds: z.number().int().min(1)
});

export const DEFAULT_POLLING_CONFIG: PollingConfig = {
  mailbox: "INBOX",
  intervalSeconds: 60
};

export function parsePollingConfig(raw: unknown): PollingConfig {
  return pollingSchema.parse(raw);
}

export function applyPollingDefaults(partial: Partial<PollingConfig>): PollingConfig {
  return parsePollingConfig({
    ...DEFAULT_POLLING_CONFIG,
    ...partial
  });
}

export async function writePollingConfig(
  partial: Partial<PollingConfig>,
  pollingFilePath = POLLING_CONFIG_FILE
): Promise<PollingConfig> {
  const config = applyPollingDefaults(partial);
  await mkdir(path.dirname(pollingFilePath), { recursive: true });
  await writeFile(pollingFilePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return config;
}

export async function readPollingConfig(
  pollingFilePath = POLLING_CONFIG_FILE
): Promise<PollingConfig> {
  let fileContents: string;

  try {
    fileContents = await readFile(pollingFilePath, "utf8");
  } catch (error) {
    const ioError = error as NodeJS.ErrnoException;
    if (ioError.code === "ENOENT") {
      throw new Error(
        `Polling config not found at ${pollingFilePath}. Run \`agentmail receive setup\` first.`
      );
    }

    throw error;
  }

  const parsedJson = JSON.parse(fileContents) as unknown;
  return parsePollingConfig(parsedJson);
}

export async function tryReadPollingConfig(
  pollingFilePath = POLLING_CONFIG_FILE
): Promise<PollingConfig | null> {
  try {
    return await readPollingConfig(pollingFilePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Polling config not found")) {
      return null;
    }

    throw error;
  }
}

export function pollingConfigDir(pollingFilePath = POLLING_CONFIG_FILE): string {
  return path.dirname(pollingFilePath);
}
