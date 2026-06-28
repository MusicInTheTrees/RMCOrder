const { writeOrderCache, readOrderCache, deleteOrderCache } = require('../orders/cache');

const TEST_ID = 'RMC-TEST-2026-06-28';
afterEach(() => deleteOrderCache(TEST_ID));

test('writeOrderCache then readOrderCache round-trips data', () => {
  const data = { orderId: TEST_ID, state: 'building', lineItems: [] };
  writeOrderCache(TEST_ID, data);
  expect(readOrderCache(TEST_ID)).toEqual(data);
});

test('readOrderCache returns null for missing order', () => {
  expect(readOrderCache('RMC-MISSING-2026-01-01')).toBeNull();
});
