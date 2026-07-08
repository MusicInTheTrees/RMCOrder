import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/client', () => ({ apiFetch: vi.fn(() => Promise.resolve({ ok: true })) }));
import { apiFetch } from '../api/client';
import { computeBlankPlan, getBlankOrderConfig } from '../api/blankOrder';

describe('blankOrder api', () => {
  beforeEach(() => apiFetch.mockClear());
  test('computeBlankPlan POSTs to /blankorder/plan', async () => {
    await computeBlankPlan({ grandTotal: 10 });
    expect(apiFetch).toHaveBeenCalledWith('/blankorder/plan', { method: 'POST', body: { grandTotal: 10 } });
  });
  test('getBlankOrderConfig GETs /blankorder/config', async () => {
    await getBlankOrderConfig();
    expect(apiFetch).toHaveBeenCalledWith('/blankorder/config');
  });
});
