# Email Screen & List/Campaign Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Email List + Campaigns out of Settings into a dedicated `/email` screen, and rebuild both tabs with proper styling, delete/bulk actions, sorting, and a Google Sheet sync button.

**Architecture:** Two small server additions (bulk store helpers, three new emaillist routes), one new screen component reusing the settings-screen shell, a reworked `EmailListTab` with client-side sorting/selection state, a layout-only rework of `CampaignsTab`, and a new shared `data-table` CSS block in `App.css`. Spec: `docs/superpowers/specs/2026-07-14-email-screen-redesign-design.md`.

**Tech Stack:** React 19 + react-router 7 (frontend, vitest + testing-library), Express 4 (server, jest + supertest), plain CSS in `src/App.css` using existing custom properties.

## Global Constraints

- Work on branch `maxr/email-campaigns` (already checked out).
- Frontend tests: run from repo root `C:\PERSONAL_INTEREST\Programming\RMCOrder` with `npx vitest run <file>`. Server tests: run from `server/` with `npx jest <pattern>`.
- Vitest has NO mock clearing between tests (no `clearMocks`/`restoreMocks`). Any test that needs specific mock data must set it explicitly inside the test (or in a `beforeEach`); never rely on a previous test's stubs.
- CSS must reuse existing custom properties: `--text`, `--text-h`, `--bg`, `--border`, `--accent` (#e87e22), `--accent-bg`, `--accent-border`. Buttons use existing `btn-primary` / `btn-secondary` / `btn-danger` classes.
- Existing copy/behavior not named in the spec must not change (e.g. campaign scheduling logic, backfill behavior, placeholders the current tests query by).
- Unsubscribe is a local status field only; "delete" is a hard delete from the JSON file. Confirmation dialogs use the existing `ConfirmDialog` component.

---

### Task 1: Store bulk helpers (`deleteContacts`, `updateContactsStatus`)

**Files:**
- Modify: `server/emaillist/store.js`
- Test: `server/__tests__/emaillistStore.test.js`

**Interfaces:**
- Consumes: existing `readContacts()` / `writeContacts(contacts)` in the same file.
- Produces: `deleteContacts(emails: string[]) => number` (count removed, case-insensitive email match) and `updateContactsStatus(emails: string[], status: 'subscribed'|'unsubscribed') => number` (count matched-and-set; returns 0 for any other status). Both exported from `server/emaillist/store.js`. Task 2 calls these.

- [ ] **Step 1: Write the failing tests**

In `server/__tests__/emaillistStore.test.js`, change line 17 to also destructure the new functions:

```js
const { readContacts, upsertContacts, updateContact, deleteContacts, updateContactsStatus } = require('../emaillist/store');
```

Append at the end of the file:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `server/`): `npx jest emaillistStore`
Expected: the two new tests FAIL with `deleteContacts is not a function` (existing tests still pass).

- [ ] **Step 3: Implement the helpers**

In `server/emaillist/store.js`, insert before the `module.exports` line:

```js
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
```

And update the exports line to:

```js
module.exports = { readContacts, writeContacts, upsertContacts, updateContact, deleteContacts, updateContactsStatus };
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `server/`): `npx jest emaillistStore`
Expected: ALL tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/emaillist/store.js server/__tests__/emaillistStore.test.js
git commit -m "feat: add bulk delete and bulk status helpers to email list store"
```

---

### Task 2: Router endpoints (DELETE, /bulk, /sync)

**Files:**
- Modify: `server/emaillist/router.js`
- Test: `server/__tests__/emaillistRouter.test.js`

**Interfaces:**
- Consumes: `deleteContacts(emails)`, `updateContactsStatus(emails, status)` from Task 1; existing `syncEmailListSheet()` and `fireSync()`.
- Produces HTTP endpoints (mounted at `/emaillist` in `server/index.js`, already wired):
  - `DELETE /emaillist/:email` → 200 `{ removed: 1 }` | 404 `{ error }`
  - `POST /emaillist/bulk` body `{ emails: string[], action: 'subscribe'|'unsubscribe'|'delete' }` → 200 `{ affected: number }` | 400 `{ error }`
  - `POST /emaillist/sync` → 200 `{ ok: true }` | 502 `{ error }`
  - Task 4's API client calls these.

