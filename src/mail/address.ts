const EMAIL_REGEX = /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function extractEmailsFromAddress(value: string): string[] {
  const matches = value.match(EMAIL_REGEX) ?? [];

  const deduped = new Set<string>();
  for (const match of matches) {
    deduped.add(normalizeEmail(match));
  }

  return [...deduped];
}

export function extractEmailsFromAddressList(values: string[]): string[] {
  const deduped = new Set<string>();

  for (const value of values) {
    for (const extracted of extractEmailsFromAddress(value)) {
      deduped.add(extracted);
    }
  }

  return [...deduped];
}

export function addressListContainsEmail(values: string[], targetEmail: string): boolean {
  const normalizedTarget = normalizeEmail(targetEmail);
  return extractEmailsFromAddressList(values).includes(normalizedTarget);
}
