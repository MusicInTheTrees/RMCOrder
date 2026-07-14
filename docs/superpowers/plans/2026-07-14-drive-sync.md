# Drive Sync (Status Emails + Email List) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let two machines converge on shared data: Pull/Push buttons for status-email templates, and a merging "Sync with Drive" cycle for the email list.

**Architecture:** Status emails reuse the items-catalog pattern (JSON file in the shared Drive folder via `findFileByName`/`uploadFileContent`/`downloadFileContent`) — save already pushes in the background; we add awaited pull/push routes plus tab buttons. The email list gets a `mergeContacts` union in the store, a full pull-merge-push-sheet cycle behind the existing `POST /emaillist/sync`, and a Drive JSON backup added to the fire-and-forget `fireSync()`. Spec: `docs/superpowers/specs/2026-07-14-drive-sync-status-emails-and-email-list-design.md`.

**Tech Stack:** Express 4 (jest + supertest, mocked `../drive/client`), React 19 (vitest + testing-library), existing `ConfirmDialog` component.

## Global Constraints

- Work on branch `maxr/drive-sync` (already checked out).
- Server tests: run from `server/` with `npx jest <pattern>`. Frontend tests: run from repo root with `npx vitest run <file>`. Vitest has NO mock clearing between tests — set mock data explicitly per test or in `beforeEach`.
- Drive filenames (exact): `status-email-templates.json` (already used by the PUT route's background upload) and `email-list.json`. Both live in `config.DRIVE.TOP_LEVEL_FOLDER`.
- Merge rules (exact): union by lowercased email; `unsubscribed` beats `subscribed`; earliest `addedAt` kept along with **its** `source` (missing/blank `addedAt` counts as later); non-empty name preferred, local wins when both non-empty.
- User-initiated sync/pull/push routes are awaited and report real errors (502 + `{ error }`; pull-with-no-file is 404). Background uploads stay fire-and-forget with `console.warn`.
- Email states are exactly `['sent', 'pending', 'fulfilled', 'shipped', 'delayed']` — test fixtures for StatusEmailsTab must include all five or the component crashes.
- UI copy (exact): note "Saving also backs up to Drive automatically." (Status Emails); note "Changes save locally right away; Sync merges with the shared Drive copy and updates the Google Sheet." and button "Sync with Drive" (Email List); pull confirm message "This replaces your local status emails with the shared Drive copy."

---

### Task 1: `mergeContacts` in the email-list store

**Files:**
- Modify: `server/emaillist/store.js`
- Test: `server/__tests__/emaillistStore.test.js`

**Interfaces:**
- Consumes: existing `readContacts()` / `writeContacts(contacts)` in the same file.
- Produces: `mergeContacts(remote: Array<contact-like>) => { contacts, added }` exported from `server/emaillist/store.js` — merges a remote contact array into the local file per the Global Constraints merge rules; `added` = count of remote-only contacts appended. Task 2's sync route calls this.

- [ ] **Step 1: Write the failing tests**

In `server/__tests__/emaillistStore.test.js`, widen the store destructure (currently line 28) to:

```js
const { readContacts, upsertContacts, updateContact, deleteContacts, updateContactsStatus, mergeContacts } = require('../emaillist/store');
```

Append at the end of the file:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `server/`): `npx jest emaillistStore`
Expected: the four new tests FAIL with `mergeContacts is not a function`; existing tests still pass.

- [ ] **Step 3: Implement `mergeContacts`**

In `server/emaillist/store.js`, insert before `module.exports`:

```js
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
```

Update the exports line to:

```js
module.exports = { readContacts, writeContacts, upsertContacts, updateContact, deleteContacts, updateContactsStatus, mergeContacts };
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `server/`): `npx jest emaillistStore`
Expected: ALL tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/emaillist/store.js server/__tests__/emaillistStore.test.js
git commit -m "feat: add mergeContacts union merge to email list store"
```

---

### Task 2: Email-list sync cycle + Drive backup in fireSync

