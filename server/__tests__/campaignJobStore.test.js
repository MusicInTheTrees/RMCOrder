// server/__tests__/campaignJobStore.test.js
const fs = require('fs');
const path = require('path');
const config = require('../config');

const TEST_FILE = path.join(__dirname, 'campaign-jobs-test.json');
const realFile = config.CAMPAIGN_JOBS_FILE;

beforeEach(() => { config.CAMPAIGN_JOBS_FILE = TEST_FILE; if (fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE); });
afterEach(() => { config.CAMPAIGN_JOBS_FILE = realFile; if (fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE); });

const { readJobs, createJob, getJob, updateJob } = require('../campaigns/jobStore');

test('readJobs returns [] when file missing', () => {
  expect(readJobs()).toEqual([]);
});

test('createJob persists a scheduled job with defaults', () => {
  const job = createJob({ subject: 'Hi', body: 'Yo [customer name]', recipients: 'list', sendAt: '2026-07-14T09:00:00.000Z', createdBy: 'blast' });
  expect(job.id).toBeTruthy();
  expect(job).toMatchObject({ status: 'scheduled', sentAt: null, error: '', results: [], createdBy: 'blast' });
  expect(readJobs()).toHaveLength(1);
});

test('getJob and updateJob find by id; id is immutable', () => {
  const job = createJob({ subject: 'A', body: 'B', recipients: ['x@x.com'], sendAt: '2026-07-14T09:00:00.000Z', createdBy: 'blast' });
  expect(getJob(job.id).subject).toBe('A');
  const updated = updateJob(job.id, { status: 'cancelled', id: 'HACK' });
  expect(updated.status).toBe('cancelled');
  expect(updated.id).toBe(job.id);
  expect(getJob('nope')).toBeNull();
  expect(updateJob('nope', {})).toBeNull();
});
