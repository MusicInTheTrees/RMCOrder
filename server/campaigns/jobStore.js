const fs = require('fs');
const crypto = require('crypto');
const config = require('../config');

function readJobs() {
  if (!fs.existsSync(config.CAMPAIGN_JOBS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(config.CAMPAIGN_JOBS_FILE, 'utf8')); }
  catch { return []; }
}

function writeJobs(jobs) {
  fs.writeFileSync(config.CAMPAIGN_JOBS_FILE, JSON.stringify(jobs, null, 2));
}

function createJob({ subject, body, recipients, sendAt, createdBy }) {
  const job = {
    id: crypto.randomUUID(),
    subject, body, recipients, sendAt, createdBy,
    status: 'scheduled',
    sentAt: null,
    error: '',
    results: [],
  };
  const jobs = readJobs();
  jobs.push(job);
  writeJobs(jobs);
  return job;
}

function getJob(id) {
  return readJobs().find(j => j.id === id) || null;
}

function updateJob(id, fields) {
  const jobs = readJobs();
  const idx = jobs.findIndex(j => j.id === id);
  if (idx === -1) return null;
  jobs[idx] = { ...jobs[idx], ...fields, id: jobs[idx].id };
  writeJobs(jobs);
  return jobs[idx];
}

module.exports = { readJobs, writeJobs, createJob, getJob, updateJob };
