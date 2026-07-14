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

const { readContacts, upsertContacts, updateContact, deleteContacts, updateContactsStatus, mergeContacts } = require('../emaillist/store');

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

test('updateContact treats a null name as empty instead of the string null', () => {
  upsertContacts([{ name: 'Ann', email: 'ann@x.com', source: 'manual' }]);
  expect(updateContact('ann@x.com', { name: null }).name).toBe('');
});

test('deleteContacts removes matches case-insensitively and reports count', () => {
  upsertContacts([
    { name: 'Ann', email: 'ann@x.com', source: 'manual' },
    { name: 'Bo', email: 'bo@x.com', source: 'manual' },
  ]);
  expect(deleteContacts(['ANN@X.COM', 'missing@x.com'])).toBe(1);
  expect(readContacts().map(c => c.email)).toEqual(['bo@x.com']);
  expect(deleteContacts(['nobody@x.com'])).toBe(0);
});

test('updateContactsStatus bulk-sets status case-insensitively and reports count', () => {
  upsertContacts([
    { name: 'Ann', email: 'ann@x.com', source: 'manual' },
    { name: 'Bo', email: 'bo@x.com', source: 'manual' },
  ]);
  expect(updateContactsStatus(['ann@x.com', 'BO@x.com', 'nope@x.com'], 'unsubscribed')).toBe(2);
  expect(readContacts().every(c => c.status === 'unsubscribed')).toBe(true);
  expect(updateContactsStatus(['ann@x.com'], 'subscribed')).toBe(1);
  expect(readContacts().find(c => c.email === 'ann@x.com').status).toBe('subscribed');
  expect(updateContactsStatus(['ann@x.com'], 'bogus')).toBe(0);
});

test('mergeContacts appends remote-only contacts preserving their fields', () => {
  upsertContacts([{ name: 'Ann', email: 'ann@x.com', source: 'manual' }]);
  const { contacts, added } = mergeContacts([
    { name: 'Cat', email: 'cat@x.com', status: 'unsubscribed', addedAt: '2026-01-05T00:00:00Z', source: 'backfill' },
  ]);
  expect(added).toBe(1);
  expect(contacts).toHaveLength(2);
  expect(contacts[1]).toMatchObject({
    name: 'Cat', email: 'cat@x.com', status: 'unsubscribed',
    addedAt: '2026-01-05T00:00:00Z', source: 'backfill',
  });
  expect(readContacts()).toHaveLength(2);
});

test('mergeContacts: unsubscribed wins in both directions, case-insensitively', () => {
  upsertContacts([{ name: 'Ann', email: 'ann@x.com', source: 'manual' }]);
  updateContact('ann@x.com', { status: 'unsubscribed' });
  mergeContacts([{ email: 'ANN@X.COM', status: 'subscribed' }]);
  expect(readContacts()[0].status).toBe('unsubscribed'); // local unsub survives remote sub

  upsertContacts([{ name: 'Bo', email: 'bo@x.com', source: 'manual' }]);
  mergeContacts([{ email: 'bo@x.com', status: 'unsubscribed' }]);
  expect(readContacts().find(c => c.email === 'bo@x.com').status).toBe('unsubscribed');
});

test('mergeContacts keeps earliest addedAt with its source; blank addedAt counts as later', () => {
  upsertContacts([{ name: 'Ann', email: 'ann@x.com', source: 'RMC-002' }]); // addedAt = now
  mergeContacts([{ email: 'ann@x.com', addedAt: '2020-01-01T00:00:00Z', source: 'RMC-001' }]);
  let ann = readContacts()[0];
  expect(ann.addedAt).toBe('2020-01-01T00:00:00Z');
  expect(ann.source).toBe('RMC-001');

  mergeContacts([{ email: 'ann@x.com', addedAt: '', source: 'RMC-003' }]);
  ann = readContacts()[0];
  expect(ann.addedAt).toBe('2020-01-01T00:00:00Z'); // blank remote timestamp never wins
  expect(ann.source).toBe('RMC-001');
});

test('mergeContacts fills empty local name, never overwrites one, skips malformed entries', () => {
  upsertContacts([{ name: '', email: 'ann@x.com', source: 'manual' }]);
  const { added } = mergeContacts([
    { email: 'ann@x.com', name: 'Annie' },
    { name: 'NoEmail' },
    null,
    { email: '   ' },
  ]);
  expect(added).toBe(0);
  expect(readContacts()[0].name).toBe('Annie');

  mergeContacts([{ email: 'ann@x.com', name: 'Other' }]);
  expect(readContacts()[0].name).toBe('Annie');
});
