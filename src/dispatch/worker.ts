import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { z } from "zod";
import type { Logger } from "../types";
import { consoleLogger } from "../types";
import { deriveOpenClawMailSessionKey, formatReplySubject } from "../mail/session";
import {
  claimDispatchJob,
  DISPATCH_DEADLETTER,
  DISPATCH_FAILED,
  DISPATCH_PENDING,
  DISPATCH_RUNNING,
  countStalledDispatchJobs,
  getDispatchStatusSummary,
  listDispatchQueue,
  listDispatchJobsReady,
  markDispatchFailed,
  markDispatchSucceeded,
  retryDispatchQueue,
  type DispatchQueueEntry,
  type DispatchStatusSummary,
  type DispatchJob
} from "../storage/database";

const accountConfigSchema = z.object({
  agentId: z.string().trim().min(1),
  enabled: z.boolean().default(true)
});

const dispatcherConfigSchema = z.object({
  accounts: z.record(accountConfigSchema),
  worker: z.object({
    pollIntervalMs: z.number().int().min(100).default(1000),
    maxConcurrentSessions: z.number().int().min(1).max(128).default(4)
  }).default({
    pollIntervalMs: 1000,
    maxConcurrentSessions: 4
  })
});

export type MailDispatcherConfig = z.infer<typeof dispatcherConfigSchema>;

export interface DispatchWorkerOptions {
  configFilePath?: string;
  databaseFile?: string;
  bridgeLogFile?: string;
  logger?: Logger;
  openclawBin?: string;
  runAgentTurn?: (input: {
    agentId: string;
    sessionKey: string;
    message: string;
    job: DispatchJob;
  }) => Promise<void>;
}

export interface DispatchStatusReport {
  summary: DispatchStatusSummary;
  stalledPending: number;
  recentPending: DispatchQueueEntry[];
  recentFailed: DispatchQueueEntry[];
  recentDeadletter: DispatchQueueEntry[];
}

export const DEFAULT_MAIL_DISPATCH_CONFIG_FILE = path.join(
  os.homedir(),
  ".openclaw",
  "mail-dispatch",
  "config.json"
);
export const DEFAULT_BRIDGE_LOG_FILE = path.join(
  os.homedir(),
  ".agentmail",
  "logs",
  "bridge.log"
);

interface OpenClawGatewayConfig {
  url?: string;
  token?: string;
}

interface OpenClawConfigFile {
  gateway?: {
    port?: number;
    auth?: {
      token?: string;
    };
  };
  agents?: {
    list?: Array<{
      id?: string;
      workspace?: string;
    }>;
  };
}

interface InboundAutomationContext {
  enabled: boolean;
  inboundContextPath?: string;
  workItemPath?: string;
  prosePath?: string;
  lobsterReplyPath?: string;
  lobsterNoReplyPath?: string;
}

async function appendBridgeLog(
  event: {
    level: "INFO" | "WARN" | "ERROR";
    action: string;
    profileId?: string;
    peerEmail?: string;
    sessionKey?: string;
    message?: string;
    extra?: Record<string, unknown>;
  },
  logFile = DEFAULT_BRIDGE_LOG_FILE
): Promise<void> {
  const payload = {
    timestamp: new Date().toISOString(),
    level: event.level,
    action: event.action,
    profileId: event.profileId ?? null,
    peerEmail: event.peerEmail ?? null,
    sessionKey: event.sessionKey ?? null,
    message: event.message ?? "",
    extra: event.extra ?? {}
  };

  await mkdir(path.dirname(logFile), { recursive: true });
  await appendFile(logFile, `${JSON.stringify(payload)}\n`, "utf8");
}

async function readOpenClawConfigFile(): Promise<OpenClawConfigFile | null> {
  const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");

  try {
    return JSON.parse(await readFile(configPath, "utf8")) as OpenClawConfigFile;
  } catch {
    return null;
  }
}

async function readOpenClawGatewayConfig(): Promise<OpenClawGatewayConfig> {
  const rawConfig = await readOpenClawConfigFile();
  const port = rawConfig?.gateway?.port;
  const token = rawConfig?.gateway?.auth?.token;

  return {
    url: typeof port === "number" ? `ws://127.0.0.1:${port}` : undefined,
    token: typeof token === "string" && token.trim().length > 0 ? token : undefined
  };
}

