import type { Database } from "bun:sqlite";
import { Database as SqliteDatabase } from "bun:sqlite";
import { readFile, writeFile, chmod, open, stat, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { access } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { AGENTMAIL_DIR, AGENTMAIL_PROFILES_DIR, AGENTMAIL_DATABASE_FILE, resolveAgentmailPaths } from "../config/paths";
import type { MailBridgeDoctorReport } from "../dispatch/doctor";
import type { Logger } from "../types";

export interface ProfileInfo {
  id: string;
  accountEmail: string;
  enabled: boolean;
  updatedAt: string;
}

export interface SessionInfo {
  sessionId: string;
  profileId: string;
  peerEmail: string;
  messageCount: number;
  lastSubject: string | null;
  lastMessageAt: string | null;
}

export interface SenderInfo {
  peerEmail: string;
  profiles: string[];
  totalMessages: number;
  lastMessageAt: string | null;
}

export interface MessageBody {
  text: string | null;
  html: string | null;
}

export interface DispatchSummary {
  pending: number;
  running: number;
  failed: number;
  succeeded: number;
  deadletter: number;
  stalled: number;
}

export interface DispatchQueueItem {
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

export function getDispatchSummary(db: Database): DispatchSummary {
  const rows = db
    .query("SELECT dispatch_status, COUNT(*) AS count FROM inbound_messages GROUP BY dispatch_status")
    .all() as Array<{ dispatch_status: string; count: number }>;

  const summary: DispatchSummary = {
    pending: 0,
    running: 0,
    failed: 0,
    succeeded: 0,
    deadletter: 0,
    stalled: 0
  };

  for (const row of rows) {
    const key = row.dispatch_status as keyof DispatchSummary;
    if (key in summary) {
      summary[key] = row.count;
    }
  }

  const threshold = new Date(Date.now() - 60_000).toISOString();
  const stalledRow = db
    .query("SELECT COUNT(*) AS count FROM inbound_messages WHERE dispatch_status = 'pending' AND saved_at <= ?")
    .get(threshold) as { count: number } | null;
  summary.stalled = stalledRow?.count ?? 0;

  return summary;
}

export function listDispatchQueueItems(
  db: Database,
  options: { statuses?: string[]; includeStalled?: boolean; limit?: number }
): DispatchQueueItem[] {
  const orClauses: string[] = [];
  const params: (string | number)[] = [];
  const limit = options.limit ?? 50;

  if (options.statuses && options.statuses.length > 0) {
    const placeholders = options.statuses.map(() => "?").join(", ");
    orClauses.push(`dispatch_status IN (${placeholders})`);
    params.push(...options.statuses);
  }

  if (options.includeStalled) {
    const threshold = new Date(Date.now() - 60_000).toISOString();
    orClauses.push("(dispatch_status = 'pending' AND saved_at <= ?)");
    params.push(threshold);
  }

  const whereClause = orClauses.length > 0 ? `WHERE ${orClauses.join(" OR ")}` : "";

  const rows = db
    .query(
      `
      SELECT
        id, profile_id, session_id, peer_email,
        dispatch_status, dispatch_attempts,
        saved_at, dispatch_started_at, dispatch_finished_at,
        next_dispatch_at, last_dispatch_error,
        message_dir, metadata_json
      FROM inbound_messages
      ${whereClause}
      ORDER BY saved_at DESC
      LIMIT ?
    `
    )
    .all(...params, limit) as Array<{
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
  }>;

  return rows.map((row) => {
    let subject: string | null = null;
    try {
      const meta = JSON.parse(row.metadata_json);
      subject = meta.subject ?? null;
    } catch {}

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
      subject
    };
  });
}

export function retryDispatchJobs(
  db: Database,
  options: { includeDeadletter?: boolean }
): number {
  const targetStatuses = ["failed"];
  if (options.includeDeadletter) {
    targetStatuses.push("deadletter");
  }
  const placeholders = targetStatuses.map(() => "?").join(", ");

  const result = db
    .query(
      `
      UPDATE inbound_messages
      SET dispatch_status = 'failed',
          next_dispatch_at = '1970-01-01T00:00:00.000Z',
          last_dispatch_error = NULL
      WHERE dispatch_status IN (${placeholders})
    `
    )
    .run(...targetStatuses);

  return result.changes;
}

export function listProfiles(db: Database): ProfileInfo[] {
  const rows = db
    .query("SELECT id, account_email, enabled, updated_at FROM profiles ORDER BY id")
    .all() as Array<{ id: string; account_email: string; enabled: number; updated_at: string }>;

  return rows.map((row) => ({
    id: row.id,
    accountEmail: row.account_email,
    enabled: row.enabled === 1,
    updatedAt: row.updated_at
  }));
}

export function listSessionsForProfile(db: Database, profileId: string): SessionInfo[] {
  const rows = db
    .query(
      `
      SELECT
        ms.id AS session_id,
        ms.profile_id,
        ms.peer_email,
        (
          (SELECT COUNT(*) FROM inbound_messages WHERE session_id = ms.id) +
          (SELECT COUNT(*) FROM outbound_messages WHERE session_id = ms.id)
        ) AS message_count,
        (
          SELECT json_extract(sub.metadata_json, '$.subject')
          FROM (
            SELECT metadata_json, saved_at FROM inbound_messages WHERE session_id = ms.id
            UNION ALL
            SELECT metadata_json, saved_at FROM outbound_messages WHERE session_id = ms.id
          ) sub
          ORDER BY sub.saved_at DESC
          LIMIT 1
        ) AS last_subject,
        (
          SELECT MAX(sub2.saved_at)
          FROM (
            SELECT saved_at FROM inbound_messages WHERE session_id = ms.id
            UNION ALL
            SELECT saved_at FROM outbound_messages WHERE session_id = ms.id
          ) sub2
        ) AS last_message_at
      FROM mail_sessions ms
      WHERE ms.profile_id = ?
      ORDER BY last_message_at DESC NULLS LAST
    `
    )
    .all(profileId) as Array<{
    session_id: string;
    profile_id: string;
    peer_email: string;
    message_count: number;
    last_subject: string | null;
    last_message_at: string | null;
  }>;

  return rows.map((row) => ({
    sessionId: row.session_id,
    profileId: row.profile_id,
    peerEmail: row.peer_email,
    messageCount: row.message_count,
    lastSubject: row.last_subject,
    lastMessageAt: row.last_message_at
  }));
}

export function listAllSenders(db: Database): SenderInfo[] {
  const rows = db
    .query(
      `
      SELECT
        peer_email,
        GROUP_CONCAT(DISTINCT profile_id) AS profiles,
        COUNT(*) AS total_messages,
        MAX(saved_at) AS last_message_at
      FROM inbound_messages
      GROUP BY peer_email
      ORDER BY last_message_at DESC
    `
    )
    .all() as Array<{
    peer_email: string;
    profiles: string;
    total_messages: number;
    last_message_at: string | null;
  }>;

  return rows.map((row) => ({
    peerEmail: row.peer_email,
    profiles: row.profiles ? row.profiles.split(",") : [],
    totalMessages: row.total_messages,
    lastMessageAt: row.last_message_at
  }));
}

export function listSessionsForSender(db: Database, peerEmail: string): SessionInfo[] {
  const rows = db
    .query(
      `
      SELECT
        ms.id AS session_id,
        ms.profile_id,
        ms.peer_email,
        (
          (SELECT COUNT(*) FROM inbound_messages WHERE session_id = ms.id) +
          (SELECT COUNT(*) FROM outbound_messages WHERE session_id = ms.id)
        ) AS message_count,
        (
          SELECT json_extract(sub.metadata_json, '$.subject')
          FROM (
            SELECT metadata_json, saved_at FROM inbound_messages WHERE session_id = ms.id
            UNION ALL
            SELECT metadata_json, saved_at FROM outbound_messages WHERE session_id = ms.id
          ) sub
          ORDER BY sub.saved_at DESC
          LIMIT 1
        ) AS last_subject,
        (
          SELECT MAX(sub2.saved_at)
          FROM (
            SELECT saved_at FROM inbound_messages WHERE session_id = ms.id
            UNION ALL
            SELECT saved_at FROM outbound_messages WHERE session_id = ms.id
          ) sub2
        ) AS last_message_at
      FROM mail_sessions ms
      WHERE ms.peer_email = ?
      ORDER BY last_message_at DESC NULLS LAST
    `
    )
    .all(peerEmail) as Array<{
    session_id: string;
    profile_id: string;
    peer_email: string;
    message_count: number;
    last_subject: string | null;
    last_message_at: string | null;
  }>;

  return rows.map((row) => ({
    sessionId: row.session_id,
    profileId: row.profile_id,
    peerEmail: row.peer_email,
    messageCount: row.message_count,
    lastSubject: row.last_subject,
    lastMessageAt: row.last_message_at
  }));
}

export async function readAttachment(
  messageDir: string,
  relativePath: string
): Promise<{ data: Buffer; filename: string }> {
  const resolvedDir = path.resolve(messageDir);
  if (!resolvedDir.startsWith(AGENTMAIL_DIR + path.sep)) {
    throw new Error("Invalid message directory");
  }

  const fullPath = path.resolve(resolvedDir, relativePath);
  if (!fullPath.startsWith(resolvedDir + path.sep)) {
    throw new Error("Invalid attachment path");
  }

  const data = await readFile(fullPath);
  const filename = path.basename(fullPath);
  return { data: Buffer.from(data), filename };
}

export async function readMessageBody(messageDir: string): Promise<MessageBody> {
  const resolved = path.resolve(messageDir);
  if (!resolved.startsWith(AGENTMAIL_DIR + path.sep)) {
    throw new Error("Invalid message directory");
  }

  let text: string | null = null;
  let html: string | null = null;

  try {
    text = await readFile(path.join(resolved, "body.txt"), "utf8");
  } catch {}

  try {
    html = await readFile(path.join(resolved, "body.html"), "utf8");
  } catch {}

  return { text, html };
}

// --- OpenClaw & Apollo integration ---

const OPENCLAW_DIR = path.join(os.homedir(), ".openclaw");
const APOLLO_USAGE_DB = path.join(OPENCLAW_DIR, "metering", "apollo-usage.sqlite");
const DISPATCH_CONFIG_FILE = path.join(OPENCLAW_DIR, "mail-dispatch", "config.json");
const BRIDGE_LOG_FILE = path.join(AGENTMAIL_DIR, "logs", "bridge.log");

export interface OpenClawMailSession {
  sessionKey: string;
  agentId: string;
  peerEmail: string;
  parentKey: string | null;
  sessionId: string | null;
  model: string | null;
  modelProvider: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  contextTokens: number;
  turns: number;
  cost: number;
  updatedAt: number;
}

export interface OpenClawUsageTotals {
  totalSessions: number;
  totalTokens: number;
  totalCost: number;
  byAgent: Array<{ agentId: string; sessions: number; cost: number; tokens: number }>;
  byChannel: Array<{ channel: string; sessions: number; cost: number }>;
}

export interface ApolloUsageEntry {
  id: number;
  timestamp: string;
  agentId: string;
  callerId: string;
  command: string;
  endpoint: string;
  estimatedCredits: number;
  recordsCount: number;
  pagesFetched: number;
  dryRun: boolean;
}

export interface ApolloUsageSummary {
  totalCredits: number;
  totalRecords: number;
  byAgent: Array<{ agentId: string; credits: number; records: number; calls: number }>;
  byCallerAgent: Array<{
    callerId: string;
    agentId: string;
    credits: number;
    records: number;
    calls: number;
  }>;
  recentEntries: ApolloUsageEntry[];
}

export interface BridgeLogEntry {
  timestamp: string;
  level: string;
  action: string;
  profileId: string | null;
  peerEmail: string | null;
  sessionKey: string | null;
  message: string;
  extra: Record<string, unknown>;
}

export interface DispatchBinding {
  profileId: string;
  agentId: string;
  enabled: boolean;
}

export async function getDispatchBindings(): Promise<DispatchBinding[]> {
  try {
    const content = await readFile(DISPATCH_CONFIG_FILE, "utf8");
    const config = JSON.parse(content) as {
      accounts?: Record<string, { agentId: string; enabled?: boolean }>;
    };
    if (!config.accounts) return [];
    return Object.entries(config.accounts).map(([profileId, binding]) => ({
      profileId,
      agentId: binding.agentId,
      enabled: binding.enabled !== false
    }));
  } catch {
    return [];
  }
}

interface SessionJsonlUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  cost?: { total?: number };
}

