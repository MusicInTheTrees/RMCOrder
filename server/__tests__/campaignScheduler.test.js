const fs = require('fs');
const path = require('path');

jest.mock('../gmail/client', () => ({ sendEmail: jest.fn().mockResolvedValue('msg-1') }));
jest.mock('../auth/oauth', () => ({
  loadTokens: jest.fn().mockReturnValue({ refresh_token: 'tok' }),
  getOAuth2Client: jest.fn(),
}));
jest.mock('../gmail/customerEmailBuilder', () => {
  const actual = jest.requireActual('../gmail/customerEmailBuilder');
  return { ...actual, headerImage: jest.fn().mockReturnValue({ cid: 'rmcheader', filename: 'h.jpg', content: Buffer.from(''), type: 'image/jpeg' }) };
});

const config = require('../config');
const TEST_JOBS = path.join(__dirname, 'scheduler-jobs-test.json');
const TEST_LIST = path.join(__dirname, 'scheduler-list-test.json');
const realJobs = config.CAMPAIGN_JOBS_FILE;
const realList = config.EMAIL_LIST_FILE;

beforeEach(() => {
  config.CAMPAIGN_JOBS_FILE = TEST_JOBS;
  config.EMAIL_LIST_FILE = TEST_LIST;
  for (const f of [TEST_JOBS, TEST_LIST]) if (fs.existsSync(f)) fs.unlinkSync(f);
  jest.clearAllMocks();
});
afterEach(() => {
  config.CAMPAIGN_JOBS_FILE = realJobs;
  config.EMAIL_LIST_FILE = realList;
  for (const f of [TEST_JOBS, TEST_LIST]) if (fs.existsSync(f)) fs.unlinkSync(f);
});

const { sendEmail } = require('../gmail/client');
const { loadTokens } = require('../auth/oauth');
const { createJob, getJob } = require('../campaigns/jobStore');
const { upsertContacts, updateContact } = require('../emaillist/store');
const { processDueJobs, STALE_MS } = require('../campaigns/scheduler');

const NOW = new Date('2026-07-14T09:00:00.000Z');

function seedList() {
  upsertContacts([
    { name: 'Ann', email: 'ann@x.com', source: 'manual' },
    { name: 'Bo', email: 'bo@x.com', source: 'manual' },
  ]);
}

test('sends due list job to subscribed contacts only', async () => {
  seedList();
  updateContact('bo@x.com', { status: 'unsubscribed' });
  const job = createJob({ subject: 'Hi [customer name]', body: 'B', recipients: 'list', sendAt: '2026-07-14T08:59:00.000Z', createdBy: 'blast' });
  await processDueJobs(NOW, { delayMs: 0 });
  expect(sendEmail).toHaveBeenCalledTimes(1);
  expect(sendEmail.mock.calls[0][0]).toBe('ann@x.com');
  expect(sendEmail.mock.calls[0][1]).toBe('Hi Ann');
  const done = getJob(job.id);
  expect(done.status).toBe('sent');
  expect(done.sentAt).toBeTruthy();
  expect(done.results).toEqual([{ email: 'ann@x.com', status: 'sent' }]);
});

test('future jobs are untouched', async () => {
  const job = createJob({ subject: 'S', body: 'B', recipients: 'list', sendAt: '2026-07-14T09:01:00.000Z', createdBy: 'blast' });
  await processDueJobs(NOW, { delayMs: 0 });
  expect(sendEmail).not.toHaveBeenCalled();
  expect(getJob(job.id).status).toBe('scheduled');
});

test('jobs more than 48h overdue are marked stale, not sent', async () => {
  const past = new Date(NOW.getTime() - STALE_MS - 60000).toISOString();
  const job = createJob({ subject: 'S', body: 'B', recipients: 'list', sendAt: past, createdBy: 'blast' });
  await processDueJobs(NOW, { delayMs: 0 });
  expect(sendEmail).not.toHaveBeenCalled();
  const stale = getJob(job.id);
  expect(stale.status).toBe('failed');
  expect(stale.error).toBe('stale');
});

test('skips the whole pass when not authenticated', async () => {
  loadTokens.mockReturnValueOnce(null);
  const job = createJob({ subject: 'S', body: 'B', recipients: 'list', sendAt: '2026-07-14T08:00:00.000Z', createdBy: 'blast' });
  const result = await processDueJobs(NOW, { delayMs: 0 });
  expect(result).toEqual({ skipped: 'not-authenticated' });
  expect(getJob(job.id).status).toBe('scheduled');
});

test('one bad recipient does not abort the batch (partial failure)', async () => {
  seedList();
  sendEmail.mockRejectedValueOnce(new Error('bounce')).mockResolvedValueOnce('msg-2');
  const job = createJob({ subject: 'S', body: 'B', recipients: ['ann@x.com', 'bo@x.com'], sendAt: '2026-07-14T08:59:00.000Z', createdBy: 'blast' });
  await processDueJobs(NOW, { delayMs: 0 });
  const done = getJob(job.id);
  expect(done.status).toBe('sent');
  expect(done.error).toBe('some recipients failed');
  expect(done.results).toEqual([
    { email: 'ann@x.com', status: 'failed', error: 'bounce' },
    { email: 'bo@x.com', status: 'sent' },
  ]);
});

test('explicit recipients who unsubscribed are skipped at send time', async () => {
  seedList();
  updateContact('ann@x.com', { status: 'unsubscribed' });
  const job = createJob({ subject: 'S', body: 'B', recipients: ['ann@x.com', 'bo@x.com'], sendAt: '2026-07-14T08:59:00.000Z', createdBy: 'blast' });
  await processDueJobs(NOW, { delayMs: 0 });
  expect(sendEmail).toHaveBeenCalledTimes(1);
  expect(sendEmail.mock.calls[0][0]).toBe('bo@x.com');
  expect(getJob(job.id).results[0]).toEqual({ email: 'ann@x.com', status: 'skipped-unsubscribed' });
});

test('all recipients failing marks the job failed', async () => {
  seedList();
  sendEmail.mockRejectedValue(new Error('quota'));
  const job = createJob({ subject: 'S', body: 'B', recipients: ['ann@x.com'], sendAt: '2026-07-14T08:59:00.000Z', createdBy: 'blast' });
  await processDueJobs(NOW, { delayMs: 0 });
  const done = getJob(job.id);
  expect(done.status).toBe('failed');
  expect(done.error).toBe('all recipients failed');
});