async function resolveOpenClawAgentWorkspace(agentId: string): Promise<string | undefined> {
  const config = await readOpenClawConfigFile();
  const entries = Array.isArray(config?.agents?.list) ? config.agents.list : [];
  const match = entries.find((entry) => entry?.id === agentId);
  const workspace = match?.workspace?.trim();
  return workspace && workspace.length > 0 ? workspace : undefined;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function stripHtml(source: string): string {
  return source
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function readBodyText(job: DispatchJob): Promise<string> {
  const bodyTextPath = path.join(job.messageDir, "body.txt");
  const bodyHtmlPath = path.join(job.messageDir, "body.html");

  try {
    return (await readFile(bodyTextPath, "utf8")).trim();
  } catch {
    try {
      return stripHtml(await readFile(bodyHtmlPath, "utf8"));
    } catch {
      return "";
    }
  }
}

async function resolveInboundAutomationContext(params: {
  agentId: string;
  job: DispatchJob;
  openclawSessionKey: string;
  replyTarget: string;
  replySubject: string;
  references: string[];
  body: string;
}): Promise<InboundAutomationContext> {
  const workspace = await resolveOpenClawAgentWorkspace(params.agentId);
  if (!workspace) {
    return { enabled: false };
  }

  const prosePath = path.join(workspace, "prose", "inbound_intake.prose");
  const lobsterReplyPath = path.join(workspace, "lobster", "reply_guarded_send.lobster.yaml");
  const lobsterNoReplyPath = path.join(workspace, "lobster", "no_reply.lobster.yaml");
  const replyGuardPath = path.join(workspace, "scripts", "agentmail_reply_guard.py");

  const workflowFiles = await Promise.all([
    pathExists(prosePath),
    pathExists(lobsterReplyPath),
    pathExists(lobsterNoReplyPath),
    pathExists(replyGuardPath)
  ]);
  if (!workflowFiles.every(Boolean)) {
    return { enabled: false };
  }

  const inboundContextPath = path.join(params.job.messageDir, "openclaw-inbound-context.json");
  const workItemPath = path.join(params.job.messageDir, "sales_work_item.json");
  const senderEmail =
    params.job.metadata.fromEmails[0] ??
    params.job.metadata.normalizedSenderEmail ??
    params.job.peerEmail;

  const inboundContext = {
    profile_id: params.job.metadata.profileId,
    account_email: params.job.metadata.accountEmail,
    agent_id: params.agentId,
    mail_session_id: params.job.sessionId,
    openclaw_session_key: params.openclawSessionKey,
    workspace_root: workspace,
    message_id: params.job.metadata.messageId ?? "",
    mailbox: params.job.metadata.mailbox,
    saved_at: params.job.metadata.savedAt,
    local_dir: params.job.messageDir,
    sender: {
      name: params.job.metadata.from[0] ?? senderEmail,
      email: senderEmail
    },
    recipients: {
      to: params.job.metadata.to,
      to_emails: params.job.metadata.toEmails,
      cc: params.job.metadata.cc,
      cc_emails: params.job.metadata.ccEmails,
      reply_to: params.job.metadata.replyTo,
      reply_to_emails: params.job.metadata.replyToEmails
    },
    reply_target: params.replyTarget,
    reply_subject: params.replySubject,
    thread_headers: {
      in_reply_to: params.job.metadata.messageId ?? "",
      references: params.references
    },
    attachments: params.job.metadata.attachments.map((attachment) => ({
      filename: attachment.filename,
      content_type: attachment.contentType,
      size: attachment.size,
      relative_path: attachment.relativePath,
      absolute_path: path.join(params.job.messageDir, attachment.relativePath)
    })),
    body_text: params.body
  };

  await writeFile(inboundContextPath, `${JSON.stringify(inboundContext, null, 2)}\n`, "utf8");

  return {
    enabled: true,
    inboundContextPath,
    workItemPath,
    prosePath,
    lobsterReplyPath,
    lobsterNoReplyPath
  };
}

export async function readMailDispatcherConfig(
  configFilePath = DEFAULT_MAIL_DISPATCH_CONFIG_FILE
): Promise<MailDispatcherConfig> {
  const content = await readFile(configFilePath, "utf8");
  return dispatcherConfigSchema.parse(JSON.parse(content) as unknown);
}

export async function buildDispatchPayload(
  job: DispatchJob,
  agentId: string
): Promise<string> {
  const openclawSessionKey = deriveOpenClawMailSessionKey(agentId, job.peerEmail);
  const replyTarget =
    job.metadata.replyToEmails[0] ??
    job.metadata.fromEmails[0] ??
    job.metadata.normalizedSenderEmail ??
    job.peerEmail;
  const references = [...new Set([...job.metadata.references, ...(job.metadata.messageId ? [job.metadata.messageId] : [])])];
  const attachmentLines = job.metadata.attachments.length === 0
    ? "Attachments: none"
    : `Attachments:\n${job.metadata.attachments
        .map(
          (attachment) =>
            `- ${attachment.filename} (${attachment.contentType}, ${attachment.size} bytes) -> ${attachment.relativePath}`
        )
        .join("\n")}`;
  const body = await readBodyText(job);
  const replySubject = formatReplySubject(job.metadata.subject);
  const automation = await resolveInboundAutomationContext({
    agentId,
    job,
    openclawSessionKey,
    replyTarget,
    replySubject,
    references,
    body
  });

  const replyInstructions = automation.enabled
    ? [
        "Reply instructions:",
        "- This turn originated from inbound email.",
        "- Either send the reply or record a no-send decision during this turn.",
        `- Use the provided mailbox profile exactly: "${job.metadata.profileId}".`,
        "- This workspace has an inbound automation stack. Use it for this turn.",
        "- Read `AGENTS.md`, `WORKFLOWS.md`, `TOOLS.md`, and `skills/agentmail/SKILL.md` before acting.",
        `- Use the structured inbound context JSON at "${automation.inboundContextPath}".`,
        `- First build the normalized sales_work_item with: python3 scripts/build_sales_work_item.py --workspace "." --context-file "${automation.inboundContextPath}" --output-file "${automation.workItemPath}"`,
        `- Use "${automation.prosePath}" only when the inbound task is genuinely complex and needs deeper multi-step reasoning before you finalize the work item.`,
        `- If classification is duplicate or autoresponder, run: lobster run --file "${automation.lobsterNoReplyPath}" --args-json '${JSON.stringify({ workspace: ".", work_item_path: automation.workItemPath })}'`,
        `- Otherwise run: lobster run --file "${automation.lobsterReplyPath}" --args-json '${JSON.stringify({ workspace: ".", work_item_path: automation.workItemPath })}'`,
        `- Fallback only if Lobster is unavailable: python3 scripts/agentmail_reply_guard.py send-work-item --workspace "." --work-item "${automation.workItemPath}"`,
        "- Do not call `agentmail send` directly when this automation stack is present.",
        "- Do not call `python3 scripts/agentmail_reply_guard.py send` directly when this automation stack is present.",
        "- Preserve mail threading with --in-reply-to and --references."
      ]
    : [
        "Reply instructions:",
        "- This turn originated from inbound email.",
        "- Reply by sending an email during this turn unless there is a clear reason not to reply.",
        `- Use the provided mailbox profile exactly: "${job.metadata.profileId}".`,
        `- Execute agentmail directly with --profile "${job.metadata.profileId}".`,
        "- Do not print an agentmail command as your final answer.",
        "- Actually send the email during the turn.",
        "- Use --attach for any absolute file paths that must be included.",
        "- Preserve mail threading with --in-reply-to and --references."
      ];

  const suggestedCommandSection = automation.enabled
    ? [
        "Suggested workflow:",
        `1. Run python3 scripts/build_sales_work_item.py --workspace "." --context-file "${automation.inboundContextPath}" --output-file "${automation.workItemPath}"`,
        `2. Complex long_task only: refine the work item with "${automation.prosePath}" before sending.`,
        `3. Duplicate/autoresponder => lobster run --file "${automation.lobsterNoReplyPath}" --args-json '${JSON.stringify({ workspace: ".", work_item_path: automation.workItemPath })}'`,
        `4. Otherwise => lobster run --file "${automation.lobsterReplyPath}" --args-json '${JSON.stringify({ workspace: ".", work_item_path: automation.workItemPath })}'`
      ]
    : [
        "Suggested command template:",
        `agentmail --profile "${job.metadata.profileId}" send --to "${replyTarget}" --subject "${replySubject}" --text "..." --html "<p>...</p>" --in-reply-to "${job.metadata.messageId ?? ""}" --references "${references.join(",")}"`
      ];

  return [
    `Inbound email for profile: ${job.metadata.profileId}`,
    `Mailbox account: ${job.metadata.accountEmail}`,
    `Mail session id: ${job.sessionId}`,
    `OpenClaw session key: ${openclawSessionKey}`,
    `Reply target: ${replyTarget}`,
    `Reply subject: ${replySubject}`,
    `Original Message-ID: ${job.metadata.messageId ?? ""}`,
    `In-Reply-To for reply: ${job.metadata.messageId ?? ""}`,
    `References for reply: ${references.join(",")}`,
    `Mailbox folder: ${job.metadata.mailbox}`,
    `Saved at: ${job.metadata.savedAt}`,
    `Local dir: ${job.messageDir}`,
    `From: ${job.metadata.from.join(", ")}`,
    `To: ${job.metadata.to.join(", ")}`,
    job.metadata.cc.length > 0 ? `Cc: ${job.metadata.cc.join(", ")}` : "Cc:",
    attachmentLines,
    "",
    ...replyInstructions,
    "",
    ...suggestedCommandSection,
    "",
    "Email body:",
    body.length > 0 ? body : "(empty)"
  ].join("\n");
}

async function runOpenclawChatSend(
  input: {
    agentId: string;
    sessionKey: string;
    message: string;
    jobId: number;
  },
  options: DispatchWorkerOptions
): Promise<{ runId: string | null; status: string | null }> {
  const openclawBin = options.openclawBin ?? "openclaw";
  const gatewayConfig = await readOpenClawGatewayConfig();

  return await new Promise<{ runId: string | null; status: string | null }>((resolve, reject) => {
    const args = [
      "gateway",
      "call",
      "chat.send",
      "--json",
      "--timeout",
      "20000",
      "--params",
      JSON.stringify({
        sessionKey: input.sessionKey,
        message: input.message,
        idempotencyKey: `agentmail-${input.jobId}`
      })
    ];

    if (gatewayConfig.url) {
      args.push("--url", gatewayConfig.url);
    }

    if (gatewayConfig.token) {
      args.push("--token", gatewayConfig.token);
    }

    const child = spawn(openclawBin, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        try {
          const parsed = stdout.trim().length > 0 ? JSON.parse(stdout) as { runId?: unknown; status?: unknown } : {};
          resolve({
            runId: typeof parsed.runId === "string" ? parsed.runId : null,
            status: typeof parsed.status === "string" ? parsed.status : null
          });
        } catch {
          resolve({ runId: null, status: null });
        }
        return;
      }

      const details = [signal ? `signal=${signal}` : `exit=${String(code)}`];
      if (stdout.trim().length > 0) {
        details.push(`stdout=${stdout.trim()}`);
      }
      if (stderr.trim().length > 0) {
        details.push(`stderr=${stderr.trim()}`);
      }

      reject(new Error(`OpenClaw chat.send failed: ${details.join(" | ")}`));
    });
  });
}

