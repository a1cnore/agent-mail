import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { AGENTMAIL_DATABASE_FILE, MESSAGES_DIR, SENT_MESSAGES_DIR } from "../config/paths";
import { addressListContainsEmail, normalizeEmail } from "../mail/address";
import { deriveMailSessionId } from "../mail/session";
import {
  queryConversationBySession as queryConversationBySessionDb
} from "../storage/database";
import {
  normalizeSavedMessageMetadata,
  normalizeSavedSentMessageMetadata
} from "../storage/metadata";
import type { ConversationEntry } from "../types";

export interface QueryConversationOptions {
  profileId: string;
  sender?: string;
  sessionId?: string;
  includeSent?: boolean;
  limit?: number;
  messagesDir?: string;
  sentMessagesDir?: string;
  databaseFile?: string;
}

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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
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

async function queryReceivedMessagesLegacy(
  sender: string,
  profileId: string,
  messagesDir: string
): Promise<ConversationEntry[]> {
  const messageDirs = await listSubdirectories(messagesDir);
  const entries: ConversationEntry[] = [];

  for (const messageDir of messageDirs) {
    const rawMetadata = await readJsonFile(path.join(messageDir, "metadata.json"));
    const metadata = normalizeSavedMessageMetadata(rawMetadata, {
      profileId,
      accountEmail: "",
      mailbox: "INBOX"
    });

    if (!metadata || !addressListContainsEmail(metadata.from, sender)) {
      continue;
    }

    entries.push({
      direction: "received",
      profileId: metadata.profileId,
      sessionId: deriveMailSessionId(profileId, sender),
      messageId: metadata.messageId,
      from: metadata.from,
      to: metadata.to,
      cc: metadata.cc,
      bcc: metadata.bcc,
      replyTo: metadata.replyTo,
      subject: metadata.subject,
      inReplyTo: metadata.inReplyTo,
      references: metadata.references,
      date: metadata.date,
      savedAt: metadata.savedAt,
      messageDir
    });
  }

  return entries;
}

async function querySentMessagesLegacy(
  sender: string,
  profileId: string,
  sentMessagesDir: string
): Promise<ConversationEntry[]> {
  const messageDirs = await listSubdirectories(sentMessagesDir);
  const entries: ConversationEntry[] = [];

  for (const messageDir of messageDirs) {
    const rawMetadata = await readJsonFile(path.join(messageDir, "metadata.json"));
    const metadata = normalizeSavedSentMessageMetadata(rawMetadata, {
      profileId,
      accountEmail: ""
    });

    if (!metadata) {
      continue;
    }

    const isRecipientMatch =
      addressListContainsEmail(metadata.to, sender) ||
      addressListContainsEmail(metadata.cc, sender) ||
      addressListContainsEmail(metadata.bcc, sender);

    if (!isRecipientMatch) {
      continue;
    }

    entries.push({
      direction: "sent",
      profileId: metadata.profileId,
      sessionId: deriveMailSessionId(profileId, sender),
      messageId: metadata.messageId,
      from: metadata.from,
      to: metadata.to,
      cc: metadata.cc,
      bcc: metadata.bcc,
      replyTo: metadata.replyTo,
      subject: metadata.subject,
      inReplyTo: metadata.inReplyTo,
      references: metadata.references,
      date: metadata.date,
      savedAt: metadata.savedAt,
      messageDir
    });
  }

  return entries;
}

export async function queryConversation(options: QueryConversationOptions): Promise<ConversationEntry[]> {
  const databaseFile = options.databaseFile ?? AGENTMAIL_DATABASE_FILE;
  const includeSent = options.sessionId ? true : Boolean(options.includeSent);
  const requestedSessionId =
    options.sessionId ??
    (options.sender ? deriveMailSessionId(options.profileId, normalizeEmail(options.sender)) : null);

  if (requestedSessionId && (await fileExists(databaseFile))) {
    const entries = queryConversationBySessionDb(requestedSessionId, options.limit, databaseFile);
    const filteredEntries = includeSent ? entries : entries.filter((entry) => entry.direction === "received");

    if (filteredEntries.length > 0 || options.sessionId) {
      return filteredEntries;
    }
  }

  if (!options.sender) {
    return [];
  }

  const sender = normalizeEmail(options.sender);
  const receivedEntries = await queryReceivedMessagesLegacy(
    sender,
    options.profileId,
    options.messagesDir ?? MESSAGES_DIR
  );
  const sentEntries = includeSent
    ? await querySentMessagesLegacy(sender, options.profileId, options.sentMessagesDir ?? SENT_MESSAGES_DIR)
    : [];

  const merged = sortByConversationDate([...receivedEntries, ...sentEntries]);
  if (typeof options.limit === "number") {
    return merged.slice(0, options.limit);
  }

  return merged;
}