async function readSessionJsonlUsage(
  agentId: string,
  sessionId: string
): Promise<{ turns: number; input: number; output: number; cacheRead: number; cacheWrite: number; total: number; cost: number }> {
  const result = { turns: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, cost: 0 };
  const filePath = path.join(OPENCLAW_DIR, "agents", agentId, "sessions", `${sessionId}.jsonl`);

  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    return result;
  }

  for (const line of content.split("\n")) {
    if (!line.includes('"usage"')) continue;
    try {
      const parsed = JSON.parse(line) as {
        usage?: SessionJsonlUsage;
        message?: { usage?: SessionJsonlUsage };
      };
      const u = parsed.usage ?? parsed.message?.usage;
      if (!u) continue;
      result.turns++;
      result.input += u.input ?? 0;
      result.output += u.output ?? 0;
      result.cacheRead += u.cacheRead ?? 0;
      result.cacheWrite += u.cacheWrite ?? 0;
      result.total += u.totalTokens ?? 0;
      result.cost += u.cost?.total ?? 0;
    } catch {}
  }

  return result;
}

export interface OpenClawSessionsResult {
  mailSessions: OpenClawMailSession[];
  relatedSessions: OpenClawMailSession[];
  totals: OpenClawUsageTotals;
}

async function readSpawnedByMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const agentsDir = path.join(OPENCLAW_DIR, "agents");
  let agentDirs: string[];
  try {
    agentDirs = (await readdir(agentsDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return map;
  }

  await Promise.all(
    agentDirs.map(async (agentName) => {
      const storePath = path.join(agentsDir, agentName, "sessions", "sessions.json");
      try {
        const raw = JSON.parse(await readFile(storePath, "utf8")) as Record<
          string,
          { spawnedBy?: string }
        >;
        for (const [key, entry] of Object.entries(raw)) {
          if (entry.spawnedBy) {
            map.set(key, entry.spawnedBy);
          }
        }
      } catch {}
    })
  );

  return map;
}

function resolveMailEmail(key: string): string | null {
  // agent:sales-v2:mail:user@example.com → user@example.com
  const mailIdx = key.indexOf(":mail:");
  if (mailIdx !== -1) return key.slice(mailIdx + 6);
  return null;
}

function extractMailHash(key: string): string | null {
  // agent:sales:mail-0d2309e79292 → 0d2309e79292
  const match = key.match(/:mail-([a-f0-9]+)$/);
  return match ? match[1] : null;
}

async function readOpenClawGatewayConfig(): Promise<{ url?: string; token?: string }> {
  try {
    const raw = JSON.parse(
      await readFile(path.join(OPENCLAW_DIR, "openclaw.json"), "utf8")
    ) as { gateway?: { port?: number; auth?: { token?: string } } };
    const port = raw.gateway?.port;
    return {
      url: port ? `ws://127.0.0.1:${port}` : undefined,
      token: raw.gateway?.auth?.token ?? undefined
    };
  } catch {
    return {};
  }
}

function runOpenClawCommand(args: string[], timeoutMs = 30_000): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("openclaw", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on("error", () => resolve(null));
    child.on("close", (code) => resolve(code === 0 ? stdout : null));
    setTimeout(() => {
      child.kill();
      resolve(null);
    }, timeoutMs);
  });
}

