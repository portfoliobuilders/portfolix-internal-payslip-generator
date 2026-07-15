import { describe, expect, it } from 'vitest';
import {
  addPaise,
  fromPaise,
  moneyEquals,
  reconcileNet,
  roundRupees,
  subPaise,
  toPaise,
} from '../money';

describe('money (paise arithmetic)', () => {
  it('converts rupees to paise without float drift', () => {
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(fromPaise(toPaise(0.1 + 0.2))).toBe(0.3);
  });

  it('rounds to nearest paise', () => {
    expect(toPaise(1.004)).toBe(100);
    expect(toPaise(1.006)).toBe(101);
    expect(toPaise(10.01)).toBe(1001);
    expect(toPaise(-10.01)).toBe(-1001);
  });

  it('adds and subtracts in paise', () => {
    expect(fromPaise(addPaise(toPaise(100.01), toPaise(0.02)))).toBe(100.03);
    expect(fromPaise(subPaise(toPaise(50), toPaise(0.01)))).toBe(49.99);
  });

  it('reconciles net = gross − deductions', () => {
    expect(reconcileNet(50000, 2000, 48000)).toEqual({ ok: true });
    const bad = reconcileNet(50000, 2000, 47999.99);
    expect(bad.ok).toBe(false);
  });

  it('moneyEquals tolerates 1 paise', () => {
    expect(moneyEquals(10, 10.004)).toBe(true);
    expect(moneyEquals(10, 10.02)).toBe(false);
  });

  it('roundRupees is stable', () => {
    expect(roundRupees(1999.999)).toBe(2000);
    expect(roundRupees(0.1 + 0.2)).toBe(0.3);
  });
});
