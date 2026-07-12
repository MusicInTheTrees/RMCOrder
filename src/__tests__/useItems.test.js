import { renderHook, act } from '@testing-library/react';
import { vi, test, expect, beforeEach, afterEach } from 'vitest';
import { useItems } from '../hooks/useItems';
import { putItem } from '../api/items';

vi.mock('../api/items', () => ({
  getItems: vi.fn().mockResolvedValue({ items: [{ id: 'i1', name: 'Tee' }] }),
  postItem: vi.fn(),
  putItem: vi.fn().mockResolvedValue({}),
  deleteItem: vi.fn(),
  scrapeColors: vi.fn(),
  pushCatalog: vi.fn(),
  pullCatalog: vi.fn(),
}));

beforeEach(() => {
  vi.useFakeTimers();
  putItem.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

test('updateItem debounces a save to the API', async () => {
  const { result } = renderHook(() => useItems());
  await act(async () => { await vi.advanceTimersByTimeAsync(0); }); // let catalog load

  act(() => { result.current.updateItem({ id: 'i1', name: 'Renamed' }); });
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });

  expect(putItem).toHaveBeenCalledWith('i1', { id: 'i1', name: 'Renamed' });
});

test('pending debounced saves are cancelled on unmount', async () => {
  const { result, unmount } = renderHook(() => useItems());
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });

  act(() => { result.current.updateItem({ id: 'i1', name: 'Renamed' }); });
  unmount();
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });

  expect(putItem).not.toHaveBeenCalled();
});
