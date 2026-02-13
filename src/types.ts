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

export interface SavedMessageMetadata {
  uid: number;
  messageId: string | null;
  from: string[];
  to: string[];
  subject: string | null;
  date: string | null;
  flags: string[];
  savedAt: string;
  attachments: SavedAttachmentMetadata[];
}

export interface SavedSentMessageMetadata {
  messageId: string | null;
  from: string[];
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string | null;
  date: string | null;
  savedAt: string;
  attachments: SavedAttachmentMetadata[];
}

export interface ConversationEntry {
  direction: "received" | "sent";
  messageId: string | null;
  from: string[];
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string | null;
  date: string | null;
  savedAt: string;
  messageDir: string;
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
