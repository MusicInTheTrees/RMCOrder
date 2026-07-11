const { normalizeState } = require('../orders/state');

test('normalizeState maps paid to fulfilled', () => {
  expect(normalizeState('paid')).toBe('fulfilled');
});

test('normalizeState leaves other states unchanged', () => {
  for (const s of ['building', 'sent', 'pending', 'fulfilled', 'received', 'shipped', 'delayed']) {
    expect(normalizeState(s)).toBe(s);
  }
});

test('normalizeState passes through undefined/empty', () => {
  expect(normalizeState(undefined)).toBe(undefined);
  expect(normalizeState('')).toBe('');
});
