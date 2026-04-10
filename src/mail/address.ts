const EMAIL_REGEX = /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function dedupeNormalizedEmails(values: string[]): string[] {
  const deduped = new Set<string>();
  for (const value of values) {
    const normalized = normalizeEmail(value);
    if (normalized.length > 0) {
      deduped.add(normalized);
    }
  }

  return [...deduped];
}

export function extractEmailsFromAddress(value: string): string[] {
  const matches = value.match(EMAIL_REGEX) ?? [];

  return dedupeNormalizedEmails(matches);
}

export function extractEmailsFromAddressList(values: string[]): string[] {
  return dedupeNormalizedEmails(values.flatMap((value) => extractEmailsFromAddress(value)));
}

export function addressListContainsEmail(values: string[], targetEmail: string): boolean {
  const normalizedTarget = normalizeEmail(targetEmail);
  return extractEmailsFromAddressList(values).includes(normalizedTarget);
}
