# Email List & Campaigns (Spec Phases 1+2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture every customer email added to any order into a central email list (Google Sheet + local JSON mirror), and add a job-queue campaign engine that sends one-off scheduled email blasts through the existing Gmail integration.

**Architecture:** Two new backend modules — `server/emaillist/` (contact store, Sheet sync, capture hook, backfill) and `server/campaigns/` (JSON job queue, 60-second scheduler loop, campaign email builder, blast endpoints) — plus two new Settings tabs (`EmailListTab`, `CampaignsTab`). Everything follows the app's existing patterns: JSON stores like `settings.json`, Google Sheet as shareable artifact with local fallback, Gmail sends via `gmail/client.js`.

**Tech Stack:** Express (CommonJS) backend, React 19 + Vite (ESM) frontend, Jest + Supertest backend tests, Vitest + RTL frontend tests, googleapis (already integrated).

**Spec:** `docs/superpowers/specs/2026-07-12-email-campaigns-design.md`. This plan implements **Phase 1 (email list capture) and Phase 2 (job engine + scheduler + one-off blasts)**. Phases 3–5 (newsletter, order-triggered reminders, drips) get their own plans later.

## Global Constraints

- Backend is **CommonJS** (`require`/`module.exports`); frontend is **ESM**.
- Backend tests: Jest + Supertest in `server/__tests__/`, run with `cd server && npm test -- --testPathPattern=<name>`. Google API modules are always mocked.
- Frontend tests: Vitest + RTL in `src/__tests__/`, run with `npm run test -- <pattern>` from the repo root. `vi` is a global (no import needed).
- Placeholder tokens in email templates are `[customer name]` (the app's existing convention — NOT `{{name}}`).
- Contact record shape everywhere: `{ name, email, status: 'subscribed'|'unsubscribed', addedAt, source }`.
- Job record shape everywhere: `{ id, subject, body, recipients, sendAt, status: 'scheduled'|'sent'|'failed'|'cancelled', createdBy, sentAt, error, results }`. `recipients` is the string `'list'` or an array of email strings.
- The capture hook and Sheet sync are **fire-and-forget**: they must never fail or delay an order save or an API response.
- Dedupe is always **case-insensitive on email**. Re-adding an existing contact never changes its `status`, `addedAt`, or `source`.
- Unsubscribed contacts are skipped at **send time**, including explicit-recipient jobs.
- Stale cutoff: jobs more than **48 hours** past `sendAt` are marked `failed` with `error: 'stale'`, never sent.
- Sends are spaced ~1 second apart (injectable delay so tests pass `delayMs: 0`).
- Commit after every green test cycle.

**Two intentional deviations from the spec** (approved rationale): (1) templates use the existing `[customer name]` token convention instead of the spec's `{{name}}` example; (2) the unsubscribe footer says "reply to this email with 'unsubscribe'" instead of a `mailto:` link — a reply already goes to the sending account, so no address needs embedding.

---

### Task 1: Contact store (`server/emaillist/store.js`)

**Files:**
- Modify: `server/config.js` (add `EMAIL_LIST_FILE`)
- Create: `server/emaillist/store.js`
- Test: `server/__tests__/emaillistStore.test.js`

**Interfaces:**
- Consumes: `config.EMAIL_LIST_FILE`
- Produces:
  - `readContacts() → Contact[]` (empty array if file missing/corrupt)
  - `writeContacts(contacts) → void`
  - `upsertContacts(incoming) → { contacts: Contact[], added: Contact[] }` — `incoming` is `[{ name, email, source }]`; inserts get `status: 'subscribed'`, `addedAt: new Date().toISOString()`, `source: incoming.source || 'manual'`; matches are case-insensitive on email; an existing contact only gains a `name` if its own is empty
  - `updateContact(email, fields) → Contact | null` — case-insensitive lookup; only `name` and `status` are updatable

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/emaillistStore.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --testPathPattern=emaillistStore`
Expected: FAIL — `Cannot find module '../emaillist/store'`

- [ ] **Step 3: Write the implementation**

Add to the `module.exports` object in `server/config.js`, after the `STATUS_EMAIL_FILE` line:

```js
  EMAIL_LIST_FILE: path.join(__dirname, 'email-list.json'),
```

Add to `.gitignore`, after the `server/items-catalog.json` line (runtime data, same as `server/settings.json`):

```
server/email-list.json
```

```js
// server/emaillist/store.js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- --testPathPattern=emaillistStore`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add .gitignore server/config.js server/emaillist/store.js server/__tests__/emaillistStore.test.js
git commit -m "feat: add email list contact store with case-insensitive upsert"
```

---

### Task 2: Email List Sheet sync (`server/emaillist/sheet.js`)

**Files:**
- Modify: `server/settings/store.js` (add `emailListSheetId: ''` to `DEFAULTS`)
- Create: `server/emaillist/sheet.js`
- Test: `server/__tests__/emaillistSheet.test.js`

**Interfaces:**
- Consumes: `readContacts()` from Task 1; `findFileByName`, `createSpreadsheet` from `server/drive/client.js`; `clearRange`, `writeRange` from `server/sheets/client.js`; `readSettings`, `writeSettings` from `server/settings/store.js`; `config.DRIVE.TOP_LEVEL_FOLDER`
- Produces:
  - `ensureEmailListSheet() → Promise<sheetId>` — returns `settings.emailListSheetId` if set; otherwise finds a Drive file named `RMC Email List` in the Top Level Operating Folder or creates the spreadsheet, then persists the id to settings
  - `syncEmailListSheet() → Promise<void>` — clears `A1:Z10000` and writes header `['Name','Email','Status','Added','Source']` plus one row per contact, `RAW` input option. **Callers must `.catch()` — this function may reject when Drive is down.**

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/emaillistSheet.test.js
const fs = require('fs');
const path = require('path');

jest.mock('../drive/client', () => ({
  findFileByName: jest.fn(),
  createSpreadsheet: jest.fn(),
}));
jest.mock('../sheets/client', () => ({
  clearRange: jest.fn().mockResolvedValue(),
  writeRange: jest.fn().mockResolvedValue(),
}));

const config = require('../config');
const TEST_SETTINGS = path.join(__dirname, 'emaillist-settings-test.json');
const TEST_LIST = path.join(__dirname, 'emaillist-sheet-test.json');
const realSettings = config.SETTINGS_FILE;
const realList = config.EMAIL_LIST_FILE;

beforeEach(() => {
  config.SETTINGS_FILE = TEST_SETTINGS;
  config.EMAIL_LIST_FILE = TEST_LIST;
  for (const f of [TEST_SETTINGS, TEST_LIST]) if (fs.existsSync(f)) fs.unlinkSync(f);
  jest.clearAllMocks();
});
afterEach(() => {
  config.SETTINGS_FILE = realSettings;
  config.EMAIL_LIST_FILE = realList;
  for (const f of [TEST_SETTINGS, TEST_LIST]) if (fs.existsSync(f)) fs.unlinkSync(f);
});

const { findFileByName, createSpreadsheet } = require('../drive/client');
const { clearRange, writeRange } = require('../sheets/client');
const { ensureEmailListSheet, syncEmailListSheet } = require('../emaillist/sheet');
const { upsertContacts } = require('../emaillist/store');
const { readSettings } = require('../settings/store');

test('ensureEmailListSheet creates the sheet and saves its id to settings', async () => {
  findFileByName.mockResolvedValue(null);
  createSpreadsheet.mockResolvedValue('new-sheet-id');
  const id = await ensureEmailListSheet();
  expect(id).toBe('new-sheet-id');
  expect(createSpreadsheet).toHaveBeenCalledWith('RMC Email List', config.DRIVE.TOP_LEVEL_FOLDER);
  expect(readSettings().emailListSheetId).toBe('new-sheet-id');
});

test('ensureEmailListSheet reuses an existing Drive file by name', async () => {
  findFileByName.mockResolvedValue({ id: 'found-id', name: 'RMC Email List' });
  expect(await ensureEmailListSheet()).toBe('found-id');
  expect(createSpreadsheet).not.toHaveBeenCalled();
});

test('ensureEmailListSheet short-circuits when settings already hold an id', async () => {
  const { writeSettings, readSettings: rs } = require('../settings/store');
  writeSettings({ ...rs(), emailListSheetId: 'saved-id' });
  expect(await ensureEmailListSheet()).toBe('saved-id');
  expect(findFileByName).not.toHaveBeenCalled();
});

test('syncEmailListSheet clears then writes header + contact rows', async () => {
  const { writeSettings, readSettings: rs } = require('../settings/store');
  writeSettings({ ...rs(), emailListSheetId: 'sheet-1' });
  upsertContacts([{ name: 'Ann', email: 'ann@x.com', source: 'manual' }]);
  await syncEmailListSheet();
  expect(clearRange).toHaveBeenCalledWith('sheet-1', 'A1:Z10000');
  const [sheetId, range, rows, opt] = writeRange.mock.calls[0];
  expect(sheetId).toBe('sheet-1');
  expect(range).toBe('A1');
  expect(rows[0]).toEqual(['Name', 'Email', 'Status', 'Added', 'Source']);
  expect(rows[1][1]).toBe('ann@x.com');
  expect(opt).toBe('RAW');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --testPathPattern=emaillistSheet`
Expected: FAIL — `Cannot find module '../emaillist/sheet'`

- [ ] **Step 3: Write the implementation**

In `server/settings/store.js`, add to `DEFAULTS`:

```js
  emailListSheetId: '',
```

```js
// server/emaillist/sheet.js
const config = require('../config');
const { findFileByName, createSpreadsheet } = require('../drive/client');
const { clearRange, writeRange } = require('../sheets/client');
const { readSettings, writeSettings } = require('../settings/store');
const { readContacts } = require('./store');

const SHEET_NAME = 'RMC Email List';

async function ensureEmailListSheet() {
  const settings = readSettings();
  if (settings.emailListSheetId) return settings.emailListSheetId;
  const existing = await findFileByName(SHEET_NAME, config.DRIVE.TOP_LEVEL_FOLDER);
  const sheetId = existing ? existing.id : await createSpreadsheet(SHEET_NAME, config.DRIVE.TOP_LEVEL_FOLDER);
  writeSettings({ ...readSettings(), emailListSheetId: sheetId });
  return sheetId;
}

// May reject when Drive is unreachable — callers must .catch().
async function syncEmailListSheet() {
  const sheetId = await ensureEmailListSheet();
  const rows = [
    ['Name', 'Email', 'Status', 'Added', 'Source'],
    ...readContacts().map(c => [c.name, c.email, c.status, c.addedAt, c.source]),
  ];
  await clearRange(sheetId, 'A1:Z10000');
  await writeRange(sheetId, 'A1', rows, 'RAW');
}

module.exports = { ensureEmailListSheet, syncEmailListSheet, SHEET_NAME };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- --testPathPattern=emaillistSheet`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add server/settings/store.js server/emaillist/sheet.js server/__tests__/emaillistSheet.test.js
git commit -m "feat: sync email list to RMC Email List Google Sheet"
```

---

### Task 3: Email list router (`server/emaillist/router.js`)

**Files:**
- Create: `server/emaillist/router.js`
- Modify: `server/index.js` (mount `/emaillist` after the `/blankorder` line)
- Test: `server/__tests__/emaillistRouter.test.js`

**Interfaces:**
- Consumes: Task 1 store functions; Task 2 `syncEmailListSheet` (always called fire-and-forget with `.catch`)
- Produces HTTP endpoints:
  - `GET /emaillist` → `{ contacts: Contact[] }`
  - `POST /emaillist` body `{ name, email }` → `201 { contact }`; `400 { error }` on invalid email; `409 { error }` if the email already exists
  - `PUT /emaillist/:email` body `{ name?, status? }` → `{ contact }`; `404` if unknown
  - (The `POST /emaillist/backfill` endpoint is added in Task 4.)
- No `requireAuth` — all reads/writes hit the local JSON; the Sheet sync degrades gracefully when signed out.

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/emaillistRouter.test.js
const request = require('supertest');
const fs = require('fs');
const path = require('path');

jest.mock('../emaillist/sheet', () => ({
  syncEmailListSheet: jest.fn().mockResolvedValue(),
  ensureEmailListSheet: jest.fn().mockResolvedValue('sheet-1'),
}));
jest.mock('../drive/designsCache', () => ({
  syncDesignsCache: jest.fn().mockResolvedValue(),
  listCachedDesigns: jest.fn().mockReturnValue([]),
}));

const config = require('../config');
const TEST_LIST = path.join(__dirname, 'emaillist-router-test.json');
const realList = config.EMAIL_LIST_FILE;

beforeEach(() => {
  config.EMAIL_LIST_FILE = TEST_LIST;
  if (fs.existsSync(TEST_LIST)) fs.unlinkSync(TEST_LIST);
});
afterEach(() => {
  config.EMAIL_LIST_FILE = realList;
  if (fs.existsSync(TEST_LIST)) fs.unlinkSync(TEST_LIST);
});

const app = require('../index');
const { syncEmailListSheet } = require('../emaillist/sheet');

test('GET /emaillist returns empty list initially', async () => {
  const res = await request(app).get('/emaillist');
  expect(res.status).toBe(200);
  expect(res.body.contacts).toEqual([]);
});

test('POST /emaillist adds a contact and fires sheet sync', async () => {
  const res = await request(app).post('/emaillist').send({ name: 'Ann', email: 'ann@x.com' });
  expect(res.status).toBe(201);
  expect(res.body.contact).toMatchObject({ email: 'ann@x.com', status: 'subscribed', source: 'manual' });
  expect(syncEmailListSheet).toHaveBeenCalled();
});

test('POST /emaillist rejects invalid email and duplicates', async () => {
  expect((await request(app).post('/emaillist').send({ name: 'X', email: 'not-an-email' })).status).toBe(400);
  await request(app).post('/emaillist').send({ name: 'Ann', email: 'ann@x.com' });
  expect((await request(app).post('/emaillist').send({ name: 'Ann2', email: 'ANN@x.com' })).status).toBe(409);
});

test('PUT /emaillist/:email updates status; 404 for unknown', async () => {
  await request(app).post('/emaillist').send({ name: 'Ann', email: 'ann@x.com' });
  const res = await request(app).put('/emaillist/ann@x.com').send({ status: 'unsubscribed' });
  expect(res.status).toBe(200);
  expect(res.body.contact.status).toBe('unsubscribed');
  expect((await request(app).put('/emaillist/none@x.com').send({ status: 'unsubscribed' })).status).toBe(404);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --testPathPattern=emaillistRouter`
Expected: FAIL — 404s (router not mounted / module missing)

- [ ] **Step 3: Write the implementation**

```js
// server/emaillist/router.js
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
```

In `server/index.js`, after the `/blankorder` mount line, add:

```js
app.use('/emaillist', require('./emaillist/router'));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- --testPathPattern=emaillistRouter`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add server/emaillist/router.js server/index.js server/__tests__/emaillistRouter.test.js
git commit -m "feat: add /emaillist endpoints for contact list management"
```

---

### Task 4: Capture hook + backfill

**Files:**
- Create: `server/emaillist/capture.js`
- Modify: `server/sheets/router.js` (call the hook inside `PUT /order/:sheetId`, right after `writeOrderCache(...)`)
- Modify: `server/emaillist/router.js` (add `POST /backfill`)
- Test: `server/__tests__/emaillistCapture.test.js`

**Interfaces:**
- Consumes: `upsertContacts` (Task 1), `syncEmailListSheet` (Task 2), `readAllOrderCaches` from `server/orders/cache.js`
- Produces:
  - `collectOrderEmails(order) → [{ name, email }]` — gathers `order.customers[]` (`{name, email}`) plus every line item's `customerEmail` (empty name), deduped case-insensitively within the order
  - `captureOrderEmails(order) → void` — fire-and-forget: upserts with `source: order.orderId || 'manual'`, syncs the Sheet only when something was added, and **never throws**
  - HTTP: `POST /emaillist/backfill` → `{ added: number, total: number }` — sweeps `readAllOrderCaches()` and upserts everything with `source: 'backfill'`

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/emaillistCapture.test.js
const request = require('supertest');
const fs = require('fs');
const path = require('path');

jest.mock('../auth/oauth', () => ({
  loadTokens: jest.fn().mockReturnValue({ refresh_token: 'tok' }),
  getOAuth2Client: jest.fn(),
}));
jest.mock('../drive/client', () => ({
  findFileByName: jest.fn().mockResolvedValue({ id: 'folder-1' }),
  uploadFileContent: jest.fn().mockResolvedValue('file-1'),
  downloadFileContent: jest.fn(),
  createFolder: jest.fn(),
}));
jest.mock('../drive/designsCache', () => ({
  syncDesignsCache: jest.fn().mockResolvedValue(),
  listCachedDesigns: jest.fn().mockReturnValue([]),
}));
jest.mock('../emaillist/sheet', () => ({
  syncEmailListSheet: jest.fn().mockResolvedValue(),
  ensureEmailListSheet: jest.fn().mockResolvedValue('sheet-1'),
}));

const config = require('../config');
const TEST_LIST = path.join(__dirname, 'emaillist-capture-test.json');
const TEST_CACHE_DIR = path.join(__dirname, 'orders-cache-capture-test');
const realList = config.EMAIL_LIST_FILE;
const realCache = config.ORDERS_CACHE_DIR;

beforeEach(() => {
  config.EMAIL_LIST_FILE = TEST_LIST;
  config.ORDERS_CACHE_DIR = TEST_CACHE_DIR;
  if (fs.existsSync(TEST_LIST)) fs.unlinkSync(TEST_LIST);
  fs.rmSync(TEST_CACHE_DIR, { recursive: true, force: true });
});
afterEach(() => {
  config.EMAIL_LIST_FILE = realList;
  config.ORDERS_CACHE_DIR = realCache;
  if (fs.existsSync(TEST_LIST)) fs.unlinkSync(TEST_LIST);
  fs.rmSync(TEST_CACHE_DIR, { recursive: true, force: true });
});

const app = require('../index');
const { readContacts } = require('../emaillist/store');
const { collectOrderEmails } = require('../emaillist/capture');

test('collectOrderEmails gathers customers + line-item emails, deduped', () => {
  const order = {
    customers: [{ name: 'Ann', email: 'ann@x.com' }],
    lineItems: [{ customerEmail: 'ANN@x.com' }, { customerEmail: 'bo@x.com' }, { customerEmail: '' }],
  };
  const result = collectOrderEmails(order);
  expect(result).toEqual([{ name: 'Ann', email: 'ann@x.com' }, { name: '', email: 'bo@x.com' }]);
});

test('PUT /sheets/order captures customer emails into the list', async () => {
  const res = await request(app).put('/sheets/order/sheet-abc').send({
    orderId: 'RMC-001-2026-07-01',
    state: 'building',
    customers: [{ name: 'Ann', email: 'ann@x.com', emailed: {} }],
    lineItems: [{ num: '01', customerEmail: 'bo@x.com', sizes: {} }],
  });
  expect(res.status).toBe(200);
  await new Promise(r => setTimeout(r, 50)); // hook is fire-and-forget
  const contacts = readContacts();
  expect(contacts.map(c => c.email).sort()).toEqual(['ann@x.com', 'bo@x.com']);
  expect(contacts.find(c => c.email === 'ann@x.com').source).toBe('RMC-001-2026-07-01');
});

test('a broken email list never fails the order save', async () => {
  config.EMAIL_LIST_FILE = path.join(__dirname, 'no-such-dir', 'nested', 'list.json'); // write will throw
  const res = await request(app).put('/sheets/order/sheet-abc').send({
    orderId: 'RMC-002-2026-07-02',
    customers: [{ name: 'Ann', email: 'ann@x.com', emailed: {} }],
    lineItems: [],
  });
  expect(res.status).toBe(200);
});

test('POST /emaillist/backfill sweeps all cached orders', async () => {
  fs.mkdirSync(TEST_CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(TEST_CACHE_DIR, 'RMC-001-2026-01-01.json'), JSON.stringify({
    orderId: 'RMC-001-2026-01-01',
    customers: [{ name: 'Ann', email: 'ann@x.com' }],
    lineItems: [{ customerEmail: 'bo@x.com' }],
  }));
  fs.writeFileSync(path.join(TEST_CACHE_DIR, 'RMC-002-2026-02-02.json'), JSON.stringify({
    orderId: 'RMC-002-2026-02-02',
    customers: [{ name: 'Cat', email: 'cat@x.com' }],
    lineItems: [],
  }));
  const res = await request(app).post('/emaillist/backfill');
  expect(res.status).toBe(200);
  expect(res.body.added).toBe(3);
  expect(res.body.total).toBe(3);
  expect(readContacts().every(c => c.source === 'backfill')).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --testPathPattern=emaillistCapture`
Expected: FAIL — `Cannot find module '../emaillist/capture'`

- [ ] **Step 3: Write the implementation**

```js
// server/emaillist/capture.js
const { upsertContacts } = require('./store');
const { syncEmailListSheet } = require('./sheet');

// Gathers { name, email } pairs from an order's customers + line items,
// deduped case-insensitively (customers win because they carry names).
function collectOrderEmails(order) {
  const seen = new Map();
  for (const c of order?.customers || []) {
    const email = (c.email || '').trim();
    if (email) seen.set(email.toLowerCase(), { name: (c.name || '').trim(), email });
  }
  for (const li of order?.lineItems || []) {
    const email = (li.customerEmail || '').trim();
    if (email && !seen.has(email.toLowerCase())) seen.set(email.toLowerCase(), { name: '', email });
  }
  return [...seen.values()];
}

// Fire-and-forget: never throws, never blocks an order save.
function captureOrderEmails(order) {
  try {
    const emails = collectOrderEmails(order);
    if (emails.length === 0) return;
    const source = order?.orderId || 'manual';
    const { added } = upsertContacts(emails.map(e => ({ ...e, source })));
    if (added.length > 0) {
      syncEmailListSheet().catch(err => console.warn('Email list sheet sync skipped:', err.message));
    }
  } catch (err) {
    console.warn('Email capture skipped:', err.message);
  }
}

module.exports = { collectOrderEmails, captureOrderEmails };
```

In `server/sheets/router.js`:
- Add to the imports at the top: `const { captureOrderEmails } = require('../emaillist/capture');`
- In the `PUT /order/:sheetId` handler, immediately after `writeOrderCache(orderData.orderId, orderData);`, add:

```js
    // Fire-and-forget: grow the central email list from this order's customers
    captureOrderEmails(orderData);
```

In `server/emaillist/router.js`, add before `module.exports`:

```js
router.post('/backfill', (_req, res) => {
  const { readAllOrderCaches } = require('../orders/cache');
  const { collectOrderEmails } = require('./capture');
  const incoming = readAllOrderCaches()
    .flatMap(order => collectOrderEmails(order))
    .map(e => ({ ...e, source: 'backfill' }));
  const { contacts, added } = upsertContacts(incoming);
  fireSync();
  res.json({ added: added.length, total: contacts.length });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- --testPathPattern=emaillistCapture`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full backend suite (the sheets router changed)**

Run: `cd server && npm test`
Expected: all suites PASS

- [ ] **Step 6: Commit**

```bash
git add server/emaillist/capture.js server/emaillist/router.js server/sheets/router.js server/__tests__/emaillistCapture.test.js
git commit -m "feat: capture order customer emails into the central list + backfill"
```

---

### Task 5: Email List settings tab (frontend)

**Files:**
- Create: `src/api/emailList.js`
- Create: `src/components/EmailListTab.jsx`
- Modify: `src/components/SettingsScreen.jsx` (import + tab button + tab render)
- Test: `src/__tests__/EmailListTab.test.jsx`

**Interfaces:**
- Consumes: `apiFetch` from `src/api/client.js`; Task 3/4 endpoints
- Produces:
  - `src/api/emailList.js`: `getContacts()`, `addContact({ name, email })`, `updateContact(email, fields)`, `runBackfill()`
  - `<EmailListTab />` — contact table (Name, Email, Status, Added, Source, action), add-contact form, unsubscribe/resubscribe toggle, "Import from existing orders" backfill button
  - SettingsScreen gains an `Email List` tab (key `'emaillist'`)

- [ ] **Step 1: Write the failing test**

```jsx
// src/__tests__/EmailListTab.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmailListTab from '../components/EmailListTab';
import { getContacts, addContact, updateContact, runBackfill } from '../api/emailList';

vi.mock('../api/emailList', () => ({
  getContacts: vi.fn().mockResolvedValue({ contacts: [] }),
  addContact: vi.fn().mockResolvedValue({ contact: { name: 'Ann', email: 'ann@x.com', status: 'subscribed' } }),
  updateContact: vi.fn().mockResolvedValue({ contact: {} }),
  runBackfill: vi.fn().mockResolvedValue({ added: 2, total: 5 }),
}));

test('shows empty state and backfill button', async () => {
  render(<EmailListTab />);
  expect(await screen.findByText(/No contacts yet/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Import from existing orders/i })).toBeInTheDocument();
});

test('renders contacts and toggles unsubscribe', async () => {
  getContacts.mockResolvedValue({ contacts: [
    { name: 'Ann', email: 'ann@x.com', status: 'subscribed', addedAt: '2026-07-01T00:00:00Z', source: 'RMC-001-2026-07-01' },
  ] });
  render(<EmailListTab />);
  expect(await screen.findByText('ann@x.com')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /Unsubscribe/i }));
  await waitFor(() => expect(updateContact).toHaveBeenCalledWith('ann@x.com', { status: 'unsubscribed' }));
});

test('adds a contact via the form', async () => {
  render(<EmailListTab />);
  await screen.findByText(/No contacts yet/i);
  await userEvent.type(screen.getByPlaceholderText(/Name/i), 'Ann');
  await userEvent.type(screen.getByPlaceholderText(/email@example.com/i), 'ann@x.com');
  await userEvent.click(screen.getByRole('button', { name: /^Add$/i }));
  await waitFor(() => expect(addContact).toHaveBeenCalledWith({ name: 'Ann', email: 'ann@x.com' }));
});

test('backfill button reports how many were imported', async () => {
  render(<EmailListTab />);
  await screen.findByText(/No contacts yet/i);
  await userEvent.click(screen.getByRole('button', { name: /Import from existing orders/i }));
  expect(await screen.findByText(/Imported 2 new contact/i)).toBeInTheDocument();
  expect(runBackfill).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- EmailListTab`
Expected: FAIL — cannot resolve `../components/EmailListTab`

- [ ] **Step 3: Write the implementation**

```js
// src/api/emailList.js
import { apiFetch } from './client';

export const getContacts = () => apiFetch('/emaillist');
export const addContact = (data) => apiFetch('/emaillist', { method: 'POST', body: data });
export const updateContact = (email, fields) =>
  apiFetch(`/emaillist/${encodeURIComponent(email)}`, { method: 'PUT', body: fields });
export const runBackfill = () => apiFetch('/emaillist/backfill', { method: 'POST' });
```

```jsx
// src/components/EmailListTab.jsx
import { useState, useEffect } from 'react';
import { getContacts, addContact, updateContact, runBackfill } from '../api/emailList';

export default function EmailListTab() {
  const [contacts, setContacts] = useState([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');

  function load() {
    getContacts().then(d => setContacts(d.contacts)).catch(err => setMsg(err.message));
  }
  useEffect(() => { load(); }, []);

  async function handleAdd(e) {
    e.preventDefault();
    try {
      await addContact({ name: name.trim(), email: email.trim() });
      setName(''); setEmail(''); setMsg('');
      load();
    } catch (err) { setMsg(err.message); }
  }

  async function toggleStatus(c) {
    const status = c.status === 'subscribed' ? 'unsubscribed' : 'subscribed';
    try { await updateContact(c.email, { status }); load(); }
    catch (err) { setMsg(err.message); }
  }

  async function handleBackfill() {
    try {
      const r = await runBackfill();
      setMsg(`Imported ${r.added} new contact(s) — ${r.total} total on the list.`);
      load();
    } catch (err) { setMsg(err.message); }
  }

  return (
    <div className="emaillist-tab">
      <h3>Email List</h3>
      <p className="emaillist-hint">
        Every customer email added to an order lands here automatically. This list feeds the Campaigns tab.
      </p>

      <form className="emaillist-add" onSubmit={handleAdd}>
        <input placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
        <input placeholder="email@example.com" value={email} onChange={e => setEmail(e.target.value)} />
        <button className="btn-primary" type="submit">Add</button>
      </form>

      <button className="btn-secondary" onClick={handleBackfill}>Import from existing orders</button>
      {msg && <p className="emaillist-msg">{msg}</p>}

      {contacts.length === 0 ? (
        <p className="emaillist-empty">No contacts yet — they'll appear as you add customers to orders.</p>
      ) : (
        <table className="emaillist-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Status</th><th>Added</th><th>Source</th><th></th></tr>
          </thead>
          <tbody>
            {contacts.map(c => (
              <tr key={c.email}>
                <td>{c.name}</td>
                <td>{c.email}</td>
                <td>{c.status}</td>
                <td>{(c.addedAt || '').slice(0, 10)}</td>
                <td>{c.source}</td>
                <td>
                  <button className="btn-secondary" onClick={() => toggleStatus(c)}>
                    {c.status === 'subscribed' ? 'Unsubscribe' : 'Resubscribe'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

In `src/components/SettingsScreen.jsx`:
- Add import: `import EmailListTab from './EmailListTab';`
- Add a tab button after the `Status Emails` button:

```jsx
        <button
          className={`settings-tab${tab === 'emaillist' ? ' active' : ''}`}
          onClick={() => setTab('emaillist')}
        >Email List</button>
```

- Add a render line next to the other tab renders: `{tab === 'emaillist' && <EmailListTab />}`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- EmailListTab`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the SettingsScreen suite (screen changed)**

Run: `npm run test -- SettingsScreen`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/api/emailList.js src/components/EmailListTab.jsx src/components/SettingsScreen.jsx src/__tests__/EmailListTab.test.jsx
git commit -m "feat: add Email List settings tab with backfill and unsubscribe toggle"
```

---

### Task 6: Campaign job store (`server/campaigns/jobStore.js`)

**Files:**
- Modify: `server/config.js` (add `CAMPAIGN_JOBS_FILE`)
- Create: `server/campaigns/jobStore.js`
- Test: `server/__tests__/campaignJobStore.test.js`

**Interfaces:**
- Consumes: `config.CAMPAIGN_JOBS_FILE`
- Produces:
  - `readJobs() → Job[]`, `writeJobs(jobs) → void`
  - `createJob({ subject, body, recipients, sendAt, createdBy }) → Job` — fills `id` (`crypto.randomUUID()`), `status: 'scheduled'`, `sentAt: null`, `error: ''`, `results: []`
  - `getJob(id) → Job | null`
  - `updateJob(id, fields) → Job | null` — shallow-merges fields (id is never changed)

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/campaignJobStore.test.js
const fs = require('fs');
const path = require('path');
const config = require('../config');

const TEST_FILE = path.join(__dirname, 'campaign-jobs-test.json');
const realFile = config.CAMPAIGN_JOBS_FILE;

beforeEach(() => { config.CAMPAIGN_JOBS_FILE = TEST_FILE; if (fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE); });
afterEach(() => { config.CAMPAIGN_JOBS_FILE = realFile; if (fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE); });

const { readJobs, createJob, getJob, updateJob } = require('../campaigns/jobStore');

test('readJobs returns [] when file missing', () => {
  expect(readJobs()).toEqual([]);
});

test('createJob persists a scheduled job with defaults', () => {
  const job = createJob({ subject: 'Hi', body: 'Yo [customer name]', recipients: 'list', sendAt: '2026-07-14T09:00:00.000Z', createdBy: 'blast' });
  expect(job.id).toBeTruthy();
  expect(job).toMatchObject({ status: 'scheduled', sentAt: null, error: '', results: [], createdBy: 'blast' });
  expect(readJobs()).toHaveLength(1);
});

test('getJob and updateJob find by id; id is immutable', () => {
  const job = createJob({ subject: 'A', body: 'B', recipients: ['x@x.com'], sendAt: '2026-07-14T09:00:00.000Z', createdBy: 'blast' });
  expect(getJob(job.id).subject).toBe('A');
  const updated = updateJob(job.id, { status: 'cancelled', id: 'HACK' });
  expect(updated.status).toBe('cancelled');
  expect(updated.id).toBe(job.id);
  expect(getJob('nope')).toBeNull();
  expect(updateJob('nope', {})).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --testPathPattern=campaignJobStore`
Expected: FAIL — `Cannot find module '../campaigns/jobStore'`

- [ ] **Step 3: Write the implementation**

Add to `server/config.js` after the `EMAIL_LIST_FILE` line:

```js
  CAMPAIGN_JOBS_FILE: path.join(__dirname, 'campaign-jobs.json'),
```

Add to `.gitignore`, after the `server/email-list.json` line:

```
server/campaign-jobs.json
```

```js
// server/campaigns/jobStore.js
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config');

function readJobs() {
  if (!fs.existsSync(config.CAMPAIGN_JOBS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(config.CAMPAIGN_JOBS_FILE, 'utf8')); }
  catch { return []; }
}

function writeJobs(jobs) {
  fs.writeFileSync(config.CAMPAIGN_JOBS_FILE, JSON.stringify(jobs, null, 2));
}

function createJob({ subject, body, recipients, sendAt, createdBy }) {
  const job = {
    id: crypto.randomUUID(),
    subject, body, recipients, sendAt, createdBy,
    status: 'scheduled',
    sentAt: null,
    error: '',
    results: [],
  };
  const jobs = readJobs();
  jobs.push(job);
  writeJobs(jobs);
  return job;
}

function getJob(id) {
  return readJobs().find(j => j.id === id) || null;
}

function updateJob(id, fields) {
  const jobs = readJobs();
  const idx = jobs.findIndex(j => j.id === id);
  if (idx === -1) return null;
  jobs[idx] = { ...jobs[idx], ...fields, id: jobs[idx].id };
  writeJobs(jobs);
  return jobs[idx];
}

module.exports = { readJobs, writeJobs, createJob, getJob, updateJob };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- --testPathPattern=campaignJobStore`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add .gitignore server/config.js server/campaigns/jobStore.js server/__tests__/campaignJobStore.test.js
git commit -m "feat: add campaign job store (JSON-backed queue)"
```

---

### Task 7: Campaign email builder (`server/campaigns/campaignEmailBuilder.js`)

**Files:**
- Modify: `server/gmail/customerEmailBuilder.js` (export `renderBodyHtml` — add it to the existing `module.exports` object)
- Create: `server/campaigns/campaignEmailBuilder.js`
- Test: `server/__tests__/campaignEmailBuilder.test.js`

**Interfaces:**
- Consumes: `applyPlaceholders`, `stripEmoji`, `renderBodyHtml`, `DEFAULT_GENERIC_NAME`, `HEADER_CID` from `server/gmail/customerEmailBuilder.js`
- Produces:
  - `buildCampaignEmail({ subject, body, contact }) → { subject, html, plain }` — replaces `[customer name]` with `contact.name` (falls back to `DEFAULT_GENERIC_NAME`, "Fellow Cat Lover"); subject is emoji-stripped; HTML uses the same branded wrapper as customer status emails (header image via `cid:rmcheader`, no status pill) plus an **unsubscribe footer**; plain text ends with the unsubscribe line
  - `UNSUB_TEXT` — the footer copy: `Don't want these emails? Reply to this email with "unsubscribe" and we'll take you off the list.`

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/campaignEmailBuilder.test.js
const { buildCampaignEmail, UNSUB_TEXT } = require('../campaigns/campaignEmailBuilder');

test('replaces [customer name] and falls back to generic name', () => {
  const named = buildCampaignEmail({
    subject: 'Hi [customer name]!', body: 'Hello [customer name],\n\nNew drop!',
    contact: { name: 'Ann', email: 'ann@x.com' },
  });
  expect(named.subject).toBe('Hi Ann!');
  expect(named.plain).toContain('Hello Ann,');
  const anon = buildCampaignEmail({
    subject: 'Hi', body: 'Hello [customer name],', contact: { name: '', email: 'x@x.com' },
  });
  expect(anon.plain).toContain('Hello Fellow Cat Lover,');
});

test('strips emoji from the subject only', () => {
  const r = buildCampaignEmail({ subject: 'New drop 🐱', body: 'Meow 🐱', contact: { name: 'A', email: 'a@x.com' } });
  expect(r.subject).toBe('New drop');
  expect(r.plain).toContain('🐱');
});

test('html has the branded wrapper and unsubscribe footer; plain has the unsub line', () => {
  const r = buildCampaignEmail({ subject: 'S', body: 'B', contact: { name: 'A', email: 'a@x.com' } });
  expect(r.html).toContain('cid:rmcheader');
  expect(r.html).toContain('Rocky Meowtain Company LLC');
  expect(r.html).toContain('unsubscribe');
  expect(r.plain).toContain(UNSUB_TEXT);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --testPathPattern=campaignEmailBuilder`
Expected: FAIL — `Cannot find module '../campaigns/campaignEmailBuilder'`

- [ ] **Step 3: Write the implementation**

In `server/gmail/customerEmailBuilder.js`, add `renderBodyHtml,` to the `module.exports` object (it is already defined in the file, just not exported).

```js
// server/campaigns/campaignEmailBuilder.js
const {
  applyPlaceholders, stripEmoji, renderBodyHtml, HEADER_CID,
} = require('../gmail/customerEmailBuilder');

const UNSUB_TEXT = `Don't want these emails? Reply to this email with "unsubscribe" and we'll take you off the list.`;

// contact: { name, email } — template tokens: [customer name]
function buildCampaignEmail({ subject, body, contact }) {
  const ctx = { customerName: contact?.name, orderName: '' };
  const finalSubject = stripEmoji(applyPlaceholders(subject, ctx));
  const bodyText = applyPlaceholders(body, ctx);

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#ffffff;">
  <div style="font-family:'Segoe UI',system-ui,sans-serif;max-width:500px;margin:0 auto;background:#fffdf7;border-radius:14px;overflow:hidden;border:1px solid #e6e0cf">
    <img src="cid:${HEADER_CID}" alt="Rocky Meowtain Co." style="display:block;width:100%;height:auto;border-bottom:3px solid #22402f">
    <div style="padding:20px 22px;color:#2b2b2b">
      ${renderBodyHtml(bodyText)}
      <p style="margin:18px 0 0;font-size:11px;color:#888">${UNSUB_TEXT}</p>
    </div>
    <div style="background:#22402f;color:#cdd8cd;padding:12px 22px;text-align:center;font-size:11px">Rocky Meowtain Company LLC · Made with 🐾 in the Rockies</div>
  </div></body></html>`;

  const plain = `${bodyText}\n\n${UNSUB_TEXT}\n\nRocky Meowtain Company LLC`;

  return { subject: finalSubject, html, plain };
}

