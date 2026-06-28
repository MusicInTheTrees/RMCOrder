const { google } = require('googleapis');
const fs = require('fs');
const { getOAuth2Client } = require('../auth/oauth');

function getDrive() {
  return google.drive({ version: 'v3', auth: getOAuth2Client() });
}

async function listFiles(folderId, mimeTypeFilter = null) {
  const drive = getDrive();
  let q = `'${folderId}' in parents and trashed = false`;
  if (mimeTypeFilter) q += ` and mimeType = '${mimeTypeFilter}'`;
  const res = await drive.files.list({ q, fields: 'files(id, name, mimeType)', pageSize: 200 });
  return res.data.files || [];
}

async function downloadFile(fileId, destPath) {
  const drive = getDrive();
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
  await new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(destPath);
    res.data.pipe(dest);
    dest.on('finish', resolve);
    dest.on('error', reject);
  });
}

async function createFolder(name, parentId) {
  const drive = getDrive();
  const res = await drive.files.create({
    resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
  });
  return res.data.id;
}

async function createSpreadsheet(name, parentId) {
  const drive = getDrive();
  const res = await drive.files.create({
    resource: { name, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [parentId] },
    fields: 'id',
  });
  return res.data.id;
}

async function copyFile(fileId, name, parentId) {
  const drive = getDrive();
  const res = await drive.files.copy({
    fileId,
    resource: { name, parents: [parentId] },
    fields: 'id, name',
  });
  return res.data;
}

async function getFileMetadata(fileId) {
  const drive = getDrive();
  const res = await drive.files.get({ fileId, fields: 'id, name, mimeType, parents, webViewLink' });
  return res.data;
}

async function findFolderByName(name, parentId) {
  const files = await listFiles(parentId, 'application/vnd.google-apps.folder');
  return files.find(f => f.name === name) || null;
}

async function findFileByName(name, parentId) {
  const drive = getDrive();
  const safeName = name.replace(/'/g, "\\'");
  const q = `'${parentId}' in parents and name = '${safeName}' and trashed = false`;
  const res = await drive.files.list({ q, fields: 'files(id, name)', pageSize: 1 });
  return res.data.files?.[0] || null;
}

module.exports = {
  listFiles,
  downloadFile,
  createFolder,
  createSpreadsheet,
  copyFile,
  getFileMetadata,
  findFolderByName,
  findFileByName,
};