**Files:**
- Modify: `server/emaillist/router.js`
- Test: `server/__tests__/emaillistRouter.test.js`

**Interfaces:**
- Consumes: `mergeContacts(remote)` from Task 1; existing `readContacts`, `syncEmailListSheet`; `findFileByName(name, parentId)`, `uploadFileContent(name, content, parentId)`, `downloadFileContent(fileId)` from `server/drive/client.js`.
- Produces: upgraded `POST /emaillist/sync` → 200 `{ ok: true, added, total }` | 502 `{ error }`; `fireSync()` now also uploads `email-list.json` fire-and-forget. Task 5's `syncEmailList()` client calls this endpoint.

- [ ] **Step 1: Update the tests**

In `server/__tests__/emaillistRouter.test.js`:

Add a drive-client mock next to the existing mocks (after the `../drive/designsCache` mock):

```js
jest.mock('../drive/client', () => ({
  findFileByName: jest.fn().mockResolvedValue(null),
  uploadFileContent: jest.fn().mockResolvedValue('file-id'),
  downloadFileContent: jest.fn(),
}));
```

Add to the requires (after the `syncEmailListSheet` require):

```js
const { findFileByName, uploadFileContent, downloadFileContent } = require('../drive/client');
```

**Delete** the existing test `'POST /emaillist/sync reports success and failure honestly'` (its response shape changes) and append these five tests at the end of the file:

```js
test('POST /emaillist/sync merges Drive contacts, pushes merged list, rewrites sheet', async () => {
  await request(app).post('/emaillist').send({ name: 'Ann', email: 'ann@x.com' });
  findFileByName.mockResolvedValue({ id: 'f1', name: 'email-list.json' });
  downloadFileContent.mockResolvedValue(JSON.stringify([
    { name: 'Cat', email: 'cat@x.com', status: 'subscribed', addedAt: '2026-01-05T00:00:00Z', source: 'backfill' },
  ]));
  uploadFileContent.mockClear();
  syncEmailListSheet.mockClear();

  const res = await request(app).post('/emaillist/sync');
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ ok: true, added: 1, total: 2 });
  const [name, content, folder] = uploadFileContent.mock.calls.at(-1);
  expect(name).toBe('email-list.json');
  expect(folder).toBe(config.DRIVE.TOP_LEVEL_FOLDER);
  expect(JSON.parse(content).map(c => c.email).sort()).toEqual(['ann@x.com', 'cat@x.com']);
  expect(syncEmailListSheet).toHaveBeenCalled();
});

test('POST /emaillist/sync works when Drive has no list yet', async () => {
  await request(app).post('/emaillist').send({ name: 'Ann', email: 'ann@x.com' });
  findFileByName.mockResolvedValue(null);
  const res = await request(app).post('/emaillist/sync');
  expect(res.body).toMatchObject({ ok: true, added: 0, total: 1 });
});

test('POST /emaillist/sync treats unparseable Drive JSON as empty and proceeds', async () => {
  findFileByName.mockResolvedValue({ id: 'f1' });
  downloadFileContent.mockResolvedValue('not json');
  const res = await request(app).post('/emaillist/sync');
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ ok: true, added: 0 });
});

test('POST /emaillist/sync 502s when Drive or the sheet rewrite fails', async () => {
  findFileByName.mockRejectedValueOnce(new Error('Drive down'));
  let res = await request(app).post('/emaillist/sync');
  expect(res.status).toBe(502);
  expect(res.body.error).toMatch(/Drive down/);

  findFileByName.mockResolvedValue(null);
  syncEmailListSheet.mockRejectedValueOnce(new Error('Sheets down'));
  res = await request(app).post('/emaillist/sync');
  expect(res.status).toBe(502);
  expect(res.body.error).toMatch(/Sheets down/);
});

test('mutations fire a background Drive JSON backup alongside the sheet sync', async () => {
  uploadFileContent.mockClear();
  await request(app).post('/emaillist').send({ name: 'Ann', email: 'ann@x.com' });
  expect(uploadFileContent).toHaveBeenCalledWith(
    'email-list.json', expect.any(String), config.DRIVE.TOP_LEVEL_FOLDER);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run (from `server/`): `npx jest emaillistRouter`
Expected: the five new tests FAIL (old sync route returns `{ ok: true }` with no counts; no Drive upload in fireSync); other tests still pass.

- [ ] **Step 3: Implement the sync cycle**

In `server/emaillist/router.js`:

Widen the store require to include `mergeContacts`:

```js
const { readContacts, upsertContacts, updateContact, deleteContacts, updateContactsStatus, mergeContacts } = require('./store');
```

Add below the existing requires:

```js
const config = require('../config');
const { findFileByName, uploadFileContent, downloadFileContent } = require('../drive/client');