module.exports = { buildCampaignEmail, UNSUB_TEXT };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- --testPathPattern=campaignEmailBuilder`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the customer email builder suite (its exports changed)**

Run: `cd server && npm test -- --testPathPattern=customerEmailBuilder`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/gmail/customerEmailBuilder.js server/campaigns/campaignEmailBuilder.js server/__tests__/campaignEmailBuilder.test.js
git commit -m "feat: add campaign email builder with unsubscribe footer"
```

---

### Task 8: Scheduler (`server/campaigns/scheduler.js`)

**Files:**
- Create: `server/campaigns/scheduler.js`
- Modify: `server/index.js` (start the scheduler inside the `require.main === module` block)
- Test: `server/__tests__/campaignScheduler.test.js`

**Interfaces:**
- Consumes: `readJobs`/`updateJob` (Task 6), `buildCampaignEmail` (Task 7), `readContacts` (Task 1), `sendEmail` from `server/gmail/client.js`, `headerImage` from `server/gmail/customerEmailBuilder.js`, `loadTokens` from `server/auth/oauth.js`
- Produces:
  - `processDueJobs(now = new Date(), { delayMs = 1000 } = {}) → Promise<{ skipped? , processed? }>` — skips entirely when not authenticated (`{ skipped: 'not-authenticated' }`) or a pass is already running; marks jobs >48h overdue `failed`/`'stale'`; otherwise resolves recipients and sends one personalized message per recipient with `delayMs` spacing; per-recipient failures are recorded in `job.results` without aborting the batch; job ends `sent` if at least one recipient succeeded (with `error: 'some recipients failed'` on partial failure) or `failed` (`'all recipients failed'`) otherwise
  - `startScheduler(intervalMs = 60000) → intervalHandle` — runs a pass immediately, then on the interval; every pass's rejection is caught and logged
  - `STALE_MS` — `48 * 60 * 60 * 1000`

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/campaignScheduler.test.js
const fs = require('fs');
const path = require('path');

