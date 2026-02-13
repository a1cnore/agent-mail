import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AddressObject } from "mailparser";
import type { SavedAttachmentMetadata, SavedMessageMetadata } from "../types";
import { MESSAGES_DIR } from "../config/paths";

export interface ParsedAttachmentLike {
  filename?: string | null;
  contentType?: string;
  size?: number;
  content: Buffer;
}

export interface ParsedMailLike {
  messageId?: string | null;
  subject?: string | null;
  date?: Date | null;
  text?: string | false | null;
  html?: string | Buffer | false | null;
  from?: AddressObject | AddressObject[] | null;
  to?: AddressObject | AddressObject[] | null;
  cc?: AddressObject | AddressObject[] | null;
  bcc?: AddressObject | AddressObject[] | null;
  attachments?: ParsedAttachmentLike[];
}

export interface SaveMessageInput {
  uid: number;
  raw: Buffer;
  parsed: ParsedMailLike;
  flags: string[];
}

export interface SaveMessageResult {
  messageDir: string;
  metadata: SavedMessageMetadata;
}

export function formatTimestamp(timestamp: Date): string {
  return timestamp.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function sanitizeFilename(filename: string): string {
  const basename = path.basename(filename.trim());
  const sanitized = basename.replace(/[^a-zA-Z0-9.()_\- ]+/g, "_").trim();
  return sanitized.length > 0 ? sanitized : "attachment";
}

function formatAddress(addressObject?: AddressObject | AddressObject[] | null): string[] {
  if (!addressObject) {
    return [];
  }

  const entries = Array.isArray(addressObject)
    ? addressObject.flatMap((value) => value.value)
    : addressObject.value;

  return entries
    .map((entry) => {
      if (entry.name && entry.address) {
        return `${entry.name} <${entry.address}>`;
      }

      return entry.address ?? entry.name ?? null;
    })
    .filter((entry): entry is string => Boolean(entry));
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

function normalizeHtml(html: ParsedMailLike["html"]): string | null {
  if (typeof html === "string") {
    return html;
  }

  if (Buffer.isBuffer(html)) {
    return html.toString("utf8");
  }

  return null;
}

export async function saveMessage(input: SaveMessageInput, messagesDir = MESSAGES_DIR): Promise<SaveMessageResult> {
  await mkdir(messagesDir, { recursive: true });

  const now = new Date();
  const directoryName = `${formatTimestamp(now)}_uid-${input.uid}`;
  const baseMessageDir = path.join(messagesDir, directoryName);
  const messageDir = await ensureUniqueMessageDir(baseMessageDir);
  const attachmentDir = path.join(messageDir, "attachments");

  await mkdir(attachmentDir, { recursive: true });

  await writeFile(path.join(messageDir, "raw.eml"), input.raw);

  if (typeof input.parsed.text === "string" && input.parsed.text.length > 0) {
    await writeFile(path.join(messageDir, "body.txt"), input.parsed.text, "utf8");
  }

  const htmlBody = normalizeHtml(input.parsed.html);
  if (htmlBody !== null && htmlBody.length > 0) {
    await writeFile(path.join(messageDir, "body.html"), htmlBody, "utf8");
  }

  const savedAttachments: SavedAttachmentMetadata[] = [];
  const parsedAttachments = input.parsed.attachments ?? [];

  for (let index = 0; index < parsedAttachments.length; index += 1) {
    const attachment = parsedAttachments[index];
    const fallbackName = `attachment-${index + 1}.bin`;
    const safeName = sanitizeFilename(attachment.filename ?? fallbackName);
    const targetPath = path.join(attachmentDir, safeName);
    const uniquePath = await ensureUniqueFilePath(targetPath);
    await writeFile(uniquePath, attachment.content);

    savedAttachments.push({
      filename: path.basename(uniquePath),
      contentType: attachment.contentType ?? "application/octet-stream",
      size: attachment.size ?? attachment.content.byteLength,
      relativePath: path.join("attachments", path.basename(uniquePath))
    });
  }

  const recipients = [
    ...formatAddress(input.parsed.to),
    ...formatAddress(input.parsed.cc),
    ...formatAddress(input.parsed.bcc)
  ];

  const metadata: SavedMessageMetadata = {
    uid: input.uid,
    messageId: input.parsed.messageId ?? null,
    from: formatAddress(input.parsed.from),
    to: recipients,
    subject: input.parsed.subject ?? null,
    date: input.parsed.date ? input.parsed.date.toISOString() : null,
    flags: input.flags,
    savedAt: now.toISOString(),
    attachments: savedAttachments
  };

  await writeFile(path.join(messageDir, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  return {
    messageDir,
    metadata
  };
}
