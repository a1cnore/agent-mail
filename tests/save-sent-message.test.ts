import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import { saveSentMessage } from "../src/send/saveSentMessage";

describe("saveSentMessage", () => {
  it("stores sent metadata and resolves duplicate attachment names", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agentmail-save-sent-"));
    const sentDir = path.join(tempRoot, "sent");
    const firstSourceDir = path.join(tempRoot, "source-a");
    const secondSourceDir = path.join(tempRoot, "source-b");

    try {
      await mkdir(firstSourceDir, { recursive: true });
      await mkdir(secondSourceDir, { recursive: true });

      const firstAttachment = path.join(firstSourceDir, "file.txt");
      const secondAttachment = path.join(secondSourceDir, "file.txt");

      await writeFile(firstAttachment, "one", "utf8");
      await writeFile(secondAttachment, "two", "utf8");

      const result = await saveSentMessage(
        {
          messageId: "sent-1",
          from: "agent@marvinkleinpass.dev",
          to: ["alice@example.com"],
          cc: [],
          bcc: [],
          subject: "Reply",
          text: "Hello",
          attachmentPaths: [firstAttachment, secondAttachment]
        },
        sentDir
      );

      expect(result.metadata.messageId).toBe("sent-1");
      expect(result.metadata.to).toEqual(["alice@example.com"]);
      expect(result.metadata.attachments.length).toBe(2);
      expect(result.metadata.attachments[0].filename).toBe("file.txt");
      expect(result.metadata.attachments[1].filename).toBe("file(1).txt");

      const savedAttachmentNames = await readdir(path.join(result.messageDir, "attachments"));
      expect(savedAttachmentNames.includes("file.txt")).toBeTrue();
      expect(savedAttachmentNames.includes("file(1).txt")).toBeTrue();
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