export async function getOpenClawMailSessions(): Promise<OpenClawSessionsResult> {
  // Load dispatch bindings, spawnedBy map, and hash→email lookup
  const bindingsData = await getDispatchBindings();
  const boundAgentIds = new Set(bindingsData.map((b) => b.agentId));
  const spawnedByMap = await readSpawnedByMap();

  // Build hash→email map from agentmail DB for old-format session keys
  const hashToEmail = new Map<string, string>();
  try {
    const { openDatabase: openDb } = await import("../storage/database");
    const tmpDb = openDb();
    try {
      const rows = tmpDb
        .query("SELECT id, peer_email FROM mail_sessions")
        .all() as Array<{ id: string; peer_email: string }>;
      for (const row of rows) {
        // id format: mail:profileId:hash
        const parts = row.id.split(":");
        const hash = parts[parts.length - 1];
        if (hash) hashToEmail.set(hash, row.peer_email);
      }
    } finally {
      tmpDb.close();
    }
  } catch {}

  const emptyResult: OpenClawSessionsResult = {
    mailSessions: [],
    relatedSessions: [],
    totals: { totalSessions: 0, totalTokens: 0, totalCost: 0, byAgent: [], byChannel: [] }
  };

  // Use the gateway sessions.usage API for authoritative cost data
  const gw = await readOpenClawGatewayConfig();
  const gwArgs = [
    "gateway", "call", "sessions.usage", "--json", "--timeout", "25000",
    "--params", JSON.stringify({ limit: 500 })
  ];
  if (gw.url) gwArgs.push("--url", gw.url);
  if (gw.token) gwArgs.push("--token", gw.token);

  const raw = await runOpenClawCommand(gwArgs);
  if (!raw) return emptyResult;

  try {
    const data = JSON.parse(raw) as {
      totals?: { totalCost?: number; totalTokens?: number };
      sessions?: Array<{
        key?: string;
        agentId?: string;
        sessionId?: string;
        model?: string;
        modelProvider?: string;
        channel?: string;
        chatType?: string;
        updatedAt?: number;
        usage?: {
          totalCost?: number;
          totalTokens?: number;
          input?: number;
          output?: number;
          cacheRead?: number;
          cacheWrite?: number;
          messageCount?: number;
          messageCounts?: { total?: number; user?: number; assistant?: number; toolCalls?: number };
        };
      }>;
    };

    const allSessions = data.sessions ?? [];

    // Aggregate totals ourselves from per-session data
    const agentMap: Record<string, { sessions: number; cost: number; tokens: number }> = {};
    const channelMap: Record<string, { sessions: number; cost: number }> = {};
    let grandCost = 0;
    let grandTokens = 0;

    for (const s of allSessions) {
      const agent = s.agentId ?? "unknown";
      const cost = s.usage?.totalCost ?? 0;
      const tokens = s.usage?.totalTokens ?? 0;
      const isMail = s.key?.includes(":mail:");
      const channel = isMail ? "mail" : (s.channel ?? s.chatType ?? "other");

      grandCost += cost;
      grandTokens += tokens;

      if (!agentMap[agent]) agentMap[agent] = { sessions: 0, cost: 0, tokens: 0 };
      agentMap[agent].sessions++;
      agentMap[agent].cost += cost;
      agentMap[agent].tokens += tokens;

      if (!channelMap[channel]) channelMap[channel] = { sessions: 0, cost: 0 };
      channelMap[channel].sessions++;
      channelMap[channel].cost += cost;
    }

    const totals: OpenClawUsageTotals = {
      totalSessions: allSessions.length,
      totalTokens: grandTokens,
      totalCost: grandCost,
      byAgent: Object.entries(agentMap)
        .map(([agentId, v]) => ({ agentId, ...v }))
        .sort((a, b) => b.cost - a.cost),
      byChannel: Object.entries(channelMap)
        .map(([channel, v]) => ({ channel, ...v }))
        .sort((a, b) => b.cost - a.cost)
    };

    // Resolve email from a session key: try :mail:email, then mail-hash, then walk spawnedBy
    function resolveEmailFromKey(key: string): string | null {
      const visited = new Set<string>();
      let current = key;
      while (current && !visited.has(current)) {
        visited.add(current);
        const email = resolveMailEmail(current);
        if (email) return email;
        const hash = extractMailHash(current);
        if (hash) {
          const mapped = hashToEmail.get(hash);
          if (mapped) return mapped;
        }
        const parent = spawnedByMap.get(current);
        if (!parent) return null;
        current = parent;
      }
      return null;
    }

    // Classify sessions
    function toSessionObj(
      s: (typeof allSessions)[0],
      peerEmail: string,
      parentKey: string | null
    ): OpenClawMailSession {
      const u = s.usage ?? {};
      const turns = u.messageCounts?.assistant ?? u.messageCount ?? 0;
      return {
        sessionKey: s.key ?? "",
        agentId: s.agentId ?? "unknown",
        peerEmail,
        parentKey,
        sessionId: s.sessionId ?? null,
        model: s.model ?? null,
        modelProvider: s.modelProvider ?? null,
        inputTokens: u.input ?? 0,
        outputTokens: u.output ?? 0,
        cacheReadTokens: u.cacheRead ?? 0,
        cacheWriteTokens: u.cacheWrite ?? 0,
        totalTokens: u.totalTokens ?? 0,
        contextTokens: 0,
        turns,
        cost: u.totalCost ?? 0,
        updatedAt: s.updatedAt ?? 0
      };
    }

    const mailSessions: OpenClawMailSession[] = [];
    const relatedSessions: OpenClawMailSession[] = [];

    for (const s of allSessions) {
      const key = s.key ?? "";
      const agent = s.agentId ?? "unknown";
      const isTelegram =
        (s.channel ?? s.chatType ?? "") === "telegram" || key.includes(":telegram:");

      if (isTelegram) continue;

      // Try to resolve to a user email via :mail:, mail-hash, or spawnedBy chain
      const email = resolveEmailFromKey(key);

      // Direct mail session (has :mail: in key)
      const directEmail = resolveMailEmail(key);
      if (directEmail) {
        mailSessions.push(toSessionObj(s, directEmail, null));
        continue;
      }

      // Old-format mail session (mail-hash) or subagent/CLI with resolved parent
      if (email) {
        const parentKey = spawnedByMap.get(key) ?? null;
        relatedSessions.push(toSessionObj(s, email, parentKey));
        continue;
      }

      // Bound agent, no attribution possible
      if (boundAgentIds.has(agent)) {
        relatedSessions.push(toSessionObj(s, "(unattributed)", null));
      }
    }

    return { mailSessions, relatedSessions, totals };
  } catch {
    return emptyResult;
  }
}

