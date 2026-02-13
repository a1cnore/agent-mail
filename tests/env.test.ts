import { describe, expect, it } from "bun:test";
import { REQUIRED_ENV_KEYS, safeParseMailEnv } from "../src/config/env";

const validEnv: Record<string, string> = {
  AGENTMAIL_EMAIL: "user@example.com",
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "465",
  SMTP_SECURE: "true",
  SMTP_USER: "user@example.com",
  SMTP_PASS: "smtp-pass",
  IMAP_HOST: "imap.example.com",
  IMAP_PORT: "993",
  IMAP_SECURE: "true",
  IMAP_USER: "user@example.com",
  IMAP_PASS: "imap-pass"
};

describe("env config parsing", () => {
  it("parses valid environment values", () => {
    const parsed = safeParseMailEnv(validEnv);
    expect(parsed.success).toBeTrue();

    if (parsed.success) {
      expect(parsed.data.email).toBe("user@example.com");
      expect(parsed.data.smtp.port).toBe(465);
      expect(parsed.data.smtp.secure).toBeTrue();
      expect(parsed.data.imap.port).toBe(993);
    }
  });

  it("fails when required keys are missing", () => {
    const parsed = safeParseMailEnv({});
    expect(parsed.success).toBeFalse();

    if (!parsed.success) {
      const issuePaths = parsed.error.issues.map((issue) => String(issue.path[0]));
      for (const key of REQUIRED_ENV_KEYS) {
        expect(issuePaths).toContain(key);
      }
    }
  });

  it("fails for non-boolean secure values", () => {
    const parsed = safeParseMailEnv({
      ...validEnv,
      SMTP_SECURE: "yes"
    });

    expect(parsed.success).toBeFalse();
  });
});