const EMAIL_LIST_DRIVE_NAME = 'email-list.json';
```

(If `config` is already required in this file, keep the single existing require.)

Replace the `fireSync` function with:

```js
function fireSync() {
  syncEmailListSheet().catch(err => console.warn('Email list sheet sync skipped:', err.message));
  uploadFileContent(EMAIL_LIST_DRIVE_NAME, JSON.stringify(readContacts(), null, 2), config.DRIVE.TOP_LEVEL_FOLDER)
    .catch(err => console.warn('Email list Drive backup skipped:', err.message));
}
```

Replace the existing `router.post('/sync', ...)` route with:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `server/`): `npx jest emaillistRouter`
Expected: ALL tests PASS.

- [ ] **Step 5: Run the full server suite**

Run (from `server/`): `npm test`
Expected: ALL suites PASS.

- [ ] **Step 6: Commit**

```bash
git add server/emaillist/router.js server/__tests__/emaillistRouter.test.js
git commit -m "feat: merging Drive sync cycle for email list; background Drive backup"
```

---

### Task 3: Status-email template pull/push routes

**Files:**
- Modify: `server/gmail/router.js` (templates section, around lines 110-130)
- Create: `server/__tests__/statusEmailSyncRoutes.test.js`

**Interfaces:**
- Consumes: existing `readStatusEmails()` / `writeStatusEmails(data)` from `server/gmail/statusEmailStore.js` (writeStatusEmails validates and fills defaults); `findFileByName` / `uploadFileContent` / `downloadFileContent` from `server/drive/client.js`.
- Produces: `POST /gmail/customer-email/templates/push` → 200 `{ ok: true }` | 502 `{ error }`; `POST /gmail/customer-email/templates/pull` → 200 saved `{ templates, genericCustomerName }` | 404 `{ error }` (no Drive file) | 502 `{ error }`. Task 4's client functions call these.

- [ ] **Step 1: Write the failing tests**

Create `server/__tests__/statusEmailSyncRoutes.test.js`:

```js
const request = require('supertest');
const fs = require('fs');
const path = require('path');
const config = require('../config');

jest.mock('../auth/oauth', () => ({
  loadTokens: () => ({ refresh_token: 'x' }),
  getOAuth2Client: () => ({}),
}));
jest.mock('../drive/client', () => ({
  uploadFileContent: jest.fn().mockResolvedValue('id'),
  downloadFileContent: jest.fn(),
  findFileByName: jest.fn(),
  listFiles: jest.fn(), findFolderByName: jest.fn(), copyFile: jest.fn(), shareFileWithUser: jest.fn(),
}));
jest.mock('../drive/designsCache', () => ({
  syncDesignsCache: jest.fn().mockResolvedValue(),
  listCachedDesigns: jest.fn().mockReturnValue([]),
}));

const TEST_TPL = path.join(__dirname, 'status-email-sync-test.json');
const realTpl = config.STATUS_EMAIL_FILE;

