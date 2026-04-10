import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type {
  ConversationEntry,
  SavedMessageMetadata,
  SavedSentMessageMetadata
} from "../types";
import { AGENTMAIL_DATABASE_FILE } from "../config/paths";
import { normalizeEmail } from "../mail/address";
import { deriveMailSessionId } from "../mail/session";
import {
  normalizeSavedMessageMetadata,
  normalizeSavedSentMessageMetadata
} from "./metadata";

export const DISPATCH_PENDING = "pending";
export const DISPATCH_RUNNING = "running";
export const DISPATCH_FAILED = "failed";
export const DISPATCH_SUCCEEDED = "succeeded";
export const DISPATCH_DEADLETTER = "deadletter";

const DISPATCH_RETRY_DELAYS_MS = [60_000, 300_000, 900_000, 3_600_000];

interface ConversationRow {
  metadata_json: string;
  message_dir: string;
  session_id: string;
  dispatch_status?: string;
  dispatch_attempts?: number;
  last_dispatch_error?: string | null;
  next_dispatch_at?: string | null;
}

interface ClaimedInboundRow extends ConversationRow {
  id: number;
  profile_id: string;
  peer_email: string;
  dispatch_attempts: number;
}

interface DispatchQueueRow {
  id: number;
  profile_id: string;
  session_id: string;
  peer_email: string;
  dispatch_status: string;
  dispatch_attempts: number;
  saved_at: string;
  dispatch_started_at: string | null;
  dispatch_finished_at: string | null;
  next_dispatch_at: string | null;
  last_dispatch_error: string | null;
  message_dir: string;
  metadata_json: string;
}

export interface RecordInboundMessageInput {
  profileId: string;
  accountEmail: string;
  uid: number;
  peerEmail: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  savedAt: string;
  messageDir: string;
  metadata: SavedMessageMetadata;
  dispatchStatus?: string;
  dispatchAttempts?: number;
  nextDispatchAt?: string | null;
}

export interface RecordOutboundMessageInput {
  profileId: string;
  accountEmail: string;
  peerEmails: string[];
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  savedAt: string;
  messageDir: string;
  metadata: SavedSentMessageMetadata;
}

export interface RecordMessageResult {
  sessionId: string;
  inserted: boolean;
}

export interface DispatchJob {
  id: number;
  profileId: string;
  sessionId: string;
  peerEmail: string;
  attempts: number;
  messageDir: string;
  metadata: SavedMessageMetadata;
  startedAt?: string;
}

export interface DispatchStatusSummary {
  pending: number;
  running: number;
  failed: number;
  succeeded: number;
  deadletter: number;
}

export interface DispatchQueueEntry {
  id: number;
  profileId: string;
  sessionId: string;
  peerEmail: string;
  dispatchStatus: string;
  dispatchAttempts: number;
  savedAt: string;
  dispatchStartedAt: string | null;
  dispatchFinishedAt: string | null;
  nextDispatchAt: string | null;
  lastDispatchError: string | null;
  messageDir: string;
  subject: string | null;
}

export interface RebuildIndexResult {
  inboundIndexed: number;
  outboundIndexed: number;
  inboundSkipped: number;
  outboundSkipped: number;
}

