const request = require('supertest');
const fs = require('fs');
const path = require('path');
const config = require('../config');

jest.mock('../auth/oauth', () => ({
  loadTokens: () => ({ refresh_token: 'x' }),
  getOAuth2Client: () => ({}),
}));
jest.mock('../drive/client', () => ({
  uploadFileContent: jest.fn().mockResolvedValue('id'),
  downloadFileContent: jest.fn(),
  findFileByName: jest.fn(),
  listFiles: jest.fn(), findFolderByName: jest.fn(), copyFile: jest.fn(), shareFileWithUser: jest.fn(),
}));
jest.mock('../drive/designsCache', () => ({
  syncDesignsCache: jest.fn().mockResolvedValue(),
  listCachedDesigns: jest.fn().mockReturnValue([]),
}));

const TEST_TPL = path.join(__dirname, 'status-email-sync-test.json');
const realTpl = config.STATUS_EMAIL_FILE;

beforeEach(() => {
  jest.clearAllMocks();
  config.STATUS_EMAIL_FILE = TEST_TPL;
  if (fs.existsSync(TEST_TPL)) fs.unlinkSync(TEST_TPL);
});
afterEach(() => {
  config.STATUS_EMAIL_FILE = realTpl;
  if (fs.existsSync(TEST_TPL)) fs.unlinkSync(TEST_TPL);
});

const app = require('../index');
const { uploadFileContent, downloadFileContent, findFileByName } = require('../drive/client');

test('POST templates/push uploads the current local templates', async () => {
  const res = await request(app).post('/gmail/customer-email/templates/push');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true });
  const [name, content, folder] = uploadFileContent.mock.calls[0];
  expect(name).toBe('status-email-templates.json');
  expect(JSON.parse(content).templates.sent).toBeTruthy();
  expect(folder).toBe(config.DRIVE.TOP_LEVEL_FOLDER);
});

test('POST templates/push 502s on Drive failure', async () => {
  uploadFileContent.mockRejectedValueOnce(new Error('Drive down'));
  const res = await request(app).post('/gmail/customer-email/templates/push');
  expect(res.status).toBe(502);
  expect(res.body.error).toMatch(/Drive down/);
});

test('POST templates/pull 404s when no Drive file exists', async () => {
  findFileByName.mockResolvedValue(null);
  const res = await request(app).post('/gmail/customer-email/templates/pull');
  expect(res.status).toBe(404);
  expect(res.body.error).toMatch(/No status emails on Drive yet/);
});

test('POST templates/pull saves the Drive copy locally and returns it', async () => {
  findFileByName.mockResolvedValue({ id: 'f1' });
  downloadFileContent.mockResolvedValue(JSON.stringify({
    templates: { sent: { subject: 'Partner subject', body: 'Partner body' } },
    genericCustomerName: 'Cat Friend',
  }));
  const res = await request(app).post('/gmail/customer-email/templates/pull');
  expect(res.status).toBe(200);
  expect(res.body.templates.sent.subject).toBe('Partner subject');
  expect(res.body.genericCustomerName).toBe('Cat Friend');
  // Persisted locally; writeStatusEmails fills the other states with defaults.
  const onDisk = JSON.parse(fs.readFileSync(TEST_TPL, 'utf8'));
  expect(onDisk.templates.sent.subject).toBe('Partner subject');
  expect(onDisk.templates.pending).toBeTruthy();
});

test('POST templates/pull 502s on invalid JSON from Drive', async () => {
  findFileByName.mockResolvedValue({ id: 'f1' });
  downloadFileContent.mockResolvedValue('not json');
  const res = await request(app).post('/gmail/customer-email/templates/pull');
  expect(res.status).toBe(502);
  expect(res.body.error).toMatch(/not valid JSON/);
});
