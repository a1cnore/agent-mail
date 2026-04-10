import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import { DEFAULT_POLLING_CONFIG, writePollingConfig } from "../src/config/polling";
import { resolveMailboxForReceive } from "../src/receive/receiveOnce";

describe("resolveMailboxForReceive", () => {
  it("returns explicit mailbox when provided", async () => {
    const resolved = await resolveMailboxForReceive(
      "INBOX",
      path.join(os.tmpdir(), "agentmail-does-not-matter.json")
    );
    expect(resolved).toBe("INBOX");
  });

  it("reads mailbox from provided polling config path", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agentmail-mailbox-"));
    const pollingFilePath = path.join(tempRoot, "polling.json");

    try {
      await writePollingConfig(
        {
          mailbox: "Support",
          intervalSeconds: 90
        },
        pollingFilePath
      );

      const resolved = await resolveMailboxForReceive(undefined, pollingFilePath);
      expect(resolved).toBe("Support");
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("falls back to default mailbox when polling config path is missing", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agentmail-mailbox-missing-"));
    const pollingFilePath = path.join(tempRoot, "missing", "polling.json");

    try {
      const resolved = await resolveMailboxForReceive(undefined, pollingFilePath);
      expect(resolved).toBe(DEFAULT_POLLING_CONFIG.mailbox);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
