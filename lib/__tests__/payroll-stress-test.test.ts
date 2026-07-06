import { describe, expect, it } from 'vitest';
import { runAllStressTests, STRESS_SCENARIOS } from '../payroll-stress-test';

describe('payroll stress scenarios (auditor)', () => {
  it('defines at least the flex-shortfall and deferred-drawdown cases', () => {
    const ids = STRESS_SCENARIOS.map((s) => s.id);
    expect(ids).toContain('flex-insufficient');
    expect(ids).toContain('deferred-drawdown');
  });

  it('all stress scenarios pass against computePayroll', () => {
    const runs = runAllStressTests();
    for (const { scenario, expectations, allPass } of runs) {
      expect(allPass, `Scenario failed: ${scenario.title}`).toBe(true);
      expect(expectations.length).toBeGreaterThan(0);
    }
  });
});