- [ ] **Step 1: Write the failing tests**

Append to `server/__tests__/emaillistRouter.test.js` (the file already mocks `../emaillist/sheet` and sets up a temp `EMAIL_LIST_FILE`):

```js
test('DELETE /emaillist/:email removes the contact; 404 for unknown', async () => {
  await request(app).post('/emaillist').send({ name: 'Ann', email: 'ann@x.com' });
  syncEmailListSheet.mockClear();
  const res = await request(app).delete('/emaillist/ann@x.com');
  expect(res.status).toBe(200);
  expect(res.body.removed).toBe(1);
  expect(syncEmailListSheet).toHaveBeenCalled();
  expect((await request(app).get('/emaillist')).body.contacts).toEqual([]);
  expect((await request(app).delete('/emaillist/ann@x.com')).status).toBe(404);
});

test('POST /emaillist/bulk handles subscribe, unsubscribe, delete and validates input', async () => {
  await request(app).post('/emaillist').send({ name: 'Ann', email: 'ann@x.com' });
  await request(app).post('/emaillist').send({ name: 'Bo', email: 'bo@x.com' });

  let res = await request(app).post('/emaillist/bulk').send({ emails: ['ann@x.com', 'bo@x.com'], action: 'unsubscribe' });
  expect(res.status).toBe(200);
  expect(res.body.affected).toBe(2);

  res = await request(app).post('/emaillist/bulk').send({ emails: ['ann@x.com'], action: 'subscribe' });
  expect(res.body.affected).toBe(1);

  res = await request(app).post('/emaillist/bulk').send({ emails: ['ann@x.com'], action: 'delete' });
  expect(res.body.affected).toBe(1);
  expect((await request(app).get('/emaillist')).body.contacts).toHaveLength(1);

  expect((await request(app).post('/emaillist/bulk').send({ emails: [], action: 'delete' })).status).toBe(400);
  expect((await request(app).post('/emaillist/bulk').send({ action: 'delete' })).status).toBe(400);
  expect((await request(app).post('/emaillist/bulk').send({ emails: ['x@x.com'], action: 'zap' })).status).toBe(400);
});

test('POST /emaillist/sync reports success and failure honestly', async () => {
  expect((await request(app).post('/emaillist/sync')).status).toBe(200);
  syncEmailListSheet.mockRejectedValueOnce(new Error('Drive down'));
  const res = await request(app).post('/emaillist/sync');
  expect(res.status).toBe(502);
  expect(res.body.error).toMatch(/Drive down/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `server/`): `npx jest emaillistRouter`
Expected: the three new tests FAIL with 404 statuses (routes don't exist yet).

- [ ] **Step 3: Implement the routes**

In `server/emaillist/router.js`, change the store require (line 3) to:

```js
const { readContacts, upsertContacts, updateContact, deleteContacts, updateContactsStatus } = require('./store');
```

Insert after the `router.put('/:email', ...)` block and before `router.post('/backfill', ...)`:

```js
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