jest.mock('../gmail/client', () => ({ sendEmail: jest.fn().mockResolvedValue('msg-1') }));
jest.mock('../auth/oauth', () => ({
  loadTokens: jest.fn().mockReturnValue({ refresh_token: 'tok' }),
  getOAuth2Client: jest.fn(),
}));
jest.mock('../gmail/customerEmailBuilder', () => {
  const actual = jest.requireActual('../gmail/customerEmailBuilder');
  return { ...actual, headerImage: jest.fn().mockReturnValue({ cid: 'rmcheader', filename: 'h.jpg', content: Buffer.from(''), type: 'image/jpeg' }) };
});

const config = require('../config');
const TEST_JOBS = path.join(__dirname, 'scheduler-jobs-test.json');
const TEST_LIST = path.join(__dirname, 'scheduler-list-test.json');
const realJobs = config.CAMPAIGN_JOBS_FILE;
const realList = config.EMAIL_LIST_FILE;

beforeEach(() => {
  config.CAMPAIGN_JOBS_FILE = TEST_JOBS;
  config.EMAIL_LIST_FILE = TEST_LIST;
  for (const f of [TEST_JOBS, TEST_LIST]) if (fs.existsSync(f)) fs.unlinkSync(f);
  jest.clearAllMocks();
});
afterEach(() => {
  config.CAMPAIGN_JOBS_FILE = realJobs;
  config.EMAIL_LIST_FILE = realList;
  for (const f of [TEST_JOBS, TEST_LIST]) if (fs.existsSync(f)) fs.unlinkSync(f);
});

