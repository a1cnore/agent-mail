import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { MESSAGES_DIR, SENT_MESSAGES_DIR } from "../config/paths";
import { addressListContainsEmail, normalizeEmail } from "../mail/address";
import type { ConversationEntry } from "../types";

export interface QueryConversationOptions {
  sender: string;
  includeSent?: boolean;
  limit?: number;
  messagesDir?: string;
  sentMessagesDir?: string;
}

const receivedMetadataSchema = z.object({
  messageId: z.string().nullable(),
  from: z.array(z.string()),
  to: z.array(z.string()),
  subject: z.string().nullable(),
  date: z.string().nullable(),
  savedAt: z.string(),
  attachments: z.array(z.unknown())
});

const sentMetadataSchema = z.object({
  messageId: z.string().nullable(),
  from: z.array(z.string()),
  to: z.array(z.string()),
  cc: z.array(z.string()),
  bcc: z.array(z.string()),
  subject: z.string().nullable(),
  date: z.string().nullable(),
  savedAt: z.string(),
  attachments: z.array(z.unknown())
});

function sortByConversationDate(entries: ConversationEntry[]): ConversationEntry[] {
  return entries.sort((left, right) => {
    const leftTimestamp = Date.parse(left.date ?? left.savedAt);
    const rightTimestamp = Date.parse(right.date ?? right.savedAt);

    if (Number.isNaN(leftTimestamp) && Number.isNaN(rightTimestamp)) {
      return left.messageDir.localeCompare(right.messageDir);
    }

    if (Number.isNaN(leftTimestamp)) {
      return 1;
    }

    if (Number.isNaN(rightTimestamp)) {
      return -1;
    }

    if (leftTimestamp === rightTimestamp) {
      return left.messageDir.localeCompare(right.messageDir);
    }

    return leftTimestamp - rightTimestamp;
  });
}

async function listSubdirectories(baseDir: string): Promise<string[]> {
  try {
    const entries = await readdir(baseDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(baseDir, entry.name));
  } catch (error) {
    const ioError = error as NodeJS.ErrnoException;
    if (ioError.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function readJsonFile(filePath: string): Promise<unknown | null> {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as unknown;
  } catch {
    return null;
  }
}

async function queryReceivedMessages(sender: string, messagesDir: string): Promise<ConversationEntry[]> {
  const messageDirs = await listSubdirectories(messagesDir);
  const entries: ConversationEntry[] = [];

  for (const messageDir of messageDirs) {
    const metadataPath = path.join(messageDir, "metadata.json");
    const rawMetadata = await readJsonFile(metadataPath);
    const parsedMetadata = receivedMetadataSchema.safeParse(rawMetadata);

    if (!parsedMetadata.success) {
      continue;
    }

    const metadata = parsedMetadata.data;
    if (!addressListContainsEmail(metadata.from, sender)) {
      continue;
    }

    entries.push({
      direction: "received",
      messageId: metadata.messageId,
      from: metadata.from,
      to: metadata.to,
      subject: metadata.subject,
      date: metadata.date,
      savedAt: metadata.savedAt,
      messageDir
    });
  }

  return entries;
}

async function querySentMessages(sender: string, sentMessagesDir: string): Promise<ConversationEntry[]> {
  const messageDirs = await listSubdirectories(sentMessagesDir);
  const entries: ConversationEntry[] = [];

  for (const messageDir of messageDirs) {
    const metadataPath = path.join(messageDir, "metadata.json");
    const rawMetadata = await readJsonFile(metadataPath);
    const parsedMetadata = sentMetadataSchema.safeParse(rawMetadata);

    if (!parsedMetadata.success) {
      continue;
    }

    const metadata = parsedMetadata.data;
    const isRecipientMatch =
      addressListContainsEmail(metadata.to, sender) ||
      addressListContainsEmail(metadata.cc, sender) ||
      addressListContainsEmail(metadata.bcc, sender);

    if (!isRecipientMatch) {
      continue;
    }

    entries.push({
      direction: "sent",
      messageId: metadata.messageId,
      from: metadata.from,
      to: metadata.to,
      cc: metadata.cc,
      bcc: metadata.bcc,
      subject: metadata.subject,
      date: metadata.date,
      savedAt: metadata.savedAt,
      messageDir
    });
  }

  return entries;
}

export async function queryConversation(options: QueryConversationOptions): Promise<ConversationEntry[]> {
  const sender = normalizeEmail(options.sender);

  const receivedEntries = await queryReceivedMessages(sender, options.messagesDir ?? MESSAGES_DIR);
  const sentEntries = options.includeSent
    ? await querySentMessages(sender, options.sentMessagesDir ?? SENT_MESSAGES_DIR)
    : [];

  const merged = sortByConversationDate([...receivedEntries, ...sentEntries]);

  if (typeof options.limit === "number") {
    return merged.slice(0, options.limit);
  }

  return merged;
}
