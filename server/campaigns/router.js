const express = require('express');
const { readJobs, createJob, getJob, updateJob } = require('./jobStore');

const router = express.Router();

router.post('/jobs', (req, res) => {
  const { subject = '', body = '', recipients, sendAt } = req.body || {};
  if (typeof subject !== 'string' || !subject.trim()) return res.status(400).json({ error: 'Subject is required' });
  if (typeof body !== 'string' || !body.trim()) return res.status(400).json({ error: 'Body is required' });
  const validRecipients = recipients === 'list' || (
    Array.isArray(recipients) && recipients.length > 0 &&
    recipients.every(email => typeof email === 'string' && email.trim())
  );
  if (!validRecipients) return res.status(400).json({ error: "Recipients must be 'list' or a non-empty array of emails" });
  const when = sendAt === undefined ? new Date() : new Date(sendAt);
  if (isNaN(when.getTime())) return res.status(400).json({ error: 'Invalid sendAt date' });
  const normalizedRecipients = Array.isArray(recipients) ? recipients.map(email => email.trim()) : recipients;
  const job = createJob({ subject, body, recipients: normalizedRecipients, sendAt: when.toISOString(), createdBy: 'blast' });
  res.status(201).json({ job });
});

router.get('/jobs', (_req, res) => {
  const jobs = readJobs().sort((a, b) => new Date(b.sendAt) - new Date(a.sendAt));
  res.json({ jobs });
});

router.post('/jobs/:id/cancel', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'scheduled') return res.status(400).json({ error: `Cannot cancel a ${job.status} job` });
  res.json({ job: updateJob(job.id, { status: 'cancelled' }) });
});

router.post('/jobs/:id/reschedule', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const when = new Date(req.body?.sendAt);
  if (isNaN(when.getTime())) return res.status(400).json({ error: 'Invalid sendAt date' });
  res.json({ job: updateJob(job.id, { status: 'scheduled', sendAt: when.toISOString(), error: '', results: [], sentAt: null }) });
});

module.exports = router;