const { sendEmail } = require('../gmail/client');
const { loadTokens } = require('../auth/oauth');
const { createJob, getJob } = require('../campaigns/jobStore');
const { upsertContacts, updateContact } = require('../emaillist/store');
const { processDueJobs, STALE_MS } = require('../campaigns/scheduler');

const NOW = new Date('2026-07-14T09:00:00.000Z');

function seedList() {
  upsertContacts([
    { name: 'Ann', email: 'ann@x.com', source: 'manual' },
    { name: 'Bo', email: 'bo@x.com', source: 'manual' },
  ]);
}

test('sends due list job to subscribed contacts only', async () => {
  seedList();
  updateContact('bo@x.com', { status: 'unsubscribed' });
  const job = createJob({ subject: 'Hi [customer name]', body: 'B', recipients: 'list', sendAt: '2026-07-14T08:59:00.000Z', createdBy: 'blast' });
  await processDueJobs(NOW, { delayMs: 0 });
  expect(sendEmail).toHaveBeenCalledTimes(1);
  expect(sendEmail.mock.calls[0][0]).toBe('ann@x.com');
  expect(sendEmail.mock.calls[0][1]).toBe('Hi Ann');
  const done = getJob(job.id);
  expect(done.status).toBe('sent');
  expect(done.sentAt).toBeTruthy();
  expect(done.results).toEqual([{ email: 'ann@x.com', status: 'sent' }]);
});

