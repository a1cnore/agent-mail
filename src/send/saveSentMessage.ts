import { access, copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { SENT_MESSAGES_DIR } from "../config/paths";
import type { SavedAttachmentMetadata, SavedSentMessageMetadata } from "../types";

export interface SaveSentMessageInput {
  messageId: string | null;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text?: string;
  html?: string;
  attachmentPaths: string[];
}

export interface SaveSentMessageResult {
  messageDir: string;
  metadata: SavedSentMessageMetadata;
}

function formatTimestamp(timestamp: Date): string {
  return timestamp.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function sanitizeSegment(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return sanitized.length > 0 ? sanitized : "message";
}

function sanitizeFilename(filename: string): string {
  const basename = path.basename(filename.trim());
  const sanitized = basename.replace(/[^a-zA-Z0-9.()_\- ]+/g, "_").trim();
  return sanitized.length > 0 ? sanitized : "attachment";
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureUniqueFilePath(targetPath: string): Promise<string> {
  if (!(await pathExists(targetPath))) {
    return targetPath;
  }

  const extension = path.extname(targetPath);
  const basename = path.basename(targetPath, extension);
  const dirname = path.dirname(targetPath);

  for (let index = 1; index <= 10000; index += 1) {
    const candidate = path.join(dirname, `${basename}(${index})${extension}`);
    if (!(await pathExists(candidate))) {
      return candidate;
    }
  }

  throw new Error(`Unable to create unique path for ${targetPath}`);
}

async function ensureUniqueMessageDir(basePath: string): Promise<string> {
  if (!(await pathExists(basePath))) {
    await mkdir(basePath, { recursive: false });
    return basePath;
  }

  for (let index = 1; index <= 10000; index += 1) {
    const candidate = `${basePath}_${index}`;
    if (!(await pathExists(candidate))) {
      await mkdir(candidate, { recursive: false });
      return candidate;
    }
  }

  throw new Error(`Unable to create unique message directory for ${basePath}`);
}

export async function saveSentMessage(
  input: SaveSentMessageInput,
  sentMessagesDir = SENT_MESSAGES_DIR
): Promise<SaveSentMessageResult> {
  await mkdir(sentMessagesDir, { recursive: true });

  const now = new Date();
  const messageIdSegment = sanitizeSegment(input.messageId ?? "message");
  const directoryName = `${formatTimestamp(now)}_msg-${messageIdSegment}`;
  const baseMessageDir = path.join(sentMessagesDir, directoryName);
  const messageDir = await ensureUniqueMessageDir(baseMessageDir);
  const attachmentDir = path.join(messageDir, "attachments");

  await mkdir(attachmentDir, { recursive: true });

  if (typeof input.text === "string" && input.text.length > 0) {
    await writeFile(path.join(messageDir, "body.txt"), input.text, "utf8");
  }

  if (typeof input.html === "string" && input.html.length > 0) {
    await writeFile(path.join(messageDir, "body.html"), input.html, "utf8");
  }

  const savedAttachments: SavedAttachmentMetadata[] = [];

  for (const rawAttachmentPath of input.attachmentPaths) {
    const resolvedPath = path.resolve(rawAttachmentPath);
    const safeName = sanitizeFilename(path.basename(resolvedPath));
    const targetPath = path.join(attachmentDir, safeName);
    const uniquePath = await ensureUniqueFilePath(targetPath);

    await copyFile(resolvedPath, uniquePath);

    const stats = await stat(uniquePath);
    savedAttachments.push({
      filename: path.basename(uniquePath),
      contentType: "application/octet-stream",
      size: stats.size,
      relativePath: path.join("attachments", path.basename(uniquePath))
    });
  }

  const metadata: SavedSentMessageMetadata = {
    messageId: input.messageId,
    from: [input.from],
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    date: now.toISOString(),
    savedAt: now.toISOString(),
    attachments: savedAttachments
  };

  await writeFile(path.join(messageDir, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  return {
    messageDir,
    metadata
  };
}
