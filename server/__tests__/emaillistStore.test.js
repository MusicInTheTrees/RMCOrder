const fs = require('fs');
const path = require('path');
const config = require('../config');

const TEST_FILE = path.join(__dirname, 'email-list-test.json');
const realFile = config.EMAIL_LIST_FILE;

beforeEach(() => {
  config.EMAIL_LIST_FILE = TEST_FILE;
  if (fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE);
});
afterEach(() => {
  config.EMAIL_LIST_FILE = realFile;
  if (fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE);
});

const { readContacts, upsertContacts, updateContact } = require('../emaillist/store');

test('readContacts returns [] when file missing', () => {
  expect(readContacts()).toEqual([]);
});

test('upsertContacts inserts new contacts with defaults', () => {
  const { contacts, added } = upsertContacts([{ name: 'Ann', email: 'ann@x.com', source: 'RMC-001-2026-01-01' }]);
  expect(added).toHaveLength(1);
  expect(contacts[0]).toMatchObject({
    name: 'Ann', email: 'ann@x.com', status: 'subscribed', source: 'RMC-001-2026-01-01',
  });
  expect(contacts[0].addedAt).toBeTruthy();
  expect(readContacts()).toHaveLength(1);
});

test('upsert dedupes case-insensitively and preserves status/addedAt/source', () => {
  upsertContacts([{ name: 'Ann', email: 'ann@x.com', source: 'RMC-001-2026-01-01' }]);
  updateContact('ann@x.com', { status: 'unsubscribed' });
  const { contacts, added } = upsertContacts([{ name: 'Annie', email: 'ANN@X.COM', source: 'RMC-002-2026-02-02' }]);
  expect(added).toHaveLength(0);
  expect(contacts).toHaveLength(1);
  expect(contacts[0].status).toBe('unsubscribed');       // never resurrected
  expect(contacts[0].source).toBe('RMC-001-2026-01-01'); // original source kept
});

test('upsert fills an empty name but never overwrites one', () => {
  upsertContacts([{ name: '', email: 'bo@x.com', source: 'manual' }]);
  upsertContacts([{ name: 'Bo', email: 'bo@x.com', source: 'manual' }]);
  expect(readContacts()[0].name).toBe('Bo');
  upsertContacts([{ name: 'Robert', email: 'bo@x.com', source: 'manual' }]);
  expect(readContacts()[0].name).toBe('Bo');
});

test('upsert defaults source to manual and skips blank emails', () => {
  const { added } = upsertContacts([{ name: 'C', email: 'c@x.com' }, { name: 'Bad', email: '' }]);
  expect(added).toHaveLength(1);
  expect(added[0].source).toBe('manual');
});

test('updateContact edits name/status, returns null for unknown', () => {
  upsertContacts([{ name: 'Ann', email: 'ann@x.com', source: 'manual' }]);
  const updated = updateContact('ANN@x.com', { status: 'unsubscribed', addedAt: 'HACK' });
  expect(updated.status).toBe('unsubscribed');
  expect(updated.addedAt).not.toBe('HACK'); // only name/status updatable
  expect(updateContact('nobody@x.com', { status: 'unsubscribed' })).toBeNull();
});