export function getApolloUsageSummary(): ApolloUsageSummary {
  const empty: ApolloUsageSummary = {
    totalCredits: 0,
    totalRecords: 0,
    byAgent: [],
    byCallerAgent: [],
    recentEntries: []
  };

  let db: InstanceType<typeof SqliteDatabase>;
  try {
    db = new SqliteDatabase(APOLLO_USAGE_DB, { readonly: true });
  } catch {
    return empty;
  }

  try {
    const byAgent = db
      .query(
        `SELECT agent_id, SUM(estimated_credits) AS credits, SUM(records_count) AS records, COUNT(*) AS calls
         FROM apollo_usage WHERE dry_run = 0 GROUP BY agent_id ORDER BY credits DESC`
      )
      .all() as Array<{ agent_id: string; credits: number; records: number; calls: number }>;

    const byCallerAgent = db
      .query(
        `SELECT caller_id, agent_id, SUM(estimated_credits) AS credits, SUM(records_count) AS records, COUNT(*) AS calls
         FROM apollo_usage WHERE dry_run = 0 GROUP BY caller_id, agent_id ORDER BY credits DESC`
      )
      .all() as Array<{
      caller_id: string;
      agent_id: string;
      credits: number;
      records: number;
      calls: number;
    }>;

    const recent = db
      .query(
        `SELECT id, timestamp, agent_id, caller_id, command, endpoint, estimated_credits, records_count, pages_fetched, dry_run
         FROM apollo_usage ORDER BY id DESC LIMIT 20`
      )
      .all() as Array<{
      id: number;
      timestamp: string;
      agent_id: string;
      caller_id: string;
      command: string;
      endpoint: string;
      estimated_credits: number;
      records_count: number;
      pages_fetched: number;
      dry_run: number;
    }>;

    const totalCredits = byAgent.reduce((sum, r) => sum + r.credits, 0);
    const totalRecords = byAgent.reduce((sum, r) => sum + r.records, 0);

    return {
      totalCredits,
      totalRecords,
      byAgent: byAgent.map((r) => ({
        agentId: r.agent_id,
        credits: r.credits,
        records: r.records,
        calls: r.calls
      })),
      byCallerAgent: byCallerAgent.map((r) => ({
        callerId: r.caller_id,
        agentId: r.agent_id,
        credits: r.credits,
        records: r.records,
        calls: r.calls
      })),
      recentEntries: recent.map((r) => ({
        id: r.id,
        timestamp: r.timestamp,
        agentId: r.agent_id,
        callerId: r.caller_id,
        command: r.command,
        endpoint: r.endpoint,
        estimatedCredits: r.estimated_credits,
        recordsCount: r.records_count,
        pagesFetched: r.pages_fetched,
        dryRun: r.dry_run === 1
      }))
    };
  } finally {
    db.close();
  }
}