export function openDatabase(databaseFile = AGENTMAIL_DATABASE_FILE): Database {
  mkdirSync(path.dirname(databaseFile), { recursive: true });
  const db = new Database(databaseFile, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      account_email TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mail_sessions (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      peer_email TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(profile_id, peer_email)
    );

    CREATE TABLE IF NOT EXISTS inbound_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id TEXT NOT NULL,
      uid INTEGER NOT NULL,
      session_id TEXT NOT NULL,
      peer_email TEXT NOT NULL,
      message_id TEXT,
      in_reply_to TEXT,
      references_json TEXT NOT NULL,
      saved_at TEXT NOT NULL,
      message_dir TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      dispatch_status TEXT NOT NULL,
      dispatch_attempts INTEGER NOT NULL DEFAULT 0,
      next_dispatch_at TEXT,
      dispatch_started_at TEXT,
      dispatch_finished_at TEXT,
      last_dispatch_error TEXT,
      UNIQUE(profile_id, uid)
    );

    CREATE TABLE IF NOT EXISTS outbound_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      peer_email TEXT NOT NULL,
      message_id TEXT,
      in_reply_to TEXT,
      references_json TEXT NOT NULL,
      saved_at TEXT NOT NULL,
      message_dir TEXT NOT NULL,
      metadata_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mail_sessions_profile_peer
      ON mail_sessions(profile_id, peer_email);
    CREATE INDEX IF NOT EXISTS idx_inbound_dispatch
      ON inbound_messages(dispatch_status, next_dispatch_at, saved_at);
    CREATE INDEX IF NOT EXISTS idx_inbound_session
      ON inbound_messages(profile_id, session_id, saved_at);
    CREATE INDEX IF NOT EXISTS idx_inbound_message_id
      ON inbound_messages(profile_id, message_id);
    CREATE INDEX IF NOT EXISTS idx_outbound_session
      ON outbound_messages(profile_id, session_id, saved_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_outbound_profile_message_dir
      ON outbound_messages(profile_id, message_dir);
  `);
  return db;
}

function withDatabase<T>(databaseFile: string | undefined, fn: (db: Database) => T): T {
  const db = openDatabase(databaseFile);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function toJson(value: unknown): string {
  return JSON.stringify(value);
}

function resolvePeerEmail(input: { peerEmail?: string | null; fallbackToken: string }): string {
  const peerEmail = input.peerEmail?.trim();
  if (peerEmail && peerEmail.length > 0) {
    return normalizeEmail(peerEmail);
  }

  return `unknown:${input.fallbackToken}`;
}

function upsertProfile(db: Database, profileId: string, accountEmail: string, timestamp: string): void {
  db.query(
    `
      INSERT INTO profiles (id, account_email, enabled, updated_at)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(id) DO UPDATE SET
        account_email = excluded.account_email,
        updated_at = excluded.updated_at
    `
  ).run(profileId, accountEmail, timestamp);
}

function upsertSession(db: Database, profileId: string, peerEmail: string, timestamp: string): string {
  const sessionId = deriveMailSessionId(profileId, peerEmail);
  db.query(
    `
      INSERT INTO mail_sessions (id, profile_id, peer_email, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(profile_id, peer_email) DO UPDATE SET
        id = excluded.id,
        updated_at = excluded.updated_at
    `
  ).run(sessionId, profileId, peerEmail, timestamp, timestamp);
  return sessionId;
}

export function recordInboundMessage(
  input: RecordInboundMessageInput,
  databaseFile = AGENTMAIL_DATABASE_FILE
): RecordMessageResult {
  return withDatabase(databaseFile, (db) => {
    const tx = db.transaction((value: RecordInboundMessageInput): RecordMessageResult => {
      const peerEmail = resolvePeerEmail({
        peerEmail: value.peerEmail,
        fallbackToken: value.messageId ?? `uid-${value.uid}`
      });
      upsertProfile(db, value.profileId, value.accountEmail, value.savedAt);
      const sessionId = upsertSession(db, value.profileId, peerEmail, value.savedAt);

      const existing = db.query<{ id: number }, [string, number]>(
        "SELECT id FROM inbound_messages WHERE profile_id = ? AND uid = ? LIMIT 1"
      ).get(value.profileId, value.uid);
      if (existing) {
        return { sessionId, inserted: false };
      }

      db.query(
        `
          INSERT INTO inbound_messages (
            profile_id,
            uid,
            session_id,
            peer_email,
            message_id,
            in_reply_to,
            references_json,
            saved_at,
            message_dir,
            metadata_json,
            dispatch_status,
            dispatch_attempts,
            next_dispatch_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        value.profileId,
        value.uid,
        sessionId,
        peerEmail,
        value.messageId,
        value.inReplyTo,
        toJson(value.references),
        value.savedAt,
        value.messageDir,
        toJson(value.metadata),
        value.dispatchStatus ?? DISPATCH_PENDING,
        value.dispatchAttempts ?? 0,
        value.nextDispatchAt ?? value.savedAt
      );

      return { sessionId, inserted: true };
    });

    return tx(input);
  });
}