test('future jobs are untouched', async () => {
  const job = createJob({ subject: 'S', body: 'B', recipients: 'list', sendAt: '2026-07-14T09:01:00.000Z', createdBy: 'blast' });
  await processDueJobs(NOW, { delayMs: 0 });
  expect(sendEmail).not.toHaveBeenCalled();
  expect(getJob(job.id).status).toBe('scheduled');
});

test('jobs more than 48h overdue are marked stale, not sent', async () => {
  const past = new Date(NOW.getTime() - STALE_MS - 60000).toISOString();
  const job = createJob({ subject: 'S', body: 'B', recipients: 'list', sendAt: past, createdBy: 'blast' });
  await processDueJobs(NOW, { delayMs: 0 });
  expect(sendEmail).not.toHaveBeenCalled();
  const stale = getJob(job.id);
  expect(stale.status).toBe('failed');
  expect(stale.error).toBe('stale');
});

test('skips the whole pass when not authenticated', async () => {
  loadTokens.mockReturnValueOnce(null);
  const job = createJob({ subject: 'S', body: 'B', recipients: 'list', sendAt: '2026-07-14T08:00:00.000Z', createdBy: 'blast' });
  const result = await processDueJobs(NOW, { delayMs: 0 });
  expect(result).toEqual({ skipped: 'not-authenticated' });
  expect(getJob(job.id).status).toBe('scheduled');
});

