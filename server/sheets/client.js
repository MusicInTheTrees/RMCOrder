const { google } = require('googleapis');
const { getOAuth2Client } = require('../auth/oauth');

function getSheets() {
  return google.sheets({ version: 'v4', auth: getOAuth2Client() });
}

async function readRange(spreadsheetId, range) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return res.data.values || [];
}

async function writeRange(spreadsheetId, range, values, inputOption = 'USER_ENTERED') {
  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: inputOption,
    resource: { values },
  });
}

async function clearRange(spreadsheetId, range) {
  const sheets = getSheets();
  await sheets.spreadsheets.values.clear({ spreadsheetId, range });
}

async function addSheet(spreadsheetId, title) {
  await addSheets(spreadsheetId, [title]);
}

async function addSheets(spreadsheetId, titles) {
  if (titles.length === 0) return;
  const sheets = getSheets();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: { requests: titles.map(title => ({ addSheet: { properties: { title } } })) },
  });
}

async function batchClearRanges(spreadsheetId, ranges) {
  const sheets = getSheets();
  await sheets.spreadsheets.values.batchClear({ spreadsheetId, resource: { ranges } });
}

// data: [{ range, values }]
async function batchWriteRanges(spreadsheetId, data, inputOption = 'USER_ENTERED') {
  const sheets = getSheets();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    resource: { valueInputOption: inputOption, data },
  });
}

async function getSheetNames(spreadsheetId) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  return res.data.sheets.map(s => s.properties.title);
}

module.exports = { readRange, writeRange, clearRange, addSheet, addSheets, batchClearRanges, batchWriteRanges, getSheetNames };
