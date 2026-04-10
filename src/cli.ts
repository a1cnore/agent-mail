#!/usr/bin/env bun
import { mkdir } from "node:fs/promises";
import { Command, InvalidArgumentError } from "commander";
import { ZodError, z } from "zod";
import type { AgentmailPaths } from "./config/paths";
import {
  listProfilesWithPollingConfig,
  parseAgentmailProfile,
  resolveAgentmailPaths
} from "./config/paths";
import { loadMailEnvConfig, validateEnvFile } from "./config/env";
import { tryReadPollingConfig, writePollingConfig } from "./config/polling";
import { receiveOnce, resolveMailboxForReceive } from "./receive/receiveOnce";
import { watchLoop } from "./receive/watchLoop";
import { parseAddressList, parseReferencesList, sendMail } from "./send/sendMail";
import { consoleLogger, type Logger } from "./types";
import { queryConversation } from "./conversation/queryConversation";
import { rebuildIndexForProfile } from "./storage/database";
import {
  DEFAULT_MAIL_DISPATCH_CONFIG_FILE,
  inspectMailDispatcherQueue,
  readMailDispatcherStatus,
  readMailDispatcherStatusReport,
  retryMailDispatcherQueue,
  runMailDispatcher,
  runMailDispatcherCycle
} from "./dispatch/worker";
import { createAccount } from "./account/createAccount";
import { bindDispatchAccount } from "./dispatch/config";
import { runMailBridgeDoctor } from "./dispatch/doctor";
import {
  getLaunchdServiceStatus,
  installLaunchdServices,
  uninstallLaunchdServices
} from "./service/launchd";

function parseInterval(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new InvalidArgumentError("Interval must be an integer greater than 0.");
  }

  return parsed;
}

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new InvalidArgumentError("Value must be an integer greater than 0.");
  }

  return parsed;
}

function parsePort(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new InvalidArgumentError("Port must be an integer between 1 and 65535.");
  }

  return parsed;
}

function parseBooleanOption(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  throw new InvalidArgumentError("Value must be either true or false.");
}

function parseCommaSeparatedValues(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function collectOptionValues(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parseProfileOption(value: string): string {
  try {
    const parsed = parseAgentmailProfile(value);
    if (!parsed) {
      throw new Error("Profile name must not be empty.");
    }

    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new InvalidArgumentError(message);
  }
}

function resolvePathsFromCommand(command: Command) {
  const globalOptions = command.optsWithGlobals<{ profile?: string }>();
  return resolveAgentmailPaths(globalOptions.profile);
}

async function resolvePathsForReceiveWatch(command: Command): Promise<AgentmailPaths[]> {
  const paths = resolvePathsFromCommand(command);
  if (paths.profile) {
    return [paths];
  }

  const profilesWithPollingConfig = await listProfilesWithPollingConfig();
  if (profilesWithPollingConfig.length > 0) {
    consoleLogger.info(
      `No --profile provided. Watching all configured profiles: ${profilesWithPollingConfig.join(", ")}`
    );
    return profilesWithPollingConfig.map((profile) => resolveAgentmailPaths(profile));
  }

  const legacyPollingConfig = await tryReadPollingConfig(paths.pollingConfigFile);
  if (legacyPollingConfig) {
    consoleLogger.info(
      `No profile polling configs found. Using legacy polling config at ${paths.pollingConfigFile}.`
    );
    return [paths];
  }

  throw new Error(
    `Polling config not found at ${paths.pollingConfigFile} and no profile polling configs were found in ~/.agentmail/profiles/<name>/polling.json. Run \`agentmail --profile <name> receive setup\` first.`
  );
}

function withWatchPrefix(logger: Logger, prefix: string): Logger {
  return {
    info: (message) => logger.info(`[${prefix}] ${message}`),
    warn: (message) => logger.warn(`[${prefix}] ${message}`),
    error: (message) => logger.error(`[${prefix}] ${message}`)
  };
}

async function runReceiveWatchTargets(watchTargets: AgentmailPaths[]): Promise<void> {
  if (watchTargets.length === 1) {
    const paths = watchTargets[0];
    await watchLoop(consoleLogger, {
      profileId: paths.profileId,
      pollingFilePath: paths.pollingConfigFile,
      lockFilePath: paths.receiveWatchLockFile,
      envFilePath: paths.envFile,
      messagesDir: paths.messagesDir,
      hookFilePath: paths.onRecieveHookFile,
      databaseFile: paths.databaseFile
    });
    return;
  }

  await Promise.all(
    watchTargets.map((paths) => {
      const profileLabel = paths.profile ?? "default";
      return watchLoop(withWatchPrefix(consoleLogger, `profile:${profileLabel}`), {
        profileId: paths.profileId,
        pollingFilePath: paths.pollingConfigFile,
        lockFilePath: paths.receiveWatchLockFile,
        envFilePath: paths.envFile,
        messagesDir: paths.messagesDir,
        hookFilePath: paths.onRecieveHookFile,
        databaseFile: paths.databaseFile
      });
    })
  );
}

function normalizeOptionalAddresses(raw: string | undefined): string[] {
  if (!raw || raw.trim().length === 0) {
    return [];
  }

  return parseAddressList(raw);
}

function formatError(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => issue.message).join("; ");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function withErrorHandling<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<void>
): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs): Promise<void> => {
    try {
      await handler(...args);
    } catch (error) {
      consoleLogger.error(formatError(error));
      process.exitCode = 1;
    }
  };
}

