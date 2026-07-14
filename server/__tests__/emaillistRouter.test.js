// server/__tests__/emaillistRouter.test.js
const request = require('supertest');
const fs = require('fs');
const path = require('path');

jest.mock('../emaillist/sheet', () => ({
  syncEmailListSheet: jest.fn().mockResolvedValue(),
  ensureEmailListSheet: jest.fn().mockResolvedValue('sheet-1'),
}));
jest.mock('../drive/designsCache', () => ({
  syncDesignsCache: jest.fn().mockResolvedValue(),
  listCachedDesigns: jest.fn().mockReturnValue([]),
}));
jest.mock('../drive/client', () => ({
  findFileByName: jest.fn().mockResolvedValue(null),
  uploadFileContent: jest.fn().mockResolvedValue('file-id'),
  downloadFileContent: jest.fn(),
}));

const config = require('../config');
const TEST_LIST = path.join(__dirname, 'emaillist-router-test.json');
const realList = config.EMAIL_LIST_FILE;

beforeEach(() => {
  config.EMAIL_LIST_FILE = TEST_LIST;
  if (fs.existsSync(TEST_LIST)) fs.unlinkSync(TEST_LIST);
});
afterEach(() => {
  config.EMAIL_LIST_FILE = realList;
  if (fs.existsSync(TEST_LIST)) fs.unlinkSync(TEST_LIST);
});

const app = require('../index');
const { syncEmailListSheet } = require('../emaillist/sheet');
const { findFileByName, uploadFileContent, downloadFileContent } = require('../drive/client');

test('GET /emaillist returns empty list initially', async () => {
  const res = await request(app).get('/emaillist');
  expect(res.status).toBe(200);
  expect(res.body.contacts).toEqual([]);
});

test('POST /emaillist adds a contact and fires sheet sync', async () => {
  const res = await request(app).post('/emaillist').send({ name: 'Ann', email: 'ann@x.com' });
  expect(res.status).toBe(201);
  expect(res.body.contact).toMatchObject({ email: 'ann@x.com', status: 'subscribed', source: 'manual' });
  expect(syncEmailListSheet).toHaveBeenCalled();
});

test('POST /emaillist rejects invalid email and duplicates', async () => {
  expect((await request(app).post('/emaillist').send({ name: 'X', email: 'not-an-email' })).status).toBe(400);
  await request(app).post('/emaillist').send({ name: 'Ann', email: 'ann@x.com' });
  expect((await request(app).post('/emaillist').send({ name: 'Ann2', email: 'ANN@x.com' })).status).toBe(409);
});

test('PUT /emaillist/:email updates status; 404 for unknown', async () => {
  await request(app).post('/emaillist').send({ name: 'Ann', email: 'ann@x.com' });
  syncEmailListSheet.mockClear();
  const res = await request(app).put('/emaillist/ann@x.com').send({ status: 'unsubscribed' });
  expect(res.status).toBe(200);
  expect(res.body.contact.status).toBe('unsubscribed');
  expect(syncEmailListSheet).toHaveBeenCalled();
  expect((await request(app).put('/emaillist/none@x.com').send({ status: 'unsubscribed' })).status).toBe(404);
});

test('DELETE /emaillist/:email removes the contact; 404 for unknown', async () => {
  await request(app).post('/emaillist').send({ name: 'Ann', email: 'ann@x.com' });
  syncEmailListSheet.mockClear();
  const res = await request(app).delete('/emaillist/ann@x.com');
  expect(res.status).toBe(200);
  expect(res.body.removed).toBe(1);
  expect(syncEmailListSheet).toHaveBeenCalled();
  expect((await request(app).get('/emaillist')).body.contacts).toEqual([]);
  expect((await request(app).delete('/emaillist/ann@x.com')).status).toBe(404);
});