// Unlike fireSync(), this endpoint awaits the sheet sync so the UI can report failures.
router.post('/sync', async (_req, res) => {
  try {
    await syncEmailListSheet();
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});
```

Note: `POST /bulk` and `POST /sync` are distinct literal paths, so they don't collide with `POST /` or `PUT /:email`. `DELETE /:email` is the only DELETE route.

- [ ] **Step 4: Run tests to verify they pass**

Run (from `server/`): `npx jest emaillistRouter`
Expected: ALL tests PASS.

- [ ] **Step 5: Run the full server suite**

Run (from `server/`): `npm test`
Expected: ALL suites PASS (confirms no regression in scheduler/capture/sheet tests).

- [ ] **Step 6: Commit**

```bash
git add server/emaillist/router.js server/__tests__/emaillistRouter.test.js
git commit -m "feat: add delete, bulk, and sync endpoints to email list router"
```

---

### Task 3: EmailScreen, route, nav button, Settings cleanup

**Files:**
- Create: `src/components/EmailScreen.jsx`
- Create: `src/__tests__/EmailScreen.test.jsx`
- Modify: `src/App.jsx` (add `/email` route)
- Modify: `src/components/OrdersList.jsx:57` (add ✉ Email button)
- Modify: `src/components/SettingsScreen.jsx` (remove Email List + Campaigns tabs)
- Modify: `src/__tests__/SettingsScreen.test.jsx` (drop email mocks, assert tabs gone)

**Interfaces:**
- Consumes: existing `EmailListTab` and `CampaignsTab` components (reworked later in Tasks 4–5; their default exports and props — none — do not change).
- Produces: route `/email` rendering `EmailScreen` (default export, no props). Tab ids: `'list'` (default) and `'campaigns'`. Tab button labels: exactly `Email List` and `Email Campaign`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/EmailScreen.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import EmailScreen from '../components/EmailScreen';

vi.mock('../api/emailList', () => ({
  getContacts: vi.fn().mockResolvedValue({ contacts: [] }),
  addContact: vi.fn(),
  updateContact: vi.fn(),
  deleteContact: vi.fn(),
  bulkAction: vi.fn(),
  runBackfill: vi.fn(),
  syncSheet: vi.fn(),
}));
vi.mock('../api/campaigns', () => ({
  getJobs: vi.fn().mockResolvedValue({ jobs: [] }),
  createJob: vi.fn(),
  cancelJob: vi.fn(),
  rescheduleJob: vi.fn(),
}));

test('shows Email List tab by default and switches to Email Campaign', async () => {
  render(<MemoryRouter><EmailScreen /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: 'Email' })).toBeInTheDocument();
  expect(await screen.findByText(/No contacts yet/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Email Campaign' }));
  expect(await screen.findByText(/No campaigns yet/i)).toBeInTheDocument();
});
```

(The mock includes `deleteContact`/`bulkAction`/`syncSheet` now so this file needs no edits after Task 4 adds those imports to `EmailListTab`.)

- [ ] **Step 2: Run test to verify it fails**

Run (from repo root): `npx vitest run src/__tests__/EmailScreen.test.jsx`
Expected: FAIL — cannot resolve `../components/EmailScreen`.

- [ ] **Step 3: Create the screen and wire navigation**

Create `src/components/EmailScreen.jsx`:

```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EmailListTab from './EmailListTab';
import CampaignsTab from './CampaignsTab';

export default function EmailScreen() {
  const [tab, setTab] = useState('list');
  const navigate = useNavigate();

  return (
    <div className="settings-screen">
      <button onClick={() => navigate('/orders')}>← Back</button>
      <h2>Email</h2>

      <div className="settings-tabs">
        <button
          className={`settings-tab${tab === 'list' ? ' active' : ''}`}
          onClick={() => setTab('list')}
        >Email List</button>
        <button
          className={`settings-tab${tab === 'campaigns' ? ' active' : ''}`}
          onClick={() => setTab('campaigns')}
        >Email Campaign</button>
      </div>

      {tab === 'list' && <EmailListTab />}
      {tab === 'campaigns' && <CampaignsTab />}
    </div>
  );
}
```

In `src/App.jsx`: add `import EmailScreen from './components/EmailScreen';` after the SettingsScreen import, and add this route after the `/settings` route:

```jsx
<Route path="/email" element={<EmailScreen />} />
```

In `src/components/OrdersList.jsx`, in the `header-actions` div (line 56–61), add the Email button before the Settings button:

```jsx
<button onClick={() => navigate('/email')}>✉ Email</button>
<button onClick={() => navigate('/settings')}>⚙ Settings</button>
```

- [ ] **Step 4: Remove the tabs from Settings**

In `src/components/SettingsScreen.jsx`:
- Delete the imports of `EmailListTab` and `CampaignsTab` (lines 10–11).
- Delete the two tab buttons for `emaillist` and `campaigns` (lines 81–88).
- Delete the two renders: `{tab === 'emaillist' && <EmailListTab />}` and `{tab === 'campaigns' && <CampaignsTab />}` (lines 155–156).

In `src/__tests__/SettingsScreen.test.jsx`:
- Delete the `vi.mock('../api/emailList', ...)` block (lines 28–33) and the `vi.mock('../api/campaigns', ...)` block (lines 34–39) — SettingsScreen no longer imports those modules.
- Extend the first test to pin the removal:

```jsx
test('Settings screen shows System and Items tabs', async () => {
  render(<MemoryRouter><SettingsScreen /></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'System' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Items' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Email List' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Campaigns' })).not.toBeInTheDocument();
});
```

- [ ] **Step 5: Run the frontend suite**

Run (from repo root): `npx vitest run`
Expected: ALL tests PASS (EmailScreen test now green; Settings tests green; no other screen references the removed tabs).

- [ ] **Step 6: Commit**

```bash
git add src/components/EmailScreen.jsx src/__tests__/EmailScreen.test.jsx src/App.jsx src/components/OrdersList.jsx src/components/SettingsScreen.jsx src/__tests__/SettingsScreen.test.jsx
git commit -m "feat: dedicated /email screen; move email tabs out of Settings"
```

---

### Task 4: Email List tab redesign (API client, component, table CSS)

**Files:**
- Modify: `src/api/emailList.js`
- Modify: `src/components/EmailListTab.jsx` (full rewrite below)
- Modify: `src/App.css` (append new section at end of file)
- Test: `src/__tests__/EmailListTab.test.jsx`

**Interfaces:**
- Consumes: Task 2's endpoints via `apiFetch`; existing `ConfirmDialog` (`{ message, onConfirm, onCancel }`, renders nothing when `message` falsy).
- Produces: `deleteContact(email)`, `bulkAction(emails, action)`, `syncSheet()` exported from `src/api/emailList.js`; shared CSS classes `data-table`, `data-table-check`, `data-table-sort`, `data-table-actions` that Task 5 reuses for the campaign history table.

- [ ] **Step 1: Add the API client functions**

Append to `src/api/emailList.js`:

```js
export const deleteContact = (email) =>
  apiFetch(`/emaillist/${encodeURIComponent(email)}`, { method: 'DELETE' });
export const bulkAction = (emails, action) =>
  apiFetch('/emaillist/bulk', { method: 'POST', body: { emails, action } });
export const syncSheet = () => apiFetch('/emaillist/sync', { method: 'POST' });
```

- [ ] **Step 2: Update the test mock and add failing tests**

In `src/__tests__/EmailListTab.test.jsx`, replace the import and mock block (lines 4–11) with:

```jsx
import {
  getContacts, addContact, updateContact, deleteContact, bulkAction, runBackfill, syncSheet,
} from '../api/emailList';

vi.mock('../api/emailList', () => ({
  getContacts: vi.fn().mockResolvedValue({ contacts: [] }),
  addContact: vi.fn().mockResolvedValue({ contact: { name: 'Ann', email: 'ann@x.com', status: 'subscribed' } }),
  updateContact: vi.fn().mockResolvedValue({ contact: {} }),
  deleteContact: vi.fn().mockResolvedValue({ removed: 1 }),
  bulkAction: vi.fn().mockResolvedValue({ affected: 2 }),
  runBackfill: vi.fn().mockResolvedValue({ added: 2, total: 5 }),
  syncSheet: vi.fn().mockResolvedValue({ ok: true }),
}));

beforeEach(() => {
  getContacts.mockResolvedValue({ contacts: [] });
});

const TWO_CONTACTS = [
  { name: 'Ann', email: 'ann@x.com', status: 'subscribed', addedAt: '2026-01-01T00:00:00Z', source: 'manual' },
  { name: 'Bo', email: 'bo@x.com', status: 'unsubscribed', addedAt: '2026-02-01T00:00:00Z', source: 'backfill' },
];
```

(The `beforeEach` makes every test's starting mock explicit — vitest has no mock clearing configured.)

Append these tests at the end of the file:

```jsx
test('sorts by Added newest-first by default and toggles on header click', async () => {
  getContacts.mockResolvedValue({ contacts: TWO_CONTACTS });
  render(<EmailListTab />);
  await screen.findByText('ann@x.com');

  let rows = screen.getAllByRole('row'); // rows[0] is the header
  expect(rows[1]).toHaveTextContent('bo@x.com');  // newest first
  expect(rows[2]).toHaveTextContent('ann@x.com');

  await userEvent.click(screen.getByRole('button', { name: /^Added/ }));
  rows = screen.getAllByRole('row');
  expect(rows[1]).toHaveTextContent('ann@x.com'); // ascending = oldest first

  await userEvent.click(screen.getByRole('button', { name: /^Status/ }));
  rows = screen.getAllByRole('row');
  expect(rows[1]).toHaveTextContent('ann@x.com'); // subscribed < unsubscribed
});

test('select-all shows bulk bar and bulk unsubscribe hits the API', async () => {
  getContacts.mockResolvedValue({ contacts: TWO_CONTACTS });
  render(<EmailListTab />);
  await screen.findByText('ann@x.com');

  await userEvent.click(screen.getByLabelText('Select all'));
  expect(screen.getByText('2 selected')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Unsubscribe selected' }));
  await waitFor(() => expect(bulkAction).toHaveBeenCalledWith(
    expect.arrayContaining(['ann@x.com', 'bo@x.com']), 'unsubscribe'));
  expect(screen.queryByText('2 selected')).not.toBeInTheDocument();
});

test('row delete asks for confirmation; confirm deletes, cancel does not', async () => {
  getContacts.mockResolvedValue({ contacts: [TWO_CONTACTS[0]] });
  render(<EmailListTab />);
  await screen.findByText('ann@x.com');

  await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(screen.getByText(/permanently removes ann@x.com/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(deleteContact).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(deleteContact).toHaveBeenCalledWith('ann@x.com'));
});

test('bulk delete confirms with a count and calls the bulk API', async () => {
  getContacts.mockResolvedValue({ contacts: TWO_CONTACTS });
  render(<EmailListTab />);
  await screen.findByText('ann@x.com');

  await userEvent.click(screen.getByLabelText('Select all'));
  await userEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
  expect(screen.getByText(/permanently removes 2 contacts/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(bulkAction).toHaveBeenCalledWith(
    expect.arrayContaining(['ann@x.com', 'bo@x.com']), 'delete'));
});

test('sync button reports success', async () => {
  render(<EmailListTab />);
  await screen.findByText(/No contacts yet/i);
  await userEvent.click(screen.getByRole('button', { name: /Sync to Google Sheet/i }));
  expect(await screen.findByText(/Synced to Google Sheet/i)).toBeInTheDocument();
  expect(syncSheet).toHaveBeenCalled();
});
```

- [ ] **Step 3: Run tests to verify the new ones fail**

Run (from repo root): `npx vitest run src/__tests__/EmailListTab.test.jsx`
Expected: the 5 new tests FAIL (no checkboxes, no sort buttons, no delete/sync buttons yet); the 4 original tests still PASS.

- [ ] **Step 4: Rewrite the component**

Replace the full contents of `src/components/EmailListTab.jsx` with:

```jsx
import { useState, useEffect, useMemo } from 'react';
import {
  getContacts, addContact, updateContact, deleteContact,
  bulkAction, runBackfill, syncSheet,
} from '../api/emailList';
import ConfirmDialog from './ConfirmDialog';

export default function EmailListTab() {
  const [contacts, setContacts] = useState([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [sortKey, setSortKey] = useState('addedAt');
  const [sortDir, setSortDir] = useState('desc');
  const [selected, setSelected] = useState(new Set());
  const [confirm, setConfirm] = useState(null); // { message, emails }

  function load() {
    getContacts().then(d => setContacts(d.contacts)).catch(err => setMsg(err.message));
  }
  useEffect(() => { load(); }, []);

  const sorted = useMemo(() => {
    const list = [...contacts];
    list.sort((a, b) => {
      const av = String(a[sortKey] || '').toLowerCase();
      const bv = String(b[sortKey] || '').toLowerCase();
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [contacts, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }
  const arrow = key => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  function toggleSelected(addr) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(addr)) next.delete(addr); else next.add(addr);
      return next;
    });
  }
  const allSelected = contacts.length > 0 && selected.size === contacts.length;
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(contacts.map(c => c.email)));
  }

  async function handleAdd(e) {
    e.preventDefault();
    setMsg('');
    try {
      await addContact({ name: name.trim(), email: email.trim() });
      setName(''); setEmail('');
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

  async function handleSync() {
    setMsg('Syncing…');
    try { await syncSheet(); setMsg('Synced to Google Sheet ✓'); }
    catch (err) { setMsg(`Sheet sync failed: ${err.message}`); }
  }

  function askDelete(emails) {
    const message = emails.length === 1
      ? `This permanently removes ${emails[0]} from the list.`
      : `This permanently removes ${emails.length} contacts from the list.`;
    setConfirm({ message, emails });
  }

  async function handleConfirmDelete() {
    const { emails } = confirm;
    setConfirm(null);
    try {
      if (emails.length === 1) await deleteContact(emails[0]);
      else await bulkAction(emails, 'delete');
      setSelected(new Set());
      load();
    } catch (err) { setMsg(err.message); }
  }

  async function handleBulkStatus(action) {
    try {
      await bulkAction([...selected], action);
      setSelected(new Set());
      load();
    } catch (err) { setMsg(err.message); }
  }

  return (
    <div className="emaillist-tab">
      <h3>Email List</h3>
      <p className="emaillist-hint">
        Every customer email added to an order lands here automatically. This list feeds the Email Campaign tab.
      </p>

      <form className="emaillist-add" onSubmit={handleAdd}>
        <div className="field-group">
          <label>Name</label>
          <input placeholder="Name" value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <div className="field-group">
          <label>Email</label>
          <input type="email" placeholder="email@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <button className="btn-primary" type="submit">Add</button>
      </form>

      <div className="emaillist-toolbar">
        <button className="btn-secondary" onClick={handleBackfill}>Import from existing orders</button>
        <button className="btn-secondary" onClick={handleSync}>Sync to Google Sheet</button>
        <span className="emaillist-autosave-note">
          Changes save automatically; sync pushes the list to your Google Sheet.
        </span>
      </div>

      {msg && <p className="emaillist-msg">{msg}</p>}

      {selected.size > 0 && (
        <div className="emaillist-bulkbar">
          <span>{selected.size} selected</span>
          <button className="btn-secondary" onClick={() => handleBulkStatus('subscribe')}>Subscribe selected</button>
          <button className="btn-secondary" onClick={() => handleBulkStatus('unsubscribe')}>Unsubscribe selected</button>
          <button className="btn-danger" onClick={() => askDelete([...selected])}>Delete selected</button>
        </div>
      )}

      {contacts.length === 0 ? (
        <p className="emaillist-empty">No contacts yet — they'll appear as you add customers to orders.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th className="data-table-check">
                <input type="checkbox" aria-label="Select all" checked={allSelected} onChange={toggleAll} />
              </th>
              <th>Name</th>
              <th>Email</th>
              <th><button type="button" className="data-table-sort" onClick={() => toggleSort('status')}>Status{arrow('status')}</button></th>
              <th><button type="button" className="data-table-sort" onClick={() => toggleSort('addedAt')}>Added{arrow('addedAt')}</button></th>
              <th><button type="button" className="data-table-sort" onClick={() => toggleSort('source')}>Source{arrow('source')}</button></th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(c => (
              <tr key={c.email}>
                <td className="data-table-check">
                  <input
                    type="checkbox"
                    aria-label={`Select ${c.email}`}
                    checked={selected.has(c.email)}
                    onChange={() => toggleSelected(c.email)}
                  />
                </td>
                <td>{c.name}</td>
                <td>{c.email}</td>
                <td>{c.status}</td>
                <td>{(c.addedAt || '').slice(0, 10)}</td>
                <td>{c.source}</td>
                <td className="data-table-actions">
                  <button className="btn-secondary" onClick={() => toggleStatus(c)}>
                    {c.status === 'subscribed' ? 'Unsubscribe' : 'Resubscribe'}
                  </button>
                  <button className="btn-danger" onClick={() => askDelete([c.email])}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Add the CSS**

Append at the end of `src/App.css`:

```css
/* ===== Email List & Campaign ===== */
.emaillist-tab, .campaigns-tab {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
}

.emaillist-hint, .campaigns-hint {
  font-size: 14px;
  opacity: 0.85;
  max-width: 680px;
}

.emaillist-add {
  display: flex;
  align-items: flex-end;
  gap: 20px;
  flex-wrap: wrap;
}
.emaillist-add .field-group {
  flex: 1 1 240px;
  max-width: 360px;
}
.emaillist-add .btn-primary {
  padding: 10px 28px;
}

.emaillist-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.emaillist-autosave-note {
  font-size: 13px;
  opacity: 0.7;
}
.emaillist-msg, .campaigns-msg {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent);
}

.emaillist-bulkbar {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--accent-bg);
  border: 1px solid var(--accent-border);
  border-radius: 8px;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 600;
}

