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

async function writeRange(spreadsheetId, range, values) {
  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    resource: { values },
  });
}

async function clearRange(spreadsheetId, range) {
  const sheets = getSheets();
  await sheets.spreadsheets.values.clear({ spreadsheetId, range });
}

async function addSheet(spreadsheetId, title) {
  const sheets = getSheets();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: { requests: [{ addSheet: { properties: { title } } }] },
  });
}

async function getSheetNames(spreadsheetId) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  return res.data.sheets.map(s => s.properties.title);
}

module.exports = { readRange, writeRange, clearRange, addSheet, getSheetNames };