export async function getBridgeLogEntries(limit = 50): Promise<BridgeLogEntry[]> {
  let content: string;
  try {
    content = await readFile(BRIDGE_LOG_FILE, "utf8");
  } catch {
    return [];
  }

  const lines = content.trim().split("\n").filter(Boolean);
  const entries: BridgeLogEntry[] = [];

  for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
    try {
      const parsed = JSON.parse(lines[i]) as BridgeLogEntry;
      // Filter out test adapter entries (from bun test writing to shared bridge.log)
      if (parsed.message?.includes("test adapter")) continue;
      entries.push(parsed);
    } catch {}
  }

  return entries;
}

// --- Configuration ---

export interface ProfileConfig {
  profileId: string;
  rootDir: string;
  envValid: boolean;
  envExists: boolean;
  envIssues: string[];
  accountEmail: string | null;
  smtpHost: string | null;
  imapHost: string | null;
  pollingConfigured: boolean;
  pollingMailbox: string | null;
  pollingInterval: number | null;
  hookExists: boolean;
  watcherLockExists: boolean;
  dispatchBinding: { agentId: string; enabled: boolean } | null;
  messageCount: { inbound: number; outbound: number };
}

export interface OpenClawAgentConfig {
  id: string;
  name: string | null;
  model: string | null;
  workspace: string | null;
  agentDir: string | null;
  identity: { name?: string; theme?: string; emoji?: string } | null;
}

export interface ServiceStatus {
  label: string;
  kind: string;
  profileId: string | null;
  installed: boolean;
  loaded: boolean;
  plistPath: string;
}

export interface SystemConfig {
  profiles: ProfileConfig[];
  dispatchWorker: { pollIntervalMs: number; maxConcurrentSessions: number } | null;
  openclawAgents: OpenClawAgentConfig[];
  services: ServiceStatus[];
  gatewayPort: number | null;
  databasePath: string;
  databaseSizeMB: number | null;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJsonSafe(p: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(p, "utf8"));
  } catch {
    return null;
  }
}

async function loadProfileConfig(
  profileId: string,
  rootDir: string,
  bindings: Record<string, { agentId: string; enabled: boolean }>,
  db: Database
): Promise<ProfileConfig> {
  const envPath = path.join(rootDir, ".env");
  const pollingPath = path.join(rootDir, "polling.json");
  const hookPath = path.join(rootDir, "hooks", "on_recieve.sh");
  const lockPath = path.join(rootDir, "receive-watch.lock");

  const envExists = await fileExists(envPath);
  let envValid = false;
  const envIssues: string[] = [];
  let accountEmail: string | null = null;
  let smtpHost: string | null = null;
  let imapHost: string | null = null;

  if (envExists) {
    try {
      const { validateEnvFile } = await import("../config/env");
      const result = await validateEnvFile(envPath);
      envValid = result.isValid;
      envIssues.push(...result.missingKeys.map((k: string) => "missing: " + k), ...result.issues);
      if (envValid) {
        const { loadMailEnvConfig } = await import("../config/env");
        const cfg = await loadMailEnvConfig(envPath);
        accountEmail = cfg.email;
        smtpHost = cfg.smtp.host;
        imapHost = cfg.imap.host;
      }
    } catch (e) {
      envIssues.push(e instanceof Error ? e.message : String(e));
    }
  }

  const pollingRaw = (await readJsonSafe(pollingPath)) as {
    mailbox?: string;
    intervalSeconds?: number;
  } | null;

  const hookExists = await fileExists(hookPath);
  const watcherLockExists = await fileExists(lockPath);

  const binding = bindings[profileId] ?? null;

  const inboundCount = (
    db
      .query("SELECT COUNT(*) AS c FROM inbound_messages WHERE profile_id = ?")
      .get(profileId) as { c: number } | null
  )?.c ?? 0;
  const outboundCount = (
    db
      .query("SELECT COUNT(*) AS c FROM outbound_messages WHERE profile_id = ?")
      .get(profileId) as { c: number } | null
  )?.c ?? 0;

  return {
    profileId,
    rootDir,
    envValid,
    envExists,
    envIssues,
    accountEmail,
    smtpHost,
    imapHost,
    pollingConfigured: pollingRaw !== null,
    pollingMailbox: pollingRaw?.mailbox ?? null,
    pollingInterval: pollingRaw?.intervalSeconds ?? null,
    hookExists,
    watcherLockExists,
    dispatchBinding: binding,
    messageCount: { inbound: inboundCount, outbound: outboundCount }
  };
}

