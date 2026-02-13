import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { Logger } from "../types";
import { consoleLogger } from "../types";
import { loadMailEnvConfig } from "../config/env";
import { DEFAULT_POLLING_CONFIG, tryReadPollingConfig } from "../config/polling";
import { saveMessage } from "./saveMessage";

export interface ReceiveOnceOptions {
  mailbox?: string;
  logger?: Logger;
}

export interface ReceiveOnceResult {
  mailbox: string;
  found: number;
  saved: number;
  seenMarked: number;
  failed: number;
}

export async function resolveMailboxForReceive(explicitMailbox?: string): Promise<string> {
  if (explicitMailbox && explicitMailbox.trim().length > 0) {
    return explicitMailbox;
  }

  const pollingConfig = await tryReadPollingConfig();
  return pollingConfig?.mailbox ?? DEFAULT_POLLING_CONFIG.mailbox;
}

function normalizeFlags(rawFlags: unknown): string[] {
  if (rawFlags instanceof Set) {
    return [...rawFlags].map((flag) => String(flag));
  }

  if (Array.isArray(rawFlags)) {
    return rawFlags.map((flag) => String(flag));
  }

  return [];
}

async function toBuffer(source: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(source)) {
    return source;
  }

  if (source instanceof Uint8Array) {
    return Buffer.from(source);
  }

  if (
    typeof source === "object" &&
    source !== null &&
    "on" in source &&
    typeof (source as NodeJS.ReadableStream).on === "function"
  ) {
    const chunks: Buffer[] = [];
    const stream = source as NodeJS.ReadableStream;

    return new Promise((resolve, reject) => {
      stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
  }

  throw new Error("Unsupported IMAP message source payload.");
}

export async function receiveOnce(options: ReceiveOnceOptions = {}): Promise<ReceiveOnceResult> {
  const logger = options.logger ?? consoleLogger;
  const mailbox = await resolveMailboxForReceive(options.mailbox);
  const envConfig = await loadMailEnvConfig();

  const imapClient = new ImapFlow({
    host: envConfig.imap.host,
    port: envConfig.imap.port,
    secure: envConfig.imap.secure,
    auth: {
      user: envConfig.imap.user,
      pass: envConfig.imap.pass
    }
  });

  let found = 0;
  let saved = 0;
  let seenMarked = 0;
  let failed = 0;

  await imapClient.connect();
  const mailboxLock = await imapClient.getMailboxLock(mailbox);

  try {
    const searchResult = await imapClient.search({ seen: false });
    const sequenceIds = searchResult === false ? [] : searchResult;
    found = sequenceIds.length;

    if (found === 0) {
      logger.info(`No unseen messages in ${mailbox}.`);
    }

    for (const sequenceId of sequenceIds) {
      try {
        const fetchedMessage = await imapClient.fetchOne(sequenceId, {
          uid: true,
          flags: true,
          envelope: true,
          source: true
        });

        if (fetchedMessage === false || !fetchedMessage.source) {
          failed += 1;
          logger.warn(`Skipped message ${String(sequenceId)} because source could not be fetched.`);
          continue;
        }

        const rawBuffer = await toBuffer(fetchedMessage.source);
        const parsedMessage = await simpleParser(rawBuffer);
        const fallbackUid =
          typeof sequenceId === "number" ? sequenceId : Number.parseInt(String(sequenceId), 10);
        const uid = typeof fetchedMessage.uid === "number" ? fetchedMessage.uid : fallbackUid;

        if (!Number.isFinite(uid)) {
          throw new Error(`Unable to resolve UID for message ${String(sequenceId)}.`);
        }

        await saveMessage({
          uid,
          raw: rawBuffer,
          parsed: parsedMessage,
          flags: normalizeFlags(fetchedMessage.flags)
        });

        await imapClient.messageFlagsAdd(sequenceId, ["\\Seen"]);
        saved += 1;
        seenMarked += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed processing message ${String(sequenceId)}: ${message}`);
      }
    }
  } finally {
    mailboxLock.release();

    try {
      await imapClient.logout();
    } catch {
      imapClient.close();
    }
  }

  return {
    mailbox,
    found,
    saved,
    seenMarked,
    failed
  };
}
