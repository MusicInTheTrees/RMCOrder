import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch } from '../api/client';
import { refreshBlankStats } from '../api/stats';

vi.mock('../api/client', () => ({ apiFetch: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe('refreshBlankStats', () => {
  it('POSTs to /stats/refresh and returns the summary', async () => {
    apiFetch.mockResolvedValue({ sheetId: 's1', sheetUrl: 'u', orderCount: 3, rowCount: 10, updatedAt: 't' });
    const result = await refreshBlankStats();
    expect(apiFetch).toHaveBeenCalledWith('/stats/refresh', { method: 'POST' });
    expect(result.orderCount).toBe(3);
  });
});
