import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import { sanitizeFilename, saveMessage } from "../src/receive/saveMessage";

describe("saveMessage", () => {
  it("sanitizes unsafe attachment names", () => {
    expect(sanitizeFilename("  ../../inv@lid?.pdf  ")).toBe("inv_lid_.pdf");
  });

  it("stores duplicate attachment filenames without collisions", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agentmail-save-"));

    try {
      const raw = Buffer.from("From: sender@example.com\nTo: user@example.com\n\nHello", "utf8");
      const result = await saveMessage(
        {
          uid: 42,
          raw,
          flags: ["\\Recent"],
          parsed: {
            messageId: "mid-42",
            from: {
              value: [{ name: "Sender", address: "sender@example.com" }],
              html: "",
              text: ""
            },
            to: {
              value: [{ name: "User", address: "user@example.com" }],
              html: "",
              text: ""
            },
            subject: "Files",
            text: "See attachments",
            attachments: [
              {
                filename: "report.pdf",
                contentType: "application/pdf",
                content: Buffer.from("one", "utf8")
              },
              {
                filename: "report.pdf",
                contentType: "application/pdf",
                content: Buffer.from("two", "utf8")
              }
            ]
          }
        },
        tempRoot
      );

      expect(result.metadata.attachments.length).toBe(2);
      expect(result.metadata.attachments[0].filename).toBe("report.pdf");
      expect(result.metadata.attachments[1].filename).toBe("report(1).pdf");

      const attachmentFiles = await readdir(path.join(result.messageDir, "attachments"));
      expect(attachmentFiles.includes("report.pdf")).toBeTrue();
      expect(attachmentFiles.includes("report(1).pdf")).toBeTrue();
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