test('one bad recipient does not abort the batch (partial failure)', async () => {
  seedList();
  sendEmail.mockRejectedValueOnce(new Error('bounce')).mockResolvedValueOnce('msg-2');
  const job = createJob({ subject: 'S', body: 'B', recipients: ['ann@x.com', 'bo@x.com'], sendAt: '2026-07-14T08:59:00.000Z', createdBy: 'blast' });
  await processDueJobs(NOW, { delayMs: 0 });
  const done = getJob(job.id);
  expect(done.status).toBe('sent');
  expect(done.error).toBe('some recipients failed');
  expect(done.results).toEqual([
    { email: 'ann@x.com', status: 'failed', error: 'bounce' },
    { email: 'bo@x.com', status: 'sent' },
  ]);
});

test('explicit recipients who unsubscribed are skipped at send time', async () => {
  seedList();
  updateContact('ann@x.com', { status: 'unsubscribed' });
  const job = createJob({ subject: 'S', body: 'B', recipients: ['ann@x.com', 'bo@x.com'], sendAt: '2026-07-14T08:59:00.000Z', createdBy: 'blast' });
  await processDueJobs(NOW, { delayMs: 0 });
  expect(sendEmail).toHaveBeenCalledTimes(1);
  expect(sendEmail.mock.calls[0][0]).toBe('bo@x.com');
  expect(getJob(job.id).results[0]).toEqual({ email: 'ann@x.com', status: 'skipped-unsubscribed' });
});

