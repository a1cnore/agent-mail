import { createHash } from "node:crypto";
import { normalizeEmail } from "./address";

export function normalizeMessageIdList(values: string[] | string | null | undefined): string[] {
  const rawValues = Array.isArray(values) ? values : typeof values === "string" ? [values] : [];
  const deduped = new Set<string>();

  for (const value of rawValues) {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      deduped.add(trimmed);
    }
  }

  return [...deduped];
}

export function parseReferencesHeader(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return normalizeMessageIdList(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
  );
}

export function deriveMailSessionId(profileId: string, senderEmail: string): string {
  const normalizedProfileId = profileId.trim().length > 0 ? profileId.trim() : "default";
  const normalizedSenderEmail = normalizeEmail(senderEmail);
  const senderHash = createHash("sha1").update(normalizedSenderEmail).digest("hex").slice(0, 12);
  return `mail:${normalizedProfileId}:${senderHash}`;
}

export function deriveOpenClawMailSessionKey(agentId: string, senderEmail: string): string {
  const normalizedAgentId = agentId.trim().length > 0 ? agentId.trim() : "main";
  const normalizedSenderEmail = normalizeEmail(senderEmail);
  return `agent:${normalizedAgentId}:mail:${normalizedSenderEmail}`;
}

export function formatReplySubject(subject: string | null | undefined): string {
  const normalizedSubject = subject?.trim() ?? "";
  if (normalizedSubject.length === 0) {
    return "Re:";
  }

  if (/^re:/i.test(normalizedSubject)) {
    return normalizedSubject;
  }

  return `Re: ${normalizedSubject}`;
}