beforeEach(() => {
  jest.clearAllMocks();
  config.STATUS_EMAIL_FILE = TEST_TPL;
  if (fs.existsSync(TEST_TPL)) fs.unlinkSync(TEST_TPL);
});
afterEach(() => {
  config.STATUS_EMAIL_FILE = realTpl;
  if (fs.existsSync(TEST_TPL)) fs.unlinkSync(TEST_TPL);
});

const app = require('../index');
const { uploadFileContent, downloadFileContent, findFileByName } = require('../drive/client');

test('POST templates/push uploads the current local templates', async () => {
  const res = await request(app).post('/gmail/customer-email/templates/push');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true });
  const [name, content, folder] = uploadFileContent.mock.calls[0];
  expect(name).toBe('status-email-templates.json');
  expect(JSON.parse(content).templates.sent).toBeTruthy();
  expect(folder).toBe(config.DRIVE.TOP_LEVEL_FOLDER);
});

test('POST templates/push 502s on Drive failure', async () => {
  uploadFileContent.mockRejectedValueOnce(new Error('Drive down'));
  const res = await request(app).post('/gmail/customer-email/templates/push');
  expect(res.status).toBe(502);
  expect(res.body.error).toMatch(/Drive down/);
});

test('POST templates/pull 404s when no Drive file exists', async () => {
  findFileByName.mockResolvedValue(null);
  const res = await request(app).post('/gmail/customer-email/templates/pull');
  expect(res.status).toBe(404);
  expect(res.body.error).toMatch(/No status emails on Drive yet/);
});

test('POST templates/pull saves the Drive copy locally and returns it', async () => {
  findFileByName.mockResolvedValue({ id: 'f1' });
  downloadFileContent.mockResolvedValue(JSON.stringify({
    templates: { sent: { subject: 'Partner subject', body: 'Partner body' } },
    genericCustomerName: 'Cat Friend',
  }));
  const res = await request(app).post('/gmail/customer-email/templates/pull');
  expect(res.status).toBe(200);
  expect(res.body.templates.sent.subject).toBe('Partner subject');
  expect(res.body.genericCustomerName).toBe('Cat Friend');
  // Persisted locally; writeStatusEmails fills the other states with defaults.
  const onDisk = JSON.parse(fs.readFileSync(TEST_TPL, 'utf8'));
  expect(onDisk.templates.sent.subject).toBe('Partner subject');
  expect(onDisk.templates.pending).toBeTruthy();
});