/* Shared real-table styling (email list + campaign history) */
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  background: #fff;
}
.data-table th, .data-table td {
  border: 1px solid var(--border);
  padding: 10px 14px;
  text-align: left;
  color: var(--text);
}
.data-table thead th {
  background: #e8ecf5;
  color: var(--text-h);
  font-weight: 600;
}
.data-table tbody tr:nth-child(even) {
  background: #f6f8fc;
}
.data-table tbody tr:hover {
  background: var(--accent-bg);
}
.data-table-check {
  width: 36px;
  text-align: center;
}
.data-table-check input {
  accent-color: var(--accent);
  width: 16px;
  height: 16px;
  cursor: pointer;
}
.data-table-sort {
  border: none;
  background: none;
  padding: 0;
  border-radius: 0;
  font: inherit;
  font-weight: 600;
  color: var(--text-h);
  cursor: pointer;
}
.data-table-sort:hover:not(:disabled) {
  border: none;
  background: none;
  color: var(--accent);
}
.data-table-actions {
  display: flex;
  gap: 8px;
}
.data-table-actions button {
  padding: 5px 12px;
  font-size: 13px;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run (from repo root): `npx vitest run src/__tests__/EmailListTab.test.jsx src/__tests__/EmailScreen.test.jsx`
Expected: ALL tests PASS (originals + 5 new + EmailScreen unaffected).

- [ ] **Step 7: Commit**

```bash
git add src/api/emailList.js src/components/EmailListTab.jsx src/__tests__/EmailListTab.test.jsx src/App.css
git commit -m "feat: email list table with selection, bulk actions, sorting, delete, and sheet sync"
```

---

### Task 5: Campaign tab layout redesign

**Files:**
- Modify: `src/components/CampaignsTab.jsx` (render block rework — logic unchanged)
- Modify: `src/App.css` (append campaign layout rules)
- Test: `src/__tests__/CampaignsTab.test.jsx` (must pass unchanged — it queries by placeholder/label/button text, all preserved)

**Interfaces:**
- Consumes: shared `data-table` CSS classes from Task 4; existing `settings-section-label` and `field-group` styles; campaign API unchanged.
- Produces: nothing new for other tasks — layout only.

- [ ] **Step 1: Rework the render block**

In `src/components/CampaignsTab.jsx`, leave all state/handlers (lines 1–54) untouched. Replace the entire `return (...)` with:

```jsx
  return (
    <div className="campaigns-tab">
      <h3>Email Campaign</h3>
      <p className="campaigns-hint">
        Compose an email blast for your list. Use [customer name] to personalize.
        Scheduled emails send while the app is running (missed sends go out on next launch, up to 48h late).
      </p>

      <form className="campaigns-compose" onSubmit={handleSchedule}>
        <div className="campaigns-message">
          <div className="settings-section-label">Message</div>
          <div className="field-group">
            <label>Subject</label>
            <input placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div className="field-group">
            <label>Body</label>
            <textarea
              placeholder="Hello [customer name],&#10;&#10;Write your email here…"
              rows={14}
              value={body}
              onChange={e => setBody(e.target.value)}
            />
          </div>
        </div>

        <div className="campaigns-side">
          <div className="settings-section-label">Recipients</div>
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

          <div className="settings-section-label">Schedule</div>
          <div className="field-group">
            <label>Send at (leave blank to send now)</label>
            <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} />
          </div>
          <button className="btn-primary" type="submit">Schedule blast</button>
        </div>
      </form>

      {msg && <p className="campaigns-msg">{msg}</p>}

      <div className="settings-section-label">History</div>
      {jobs.length === 0 ? (
        <p className="campaigns-empty">No campaigns yet.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>Subject</th><th>Recipients</th><th>Send at</th><th>Status</th><th>Actions</th></tr>
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
                <td className="data-table-actions">
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
```

(Placeholders "Subject" and "Hello [customer name]…", labelled radios/checkboxes, and button names are unchanged — the existing tests keep passing.)

- [ ] **Step 2: Add the layout CSS**

Append at the end of `src/App.css` (after Task 4's block):

```css
/* Campaign compose: message left, recipients/schedule right */
.campaigns-compose {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(300px, 2fr);
  gap: 20px 48px;
  align-items: start;
}
@media (max-width: 900px) {
  .campaigns-compose { grid-template-columns: 1fr; }
}
.campaigns-message, .campaigns-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.campaigns-message textarea {
  min-height: 280px;
  resize: vertical;
}

.campaigns-recipients {
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 15px;
}
.campaigns-recipients > label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.campaigns-recipients input[type="radio"],
.campaigns-contact-picker input[type="checkbox"] {
  accent-color: var(--accent);
  width: 16px;
  height: 16px;
}
.campaigns-contact-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 220px;
  overflow-y: auto;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
  background: #fff;
}
.campaigns-contact-picker label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  cursor: pointer;
}
.campaigns-side .btn-primary {
  align-self: flex-start;
  padding: 12px 32px;
  font-size: 15px;
}

.campaigns-empty, .emaillist-empty {
  font-size: 14px;
  opacity: 0.7;
}
```

- [ ] **Step 3: Run the campaign tests**

Run (from repo root): `npx vitest run src/__tests__/CampaignsTab.test.jsx`
Expected: ALL tests PASS unchanged.

- [ ] **Step 4: Run both full suites**

Run (from repo root): `npx vitest run`
Expected: ALL frontend tests PASS.
Run (from `server/`): `npm test`
Expected: ALL server tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/CampaignsTab.jsx src/App.css
git commit -m "feat: two-column campaign compose layout with shared table styling"
```

---

## Verification (after all tasks)

- [ ] Full suites green: `npx vitest run` (root) and `npm test` (server/).
- [ ] Manual smoke test: `npm run dev:backend` + `npm run dev:frontend`, then in the browser:
  - Orders list shows ✉ Email next to ⚙ Settings; clicking it opens the Email screen with Email List / Email Campaign tabs.
  - Settings no longer shows Email List or Campaigns tabs.
  - Email List: add a contact (roomy labeled inputs), sort by clicking Status/Added/Source, check rows → bulk bar appears, delete shows the confirmation dialog, "Sync to Google Sheet" reports a result.
  - Email Campaign: message on the left, recipients/schedule on the right; history table has gridlines and alternating rows.
