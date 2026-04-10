export interface MailEnvConfig {
  email: string;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  };
  imap: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  };
}

export interface PollingConfig {
  mailbox: string;
  intervalSeconds: number;
}

export interface SavedAttachmentMetadata {
  filename: string;
  contentType: string;
  size: number;
  relativePath: string;
}

export interface SavedAddressFields {
  from: string[];
  fromEmails: string[];
  to: string[];
  toEmails: string[];
  cc: string[];
  ccEmails: string[];
  bcc: string[];
  bccEmails: string[];
  replyTo: string[];
  replyToEmails: string[];
}

export interface SavedMessageMetadata {
  profileId: string;
  accountEmail: string;
  mailbox: string;
  uid: number;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  normalizedSenderEmail: string | null;
  from: string[];
  fromEmails: string[];
  to: string[];
  toEmails: string[];
  cc: string[];
  ccEmails: string[];
  bcc: string[];
  bccEmails: string[];
  replyTo: string[];
  replyToEmails: string[];
  subject: string | null;
  date: string | null;
  flags: string[];
  savedAt: string;
  attachments: SavedAttachmentMetadata[];
}

export interface SavedSentMessageMetadata {
  profileId: string;
  accountEmail: string;
  messageId: string | null;
  from: string[];
  fromEmails: string[];
  to: string[];
  toEmails: string[];
  cc: string[];
  ccEmails: string[];
  bcc: string[];
  bccEmails: string[];
  replyTo: string[];
  replyToEmails: string[];
  subject: string | null;
  inReplyTo: string | null;
  references: string[];
  date: string | null;
  savedAt: string;
  attachments: SavedAttachmentMetadata[];
}

export interface ConversationEntry {
  direction: "received" | "sent";
  profileId: string;
  sessionId: string | null;
  messageId: string | null;
  from: string[];
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string[];
  subject: string | null;
  inReplyTo?: string | null;
  references?: string[];
  date: string | null;
  savedAt: string;
  messageDir: string;
  attachments?: SavedAttachmentMetadata[];
  dispatchStatus?: string;
  dispatchAttempts?: number;
  lastDispatchError?: string | null;
  nextDispatchAt?: string | null;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export const consoleLogger: Logger = {
  info: (message: string) => console.log(`[INFO] ${message}`),
  warn: (message: string) => console.warn(`[WARN] ${message}`),
  error: (message: string) => console.error(`[ERROR] ${message}`)
};
