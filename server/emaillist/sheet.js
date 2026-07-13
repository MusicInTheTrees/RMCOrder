const config = require('../config');
const { findFileByName, createSpreadsheet } = require('../drive/client');
const { clearRange, writeRange } = require('../sheets/client');
const { readSettings, writeSettings } = require('../settings/store');
const { readContacts } = require('./store');

const SHEET_NAME = 'RMC Email List';

async function ensureEmailListSheet() {
  const settings = readSettings();
  if (settings.emailListSheetId) return settings.emailListSheetId;
  const existing = await findFileByName(SHEET_NAME, config.DRIVE.TOP_LEVEL_FOLDER);
  const sheetId = existing ? existing.id : await createSpreadsheet(SHEET_NAME, config.DRIVE.TOP_LEVEL_FOLDER);
  writeSettings({ ...readSettings(), emailListSheetId: sheetId });
  return sheetId;
}

// May reject when Drive is unreachable — callers must .catch().
async function syncEmailListSheet() {
  const sheetId = await ensureEmailListSheet();
  const rows = [
    ['Name', 'Email', 'Status', 'Added', 'Source'],
    ...readContacts().map(c => [c.name, c.email, c.status, c.addedAt, c.source]),
  ];
  await clearRange(sheetId, 'A1:Z10000');
  await writeRange(sheetId, 'A1', rows, 'RAW');
}

module.exports = { ensureEmailListSheet, syncEmailListSheet, SHEET_NAME };
