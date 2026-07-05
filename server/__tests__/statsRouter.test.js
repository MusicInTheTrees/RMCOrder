const request = require('supertest');

jest.mock('../auth/oauth', () => ({
  loadTokens: () => ({ refresh_token: 'x' }),
  getOAuth2Client: () => ({}),
}));
jest.mock('../orders/cache', () => ({
  readOrderCache: jest.fn(), writeOrderCache: jest.fn(), deleteOrderCache: jest.fn(),
  readAllOrderCaches: jest.fn(),
}));
jest.mock('../items/store', () => ({ readCatalog: jest.fn(), writeCatalog: jest.fn() }));
jest.mock('../stats/blankStatsSheet', () => ({
  getOrCreateStatsSheet: jest.fn(), writeStats: jest.fn(), SHEET_NAME: 'RMC Blank Demand Stats',
}));

const { readAllOrderCaches } = require('../orders/cache');
const { readCatalog } = require('../items/store');
const { getOrCreateStatsSheet, writeStats } = require('../stats/blankStatsSheet');

function getApp() { return require('../index'); }
beforeEach(() => jest.clearAllMocks());

test('POST /stats/refresh aggregates, writes, and returns a summary', async () => {
  readAllOrderCaches.mockReturnValue([
    { state: 'sent', lineItems: [
      { itemTypeName: 'Unisex Tee', itemTypeId: 'tee1', color: 'Black', sizes: { L: { total: 4, inventory: 0 } } },
    ] },
    { state: 'building', lineItems: [
      { itemTypeName: 'Unisex Tee', itemTypeId: 'tee1', color: 'Black', sizes: { L: { total: 99, inventory: 0 } } },
    ] },
  ]);
  readCatalog.mockReturnValue({ items: [{ id: 'tee1', name: 'Unisex Tee', stockBlanks: true }] });
  getOrCreateStatsSheet.mockResolvedValue('sheetXYZ');
  writeStats.mockResolvedValue();

  const res = await request(getApp()).post('/stats/refresh');
  expect(res.status).toBe(200);
  expect(res.body.sheetId).toBe('sheetXYZ');
  expect(res.body.sheetUrl).toBe('https://docs.google.com/spreadsheets/d/sheetXYZ');
  expect(res.body.orderCount).toBe(1); // building excluded
  expect(res.body.rowCount).toBe(1);

  const payload = writeStats.mock.calls[0][1];
  expect(payload.shirts[0]).toEqual({ itemType: 'Unisex Tee', color: 'Black', size: 'L', total: 4 });
  expect(payload.orderCount).toBe(1);
});

test('POST /stats/refresh returns 500 with the message when writing fails', async () => {
  readAllOrderCaches.mockReturnValue([]);
  readCatalog.mockReturnValue({ items: [] });
  getOrCreateStatsSheet.mockRejectedValue(new Error('Drive is down'));

  const res = await request(getApp()).post('/stats/refresh');
  expect(res.status).toBe(500);
  expect(res.body.error).toBe('Drive is down');
});