function resolveOutboundSessionContext(
  db: Database,
  input: RecordOutboundMessageInput
): { sessionId: string; peerEmail: string } {
  const threadMessageIds = [...new Set([input.inReplyTo, ...input.references].filter(Boolean) as string[])];

  if (threadMessageIds.length > 0) {
    const placeholders = threadMessageIds.map(() => "?").join(", ");
    const row = db.query(
      `
        SELECT session_id, peer_email
        FROM inbound_messages
        WHERE profile_id = ?
          AND message_id IN (${placeholders})
        ORDER BY saved_at DESC
        LIMIT 1
      `
    ).get(input.profileId, ...threadMessageIds) as { session_id: string; peer_email: string } | null;

    if (row) {
      upsertSession(db, input.profileId, row.peer_email, input.savedAt);
      return {
        sessionId: row.session_id,
        peerEmail: row.peer_email
      };
    }
  }

  for (const candidateEmail of input.peerEmails) {
    const normalizedCandidate = normalizeEmail(candidateEmail);
    const existingSession = db.query(
      `
        SELECT id, peer_email
        FROM mail_sessions
        WHERE profile_id = ?
          AND peer_email = ?
        LIMIT 1
      `
    ).get(input.profileId, normalizedCandidate) as { id: string; peer_email: string } | null;

    if (existingSession) {
      upsertSession(db, input.profileId, existingSession.peer_email, input.savedAt);
      return {
        sessionId: existingSession.id,
        peerEmail: existingSession.peer_email
      };
    }
  }

  const peerEmail = resolvePeerEmail({
    peerEmail: input.peerEmails[0] ?? null,
    fallbackToken: input.messageId ?? input.savedAt
  });

  return {
    sessionId: upsertSession(db, input.profileId, peerEmail, input.savedAt),
    peerEmail
  };
}