export async function getSystemConfig(db: Database): Promise<SystemConfig> {
  // Load dispatch config
  const dispatchRaw = (await readJsonSafe(
    path.join(os.homedir(), ".openclaw", "mail-dispatch", "config.json")
  )) as {
    accounts?: Record<string, { agentId: string; enabled?: boolean }>;
    worker?: { pollIntervalMs?: number; maxConcurrentSessions?: number };
  } | null;

  const bindings: Record<string, { agentId: string; enabled: boolean }> = {};
  if (dispatchRaw?.accounts) {
    for (const [pid, b] of Object.entries(dispatchRaw.accounts)) {
      bindings[pid] = { agentId: b.agentId, enabled: b.enabled !== false };
    }
  }

  // Discover profiles
  const profileIds: Array<{ id: string; rootDir: string }> = [];

  // Default profile
  if (await fileExists(path.join(AGENTMAIL_DIR, ".env"))) {
    profileIds.push({ id: "default", rootDir: AGENTMAIL_DIR });
  }

  // Named profiles
  try {
    const entries = await readdir(AGENTMAIL_PROFILES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        profileIds.push({
          id: entry.name,
          rootDir: path.join(AGENTMAIL_PROFILES_DIR, entry.name)
        });
      }
    }
  } catch {}

  // Also include profiles from bindings that might not have directories yet
  for (const pid of Object.keys(bindings)) {
    if (!profileIds.find((p) => p.id === pid)) {
      const rootDir = path.join(AGENTMAIL_PROFILES_DIR, pid);
      profileIds.push({ id: pid, rootDir });
    }
  }

  const profiles = await Promise.all(
    profileIds.map((p) => loadProfileConfig(p.id, p.rootDir, bindings, db))
  );
  profiles.sort((a, b) => a.profileId.localeCompare(b.profileId));

  // OpenClaw agents
  const openclawConfig = (await readJsonSafe(
    path.join(os.homedir(), ".openclaw", "openclaw.json")
  )) as {
    agents?: {
      list?: Array<{
        id?: string;
        name?: string;
        model?: string;
        workspace?: string;
        agentDir?: string;
        identity?: { name?: string; theme?: string; emoji?: string };
      }>;
    };
    gateway?: { port?: number };
  } | null;

  const openclawAgents: OpenClawAgentConfig[] = (openclawConfig?.agents?.list ?? []).map((a) => ({
    id: a.id ?? "unknown",
    name: a.name ?? null,
    model: a.model ?? null,
    workspace: a.workspace ?? null,
    agentDir: a.agentDir ?? null,
    identity: a.identity ?? null
  }));

  // Service status
  let services: ServiceStatus[] = [];
  try {
    const { getLaunchdServiceStatus } = await import("../service/launchd");
    services = (await getLaunchdServiceStatus()).map((s) => ({
      label: s.label,
      kind: s.kind,
      profileId: s.profileId,
      installed: s.installed,
      loaded: s.loaded,
      plistPath: s.plistPath
    }));
  } catch {}

  // Database size
  let databaseSizeMB: number | null = null;
  try {
    const { stat } = await import("node:fs/promises");
    const st = await stat(AGENTMAIL_DATABASE_FILE);
    databaseSizeMB = Math.round((st.size / (1024 * 1024)) * 100) / 100;
  } catch {}

  return {
    profiles,
    dispatchWorker: dispatchRaw?.worker
      ? {
          pollIntervalMs: dispatchRaw.worker.pollIntervalMs ?? 1000,
          maxConcurrentSessions: dispatchRaw.worker.maxConcurrentSessions ?? 4
        }
      : null,
    openclawAgents,
    services,
    gatewayPort: openclawConfig?.gateway?.port ?? null,
    databasePath: AGENTMAIL_DATABASE_FILE,
    databaseSizeMB
  };
}

// --- Configuration page query functions ---

const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {}
};

export type DoctorReport = MailBridgeDoctorReport;

export async function runDoctor(db: Database): Promise<DoctorReport> {
  const { runMailBridgeDoctor } = await import("../dispatch/doctor");
  const { DEFAULT_MAIL_DISPATCH_CONFIG_FILE } = await import("../dispatch/worker");
  return runMailBridgeDoctor({
    configFilePath: DEFAULT_MAIL_DISPATCH_CONFIG_FILE,
    databaseFile: AGENTMAIL_DATABASE_FILE
  });
}

export async function tailLogFile(
  profileId: string,
  logType: "receive" | "dispatch" | "bridge",
  lines: number
): Promise<string[]> {
  const logsDir = path.join(AGENTMAIL_DIR, "logs");
  let filename: string;

  switch (logType) {
    case "receive":
      filename = `receive-${profileId.replace(/@/g, "-")}.log`;
      break;
    case "dispatch":
      filename = "dispatch.log";
      break;
    case "bridge":
      filename = "bridge.log";
      break;
  }

  const logPath = path.resolve(logsDir, filename);
  if (!logPath.startsWith(AGENTMAIL_DIR + path.sep)) {
    throw new Error("Invalid log path");
  }

  let fileHandle;
  try {
    const fileStat = await stat(logPath);
    const chunkSize = Math.min(fileStat.size, 102400); // last 100KB
    fileHandle = await open(logPath, "r");
    const buffer = Buffer.alloc(chunkSize);
    const offset = Math.max(0, fileStat.size - chunkSize);
    await fileHandle.read(buffer, 0, chunkSize, offset);
    const content = buffer.toString("utf8");
    const allLines = content.split("\n").filter(Boolean);
    return allLines.slice(-lines);
  } catch (error) {
    const ioError = error as NodeJS.ErrnoException;
    if (ioError.code === "ENOENT") {
      return [];
    }
    throw error;
  } finally {
    await fileHandle?.close();
  }
}

export async function triggerPoll(
  profileId: string
): Promise<{ mailbox: string; found: number; saved: number; seenMarked: number; failed: number }> {
  const { receiveOnce, resolveMailboxForReceive } = await import("../receive/receiveOnce");
  const paths = resolveAgentmailPaths(profileId === "default" ? undefined : profileId);

  const result = await receiveOnce({
    profileId,
    logger: silentLogger,
    envFilePath: paths.envFile,
    pollingFilePath: paths.pollingConfigFile,
    messagesDir: paths.messagesDir,
    hookFilePath: paths.onRecieveHookFile,
    databaseFile: paths.databaseFile
  });

  return result;
}

