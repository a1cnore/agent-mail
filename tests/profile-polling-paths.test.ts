import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import { listProfilesWithPollingConfig } from "../src/config/paths";

describe("listProfilesWithPollingConfig", () => {
  it("returns empty list when profiles directory does not exist", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agentmail-profiles-missing-"));
    const profilesDir = path.join(tempRoot, "profiles");

    try {
      const profiles = await listProfilesWithPollingConfig(profilesDir);
      expect(profiles).toEqual([]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("returns only profiles that include polling.json", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agentmail-profiles-"));
    const profilesDir = path.join(tempRoot, "profiles");

    try {
      await mkdir(path.join(profilesDir, "work"), { recursive: true });
      await mkdir(path.join(profilesDir, "personal"), { recursive: true });
      await mkdir(path.join(profilesDir, "empty"), { recursive: true });

      await writeFile(
        path.join(profilesDir, "work", "polling.json"),
        '{"mailbox":"INBOX","intervalSeconds":60}\n',
        "utf8"
      );
      await writeFile(
        path.join(profilesDir, "personal", "polling.json"),
        '{"mailbox":"INBOX","intervalSeconds":60}\n',
        "utf8"
      );

      const profiles = await listProfilesWithPollingConfig(profilesDir);
      expect(profiles).toEqual(["personal", "work"]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
