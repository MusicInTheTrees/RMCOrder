const fs = require('fs');
const path = require('path');

jest.mock('../drive/client', () => ({
  findFileByName: jest.fn(),
  createSpreadsheet: jest.fn(),
}));
jest.mock('../sheets/client', () => ({
  clearRange: jest.fn().mockResolvedValue(),
  writeRange: jest.fn().mockResolvedValue(),
}));

const config = require('../config');
const TEST_SETTINGS = path.join(__dirname, 'emaillist-settings-test.json');
const TEST_LIST = path.join(__dirname, 'emaillist-sheet-test.json');
const realSettings = config.SETTINGS_FILE;
const realList = config.EMAIL_LIST_FILE;

beforeEach(() => {
  config.SETTINGS_FILE = TEST_SETTINGS;
  config.EMAIL_LIST_FILE = TEST_LIST;
  for (const f of [TEST_SETTINGS, TEST_LIST]) if (fs.existsSync(f)) fs.unlinkSync(f);
  jest.clearAllMocks();
});
afterEach(() => {
  config.SETTINGS_FILE = realSettings;
  config.EMAIL_LIST_FILE = realList;
  for (const f of [TEST_SETTINGS, TEST_LIST]) if (fs.existsSync(f)) fs.unlinkSync(f);
});

const { findFileByName, createSpreadsheet } = require('../drive/client');
const { clearRange, writeRange } = require('../sheets/client');
const { ensureEmailListSheet, syncEmailListSheet } = require('../emaillist/sheet');
const { upsertContacts } = require('../emaillist/store');
const { readSettings } = require('../settings/store');

test('ensureEmailListSheet creates the sheet and saves its id to settings', async () => {
  findFileByName.mockResolvedValue(null);
  createSpreadsheet.mockResolvedValue('new-sheet-id');
  const id = await ensureEmailListSheet();
  expect(id).toBe('new-sheet-id');
  expect(createSpreadsheet).toHaveBeenCalledWith('RMC Email List', config.DRIVE.TOP_LEVEL_FOLDER);
  expect(readSettings().emailListSheetId).toBe('new-sheet-id');
});

test('ensureEmailListSheet reuses an existing Drive file by name', async () => {
  findFileByName.mockResolvedValue({ id: 'found-id', name: 'RMC Email List' });
  expect(await ensureEmailListSheet()).toBe('found-id');
  expect(createSpreadsheet).not.toHaveBeenCalled();
});

test('ensureEmailListSheet short-circuits when settings already hold an id', async () => {
  const { writeSettings, readSettings: rs } = require('../settings/store');
  writeSettings({ ...rs(), emailListSheetId: 'saved-id' });
  expect(await ensureEmailListSheet()).toBe('saved-id');
  expect(findFileByName).not.toHaveBeenCalled();
});

test('syncEmailListSheet clears then writes header + contact rows', async () => {
  const { writeSettings, readSettings: rs } = require('../settings/store');
  writeSettings({ ...rs(), emailListSheetId: 'sheet-1' });
  upsertContacts([{ name: 'Ann', email: 'ann@x.com', source: 'manual' }]);
  await syncEmailListSheet();
  expect(clearRange).toHaveBeenCalledWith('sheet-1', 'A1:Z10000');
  const [sheetId, range, rows, opt] = writeRange.mock.calls[0];
  expect(sheetId).toBe('sheet-1');
  expect(range).toBe('A1');
  expect(rows[0]).toEqual(['Name', 'Email', 'Status', 'Added', 'Source']);
  expect(rows[1][1]).toBe('ann@x.com');
  expect(opt).toBe('RAW');
});