async function processDispatchJob(
  config: MailDispatcherConfig,
  job: DispatchJob,
  options: DispatchWorkerOptions
): Promise<void> {
  const logger = options.logger ?? consoleLogger;
  const bridgeLog = options.bridgeLogFile;
  const accountConfig = config.accounts[job.profileId];

  if (!accountConfig || !accountConfig.enabled) {
    markDispatchFailed(
      job.id,
      `No enabled dispatcher account config found for profile ${job.profileId}.`,
      options.databaseFile
    );
    await appendBridgeLog({
      level: "ERROR",
      action: "dispatch_failed",
      profileId: job.profileId,
      peerEmail: job.peerEmail,
      message: `No enabled dispatcher account config found for profile ${job.profileId}.`,
      extra: {
        jobId: job.id
      }
    }, bridgeLog);
    return;
  }

  try {
    const openclawSessionKey = deriveOpenClawMailSessionKey(accountConfig.agentId, job.peerEmail);
    const payload = await buildDispatchPayload(job, accountConfig.agentId);
    await appendBridgeLog({
      level: "INFO",
      action: "dispatch_started",
      profileId: job.profileId,
      peerEmail: job.peerEmail,
      sessionKey: openclawSessionKey,
      message: `Dispatching inbound mail row ${job.id}.`,
      extra: {
        jobId: job.id,
        subject: job.metadata.subject
      }
    }, bridgeLog);

    if (options.runAgentTurn) {
      await options.runAgentTurn({
        agentId: accountConfig.agentId,
        sessionKey: openclawSessionKey,
        message: payload,
        job
      });
      markDispatchSucceeded(job.id, options.databaseFile);
      await appendBridgeLog({
        level: "INFO",
        action: "dispatch_delivered",
        profileId: job.profileId,
        peerEmail: job.peerEmail,
        sessionKey: openclawSessionKey,
        message: "Inbound mail handed off to OpenClaw (test adapter).",
        extra: {
          jobId: job.id
        }
      }, bridgeLog);
      logger.info(`Delivered mail session ${job.sessionId} to OpenClaw for profile ${job.profileId}.`);
    } else {
      const result = await runOpenclawChatSend(
        {
          agentId: accountConfig.agentId,
          sessionKey: openclawSessionKey,
          message: payload,
          jobId: job.id
        },
        options
      );
      markDispatchSucceeded(job.id, options.databaseFile);
      await appendBridgeLog({
        level: "INFO",
        action: "dispatch_delivered",
        profileId: job.profileId,
        peerEmail: job.peerEmail,
        sessionKey: openclawSessionKey,
        message: "Inbound mail handed off to OpenClaw.",
        extra: {
          jobId: job.id,
          runId: result.runId,
          status: result.status
        }
      }, bridgeLog);
      logger.info(
        `Delivered mail session ${job.sessionId} to OpenClaw for profile ${job.profileId}. runId=${result.runId ?? "unknown"}`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    markDispatchFailed(job.id, message, options.databaseFile);
    await appendBridgeLog({
      level: "ERROR",
      action: "dispatch_failed",
      profileId: job.profileId,
      peerEmail: job.peerEmail,
      sessionKey: deriveOpenClawMailSessionKey(accountConfig.agentId, job.peerEmail),
      message,
      extra: {
        jobId: job.id
      }
    }, bridgeLog);
    logger.error(`Dispatch failed for session ${job.sessionId}: ${message}`);
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export async function runMailDispatcherCycle(
  options: DispatchWorkerOptions = {}
): Promise<{ started: number }> {
  const logger = options.logger ?? consoleLogger;
  const config = await readMailDispatcherConfig(options.configFilePath);
  const activeSessions = new Set<string>();
  const readyJobs = listDispatchJobsReady(
    config.worker.maxConcurrentSessions * 2,
    options.databaseFile
  );
  const tasks: Promise<void>[] = [];

  for (const readyJob of readyJobs) {
    if (tasks.length >= config.worker.maxConcurrentSessions) {
      break;
    }

    if (activeSessions.has(readyJob.sessionId)) {
      continue;
    }

    const claimedJob = claimDispatchJob(readyJob.id, options.databaseFile);
    if (!claimedJob) {
      continue;
    }

    activeSessions.add(claimedJob.sessionId);
    tasks.push(
      processDispatchJob(config, claimedJob, options).finally(() => {
        activeSessions.delete(claimedJob.sessionId);
      })
    );
  }

  if (tasks.length > 0) {
    logger.info(`Started ${tasks.length} mail dispatch job(s).`);
    await Promise.all(tasks);
  }

  return { started: tasks.length };
}

export async function runMailDispatcher(
  options: DispatchWorkerOptions = {}
): Promise<void> {
  const logger = options.logger ?? consoleLogger;
  const config = await readMailDispatcherConfig(options.configFilePath);
  logger.info(
    `Starting mail dispatcher. pollIntervalMs=${config.worker.pollIntervalMs}, maxConcurrentSessions=${config.worker.maxConcurrentSessions}`
  );

  while (true) {
    await runMailDispatcherCycle(options);
    await sleep(config.worker.pollIntervalMs);
  }
}

export function readMailDispatcherStatus(
  databaseFile?: string
): DispatchStatusSummary {
  return getDispatchStatusSummary(databaseFile);
}

export function readMailDispatcherStatusReport(
  options: {
    databaseFile?: string;
    stalledThresholdSeconds?: number;
    limit?: number;
  } = {}
): DispatchStatusReport {
  const databaseFile = options.databaseFile;
  const limit = options.limit ?? 10;
  const stalledThresholdSeconds = options.stalledThresholdSeconds ?? 60;

  return {
    summary: getDispatchStatusSummary(databaseFile),
    stalledPending: countStalledDispatchJobs(stalledThresholdSeconds, databaseFile),
    recentPending: listDispatchQueue(
      {
        statuses: [DISPATCH_PENDING, DISPATCH_RUNNING],
        limit
      },
      databaseFile
    ),
    recentFailed: listDispatchQueue(
      {
        statuses: [DISPATCH_FAILED],
        limit
      },
      databaseFile
    ),
    recentDeadletter: listDispatchQueue(
      {
        statuses: [DISPATCH_DEADLETTER],
        limit
      },
      databaseFile
    )
  };
}

export function inspectMailDispatcherQueue(
  options: {
    profileId?: string;
    sender?: string;
    statuses?: string[];
    limit?: number;
    databaseFile?: string;
  } = {}
): DispatchQueueEntry[] {
  return listDispatchQueue(
    {
      profileId: options.profileId,
      sender: options.sender,
      statuses: options.statuses,
      limit: options.limit
    },
    options.databaseFile
  );
}

export function retryMailDispatcherQueue(
  options: {
    profileId?: string;
    sender?: string;
    includeDeadletter?: boolean;
    databaseFile?: string;
  } = {}
): number {
  return retryDispatchQueue(
    {
      profileId: options.profileId,
      sender: options.sender,
      includeDeadletter: options.includeDeadletter
    },
    options.databaseFile
  );
}
