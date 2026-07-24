import { describe, expect, it } from 'vitest';
import { coarseUserAgent } from '../coarse-user-agent';
import { formatCheckedAtIst } from '../format';

describe('coarseUserAgent', () => {
  it('returns browser family and platform only', () => {
    expect(
      coarseUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      ),
    ).toBe('Chrome · Windows');
    expect(
      coarseUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari · iOS');
  });

  it('never echoes the raw user-agent string', () => {
    const raw =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/125.0.0.0 Mobile Safari/537.36';
    const coarse = coarseUserAgent(raw);
    expect(coarse).toBe('Chrome · Android');
    expect(coarse).not.toContain('Mozilla');
    expect(coarse).not.toContain('Pixel');
  });
});

describe('formatCheckedAtIst', () => {
  it('appends an IST label', () => {
    const label = formatCheckedAtIst('2026-07-19T10:50:00.000Z');
    expect(label).toMatch(/IST$/);
    expect(label).toMatch(/19/);
    expect(label).toMatch(/Jul/);
    expect(label).toMatch(/2026/);
  });
});