test('all recipients failing marks the job failed', async () => {
  seedList();
  sendEmail.mockRejectedValue(new Error('quota'));
  const job = createJob({ subject: 'S', body: 'B', recipients: ['ann@x.com'], sendAt: '2026-07-14T08:59:00.000Z', createdBy: 'blast' });
  await processDueJobs(NOW, { delayMs: 0 });
  const done = getJob(job.id);
  expect(done.status).toBe('failed');
  expect(done.error).toBe('all recipients failed');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --testPathPattern=campaignScheduler`
Expected: FAIL — `Cannot find module '../campaigns/scheduler'`

- [ ] **Step 3: Write the implementation**

```js
// server/campaigns/scheduler.js
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
```

In `server/index.js`, change the `require.main === module` block to:

```js
if (require.main === module) {
  app.listen(config.PORT, () => console.log(`Server running on port ${config.PORT}`));
  require('./campaigns/scheduler').startScheduler();
}
```

(Inside the `if` so importing the app in tests never starts the interval.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- --testPathPattern=campaignScheduler`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add server/campaigns/scheduler.js server/index.js server/__tests__/campaignScheduler.test.js
git commit -m "feat: add campaign scheduler with stale cutoff and per-recipient isolation"
```

---

### Task 9: Campaigns router (`server/campaigns/router.js`)

**Files:**
- Create: `server/campaigns/router.js`
- Modify: `server/index.js` (mount `/campaigns` after the `/emaillist` line)
- Test: `server/__tests__/campaignsRouter.test.js`

**Interfaces:**
- Consumes: Task 6 job store
- Produces HTTP endpoints:
  - `POST /campaigns/jobs` body `{ subject, body, recipients, sendAt? }` → `201 { job }` with `createdBy: 'blast'`; `sendAt` defaults to now; `400` when subject/body empty, recipients invalid (must be `'list'` or a non-empty array), or `sendAt` unparseable
  - `GET /campaigns/jobs` → `{ jobs }` sorted by `sendAt` descending
  - `POST /campaigns/jobs/:id/cancel` → `{ job }`; only `scheduled` jobs can be cancelled (`400` otherwise, `404` unknown)
  - `POST /campaigns/jobs/:id/reschedule` body `{ sendAt }` → `{ job }` with `status: 'scheduled'`, `error: ''`, `results: []`; works from any status; `400` on bad `sendAt`, `404` unknown

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/campaignsRouter.test.js
const request = require('supertest');
const fs = require('fs');
const path = require('path');

jest.mock('../drive/designsCache', () => ({
  syncDesignsCache: jest.fn().mockResolvedValue(),
  listCachedDesigns: jest.fn().mockReturnValue([]),
}));

const config = require('../config');
const TEST_JOBS = path.join(__dirname, 'campaigns-router-jobs-test.json');
const realJobs = config.CAMPAIGN_JOBS_FILE;

beforeEach(() => { config.CAMPAIGN_JOBS_FILE = TEST_JOBS; if (fs.existsSync(TEST_JOBS)) fs.unlinkSync(TEST_JOBS); });
afterEach(() => { config.CAMPAIGN_JOBS_FILE = realJobs; if (fs.existsSync(TEST_JOBS)) fs.unlinkSync(TEST_JOBS); });

const app = require('../index');

const VALID = { subject: 'New drop', body: 'Hello [customer name]!', recipients: 'list', sendAt: '2026-07-20T09:00:00.000Z' };

test('POST /campaigns/jobs creates a scheduled blast', async () => {
  const res = await request(app).post('/campaigns/jobs').send(VALID);
  expect(res.status).toBe(201);
  expect(res.body.job).toMatchObject({ status: 'scheduled', createdBy: 'blast', recipients: 'list' });
});

test('POST /campaigns/jobs validates input', async () => {
  expect((await request(app).post('/campaigns/jobs').send({ ...VALID, subject: '' })).status).toBe(400);
  expect((await request(app).post('/campaigns/jobs').send({ ...VALID, body: '' })).status).toBe(400);
  expect((await request(app).post('/campaigns/jobs').send({ ...VALID, recipients: [] })).status).toBe(400);
  expect((await request(app).post('/campaigns/jobs').send({ ...VALID, recipients: 'everyone' })).status).toBe(400);
  expect((await request(app).post('/campaigns/jobs').send({ ...VALID, sendAt: 'tomorrow-ish' })).status).toBe(400);
});

test('sendAt defaults to now', async () => {
  const before = Date.now();
  const res = await request(app).post('/campaigns/jobs').send({ subject: 'S', body: 'B', recipients: ['a@x.com'] });
  const t = new Date(res.body.job.sendAt).getTime();
  expect(t).toBeGreaterThanOrEqual(before);
  expect(t).toBeLessThanOrEqual(Date.now());
});

test('GET /campaigns/jobs returns jobs sorted by sendAt desc', async () => {
  await request(app).post('/campaigns/jobs').send({ ...VALID, sendAt: '2026-07-20T09:00:00.000Z' });
  await request(app).post('/campaigns/jobs').send({ ...VALID, sendAt: '2026-07-25T09:00:00.000Z' });
  const res = await request(app).get('/campaigns/jobs');
  expect(res.body.jobs).toHaveLength(2);
  expect(res.body.jobs[0].sendAt).toBe('2026-07-25T09:00:00.000Z');
});

test('cancel works only on scheduled jobs; reschedule revives any job', async () => {
  const { body } = await request(app).post('/campaigns/jobs').send(VALID);
  const id = body.job.id;
  const cancelled = await request(app).post(`/campaigns/jobs/${id}/cancel`);
  expect(cancelled.body.job.status).toBe('cancelled');
  expect((await request(app).post(`/campaigns/jobs/${id}/cancel`)).status).toBe(400); // already cancelled
  const res = await request(app).post(`/campaigns/jobs/${id}/reschedule`).send({ sendAt: '2026-08-01T09:00:00.000Z' });
  expect(res.body.job).toMatchObject({ status: 'scheduled', sendAt: '2026-08-01T09:00:00.000Z', error: '', results: [] });
  expect((await request(app).post('/campaigns/jobs/nope/cancel')).status).toBe(404);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --testPathPattern=campaignsRouter`
Expected: FAIL — 404s (router missing)

- [ ] **Step 3: Write the implementation**

```js
// server/campaigns/router.js
const express = require('express');
const { readJobs, createJob, getJob, updateJob } = require('./jobStore');

const router = express.Router();

router.post('/jobs', (req, res) => {
  const { subject = '', body = '', recipients, sendAt } = req.body || {};
  if (!subject.trim()) return res.status(400).json({ error: 'Subject is required' });
  if (!body.trim()) return res.status(400).json({ error: 'Body is required' });
  const validRecipients = recipients === 'list' || (Array.isArray(recipients) && recipients.length > 0);
  if (!validRecipients) return res.status(400).json({ error: "Recipients must be 'list' or a non-empty array of emails" });
  const when = sendAt === undefined ? new Date() : new Date(sendAt);
  if (isNaN(when.getTime())) return res.status(400).json({ error: 'Invalid sendAt date' });
  const job = createJob({ subject, body, recipients, sendAt: when.toISOString(), createdBy: 'blast' });
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
```

In `server/index.js`, after the `/emaillist` mount line, add:

```js
app.use('/campaigns', require('./campaigns/router'));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- --testPathPattern=campaignsRouter`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full backend suite**

Run: `cd server && npm test`
Expected: all suites PASS

- [ ] **Step 6: Commit**

```bash
git add server/campaigns/router.js server/index.js server/__tests__/campaignsRouter.test.js
git commit -m "feat: add /campaigns endpoints for scheduling email blasts"
```

---

### Task 10: Campaigns settings tab (frontend)

**Files:**
- Create: `src/api/campaigns.js`
- Create: `src/components/CampaignsTab.jsx`
- Modify: `src/components/SettingsScreen.jsx` (import + tab button + tab render)
- Test: `src/__tests__/CampaignsTab.test.jsx`

**Interfaces:**
- Consumes: `apiFetch`; Task 9 endpoints; `getContacts` from `src/api/emailList.js` (Task 5) for the recipient picker
- Produces:
  - `src/api/campaigns.js`: `getJobs()`, `createJob({ subject, body, recipients, sendAt })`, `cancelJob(id)`, `rescheduleJob(id, sendAt)`
  - `<CampaignsTab />` — compose form (subject, body, recipient mode "Whole list" / "Selected contacts" with checkboxes, optional `datetime-local` schedule, "Send now" when blank) + job history table with per-status actions (Cancel for scheduled; Reschedule-to-now for failed/cancelled)
  - SettingsScreen gains a `Campaigns` tab (key `'campaigns'`)

- [ ] **Step 1: Write the failing test**

```jsx
// src/__tests__/CampaignsTab.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CampaignsTab from '../components/CampaignsTab';
import { getJobs, createJob, cancelJob } from '../api/campaigns';

vi.mock('../api/campaigns', () => ({
  getJobs: vi.fn().mockResolvedValue({ jobs: [] }),
  createJob: vi.fn().mockResolvedValue({ job: { id: 'j1', status: 'scheduled' } }),
  cancelJob: vi.fn().mockResolvedValue({ job: { id: 'j1', status: 'cancelled' } }),
  rescheduleJob: vi.fn().mockResolvedValue({ job: { id: 'j1', status: 'scheduled' } }),
}));
vi.mock('../api/emailList', () => ({
  getContacts: vi.fn().mockResolvedValue({ contacts: [
    { name: 'Ann', email: 'ann@x.com', status: 'subscribed' },
    { name: 'Bo', email: 'bo@x.com', status: 'subscribed' },
  ] }),
}));

test('composing a whole-list blast with no schedule sends now', async () => {
  render(<CampaignsTab />);
  await screen.findByText(/No campaigns yet/i);
  await userEvent.type(screen.getByPlaceholderText(/Subject/i), 'New drop');
  await userEvent.type(screen.getByPlaceholderText(/Hello \[customer name\]/i), 'Big news!');
  await userEvent.click(screen.getByRole('button', { name: /Schedule blast/i }));
  await waitFor(() => expect(createJob).toHaveBeenCalledWith({
    subject: 'New drop', body: 'Big news!', recipients: 'list', sendAt: undefined,
  }));
});

test('selected-contacts mode sends the checked emails', async () => {
  render(<CampaignsTab />);
  await screen.findByText(/No campaigns yet/i);
  await userEvent.click(screen.getByLabelText(/Selected contacts/i));
  await userEvent.click(await screen.findByLabelText(/ann@x.com/i));
  await userEvent.type(screen.getByPlaceholderText(/Subject/i), 'S');
  await userEvent.type(screen.getByPlaceholderText(/Hello \[customer name\]/i), 'B');
  await userEvent.click(screen.getByRole('button', { name: /Schedule blast/i }));
  await waitFor(() => expect(createJob).toHaveBeenCalledWith(
    expect.objectContaining({ recipients: ['ann@x.com'] })));
});

test('history shows jobs and cancels a scheduled one', async () => {
  getJobs.mockResolvedValue({ jobs: [
    { id: 'j1', subject: 'Drop', recipients: 'list', sendAt: '2026-07-20T09:00:00.000Z', status: 'scheduled', error: '', results: [] },
    { id: 'j2', subject: 'Old', recipients: 'list', sendAt: '2026-07-01T09:00:00.000Z', status: 'sent', error: '', results: [] },
  ] });
  render(<CampaignsTab />);
  expect(await screen.findByText('Drop')).toBeInTheDocument();
  expect(screen.getByText('Old')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /Cancel/i }));
  await waitFor(() => expect(cancelJob).toHaveBeenCalledWith('j1'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- CampaignsTab`
Expected: FAIL — cannot resolve `../components/CampaignsTab`

- [ ] **Step 3: Write the implementation**

```js
// src/api/campaigns.js
import { apiFetch } from './client';

export const getJobs = () => apiFetch('/campaigns/jobs');
export const createJob = (data) => apiFetch('/campaigns/jobs', { method: 'POST', body: data });
export const cancelJob = (id) => apiFetch(`/campaigns/jobs/${id}/cancel`, { method: 'POST' });
export const rescheduleJob = (id, sendAt) =>
  apiFetch(`/campaigns/jobs/${id}/reschedule`, { method: 'POST', body: { sendAt } });
```

```jsx
// src/components/CampaignsTab.jsx
import { useState, useEffect } from 'react';
import { getJobs, createJob, cancelJob, rescheduleJob } from '../api/campaigns';
import { getContacts } from '../api/emailList';

export default function CampaignsTab() {
  const [jobs, setJobs] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [mode, setMode] = useState('list');           // 'list' | 'selected'
  const [selected, setSelected] = useState(new Set()); // emails
  const [when, setWhen] = useState('');               // datetime-local value; '' = now
  const [msg, setMsg] = useState('');

  function load() {
    getJobs().then(d => setJobs(d.jobs)).catch(err => setMsg(err.message));
    getContacts().then(d => setContacts(d.contacts)).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  function toggleSelected(email) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email); else next.add(email);
      return next;
    });
  }

  async function handleSchedule(e) {
    e.preventDefault();
    const recipients = mode === 'list' ? 'list' : [...selected];
    if (mode === 'selected' && recipients.length === 0) { setMsg('Pick at least one contact.'); return; }
    try {
      await createJob({
        subject: subject.trim(),
        body,
        recipients,
        sendAt: when ? new Date(when).toISOString() : undefined,
      });
      setSubject(''); setBody(''); setWhen(''); setSelected(new Set());
      setMsg(when ? 'Blast scheduled.' : 'Blast queued to send now.');
      load();
    } catch (err) { setMsg(err.message); }
  }

  async function handleCancel(id) {
    try { await cancelJob(id); load(); } catch (err) { setMsg(err.message); }
  }

  async function handleRetryNow(id) {
    try { await rescheduleJob(id, new Date().toISOString()); load(); } catch (err) { setMsg(err.message); }
  }

  const subscribed = contacts.filter(c => c.status === 'subscribed');

  return (
    <div className="campaigns-tab">
      <h3>Campaigns</h3>
      <p className="campaigns-hint">
        Compose an email blast for your list. Use [customer name] to personalize.
        Scheduled emails send while the app is running (missed sends go out on next launch, up to 48h late).
      </p>

      <form className="campaigns-compose" onSubmit={handleSchedule}>
        <input placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} />
        <textarea
          placeholder="Hello [customer name],&#10;&#10;Write your email here…"
          rows={6}
          value={body}
          onChange={e => setBody(e.target.value)}
        />
        <div className="campaigns-recipients">
          <label>
            <input type="radio" checked={mode === 'list'} onChange={() => setMode('list')} />
            Whole list ({subscribed.length} subscribed)
          </label>
          <label>
            <input type="radio" checked={mode === 'selected'} onChange={() => setMode('selected')} />
            Selected contacts
          </label>
          {mode === 'selected' && (
            <div className="campaigns-contact-picker">
              {subscribed.map(c => (
                <label key={c.email}>
                  <input type="checkbox" checked={selected.has(c.email)} onChange={() => toggleSelected(c.email)} />
                  {c.name ? `${c.name} — ` : ''}{c.email}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="campaigns-when">
          <label>Send at (leave blank to send now)</label>
          <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} />
        </div>
        <button className="btn-primary" type="submit">Schedule blast</button>
      </form>

      {msg && <p className="campaigns-msg">{msg}</p>}

      <h4>History</h4>
      {jobs.length === 0 ? (
        <p className="campaigns-empty">No campaigns yet.</p>
      ) : (
        <table className="campaigns-table">
          <thead>
            <tr><th>Subject</th><th>Recipients</th><th>Send at</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {jobs.map(j => (
              <tr key={j.id}>
                <td>{j.subject}</td>
                <td>{j.recipients === 'list' ? 'Whole list' : `${j.recipients.length} contact(s)`}</td>
                <td>{new Date(j.sendAt).toLocaleString()}</td>
                <td>
                  {j.status}{j.error ? ` — ${j.error}` : ''}
                  {j.results?.length > 0 && ` (${j.results.filter(r => r.status === 'sent').length}/${j.results.length} sent)`}
                </td>
                <td>
                  {j.status === 'scheduled' && (
                    <button className="btn-secondary" onClick={() => handleCancel(j.id)}>Cancel</button>
                  )}
                  {(j.status === 'failed' || j.status === 'cancelled') && (
                    <button className="btn-secondary" onClick={() => handleRetryNow(j.id)}>Send now</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

In `src/components/SettingsScreen.jsx`:
- Add import: `import CampaignsTab from './CampaignsTab';`
- Add a tab button after the `Email List` button:

```jsx
        <button
          className={`settings-tab${tab === 'campaigns' ? ' active' : ''}`}
          onClick={() => setTab('campaigns')}
        >Campaigns</button>
```

- Add a render line: `{tab === 'campaigns' && <CampaignsTab />}`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- CampaignsTab`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full frontend suite and lint**

Run: `npm test` then `npm run lint`
Expected: all PASS, no new lint errors

- [ ] **Step 6: Commit**

```bash
git add src/api/campaigns.js src/components/CampaignsTab.jsx src/components/SettingsScreen.jsx src/__tests__/CampaignsTab.test.jsx
git commit -m "feat: add Campaigns settings tab for composing and scheduling blasts"
```

---

## Final verification (after all tasks)

- [ ] Run both full suites: `cd server && npm test` and `npm test` (root) — all green
- [ ] Run `npm run lint` — clean
- [ ] Manual smoke test with `start.bat`: add a customer to an order → contact appears in Settings → Email List; click backfill; compose a blast to yourself with no schedule → arrives in your inbox within ~1 minute with header image, personalized greeting, and unsubscribe footer
- [ ] Confirm `git status` shows no untracked `server/email-list.json` or `server/campaign-jobs.json` (both were added to `.gitignore` in Tasks 1 and 6)