export async function getProfileEnvDetails(
  profileId: string
): Promise<{
  exists: boolean;
  valid: boolean;
  email?: string;
  smtpHost?: string;
  smtpPort?: number;
  imapHost?: string;
  imapPort?: number;
  issues: string[];
}> {
  const paths = resolveAgentmailPaths(profileId === "default" ? undefined : profileId);
  const { validateEnvFile, loadMailEnvConfig } = await import("../config/env");

  const validation = await validateEnvFile(paths.envFile);
  if (!validation.exists) {
    return { exists: false, valid: false, issues: ["Env file not found"] };
  }

  if (!validation.isValid) {
    const issues = [
      ...validation.missingKeys.map((k: string) => `missing: ${k}`),
      ...validation.issues
    ];
    return { exists: true, valid: false, issues };
  }

  try {
    const cfg = await loadMailEnvConfig(paths.envFile);
    return {
      exists: true,
      valid: true,
      email: cfg.email,
      smtpHost: cfg.smtp.host,
      smtpPort: cfg.smtp.port,
      imapHost: cfg.imap.host,
      imapPort: cfg.imap.port,
      issues: []
    };
  } catch (e) {
    return {
      exists: true,
      valid: false,
      issues: [e instanceof Error ? e.message : String(e)]
    };
  }
}

export async function updatePollingConfig(
  profileId: string,
  mailbox?: string,
  intervalSeconds?: number
): Promise<{ mailbox: string; intervalSeconds: number }> {
  const { writePollingConfig } = await import("../config/polling");
  const paths = resolveAgentmailPaths(profileId === "default" ? undefined : profileId);
  const config = await writePollingConfig(
    { mailbox, intervalSeconds },
    paths.pollingConfigFile
  );
  return { mailbox: config.mailbox, intervalSeconds: config.intervalSeconds };
}

export async function updateDispatchBinding(
  profileId: string,
  agentId: string,
  enabled: boolean
): Promise<void> {
  const { bindDispatchAccount } = await import("../dispatch/config");
  await bindDispatchAccount({
    profile: profileId,
    agentId,
    enabled
  });
}

export async function rebuildProfileIndex(
  profileId: string
): Promise<{ inboundIndexed: number; outboundIndexed: number; inboundSkipped: number; outboundSkipped: number }> {
  const { rebuildIndexForProfile } = await import("../storage/database");
  const { loadMailEnvConfig } = await import("../config/env");
  const paths = resolveAgentmailPaths(profileId === "default" ? undefined : profileId);

  let accountEmail = profileId;
  try {
    const cfg = await loadMailEnvConfig(paths.envFile);
    accountEmail = cfg.email;
  } catch {}

  return rebuildIndexForProfile({
    profileId,
    accountEmail,
    messagesDir: paths.messagesDir,
    sentMessagesDir: paths.sentMessagesDir,
    databaseFile: paths.databaseFile
  });
}

export async function getDatabaseStats(
  db: Database
): Promise<{ tables: Array<{ name: string; rowCount: number }>; sizeMB: number; walSizeMB: number }> {
  const tableRows = db
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as Array<{ name: string }>;

  const tables: Array<{ name: string; rowCount: number }> = [];
  for (const row of tableRows) {
    const countRow = db.query(`SELECT COUNT(*) AS c FROM "${row.name}"`).get() as { c: number } | null;
    tables.push({ name: row.name, rowCount: countRow?.c ?? 0 });
  }

  let sizeMB = 0;
  let walSizeMB = 0;
  try {
    const st = await stat(AGENTMAIL_DATABASE_FILE);
    sizeMB = Math.round((st.size / (1024 * 1024)) * 100) / 100;
  } catch {}
  try {
    const walSt = await stat(AGENTMAIL_DATABASE_FILE + "-wal");
    walSizeMB = Math.round((walSt.size / (1024 * 1024)) * 100) / 100;
  } catch {}

  return { tables, sizeMB, walSizeMB };
}

export async function getHookContent(
  profileId: string
): Promise<{ exists: boolean; content: string | null; path: string }> {
  const paths = resolveAgentmailPaths(profileId === "default" ? undefined : profileId);
  const hookPath = paths.onRecieveHookFile;

  try {
    const content = await readFile(hookPath, "utf8");
    return { exists: true, content, path: hookPath };
  } catch (error) {
    const ioError = error as NodeJS.ErrnoException;
    if (ioError.code === "ENOENT") {
      return { exists: false, content: null, path: hookPath };
    }
    throw error;
  }
}

export async function saveHookContent(profileId: string, content: string): Promise<void> {
  const paths = resolveAgentmailPaths(profileId === "default" ? undefined : profileId);
  const hookPath = paths.onRecieveHookFile;
  await mkdir(paths.hooksDir, { recursive: true });
  await writeFile(hookPath, content, "utf8");
  await chmod(hookPath, 0o755);
}

export async function installServices(): Promise<
  Array<{ label: string; kind: string; profileId: string | null }>
> {
  const { installLaunchdServices } = await import("../service/launchd");
  const definitions = await installLaunchdServices();
  return definitions.map((d) => ({
    label: d.label,
    kind: d.kind,
    profileId: d.profileId
  }));
}

export async function uninstallServices(): Promise<Array<{ label: string; kind: string }>> {
  const { uninstallLaunchdServices } = await import("../service/launchd");
  const definitions = await uninstallLaunchdServices();
  return definitions.map((d) => ({
    label: d.label,
    kind: d.kind
  }));
}

export async function sendTestEmail(
  profileId: string,
  to: string,
  subject: string,
  text: string
): Promise<{ messageId: string }> {
  const { sendMail } = await import("../send/sendMail");
  const paths = resolveAgentmailPaths(profileId === "default" ? undefined : profileId);
  return sendMail(
    { to: [to], subject, text },
    silentLogger,
    {
      envFilePath: paths.envFile,
      sentMessagesDir: paths.sentMessagesDir,
      profileId,
      databaseFile: paths.databaseFile
    }
  );
}

export async function getStorageStats(): Promise<
  Array<{ profileId: string; messagesCount: number; sentCount: number; messagesSizeMB: number; sentSizeMB: number }>
