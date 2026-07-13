const express = require('express');
const { readContacts, upsertContacts, updateContact } = require('./store');
const { syncEmailListSheet } = require('./sheet');

const router = express.Router();

const EMAIL_RE = /^\S+@\S+\.\S+$/;

function fireSync() {
  syncEmailListSheet().catch(err => console.warn('Email list sheet sync skipped:', err.message));
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

module.exports = router;
