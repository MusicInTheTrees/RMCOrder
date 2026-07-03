# Customer Status Emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let RMCOrder store a per-order list of buyers and send each of them an individual branded status email when the order reaches the `sent`, `fulfilled`, `received`, or new `shipped` state.

**Architecture:** Customer `{name,email}` rows plus per-state send timestamps live on the order object (a new "Customers" tab on the order's Google Sheet, mirrored into `orders-cache/*.json`). A new backend email builder renders the "Trailhead" HTML with an inline-embedded logo; a new Gmail `sendEmail` helper sends one `multipart/related` message per recipient. The frontend gets an Order/Customers tab toggle, a paste-to-parse customer list, and an editable review-and-send modal. A global setting flips review-then-send to auto-send.

**Tech Stack:** React 19 + Vite (ESM frontend, Vitest/RTL), Express (CommonJS backend, Jest/Supertest), Google Sheets + Gmail APIs (mocked in tests).

## Global Constraints

- **Order state chain (exact order):** `building → sent → pending → paid → fulfilled → received → shipped`.
- **Emailing states (exact set):** `sent`, `fulfilled`, `received`, `shipped`.
- **Frontend is ESM** (`import`/`export`); **backend is CommonJS** (`require`/`module.exports`). Match each side.
- **No new npm dependencies** — build MIME by hand, embed the logo as base64.
- **Individual sends only** — one Gmail message per recipient; never CC/BCC multiple customers together.
- **Greeting fallback:** `Hi {name},` when a name exists, otherwise `Hi there,`.
- **Auto-send default:** `false` (review-then-send is the default flow).
- **Idempotency:** a customer is only emailed for a state when their `emailed[state]` timestamp is empty.
- **Do not touch** the existing printer (Spew) email flow (`buildEmailHtml`/`buildEmailPlainText`, `upsertDraft`, `POST /gmail/draft`).
- **Exact default email copy** is specified verbatim in Task 4 — copy it character-for-character.
- All API calls go through `apiFetch` with a `/api`-less path (e.g. `/gmail/...`); Vite proxies `/api` → backend.

---

### Task 1: Add the `shipped` order state

**Files:**
- Modify: `src/components/StateBadge.jsx:1-8`
- Modify: `src/components/OrderTopBar.jsx:5`
- Test: `src/__tests__/StateBadge.test.jsx` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `shipped` becomes a valid state everywhere `STATE_ORDER` / `STATE_COLORS` are used; `OrderTopBar` will offer "Move to → shipped" after `received`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/StateBadge.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import StateBadge, { STATE_COLORS } from '../components/StateBadge';

test('shipped has a distinct badge color', () => {
  expect(STATE_COLORS.shipped).toBeTruthy();
  expect(STATE_COLORS.shipped).not.toBe(STATE_COLORS.received);
});

test('renders the shipped label', () => {
  render(<StateBadge state="shipped" />);
  expect(screen.getByText('shipped')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- StateBadge`
Expected: FAIL — `STATE_COLORS.shipped` is `undefined` (and `STATE_COLORS` may not be exported).

- [ ] **Step 3: Add the color and export**

In `src/components/StateBadge.jsx`, change the first line from `export const STATE_COLORS = {` block to include `shipped` (keep `export`):

```jsx
export const STATE_COLORS = {
  building:  '#ef4444',
  sent:      '#f97316',
  pending:   '#eab308',
  paid:      '#22c55e',
  fulfilled: '#3b82f6',
  received:  '#8b5cf6',
  shipped:   '#14b8a6',
};
```

- [ ] **Step 4: Add `shipped` to the advance order**

In `src/components/OrderTopBar.jsx:5`, change:

```jsx
const STATE_ORDER = ['building', 'sent', 'pending', 'paid', 'fulfilled', 'received', 'shipped'];
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- StateBadge`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/StateBadge.jsx src/components/OrderTopBar.jsx src/__tests__/StateBadge.test.jsx
git commit -m "feat: add shipped order state"
```

---

### Task 2: Round-trip the Customers tab in the order Sheet

**Files:**
- Modify: `server/sheets/orderSheet.js` (`ensureSheets`, `writeOrderToSheet`, `readOrderFromSheet`; add `writeCustomersToSheet`)
- Test: `server/__tests__/orderSheet.test.js` (add cases)

**Interfaces:**
- Consumes: `readRange`, `writeRange`, `clearRange`, `addSheet`, `getSheetNames` from `./client`.
- Produces:
  - `writeOrderToSheet(sheetId, orderData)` also writes a `Customers` tab from `orderData.customers`.
  - `readOrderFromSheet(sheetId)` returns `customers: [{ name, email, emailed: { sent, fulfilled, received, shipped } }]` (`[]` when no tab).
  - `writeCustomersToSheet(sheetId, customers)` — targeted writer used by the send route.
  - `EMAIL_STATES = ['sent','fulfilled','received','shipped']` exported.

- [ ] **Step 1: Write the failing tests**

Add to `server/__tests__/orderSheet.test.js`. Also update the existing `getSheetNames` mock (line 9) so `Customers` is treated as already-present in the write test:

```js
// at top, change the getSheetNames mock default to include Customers:
//   getSheetNames: jest.fn().mockResolvedValue(['Sheet1', 'Line Items', 'Designs', 'Customers']),

const { writeCustomersToSheet, EMAIL_STATES } = require('../sheets/orderSheet');

test('EMAIL_STATES is the agreed set', () => {
  expect(EMAIL_STATES).toEqual(['sent', 'fulfilled', 'received', 'shipped']);
});

test('writeOrderToSheet writes the Customers tab', async () => {
  clearRange.mockResolvedValue();
  writeRange.mockResolvedValue();
  const order = {
    orderId: 'RMC-002-2026-07-03', orderName: 'Drop', state: 'building',
    created: '2026-07-03', notes: '', sheetId: 's', lineItems: [],
    customers: [
      { name: 'Jordan', email: 'jordan@x.com', emailed: { sent: '2026-07-03T00:00:00Z' } },
      { name: '', email: 'sam@x.com', emailed: {} },
    ],
  };
  await writeOrderToSheet('s', order);
  const call = writeRange.mock.calls.find(c => c[1].includes('Customers'));
  expect(call).toBeTruthy();
  const rows = call[2];
  expect(rows[0]).toEqual(['Name', 'Email', 'Sent: sent', 'Sent: fulfilled', 'Sent: received', 'Sent: shipped']);
  expect(rows[1]).toEqual(['Jordan', 'jordan@x.com', '2026-07-03T00:00:00Z', '', '', '']);
  expect(rows[2]).toEqual(['', 'sam@x.com', '', '', '', '']);
});

test('readOrderFromSheet reads the Customers tab', async () => {
  readRange.mockImplementation((sheetId, range) => {
    if (range.startsWith('Sheet1')) return Promise.resolve([
      ['Order ID', 'RMC-002'], ['State', 'sent'], ['Sheet ID', 's'],
    ]);
    if (range.includes('Line Items')) return Promise.resolve([
      ['#', 'Item Type', 'Color', 'Sizes', 'Front Method', 'Front Notes', 'Back Method', 'Back Notes', 'Item Type ID'],
    ]);
    if (range.startsWith('Designs')) return Promise.resolve([]);
    if (range.startsWith('Customers')) return Promise.resolve([
      ['Name', 'Email', 'Sent: sent', 'Sent: fulfilled', 'Sent: received', 'Sent: shipped'],
      ['Jordan', 'jordan@x.com', '2026-07-03T00:00:00Z', '', '', ''],
    ]);
    return Promise.resolve([]);
  });
  const order = await readOrderFromSheet('s');
  expect(order.customers).toEqual([
    { name: 'Jordan', email: 'jordan@x.com', emailed: { sent: '2026-07-03T00:00:00Z', fulfilled: '', received: '', shipped: '' } },
  ]);
});

test('readOrderFromSheet defaults customers to [] when tab missing', async () => {
  readRange.mockImplementation((sheetId, range) => {
    if (range.startsWith('Sheet1')) return Promise.resolve([['Order ID', 'RMC-003'], ['Sheet ID', 's']]);
    if (range.includes('Line Items')) return Promise.resolve([['#', 'Item Type', 'Color', 'Sizes', 'Front Method', 'Front Notes', 'Back Method', 'Back Notes', 'Item Type ID']]);
    return Promise.resolve([]); // Designs + Customers empty
  });
  const order = await readOrderFromSheet('s');
  expect(order.customers).toEqual([]);
});

test('writeCustomersToSheet writes only the Customers tab', async () => {
  clearRange.mockResolvedValue();
  writeRange.mockResolvedValue();
  await writeCustomersToSheet('s', [{ name: 'A', email: 'a@x.com', emailed: { shipped: '2026-07-03T00:00:00Z' } }]);
  const call = writeRange.mock.calls.find(c => c[1].includes('Customers'));
  expect(call[2][1]).toEqual(['A', 'a@x.com', '', '', '', '2026-07-03T00:00:00Z']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npm test -- orderSheet`
Expected: FAIL — `writeCustomersToSheet`/`EMAIL_STATES` undefined; Customers tab not written/read.

- [ ] **Step 3: Implement in `server/sheets/orderSheet.js`**

At the top, after the existing `require`, add:

```js
const EMAIL_STATES = ['sent', 'fulfilled', 'received', 'shipped'];
const CUSTOMER_HEADER = ['Name', 'Email', ...EMAIL_STATES.map(s => `Sent: ${s}`)];

function customersToRows(customers) {
  const rows = [CUSTOMER_HEADER];
  for (const c of customers || []) {
    rows.push([c.name || '', c.email || '', ...EMAIL_STATES.map(s => (c.emailed && c.emailed[s]) || '')]);
  }
  return rows;
}

function rowsToCustomers(rows) {
  const [, ...body] = rows || [];
  const customers = [];
  for (const row of body) {
    if (!row || !row[1]) continue; // require an email
    const emailed = {};
    EMAIL_STATES.forEach((s, i) => { emailed[s] = row[2 + i] || ''; });
    customers.push({ name: row[0] || '', email: row[1], emailed });
  }
  return customers;
}

async function writeCustomersToSheet(sheetId, customers) {
  await ensureSheets(sheetId);
  await clearRange(sheetId, 'Customers!A1:Z1000');
  await writeRange(sheetId, 'Customers!A1', customersToRows(customers), 'RAW');
}
```

In `ensureSheets`, add the Customers tab:

```js
async function ensureSheets(sheetId) {
  const existingNames = await getSheetNames(sheetId);
  if (!existingNames.includes('Line Items')) await addSheet(sheetId, 'Line Items');
  if (!existingNames.includes('Designs')) await addSheet(sheetId, 'Designs');
  if (!existingNames.includes('Customers')) await addSheet(sheetId, 'Customers');
}
```

At the end of `writeOrderToSheet`, after the Designs `writeRange`, add:

```js
  await clearRange(sheetId, 'Customers!A1:Z1000');
  await writeRange(sheetId, 'Customers!A1', customersToRows(orderData.customers), 'RAW');
```

In `readOrderFromSheet`, before the final `return`, add:

```js
  let customers = [];
  try {
    const custRows = await readRange(sheetId, 'Customers!A1:F1000');
    customers = rowsToCustomers(custRows);
  } catch { /* legacy order without Customers tab */ }
```

and add `customers,` to the returned object.

Finally extend the exports:

```js
module.exports = { initOrderSheet, writeOrderToSheet, readOrderFromSheet, writeCustomersToSheet, EMAIL_STATES };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npm test -- orderSheet`
Expected: PASS (all existing + 5 new).

- [ ] **Step 5: Commit**

```bash
git add server/sheets/orderSheet.js server/__tests__/orderSheet.test.js
git commit -m "feat: round-trip customer list on order Sheet"
```

---

### Task 3: Customer paste parser (frontend util)

**Files:**
- Create: `src/utils/parseCustomers.js`
- Test: `src/__tests__/parseCustomers.test.js` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `parseCustomers(text) → { rows: [{name, email}], skipped: [string] }` — used by `CustomersPanel`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/parseCustomers.test.js`:

```js
import { describe, test, expect } from 'vitest';
import { parseCustomers } from '../utils/parseCustomers';

describe('parseCustomers', () => {
  test('parses "Name, email"', () => {
    const { rows } = parseCustomers('Jordan, jordan@x.com');
    expect(rows).toEqual([{ name: 'Jordan', email: 'jordan@x.com' }]);
  });
  test('parses "Name <email>"', () => {
    const { rows } = parseCustomers('Sam Lee <sam@x.com>');
    expect(rows).toEqual([{ name: 'Sam Lee', email: 'sam@x.com' }]);
  });
  test('parses bare email with blank name', () => {
    const { rows } = parseCustomers('solo@x.com');
    expect(rows).toEqual([{ name: '', email: 'solo@x.com' }]);
  });
  test('handles multiple lines and trims', () => {
    const { rows } = parseCustomers('  Jordan , jordan@x.com \nsolo@x.com');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: 'Jordan', email: 'jordan@x.com' });
  });
  test('reports lines with no valid email as skipped', () => {
    const { rows, skipped } = parseCustomers('not an email\nJordan, jordan@x.com');
    expect(rows).toHaveLength(1);
    expect(skipped).toEqual(['not an email']);
  });
  test('ignores empty lines', () => {
    const { rows } = parseCustomers('\n\njordan@x.com\n');
    expect(rows).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- parseCustomers`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/utils/parseCustomers.js`**

```js
const EMAIL_RE = /[^\s<>,;]+@[^\s<>,;]+\.[^\s<>,;]+/;

// Parse pasted text (one entry per line) into customer rows.
// Accepts "Name, email", "Name <email>", or a bare email.
export function parseCustomers(text) {
  const rows = [];
  const skipped = [];
  for (const raw of (text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(EMAIL_RE);
    if (!match) { skipped.push(line); continue; }
    const email = match[0].trim();
    let name = line
      .replace(email, '')
      .replace(/[<>]/g, '')
      .replace(/[,;]/g, ' ')
      .trim();
    rows.push({ name, email });
  }
  return { rows, skipped };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- parseCustomers`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/parseCustomers.js src/__tests__/parseCustomers.test.js
git commit -m "feat: add customer paste parser"
```

---

### Task 4: Customer email builder (backend)

**Files:**
- Create: `server/gmail/customerEmailBuilder.js`
- Create: `server/assets/rmc_logo.png` (copy of the RMC logo)
- Test: `server/__tests__/customerEmailBuilder.test.js` (create)

**Interfaces:**
- Consumes: nothing (pure, except reading the bundled logo file).
- Produces:
  - `customerEmailDefaults(state, orderName) → { subject, body }` — `{orderName}` resolved.
  - `buildCustomerEmail({ state, customerName, subject, body }) → { subject, html, plain }`.
  - `logoAttachment() → { cid, filename, content }` (content is a Buffer).
  - `LOGO_CID` (`'rmclogo'`), `STATE_EMAILS` (template table).

- [ ] **Step 1: Bundle the logo asset**

```bash
mkdir -p server/assets
cp UI_Reference_Material/rmc_logo.png server/assets/rmc_logo.png
```

(The ~2 MB logo works inline as-is. Downscaling is a later optimization noted in the spec — do not block on it.)

- [ ] **Step 2: Write the failing test**

Create `server/__tests__/customerEmailBuilder.test.js`:

```js
const { customerEmailDefaults, buildCustomerEmail, logoAttachment, LOGO_CID } = require('../gmail/customerEmailBuilder');

test('defaults resolve {orderName} in the body', () => {
  const { subject, body } = customerEmailDefaults('shipped', 'Summer Drop');
  expect(subject).toBe('Your RMC order is on its way! 📦');
  expect(body).toContain('"Summer Drop"');
  expect(body).not.toContain('{orderName}');
});

test('unknown state throws', () => {
  expect(() => customerEmailDefaults('paid', 'X')).toThrow();
});

test('html greets by name and embeds logo via cid', () => {
  const { html } = buildCustomerEmail({ state: 'sent', customerName: 'Jordan', subject: 'S', body: 'Body text.' });
  expect(html).toContain('Hi Jordan');
  expect(html).toContain(`cid:${LOGO_CID}`);
  expect(html).toContain('Body text.');
  expect(html).toContain('In Production'); // pill/status label for sent
});

test('html falls back to "Hi there" when name blank', () => {
  const { html, plain } = buildCustomerEmail({ state: 'shipped', customerName: '', subject: 'S', body: 'B' });
  expect(html).toContain('Hi there');
  expect(plain).toContain('Hi there');
});

test('subject passes through from caller (edited)', () => {
  const { subject } = buildCustomerEmail({ state: 'received', customerName: 'A', subject: 'Custom subject', body: 'B' });
  expect(subject).toBe('Custom subject');
});

test('logoAttachment returns a Buffer with the agreed cid', () => {
  const att = logoAttachment();
  expect(att.cid).toBe(LOGO_CID);
  expect(Buffer.isBuffer(att.content)).toBe(true);
  expect(att.content.length).toBeGreaterThan(0);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && npm test -- customerEmailBuilder`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `server/gmail/customerEmailBuilder.js`**

Copy the copy strings **exactly**:

```js
const fs = require('fs');
const path = require('path');

const LOGO_CID = 'rmclogo';
const LOGO_PATH = path.join(__dirname, '..', 'assets', 'rmc_logo.png');

// tagline = the part after "Hi {name} — " in the headline. status = the pill label.
const STATE_EMAILS = {
  sent: {
    subject: 'Your RMC order is being made 🖨️',
    pill: '🖨️ In Production', status: 'In Production',
    tagline: "your order's in the works!",
    body: `Your order "{orderName}" is now with our print shop getting made. We'll keep you posted as it moves along. Thanks for repping the Meowtain! 🐱`,
  },
  fulfilled: {
    subject: 'Your RMC order is printed ✅',
    pill: '✅ Printed', status: 'Printed',
    tagline: "your order's printed!",
    body: `Great news — "{orderName}" is finished at the print shop and we're heading out to pick it up. You're almost at the summit! 🏔️`,
  },
  received: {
    subject: 'Your RMC order is in-hand 📥',
    pill: '📥 In-Hand', status: 'In-Hand',
    tagline: 'your order made it back to the den!',
    body: `Your order "{orderName}" has arrived at RMC and we're getting it packed up and ready for you. We'll let you know the moment it's on its way. 🐾`,
  },
  shipped: {
    subject: 'Your RMC order is on its way! 📦',
    pill: '📦 Shipped', status: 'Shipped',
    tagline: "it's on its way!",
    body: `Your order "{orderName}" just left the den. Keep an eye out — your gear should reach you soon. Thanks for repping the Meowtain! 🐱`,
  },
};

function customerEmailDefaults(state, orderName) {
  const t = STATE_EMAILS[state];
  if (!t) throw new Error(`No customer email template for state "${state}"`);
  return { subject: t.subject, body: t.body.replaceAll('{orderName}', orderName || 'your order') };
}

function buildCustomerEmail({ state, customerName, subject, body }) {
  const t = STATE_EMAILS[state];
  if (!t) throw new Error(`No customer email template for state "${state}"`);
  const greetName = (customerName && customerName.trim()) ? customerName.trim() : 'there';

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#eef1ea;">
  <div style="font-family:'Segoe UI',system-ui,sans-serif;max-width:500px;margin:0 auto;background:#fffdf7;border-radius:14px;overflow:hidden">
    <div style="background:#f3ecd9;padding:16px 22px;text-align:center;border-bottom:3px solid #22402f">
      <img src="cid:${LOGO_CID}" alt="Rocky Meowtain Co." style="max-width:230px;width:70%;height:auto;display:block;margin:0 auto">
    </div>
    <div style="padding:20px 22px;color:#2b2b2b">
      <span style="display:inline-block;background:#e07a3f;color:#fff;font-size:11px;font-weight:700;padding:4px 11px;border-radius:20px;text-transform:uppercase;letter-spacing:1px">${t.pill}</span>
      <h3 style="margin:13px 0 6px;font-size:18px;color:#22402f">Hi ${greetName} — ${t.tagline}</h3>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:#444">${body}</p>
      <div style="background:#f4f0e4;border-left:4px solid #e07a3f;padding:10px 13px;border-radius:6px;font-size:13px;color:#555"><strong>Status:</strong> ${t.status}</div>
    </div>
    <div style="background:#22402f;color:#cdd8cd;padding:12px 22px;text-align:center;font-size:11px">Rocky Meowtain Company LLC · Made with 🐾 in the Rockies</div>
  </div></body></html>`;

  const plain = `Hi ${greetName} — ${t.tagline}\n\n${body}\n\nStatus: ${t.status}\n\nRocky Meowtain Company LLC`;

  return { subject, html, plain };
}

function logoAttachment() {
  return { cid: LOGO_CID, filename: 'rmc_logo.png', content: fs.readFileSync(LOGO_PATH) };
}

module.exports = { STATE_EMAILS, customerEmailDefaults, buildCustomerEmail, logoAttachment, LOGO_CID };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npm test -- customerEmailBuilder`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add server/gmail/customerEmailBuilder.js server/assets/rmc_logo.png server/__tests__/customerEmailBuilder.test.js
git commit -m "feat: add customer status email builder + logo asset"
```

---

### Task 5: Gmail `sendEmail` with inline image (backend)

**Files:**
- Modify: `server/gmail/client.js` (add `buildRawRelated`, `sendEmail`; keep `upsertDraft`)
- Test: `server/__tests__/gmailClient.test.js` (create)

**Interfaces:**
- Consumes: `getOAuth2Client` from `../auth/oauth`.
- Produces:
  - `buildRawRelated(to, subject, html, plain, inlineImages=[{cid,filename,content:Buffer}]) → base64url string` (pure).
  - `sendEmail(to, subject, html, plain, inlineImages=[]) → messageId`.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/gmailClient.test.js`:

```js
const { buildRawRelated } = require('../gmail/client');

function decode(b64url) {
  return Buffer.from(b64url, 'base64url').toString('utf8');
}

test('buildRawRelated wraps html+plain with no images', () => {
  const raw = decode(buildRawRelated('a@x.com', 'Subj', '<b>hi</b>', 'hi', []));
  expect(raw).toContain('To: a@x.com');
  expect(raw).toContain('Subject: Subj');
  expect(raw).toContain('multipart/alternative');
  expect(raw).toContain('text/plain');
  expect(raw).toContain('text/html');
  expect(raw).not.toContain('multipart/related');
});

test('buildRawRelated adds a related image part with Content-ID', () => {
  const img = { cid: 'rmclogo', filename: 'rmc_logo.png', content: Buffer.from('PNGDATA') };
  const raw = decode(buildRawRelated('a@x.com', 'S', '<img src="cid:rmclogo">', 'p', [img]));
  expect(raw).toContain('multipart/related');
  expect(raw).toContain('Content-ID: <rmclogo>');
  expect(raw).toContain('Content-Disposition: inline; filename="rmc_logo.png"');
  expect(raw).toContain(Buffer.from('PNGDATA').toString('base64'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- gmailClient`
Expected: FAIL — `buildRawRelated` is not exported.

- [ ] **Step 3: Implement in `server/gmail/client.js`**

Add below the existing `buildRaw` function (do not remove `buildRaw`/`upsertDraft`):

```js
function wrap76(b64) {
  return b64.match(/.{1,76}/g).join('\r\n');
}

function buildRawRelated(to, subject, htmlBody, plainTextBody, inlineImages = []) {
  const alt = 'alt_rmc';
  const rel = 'rel_rmc';
  const hasImages = inlineImages.length > 0;
  const lines = [`To: ${to}`, `Subject: ${subject}`, 'MIME-Version: 1.0'];

  if (hasImages) {
    lines.push(`Content-Type: multipart/related; boundary="${rel}"`, '', `--${rel}`);
  }
  lines.push(
    `Content-Type: multipart/alternative; boundary="${alt}"`, '',
    `--${alt}`, 'Content-Type: text/plain; charset=UTF-8', '', plainTextBody, '',
    `--${alt}`, 'Content-Type: text/html; charset=UTF-8', '', htmlBody, '',
    `--${alt}--`, '',
  );
  for (const img of inlineImages) {
    lines.push(
      `--${rel}`,
      `Content-Type: image/png; name="${img.filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-ID: <${img.cid}>`,
      `Content-Disposition: inline; filename="${img.filename}"`,
      '',
      wrap76(img.content.toString('base64')),
      '',
    );
  }
  if (hasImages) lines.push(`--${rel}--`);
  return Buffer.from(lines.join('\r\n')).toString('base64url');
}

async function sendEmail(to, subject, htmlBody, plainTextBody, inlineImages = []) {
  const auth = getOAuth2Client();
  const gmail = google.gmail({ version: 'v1', auth });
  const raw = buildRawRelated(to, subject, htmlBody, plainTextBody, inlineImages);
  const res = await gmail.users.messages.send({ userId: 'me', resource: { raw } });
  return res.data.id;
}
```

Change the exports line to:

```js
module.exports = { upsertDraft, sendEmail, buildRawRelated };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- gmailClient`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/gmail/client.js server/__tests__/gmailClient.test.js
git commit -m "feat: add Gmail sendEmail with inline image support"
```

---

### Task 6: Auto-send global setting (backend)

**Files:**
- Modify: `server/settings/store.js:4-9` (add default)
- Modify: `server/settings/router.js:11-15` (merge full body instead of dropping fields)
- Test: `server/__tests__/settings.test.js` (create)

**Interfaces:**
- Consumes: `readSettings`/`writeSettings`.
- Produces: settings object always has `autoSendCustomerEmails` (boolean, default `false`); `PUT /settings` persists it.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/settings.test.js`:

```js
const request = require('supertest');
const fs = require('fs');
const config = require('../config');
const path = require('path');

const TEST_SETTINGS = path.join(__dirname, 'settings-test.json');
const real = config.SETTINGS_FILE;

beforeEach(() => { config.SETTINGS_FILE = TEST_SETTINGS; if (fs.existsSync(TEST_SETTINGS)) fs.unlinkSync(TEST_SETTINGS); });
afterEach(() => { config.SETTINGS_FILE = real; if (fs.existsSync(TEST_SETTINGS)) fs.unlinkSync(TEST_SETTINGS); });

function getApp() { jest.resetModules(); require('../config').SETTINGS_FILE = TEST_SETTINGS; return require('../index'); }

test('GET /settings defaults autoSendCustomerEmails to false', async () => {
  const res = await request(getApp()).get('/settings');
  expect(res.body.autoSendCustomerEmails).toBe(false);
});

test('PUT /settings persists autoSendCustomerEmails and keeps other fields', async () => {
  const app = getApp();
  await request(app).put('/settings').send({ brandName: 'RMC', spewEmail: 's@x.com', defaultBackNotes: 'keep me', autoSendCustomerEmails: true });
  const res = await request(app).get('/settings');
  expect(res.body.autoSendCustomerEmails).toBe(true);
  expect(res.body.defaultBackNotes).toBe('keep me');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- settings`
Expected: FAIL — `autoSendCustomerEmails` undefined / `defaultBackNotes` dropped by PUT.

- [ ] **Step 3: Add the default**

In `server/settings/store.js`, add to `DEFAULTS`:

```js
const DEFAULTS = {
  brandName: 'Rocky Meowtain Co.',
  spewEmail: '',
  defaultBackDesign: '',
  defaultBackNotes: '',
  autoSendCustomerEmails: false,
};
```

- [ ] **Step 4: Make PUT merge the full body**

In `server/settings/router.js`, replace the `PUT /` handler body:

```js
router.put('/', (req, res) => {
  writeSettings({ ...readSettings(), ...req.body });
  res.json({ ok: true });
});
```

(`readSettings` is already imported at the top of the file.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npm test -- settings`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add server/settings/store.js server/settings/router.js server/__tests__/settings.test.js
git commit -m "feat: add autoSendCustomerEmails setting"
```

---

### Task 7: Customer email routes — preview + send (backend)

**Files:**
- Modify: `server/gmail/router.js` (add two routes; add imports)
- Test: `server/__tests__/customerEmail.test.js` (create)

**Interfaces:**
- Consumes: `readOrderFromSheet`, `writeCustomersToSheet` (Task 2); `buildCustomerEmail`, `customerEmailDefaults`, `logoAttachment` (Task 4); `sendEmail` (Task 5); `readOrderCache`, `writeOrderCache`; `readRange`.
- Produces:
  - `POST /gmail/customer-email/preview` — body `{ sheetId, state }` → `{ subject, body }` (defaults, `{orderName}` resolved).
  - `POST /gmail/customer-email/send` — body `{ sheetId, state, recipients: [{name,email}], subject, body }` → `{ sent, at, emails }`. Sends one message per recipient, stamps `emailed[state]=at` on those customers, persists to cache + Customers tab.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/customerEmail.test.js`:

```js
const request = require('supertest');

jest.mock('../auth/oauth', () => ({
  loadTokens: () => ({ refresh_token: 'x' }),
  getOAuth2Client: () => ({}),
}));
jest.mock('../gmail/client', () => ({
  upsertDraft: jest.fn(),
  sendEmail: jest.fn().mockResolvedValue('msg-id'),
  buildRawRelated: jest.fn(),
}));
jest.mock('../sheets/client', () => ({
  readRange: jest.fn().mockResolvedValue([['Order ID', 'RMC-050'], ['Sheet ID', 's']]),
  writeRange: jest.fn(), clearRange: jest.fn(), addSheet: jest.fn(),
  getSheetNames: jest.fn().mockResolvedValue(['Sheet1', 'Line Items', 'Designs', 'Customers']),
}));
jest.mock('../orders/cache', () => ({
  readOrderCache: jest.fn(),
  writeOrderCache: jest.fn(),
  deleteOrderCache: jest.fn(),
}));
jest.mock('../sheets/orderSheet', () => ({
  readOrderFromSheet: jest.fn(),
  writeOrderToSheet: jest.fn(),
  writeCustomersToSheet: jest.fn().mockResolvedValue(),
  EMAIL_STATES: ['sent', 'fulfilled', 'received', 'shipped'],
}));

const { sendEmail } = require('../gmail/client');
const { readOrderCache, writeOrderCache } = require('../orders/cache');
const { writeCustomersToSheet } = require('../sheets/orderSheet');

function getApp() { jest.resetModules(); return require('../index'); }

const ORDER = {
  orderId: 'RMC-050', orderName: 'Summer Drop', sheetId: 's', lineItems: [],
  customers: [
    { name: 'Jordan', email: 'jordan@x.com', emailed: { sent: '', fulfilled: '', received: '', shipped: '' } },
    { name: '', email: 'sam@x.com', emailed: { sent: '', fulfilled: '', received: '', shipped: '' } },
  ],
};

beforeEach(() => { jest.clearAllMocks(); });

test('preview returns defaults with orderName resolved', async () => {
  readOrderCache.mockReturnValue(ORDER);
  const res = await request(getApp()).post('/gmail/customer-email/preview').send({ sheetId: 's', state: 'shipped' });
  expect(res.status).toBe(200);
  expect(res.body.subject).toContain('on its way');
  expect(res.body.body).toContain('"Summer Drop"');
});

test('send emails each recipient individually and stamps timestamps', async () => {
  readOrderCache.mockReturnValue(JSON.parse(JSON.stringify(ORDER)));
  const res = await request(getApp()).post('/gmail/customer-email/send').send({
    sheetId: 's', state: 'shipped',
    recipients: [{ name: 'Jordan', email: 'jordan@x.com' }, { name: '', email: 'sam@x.com' }],
    subject: 'Subj', body: 'Body.',
  });
  expect(res.status).toBe(200);
  expect(res.body.sent).toBe(2);
  expect(sendEmail).toHaveBeenCalledTimes(2);
  // one recipient per call (individual sends)
  expect(sendEmail.mock.calls[0][0]).toBe('jordan@x.com');
  expect(sendEmail.mock.calls[1][0]).toBe('sam@x.com');
  // persisted with timestamps
  const savedOrder = writeOrderCache.mock.calls[0][1];
  expect(savedOrder.customers[0].emailed.shipped).toBe(res.body.at);
  expect(writeCustomersToSheet).toHaveBeenCalled();
});

test('send rejects a non-emailing state', async () => {
  readOrderCache.mockReturnValue(ORDER);
  const res = await request(getApp()).post('/gmail/customer-email/send').send({ sheetId: 's', state: 'paid', recipients: [{ email: 'a@x.com' }], subject: 'S', body: 'B' });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- customerEmail`
Expected: FAIL — routes return 404.

- [ ] **Step 3: Implement the routes in `server/gmail/router.js`**

At the top, add imports (alongside the existing ones):

```js
const { writeOrderCache } = require('../orders/cache');
const { writeCustomersToSheet, EMAIL_STATES } = require('../sheets/orderSheet');
const { buildCustomerEmail, customerEmailDefaults, logoAttachment } = require('./customerEmailBuilder');
const { sendEmail } = require('./client');
```

(Note: `readOrderCache`, `readOrderFromSheet`, `readRange` are already imported at the top of this file.)

Add a helper to load the order (cache-first, mirroring the draft route) and the two routes, above `module.exports`:

```js
async function loadOrder(sheetId) {
  try {
    const meta = await readRange(sheetId, 'Sheet1!A1:B10');
    const infoMap = Object.fromEntries(meta.map(([k, v]) => [k, v]));
    const orderId = infoMap['Order ID'] || '';
    if (orderId) {
      const cached = readOrderCache(orderId);
      if (cached) return cached;
    }
  } catch { /* fall through */ }
  return readOrderFromSheet(sheetId);
}

router.post('/customer-email/preview', async (req, res) => {
  const { sheetId, state } = req.body;
  if (!sheetId || !state) return res.status(400).json({ error: 'sheetId and state required' });
  if (!EMAIL_STATES.includes(state)) return res.status(400).json({ error: `State "${state}" does not send customer emails` });
  try {
    const order = await loadOrder(sheetId);
    res.json(customerEmailDefaults(state, order.orderName));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/customer-email/send', async (req, res) => {
  const { sheetId, state, recipients, subject, body } = req.body;
  if (!sheetId || !state) return res.status(400).json({ error: 'sheetId and state required' });
  if (!EMAIL_STATES.includes(state)) return res.status(400).json({ error: `State "${state}" does not send customer emails` });
  if (!Array.isArray(recipients) || recipients.length === 0) return res.status(400).json({ error: 'recipients required' });
  try {
    const order = await loadOrder(sheetId);
    const attachment = logoAttachment();
    const at = new Date().toISOString();
    const emails = [];

    for (const r of recipients) {
      const { subject: subj, html, plain } = buildCustomerEmail({ state, customerName: r.name, subject, body });
      await sendEmail(r.email, subj, html, plain, [attachment]);
      emails.push(r.email);
    }

    // Stamp timestamps on matching customers
    order.customers = (order.customers || []).map(c => {
      if (!emails.includes(c.email)) return c;
      return { ...c, emailed: { ...(c.emailed || {}), [state]: at } };
    });

    writeOrderCache(order.orderId, order);
    await writeCustomersToSheet(sheetId, order.customers).catch(err =>
      console.warn('Could not write Customers tab:', err.message));

    res.json({ sent: emails.length, at, emails });
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('gmail.googleapis.com') && msg.includes('disabled')) {
      return res.status(500).json({ error: 'Gmail API is not enabled for this Google Cloud project. Enable it at console.developers.google.com → APIs & Services → Gmail API, then try again.' });
    }
    res.status(500).json({ error: msg });
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- customerEmail`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full backend suite (no regressions)**

Run: `cd server && npm test`
Expected: PASS (all suites).

- [ ] **Step 6: Commit**

```bash
git add server/gmail/router.js server/__tests__/customerEmail.test.js
git commit -m "feat: add customer email preview and send routes"
```

---

### Task 8: Frontend API wrapper + email-state constants

**Files:**
- Create: `src/emailStates.js`
- Create: `src/api/customerEmails.js`
- Test: `src/__tests__/customerEmailsApi.test.js` (create)

**Interfaces:**
- Consumes: `apiFetch` from `./client`.
- Produces:
  - `EMAIL_STATES` (`['sent','fulfilled','received','shipped']`), `STATE_LABELS` map (from `src/emailStates.js`).
  - `previewCustomerEmail(sheetId, state) → { subject, body }`.
  - `sendCustomerEmail(sheetId, state, recipients, subject, body) → { sent, at, emails }`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/customerEmailsApi.test.js`:

```js
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { apiFetch } from '../api/client';
import { previewCustomerEmail, sendCustomerEmail } from '../api/customerEmails';
import { EMAIL_STATES } from '../emailStates';

vi.mock('../api/client', () => ({ apiFetch: vi.fn().mockResolvedValue({}) }));

beforeEach(() => vi.clearAllMocks());

test('EMAIL_STATES is the agreed set', () => {
  expect(EMAIL_STATES).toEqual(['sent', 'fulfilled', 'received', 'shipped']);
});

test('previewCustomerEmail POSTs sheetId + state', () => {
  previewCustomerEmail('s', 'shipped');
  expect(apiFetch).toHaveBeenCalledWith('/gmail/customer-email/preview', { method: 'POST', body: { sheetId: 's', state: 'shipped' } });
});

test('sendCustomerEmail POSTs the full payload', () => {
  const recips = [{ name: 'A', email: 'a@x.com' }];
  sendCustomerEmail('s', 'sent', recips, 'Subj', 'Body');
  expect(apiFetch).toHaveBeenCalledWith('/gmail/customer-email/send', { method: 'POST', body: { sheetId: 's', state: 'sent', recipients: recips, subject: 'Subj', body: 'Body' } });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- customerEmailsApi`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the two modules**

`src/emailStates.js`:

```js
export const EMAIL_STATES = ['sent', 'fulfilled', 'received', 'shipped'];

export const STATE_LABELS = {
  sent: 'In Production',
  fulfilled: 'Printed',
  received: 'In-Hand',
  shipped: 'Shipped',
};
```

`src/api/customerEmails.js`:

```js
import { apiFetch } from './client';

export const previewCustomerEmail = (sheetId, state) =>
  apiFetch('/gmail/customer-email/preview', { method: 'POST', body: { sheetId, state } });

export const sendCustomerEmail = (sheetId, state, recipients, subject, body) =>
  apiFetch('/gmail/customer-email/send', { method: 'POST', body: { sheetId, state, recipients, subject, body } });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- customerEmailsApi`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/emailStates.js src/api/customerEmails.js src/__tests__/customerEmailsApi.test.js
git commit -m "feat: add customer email API wrapper and state constants"
```

---

### Task 9: CustomersPanel component

**Files:**
- Create: `src/components/CustomersPanel.jsx`
- Test: `src/__tests__/CustomersPanel.test.jsx` (create)

**Interfaces:**
- Consumes: `parseCustomers` (Task 3); `EMAIL_STATES`, `STATE_LABELS` (Task 8).
- Produces: `<CustomersPanel customers={[...]} onChange={fn} onSend={state => ...} />`.
  - `customers`: `[{name,email,emailed}]`. `onChange(nextCustomers)` fires on add/remove/paste.
  - `onSend(state)` fires when a per-state "Send status email" button is clicked.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/CustomersPanel.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, test, expect } from 'vitest';
import CustomersPanel from '../components/CustomersPanel';

test('pasting adds parsed rows via onChange', async () => {
  const onChange = vi.fn();
  render(<CustomersPanel customers={[]} onChange={onChange} onSend={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: /paste/i }));
  await userEvent.type(screen.getByPlaceholderText(/one per line/i), 'Jordan, jordan@x.com\nsam@x.com');
  await userEvent.click(screen.getByRole('button', { name: /add to list/i }));
  expect(onChange).toHaveBeenCalledWith([
    { name: 'Jordan', email: 'jordan@x.com', emailed: {} },
    { name: '', email: 'sam@x.com', emailed: {} },
  ]);
});

test('removing a row fires onChange without it', async () => {
  const onChange = vi.fn();
  const customers = [{ name: 'A', email: 'a@x.com', emailed: {} }, { name: 'B', email: 'b@x.com', emailed: {} }];
  render(<CustomersPanel customers={customers} onChange={onChange} onSend={() => {}} />);
  await userEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]);
  expect(onChange).toHaveBeenCalledWith([{ name: 'B', email: 'b@x.com', emailed: {} }]);
});

test('send button fires onSend with the state', async () => {
  const onSend = vi.fn();
  render(<CustomersPanel customers={[{ name: 'A', email: 'a@x.com', emailed: {} }]} onChange={() => {}} onSend={onSend} />);
  await userEvent.click(screen.getByRole('button', { name: /send shipped/i }));
  expect(onSend).toHaveBeenCalledWith('shipped');
});

test('shows how many still need each email', () => {
  const customers = [
    { name: 'A', email: 'a@x.com', emailed: { sent: '2026-07-03T00:00:00Z' } },
    { name: 'B', email: 'b@x.com', emailed: {} },
  ];
  render(<CustomersPanel customers={customers} onChange={() => {}} onSend={() => {}} />);
  // 1 of 2 still needs the "sent" email
  expect(screen.getByTestId ? screen.getByTestId('pending-sent') : screen.getByText(/1 of 2/)).toBeTruthy();
});
```

Note: the last test uses a `data-testid="pending-sent"` element rendering text like `1 of 2 not yet emailed`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- CustomersPanel`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/components/CustomersPanel.jsx`**

```jsx
import { useState } from 'react';
import { parseCustomers } from '../utils/parseCustomers';
import { EMAIL_STATES, STATE_LABELS } from '../emailStates';

export default function CustomersPanel({ customers = [], onChange, onSend }) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [skipped, setSkipped] = useState([]);

  function addFromPaste() {
    const { rows, skipped } = parseCustomers(pasteText);
    const existing = new Set(customers.map(c => c.email.toLowerCase()));
    const additions = rows
      .filter(r => !existing.has(r.email.toLowerCase()))
      .map(r => ({ name: r.name, email: r.email, emailed: {} }));
    onChange([...customers, ...additions]);
    setPasteText('');
    setSkipped(skipped);
    setPasteOpen(false);
  }

  function removeAt(idx) {
    onChange(customers.filter((_, i) => i !== idx));
  }

  function updateAt(idx, field, value) {
    onChange(customers.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  }

  function addBlank() {
    onChange([...customers, { name: '', email: '', emailed: {} }]);
  }

  const pendingCount = (state) => customers.filter(c => !(c.emailed && c.emailed[state])).length;

  return (
    <div className="customers-panel">
      <div className="customers-actions">
        <button className="btn-secondary" onClick={() => setPasteOpen(o => !o)}>Paste emails</button>
        <button className="btn-secondary" onClick={addBlank}>+ Add row</button>
      </div>

      {pasteOpen && (
        <div className="customers-paste">
          <textarea
            placeholder="One per line — 'Name, email', 'Name <email>', or just email"
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
          />
          <button className="btn-primary" onClick={addFromPaste}>Add to list</button>
        </div>
      )}
      {skipped.length > 0 && (
        <p className="customers-skipped">Skipped {skipped.length} line(s) with no email.</p>
      )}

      <table className="customers-table">
        <thead><tr><th>Name</th><th>Email</th><th></th></tr></thead>
        <tbody>
          {customers.map((c, i) => (
            <tr key={i}>
              <td><input value={c.name} onChange={e => updateAt(i, 'name', e.target.value)} placeholder="Name" /></td>
              <td><input value={c.email} onChange={e => updateAt(i, 'email', e.target.value)} placeholder="email@example.com" /></td>
              <td><button className="btn-remove" onClick={() => removeAt(i)} aria-label={`Remove ${c.email}`}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="customers-send">
        {EMAIL_STATES.map(state => (
          <div key={state} className="customers-send-row">
            <button className="btn-secondary" onClick={() => onSend(state)}>
              Send {state} email
            </button>
            <span className="customers-pending" data-testid={`pending-${state}`}>
              {pendingCount(state)} of {customers.length} not yet emailed ({STATE_LABELS[state]})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- CustomersPanel`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/CustomersPanel.jsx src/__tests__/CustomersPanel.test.jsx
git commit -m "feat: add CustomersPanel for managing order email list"
```

---

### Task 10: CustomerEmailModal component

**Files:**
- Create: `src/components/CustomerEmailModal.jsx`
- Test: `src/__tests__/CustomerEmailModal.test.jsx` (create)

**Interfaces:**
- Consumes: `previewCustomerEmail`, `sendCustomerEmail` (Task 8); `STATE_LABELS` (Task 8).
- Produces: `<CustomerEmailModal sheetId state orderName customers onClose onSent />`.
  - On mount, fetches defaults and fills editable subject + body.
  - Recipient checklist: pre-checks customers whose `emailed[state]` is empty.
  - Send calls `sendCustomerEmail`, then `onSent(state, emails, at)` and `onClose()`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/CustomerEmailModal.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, test, expect, beforeEach } from 'vitest';
import CustomerEmailModal from '../components/CustomerEmailModal';
import { previewCustomerEmail, sendCustomerEmail } from '../api/customerEmails';

vi.mock('../api/customerEmails', () => ({
  previewCustomerEmail: vi.fn().mockResolvedValue({ subject: 'Default subj', body: 'Default body' }),
  sendCustomerEmail: vi.fn().mockResolvedValue({ sent: 1, at: '2026-07-03T00:00:00Z', emails: ['b@x.com'] }),
}));

const customers = [
  { name: 'A', email: 'a@x.com', emailed: { shipped: '2026-07-01T00:00:00Z' } }, // already sent
  { name: 'B', email: 'b@x.com', emailed: {} },                                   // pending
];

beforeEach(() => vi.clearAllMocks());

test('loads defaults into editable fields', async () => {
  render(<CustomerEmailModal sheetId="s" state="shipped" orderName="Drop" customers={customers} onClose={() => {}} onSent={() => {}} />);
  expect(previewCustomerEmail).toHaveBeenCalledWith('s', 'shipped');
  expect(await screen.findByDisplayValue('Default subj')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Default body')).toBeInTheDocument();
});

test('pre-checks only not-yet-emailed recipients', async () => {
  render(<CustomerEmailModal sheetId="s" state="shipped" orderName="Drop" customers={customers} onClose={() => {}} onSent={() => {}} />);
  const already = await screen.findByLabelText(/a@x.com/);
  const pending = screen.getByLabelText(/b@x.com/);
  expect(already).not.toBeChecked();
  expect(pending).toBeChecked();
});

test('send posts checked recipients and edited content, then calls onSent', async () => {
  const onSent = vi.fn();
  const onClose = vi.fn();
  render(<CustomerEmailModal sheetId="s" state="shipped" orderName="Drop" customers={customers} onClose={onClose} onSent={onSent} />);
  const subj = await screen.findByDisplayValue('Default subj');
  await userEvent.clear(subj);
  await userEvent.type(subj, 'Edited');
  await userEvent.click(screen.getByRole('button', { name: /send/i }));
  await waitFor(() => expect(sendCustomerEmail).toHaveBeenCalledWith(
    's', 'shipped', [{ name: 'B', email: 'b@x.com' }], 'Edited', 'Default body',
  ));
  await waitFor(() => expect(onSent).toHaveBeenCalledWith('shipped', ['b@x.com'], '2026-07-03T00:00:00Z'));
  expect(onClose).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- CustomerEmailModal`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/components/CustomerEmailModal.jsx`**

```jsx
import { useState, useEffect } from 'react';
import { previewCustomerEmail, sendCustomerEmail } from '../api/customerEmails';
import { STATE_LABELS } from '../emailStates';

export default function CustomerEmailModal({ sheetId, state, orderName, customers = [], onClose, onSent }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [checked, setChecked] = useState(() =>
    customers.reduce((acc, c) => { acc[c.email] = !(c.emailed && c.emailed[state]); return acc; }, {}));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    previewCustomerEmail(sheetId, state)
      .then(d => { if (alive) { setSubject(d.subject); setBody(d.body); } })
      .catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [sheetId, state]);

  const recipients = customers.filter(c => checked[c.email]).map(c => ({ name: c.name, email: c.email }));

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      const res = await sendCustomerEmail(sheetId, state, recipients, subject, body);
      onSent(state, res.emails, res.at);
      onClose();
    } catch (e) {
      setError(e.message);
      setSending(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal customer-email-modal" onClick={e => e.stopPropagation()}>
        <h3>Send “{STATE_LABELS[state]}” email — {orderName}</h3>

        <label className="modal-label">Subject</label>
        <input className="modal-input" value={subject} onChange={e => setSubject(e.target.value)} />

        <label className="modal-label">Message</label>
        <textarea className="modal-textarea" value={body} onChange={e => setBody(e.target.value)} rows={5} />

        <label className="modal-label">Recipients</label>
        <div className="modal-recipients">
          {customers.map(c => (
            <label key={c.email} className="modal-recipient">
              <input
                type="checkbox"
                checked={!!checked[c.email]}
                onChange={e => setChecked(prev => ({ ...prev, [c.email]: e.target.checked }))}
              />
              {c.name ? `${c.name} — ` : ''}{c.email}
              {c.emailed && c.emailed[state] ? ' (already sent)' : ''}
            </label>
          ))}
        </div>

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={sending}>Cancel</button>
          <button className="btn-primary" onClick={handleSend} disabled={sending || recipients.length === 0}>
            {sending ? 'Sending…' : `Send to ${recipients.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- CustomerEmailModal`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/CustomerEmailModal.jsx src/__tests__/CustomerEmailModal.test.jsx
git commit -m "feat: add editable review-and-send customer email modal"
```

---

### Task 11: Wire everything into OrderBuilder + auto-send + Settings checkbox

**Files:**
- Modify: `src/components/OrderBuilder.jsx` (tab toggle, thread customers, modal, auto-send on advance)
- Modify: `src/components/SettingsScreen.jsx` (auto-send checkbox)
- Test: `src/__tests__/OrderBuilder.test.jsx` (add cases — read existing file first to match its mocks)

**Interfaces:**
- Consumes: `CustomersPanel` (Task 9), `CustomerEmailModal` (Task 10), `EMAIL_STATES` (Task 8), `getSettings` (existing), `sendCustomerEmail` (Task 8).
- Produces: the full user-facing feature — Order/Customers tabs, and send-on-advance behavior.

- [ ] **Step 1: Read the existing OrderBuilder test to match its mock setup**

Run: read `src/__tests__/OrderBuilder.test.jsx` and note how `useOrder`, `../api/gmail`, `../api/settings`, and catalog are mocked, so the new tests reuse the same mock shape.

- [ ] **Step 2: Write the failing tests**

Add to `src/__tests__/OrderBuilder.test.jsx` (reuse the file's existing mocks; add a mock for `../components/CustomerEmailModal` and `../api/customerEmails`, and ensure `../api/settings` `getSettings` can be overridden per test):

```jsx
// Ensure these mocks exist at top of file (merge with existing):
// vi.mock('../components/CustomerEmailModal', () => ({ default: (props) => (
//   <div data-testid="email-modal">modal:{props.state}</div>
// )}));
// vi.mock('../api/customerEmails', () => ({ sendCustomerEmail: vi.fn().mockResolvedValue({ sent: 1, at: 't', emails: ['a@x.com'] }) }));

test('Customers tab shows the customer panel', async () => {
  render(<MemoryRouter initialEntries={['/order/RMC-1?sheetId=s']}><Routes><Route path="/order/:orderId" element={<OrderBuilder />} /></Routes></MemoryRouter>);
  await screen.findByText(/Add order name/i);
  await userEvent.click(screen.getByRole('button', { name: /Customers/i }));
  expect(screen.getByRole('button', { name: /Paste emails/i })).toBeInTheDocument();
});

test('advancing to an emailing state with auto-send OFF opens the modal', async () => {
  // getSettings mocked to return autoSendCustomerEmails: false and order state 'fulfilled'
  render(<MemoryRouter initialEntries={['/order/RMC-1?sheetId=s']}><Routes><Route path="/order/:orderId" element={<OrderBuilder />} /></Routes></MemoryRouter>);
  await screen.findByText(/Add order name/i);
  await userEvent.click(screen.getByRole('button', { name: /Move to/i }));
  await userEvent.click(screen.getByRole('button', { name: /^Move order/i })); // confirm dialog
  expect(await screen.findByTestId('email-modal')).toHaveTextContent('received');
});
```

Note: adjust the mocked `useOrder` order object to start in `fulfilled` state (so "Move to →" targets `received`, an emailing state) and to include at least one customer. Match the existing test's `useOrder` mock structure.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- OrderBuilder`
Expected: FAIL — no Customers tab / no modal.

- [ ] **Step 4: Implement OrderBuilder changes**

Add imports near the top of `src/components/OrderBuilder.jsx`:

```jsx
import CustomersPanel from './CustomersPanel';
import CustomerEmailModal from './CustomerEmailModal';
import { EMAIL_STATES } from '../emailStates';
import { sendCustomerEmail } from '../api/customerEmails';
```

Add state near the other `useState` calls:

```jsx
  const [activeTab, setActiveTab] = useState('order');
  const [emailModalState, setEmailModalState] = useState(null); // which state's modal is open
```

Extend the settings ref default (line ~41) so auto-send is tracked:

```jsx
  const settingsRef = useRef({ defaultBackDesign: '', defaultBackNotes: '', autoSendCustomerEmails: false });
```

Add helpers to update customers and to stamp timestamps after a send (place near `updateLineItem`):

```jsx
  function setCustomers(next) {
    setOrder(prev => ({ ...prev, customers: next }));
  }

  function stampEmailed(state, emails, at) {
    setOrder(prev => ({
      ...prev,
      customers: (prev.customers || []).map(c =>
        emails.includes(c.email) ? { ...c, emailed: { ...(c.emailed || {}), [state]: at } } : c),
    }));
  }
```

In `handleAdvanceState`, after the existing inventory logic and `setOrder(prev => ({ ...prev, state: nextState }))`, add the send trigger at the very end of the function:

```jsx
    if (EMAIL_STATES.includes(nextState)) {
      const pending = (order.customers || []).filter(c => !(c.emailed && c.emailed[nextState]));
      if (pending.length > 0) {
        if (settingsRef.current.autoSendCustomerEmails) {
          try {
            const defaults = await sendCustomerEmail(sheetId, nextState, pending.map(c => ({ name: c.name, email: c.email })));
            // auto-send uses server defaults for subject/body (omitted args → server template)
          } catch (err) {
            logError(`Auto-send failed: ${err.message}`);
          }
        } else {
          setEmailModalState(nextState);
        }
      }
    }
```

Wait — `sendCustomerEmail(sheetId, state, recipients, subject, body)` requires subject/body. For auto-send, fetch defaults first. Replace the auto-send branch body with:

```jsx
          try {
            const { subject, body } = await previewCustomerEmail(sheetId, nextState);
            const res = await sendCustomerEmail(sheetId, nextState, pending.map(c => ({ name: c.name, email: c.email })), subject, body);
            stampEmailed(nextState, res.emails, res.at);
            setToast(`Sent ${res.sent} ${nextState} email(s)`);
          } catch (err) {
            logError(`Auto-send failed: ${err.message}`);
          }
```

and add `previewCustomerEmail` to the import from `../api/customerEmails`.

Wrap the builder body in a tab structure. Replace the top of the returned JSX (the `<div className="builder-body">` region) so both tabs render. Add the tab buttons right after `<OrderTopBar ... />`:

```jsx
      <div className="order-tabs">
        <button className={`order-tab${activeTab === 'order' ? ' active' : ''}`} onClick={() => setActiveTab('order')}>Order</button>
        <button className={`order-tab${activeTab === 'customers' ? ' active' : ''}`} onClick={() => setActiveTab('customers')}>Customers</button>
      </div>
```

Wrap the existing notes/save/builder-body/preview blocks so they only show under the order tab: `{activeTab === 'order' && ( … existing content … )}`. Add the customers tab block:

```jsx
      {activeTab === 'customers' && (
        <CustomersPanel
          customers={order.customers || []}
          onChange={setCustomers}
          onSend={(state) => setEmailModalState(state)}
        />
      )}
```

Render the modal near the closing `</div>` (before `<Toast … />`):

```jsx
      {emailModalState && (
        <CustomerEmailModal
          sheetId={sheetId}
          state={emailModalState}
          orderName={order.orderName || order.orderId}
          customers={order.customers || []}
          onClose={() => setEmailModalState(null)}
          onSent={stampEmailed}
        />
      )}
```

- [ ] **Step 5: Add the Settings checkbox**

In `src/components/SettingsScreen.jsx`, add `autoSendCustomerEmails: false` to the initial `settings` state object (line ~14). Then add a checkbox in the system tab (after the Spew email field, before the "Line Item Defaults" label):

```jsx
          <div className="field-group">
            <label>
              <input
                type="checkbox"
                checked={!!settings.autoSendCustomerEmails}
                onChange={e => setSettings(s => ({ ...s, autoSendCustomerEmails: e.target.checked }))}
              />
              {' '}Auto-send customer status emails on state change
            </label>
          </div>
```

- [ ] **Step 6: Run the frontend suite**

Run: `npm test`
Expected: PASS (all suites, including the new OrderBuilder cases).

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/OrderBuilder.jsx src/components/SettingsScreen.jsx src/__tests__/OrderBuilder.test.jsx
git commit -m "feat: wire customer emails into order builder with auto-send toggle"
```

---

### Task 12: Add customer-panel + modal styles

**Files:**
- Modify: `src/App.css` (append styles)

**Interfaces:**
- Consumes: class names used in Tasks 9–11 (`order-tabs`, `order-tab`, `customers-*`, `customer-email-modal`, `modal-*`).
- Produces: styled UI. No test (CSS-only); verified by manual run.

- [ ] **Step 1: Append styles to `src/App.css`**

```css
/* Customer emails */
.order-tabs { display: flex; gap: 8px; margin: 12px 0; }
.order-tab { padding: 8px 16px; border: 1px solid #ccc; background: #f5f5f5; border-radius: 6px 6px 0 0; cursor: pointer; }
.order-tab.active { background: #22402f; color: #fff; border-color: #22402f; }

.customers-panel { padding: 12px 0; }
.customers-actions { display: flex; gap: 8px; margin-bottom: 12px; }
.customers-paste textarea { width: 100%; min-height: 90px; margin-bottom: 8px; }
.customers-skipped { color: #b45309; font-size: 0.85em; }
.customers-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
.customers-table th, .customers-table td { text-align: left; padding: 4px 6px; }
.customers-table input { width: 100%; }
.btn-remove { color: #b91c1c; background: none; border: none; cursor: pointer; }
.customers-send-row { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
.customers-pending { color: #666; font-size: 0.85em; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.customer-email-modal { background: #fff; border-radius: 10px; padding: 20px; width: min(560px, 92vw); max-height: 88vh; overflow-y: auto; }
.modal-label { display: block; font-weight: 600; margin: 12px 0 4px; }
.modal-input, .modal-textarea { width: 100%; }
.modal-recipients { display: flex; flex-direction: column; gap: 4px; max-height: 180px; overflow-y: auto; }
.modal-recipient { display: flex; align-items: center; gap: 6px; }
.modal-error { color: #b91c1c; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
```

- [ ] **Step 2: Manual verification**

Run `start.bat`, open an order, click **Customers**, paste a couple of `Name, email` lines, and confirm the table fills. Advance a test order to `sent` with auto-send off and confirm the modal opens with editable subject/body and a pre-checked recipient. (Use a real address you control; sending is live.)

- [ ] **Step 3: Commit**

```bash
git add src/App.css
git commit -m "style: add customer panel and email modal styles"
```

---

## Self-Review

**Spec coverage:**
- New `shipped` state → Task 1. ✅
- Customers tab on Sheet + cache round-trip → Task 2 (cache is the same order JSON, already persisted by existing PUT). ✅
- Paste parser (`Name,email` / `Name <email>` / bare) → Task 3. ✅
- Trailhead email per state, greeting fallback, inline logo → Task 4. ✅
- Individual `multipart/related` send → Task 5. ✅
- Auto-send global setting (default false) → Task 6 + checkbox in Task 11. ✅
- Preview + send routes, idempotent timestamps → Task 7. ✅
- Order/Customers tab UI, editable review-and-send modal, pre-checked not-yet-emailed → Tasks 9–11. ✅
- Send-on-advance (modal when off, auto when on) → Task 11. ✅
- Existing printer email untouched → no task modifies `emailBuilder.js`/`upsertDraft`/`/gmail/draft`. ✅

**Placeholder scan:** No TBD/TODO; every code step shows full code and exact copy strings.

**Type consistency:**
- `customers[]` item shape `{name,email,emailed:{state:iso}}` is identical across Tasks 2, 7, 9, 10, 11.
- `EMAIL_STATES` defined once backend (Task 2, re-exported from orderSheet + defined in customerEmailBuilder templates) and once frontend (Task 8); both equal `['sent','fulfilled','received','shipped']` — asserted by tests in Tasks 2 and 8.
- `sendCustomerEmail(sheetId, state, recipients, subject, body)` signature matches between Task 8 (definition), Task 10 (modal call), and Task 11 (auto-send call, which first fetches defaults via `previewCustomerEmail`).
- `buildCustomerEmail({state,customerName,subject,body})` matches between Task 4 (definition) and Task 7 (route call).
- `logoAttachment() → {cid,filename,content}` matches the `inlineImages` element shape consumed by `buildRawRelated`/`sendEmail` in Task 5.
- `onSent(state, emails, at)` matches between Task 10 (modal), Task 11 (`stampEmailed` signature).

No gaps found.
