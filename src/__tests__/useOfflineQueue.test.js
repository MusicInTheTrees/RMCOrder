import { renderHook, act } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import { useOfflineQueue } from '../hooks/useOfflineQueue';

let onLine = true;

beforeEach(() => {
  vi.useFakeTimers();
  onLine = true;
  vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => onLine);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function tick(ms) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

describe('useOfflineQueue', () => {
  test('keeps only the latest queued save per key', async () => {
    const { result } = renderHook(() => useOfflineQueue());
    const stale = vi.fn().mockResolvedValue();
    const latest = vi.fn().mockResolvedValue();

    act(() => {
      result.current.enqueue('sheet-1', stale);
      result.current.enqueue('sheet-1', latest);
    });

    await tick(10000);
    expect(stale).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  test('does not flush while offline', async () => {
    const { result } = renderHook(() => useOfflineQueue());
    const fn = vi.fn().mockResolvedValue();

    onLine = false;
    act(() => { window.dispatchEvent(new Event('offline')); });
    act(() => { result.current.enqueue('sheet-1', fn); });

    await tick(30000);
    expect(fn).not.toHaveBeenCalled();
  });

  test('re-enqueues a failed flush and retries on the next interval', async () => {
    const { result } = renderHook(() => useOfflineQueue());
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('still down'))
      .mockResolvedValueOnce();

    act(() => { result.current.enqueue('sheet-1', fn); });

    await tick(10000);
    expect(fn).toHaveBeenCalledTimes(1); // failed, kept in queue

    await tick(10000);
    expect(fn).toHaveBeenCalledTimes(2); // retried and succeeded
    expect(result.current.queueLength).toBe(0);
  });

  test('flushes queued saves when the browser comes back online', async () => {
    const { result } = renderHook(() => useOfflineQueue());
    const fn = vi.fn().mockResolvedValue();

    onLine = false;
    act(() => { window.dispatchEvent(new Event('offline')); });
    act(() => { result.current.enqueue('sheet-1', fn); });

    onLine = true;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('flushes sequentially, one save at a time', async () => {
    const { result } = renderHook(() => useOfflineQueue());
    const order = [];
    const first = vi.fn(async () => {
      order.push('first-start');
      await new Promise(r => setTimeout(r, 50));
      order.push('first-end');
    });
    const second = vi.fn(async () => { order.push('second-start'); });

    act(() => {
      result.current.enqueue('sheet-1', first);
      result.current.enqueue('sheet-2', second);
    });

    await tick(10100);
    expect(order).toEqual(['first-start', 'first-end', 'second-start']);
  });

  test('exposes queue length as reactive state', async () => {
    const { result } = renderHook(() => useOfflineQueue());
    onLine = false;
    act(() => { window.dispatchEvent(new Event('offline')); });
    act(() => { result.current.enqueue('sheet-1', vi.fn().mockResolvedValue()); });
    expect(result.current.queueLength).toBe(1);
  });
});
