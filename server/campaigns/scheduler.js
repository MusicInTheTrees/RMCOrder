const { loadTokens } = require('../auth/oauth');
const { sendEmail } = require('../gmail/client');
const { headerImage } = require('../gmail/customerEmailBuilder');
const { readContacts } = require('../emaillist/store');
const { readJobs, updateJob } = require('./jobStore');
const { buildCampaignEmail } = require('./campaignEmailBuilder');

const STALE_MS = 48 * 60 * 60 * 1000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let running = false;

// Resolve a job's recipients to contact objects, honoring unsubscribes at send time.
function resolveTargets(job) {
  const contacts = readContacts();
  if (job.recipients === 'list') return contacts.filter(c => c.status === 'subscribed');
  const byEmail = new Map(contacts.map(c => [c.email.toLowerCase(), c]));
  return job.recipients.map(e =>
    byEmail.get(e.toLowerCase()) || { name: '', email: e, status: 'subscribed' });
}

async function sendJob(job, { delayMs }) {
  const targets = resolveTargets(job);
  const results = [];
  let sentCount = 0;
  let failCount = 0;
  for (let i = 0; i < targets.length; i++) {
    const contact = targets[i];
    if (contact.status === 'unsubscribed') {
      results.push({ email: contact.email, status: 'skipped-unsubscribed' });
      continue;
    }
    try {
      const { subject, html, plain } = buildCampaignEmail({ subject: job.subject, body: job.body, contact });
      await sendEmail(contact.email, subject, html, plain, [headerImage()]);
      results.push({ email: contact.email, status: 'sent' });
      sentCount++;
    } catch (err) {
      results.push({ email: contact.email, status: 'failed', error: err.message });
      failCount++;
    }
    if (i < targets.length - 1 && delayMs > 0) await sleep(delayMs);
  }
  const failed = sentCount === 0 && failCount > 0;
  updateJob(job.id, {
    status: failed ? 'failed' : 'sent',
    sentAt: new Date().toISOString(),
    error: failed ? 'all recipients failed' : (failCount > 0 ? 'some recipients failed' : ''),
    results,
  });
}

async function processDueJobs(now = new Date(), { delayMs = 1000 } = {}) {
  if (running) return { skipped: 'already-running' };
  const tokens = loadTokens();
  if (!tokens || !tokens.refresh_token) return { skipped: 'not-authenticated' };
  running = true;
  try {
    const due = readJobs().filter(j => j.status === 'scheduled' && new Date(j.sendAt) <= now);
    for (const job of due) {
      if (now - new Date(job.sendAt) > STALE_MS) {
        updateJob(job.id, { status: 'failed', error: 'stale' });
        continue;
      }
      await sendJob(job, { delayMs });
    }
    return { processed: due.length };
  } finally {
    running = false;
  }
}

function startScheduler(intervalMs = 60000) {
  const pass = () => processDueJobs().catch(err => console.warn('Campaign scheduler pass failed:', err.message));
  pass();
  return setInterval(pass, intervalMs);
}

module.exports = { processDueJobs, startScheduler, STALE_MS };
