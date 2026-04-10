import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import { createAccount } from "../src/account/createAccount";
import type { AgentmailPaths } from "../src/config/paths";

describe("createAccount", () => {
  it("writes env and default polling config for a new profile", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agentmail-account-"));
    const profileRoot = path.join(tempRoot, "profiles", "agent@example.com");
    const paths: AgentmailPaths = {
      profile: "agent@example.com",
      profileId: "agent@example.com",
      rootDir: profileRoot,
      envFile: path.join(profileRoot, ".env"),
      pollingConfigFile: path.join(profileRoot, "polling.json"),
      messagesDir: path.join(profileRoot, "messages"),
      sentMessagesDir: path.join(profileRoot, "sent"),
      hooksDir: path.join(profileRoot, "hooks"),
      onRecieveHookFile: path.join(profileRoot, "hooks", "on_recieve.sh"),
      receiveWatchLockFile: path.join(profileRoot, "receive-watch.lock"),
      databaseFile: path.join(tempRoot, "agentmail.db")
    };

    try {
      const result = await createAccount({
        name: "agent@example.com",
        paths,
        smtp: {
          host: "smtp.example.com",
          port: 465,
          secure: true,
          user: "smtp-user",
          pass: "smtp-pass"
        },
        imap: {
          host: "imap.example.com",
          port: 993,
          secure: true,
          user: "imap-user",
          pass: "imap-pass"
        }
      });

      const envContents = await readFile(result.paths.envFile, "utf8");
      const pollingContents = await readFile(result.paths.pollingConfigFile, "utf8");

      expect(result.profile).toBe("agent@example.com");
      expect(result.accountEmail).toBe("agent@example.com");
      expect(envContents).toContain('AGENTMAIL_EMAIL="agent@example.com"');
      expect(envContents).toContain('SMTP_HOST="smtp.example.com"');
      expect(pollingContents).toContain('"mailbox": "INBOX"');
      expect(pollingContents).toContain('"intervalSeconds": 60');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
