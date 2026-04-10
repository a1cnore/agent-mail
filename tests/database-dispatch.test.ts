import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import { deriveMailSessionId, deriveOpenClawMailSessionKey } from "../src/mail/session";
import {
  getDispatchStatusSummary,
  queryConversationBySender,
  recordInboundMessage,
  recordOutboundMessage
} from "../src/storage/database";
import { runMailDispatcherCycle } from "../src/dispatch/worker";

describe("mail session indexing", () => {
  it("derives profile-scoped session ids", () => {
    const sender = "Alice@Example.com";

    expect(deriveMailSessionId("sales", sender)).toBe(deriveMailSessionId("sales", sender));
    expect(deriveMailSessionId("sales", sender)).not.toBe(deriveMailSessionId("support", sender));
  });

  it("links outbound replies back onto the inbound session", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agentmail-db-"));
    const databaseFile = path.join(tempRoot, "agentmail.db");

    try {
      const inboundResult = recordInboundMessage(
        {
          profileId: "agent@example.test",
          accountEmail: "agent@example.test",
          uid: 100,
          peerEmail: "prospect@example.com",
          messageId: "<inbound@example.com>",
          inReplyTo: null,
          references: [],
          savedAt: "2026-03-06T10:00:00.000Z",
          messageDir: path.join(tempRoot, "messages", "msg-1"),
          metadata: {
            profileId: "agent@example.test",
            accountEmail: "agent@example.test",
            mailbox: "INBOX",
            uid: 100,
            messageId: "<inbound@example.com>",
            inReplyTo: null,
            references: [],
            normalizedSenderEmail: "prospect@example.com",
            from: ["Prospect <prospect@example.com>"],
            fromEmails: ["prospect@example.com"],
            to: ["agent@example.test"],
            toEmails: ["agent@example.test"],
            cc: [],
            ccEmails: [],
            bcc: [],
            bccEmails: [],
            replyTo: [],
            replyToEmails: [],
            subject: "Hello",
            date: "2026-03-06T10:00:00.000Z",
            flags: [],
            savedAt: "2026-03-06T10:00:00.000Z",
            attachments: []
          }
        },
        databaseFile
      );

      const outboundResult = recordOutboundMessage(
        {
          profileId: "agent@example.test",
          accountEmail: "agent@example.test",
          peerEmails: ["prospect@example.com"],
          messageId: "<outbound@example.com>",
          inReplyTo: "<inbound@example.com>",
          references: ["<inbound@example.com>"],
          savedAt: "2026-03-06T10:05:00.000Z",
          messageDir: path.join(tempRoot, "sent", "sent-1"),
          metadata: {
            profileId: "agent@example.test",
            accountEmail: "agent@example.test",
            messageId: "<outbound@example.com>",
            from: ["agent@example.test"],
            fromEmails: ["agent@example.test"],
            to: ["prospect@example.com"],
            toEmails: ["prospect@example.com"],
            cc: [],
            ccEmails: [],
            bcc: [],
            bccEmails: [],
            replyTo: [],
            replyToEmails: [],
            subject: "Re: Hello",
            inReplyTo: "<inbound@example.com>",
            references: ["<inbound@example.com>"],
            date: "2026-03-06T10:05:00.000Z",
            savedAt: "2026-03-06T10:05:00.000Z",
            attachments: []
          }
        },
        databaseFile
      );

      expect(outboundResult.sessionId).toBe(inboundResult.sessionId);

      const conversation = queryConversationBySender(
        "agent@example.test",
        "prospect@example.com",
        undefined,
        databaseFile
      );

      expect(conversation.length).toBe(2);
      expect(conversation[0].direction).toBe("received");
      expect(conversation[1].direction).toBe("sent");
      expect(conversation[1].sessionId).toBe(inboundResult.sessionId);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

describe("openclaw mail session keys", () => {
  it("uses normalized sender email in the session key", () => {
    expect(deriveOpenClawMailSessionKey("sales", "Prospect@Example.com")).toBe(
      "agent:sales:mail:prospect@example.com"
    );
  });

  it("falls back to the default agent id when blank", () => {
    expect(deriveOpenClawMailSessionKey("   ", "Prospect@Example.com")).toBe(
      "agent:main:mail:prospect@example.com"
    );
  });

  it("keeps explicit unknown sender fallbacks readable", () => {
    expect(deriveOpenClawMailSessionKey("sales", "unknown:<Dispatch-Inbound@Example.com>")).toBe(
      "agent:sales:mail:unknown:<dispatch-inbound@example.com>"
    );
  });
});

describe("mail dispatcher", () => {
  it("marks a job succeeded after OpenClaw accepts the inbound handoff", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agentmail-dispatch-"));
    const databaseFile = path.join(tempRoot, "agentmail.db");
    const messageDir = path.join(tempRoot, "messages", "msg-1");
    const configFilePath = path.join(tempRoot, "config.json");

    try {
      await mkdir(messageDir, { recursive: true });
      await writeFile(path.join(messageDir, "body.txt"), "Please send the brochure.", "utf8");
      await writeFile(
        configFilePath,
        `${JSON.stringify({
          accounts: {
            "agent@example.test": {
              agentId: "sales",
              enabled: true
            }
          },
          worker: {
            pollIntervalMs: 1000,
            maxConcurrentSessions: 4
          }
        }, null, 2)}\n`,
        "utf8"
      );

      const inboundResult = recordInboundMessage(
        {
          profileId: "agent@example.test",
          accountEmail: "agent@example.test",
          uid: 55,
          peerEmail: "prospect@example.com",
          messageId: "<dispatch-inbound@example.com>",
          inReplyTo: null,
          references: [],
          savedAt: "2026-03-06T12:00:00.000Z",
          messageDir,
          metadata: {
            profileId: "agent@example.test",
            accountEmail: "agent@example.test",
            mailbox: "INBOX",
            uid: 55,
            messageId: "<dispatch-inbound@example.com>",
            inReplyTo: null,
            references: [],
            normalizedSenderEmail: "prospect@example.com",
            from: ["Prospect <prospect@example.com>"],
            fromEmails: ["prospect@example.com"],
            to: ["agent@example.test"],
            toEmails: ["agent@example.test"],
            cc: [],
            ccEmails: [],
            bcc: [],
            bccEmails: [],
            replyTo: ["Reply Desk <reply@example.com>"],
            replyToEmails: ["reply@example.com"],
            subject: "Brochure",
            date: "2026-03-06T12:00:00.000Z",
            flags: [],
            savedAt: "2026-03-06T12:00:00.000Z",
            attachments: []
          }
        },
        databaseFile
      );

      let capturedMessage = "";

      const cycleResult = await runMailDispatcherCycle({
        configFilePath,
        databaseFile,
        bridgeLogFile: path.join(tempRoot, "bridge.log"),
        runAgentTurn: async ({ message, sessionKey }) => {
          capturedMessage = message;
          expect(sessionKey).toBe("agent:sales:mail:prospect@example.com");
        }
      });

      expect(cycleResult.started).toBe(1);
      expect(capturedMessage).toContain(`Mail session id: ${inboundResult.sessionId}`);
      expect(capturedMessage).toContain("Reply target: reply@example.com");
      expect(capturedMessage).toContain(`--profile "agent@example.test"`);

      const summary = getDispatchStatusSummary(databaseFile);
      expect(summary.succeeded).toBe(1);
      expect(summary.failed).toBe(0);
      expect(summary.deadletter).toBe(0);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
