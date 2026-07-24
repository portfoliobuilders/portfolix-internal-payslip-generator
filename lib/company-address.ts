/**
 * Company legal name / registered-office address helpers.
 * - Normalization for Settings save (collapse whitespace / duplicate commas)
 * - Formatting / wrapping for bank-facing documents (never shortens legal content)
 */

const PLACEHOLDER_TOKENS = [
  'SET-IN-SETTINGS',
  'TODO',
  'TBD',
  'PLACEHOLDER',
  'EXAMPLE',
  'DUMMY',
  'UNDEFINED',
  'NULL',
] as const;

/**
 * Normalize a legal company name:
 * - Trim leading/trailing whitespace
 * - Collapse internal runs of whitespace to a single space
 * - Collapse duplicate / trailing commas (live prints showed "Portfolix Hub,,")
 */
export function normalizeLegalName(name: string): string {
  return normalizeAddressText(name);
}

/**
 * Normalize an address line or full address string:
 * - Trim leading/trailing whitespace
 * - Collapse internal runs of whitespace to a single space
 * - Remove duplicate commas and comma-only fragments (e.g. ", ,")
 */
export function normalizeAddressText(address: string): string {
  return address
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/,\s*,+/g, ',')
    .replace(/,(\s*,)+/g, ',')
    .replace(/^\s*,+\s*/g, '')
    .replace(/\s*,+\s*$/g, '')
    .trim();
}

/** Trim, collapse spaces, drop empty segments, remove duplicate commas. */
export function formatRegisteredAddress(raw: string | null | undefined): string {
  if (raw == null) return '';
  return String(raw)
    .replace(/\r\n/g, '\n')
    .split(/[\n,]+/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(', ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*$/g, '')
    .trim();
}

/**
 * Wrap a formatted address into 2–3 lines for letterhead.
 * Never appends an ellipsis; never truncates legal content.
 */
export function wrapRegisteredAddress(
  raw: string | null | undefined,
  maxLineLength = 52,
): string[] {
  const formatted = formatRegisteredAddress(raw);
  if (!formatted) return [];

  const words = formatted.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxLineLength) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);

  // Prefer at most 3 lines; if longer, keep all lines (no ellipsis).
  return lines;
}

export function registeredAddressIncomplete(raw: string | null | undefined): boolean {
  const formatted = formatRegisteredAddress(raw);
  if (!formatted || formatted.length < 12) return true;
  const upper = formatted.toUpperCase();
  return PLACEHOLDER_TOKENS.some((token) => upper.includes(token));
}

export function containsPlaceholderToken(value: string | null | undefined): boolean {
  if (value == null) return true;
  const trimmed = String(value).trim();
  if (!trimmed) return true;
  const upper = trimmed.toUpperCase();
  return PLACEHOLDER_TOKENS.some(
    (token) => upper === token || upper.includes(token),
  );
}
