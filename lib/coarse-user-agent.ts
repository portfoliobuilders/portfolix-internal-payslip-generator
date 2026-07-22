/**
 * Coarse browser family + platform for verification hit logging.
 * Never returns raw UA strings; never fingerprints.
 */

export function coarseUserAgent(raw: string | null | undefined): string {
  const ua = (raw ?? '').trim();
  if (!ua) return 'Unknown';

  const browser = detectBrowser(ua);
  const platform = detectPlatform(ua);
  return `${browser} · ${platform}`;
}

function detectBrowser(ua: string): string {
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/OPR\/|Opera/i.test(ua)) return 'Opera';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return 'Chrome';
  if (/CriOS\//i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua) && !/Chrome|CriOS|Chromium/i.test(ua)) return 'Safari';
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  return 'Other';
}

function detectPlatform(ua: string): string {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  if (/CrOS/i.test(ua)) return 'Chrome OS';
  return 'Other';
}