async function run(): Promise<void> {
  const program = new Command();
  program.name("agentmail").description("Send and receive email from the terminal").version("0.1.0");
  program.option(
    "--profile <name>",
    "Use profile-specific storage under ~/.agentmail/profiles/<name>",
    parseProfileOption
  );

  program
    .command("send")
    .description("Send email through SMTP")
    .requiredOption("--to <list>", "Comma-separated recipient addresses")
    .requiredOption("--subject <text>", "Message subject")
    .option("--cc <list>", "Comma-separated cc addresses")
    .option("--bcc <list>", "Comma-separated bcc addresses")
    .option("--text <text>", "Plain-text body")
    .option("--html <html>", "HTML body")
    .option("--in-reply-to <messageId>", "Set In-Reply-To header")
    .option("--references <list>", "Comma-separated References header message IDs")
    .option("--attach <path>", "Attachment file path", collectOptionValues, [])
    .action(
      withErrorHandling(async (options, command: Command) => {
        const paths = resolvePathsFromCommand(command);

        await sendMail(
          {
            to: parseAddressList(options.to),
            cc: normalizeOptionalAddresses(options.cc),
            bcc: normalizeOptionalAddresses(options.bcc),
            subject: options.subject,
            text: options.text,
            html: options.html,
            attachments: options.attach,
            inReplyTo: options.inReplyTo,
            references: parseReferencesList(options.references)
          },
          consoleLogger,
          {
            envFilePath: paths.envFile,
            sentMessagesDir: paths.sentMessagesDir,
            profileId: paths.profileId,
            databaseFile: paths.databaseFile
          }
        );
      })
    );

  const receiveCommand = program.command("receive").description("Receive email via IMAP polling");

  receiveCommand
    .command("setup")
    .description("Write polling settings to the active profile polling config")
    .option("--mailbox <name>", "IMAP mailbox name")
    .option("--interval <seconds>", "Polling interval in seconds", parseInterval)
    .action(
      withErrorHandling(async (options, command: Command) => {
        const paths = resolvePathsFromCommand(command);
        await mkdir(paths.rootDir, { recursive: true });
        const config = await writePollingConfig(
          {
            mailbox: options.mailbox,
            intervalSeconds: options.interval
          },
          paths.pollingConfigFile
        );

        consoleLogger.info(
          `Saved polling config at ${paths.pollingConfigFile}. mailbox=${config.mailbox}, intervalSeconds=${config.intervalSeconds}`
        );
      })
    );

  receiveCommand
    .command("once")
    .description("Poll mailbox once and save unseen messages")
    .option("--mailbox <name>", "IMAP mailbox name")
    .action(
      withErrorHandling(async (options, command: Command) => {
        const paths = resolvePathsFromCommand(command);
        const mailbox = await resolveMailboxForReceive(options.mailbox, paths.pollingConfigFile);
        const result = await receiveOnce({
          profileId: paths.profileId,
          mailbox,
          logger: consoleLogger,
          envFilePath: paths.envFile,
          pollingFilePath: paths.pollingConfigFile,
          messagesDir: paths.messagesDir,
          hookFilePath: paths.onRecieveHookFile,
          databaseFile: paths.databaseFile
        });
        consoleLogger.info(
          `Receive complete. mailbox=${result.mailbox}, found=${result.found}, saved=${result.saved}, seenMarked=${result.seenMarked}, failed=${result.failed}`
        );
      })
    );

  receiveCommand
    .command("watch")
    .description("Continuously poll mailbox using saved polling settings")
    .action(
      withErrorHandling(async (_options, command: Command) => {
        const watchTargets = await resolvePathsForReceiveWatch(command);
        await runReceiveWatchTargets(watchTargets);
      })
    );

  receiveCommand
    .command("watch-all")
    .description("Continuously poll all configured profiles at once")
    .action(
      withErrorHandling(async (_options, command: Command) => {
        const paths = resolvePathsFromCommand(command);
        if (paths.profile) {
          throw new Error("Do not pass --profile to `agentmail receive watch-all`.");
        }

        const watchTargets = await resolvePathsForReceiveWatch(command);
        await runReceiveWatchTargets(watchTargets);
      })
    );

  const configCommand = program.command("config").description("Inspect or validate local config");

  configCommand
    .command("validate")
    .description("Validate the active profile .env file")
    .action(
      withErrorHandling(async (_options, command: Command) => {
        const paths = resolvePathsFromCommand(command);
        const validation = await validateEnvFile(paths.envFile);

        if (validation.isValid) {
          consoleLogger.info(`Configuration is valid: ${validation.envFilePath}`);
          return;
        }

        if (!validation.exists) {
          consoleLogger.error(`Environment file is missing: ${validation.envFilePath}`);
        }

        if (validation.missingKeys.length > 0) {
          consoleLogger.error(`Missing keys: ${validation.missingKeys.join(", ")}`);
        }

        for (const issue of validation.issues) {
          consoleLogger.error(issue);
        }

        process.exitCode = 1;
      })
    );

  const accountCommand = program
    .command("account")
    .summary("Create and manage mail account profiles")
    .description("Create and manage mail account profiles");

  accountCommand
    .command("create")
    .description("Create an AgentMail profile, write .env, and save default polling config")
    .requiredOption("--name <profile>", "Profile name to create")
    .option("--email <address>", "Account email; defaults to the profile name when it is an email")
    .requiredOption("--smtp-host <host>", "SMTP host")
    .option("--smtp-port <port>", "SMTP port", parsePort, 465)
    .option("--smtp-secure <true|false>", "SMTP secure flag", parseBooleanOption, true)
    .requiredOption("--smtp-user <user>", "SMTP username")
    .requiredOption("--smtp-pass <pass>", "SMTP password")
    .requiredOption("--imap-host <host>", "IMAP host")
    .option("--imap-port <port>", "IMAP port", parsePort, 993)
    .option("--imap-secure <true|false>", "IMAP secure flag", parseBooleanOption, true)
    .requiredOption("--imap-user <user>", "IMAP username")
    .requiredOption("--imap-pass <pass>", "IMAP password")
    .option("--mailbox <name>", "Default polling mailbox", "INBOX")
    .option("--interval <seconds>", "Default polling interval in seconds", parseInterval, 60)
    .option("--agent <id>", "Bind the profile to an OpenClaw agent id")
    .option("--dispatch-config <path>", "Dispatcher config file", DEFAULT_MAIL_DISPATCH_CONFIG_FILE)
    .option("--force", "Overwrite an existing .env file")
    .action(
      withErrorHandling(async (options) => {
        const created = await createAccount({
          name: options.name,
          email: options.email,
          smtp: {
            host: options.smtpHost,
            port: options.smtpPort,
            secure: options.smtpSecure,
            user: options.smtpUser,
            pass: options.smtpPass
          },
          imap: {
            host: options.imapHost,
            port: options.imapPort,
            secure: options.imapSecure,
            user: options.imapUser,
            pass: options.imapPass
          },
          mailbox: options.mailbox,
          intervalSeconds: options.interval,
          force: Boolean(options.force)
        });

        if (options.agent) {
          await bindDispatchAccount({
            profile: created.profile,
            agentId: options.agent,
            configFilePath: options.dispatchConfig
          });
          consoleLogger.info(
            `Bound profile ${created.profile} to OpenClaw agent ${options.agent} in ${options.dispatchConfig}.`
          );
        }

        consoleLogger.info(
          `Created account profile ${created.profile}. env=${created.paths.envFile}, polling=${created.paths.pollingConfigFile}`
        );
      })
    );

  const indexCommand = program.command("index").description("Manage the local SQLite mail index");

  indexCommand
    .command("rebuild")
    .description("Rebuild the active profile index from saved message folders")
    .action(
      withErrorHandling(async (_options, command: Command) => {
        const paths = resolvePathsFromCommand(command);
        const envConfig = await loadMailEnvConfig(paths.envFile);
        const result = await rebuildIndexForProfile({
          profileId: paths.profileId,
          accountEmail: envConfig.email,
          messagesDir: paths.messagesDir,
          sentMessagesDir: paths.sentMessagesDir,
          databaseFile: paths.databaseFile
        });

        consoleLogger.info(
          `Index rebuild complete. inboundIndexed=${result.inboundIndexed}, outboundIndexed=${result.outboundIndexed}, inboundSkipped=${result.inboundSkipped}, outboundSkipped=${result.outboundSkipped}`
        );
      })
    );

  program
    .command("conversation")
    .description("Query locally saved conversation messages by sender or session")
    .option("--sender <email>", "Sender email address")
    .option("--session <id>", "Exact mail session id")
    .option("--include-sent", "Include locally saved sent messages addressed to sender")
    .option("--limit <count>", "Maximum number of entries", parsePositiveInteger)
    .option("--json", "Print raw JSON result")
    .action(
      withErrorHandling(async (options, command: Command) => {
        const paths = resolvePathsFromCommand(command);
        if (!options.sender && !options.session) {
          throw new Error("Either --sender or --session must be provided.");
        }

        const sender = options.sender
          ? z.string().trim().email().parse(options.sender).toLowerCase()
          : undefined;
        const sessionId = options.session ? z.string().trim().min(1).parse(options.session) : undefined;
        const entries = await queryConversation({
          profileId: paths.profileId,
          sender,
          sessionId,
          includeSent: Boolean(options.includeSent),
          limit: options.limit,
          messagesDir: paths.messagesDir,
          sentMessagesDir: paths.sentMessagesDir,
          databaseFile: paths.databaseFile
        });

        if (options.json) {
          console.log(JSON.stringify(entries, null, 2));
          return;
        }

        if (entries.length === 0) {
          const lookupLabel = sender ?? sessionId;
          consoleLogger.info(`No conversation entries found for ${lookupLabel}.`);
          return;
        }

        console.log(`Conversation entries: ${entries.length}`);
        for (const entry of entries) {
          const timestamp = entry.date ?? entry.savedAt;
          const subject = entry.subject ?? "(no subject)";
          console.log(
            `- [${entry.direction}] ${timestamp} | ${subject} | session=${entry.sessionId ?? "(none)"} | from=${entry.from.join(", ")} | to=${entry.to.join(", ")} | dir=${entry.messageDir}`
          );
        }
      })
    );

  program
    .command("inbox")
    .description("Open the inbox viewer web UI")
    .option("--port <port>", "HTTP server port", parsePort, 8025)
    .option("--hostname <host>", "HTTP server hostname", "127.0.0.1")
    .action(
      withErrorHandling(async (options) => {
        const { startInboxServer } = await import("./ui/server");
        await startInboxServer({ port: options.port, hostname: options.hostname });
      })
    );

  const dispatchCommand = program.command("dispatch").description("Run the shared mail dispatcher");

  dispatchCommand
    .command("bind")
    .description("Bind an AgentMail profile to an OpenClaw agent")
    .requiredOption("--account <name>", "AgentMail profile name", parseProfileOption)
    .requiredOption("--agent <id>", "OpenClaw agent id")
    .option("--disable", "Store the binding as disabled")
    .option("--config <path>", "Dispatcher config file", DEFAULT_MAIL_DISPATCH_CONFIG_FILE)
    .action(
      withErrorHandling(async (options) => {
        await bindDispatchAccount({
          profile: options.account,
          agentId: options.agent,
          enabled: !options.disable,
          configFilePath: options.config
        });

        consoleLogger.info(
          `Saved dispatch binding for profile ${options.account} -> agent ${options.agent} at ${options.config}.`
        );
      })
    );

  dispatchCommand
    .command("run")
    .description("Run the shared mail dispatcher loop")
    .option("--config <path>", "Dispatcher config file", DEFAULT_MAIL_DISPATCH_CONFIG_FILE)
    .action(
      withErrorHandling(async (options, command: Command) => {
        const paths = resolvePathsFromCommand(command);
        await runMailDispatcher({
          configFilePath: options.config,
          databaseFile: paths.databaseFile,
          logger: consoleLogger
        });
      })
    );

  dispatchCommand
    .command("once")
    .description("Run a single dispatcher polling cycle")
    .option("--config <path>", "Dispatcher config file", DEFAULT_MAIL_DISPATCH_CONFIG_FILE)
    .action(
      withErrorHandling(async (options, command: Command) => {
        const paths = resolvePathsFromCommand(command);
        const result = await runMailDispatcherCycle({
          configFilePath: options.config,
          databaseFile: paths.databaseFile,
          logger: consoleLogger
        });
        consoleLogger.info(`Dispatch cycle complete. started=${result.started}`);
      })
    );

  dispatchCommand
    .command("status")
    .description("Show dispatcher queue status")
    .option("--verbose", "Include recent pending/failed/deadletter rows")
    .option("--json", "Print raw JSON result")
    .action(
      withErrorHandling(async (options, command: Command) => {
        const paths = resolvePathsFromCommand(command);
        if (options.verbose) {
          const report = readMailDispatcherStatusReport({
            databaseFile: paths.databaseFile
          });
          if (options.json) {
            console.log(JSON.stringify(report, null, 2));
            return;
          }

          console.log(JSON.stringify(report.summary, null, 2));
          console.log(`stalledPending=${report.stalledPending}`);
          for (const label of ["recentPending", "recentFailed", "recentDeadletter"] as const) {
            console.log(`${label}:`);
            for (const entry of report[label]) {
              console.log(
                `- id=${entry.id} profile=${entry.profileId} sender=${entry.peerEmail} status=${entry.dispatchStatus} attempts=${entry.dispatchAttempts} savedAt=${entry.savedAt} subject=${entry.subject ?? "(no subject)"}`
              );
              if (entry.lastDispatchError) {
                console.log(`  error=${entry.lastDispatchError}`);
              }
            }
          }
          return;
        }

        const summary = readMailDispatcherStatus(paths.databaseFile);
        if (options.json) {
          console.log(JSON.stringify(summary, null, 2));
          return;
        }

        console.log(JSON.stringify(summary, null, 2));
      })
    );

  dispatchCommand
    .command("inspect")
    .description("Inspect queued dispatcher rows")
    .option("--account <name>", "Filter by AgentMail profile", parseProfileOption)
    .option("--sender <email>", "Filter by sender email")
    .option("--status <list>", "Comma-separated statuses to include", parseCommaSeparatedValues)
    .option("--limit <count>", "Maximum rows", parsePositiveInteger, 20)
    .option("--json", "Print raw JSON result")
    .action(
      withErrorHandling(async (options, command: Command) => {
        const paths = resolvePathsFromCommand(command);
        const rows = inspectMailDispatcherQueue({
          profileId: options.account,
          sender: options.sender,
          statuses: options.status,
          limit: options.limit,
          databaseFile: paths.databaseFile
        });

        if (options.json) {
          console.log(JSON.stringify(rows, null, 2));
          return;
        }

        for (const row of rows) {
          console.log(
            `- id=${row.id} profile=${row.profileId} sender=${row.peerEmail} status=${row.dispatchStatus} attempts=${row.dispatchAttempts} savedAt=${row.savedAt} subject=${row.subject ?? "(no subject)"}`
          );
          if (row.lastDispatchError) {
            console.log(`  error=${row.lastDispatchError}`);
          }
        }
      })
    );

  dispatchCommand
    .command("retry")
    .description("Retry failed or stalled dispatcher rows immediately")
    .option("--account <name>", "Filter by AgentMail profile", parseProfileOption)
    .option("--sender <email>", "Filter by sender email")
    .option("--include-deadletter", "Also retry deadletter rows")
    .action(
      withErrorHandling(async (options, command: Command) => {
        const paths = resolvePathsFromCommand(command);
        const changed = retryMailDispatcherQueue({
          profileId: options.account,
          sender: options.sender,
          includeDeadletter: Boolean(options.includeDeadletter),
          databaseFile: paths.databaseFile
        });
        consoleLogger.info(`Queued ${changed} dispatcher row(s) for immediate retry.`);
      })
    );

  dispatchCommand
    .command("doctor")
    .description("Run bridge health checks")
    .option("--config <path>", "Dispatcher config file", DEFAULT_MAIL_DISPATCH_CONFIG_FILE)
    .option("--json", "Print raw JSON result")
    .action(
      withErrorHandling(async (options, command: Command) => {
        const paths = resolvePathsFromCommand(command);
        const report = await runMailBridgeDoctor({
          configFilePath: options.config,
          databaseFile: paths.databaseFile
        });

        if (options.json) {
          console.log(JSON.stringify(report, null, 2));
          return;
        }

        console.log(`dispatcherConfig=${report.dispatcherConfigPath}`);
        for (const profile of report.profiles) {
          console.log(
            `- profile=${profile.profileId} envValid=${profile.envValid} polling=${profile.pollingConfigured} binding=${profile.bindingAgentId ?? "(missing)"} watcherAlive=${profile.watcherAlive} failedJobs=${profile.failedJobs} stalledJobs=${profile.stalledJobs}`
          );
        }

        if (report.issues.length === 0) {
          console.log("issues: none");
          return;
        }

        console.log("issues:");
        for (const issue of report.issues) {
          console.log(`- ${issue}`);
        }
      })
    );

  const serviceCommand = program.command("service").description("Manage AgentMail launchd services");

  serviceCommand
    .command("install")
    .description("Install launchd services for configured watchers and dispatcher")
    .option("--config <path>", "Dispatcher config file", DEFAULT_MAIL_DISPATCH_CONFIG_FILE)
    .action(
      withErrorHandling(async (options) => {
        const services = await installLaunchdServices({
          dispatcherConfigFilePath: options.config,
          workingDirectory: process.cwd()
        });
        for (const service of services) {
          consoleLogger.info(`Installed ${service.kind} service ${service.label} at ${service.plistPath}`);
        }
      })
    );

  serviceCommand
    .command("uninstall")
    .description("Uninstall AgentMail launchd services")
    .action(
      withErrorHandling(async () => {
        const services = await uninstallLaunchdServices();
        for (const service of services) {
          consoleLogger.info(`Removed ${service.kind} service ${service.label}`);
        }
      })
    );

  serviceCommand
    .command("status")
    .description("Show launchd service status")
    .option("--json", "Print raw JSON result")
    .action(
      withErrorHandling(async (options) => {
        const statuses = await getLaunchdServiceStatus();
        if (options.json) {
          console.log(JSON.stringify(statuses, null, 2));
          return;
        }

        for (const status of statuses) {
          console.log(
            `- ${status.kind} label=${status.label} installed=${status.installed} loaded=${status.loaded} plist=${status.plistPath}`
          );
        }
      })
    );

  await program.parseAsync(process.argv);
}

await run();
