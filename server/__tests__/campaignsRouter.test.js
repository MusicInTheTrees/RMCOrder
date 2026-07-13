const request = require('supertest');
const fs = require('fs');
const path = require('path');

jest.mock('../drive/designsCache', () => ({
  syncDesignsCache: jest.fn().mockResolvedValue(),
  listCachedDesigns: jest.fn().mockReturnValue([]),
}));

const config = require('../config');
const TEST_JOBS = path.join(__dirname, 'campaigns-router-jobs-test.json');
const realJobs = config.CAMPAIGN_JOBS_FILE;

beforeEach(() => { config.CAMPAIGN_JOBS_FILE = TEST_JOBS; if (fs.existsSync(TEST_JOBS)) fs.unlinkSync(TEST_JOBS); });
afterEach(() => { config.CAMPAIGN_JOBS_FILE = realJobs; if (fs.existsSync(TEST_JOBS)) fs.unlinkSync(TEST_JOBS); });

const app = require('../index');

const VALID = { subject: 'New drop', body: 'Hello [customer name]!', recipients: 'list', sendAt: '2026-07-20T09:00:00.000Z' };

test('POST /campaigns/jobs creates a scheduled blast', async () => {
  const res = await request(app).post('/campaigns/jobs').send(VALID);
  expect(res.status).toBe(201);
  expect(res.body.job).toMatchObject({ status: 'scheduled', createdBy: 'blast', recipients: 'list' });
});

test('POST /campaigns/jobs validates input', async () => {
  expect((await request(app).post('/campaigns/jobs').send({ ...VALID, subject: '' })).status).toBe(400);
  expect((await request(app).post('/campaigns/jobs').send({ ...VALID, body: '' })).status).toBe(400);
  expect((await request(app).post('/campaigns/jobs').send({ ...VALID, recipients: [] })).status).toBe(400);
  expect((await request(app).post('/campaigns/jobs').send({ ...VALID, recipients: 'everyone' })).status).toBe(400);
  expect((await request(app).post('/campaigns/jobs').send({ ...VALID, sendAt: 'tomorrow-ish' })).status).toBe(400);
});

test('sendAt defaults to now', async () => {
  const before = Date.now();
  const res = await request(app).post('/campaigns/jobs').send({ subject: 'S', body: 'B', recipients: ['a@x.com'] });
  const t = new Date(res.body.job.sendAt).getTime();
  expect(t).toBeGreaterThanOrEqual(before);
  expect(t).toBeLessThanOrEqual(Date.now());
});

test('GET /campaigns/jobs returns jobs sorted by sendAt desc', async () => {
  await request(app).post('/campaigns/jobs').send({ ...VALID, sendAt: '2026-07-20T09:00:00.000Z' });
  await request(app).post('/campaigns/jobs').send({ ...VALID, sendAt: '2026-07-25T09:00:00.000Z' });
  const res = await request(app).get('/campaigns/jobs');
  expect(res.body.jobs).toHaveLength(2);
  expect(res.body.jobs[0].sendAt).toBe('2026-07-25T09:00:00.000Z');
});

test('cancel works only on scheduled jobs; reschedule revives any job', async () => {
  const { body } = await request(app).post('/campaigns/jobs').send(VALID);
  const id = body.job.id;
  const cancelled = await request(app).post(`/campaigns/jobs/${id}/cancel`);
  expect(cancelled.body.job.status).toBe('cancelled');
  expect((await request(app).post(`/campaigns/jobs/${id}/cancel`)).status).toBe(400); // already cancelled
  const res = await request(app).post(`/campaigns/jobs/${id}/reschedule`).send({ sendAt: '2026-08-01T09:00:00.000Z' });
  expect(res.body.job).toMatchObject({ status: 'scheduled', sendAt: '2026-08-01T09:00:00.000Z', error: '', results: [] });
  expect((await request(app).post('/campaigns/jobs/nope/cancel')).status).toBe(404);
});
