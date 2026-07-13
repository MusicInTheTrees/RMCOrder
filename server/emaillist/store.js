const fs = require('fs');
const config = require('../config');

function readContacts() {
  if (!fs.existsSync(config.EMAIL_LIST_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(config.EMAIL_LIST_FILE, 'utf8')); }
  catch { return []; }
}

function writeContacts(contacts) {
  fs.writeFileSync(config.EMAIL_LIST_FILE, JSON.stringify(contacts, null, 2));
}

// incoming: [{ name, email, source }] — returns { contacts, added }
function upsertContacts(incoming) {
  const contacts = readContacts();
  const byEmail = new Map(contacts.map(c => [c.email.toLowerCase(), c]));
  const added = [];
  for (const inc of incoming || []) {
    const email = (inc.email || '').trim();
    if (!email) continue;
    const existing = byEmail.get(email.toLowerCase());
    if (existing) {
      if (!existing.name && inc.name) existing.name = inc.name.trim();
      continue;
    }
    const contact = {
      name: (inc.name || '').trim(),
      email,
      status: 'subscribed',
      addedAt: new Date().toISOString(),
      source: inc.source || 'manual',
    };
    contacts.push(contact);
    byEmail.set(email.toLowerCase(), contact);
    added.push(contact);
  }
  writeContacts(contacts);
  return { contacts, added };
}

function updateContact(email, fields) {
  const contacts = readContacts();
  const contact = contacts.find(c => c.email.toLowerCase() === (email || '').toLowerCase());
  if (!contact) return null;
  if (fields.name !== undefined) contact.name = String(fields.name).trim();
  if (fields.status === 'subscribed' || fields.status === 'unsubscribed') contact.status = fields.status;
  writeContacts(contacts);
  return contact;
}

module.exports = { readContacts, writeContacts, upsertContacts, updateContact };
