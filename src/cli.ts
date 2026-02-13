#!/usr/bin/env bun
import { mkdir } from "node:fs/promises";
import { Command, InvalidArgumentError } from "commander";
import { ZodError, z } from "zod";
import { AGENTMAIL_DIR } from "./config/paths";
import { validateEnvFile } from "./config/env";
import { writePollingConfig } from "./config/polling";
import { receiveOnce, resolveMailboxForReceive } from "./receive/receiveOnce";
import { watchLoop } from "./receive/watchLoop";
import { parseAddressList, sendMail } from "./send/sendMail";
import { consoleLogger } from "./types";
import { queryConversation } from "./conversation/queryConversation";

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

function collectOptionValues(value: string, previous: string[]): string[] {
  return [...previous, value];
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

  program
    .command("send")
    .description("Send email through SMTP")
    .requiredOption("--to <list>", "Comma-separated recipient addresses")
    .requiredOption("--subject <text>", "Message subject")
    .option("--cc <list>", "Comma-separated cc addresses")
    .option("--bcc <list>", "Comma-separated bcc addresses")
    .option("--text <text>", "Plain-text body")
    .option("--html <html>", "HTML body")
    .option("--attach <path>", "Attachment file path", collectOptionValues, [])
    .action(
      withErrorHandling(async (options) => {
        await sendMail(
          {
            to: parseAddressList(options.to),
            cc: normalizeOptionalAddresses(options.cc),
            bcc: normalizeOptionalAddresses(options.bcc),
            subject: options.subject,
            text: options.text,
            html: options.html,
            attachments: options.attach
          },
          consoleLogger
        );
      })
    );

  const receiveCommand = program.command("receive").description("Receive email via IMAP polling");

  receiveCommand
    .command("setup")
    .description("Write polling settings to ~/.agentmail/polling.json")
    .option("--mailbox <name>", "IMAP mailbox name")
    .option("--interval <seconds>", "Polling interval in seconds", parseInterval)
    .action(
      withErrorHandling(async (options) => {
        await mkdir(AGENTMAIL_DIR, { recursive: true });
        const config = await writePollingConfig({
          mailbox: options.mailbox,
          intervalSeconds: options.interval
        });

        consoleLogger.info(
          `Saved polling config. mailbox=${config.mailbox}, intervalSeconds=${config.intervalSeconds}`
        );
      })
    );

  receiveCommand
    .command("once")
    .description("Poll mailbox once and save unseen messages")
    .option("--mailbox <name>", "IMAP mailbox name")
    .action(
      withErrorHandling(async (options) => {
        const mailbox = await resolveMailboxForReceive(options.mailbox);
        const result = await receiveOnce({ mailbox, logger: consoleLogger });
        consoleLogger.info(
          `Receive complete. mailbox=${result.mailbox}, found=${result.found}, saved=${result.saved}, seenMarked=${result.seenMarked}, failed=${result.failed}`
        );
      })
    );

  receiveCommand
    .command("watch")
    .description("Continuously poll mailbox using saved polling settings")
    .action(withErrorHandling(async () => watchLoop(consoleLogger)));

  const configCommand = program.command("config").description("Inspect or validate local config");

  configCommand
    .command("validate")
    .description("Validate ~/.agentmail/.env")
    .action(
      withErrorHandling(async () => {
        const validation = await validateEnvFile();

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

  program
    .command("conversation")
    .description("Query locally saved conversation messages by sender")
    .requiredOption("--sender <email>", "Sender email address")
    .option("--include-sent", "Include locally saved sent messages addressed to sender")
    .option("--limit <count>", "Maximum number of entries", parsePositiveInteger)
    .option("--json", "Print raw JSON result")
    .action(
      withErrorHandling(async (options) => {
        const sender = z.string().trim().email().parse(options.sender).toLowerCase();
        const entries = await queryConversation({
          sender,
          includeSent: Boolean(options.includeSent),
          limit: options.limit
        });

        if (options.json) {
          console.log(JSON.stringify(entries, null, 2));
          return;
        }

        if (entries.length === 0) {
          consoleLogger.info(`No conversation entries found for ${sender}.`);
          return;
        }

        console.log(`Conversation entries for ${sender}: ${entries.length}`);
        for (const entry of entries) {
          const timestamp = entry.date ?? entry.savedAt;
          const subject = entry.subject ?? "(no subject)";
          console.log(
            `- [${entry.direction}] ${timestamp} | ${subject} | from=${entry.from.join(", ")} | to=${entry.to.join(", ")} | dir=${entry.messageDir}`
          );
        }
      })
    );

  await program.parseAsync(process.argv);
}

await run();
