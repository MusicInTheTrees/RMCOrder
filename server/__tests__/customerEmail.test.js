const request = require('supertest');

jest.mock('../auth/oauth', () => ({
  loadTokens: () => ({ refresh_token: 'x' }),
  getOAuth2Client: () => ({}),
}));
jest.mock('../gmail/client', () => ({
  upsertDraft: jest.fn(),
  sendEmail: jest.fn().mockResolvedValue('msg-id'),
  buildRawRelated: jest.fn(),
}));
jest.mock('../sheets/client', () => ({
  readRange: jest.fn().mockResolvedValue([['Order ID', 'RMC-050'], ['Sheet ID', 's']]),
  writeRange: jest.fn(), clearRange: jest.fn(), addSheet: jest.fn(),
  getSheetNames: jest.fn().mockResolvedValue(['Sheet1', 'Line Items', 'Designs', 'Customers']),
}));
jest.mock('../orders/cache', () => ({
  readOrderCache: jest.fn(),
  writeOrderCache: jest.fn(),
  deleteOrderCache: jest.fn(),
}));
jest.mock('../sheets/orderSheet', () => ({
  readOrderFromSheet: jest.fn(),
  writeOrderToSheet: jest.fn(),
  writeCustomersToSheet: jest.fn().mockResolvedValue(),
  EMAIL_STATES: ['sent', 'fulfilled', 'received', 'shipped'],
}));

const { sendEmail } = require('../gmail/client');
const { readOrderCache, writeOrderCache } = require('../orders/cache');
const { writeCustomersToSheet } = require('../sheets/orderSheet');

function getApp() { return require('../index'); }

const ORDER = {
  orderId: 'RMC-050', orderName: 'Summer Drop', sheetId: 's', lineItems: [],
  customers: [
    { name: 'Jordan', email: 'jordan@x.com', emailed: { sent: '', fulfilled: '', received: '', shipped: '' } },
    { name: '', email: 'sam@x.com', emailed: { sent: '', fulfilled: '', received: '', shipped: '' } },
  ],
};

beforeEach(() => { jest.clearAllMocks(); });

test('preview returns defaults with orderName resolved', async () => {
  readOrderCache.mockReturnValue(ORDER);
  const res = await request(getApp()).post('/gmail/customer-email/preview').send({ sheetId: 's', state: 'shipped' });
  expect(res.status).toBe(200);
  expect(res.body.subject).toContain('on its way');
  expect(res.body.body).toContain('"Summer Drop"');
});

test('send emails each recipient individually and stamps timestamps', async () => {
  readOrderCache.mockReturnValue(JSON.parse(JSON.stringify(ORDER)));
  const res = await request(getApp()).post('/gmail/customer-email/send').send({
    sheetId: 's', state: 'shipped',
    recipients: [{ name: 'Jordan', email: 'jordan@x.com' }, { name: '', email: 'sam@x.com' }],
    subject: 'Subj', body: 'Body.',
  });
  expect(res.status).toBe(200);
  expect(res.body.sent).toBe(2);
  expect(sendEmail).toHaveBeenCalledTimes(2);
  // one recipient per call (individual sends)
  expect(sendEmail.mock.calls[0][0]).toBe('jordan@x.com');
  expect(sendEmail.mock.calls[1][0]).toBe('sam@x.com');
  // persisted with timestamps
  const savedOrder = writeOrderCache.mock.calls[0][1];
  expect(savedOrder.customers[0].emailed.shipped).toBe(res.body.at);
  expect(writeCustomersToSheet).toHaveBeenCalled();
});

test('send rejects a non-emailing state', async () => {
  readOrderCache.mockReturnValue(ORDER);
  const res = await request(getApp()).post('/gmail/customer-email/send').send({ sheetId: 's', state: 'paid', recipients: [{ email: 'a@x.com' }], subject: 'S', body: 'B' });
  expect(res.status).toBe(400);
});
