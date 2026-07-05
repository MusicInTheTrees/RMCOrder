const { readSettings, writeSettings } = require('../settings/store');
const { createSpreadsheet } = require('../drive/client');
const { getSheetNames, addSheet, clearRange, writeRange } = require('../sheets/client');
const config = require('../config');

const SHEET_NAME = 'RMC Blank Demand Stats';
const TABS = ['Shirts', 'Other'];
const HEADER = ['Item Type', 'Color', 'Size', 'Total Ordered'];

async function isReachable(sheetId) {
  try { await getSheetNames(sheetId); return true; }
  catch { return false; }
}

async function createAndPersist() {
  const id = await createSpreadsheet(SHEET_NAME, config.DRIVE.TOP_LEVEL_FOLDER);
  writeSettings({ ...readSettings(), blankStatsSheetId: id });
  return id;
}

async function getOrCreateStatsSheet() {
  const existing = readSettings().blankStatsSheetId;
  if (existing && (await isReachable(existing))) return existing;
  return createAndPersist();
}

async function ensureTab(sheetId, title, existingNames) {
  if (!existingNames.includes(title)) await addSheet(sheetId, title);
}

function rowsToValues(rows, orderCount, updatedAt) {
  const banner = `Last refreshed: ${updatedAt} · ${orderCount} orders counted`;
  const values = [[banner], HEADER];
  for (const r of rows) values.push([r.itemType, r.color, r.size, r.total]);
  return values;
}

async function writeStats(sheetId, { shirts, other, orderCount, updatedAt }) {
  const names = await getSheetNames(sheetId);
  await ensureTab(sheetId, 'Shirts', names);
  await ensureTab(sheetId, 'Other', names);
  const byTab = { Shirts: shirts, Other: other };
  for (const tab of TABS) {
    await clearRange(sheetId, `${tab}!A1:Z10000`);
    await writeRange(sheetId, `${tab}!A1`, rowsToValues(byTab[tab], orderCount, updatedAt), 'RAW');
  }
}

module.exports = { getOrCreateStatsSheet, writeStats, SHEET_NAME };
