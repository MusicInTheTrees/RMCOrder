const { google } = require('googleapis');
const fs = require('fs');
const { Readable } = require('stream');
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

async function uploadFileContent(name, content, parentId) {
  const drive = getDrive();
  const existing = await findFileByName(name, parentId);
  const buf = Buffer.from(typeof content === 'string' ? content : JSON.stringify(content), 'utf8');
  const media = { mimeType: 'application/json', body: Readable.from(buf) };
  if (existing) {
    await drive.files.update({ fileId: existing.id, requestBody: {}, media });
    return existing.id;
  }
  const res = await drive.files.create({
    requestBody: { name, parents: [parentId] },
    media,
    fields: 'id',
  });
  return res.data.id;
}

async function downloadFileContent(fileId) {
  const drive = getDrive();
  const chunks = [];
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
  return new Promise((resolve, reject) => {
    res.data.on('data', chunk => chunks.push(chunk));
    res.data.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    res.data.on('error', reject);
  });
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
  uploadFileContent,
  downloadFileContent,
};
