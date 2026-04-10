import type { SavedMessageMetadata, SavedSentMessageMetadata } from "../types";
import { extractEmailsFromAddressList, normalizeEmail } from "../mail/address";
import { normalizeMessageIdList } from "../mail/session";

interface MetadataDefaults {
  profileId: string;
  accountEmail: string;
  mailbox?: string;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRequiredString(value: unknown, fallback: string): string {
  return normalizeNullableString(value) ?? fallback;
}

function normalizeOptionalIsoDate(value: unknown): string | null {
  const normalized = normalizeNullableString(value);
  return normalized ?? null;
}

function normalizeAttachmentList(value: unknown): SavedMessageMetadata["attachments"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }

    const candidate = entry as Record<string, unknown>;
    const filename = normalizeNullableString(candidate.filename);
    const relativePath = normalizeNullableString(candidate.relativePath);
    const contentType = normalizeRequiredString(candidate.contentType, "application/octet-stream");
    const size =
      typeof candidate.size === "number" && Number.isFinite(candidate.size) ? candidate.size : 0;

    if (!filename || !relativePath) {
      return [];
    }

    return [{
      filename,
      relativePath,
      contentType,
      size
    }];
  });
}

function normalizeEmails(rawValues: string[], provided: unknown): string[] {
  const providedValues = normalizeStringArray(provided).map((value) => normalizeEmail(value));
  if (providedValues.length > 0) {
    return [...new Set(providedValues)];
  }

  return extractEmailsFromAddressList(rawValues);
}

export function normalizeSavedMessageMetadata(
  raw: unknown,
  defaults: MetadataDefaults
): SavedMessageMetadata | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const from = normalizeStringArray(candidate.from);
  const to = normalizeStringArray(candidate.to);
  const cc = normalizeStringArray(candidate.cc);
  const bcc = normalizeStringArray(candidate.bcc);
  const replyTo = normalizeStringArray(candidate.replyTo);
  const fromEmails = normalizeEmails(from, candidate.fromEmails);
  const toEmails = normalizeEmails(to, candidate.toEmails);
  const ccEmails = normalizeEmails(cc, candidate.ccEmails);
  const bccEmails = normalizeEmails(bcc, candidate.bccEmails);
  const replyToEmails = normalizeEmails(replyTo, candidate.replyToEmails);
  const uid = typeof candidate.uid === "number" && Number.isFinite(candidate.uid) ? candidate.uid : null;

  if (uid === null) {
    return null;
  }

  const normalizedSenderEmail =
    normalizeNullableString(candidate.normalizedSenderEmail) ??
    fromEmails[0] ??
    null;

  return {
    profileId: normalizeRequiredString(candidate.profileId, defaults.profileId),
    accountEmail: normalizeRequiredString(candidate.accountEmail, defaults.accountEmail),
    mailbox: normalizeRequiredString(candidate.mailbox, defaults.mailbox ?? "INBOX"),
    uid,
    messageId: normalizeNullableString(candidate.messageId),
    inReplyTo: normalizeNullableString(candidate.inReplyTo),
    references: normalizeMessageIdList(candidate.references as string[] | string | null | undefined),
    normalizedSenderEmail: normalizedSenderEmail ? normalizeEmail(normalizedSenderEmail) : null,
    from,
    fromEmails,
    to,
    toEmails,
    cc,
    ccEmails,
    bcc,
    bccEmails,
    replyTo,
    replyToEmails,
    subject: normalizeNullableString(candidate.subject),
    date: normalizeOptionalIsoDate(candidate.date),
    flags: normalizeStringArray(candidate.flags),
    savedAt: normalizeRequiredString(candidate.savedAt, new Date(0).toISOString()),
    attachments: normalizeAttachmentList(candidate.attachments)
  };
}

export function normalizeSavedSentMessageMetadata(
  raw: unknown,
  defaults: MetadataDefaults
): SavedSentMessageMetadata | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const from = normalizeStringArray(candidate.from);
  const to = normalizeStringArray(candidate.to);
  const cc = normalizeStringArray(candidate.cc);
  const bcc = normalizeStringArray(candidate.bcc);
  const replyTo = normalizeStringArray(candidate.replyTo);

  if (from.length === 0 && to.length === 0) {
    return null;
  }

  return {
    profileId: normalizeRequiredString(candidate.profileId, defaults.profileId),
    accountEmail: normalizeRequiredString(candidate.accountEmail, defaults.accountEmail),
    messageId: normalizeNullableString(candidate.messageId),
    from,
    fromEmails: normalizeEmails(from, candidate.fromEmails),
    to,
    toEmails: normalizeEmails(to, candidate.toEmails),
    cc,
    ccEmails: normalizeEmails(cc, candidate.ccEmails),
    bcc,
    bccEmails: normalizeEmails(bcc, candidate.bccEmails),
    replyTo,
    replyToEmails: normalizeEmails(replyTo, candidate.replyToEmails),
    subject: normalizeNullableString(candidate.subject),
    inReplyTo: normalizeNullableString(candidate.inReplyTo),
    references: normalizeMessageIdList(candidate.references as string[] | string | null | undefined),
    date: normalizeOptionalIsoDate(candidate.date),
    savedAt: normalizeRequiredString(candidate.savedAt, new Date(0).toISOString()),
    attachments: normalizeAttachmentList(candidate.attachments)
  };
}
