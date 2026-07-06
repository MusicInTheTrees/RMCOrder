const request = require('supertest');
const fs = require('fs');
const config = require('../config');
const path = require('path');

const TEST_SETTINGS = path.join(__dirname, 'settings-test.json');
const real = config.SETTINGS_FILE;

beforeEach(() => { config.SETTINGS_FILE = TEST_SETTINGS; if (fs.existsSync(TEST_SETTINGS)) fs.unlinkSync(TEST_SETTINGS); });
afterEach(() => { config.SETTINGS_FILE = real; if (fs.existsSync(TEST_SETTINGS)) fs.unlinkSync(TEST_SETTINGS); });

function getApp() { jest.resetModules(); require('../config').SETTINGS_FILE = TEST_SETTINGS; return require('../index'); }

test('GET /settings defaults autoSendCustomerEmails to false', async () => {
  const res = await request(getApp()).get('/settings');
  expect(res.body.autoSendCustomerEmails).toBe(false);
});

test('PUT /settings persists autoSendCustomerEmails and keeps other fields', async () => {
  const app = getApp();
  await request(app).put('/settings').send({ brandName: 'RMC', spewEmail: 's@x.com', defaultBackNotes: 'keep me', autoSendCustomerEmails: true });
  const res = await request(app).get('/settings');
  expect(res.body.autoSendCustomerEmails).toBe(true);
  expect(res.body.defaultBackNotes).toBe('keep me');
});