export function recordOutboundMessage(
  input: RecordOutboundMessageInput,
  databaseFile = AGENTMAIL_DATABASE_FILE
): RecordMessageResult {
  return withDatabase(databaseFile, (db) => {
    const tx = db.transaction((value: RecordOutboundMessageInput): RecordMessageResult => {
      upsertProfile(db, value.profileId, value.accountEmail, value.savedAt);
      const { sessionId, peerEmail } = resolveOutboundSessionContext(db, value);

      const insertResult = db.query(
        `
          INSERT OR IGNORE INTO outbound_messages (
            profile_id,
            session_id,
            peer_email,
            message_id,
            in_reply_to,
            references_json,
            saved_at,
            message_dir,
            metadata_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        value.profileId,
        sessionId,
        peerEmail,
        value.messageId,
        value.inReplyTo,
        toJson(value.references),
        value.savedAt,
        value.messageDir,
        toJson(value.metadata)
      );

      return { sessionId, inserted: insertResult.changes > 0 };
    });

    return tx(input);
  });
}

function sortConversationEntries(entries: ConversationEntry[]): ConversationEntry[] {
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

function inboundConversationEntryFromRow(row: ConversationRow): ConversationEntry | null {
  const metadata = normalizeSavedMessageMetadata(JSON.parse(row.metadata_json), {
    profileId: "default",
    accountEmail: "",
    mailbox: "INBOX"
  });

  if (!metadata) {
    return null;
  }

  return {
    direction: "received",
    profileId: metadata.profileId,
    sessionId: row.session_id,
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
    messageDir: row.message_dir,
    attachments: metadata.attachments,
    dispatchStatus: row.dispatch_status,
    dispatchAttempts: row.dispatch_attempts,
    lastDispatchError: row.last_dispatch_error,
    nextDispatchAt: row.next_dispatch_at
  };
}

function outboundConversationEntryFromRow(row: ConversationRow): ConversationEntry | null {
  const metadata = normalizeSavedSentMessageMetadata(JSON.parse(row.metadata_json), {
    profileId: "default",
    accountEmail: ""
  });

  if (!metadata) {
    return null;
  }

  return {
    direction: "sent",
    profileId: metadata.profileId,
    sessionId: row.session_id,
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
    messageDir: row.message_dir,
    attachments: metadata.attachments
  };
}

function queryConversationRows(db: Database, sessionId: string): ConversationEntry[] {
  const inboundRows = db.query<ConversationRow, [string]>(
    `
      SELECT metadata_json, message_dir, session_id,
             dispatch_status, dispatch_attempts, last_dispatch_error, next_dispatch_at
      FROM inbound_messages
      WHERE session_id = ?
    `
  ).all(sessionId);
  const outboundRows = db.query<ConversationRow, [string]>(
    `
      SELECT metadata_json, message_dir, session_id
      FROM outbound_messages
      WHERE session_id = ?
    `
  ).all(sessionId);

  const inboundEntries = inboundRows.flatMap((row) => {
    const entry = inboundConversationEntryFromRow(row);
    return entry ? [entry] : [];
  });
  const outboundEntries = outboundRows.flatMap((row) => {
    const entry = outboundConversationEntryFromRow(row);
    return entry ? [entry] : [];
  });

  return sortConversationEntries([...inboundEntries, ...outboundEntries]);
}

export function queryConversationBySession(
  sessionId: string,
  limit: number | undefined,
  databaseFile = AGENTMAIL_DATABASE_FILE
): ConversationEntry[] {
  const entries = withDatabase(databaseFile, (db) => queryConversationRows(db, sessionId));
  if (typeof limit === "number") {
    return entries.slice(0, limit);
  }

  return entries;
}

export function queryConversationBySender(
  profileId: string,
  sender: string,
  limit: number | undefined,
  databaseFile = AGENTMAIL_DATABASE_FILE
): ConversationEntry[] {
  const sessionId = deriveMailSessionId(profileId, sender);
  return queryConversationBySession(sessionId, limit, databaseFile);
}

export function listDispatchJobsReady(
  limit: number,
  databaseFile = AGENTMAIL_DATABASE_FILE
): DispatchJob[] {
  const now = new Date().toISOString();

  return withDatabase(databaseFile, (db) => {
    const rows = db.query(
      `
        SELECT id, profile_id, session_id, peer_email, dispatch_attempts, message_dir, metadata_json
        FROM inbound_messages
        WHERE dispatch_status IN (?, ?)
          AND (next_dispatch_at IS NULL OR next_dispatch_at <= ?)
        ORDER BY saved_at ASC
        LIMIT ?
      `
    ).all(DISPATCH_PENDING, DISPATCH_FAILED, now, limit) as ClaimedInboundRow[];

    return rows.flatMap((row) => {
      const metadata = normalizeSavedMessageMetadata(JSON.parse(row.metadata_json), {
        profileId: row.profile_id,
        accountEmail: "",
        mailbox: "INBOX"
      });
      if (!metadata) {
        return [];
      }

      return [{
        id: row.id,
        profileId: row.profile_id,
        sessionId: row.session_id,
        peerEmail: row.peer_email,
        attempts: row.dispatch_attempts,
        messageDir: row.message_dir,
        metadata
      }];
    });
  });
}

export function claimDispatchJob(
  jobId: number,
  databaseFile = AGENTMAIL_DATABASE_FILE
): DispatchJob | null {
  const startedAt = new Date().toISOString();

  return withDatabase(databaseFile, (db) => {
    const updated = db.query(
      `
        UPDATE inbound_messages
        SET dispatch_status = ?,
            dispatch_started_at = ?,
            dispatch_finished_at = NULL,
            last_dispatch_error = NULL
        WHERE id = ?
          AND dispatch_status IN (?, ?)
      `
    ).run(DISPATCH_RUNNING, startedAt, jobId, DISPATCH_PENDING, DISPATCH_FAILED);

    if (updated.changes === 0) {
      return null;
    }

    const row = db.query<ClaimedInboundRow, [number]>(
      `
        SELECT id, profile_id, session_id, peer_email, dispatch_attempts, message_dir, metadata_json
        FROM inbound_messages
        WHERE id = ?
        LIMIT 1
      `
    ).get(jobId);

    if (!row) {
      return null;
    }

    const metadata = normalizeSavedMessageMetadata(JSON.parse(row.metadata_json), {
      profileId: row.profile_id,
      accountEmail: "",
      mailbox: "INBOX"
    });
    if (!metadata) {
      return null;
    }

    return {
      id: row.id,
      profileId: row.profile_id,
      sessionId: row.session_id,
      peerEmail: row.peer_email,
      attempts: row.dispatch_attempts,
      messageDir: row.message_dir,
      metadata,
      startedAt
    };
  });
}

export function markDispatchSucceeded(
  jobId: number,
  databaseFile = AGENTMAIL_DATABASE_FILE
): void {
  const finishedAt = new Date().toISOString();
  withDatabase(databaseFile, (db) => {
    db.query(
      `
        UPDATE inbound_messages
        SET dispatch_status = ?,
            dispatch_finished_at = ?,
            next_dispatch_at = NULL,
            last_dispatch_error = NULL
        WHERE id = ?
      `
    ).run(DISPATCH_SUCCEEDED, finishedAt, jobId);
  });
}

export function markDispatchFailed(
  jobId: number,
  errorMessage: string,
  databaseFile = AGENTMAIL_DATABASE_FILE
): void {
  const finishedAt = new Date().toISOString();

  withDatabase(databaseFile, (db) => {
    const current = db.query<{ dispatch_attempts: number }, [number]>(
      "SELECT dispatch_attempts FROM inbound_messages WHERE id = ? LIMIT 1"
    ).get(jobId);

    if (!current) {
      return;
    }

    const nextAttemptCount = current.dispatch_attempts + 1;
    const retryDelayMs = DISPATCH_RETRY_DELAYS_MS[current.dispatch_attempts];
    const nextDispatchAt =
      retryDelayMs === undefined ? null : new Date(Date.now() + retryDelayMs).toISOString();
    const nextStatus = retryDelayMs === undefined ? DISPATCH_DEADLETTER : DISPATCH_FAILED;

    db.query(
      `
        UPDATE inbound_messages
        SET dispatch_status = ?,
            dispatch_attempts = ?,
            next_dispatch_at = ?,
            dispatch_finished_at = ?,
            last_dispatch_error = ?
        WHERE id = ?
      `
    ).run(nextStatus, nextAttemptCount, nextDispatchAt, finishedAt, errorMessage, jobId);
  });
}

export function getLatestOutboundMessageSavedAt(
  profileId: string,
  sessionId: string,
  startedAt: string,
  databaseFile = AGENTMAIL_DATABASE_FILE
): string | null {
  return withDatabase(databaseFile, (db) => {
    const row = db.query<{ saved_at: string }, [string, string, string]>(
      `
        SELECT saved_at
        FROM outbound_messages
        WHERE profile_id = ?
          AND session_id = ?
          AND saved_at >= ?
        ORDER BY saved_at DESC
        LIMIT 1
      `
    ).get(profileId, sessionId, startedAt);

    return row?.saved_at ?? null;
  });
}

function toDispatchQueueEntry(row: DispatchQueueRow): DispatchQueueEntry | null {
  const metadata = normalizeSavedMessageMetadata(JSON.parse(row.metadata_json), {
    profileId: row.profile_id,
    accountEmail: "",
    mailbox: "INBOX"
  });

  if (!metadata) {
    return null;
  }

  return {
    id: row.id,
    profileId: row.profile_id,
    sessionId: row.session_id,
    peerEmail: row.peer_email,
    dispatchStatus: row.dispatch_status,
    dispatchAttempts: row.dispatch_attempts,
    savedAt: row.saved_at,
    dispatchStartedAt: row.dispatch_started_at,
    dispatchFinishedAt: row.dispatch_finished_at,
    nextDispatchAt: row.next_dispatch_at,
    lastDispatchError: row.last_dispatch_error,
    messageDir: row.message_dir,
    subject: metadata.subject
  };
}

export function listDispatchQueue(
  options: {
    profileId?: string;
    sender?: string;
    statuses?: string[];
    limit?: number;
  } = {},
  databaseFile = AGENTMAIL_DATABASE_FILE
): DispatchQueueEntry[] {
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (options.profileId) {
    conditions.push("profile_id = ?");
    params.push(options.profileId);
  }

  if (options.sender) {
    conditions.push("peer_email = ?");
    params.push(normalizeEmail(options.sender));
  }

  if (options.statuses && options.statuses.length > 0) {
    const placeholders = options.statuses.map(() => "?").join(", ");
    conditions.push(`dispatch_status IN (${placeholders})`);
    params.push(...options.statuses);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = options.limit ?? 20;

  return withDatabase(databaseFile, (db) => {
    const rows = db.query(
      `
        SELECT
          id,
          profile_id,
          session_id,
          peer_email,
          dispatch_status,
          dispatch_attempts,
          saved_at,
          dispatch_started_at,
          dispatch_finished_at,
          next_dispatch_at,
          last_dispatch_error,
          message_dir,
          metadata_json
        FROM inbound_messages
        ${whereClause}
        ORDER BY id DESC
        LIMIT ?
      `
    ).all(...params, limit) as DispatchQueueRow[];

    return rows.flatMap((row) => {
      const entry = toDispatchQueueEntry(row);
      return entry ? [entry] : [];
    });
  });
}

export function retryDispatchQueue(
  options: {
    profileId?: string;
    sender?: string;
    includeDeadletter?: boolean;
  } = {},
  databaseFile = AGENTMAIL_DATABASE_FILE
): number {
  const statusPlaceholders = options.includeDeadletter ? "?, ?, ?" : "?, ?";
  const conditions = [`dispatch_status IN (${statusPlaceholders})`];
  const params: string[] = [DISPATCH_FAILED, DISPATCH_PENDING];

  if (options.includeDeadletter) {
    params.push(DISPATCH_DEADLETTER);
  }

  if (options.profileId) {
    conditions.push("profile_id = ?");
    params.push(options.profileId);
  }

  if (options.sender) {
    conditions.push("peer_email = ?");
    params.push(normalizeEmail(options.sender));
  }

  return withDatabase(databaseFile, (db) => {
    const result = db.query(
      `
        UPDATE inbound_messages
        SET dispatch_status = ?,
            next_dispatch_at = ?,
            last_dispatch_error = NULL
        WHERE ${conditions.join(" AND ")}
      `
    ).run(DISPATCH_FAILED, "1970-01-01T00:00:00.000Z", ...params);

    return result.changes;
  });
}

export function countStalledDispatchJobs(
  thresholdSeconds: number,
  databaseFile = AGENTMAIL_DATABASE_FILE
): number {
  const thresholdIso = new Date(Date.now() - thresholdSeconds * 1000).toISOString();

  return withDatabase(databaseFile, (db) => {
    const row = db.query<{ count: number }, [string, string]>(
      `
        SELECT COUNT(*) AS count
        FROM inbound_messages
        WHERE dispatch_status = ?
          AND saved_at <= ?
      `
    ).get(DISPATCH_PENDING, thresholdIso);

    return row?.count ?? 0;
  });
}

export function getDispatchStatusSummary(
  databaseFile = AGENTMAIL_DATABASE_FILE
): DispatchStatusSummary {
  return withDatabase(databaseFile, (db) => {
    const rows = db.query(
      `
        SELECT dispatch_status, COUNT(*) AS count
        FROM inbound_messages
        GROUP BY dispatch_status
      `
    ).all() as Array<{ dispatch_status: string; count: number }>;

    const summary: DispatchStatusSummary = {
      pending: 0,
      running: 0,
      failed: 0,
      succeeded: 0,
      deadletter: 0
    };

    for (const row of rows) {
      switch (row.dispatch_status) {
        case DISPATCH_PENDING:
          summary.pending = row.count;
          break;
        case DISPATCH_RUNNING:
          summary.running = row.count;
          break;
        case DISPATCH_FAILED:
          summary.failed = row.count;
          break;
        case DISPATCH_SUCCEEDED:
          summary.succeeded = row.count;
          break;
        case DISPATCH_DEADLETTER:
          summary.deadletter = row.count;
          break;
      }
    }

    return summary;
  });
}

async function listSubdirectories(baseDir: string): Promise<string[]> {
  try {
    const entries = await readdir(baseDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(baseDir, entry.name));
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

export async function rebuildIndexForProfile(
  options: {
    profileId: string;
    accountEmail: string;
    messagesDir: string;
    sentMessagesDir: string;
    mailbox?: string;
    databaseFile?: string;
  }
): Promise<RebuildIndexResult> {
  const result: RebuildIndexResult = {
    inboundIndexed: 0,
    outboundIndexed: 0,
    inboundSkipped: 0,
    outboundSkipped: 0
  };

  const messageDirs = await listSubdirectories(options.messagesDir);
  for (const messageDir of messageDirs) {
    const rawMetadata = await readJsonFile(path.join(messageDir, "metadata.json"));
    const metadata = normalizeSavedMessageMetadata(rawMetadata, {
      profileId: options.profileId,
      accountEmail: options.accountEmail,
      mailbox: options.mailbox ?? "INBOX"
    });

    if (!metadata) {
      result.inboundSkipped += 1;
      continue;
    }

    const recordResult = recordInboundMessage(
      {
        profileId: metadata.profileId,
        accountEmail: metadata.accountEmail,
        uid: metadata.uid,
        peerEmail: metadata.normalizedSenderEmail ?? metadata.fromEmails[0] ?? "",
        messageId: metadata.messageId,
        inReplyTo: metadata.inReplyTo,
        references: metadata.references,
        savedAt: metadata.savedAt,
        messageDir,
        metadata,
        dispatchStatus: DISPATCH_SUCCEEDED,
        dispatchAttempts: 0,
        nextDispatchAt: null
      },
      options.databaseFile
    );

    if (recordResult.inserted) {
      result.inboundIndexed += 1;
    }
  }

  const sentDirs = await listSubdirectories(options.sentMessagesDir);
  for (const messageDir of sentDirs) {
    const rawMetadata = await readJsonFile(path.join(messageDir, "metadata.json"));
    const metadata = normalizeSavedSentMessageMetadata(rawMetadata, {
      profileId: options.profileId,
      accountEmail: options.accountEmail
    });

    if (!metadata) {
      result.outboundSkipped += 1;
      continue;
    }

    const recordResult = recordOutboundMessage(
      {
        profileId: metadata.profileId,
        accountEmail: metadata.accountEmail,
        peerEmails: [
          ...metadata.toEmails,
          ...metadata.ccEmails,
          ...metadata.bccEmails
        ],
        messageId: metadata.messageId,
        inReplyTo: metadata.inReplyTo,
        references: metadata.references,
        savedAt: metadata.savedAt,
        messageDir,
        metadata
      },
      options.databaseFile
    );

    if (recordResult.inserted) {
      result.outboundIndexed += 1;
    }
  }

  return result;
}
