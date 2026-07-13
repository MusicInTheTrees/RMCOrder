// server/__tests__/emaillistCapture.test.js
const request = require('supertest');
const fs = require('fs');
const path = require('path');

jest.mock('../auth/oauth', () => ({
  loadTokens: jest.fn().mockReturnValue({ refresh_token: 'tok' }),
  getOAuth2Client: jest.fn(),
}));
jest.mock('../drive/client', () => ({
  findFileByName: jest.fn().mockResolvedValue({ id: 'folder-1' }),
  uploadFileContent: jest.fn().mockResolvedValue('file-1'),
  downloadFileContent: jest.fn(),
  createFolder: jest.fn(),
}));
jest.mock('../drive/designsCache', () => ({
  syncDesignsCache: jest.fn().mockResolvedValue(),
  listCachedDesigns: jest.fn().mockReturnValue([]),
}));
jest.mock('../emaillist/sheet', () => ({
  syncEmailListSheet: jest.fn().mockResolvedValue(),
  ensureEmailListSheet: jest.fn().mockResolvedValue('sheet-1'),
}));

const config = require('../config');
const TEST_LIST = path.join(__dirname, 'emaillist-capture-test.json');
const TEST_CACHE_DIR = path.join(__dirname, 'orders-cache-capture-test');
const realList = config.EMAIL_LIST_FILE;
const realCache = config.ORDERS_CACHE_DIR;

beforeEach(() => {
  config.EMAIL_LIST_FILE = TEST_LIST;
  config.ORDERS_CACHE_DIR = TEST_CACHE_DIR;
  if (fs.existsSync(TEST_LIST)) fs.unlinkSync(TEST_LIST);
  fs.rmSync(TEST_CACHE_DIR, { recursive: true, force: true });
});
afterEach(() => {
  config.EMAIL_LIST_FILE = realList;
  config.ORDERS_CACHE_DIR = realCache;
  if (fs.existsSync(TEST_LIST)) fs.unlinkSync(TEST_LIST);
  fs.rmSync(TEST_CACHE_DIR, { recursive: true, force: true });
});

const app = require('../index');
const { readContacts } = require('../emaillist/store');
const { collectOrderEmails } = require('../emaillist/capture');

test('collectOrderEmails gathers customers + line-item emails, deduped', () => {
  const order = {
    customers: [{ name: 'Ann', email: 'ann@x.com' }],
    lineItems: [{ customerEmail: 'ANN@x.com' }, { customerEmail: 'bo@x.com' }, { customerEmail: '' }],
  };
  const result = collectOrderEmails(order);
  expect(result).toEqual([{ name: 'Ann', email: 'ann@x.com' }, { name: '', email: 'bo@x.com' }]);
});

test('PUT /sheets/order captures customer emails into the list', async () => {
  const res = await request(app).put('/sheets/order/sheet-abc').send({
    orderId: 'RMC-001-2026-07-01',
    state: 'building',
    customers: [{ name: 'Ann', email: 'ann@x.com', emailed: {} }],
    lineItems: [{ num: '01', customerEmail: 'bo@x.com', sizes: {} }],
  });
  expect(res.status).toBe(200);
  await new Promise(r => setTimeout(r, 50)); // hook is fire-and-forget
  const contacts = readContacts();
  expect(contacts.map(c => c.email).sort()).toEqual(['ann@x.com', 'bo@x.com']);
  expect(contacts.find(c => c.email === 'ann@x.com').source).toBe('RMC-001-2026-07-01');
});

test('a broken email list never fails the order save', async () => {
  config.EMAIL_LIST_FILE = path.join(__dirname, 'no-such-dir', 'nested', 'list.json'); // write will throw
  const res = await request(app).put('/sheets/order/sheet-abc').send({
    orderId: 'RMC-002-2026-07-02',
    customers: [{ name: 'Ann', email: 'ann@x.com', emailed: {} }],
    lineItems: [],
  });
  expect(res.status).toBe(200);
});

test('POST /emaillist/backfill sweeps all cached orders', async () => {
  fs.mkdirSync(TEST_CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(TEST_CACHE_DIR, 'RMC-001-2026-01-01.json'), JSON.stringify({
    orderId: 'RMC-001-2026-01-01',
    customers: [{ name: 'Ann', email: 'ann@x.com' }],
    lineItems: [{ customerEmail: 'bo@x.com' }],
  }));
  fs.writeFileSync(path.join(TEST_CACHE_DIR, 'RMC-002-2026-02-02.json'), JSON.stringify({
    orderId: 'RMC-002-2026-02-02',
    customers: [{ name: 'Cat', email: 'cat@x.com' }],
    lineItems: [],
  }));
  const res = await request(app).post('/emaillist/backfill');
  expect(res.status).toBe(200);
  expect(res.body.added).toBe(3);
  expect(res.body.total).toBe(3);
  expect(readContacts().every(c => c.source === 'backfill')).toBe(true);
});
