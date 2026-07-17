import { describe, expect, it } from 'vitest';
import { normalizeAddressText, normalizeLegalName } from '../company-address';
import { cleanupStoredEntityText, mergeSettings, SEED_SETTINGS } from '../settings-defaults';

describe('normalizeLegalName / normalizeAddressText', () => {
  it('collapses whitespace in legal names', () => {
    expect(normalizeLegalName('  Portfolix   Hub  ')).toBe('Portfolix Hub');
  });

  it('removes duplicate commas from addresses (live-print defects)', () => {
    expect(normalizeAddressText('Portfolix Hub,, Puthiya Road,, Kochi')).toBe(
      'Portfolix Hub, Puthiya Road, Kochi',
    );
    expect(normalizeAddressText('Puthiya Road,,')).toBe('Puthiya Road');
  });
});

describe('one-off settings cleanup on merge', () => {
  it('cleans stored entity name and address when loading settings', () => {
    const merged = mergeSettings({
      entities: {
        ...SEED_SETTINGS.entities,
        PH: {
          ...SEED_SETTINGS.entities.PH,
          name: 'Portfolix Hub,,',
          registeredAddress: 'Puthiya Road,, Kochi,, Kerala',
          addressLines: ['Puthiya Road,,', 'Kochi'],
        },
      },
    });
    expect(merged.entities.PH.name).toBe('Portfolix Hub');
    expect(merged.entities.PH.registeredAddress).toBe('Puthiya Road, Kochi, Kerala');
    expect(merged.entities.PH.addressLines).toEqual(['Puthiya Road', 'Kochi']);
  });

  it('cleanupStoredEntityText is idempotent', () => {
    const once = cleanupStoredEntityText(SEED_SETTINGS.entities.PX);
    const twice = cleanupStoredEntityText(once);
    expect(twice).toEqual(once);
  });
});
