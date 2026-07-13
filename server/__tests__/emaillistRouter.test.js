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
