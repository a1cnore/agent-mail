import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import { bindDispatchAccount } from "../src/dispatch/config";

describe("dispatch config binding", () => {
  it("creates dispatcher config and stores profile bindings", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agentmail-dispatch-config-"));
    const configFilePath = path.join(tempRoot, "mail-dispatch.json");

    try {
      const config = await bindDispatchAccount({
        profile: "agent@example.com",
        agentId: "sales",
        configFilePath
      });

      const rawConfig = await readFile(configFilePath, "utf8");

      expect(config.accounts["agent@example.com"]?.agentId).toBe("sales");
      expect(rawConfig).toContain('"agent@example.com"');
      expect(rawConfig).toContain('"agentId": "sales"');
      expect(rawConfig).toContain('"pollIntervalMs": 1000');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