> {
  const results: Array<{
    profileId: string;
    messagesCount: number;
    sentCount: number;
    messagesSizeMB: number;
    sentSizeMB: number;
  }> = [];

  const profileDirs: Array<{ profileId: string; rootDir: string }> = [];

  // Default profile
  profileDirs.push({ profileId: "default", rootDir: AGENTMAIL_DIR });

  // Named profiles
  try {
    const entries = await readdir(AGENTMAIL_PROFILES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        profileDirs.push({
          profileId: entry.name,
          rootDir: path.join(AGENTMAIL_PROFILES_DIR, entry.name)
        });
      }
    }
  } catch {}

  for (const { profileId, rootDir } of profileDirs) {
    const messagesDir = path.join(rootDir, "messages");
    const sentDir = path.join(rootDir, "sent");

    let messagesCount = 0;
    let sentCount = 0;
    let messagesSizeMB = 0;
    let sentSizeMB = 0;

    try {
      const msgEntries = await readdir(messagesDir, { withFileTypes: true });
      messagesCount = msgEntries.filter((e) => e.isDirectory()).length;
      // Estimate size from directory count (avoid walking every file)
      try {
        const dirStat = await stat(messagesDir);
        messagesSizeMB = Math.round((dirStat.size / (1024 * 1024)) * 100) / 100;
      } catch {}
    } catch {}

    try {
      const sentEntries = await readdir(sentDir, { withFileTypes: true });
      sentCount = sentEntries.filter((e) => e.isDirectory()).length;
      try {
        const dirStat = await stat(sentDir);
        sentSizeMB = Math.round((dirStat.size / (1024 * 1024)) * 100) / 100;
      } catch {}
    } catch {}

    if (messagesCount > 0 || sentCount > 0) {
      results.push({ profileId, messagesCount, sentCount, messagesSizeMB, sentSizeMB });
    }
  }

  return results;
}

export async function getWatcherInfo(
  profileId: string
): Promise<{ lockExists: boolean; pid: number | null; startedAt: string | null; alive: boolean }> {
  const paths = resolveAgentmailPaths(profileId === "default" ? undefined : profileId);
  const lockPath = paths.receiveWatchLockFile;

  try {
    const content = await readFile(lockPath, "utf8");
    const parsed = JSON.parse(content) as { pid?: unknown; startedAt?: unknown };
    const pid = typeof parsed.pid === "number" && Number.isInteger(parsed.pid) ? parsed.pid : null;
    const startedAt = typeof parsed.startedAt === "string" ? parsed.startedAt : null;

    let alive = false;
    if (pid !== null) {
      try {
        process.kill(pid, 0);
        alive = true;
      } catch (error) {
        const ioError = error as NodeJS.ErrnoException;
        if (ioError.code === "EPERM") {
          alive = true;
        }
      }
    }

    return { lockExists: true, pid, startedAt, alive };
  } catch (error) {
    const ioError = error as NodeJS.ErrnoException;
    if (ioError.code === "ENOENT") {
      return { lockExists: false, pid: null, startedAt: null, alive: false };
    }
    throw error;
  }
}

export async function createAccountProfile(input: {
  name: string;
  email?: string;
  smtpHost: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser: string;
  smtpPass: string;
  imapHost: string;
  imapPort?: number;
  imapSecure?: boolean;
  imapUser: string;
  imapPass: string;
  mailbox?: string;
  intervalSeconds?: number;
  agentId?: string;
  force?: boolean;
}): Promise<{ profile: string; accountEmail: string }> {
  const { createAccount } = await import("../account/createAccount");
  const result = await createAccount({
    name: input.name,
    email: input.email,
    smtp: {
      host: input.smtpHost,
      port: input.smtpPort ?? 465,
      secure: input.smtpSecure ?? true,
      user: input.smtpUser,
      pass: input.smtpPass
    },
    imap: {
      host: input.imapHost,
      port: input.imapPort ?? 993,
      secure: input.imapSecure ?? true,
      user: input.imapUser,
      pass: input.imapPass
    },
    mailbox: input.mailbox,
    intervalSeconds: input.intervalSeconds,
    force: input.force
  });

  if (input.agentId) {
    const { bindDispatchAccount } = await import("../dispatch/config");
    await bindDispatchAccount({
      profile: result.profile,
      agentId: input.agentId,
      enabled: true
    });
  }

  return { profile: result.profile, accountEmail: result.accountEmail };
}

export async function updateProfileEnv(
  profileId: string,
  fields: {
    email?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpSecure?: boolean;
    smtpUser?: string;
    smtpPass?: string;
    imapHost?: string;
    imapPort?: number;
    imapSecure?: boolean;
    imapUser?: string;
    imapPass?: string;
  }
): Promise<void> {
  const paths = resolveAgentmailPaths(profileId === "default" ? undefined : profileId);

  let existing: Record<string, string> = {};
  try {
    const content = await readFile(paths.envFile, "utf8");
    for (const line of content.split("\n")) {
      const eqIdx = line.indexOf("=");
      if (eqIdx > 0) {
        const key = line.slice(0, eqIdx).trim();
        let val = line.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        existing[key] = val;
      }
    }
  } catch {}

  const map: Record<string, string | undefined> = {
    AGENTMAIL_EMAIL: fields.email,
    SMTP_HOST: fields.smtpHost,
    SMTP_PORT: fields.smtpPort !== undefined ? String(fields.smtpPort) : undefined,
    SMTP_SECURE: fields.smtpSecure !== undefined ? String(fields.smtpSecure) : undefined,
    SMTP_USER: fields.smtpUser,
    SMTP_PASS: fields.smtpPass,
    IMAP_HOST: fields.imapHost,
    IMAP_PORT: fields.imapPort !== undefined ? String(fields.imapPort) : undefined,
    IMAP_SECURE: fields.imapSecure !== undefined ? String(fields.imapSecure) : undefined,
    IMAP_USER: fields.imapUser,
    IMAP_PASS: fields.imapPass
  };

  for (const [key, val] of Object.entries(map)) {
    if (val !== undefined) existing[key] = val;
  }

  const envContent = Object.entries(existing)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join("\n") + "\n";

  await mkdir(path.dirname(paths.envFile), { recursive: true });
  await writeFile(paths.envFile, envContent, "utf8");
  await chmod(paths.envFile, 0o600);
}
