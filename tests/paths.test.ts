import path from "node:path";
import { describe, expect, it } from "bun:test";
import {
  AGENTMAIL_DIR,
  AGENTMAIL_PROFILES_DIR,
  parseAgentmailProfile,
  resolveAgentmailPaths
} from "../src/config/paths";

describe("agentmail profile paths", () => {
  it("uses legacy root paths when no profile is specified", () => {
    const resolved = resolveAgentmailPaths();
    expect(resolved.profile).toBeNull();
    expect(resolved.profileId).toBe("default");
    expect(resolved.rootDir).toBe(AGENTMAIL_DIR);
    expect(resolved.envFile).toBe(path.join(AGENTMAIL_DIR, ".env"));
    expect(resolved.messagesDir).toBe(path.join(AGENTMAIL_DIR, "messages"));
    expect(resolved.sentMessagesDir).toBe(path.join(AGENTMAIL_DIR, "sent"));
  });

  it("uses profile-scoped paths when profile is specified", () => {
    const resolved = resolveAgentmailPaths("work");
    const profileRoot = path.join(AGENTMAIL_PROFILES_DIR, "work");

    expect(resolved.profile).toBe("work");
    expect(resolved.profileId).toBe("work");
    expect(resolved.rootDir).toBe(profileRoot);
    expect(resolved.envFile).toBe(path.join(profileRoot, ".env"));
    expect(resolved.pollingConfigFile).toBe(path.join(profileRoot, "polling.json"));
    expect(resolved.onRecieveHookFile).toBe(path.join(profileRoot, "hooks", "on_recieve.sh"));
  });

  it("trims profile names", () => {
    expect(parseAgentmailProfile("  personal ")).toBe("personal");
  });

  it("accepts email-like profile names", () => {
    expect(parseAgentmailProfile("jarvis@audace.dev")).toBe("jarvis@audace.dev");
  });

  it("rejects invalid profile names", () => {
    const invalidProfiles = ["", " ", "team/work", "team\\work", "profile..name", ".", "..", "work!"];

    for (const invalidProfile of invalidProfiles) {
      expect(() => parseAgentmailProfile(invalidProfile)).toThrow();
    }
  });
});
