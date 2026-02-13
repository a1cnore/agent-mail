import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { z } from "zod";
import type { Logger } from "../types";
import { loadMailEnvConfig } from "../config/env";
import { saveSentMessage } from "./saveSentMessage";

const recipientSchema = z.string().trim().email();

export interface SendMailInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: string[];
}

const sendMailInputSchema = z
  .object({
    to: z.array(recipientSchema).min(1),
    cc: z.array(recipientSchema).default([]),
    bcc: z.array(recipientSchema).default([]),
    subject: z.string().trim().min(1),
    text: z.string().optional(),
    html: z.string().optional(),
    attachments: z.array(z.string().trim().min(1)).default([])
  })
  .superRefine((value, context) => {
    if (!value.text && !value.html) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either text or html content must be provided."
      });
    }
  });

export function parseAddressList(raw: string): string[] {
  const addresses = raw
    .split(/[;,]/g)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return z.array(recipientSchema).min(1).parse(addresses);
}

export function parseSendMailInput(input: SendMailInput) {
  return sendMailInputSchema.parse(input);
}

export async function sendMail(input: SendMailInput, logger: Logger): Promise<{ messageId: string }> {
  const parsedInput = parseSendMailInput(input);
  const envConfig = await loadMailEnvConfig();

  for (const attachmentPath of parsedInput.attachments) {
    const resolvedPath = path.resolve(attachmentPath);
    await access(resolvedPath, fsConstants.R_OK);
  }

  const transporter = nodemailer.createTransport({
    host: envConfig.smtp.host,
    port: envConfig.smtp.port,
    secure: envConfig.smtp.secure,
    auth: {
      user: envConfig.smtp.user,
      pass: envConfig.smtp.pass
    }
  });

  const result = await transporter.sendMail({
    from: envConfig.email,
    to: parsedInput.to,
    cc: parsedInput.cc,
    bcc: parsedInput.bcc,
    subject: parsedInput.subject,
    text: parsedInput.text,
    html: parsedInput.html,
    attachments: parsedInput.attachments.map((attachmentPath) => ({
      path: path.resolve(attachmentPath)
    }))
  });

  try {
    await saveSentMessage({
      messageId: result.messageId ?? null,
      from: envConfig.email,
      to: parsedInput.to,
      cc: parsedInput.cc,
      bcc: parsedInput.bcc,
      subject: parsedInput.subject,
      text: parsedInput.text,
      html: parsedInput.html,
      attachmentPaths: parsedInput.attachments
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Message sent but failed to persist sent mail locally: ${message}`);
  }

  logger.info(`Sent message ${result.messageId}`);
  return { messageId: result.messageId };
}
