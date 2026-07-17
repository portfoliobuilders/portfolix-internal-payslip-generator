/**
 * Normalization helpers for company name and address text.
 * Used when saving Settings to collapse spurious whitespace and duplicate commas.
 */

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
