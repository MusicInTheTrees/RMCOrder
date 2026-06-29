const request = require('supertest');
const fs = require('fs');
const path = require('path');
const config = require('../config');

// Use a temp file so tests don't touch the real catalog
const TEST_CATALOG = path.join(__dirname, 'items-catalog-test.json');
const realFile = config.ITEMS_CATALOG_FILE;

beforeEach(() => {
  config.ITEMS_CATALOG_FILE = TEST_CATALOG;
  if (fs.existsSync(TEST_CATALOG)) fs.unlinkSync(TEST_CATALOG);
});
afterEach(() => {
  config.ITEMS_CATALOG_FILE = realFile;
  if (fs.existsSync(TEST_CATALOG)) fs.unlinkSync(TEST_CATALOG);
});

// Must re-require app AFTER patching config.
// After resetModules the fresh config instance must also be patched before index loads.
function getApp() {
  jest.resetModules();
  require('../config').ITEMS_CATALOG_FILE = TEST_CATALOG;
  return require('../index');
}

test('GET /items returns empty catalog when no file exists', async () => {
  const app = getApp();
  const res = await request(app).get('/items');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ items: [] });
});

test('POST /items creates an item with id and defaults', async () => {
  const app = getApp();
  const res = await request(app).post('/items').send({ name: 'Unisex Tee' });
  expect(res.status).toBe(200);
  expect(res.body.id).toBeTruthy();
  expect(res.body.name).toBe('Unisex Tee');
  expect(res.body.colors).toEqual([]);
  expect(res.body.sizes).toEqual([]);
  expect(res.body.decorationMethods).toEqual([]);
});

test('PUT /items/:id updates an item', async () => {
  const app = getApp();
  const create = await request(app).post('/items').send({ name: 'Sticker' });
  const id = create.body.id;
  const updated = { ...create.body, name: 'Premium Sticker' };
  const res = await request(app).put(`/items/${id}`).send(updated);
  expect(res.status).toBe(200);
  expect(res.body.name).toBe('Premium Sticker');
});

test('DELETE /items/:id removes the item', async () => {
  const app = getApp();
  const create = await request(app).post('/items').send({ name: 'Hat' });
  const id = create.body.id;
  await request(app).delete(`/items/${id}`);
  const res = await request(app).get('/items');
  expect(res.body.items.find(i => i.id === id)).toBeUndefined();
});

test('PUT /items/:id returns 404 for unknown id', async () => {
  const app = getApp();
  const res = await request(app).put('/items/nonexistent').send({ name: 'x' });
  expect(res.status).toBe(404);
});

test('POST /items/push returns ok (mocked drive)', async () => {
  jest.mock('../drive/client', () => ({
    findFileByName: jest.fn().mockResolvedValue(null),
    uploadFileContent: jest.fn().mockResolvedValue('file-id-123'),
    downloadFileContent: jest.fn(),
    findFolderByName: jest.fn(),
  }));
  const app = getApp();
  await request(app).post('/items').send({ name: 'Tee' });
  const res = await request(app).post('/items/push');
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
});

test('POST /items/pull returns error when no catalog on Drive', async () => {
  jest.mock('../drive/client', () => ({
    findFileByName: jest.fn().mockResolvedValue(null),
    uploadFileContent: jest.fn(),
    downloadFileContent: jest.fn(),
    findFolderByName: jest.fn(),
  }));
  const app = getApp();
  const res = await request(app).post('/items/pull');
  expect(res.status).toBe(200);
  expect(res.body.error).toMatch(/No catalog/i);
});