test('POST /emaillist/bulk handles subscribe, unsubscribe, delete and validates input', async () => {
  await request(app).post('/emaillist').send({ name: 'Ann', email: 'ann@x.com' });
  await request(app).post('/emaillist').send({ name: 'Bo', email: 'bo@x.com' });

  let res = await request(app).post('/emaillist/bulk').send({ emails: ['ann@x.com', 'bo@x.com'], action: 'unsubscribe' });
  expect(res.status).toBe(200);
  expect(res.body.affected).toBe(2);

  res = await request(app).post('/emaillist/bulk').send({ emails: ['ann@x.com'], action: 'subscribe' });
  expect(res.body.affected).toBe(1);

  res = await request(app).post('/emaillist/bulk').send({ emails: ['ann@x.com'], action: 'delete' });
  expect(res.body.affected).toBe(1);
  expect((await request(app).get('/emaillist')).body.contacts).toHaveLength(1);

  expect((await request(app).post('/emaillist/bulk').send({ emails: [], action: 'delete' })).status).toBe(400);
  expect((await request(app).post('/emaillist/bulk').send({ action: 'delete' })).status).toBe(400);
  expect((await request(app).post('/emaillist/bulk').send({ emails: ['x@x.com'], action: 'zap' })).status).toBe(400);
});

test('POST /emaillist/sync merges Drive contacts, pushes merged list, rewrites sheet', async () => {
  await request(app).post('/emaillist').send({ name: 'Ann', email: 'ann@x.com' });
  findFileByName.mockResolvedValue({ id: 'f1', name: 'email-list.json' });
  downloadFileContent.mockResolvedValue(JSON.stringify([
    { name: 'Cat', email: 'cat@x.com', status: 'subscribed', addedAt: '2026-01-05T00:00:00Z', source: 'backfill' },
  ]));
  uploadFileContent.mockClear();
  syncEmailListSheet.mockClear();

  const res = await request(app).post('/emaillist/sync');
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ ok: true, added: 1, total: 2 });
  const [name, content, folder] = uploadFileContent.mock.calls.at(-1);
  expect(name).toBe('email-list.json');
  expect(folder).toBe(config.DRIVE.TOP_LEVEL_FOLDER);
  expect(JSON.parse(content).map(c => c.email).sort()).toEqual(['ann@x.com', 'cat@x.com']);
  expect(syncEmailListSheet).toHaveBeenCalled();
});

test('POST /emaillist/sync works when Drive has no list yet', async () => {
  await request(app).post('/emaillist').send({ name: 'Ann', email: 'ann@x.com' });
  findFileByName.mockResolvedValue(null);
  const res = await request(app).post('/emaillist/sync');
  expect(res.body).toMatchObject({ ok: true, added: 0, total: 1 });
});

test('POST /emaillist/sync treats unparseable Drive JSON as empty and proceeds', async () => {
  findFileByName.mockResolvedValue({ id: 'f1' });
  downloadFileContent.mockResolvedValue('not json');
  const res = await request(app).post('/emaillist/sync');
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ ok: true, added: 0 });
});

test('POST /emaillist/sync 502s when Drive or the sheet rewrite fails', async () => {
  findFileByName.mockRejectedValueOnce(new Error('Drive down'));
  let res = await request(app).post('/emaillist/sync');
  expect(res.status).toBe(502);
  expect(res.body.error).toMatch(/Drive down/);

  findFileByName.mockResolvedValue(null);
  syncEmailListSheet.mockRejectedValueOnce(new Error('Sheets down'));
  res = await request(app).post('/emaillist/sync');
  expect(res.status).toBe(502);
  expect(res.body.error).toMatch(/Sheets down/);
});

test('mutations fire a background Drive JSON backup alongside the sheet sync', async () => {
  uploadFileContent.mockClear();
  await request(app).post('/emaillist').send({ name: 'Ann', email: 'ann@x.com' });
  expect(uploadFileContent).toHaveBeenCalledWith(
    'email-list.json', expect.any(String), config.DRIVE.TOP_LEVEL_FOLDER);
});

test('POST /emaillist/sync 502s when the Drive download fails', async () => {
  findFileByName.mockResolvedValue({ id: 'f1', name: 'email-list.json' });
  downloadFileContent.mockRejectedValueOnce(new Error('download broke'));
  const res = await request(app).post('/emaillist/sync');
  expect(res.status).toBe(502);
  expect(res.body.error).toMatch(/download broke/);
});

test('POST /emaillist/sync 502s when the Drive upload fails', async () => {
  findFileByName.mockResolvedValue(null);
  uploadFileContent.mockRejectedValueOnce(new Error('upload broke'));
  const res = await request(app).post('/emaillist/sync');
  expect(res.status).toBe(502);
  expect(res.body.error).toMatch(/upload broke/);
});
