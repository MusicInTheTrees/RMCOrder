const request = require('supertest');
const fs = require('fs');
const path = require('path');
const config = require('../config');

jest.mock('../auth/oauth', () => ({
  loadTokens: () => ({ refresh_token: 'x' }),
  getOAuth2Client: () => ({}),
}));
jest.mock('../gmail/client', () => ({
  upsertDraft: jest.fn(),
  sendEmail: jest.fn().mockResolvedValue('msg-id'),
  createDraft: jest.fn().mockResolvedValue('draft-id'),
  buildRawRelated: jest.fn(),
}));
jest.mock('../sheets/client', () => ({
  readRange: jest.fn().mockResolvedValue([['Order ID', 'RMC-050'], ['Sheet ID', 's']]),
  writeRange: jest.fn(), clearRange: jest.fn(), addSheet: jest.fn(),
  getSheetNames: jest.fn().mockResolvedValue(['Sheet1', 'Line Items', 'Designs', 'Customers']),
}));
jest.mock('../orders/cache', () => ({
  readOrderCache: jest.fn(), writeOrderCache: jest.fn(), deleteOrderCache: jest.fn(),
}));
jest.mock('../sheets/orderSheet', () => ({
  readOrderFromSheet: jest.fn(), writeOrderToSheet: jest.fn(),
  writeCustomersToSheet: jest.fn().mockResolvedValue(),
  EMAIL_STATES: ['sent', 'fulfilled', 'received', 'shipped'],
}));
jest.mock('../drive/client', () => ({
  uploadFileContent: jest.fn().mockResolvedValue('id'),
  listFiles: jest.fn(), findFileByName: jest.fn(), findFolderByName: jest.fn(),
  copyFile: jest.fn(), shareFileWithUser: jest.fn(),
}));

const { sendEmail, createDraft } = require('../gmail/client');
const { readOrderCache, writeOrderCache } = require('../orders/cache');
const { writeCustomersToSheet } = require('../sheets/orderSheet');

const TEST_TPL = path.join(__dirname, 'status-email-test.json');
const realTpl = config.STATUS_EMAIL_FILE;

const ORDER = {
  orderId: 'RMC-050', orderName: 'Summer Drop', sheetId: 's', lineItems: [],
  customers: [
    { name: 'Jordan', email: 'jordan@x.com', emailed: {} },
    { name: '', email: 'sam@x.com', emailed: {} },
  ],
};

function getApp() { return require('../index'); }

beforeEach(() => {
  jest.clearAllMocks();
  config.STATUS_EMAIL_FILE = TEST_TPL;
  if (fs.existsSync(TEST_TPL)) fs.unlinkSync(TEST_TPL);
});
afterEach(() => {
  config.STATUS_EMAIL_FILE = realTpl;
  if (fs.existsSync(TEST_TPL)) fs.unlinkSync(TEST_TPL);
});

test('GET templates returns defaults for all three states + generic name', async () => {
  const res = await request(getApp()).get('/gmail/customer-email/templates');
  expect(res.status).toBe(200);
  expect(Object.keys(res.body.templates).sort()).toEqual(['delayed', 'sent', 'shipped']);
  expect(res.body.genericCustomerName).toBe('Fellow Cat Lover');
});

test('PUT templates persists edits and generic name', async () => {
  const app = getApp();
  const body = { templates: { shipped: { subject: 'Custom', body: 'Hi [customer name]' } }, genericCustomerName: 'Cat Pal' };
  const res = await request(app).put('/gmail/customer-email/templates').send(body);
  expect(res.status).toBe(200);
  expect(res.body.templates.shipped.subject).toBe('Custom');
  expect(res.body.genericCustomerName).toBe('Cat Pal');
  const res2 = await request(app).get('/gmail/customer-email/templates');
  expect(res2.body.templates.shipped.body).toBe('Hi [customer name]');
});

test('preview returns rendered html using the generic name and order name', async () => {
  readOrderCache.mockReturnValue(ORDER);
  const res = await request(getApp()).post('/gmail/customer-email/preview').send({ sheetId: 's', state: 'shipped' });
  expect(res.status).toBe(200);
  expect(res.body.html).toContain('Fellow Cat Lover');
  expect(res.body.html).toContain('Summer Drop');
  expect(res.body.html).toContain('/api/assets/email_header.jpg'); // browser-loadable header, not cid
});

test('draft creates one Gmail draft per customer', async () => {
  readOrderCache.mockReturnValue(ORDER);
  const res = await request(getApp()).post('/gmail/customer-email/draft').send({ sheetId: 's', state: 'shipped' });
  expect(res.status).toBe(200);
  expect(res.body.drafted).toBe(2);
  expect(createDraft).toHaveBeenCalledTimes(2);
  expect(createDraft.mock.calls[0][0]).toBe('jordan@x.com');
  expect(createDraft.mock.calls[1][0]).toBe('sam@x.com');
});

test('send emails each recipient individually and stamps timestamps', async () => {
  readOrderCache.mockReturnValue(JSON.parse(JSON.stringify(ORDER)));
  const res = await request(getApp()).post('/gmail/customer-email/send').send({
    sheetId: 's', state: 'shipped',
    recipients: [{ name: 'Jordan', email: 'jordan@x.com' }, { name: '', email: 'sam@x.com' }],
  });
  expect(res.status).toBe(200);
  expect(res.body.sent).toBe(2);
  expect(sendEmail).toHaveBeenCalledTimes(2);
  expect(sendEmail.mock.calls[0][0]).toBe('jordan@x.com');
  const saved = writeOrderCache.mock.calls[0][1];
  expect(saved.customers[0].emailed.shipped).toBe(res.body.at);
  expect(writeCustomersToSheet).toHaveBeenCalled();
});

test('draft rejects a non-emailing state', async () => {
  readOrderCache.mockReturnValue(ORDER);
  const res = await request(getApp()).post('/gmail/customer-email/draft').send({ sheetId: 's', state: 'paid' });
  expect(res.status).toBe(400);
});