test('POST templates/pull 502s on invalid JSON from Drive', async () => {
  findFileByName.mockResolvedValue({ id: 'f1' });
  downloadFileContent.mockResolvedValue('not json');
  const res = await request(app).post('/gmail/customer-email/templates/pull');
  expect(res.status).toBe(502);
  expect(res.body.error).toMatch(/not valid JSON/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `server/`): `npx jest statusEmailSyncRoutes`
Expected: FAIL — the push/pull routes return 404 (Express unmatched route).

- [ ] **Step 3: Implement the routes**

In `server/gmail/router.js`:

1. Extend the existing `../drive/client` destructured require to also include `findFileByName` and `downloadFileContent` (keep whatever it already imports).
2. Add near the templates section (above the GET templates route):

```js
const STATUS_TEMPLATES_DRIVE_NAME = 'status-email-templates.json';
```

3. In the PUT `/customer-email/templates` route, replace the string literal `'status-email-templates.json'` (line ~122) with `STATUS_TEMPLATES_DRIVE_NAME`.
4. Add after the PUT templates route:

```js
// Awaited push/pull so the Settings UI gets honest results (the PUT route's
// background upload can fail silently; these cannot).
router.post('/customer-email/templates/push', async (_req, res) => {
  try {
    await uploadFileContent(STATUS_TEMPLATES_DRIVE_NAME, JSON.stringify(readStatusEmails(), null, 2), config.DRIVE.TOP_LEVEL_FOLDER);
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.post('/customer-email/templates/pull', async (_req, res) => {
  try {
    const file = await findFileByName(STATUS_TEMPLATES_DRIVE_NAME, config.DRIVE.TOP_LEVEL_FOLDER);
    if (!file) return res.status(404).json({ error: 'No status emails on Drive yet — save or push from the other machine first.' });
    const content = await downloadFileContent(file.id);
    let parsed;
    try { parsed = JSON.parse(content); } catch { return res.status(502).json({ error: 'Drive copy is not valid JSON' }); }
    res.json(writeStatusEmails(parsed));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `server/`): `npx jest statusEmailSyncRoutes`
Expected: ALL 5 PASS.

- [ ] **Step 5: Run the full server suite**

Run (from `server/`): `npm test`
Expected: ALL suites PASS (customerEmail.test.js confirms the PUT literal→constant swap broke nothing).

- [ ] **Step 6: Commit**

```bash
git add server/gmail/router.js server/__tests__/statusEmailSyncRoutes.test.js
git commit -m "feat: awaited pull/push routes for status email templates"
```

---

### Task 4: Status Emails tab — Pull/Push buttons

**Files:**
- Modify: `src/api/customerEmails.js`
- Modify: `src/components/StatusEmailsTab.jsx`
- Create: `src/__tests__/StatusEmailsTab.test.jsx`

**Interfaces:**
- Consumes: Task 3's endpoints; `ConfirmDialog` (`{ message, onConfirm, onCancel }`, buttons named exactly "Cancel"/"Confirm"); existing CSS classes `emaillist-toolbar` and `emaillist-autosave-note` (generic toolbar styling added in the email-screen redesign).
- Produces: `pullStatusEmailTemplates()` and `pushStatusEmailTemplates()` exported from `src/api/customerEmails.js`.

- [ ] **Step 1: Add the API client functions**

Append to `src/api/customerEmails.js`:

```js
export const pullStatusEmailTemplates = () =>
  apiFetch('/gmail/customer-email/templates/pull', { method: 'POST' });

export const pushStatusEmailTemplates = () =>
  apiFetch('/gmail/customer-email/templates/push', { method: 'POST' });
```

- [ ] **Step 2: Write the failing tests**

Create `src/__tests__/StatusEmailsTab.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StatusEmailsTab from '../components/StatusEmailsTab';
import {
  getStatusEmailTemplates, pullStatusEmailTemplates, pushStatusEmailTemplates,
} from '../api/customerEmails';

vi.mock('../api/customerEmails', () => ({
  getStatusEmailTemplates: vi.fn(),
  saveStatusEmailTemplates: vi.fn().mockResolvedValue({}),
  pullStatusEmailTemplates: vi.fn(),
  pushStatusEmailTemplates: vi.fn(),
  previewCustomerEmail: vi.fn(),
  generateCustomerDrafts: vi.fn(),
  sendCustomerEmail: vi.fn(),
}));

// All five states must be present or the component crashes on render.
const BASE = {
  templates: {
    sent: { subject: 'S-sent', body: 'B-sent' },
    pending: { subject: 'S-pending', body: 'B-pending' },
    fulfilled: { subject: 'S-fulfilled', body: 'B-fulfilled' },
    shipped: { subject: 'S-shipped', body: 'B-shipped' },
    delayed: { subject: 'S-delayed', body: 'B-delayed' },
  },
  genericCustomerName: 'Friend',
};

beforeEach(() => {
  vi.clearAllMocks();
  getStatusEmailTemplates.mockResolvedValue(BASE);
  pushStatusEmailTemplates.mockResolvedValue({ ok: true });
});

test('pull asks for confirmation; cancel does not call the API', async () => {
  render(<StatusEmailsTab />);
  await userEvent.click(await screen.findByRole('button', { name: /Pull from Drive/i }));
  expect(screen.getByText(/replaces your local status emails/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(pullStatusEmailTemplates).not.toHaveBeenCalled();
});

test('pull confirm replaces the editor state and reports success', async () => {
  pullStatusEmailTemplates.mockResolvedValue({
    ...BASE,
    templates: { ...BASE.templates, sent: { subject: 'Partner subject', body: 'PB' } },
    genericCustomerName: 'Partner Name',
  });
  render(<StatusEmailsTab />);
  await userEvent.click(await screen.findByRole('button', { name: /Pull from Drive/i }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  expect(await screen.findByText(/Pulled latest from Drive/i)).toBeInTheDocument();
  expect(screen.getByDisplayValue('Partner subject')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Partner Name')).toBeInTheDocument();
});

test('push uploads and reports success', async () => {
  render(<StatusEmailsTab />);
  await userEvent.click(await screen.findByRole('button', { name: /Push to Drive/i }));
  expect(await screen.findByText(/Pushed to Drive/i)).toBeInTheDocument();
  expect(pushStatusEmailTemplates).toHaveBeenCalled();
});

test('push failure shows the server error', async () => {
  pushStatusEmailTemplates.mockRejectedValue(new Error('Drive down'));
  render(<StatusEmailsTab />);
  await userEvent.click(await screen.findByRole('button', { name: /Push to Drive/i }));
  expect(await screen.findByText(/Push failed: Drive down/i)).toBeInTheDocument();
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run (from repo root): `npx vitest run src/__tests__/StatusEmailsTab.test.jsx`
Expected: FAIL — no Pull/Push buttons exist yet.

- [ ] **Step 4: Add the toolbar to the component**

In `src/components/StatusEmailsTab.jsx`:

1. Extend the API import:

```jsx
import {
  getStatusEmailTemplates, saveStatusEmailTemplates,
  pullStatusEmailTemplates, pushStatusEmailTemplates,
} from '../api/customerEmails';
import ConfirmDialog from './ConfirmDialog';
```

2. Add state next to the existing state hooks:

```jsx
const [confirmPull, setConfirmPull] = useState(false);
```

3. Add handlers after `handleSave`:

```jsx
async function handlePush() {
  setMsg(null);
  try {
    await pushStatusEmailTemplates();
    setMsg('Pushed to Drive ✓');
  } catch (e) {
    setMsg(`Push failed: ${e.message}`);
  }
}

async function handlePull() {
  setConfirmPull(false);
  setMsg(null);
  try {
    const d = await pullStatusEmailTemplates();
    setTemplates(d.templates);
    setGenericName(d.genericCustomerName || '');
    setMsg('Pulled latest from Drive ✓');
  } catch (e) {
    setMsg(`Pull failed: ${e.message}`);
  }
}
```

4. Add the toolbar as the FIRST child inside `<div className="status-emails-tab">` (above the placeholder-help block):

```jsx
<div className="emaillist-toolbar">
  <button className="btn-secondary" onClick={() => setConfirmPull(true)}>Pull from Drive</button>
  <button className="btn-secondary" onClick={handlePush}>Push to Drive</button>
  <span className="emaillist-autosave-note">Saving also backs up to Drive automatically.</span>
</div>
```

5. Add the dialog just before the closing `</div>` of the tab:

```jsx
{confirmPull && (
  <ConfirmDialog
    message="This replaces your local status emails with the shared Drive copy."
    onConfirm={handlePull}
    onCancel={() => setConfirmPull(false)}
  />
)}
```

6. The tab's root div needs the flex-gap layout the email tabs use; add `status-emails-tab` to the shared rule in `src/App.css` — change the selector `.emaillist-tab, .campaigns-tab {` (in the "Email List & Campaign" section) to:

```css
.emaillist-tab, .campaigns-tab, .status-emails-tab {
```

- [ ] **Step 5: Run tests to verify they pass**

Run (from repo root): `npx vitest run src/__tests__/StatusEmailsTab.test.jsx`
Expected: ALL 4 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/api/customerEmails.js src/components/StatusEmailsTab.jsx src/__tests__/StatusEmailsTab.test.jsx src/App.css
git commit -m "feat: Pull/Push Drive buttons on Status Emails tab"
```

---

### Task 5: Email List tab — merging Sync button

**Files:**
- Modify: `src/api/emailList.js` (rename `syncSheet` → `syncEmailList`)
- Modify: `src/components/EmailListTab.jsx`
- Modify: `src/__tests__/EmailListTab.test.jsx`
- Modify: `src/__tests__/EmailScreen.test.jsx` (mock key rename)

**Interfaces:**
- Consumes: Task 2's `POST /emaillist/sync` → `{ ok, added, total }`.
- Produces: `syncEmailList()` exported from `src/api/emailList.js` (replaces `syncSheet`; same endpoint, richer response).

- [ ] **Step 1: Rename the API function**

In `src/api/emailList.js`, replace:

```js
export const syncSheet = () => apiFetch('/emaillist/sync', { method: 'POST' });
```

with:

```js
export const syncEmailList = () => apiFetch('/emaillist/sync', { method: 'POST' });
```

- [ ] **Step 2: Update the tests**

In `src/__tests__/EmailListTab.test.jsx`:
- In the import from `../api/emailList` and in the `vi.mock` factory, rename `syncSheet` → `syncEmailList` and give it the new shape: `syncEmailList: vi.fn().mockResolvedValue({ ok: true, added: 3, total: 47 }),`
- Replace the existing `'sync button reports success'` test with:

```jsx
test('sync button merges with Drive and reports counts', async () => {
  render(<EmailListTab />);
  await screen.findByText(/No contacts yet/i);
  await userEvent.click(screen.getByRole('button', { name: /Sync with Drive/i }));
  expect(await screen.findByText(/3 new contact\(s\) pulled in, 47 total/i)).toBeInTheDocument();
  expect(syncEmailList).toHaveBeenCalled();
});
```

In `src/__tests__/EmailScreen.test.jsx`, in the `../api/emailList` mock factory, rename the key `syncSheet: vi.fn(),` → `syncEmailList: vi.fn(),`.

- [ ] **Step 3: Run tests to verify the new one fails**

Run (from repo root): `npx vitest run src/__tests__/EmailListTab.test.jsx`
Expected: the sync test FAILS (button still labeled "Sync to Google Sheet"); others pass.

- [ ] **Step 4: Update the component**

In `src/components/EmailListTab.jsx`:

1. In the `../api/emailList` import, rename `syncSheet` → `syncEmailList`.
2. Replace `handleSync` with:

```jsx
async function handleSync() {
  setMsg('Syncing…');
  try {
    const r = await syncEmailList();
    setMsg(`Synced — ${r.added} new contact(s) pulled in, ${r.total} total.`);
    load();
  } catch (err) {
    setMsg(`Sync failed: ${err.message}`);
  }
}
```

3. In the toolbar, change the button label `Sync to Google Sheet` → `Sync with Drive`, and change the note text to:

```jsx
<span className="emaillist-autosave-note">
  Changes save locally right away; Sync merges with the shared Drive copy and updates the Google Sheet.
</span>
```

- [ ] **Step 5: Run the focused tests, then both full suites**

Run (from repo root): `npx vitest run src/__tests__/EmailListTab.test.jsx src/__tests__/EmailScreen.test.jsx`
Expected: ALL PASS.
Run (from repo root): `npx vitest run` — Expected: ALL PASS.
Run (from `server/`): `npm test` — Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add src/api/emailList.js src/components/EmailListTab.jsx src/__tests__/EmailListTab.test.jsx src/__tests__/EmailScreen.test.jsx
git commit -m "feat: merging Sync with Drive button on email list tab"
```

---

## Verification (after all tasks)

- [ ] Full suites green: `npx vitest run` (root) and `npm test` (server/).
- [ ] Manual smoke test with `npm run dev:backend` + `npm run dev:frontend`:
  - Settings → Status Emails: Pull from Drive (confirm dialog → partner's templates appear), Push to Drive reports ✓.
  - Email screen → Email List: "Sync with Drive" reports "Synced — N new contact(s) pulled in, M total." and the table refreshes with merged contacts.
