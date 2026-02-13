import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import { queryConversation } from "../src/conversation/queryConversation";

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

describe("queryConversation", () => {
  it("filters received messages by sender", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agentmail-conversation-"));
    const messagesDir = path.join(tempRoot, "messages");
    const sentDir = path.join(tempRoot, "sent");

    try {
      await mkdir(path.join(messagesDir, "msg-1"), { recursive: true });
      await mkdir(path.join(messagesDir, "msg-2"), { recursive: true });
      await mkdir(path.join(sentDir, "sent-1"), { recursive: true });

      await writeJsonFile(path.join(messagesDir, "msg-1", "metadata.json"), {
        uid: 1,
        messageId: "r-1",
        from: ["Alice <alice@example.com>"],
        to: ["agent@marvinkleinpass.dev"],
        subject: "Hello",
        date: "2026-02-12T10:00:00.000Z",
        flags: [],
        savedAt: "2026-02-12T10:00:01.000Z",
        attachments: []
      });

      await writeJsonFile(path.join(messagesDir, "msg-2", "metadata.json"), {
        uid: 2,
        messageId: "r-2",
        from: ["Bob <bob@example.com>"],
        to: ["agent@marvinkleinpass.dev"],
        subject: "Ignore",
        date: "2026-02-12T11:00:00.000Z",
        flags: [],
        savedAt: "2026-02-12T11:00:01.000Z",
        attachments: []
      });

      await writeJsonFile(path.join(sentDir, "sent-1", "metadata.json"), {
        messageId: "s-1",
        from: ["agent@marvinkleinpass.dev"],
        to: ["alice@example.com"],
        cc: [],
        bcc: [],
        subject: "Reply",
        date: "2026-02-12T12:00:00.000Z",
        savedAt: "2026-02-12T12:00:01.000Z",
        attachments: []
      });

      const withoutSent = await queryConversation({
        sender: "alice@example.com",
        includeSent: false,
        messagesDir,
        sentMessagesDir: sentDir
      });

      expect(withoutSent.length).toBe(1);
      expect(withoutSent[0].direction).toBe("received");
      expect(withoutSent[0].messageId).toBe("r-1");

      const withSent = await queryConversation({
        sender: "alice@example.com",
        includeSent: true,
        messagesDir,
        sentMessagesDir: sentDir
      });

      expect(withSent.length).toBe(2);
      expect(withSent[0].messageId).toBe("r-1");
      expect(withSent[1].messageId).toBe("s-1");
      expect(withSent[1].direction).toBe("sent");
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("applies limit after merge and sort", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agentmail-conversation-limit-"));
    const messagesDir = path.join(tempRoot, "messages");

    try {
      await mkdir(path.join(messagesDir, "msg-1"), { recursive: true });
      await mkdir(path.join(messagesDir, "msg-2"), { recursive: true });

      await writeJsonFile(path.join(messagesDir, "msg-1", "metadata.json"), {
        uid: 1,
        messageId: "old",
        from: ["alice@example.com"],
        to: ["agent@marvinkleinpass.dev"],
        subject: "Old",
        date: "2026-02-10T10:00:00.000Z",
        flags: [],
        savedAt: "2026-02-10T10:00:01.000Z",
        attachments: []
      });

      await writeJsonFile(path.join(messagesDir, "msg-2", "metadata.json"), {
        uid: 2,
        messageId: "new",
        from: ["alice@example.com"],
        to: ["agent@marvinkleinpass.dev"],
        subject: "New",
        date: "2026-02-11T10:00:00.000Z",
        flags: [],
        savedAt: "2026-02-11T10:00:01.000Z",
        attachments: []
      });

      const entries = await queryConversation({
        sender: "alice@example.com",
        messagesDir,
        limit: 1
      });

      expect(entries.length).toBe(1);
      expect(entries[0].messageId).toBe("old");
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
