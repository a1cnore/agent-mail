import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import {
  DEFAULT_POLLING_CONFIG,
  applyPollingDefaults,
  readPollingConfig,
  writePollingConfig
} from "../src/config/polling";

describe("polling config", () => {
  it("applies default values", () => {
    const applied = applyPollingDefaults({});
    expect(applied.mailbox).toBe(DEFAULT_POLLING_CONFIG.mailbox);
    expect(applied.intervalSeconds).toBe(DEFAULT_POLLING_CONFIG.intervalSeconds);
  });

  it("writes and reads polling config", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agentmail-polling-"));
    const pollingFilePath = path.join(tempRoot, "polling.json");

    try {
      const written = await writePollingConfig(
        {
          mailbox: "Support",
          intervalSeconds: 120
        },
        pollingFilePath
      );

      expect(written.mailbox).toBe("Support");
      expect(written.intervalSeconds).toBe(120);

      const persisted = await readPollingConfig(pollingFilePath);
      expect(persisted.mailbox).toBe("Support");
      expect(persisted.intervalSeconds).toBe(120);

      const fileContents = await readFile(pollingFilePath, "utf8");
      expect(fileContents.includes("Support")).toBeTrue();
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
