const express = require('express');
const { readAllOrderCaches } = require('../orders/cache');
const { readContacts, upsertContacts, updateContact, deleteContacts, updateContactsStatus, mergeContacts } = require('./store');
const { collectOrderEmails } = require('./capture');
const { syncEmailListSheet } = require('./sheet');
const config = require('../config');
const { findFileByName, uploadFileContent, downloadFileContent } = require('../drive/client');

const EMAIL_LIST_DRIVE_NAME = 'email-list.json';

const router = express.Router();

const EMAIL_RE = /^\S+@\S+\.\S+$/;

function fireSync() {
  syncEmailListSheet().catch(err => console.warn('Email list sheet sync skipped:', err.message));
  uploadFileContent(EMAIL_LIST_DRIVE_NAME, JSON.stringify(readContacts(), null, 2), config.DRIVE.TOP_LEVEL_FOLDER)
    .catch(err => console.warn('Email list Drive backup skipped:', err.message));
}

router.get('/', (_req, res) => res.json({ contacts: readContacts() }));

router.post('/', (req, res) => {
  const { name = '', email = '' } = req.body || {};
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email address' });
  const { added } = upsertContacts([{ name, email, source: 'manual' }]);
  if (added.length === 0) return res.status(409).json({ error: 'Contact already on the list' });
  fireSync();
  res.status(201).json({ contact: added[0] });
});

router.put('/:email', (req, res) => {
  const contact = updateContact(req.params.email, req.body || {});
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  fireSync();
  res.json({ contact });
});

router.delete('/:email', (req, res) => {
  const removed = deleteContacts([req.params.email]);
  if (removed === 0) return res.status(404).json({ error: 'Contact not found' });
  fireSync();
  res.json({ removed });
});

router.post('/bulk', (req, res) => {
  const { emails, action } = req.body || {};
  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ error: 'No emails given' });
  }
  let affected;
  if (action === 'delete') affected = deleteContacts(emails);
  else if (action === 'subscribe') affected = updateContactsStatus(emails, 'subscribed');
  else if (action === 'unsubscribe') affected = updateContactsStatus(emails, 'unsubscribed');
  else return res.status(400).json({ error: 'Unknown action' });
  fireSync();
  res.json({ affected });
});

// Full merge cycle: pull the Drive copy, merge into local, push the merged
// list back, then rewrite the Sheet. Awaited so the UI gets honest results.
router.post('/sync', async (_req, res) => {
  try {
    let added = 0;
    const file = await findFileByName(EMAIL_LIST_DRIVE_NAME, config.DRIVE.TOP_LEVEL_FOLDER);
    if (file) {
      const content = await downloadFileContent(file.id);
      let remote = [];
      try { remote = JSON.parse(content); } catch { remote = []; }
      ({ added } = mergeContacts(Array.isArray(remote) ? remote : []));
    }
    const contacts = readContacts();
    await uploadFileContent(EMAIL_LIST_DRIVE_NAME, JSON.stringify(contacts, null, 2), config.DRIVE.TOP_LEVEL_FOLDER);
    await syncEmailListSheet();
    res.json({ ok: true, added, total: contacts.length });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.post('/backfill', (_req, res) => {
  const incoming = readAllOrderCaches()
    .flatMap(order => collectOrderEmails(order))
    .map(e => ({ ...e, source: 'backfill' }));
  const { contacts, added } = upsertContacts(incoming);
  fireSync();
  res.json({ added: added.length, total: contacts.length });
});

module.exports = router;
