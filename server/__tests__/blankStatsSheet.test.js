jest.mock('../settings/store', () => ({ readSettings: jest.fn(), writeSettings: jest.fn() }));
jest.mock('../drive/client', () => ({ createSpreadsheet: jest.fn() }));
jest.mock('../sheets/client', () => ({
  getSheetNames: jest.fn(), addSheet: jest.fn(), clearRange: jest.fn(), writeRange: jest.fn(),
}));

const { readSettings, writeSettings } = require('../settings/store');
const { createSpreadsheet } = require('../drive/client');
const { getSheetNames, addSheet, clearRange, writeRange } = require('../sheets/client');
const { getOrCreateStatsSheet, writeStats, SHEET_NAME } = require('../stats/blankStatsSheet');

beforeEach(() => jest.clearAllMocks());

test('reuses stored sheet id when the sheet is reachable', async () => {
  readSettings.mockReturnValue({ blankStatsSheetId: 'existing123' });
  getSheetNames.mockResolvedValue(['Shirts', 'Other']);
  const id = await getOrCreateStatsSheet();
  expect(id).toBe('existing123');
  expect(createSpreadsheet).not.toHaveBeenCalled();
  expect(writeSettings).not.toHaveBeenCalled();
});

test('creates and persists a new sheet when none is stored', async () => {
  readSettings.mockReturnValue({});
  createSpreadsheet.mockResolvedValue('new456');
  const id = await getOrCreateStatsSheet();
  expect(createSpreadsheet).toHaveBeenCalledWith(SHEET_NAME, expect.any(String));
  expect(id).toBe('new456');
  expect(writeSettings).toHaveBeenCalledWith(expect.objectContaining({ blankStatsSheetId: 'new456' }));
});

test('recreates when the stored sheet is unreachable', async () => {
  readSettings.mockReturnValue({ blankStatsSheetId: 'gone789' });
  getSheetNames.mockRejectedValue(new Error('File not found'));
  createSpreadsheet.mockResolvedValue('fresh000');
  const id = await getOrCreateStatsSheet();
  expect(id).toBe('fresh000');
  expect(writeSettings).toHaveBeenCalledWith(expect.objectContaining({ blankStatsSheetId: 'fresh000' }));
});

test('writeStats ensures tabs, clears, and writes header + rows to both tabs', async () => {
  getSheetNames.mockResolvedValue([]); // neither tab exists yet
  await writeStats('sheetABC', {
    shirts: [{ itemType: 'Unisex Tee', color: 'Black', size: 'L', total: 42 }],
    other: [{ itemType: 'Mug', color: 'White', size: 'OS', total: 6 }],
    orderCount: 3,
    updatedAt: '2026-07-04 14:22',
  });
  expect(addSheet).toHaveBeenCalledWith('sheetABC', 'Shirts');
  expect(addSheet).toHaveBeenCalledWith('sheetABC', 'Other');
  expect(clearRange).toHaveBeenCalledWith('sheetABC', 'Shirts!A1:Z10000');
  const shirtsWrite = writeRange.mock.calls.find(c => c[1] === 'Shirts!A1');
  expect(shirtsWrite[2][0][0]).toContain('Last refreshed: 2026-07-04 14:22');
  expect(shirtsWrite[2][1]).toEqual(['Item Type', 'Color', 'Size', 'Total Ordered']);
  expect(shirtsWrite[2][2]).toEqual(['Unisex Tee', 'Black', 'L', 42]);
});
