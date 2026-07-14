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
  if (fields.name !== undefined) contact.name = String(fields.name ?? '').trim();
  if (fields.status === 'subscribed' || fields.status === 'unsubscribed') contact.status = fields.status;
  writeContacts(contacts);
  return contact;
}

function deleteContacts(emails) {
  const targets = new Set((emails || []).map(e => String(e).toLowerCase()));
  const contacts = readContacts();
  const kept = contacts.filter(c => !targets.has(c.email.toLowerCase()));
  const removed = contacts.length - kept.length;
  if (removed > 0) writeContacts(kept);
  return removed;
}

function updateContactsStatus(emails, status) {
  if (status !== 'subscribed' && status !== 'unsubscribed') return 0;
  const targets = new Set((emails || []).map(e => String(e).toLowerCase()));
  const contacts = readContacts();
  let updated = 0;
  for (const c of contacts) {
    if (targets.has(c.email.toLowerCase())) { c.status = status; updated++; }
  }
  if (updated > 0) writeContacts(contacts);
  return updated;
}

// Merge a remote contact array (from the Drive copy) into the local list.
// Union by lowercased email; unsubscribed wins; earliest addedAt (and its
// source) kept — blank addedAt counts as later; non-empty name preferred,
// local wins when both sides have one.
function mergeContacts(remote) {
  const contacts = readContacts();
  const byEmail = new Map(contacts.map(c => [c.email.toLowerCase(), c]));
  let added = 0;
  for (const r of remote || []) {
    const email = (r && typeof r.email === 'string' ? r.email : '').trim();
    if (!email) continue;
    const local = byEmail.get(email.toLowerCase());
    if (!local) {
      const contact = {
        name: (r.name || '').trim(),
        email,
        status: r.status === 'unsubscribed' ? 'unsubscribed' : 'subscribed',
        addedAt: r.addedAt || new Date().toISOString(),
        source: r.source || 'manual',
      };
      contacts.push(contact);
      byEmail.set(email.toLowerCase(), contact);
      added++;
      continue;
    }
    if (r.status === 'unsubscribed') local.status = 'unsubscribed';
    const remoteAt = r.addedAt || '';
    if (remoteAt && (!local.addedAt || remoteAt < local.addedAt)) {
      local.addedAt = remoteAt;
      local.source = r.source || local.source;
    }
    if (!local.name && r.name) local.name = String(r.name).trim();
  }
  writeContacts(contacts);
  return { contacts, added };
}

module.exports = { readContacts, writeContacts, upsertContacts, updateContact, deleteContacts, updateContactsStatus, mergeContacts };
