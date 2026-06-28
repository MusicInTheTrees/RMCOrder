const { generateOrderId } = require('../orders/idGenerator');

const FIXED_DATE = '2026-06-28';
beforeAll(() => {
  jest.spyOn(global, 'Date').mockImplementation(function() {
    return { toISOString: () => `${FIXED_DATE}T00:00:00.000Z` };
  });
});
afterAll(() => jest.restoreAllMocks());

test('generates RMC-001 when no existing orders', () => {
  expect(generateOrderId([])).toBe('RMC-001-2026-06-28');
});

test('increments from highest existing order', () => {
  expect(generateOrderId(['RMC-001-2026-06-01', 'RMC-003-2026-06-15', 'RMC-002-2026-06-10']))
    .toBe('RMC-004-2026-06-28');
});

test('ignores non-RMC folder names', () => {
  expect(generateOrderId(['SomeOtherFolder', 'RMC-002-2026-01-01'])).toBe('RMC-003-2026-06-28');
});
