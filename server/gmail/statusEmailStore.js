const fs = require('fs');
const config = require('../config');
const { DEFAULT_TEMPLATES, DEFAULT_GENERIC_NAME } = require('./customerEmailBuilder');

const EMAIL_STATES = ['sent', 'pending', 'fulfilled', 'shipped', 'delayed'];

function defaults() {
  const templates = {};
  for (const s of EMAIL_STATES) templates[s] = { ...DEFAULT_TEMPLATES[s] };
  return { templates, genericCustomerName: DEFAULT_GENERIC_NAME };
}

function readStatusEmails() {
  if (!fs.existsSync(config.STATUS_EMAIL_FILE)) return defaults();
  try {
    const saved = JSON.parse(fs.readFileSync(config.STATUS_EMAIL_FILE, 'utf8'));
    const d = defaults();
    const templates = { ...d.templates };
    for (const s of EMAIL_STATES) {
      if (saved.templates && saved.templates[s]) {
        templates[s] = { subject: saved.templates[s].subject ?? d.templates[s].subject,
          body: saved.templates[s].body ?? d.templates[s].body };
      }
    }
    return { templates, genericCustomerName: saved.genericCustomerName || d.genericCustomerName };
  } catch {
    return defaults();
  }
}

function writeStatusEmails(data) {
  const d = defaults();
  const templates = { ...d.templates };
  for (const s of EMAIL_STATES) {
    if (data.templates && data.templates[s]) {
      templates[s] = { subject: data.templates[s].subject ?? d.templates[s].subject,
        body: data.templates[s].body ?? d.templates[s].body };
    }
  }
  const merged = { templates, genericCustomerName: data.genericCustomerName || d.genericCustomerName };
  fs.writeFileSync(config.STATUS_EMAIL_FILE, JSON.stringify(merged, null, 2));
  return merged;
}

module.exports = { readStatusEmails, writeStatusEmails, defaults, EMAIL_STATES };
