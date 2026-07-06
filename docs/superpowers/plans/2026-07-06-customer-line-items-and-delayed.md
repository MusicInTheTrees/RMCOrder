# Customer-linked Line Items + Delayed State — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link each order line item to a customer and describe their items in status emails, merge identical line items into single rows for the printer, add a Delayed side-state, and reduce customer emails to Sent/Shipped/Delayed — plus fix the bulk-CSV entry.

**Architecture:** Pure merge/format helpers are mirrored on the client (ESM, vitest) and server (CommonJS, jest) since the two runtimes can't share a module — the repo already duplicates `formatSizes` this way. Line-item→customer links live on each line item (`customerEmail`) and round-trip through the `Line Items` sheet tab. The printer email and the on-screen preview both compile line items through the same-shaped helper so they agree. Delayed is a side-state (not in the linear state order) with its own button and exit chooser.

**Tech Stack:** React (vite), React Router, Express, Google Sheets/Gmail APIs. Tests: vitest (frontend, `npm test`), jest (server, `cd server && npm test`).

## Global Constraints

- Email-sending states are EXACTLY `['sent', 'shipped', 'delayed']` everywhere `EMAIL_STATES` is defined (`src/emailStates.js`, `server/sheets/orderSheet.js`, `server/gmail/statusEmailStore.js`).
- `fulfilled` and `received` remain valid workflow states (in `STATE_ORDER` and `StateBadge`) but never send customer emails.
- Line-item merge signature = item type + color + front designs + back designs + front method + back method + front notes + back notes. Differing notes PREVENT a merge. `customerEmail` is never part of the signature.
- Exactly one customer per line item (email is the stable key).
- Customer-facing item description uses the **front** design name only; back designs are omitted.
- Size display format is `Label×qty` joined by `, ` (e.g. `M×2, L×1`), only sizes with `total > 0`.
- Dropping historical `Sent: fulfilled` / `Sent: received` timestamps from the Customers sheet on next save is accepted.
- Conventional-commit messages. Commit after each task. End commit messages with the Co-Authored-By trailer already used in this repo.

---

### Task 1: Server line-item merge helper

**Files:**
- Create: `server/gmail/compileLineItems.js`
- Test: `server/__tests__/compileLineItems.test.js`

**Interfaces:**
- Produces: `compileLineItems(lineItems: Array) => Array<mergedItem>` where `mergedItem` carries all signature fields unchanged plus `nums: string[]` (contributing line numbers, input order) and `sizes` summed per label as `{ total, inventory }`. Item type is read as `itemTypeName || apparelType`.

- [ ] **Step 1: Write the failing test**

```javascript
// server/__tests__/compileLineItems.test.js
const { compileLineItems } = require('../gmail/compileLineItems');

const base = (over) => ({
  num: '01', itemTypeName: 'Tank', color: 'Gray',
  frontDesigns: [{ designNum: '1', file: 'BlueNeon' }], backDesigns: [],
  frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
  sizes: { M: { total: 1, inventory: 0 } }, ...over,
});

test('merges identical items and sums sizes', () => {
  const out = compileLineItems([
    base({ num: '01', sizes: { M: { total: 1, inventory: 0 } } }),
    base({ num: '02', sizes: { M: { total: 1, inventory: 0 } } }),
    base({ num: '03', sizes: { L: { total: 1, inventory: 0 } } }),
  ]);
  expect(out).toHaveLength(1);
  expect(out[0].nums).toEqual(['01', '02', '03']);
  expect(out[0].sizes).toEqual({ M: { total: 2, inventory: 0 }, L: { total: 1, inventory: 0 } });
});

test('different back designs stay separate', () => {
  const out = compileLineItems([
    base({ num: '01' }),
    base({ num: '02', backDesigns: [{ designNum: '1', file: 'Logo' }] }),
  ]);
  expect(out).toHaveLength(2);
});

test('different notes prevent a merge', () => {
  const out = compileLineItems([
    base({ num: '01', frontNotes: 'center' }),
    base({ num: '02', frontNotes: 'left chest' }),
  ]);
  expect(out).toHaveLength(2);
});

test('sums inventory independently and blanks merge on type+color', () => {
  const out = compileLineItems([
    { num: '01', itemTypeName: 'Tank', color: 'Gray', frontDesigns: [], backDesigns: [],
      frontMethod: '', backMethod: '', frontNotes: '', backNotes: '',
      sizes: { M: { total: 2, inventory: 1 } } },
    { num: '02', itemTypeName: 'Tank', color: 'Gray', frontDesigns: [], backDesigns: [],
      frontMethod: '', backMethod: '', frontNotes: '', backNotes: '',
      sizes: { M: { total: 1, inventory: 1 } } },
  ]);
  expect(out).toHaveLength(1);
  expect(out[0].sizes.M).toEqual({ total: 3, inventory: 2 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest __tests__/compileLineItems.test.js`
Expected: FAIL — "Cannot find module '../gmail/compileLineItems'"

- [ ] **Step 3: Write minimal implementation**

```javascript
// server/gmail/compileLineItems.js
function typeOf(item) { return item.itemTypeName || item.apparelType || ''; }
function files(list) { return (list || []).map(d => d.file); }

function signatureOf(item) {
  return JSON.stringify([
    typeOf(item), item.color || '',
    files(item.frontDesigns), files(item.backDesigns),
    item.frontMethod || '', item.backMethod || '',
    item.frontNotes || '', item.backNotes || '',
  ]);
}

// Merge line items sharing an identical print-job signature, summing sizes.
// customerEmail is intentionally ignored. Input order is preserved.
function compileLineItems(lineItems) {
  const bySig = new Map();
  for (const item of lineItems || []) {
    const sig = signatureOf(item);
    let merged = bySig.get(sig);
    if (!merged) {
      merged = {
        nums: [], itemTypeName: item.itemTypeName || '', apparelType: item.apparelType || '',
        color: item.color || '',
        frontDesigns: item.frontDesigns || [], backDesigns: item.backDesigns || [],
        frontMethod: item.frontMethod || '', backMethod: item.backMethod || '',
        frontNotes: item.frontNotes || '', backNotes: item.backNotes || '',
        sizes: {},
      };
      bySig.set(sig, merged);
    }
    merged.nums.push(item.num);
    for (const [label, v] of Object.entries(item.sizes || {})) {
      if (!merged.sizes[label]) merged.sizes[label] = { total: 0, inventory: 0 };
      merged.sizes[label].total += v?.total ?? 0;
      merged.sizes[label].inventory += v?.inventory ?? 0;
    }
  }
  return [...bySig.values()];
}

module.exports = { compileLineItems, signatureOf };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest __tests__/compileLineItems.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add server/gmail/compileLineItems.js server/__tests__/compileLineItems.test.js
git commit -m "feat: add server line-item merge helper"
```

---

### Task 2: Client line-item merge helper (mirror)

**Files:**
- Create: `src/utils/compileLineItems.js`
- Test: `src/__tests__/compileLineItems.test.js`

**Interfaces:**
- Produces: `compileLineItems(lineItems) => Array<mergedItem>` — identical behavior/shape to Task 1, ESM export.

- [ ] **Step 1: Write the failing test**

```javascript
// src/__tests__/compileLineItems.test.js
import { describe, test, expect } from 'vitest';
import { compileLineItems } from '../utils/compileLineItems';

const base = (over) => ({
  num: '01', itemTypeName: 'Tank', color: 'Gray',
  frontDesigns: [{ designNum: '1', file: 'BlueNeon' }], backDesigns: [],
  frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
  sizes: { M: { total: 1, inventory: 0 } }, ...over,
});

describe('compileLineItems (client)', () => {
  test('merges identical items and sums sizes', () => {
    const out = compileLineItems([
      base({ num: '01' }), base({ num: '02' }),
      base({ num: '03', sizes: { L: { total: 1, inventory: 0 } } }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].nums).toEqual(['01', '02', '03']);
    expect(out[0].sizes).toEqual({ M: { total: 2, inventory: 0 }, L: { total: 1, inventory: 0 } });
  });
  test('different notes prevent a merge', () => {
    const out = compileLineItems([base({ num: '01', frontNotes: 'a' }), base({ num: '02', frontNotes: 'b' })]);
    expect(out).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/compileLineItems.test.js`
Expected: FAIL — cannot resolve `../utils/compileLineItems`

- [ ] **Step 3: Write minimal implementation**

Copy the Task 1 body verbatim, converting to ESM (`export function`):

```javascript
// src/utils/compileLineItems.js
function typeOf(item) { return item.itemTypeName || item.apparelType || ''; }
function files(list) { return (list || []).map(d => d.file); }

export function signatureOf(item) {
  return JSON.stringify([
    typeOf(item), item.color || '',
    files(item.frontDesigns), files(item.backDesigns),
    item.frontMethod || '', item.backMethod || '',
    item.frontNotes || '', item.backNotes || '',
  ]);
}

export function compileLineItems(lineItems) {
  const bySig = new Map();
  for (const item of lineItems || []) {
    const sig = signatureOf(item);
    let merged = bySig.get(sig);
    if (!merged) {
      merged = {
        nums: [], itemTypeName: item.itemTypeName || '', apparelType: item.apparelType || '',
        color: item.color || '',
        frontDesigns: item.frontDesigns || [], backDesigns: item.backDesigns || [],
        frontMethod: item.frontMethod || '', backMethod: item.backMethod || '',
        frontNotes: item.frontNotes || '', backNotes: item.backNotes || '',
        sizes: {},
      };
      bySig.set(sig, merged);
    }
    merged.nums.push(item.num);
    for (const [label, v] of Object.entries(item.sizes || {})) {
      if (!merged.sizes[label]) merged.sizes[label] = { total: 0, inventory: 0 };
      merged.sizes[label].total += v?.total ?? 0;
      merged.sizes[label].inventory += v?.inventory ?? 0;
    }
  }
  return [...bySig.values()];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/compileLineItems.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/compileLineItems.js src/__tests__/compileLineItems.test.js
git commit -m "feat: add client line-item merge helper"
```

---

### Task 3: Reduce email states to Sent / Shipped / Delayed

**Files:**
- Modify: `src/emailStates.js`
- Modify: `src/components/StateBadge.jsx:1-9` (add `delayed` color)
- Modify: `server/sheets/orderSheet.js:3`
- Modify: `server/gmail/statusEmailStore.js:5`
- Modify: `server/gmail/customerEmailBuilder.js:10-43` (PILLS, STATUS_LABELS, DEFAULT_TEMPLATES)
- Modify (tests): `server/__tests__/orderSheet.test.js`, `server/__tests__/customerEmailBuilder.test.js`

**Interfaces:**
- Produces: `EMAIL_STATES === ['sent','shipped','delayed']` on both client and server; `DEFAULT_TEMPLATES.delayed`, `PILLS.delayed`, `STATUS_LABELS.delayed` exist; `STATE_COLORS.delayed` exists.

- [ ] **Step 1: Update the failing tests first (they encode the old set)**

In `server/__tests__/orderSheet.test.js`, replace the three old-column expectations:

```javascript
// EMAIL_STATES assertion
test('EMAIL_STATES is the agreed set', () => {
  expect(EMAIL_STATES).toEqual(['sent', 'shipped', 'delayed']);
});
```

Update the Customers header/row expectations in `writeOrderToSheet writes the Customers tab`:

```javascript
  expect(rows[0]).toEqual(['Name', 'Email', 'Sent: sent', 'Sent: shipped', 'Sent: delayed']);
  expect(rows[1]).toEqual(['Jordan', 'jordan@x.com', '2026-07-03T00:00:00Z', '', '']);
  expect(rows[2]).toEqual(['', 'sam@x.com', '', '', '']);
```

Update `readOrderFromSheet reads the Customers tab` mock + expectation:

```javascript
    if (range.startsWith('Customers')) return Promise.resolve([
      ['Name', 'Email', 'Sent: sent', 'Sent: shipped', 'Sent: delayed'],
      ['Jordan', 'jordan@x.com', '2026-07-03T00:00:00Z', '', ''],
    ]);
  // ...
  expect(order.customers).toEqual([
    { name: 'Jordan', email: 'jordan@x.com', emailed: { sent: '2026-07-03T00:00:00Z', shipped: '', delayed: '' } },
  ]);
```

Update `writeCustomersToSheet writes only the Customers tab` expectation (shipped is now index 3):

```javascript
  expect(call[2][1]).toEqual(['A', 'a@x.com', '', '2026-07-03T00:00:00Z', '']);
```

In `server/__tests__/customerEmailBuilder.test.js`, update the subjects loop:

```javascript
test('default subjects contain no emoji', () => {
  for (const state of ['sent', 'shipped', 'delayed']) {
    expect(DEFAULT_TEMPLATES[state].subject).toBe(stripEmoji(DEFAULT_TEMPLATES[state].subject));
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest __tests__/orderSheet.test.js __tests__/customerEmailBuilder.test.js`
Expected: FAIL — current code still uses the 4-state set.

- [ ] **Step 3: Implement the source changes**

`src/emailStates.js` — full new contents:

```javascript
export const EMAIL_STATES = ['sent', 'shipped', 'delayed'];

export const STATE_LABELS = {
  sent: 'In Production',
  shipped: 'Shipped',
  delayed: 'Delayed',
};
```

`src/components/StateBadge.jsx` — add one line to `STATE_COLORS`:

```javascript
  shipped:   '#14b8a6',
  delayed:   '#f59e0b',
```

`server/sheets/orderSheet.js` line 3:

```javascript
const EMAIL_STATES = ['sent', 'shipped', 'delayed'];
```

`server/gmail/statusEmailStore.js` line 5:

```javascript
const EMAIL_STATES = ['sent', 'shipped', 'delayed'];
```

`server/gmail/customerEmailBuilder.js` — replace `PILLS`, `STATUS_LABELS`, and `DEFAULT_TEMPLATES` with:

```javascript
const PILLS = {
  sent: '🖨️ In Production',
  shipped: '📦 Shipped',
  delayed: '⏳ Delayed',
};
const STATUS_LABELS = {
  sent: 'In Production',
  shipped: 'Shipped',
  delayed: 'Delayed',
};

const DEFAULT_TEMPLATES = {
  sent: {
    subject: 'Your RMC order is being made',
    body: `Hello [customer name],\n\nYour order "[order name]" is now with our print shop getting made. We'll keep you posted as it moves along. Thanks for repping the Meowtain! 🐱`,
  },
  shipped: {
    subject: 'Your RMC order is on its way!',
    body: `Hello [customer name],\n\nYour order "[order name]" just left the den. Keep an eye out — your gear should reach you soon. Thanks for repping the Meowtain! 🐱`,
  },
  delayed: {
    subject: 'A quick update on your RMC order',
    body: `Hello [customer name],\n\nYour order "[order name]" is running a little behind schedule. We're sorry for the wait and are working to get it moving again — we'll let you know as soon as it's back on track. Thanks for your patience! 🐾`,
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest __tests__/orderSheet.test.js __tests__/customerEmailBuilder.test.js` then `npx vitest run src/__tests__` from the repo root.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/emailStates.js src/components/StateBadge.jsx server/sheets/orderSheet.js server/gmail/statusEmailStore.js server/gmail/customerEmailBuilder.js server/__tests__/orderSheet.test.js server/__tests__/customerEmailBuilder.test.js
git commit -m "feat: reduce customer email states to sent/shipped/delayed"
```

---

### Task 4: Compile identical line items in the printer email

**Files:**
- Modify: `server/gmail/emailBuilder.js`
- Test: `server/__tests__/emailBuilder.test.js` (create)

**Interfaces:**
- Consumes: `compileLineItems` (Task 1).
- Produces: `buildEmailHtml`/`buildEmailPlainText` render one row per merged signature, with the `#` cell showing contributing numbers joined by `, `.

- [ ] **Step 1: Write the failing test**

```javascript
// server/__tests__/emailBuilder.test.js
const { buildEmailHtml, buildEmailPlainText } = require('../gmail/emailBuilder');

const order = {
  orderId: 'RMC-001', orderName: 'Drop', notes: '',
  lineItems: [
    { num: '01', itemTypeName: 'Tank', color: 'Gray', frontDesigns: [{ designNum: '1', file: 'BlueNeon' }],
      backDesigns: [], frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
      sizes: { M: { total: 1, inventory: 0 } } },
    { num: '02', itemTypeName: 'Tank', color: 'Gray', frontDesigns: [{ designNum: '1', file: 'BlueNeon' }],
      backDesigns: [], frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
      sizes: { M: { total: 1, inventory: 0 } } },
    { num: '03', itemTypeName: 'Tank', color: 'Gray', frontDesigns: [{ designNum: '1', file: 'BlueNeon' }],
      backDesigns: [], frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
      sizes: { L: { total: 1, inventory: 0 } } },
  ],
};

test('printer HTML merges identical items into one row with summed sizes', () => {
  const html = buildEmailHtml(order, {}, {});
  // one merged data row -> exactly one <tr> after the header row inside the table
  const bodyRows = html.split('<tr>').length - 1; // header + 1 data row = 2
  expect(bodyRows).toBe(2);
  expect(html).toContain('M×2');
  expect(html).toContain('L×1');
  expect(html).toContain('01, 02, 03');
});

test('printer plain text merges identical items', () => {
  const text = buildEmailPlainText(order, {}, {});
  expect(text).toContain('M×2');
  expect(text).toContain('L×1');
  expect(text).toContain('#01, 02, 03');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest __tests__/emailBuilder.test.js`
Expected: FAIL — currently three separate rows, no `M×2`.

- [ ] **Step 3: Implement**

At the top of `server/gmail/emailBuilder.js` add:

```javascript
const { compileLineItems } = require('./compileLineItems');
```

Change `formatSizes` to the compact form used elsewhere (so merged output reads `M×2, L×1`):

```javascript
function formatSizes(sizes) {
  return Object.entries(sizes || {})
    .filter(([, v]) => (v?.total ?? 0) > 0)
    .map(([label, v]) => `${label}×${v.total}`)
    .join(', ');
}
```

In `buildEmailHtml`, compile before grouping and render `nums`:

```javascript
  const allItems = orderData.lineItems || [];
  const printItems = compileLineItems(allItems.filter(i => !isBlank(i)));
  const groups = groupByCategory(printItems);
  const blankItems = compileLineItems(allItems.filter(isBlank));
```

and in the print-item row, replace `<td>${item.num}</td>` with:

```javascript
        <td>${item.nums.join(', ')}</td>
```

and in the blank-item row likewise replace `${item.num}` with `${item.nums.join(', ')}`.

Apply the same three changes in `buildEmailPlainText`: compile `printItems`/`blankItems`, and replace `#${item.num}` with `#${item.nums.join(', ')}` in both the print-item and blank-item lines.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest __tests__/emailBuilder.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add server/gmail/emailBuilder.js server/__tests__/emailBuilder.test.js
git commit -m "feat: merge identical line items in printer email"
```

---

### Task 5: Extract on-screen preview into a compiled util

**Files:**
- Create: `src/utils/buildOrderPreviewText.js`
- Modify: `src/components/OrderBuilder.jsx` (replace inline `handleGeneratePreview` body with a call to the util)
- Test: `src/__tests__/buildOrderPreviewText.test.js`

**Interfaces:**
- Consumes: `compileLineItems` (Task 2).
- Produces: `buildOrderPreviewText(order) => string` — the printer-preview text, with merged rows.

- [ ] **Step 1: Write the failing test**

```javascript
// src/__tests__/buildOrderPreviewText.test.js
import { describe, test, expect } from 'vitest';
import { buildOrderPreviewText } from '../utils/buildOrderPreviewText';

const order = {
  orderId: 'RMC-001', orderName: 'Drop', notes: '',
  lineItems: [
    { num: '01', itemTypeName: 'Tank', color: 'Gray', frontDesigns: [{ designNum: '1', file: 'BlueNeon' }],
      backDesigns: [], frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
      sizes: { M: { total: 1, inventory: 0 } } },
    { num: '02', itemTypeName: 'Tank', color: 'Gray', frontDesigns: [{ designNum: '1', file: 'BlueNeon' }],
      backDesigns: [], frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
      sizes: { L: { total: 1, inventory: 0 } } },
  ],
};

describe('buildOrderPreviewText', () => {
  test('merges identical items and shows contributing numbers', () => {
    const text = buildOrderPreviewText(order);
    expect(text).toContain('Tank');
    expect(text).toContain('M: 1');
    expect(text).toContain('L: 1');
    expect(text).toContain('#01, 02');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/buildOrderPreviewText.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the util (moving the existing logic, compiled)**

```javascript
// src/utils/buildOrderPreviewText.js
import { compileLineItems } from './compileLineItems';

function formatSizes(sizes) {
  return Object.entries(sizes || {})
    .filter(([, v]) => (v?.total ?? 0) > 0)
    .map(([label, v]) => {
      const total = v.total, inv = v.inventory ?? 0, toOrder = total - inv;
      if (inv > 0 && toOrder > 0) return `${label}: ${total} (${inv} from stock, order ${toOrder})`;
      if (inv === total && total > 0) return `${label}: ${total} (all from stock)`;
      return `${label}: ${total}`;
    })
    .join(', ');
}

const isBlank = i => (i.frontDesigns || []).length === 0 && (i.backDesigns || []).length === 0;

export function buildOrderPreviewText(order) {
  const allItems = order.lineItems || [];
  const printItems = compileLineItems(allItems.filter(i => !isBlank(i)));
  const blankItems = compileLineItems(allItems.filter(isBlank));
  const title = order.orderName
    ? `RMC Order: ${order.orderName} (${order.orderId})`
    : `${order.orderId} — Order Request`;
  let text = `${title}\n\n`;
  if (order.notes) text += `Order Notes: ${order.notes}\n\n`;

  const groups = {};
  for (const item of printItems) {
    const cat = item.itemTypeName || item.apparelType || 'Other';
    (groups[cat] = groups[cat] || []).push(item);
  }
  for (const [category, items] of Object.entries(groups)) {
    text += `${category}\n${'—'.repeat(category.length)}\n`;
    for (const item of items) {
      text += `• #${item.nums.join(', ')} | ${item.color || ''} | ${formatSizes(item.sizes)}\n`;
      const frontList = (item.frontDesigns || []).map(d => `  ${d.file}`).join('\n');
      if (item.frontMethod) text += `  Front method: ${item.frontMethod}\n`;
      if (frontList) text += `  Front:\n${frontList}\n`;
      if (item.frontNotes) text += `  Front notes: ${item.frontNotes}\n`;
      const backList = (item.backDesigns || []).map(d => `  ${d.file}`).join('\n');
      if (item.backMethod) text += `  Back method: ${item.backMethod}\n`;
      if (backList) text += `  Back:\n${backList}\n`;
      if (item.backNotes) text += `  Back notes: ${item.backNotes}\n`;
    }
    text += '\n';
  }
  if (blankItems.length > 0) {
    text += `Blank Items (no decoration)\n${'—'.repeat(26)}\n`;
    for (const item of blankItems) {
      text += `• #${item.nums.join(', ')} | ${item.itemTypeName || item.apparelType || ''} | ${item.color || ''} | ${formatSizes(item.sizes)}\n`;
    }
    text += '\n';
  }
  if (order.folderId) text += `Order folder (design files):\nhttps://drive.google.com/drive/folders/${order.folderId}\n`;
  if (order.sheetId) text += `Order sheet:\nhttps://docs.google.com/spreadsheets/d/${order.sheetId}\n`;
  return text;
}
```

- [ ] **Step 4: Wire it into `OrderBuilder.jsx`**

Add the import near the other util imports:

```javascript
import { buildOrderPreviewText } from '../utils/buildOrderPreviewText';
```

Replace the entire `handleGeneratePreview` function body (lines 168-220) with:

```javascript
  function handleGeneratePreview() {
    setPreviewText(buildOrderPreviewText(order));
  }
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run src/__tests__/buildOrderPreviewText.test.js`
Expected: PASS. Also run `npm run lint` to confirm no now-unused imports remain in `OrderBuilder.jsx`.

- [ ] **Step 6: Commit**

```bash
git add src/utils/buildOrderPreviewText.js src/__tests__/buildOrderPreviewText.test.js src/components/OrderBuilder.jsx
git commit -m "feat: merge identical items in on-screen order preview"
```

---

### Task 6: Persist line-item customerEmail + order delayedFrom on the sheet

**Files:**
- Modify: `server/sheets/orderSheet.js`
- Test: `server/__tests__/orderSheet.test.js` (add cases)

**Interfaces:**
- Produces: `Line Items` header gains trailing `Customer Email` column; line items carry `customerEmail`. `Sheet1` gains a `Delayed From` row; order carries `delayedFrom`.

- [ ] **Step 1: Write the failing tests**

Add to `server/__tests__/orderSheet.test.js`:

```javascript
test('writeOrderToSheet writes Customer Email column and Delayed From', async () => {
  clearRange.mockResolvedValue(); writeRange.mockResolvedValue();
  const order = {
    orderId: 'RMC-9', state: 'delayed', created: '2026-07-06', delayedFrom: 'sent', sheetId: 's',
    lineItems: [{ num: '01', itemTypeName: 'Tank', color: 'Gray', sizes: { M: { total: 1, inventory: 0 } },
      frontMethod: '', frontNotes: '', backMethod: '', backNotes: '', frontDesigns: [], backDesigns: [],
      itemTypeId: 't1', customerEmail: 'jane@x.com' }],
  };
  await writeOrderToSheet('s', order);
  const liCall = writeRange.mock.calls.find(c => c[1].includes('Line Items'));
  expect(liCall[2][0]).toContain('Customer Email');
  expect(liCall[2][1][liCall[2][0].indexOf('Customer Email')]).toBe('jane@x.com');
  const infoCall = writeRange.mock.calls.find(c => c[1].includes('Sheet1'));
  expect(infoCall[2]).toContainEqual(['Delayed From', 'sent']);
});

test('readOrderFromSheet reads customerEmail and delayedFrom', async () => {
  readRange.mockImplementation((sheetId, range) => {
    if (range.startsWith('Sheet1')) return Promise.resolve([
      ['Order ID', 'RMC-9'], ['State', 'delayed'], ['Sheet ID', 's'], ['Delayed From', 'sent'],
    ]);
    if (range.includes('Line Items')) return Promise.resolve([
      ['#', 'Item Type', 'Color', 'Sizes', 'Front Method', 'Front Notes', 'Back Method', 'Back Notes', 'Item Type ID', 'Customer Email'],
      ['01', 'Tank', 'Gray', 'M×1', '', '', '', '', 't1', 'jane@x.com'],
    ]);
    if (range.startsWith('Designs')) return Promise.resolve([]);
    return Promise.resolve([]);
  });
  const order = await readOrderFromSheet('s');
  expect(order.delayedFrom).toBe('sent');
  expect(order.lineItems[0].customerEmail).toBe('jane@x.com');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest __tests__/orderSheet.test.js`
Expected: FAIL — no Customer Email column / delayedFrom.

- [ ] **Step 3: Implement**

In `writeOrderToSheet`, extend the Sheet1 info write to 10 rows and widen the ranges:

```javascript
  await clearRange(sheetId, 'Sheet1!A1:B11');
  await writeRange(sheetId, 'Sheet1!A1:B10', [
    ['Order ID',     orderData.orderId],
    ['Order Name',   orderData.orderName || ''],
    ['State',        orderData.state],
    ['Created',      orderData.created],
    ['Last Updated', new Date().toISOString().slice(0, 10)],
    ['Notes',        orderData.notes || ''],
    ['Sheet ID',     orderData.sheetId || ''],
    ['Draft ID',     orderData.draftId || ''],
    ['Folder ID',    orderData.folderId || ''],
    ['Delayed From', orderData.delayedFrom || ''],
  ]);
```

Add `Customer Email` to the header and each row:

```javascript
  const liHeader = ['#', 'Item Type', 'Color', 'Sizes', 'Front Method', 'Front Notes', 'Back Method', 'Back Notes', 'Item Type ID', 'Customer Email'];
```

and append to the pushed line-item row (after `item.itemTypeId || ''`):

```javascript
      item.itemTypeId || '',
      item.customerEmail || '',
```

The `<num>-inv` helper row must keep the same column count — leave it as-is (trailing columns default empty); no change needed.

In `readOrderFromSheet`, widen the info read and capture the field:

```javascript
  const info    = await readRange(sheetId, 'Sheet1!A1:B11');
```

Add `delayedFrom` to the returned object:

```javascript
    folderId:    infoMap['Folder ID']    || '',
    delayedFrom: infoMap['Delayed From'] || '',
```

In the new-format branch, read the extra column:

```javascript
      const [, itemTypeName, color, sizesStr, frontMethod, frontNotes, backMethod, backNotes, itemTypeId, customerEmail] = row;
      lineItemsMap[num] = {
        num, itemTypeName, itemTypeId: itemTypeId || '',
        color,
        sizes: parseSizes(sizesStr),
        frontMethod: frontMethod || '', frontNotes: frontNotes || '',
        backMethod: backMethod || '', backNotes: backNotes || '',
        customerEmail: customerEmail || '',
        frontDesigns: [], backDesigns: [],
      };
```

(Legacy branch: add `customerEmail: ''` to that object for consistency.)

- [ ] **Step 4: Run tests to verify pass**

Run: `cd server && npx jest __tests__/orderSheet.test.js`
Expected: PASS (all, including the Task 3 updates).

- [ ] **Step 5: Commit**

```bash
git add server/sheets/orderSheet.js server/__tests__/orderSheet.test.js
git commit -m "feat: persist line-item customerEmail and order delayedFrom"
```

---

### Task 7: Customer-item selection helpers (server)

**Files:**
- Create: `server/gmail/customerItems.js`
- Test: `server/__tests__/customerItems.test.js`

**Interfaces:**
- Produces:
  - `itemsForCustomer(lineItems, email) => Array` — items whose `customerEmail` matches (case-insensitive), `[]` if email falsy.
  - `sampleItems(lineItems) => Array` — the linked items of the first customer that has any; else the first up-to-2 line items; `[]` if none.

- [ ] **Step 1: Write the failing test**

```javascript
// server/__tests__/customerItems.test.js
const { itemsForCustomer, sampleItems } = require('../gmail/customerItems');

const items = [
  { num: '01', customerEmail: 'jane@x.com' },
  { num: '02', customerEmail: 'JANE@x.com' },
  { num: '03', customerEmail: '' },
];

test('itemsForCustomer matches case-insensitively', () => {
  expect(itemsForCustomer(items, 'jane@x.com').map(i => i.num)).toEqual(['01', '02']);
});
test('itemsForCustomer returns [] for falsy email', () => {
  expect(itemsForCustomer(items, '')).toEqual([]);
});
test('sampleItems prefers first customer with linked items', () => {
  expect(sampleItems(items).map(i => i.num)).toEqual(['01', '02']);
});
test('sampleItems falls back to first two when none linked', () => {
  const none = [{ num: '01' }, { num: '02' }, { num: '03' }];
  expect(sampleItems(none).map(i => i.num)).toEqual(['01', '02']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest __tests__/customerItems.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```javascript
// server/gmail/customerItems.js
function itemsForCustomer(lineItems, email) {
  if (!email) return [];
  const key = email.toLowerCase();
  return (lineItems || []).filter(li => (li.customerEmail || '').toLowerCase() === key);
}

function sampleItems(lineItems) {
  const items = lineItems || [];
  const firstLinked = items.find(li => li.customerEmail);
  if (firstLinked) return itemsForCustomer(items, firstLinked.customerEmail);
  return items.slice(0, 2);
}

module.exports = { itemsForCustomer, sampleItems };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest __tests__/customerItems.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add server/gmail/customerItems.js server/__tests__/customerItems.test.js
git commit -m "feat: add customer-item selection helpers"
```

---

### Task 8: Render "Your items" in customer emails + wire router

**Files:**
- Modify: `server/gmail/customerEmailBuilder.js` (`buildCustomerEmail` accepts `items`)
- Modify: `server/gmail/router.js` (preview/draft/send pass items)
- Test: `server/__tests__/customerEmailBuilder.test.js` (add cases)

**Interfaces:**
- Consumes: `itemsForCustomer`, `sampleItems` (Task 7).
- Produces: `buildCustomerEmail({ ..., items })` renders a "Your items" block (HTML + plain) when `items` is non-empty; omitted otherwise.

- [ ] **Step 1: Write the failing tests**

Add to `server/__tests__/customerEmailBuilder.test.js`:

```javascript
test('buildCustomerEmail renders Your items with front design only', () => {
  const items = [{ itemTypeName: 'Tank', color: 'Gray',
    frontDesigns: [{ designNum: '1', file: 'BlueNeon' }], backDesigns: [{ designNum: '1', file: 'SecretBack' }],
    sizes: { M: { total: 2, inventory: 0 }, L: { total: 1, inventory: 0 } } }];
  const { html, plain } = buildCustomerEmail({
    state: 'sent', template: DEFAULT_TEMPLATES.sent, customerName: 'Jane',
    genericName: 'G', orderName: 'O', items,
  });
  expect(html).toContain('Your items');
  expect(html).toContain('Tank');
  expect(html).toContain('Gray');
  expect(html).toContain('M×2, L×1');
  expect(html).toContain('BlueNeon');
  expect(html).not.toContain('SecretBack'); // back design omitted
  expect(plain).toContain('BlueNeon');
});

test('buildCustomerEmail shows blank (no print) for undecorated item', () => {
  const items = [{ itemTypeName: 'Tank', color: 'Gray', frontDesigns: [], backDesigns: [],
    sizes: { M: { total: 1, inventory: 0 } } }];
  const { html } = buildCustomerEmail({ state: 'sent', template: DEFAULT_TEMPLATES.sent,
    customerName: 'Jane', genericName: 'G', orderName: 'O', items });
  expect(html).toContain('blank (no print)');
});

test('buildCustomerEmail omits Your items when none', () => {
  const { html } = buildCustomerEmail({ state: 'sent', template: DEFAULT_TEMPLATES.sent,
    customerName: 'Jane', genericName: 'G', orderName: 'O', items: [] });
  expect(html).not.toContain('Your items');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest __tests__/customerEmailBuilder.test.js`
Expected: FAIL — no "Your items" rendering.

- [ ] **Step 3: Implement in `customerEmailBuilder.js`**

Add helpers above `buildCustomerEmail`:

```javascript
function formatItemSizes(sizes) {
  return Object.entries(sizes || {})
    .filter(([, v]) => (v?.total ?? 0) > 0)
    .map(([label, v]) => `${label}×${v.total}`)
    .join(', ');
}

function describeItem(item) {
  const type = item.itemTypeName || item.apparelType || 'Item';
  const front = (item.frontDesigns || []).map(d => d.file).join(', ') || 'blank (no print)';
  const parts = [item.color, formatItemSizes(item.sizes), front].filter(Boolean);
  return `${type} — ${parts.join(', ')}`;
}

function renderItemsHtml(items) {
  if (!items || items.length === 0) return '';
  const rows = items.map(i => `<li style="margin:0 0 6px;font-size:14px;color:#444">${describeItem(i)}</li>`).join('');
  return `<div style="margin-top:8px"><strong style="font-size:13px;color:#2b2b2b">Your items</strong>
    <ul style="margin:6px 0 12px;padding-left:20px">${rows}</ul></div>`;
}

function renderItemsPlain(items) {
  if (!items || items.length === 0) return '';
  return `\n\nYour items:\n${items.map(i => `- ${describeItem(i)}`).join('\n')}`;
}
```

Change the `buildCustomerEmail` signature to accept `items` and inject the blocks. Update the destructure:

```javascript
function buildCustomerEmail({ state, template, customerName, genericName, orderName, imageSrc, items }) {
```

Insert the items HTML between the body and the Status box:

```javascript
      <div style="margin-top:14px">${renderBodyHtml(bodyText)}</div>
      ${renderItemsHtml(items)}
      <div style="background:#f4f0e4;border-left:4px solid #e07a3f;padding:10px 13px;border-radius:6px;font-size:13px;color:#555"><strong>Status:</strong> ${status}</div>
```

And add to the plain text:

```javascript
  const plain = `${bodyText}${renderItemsPlain(items)}\n\nStatus: ${status}\n\nRocky Meowtain Company LLC`;
```

- [ ] **Step 4: Wire the router**

In `server/gmail/router.js`, add the import:

```javascript
const { itemsForCustomer, sampleItems } = require('./customerItems');
```

In the **preview** route, pass a sample list:

```javascript
    const { subject, html } = buildCustomerEmail({
      state, template: templates[state], customerName: '',
      genericName: genericCustomerName, orderName: order.orderName,
      items: sampleItems(order.lineItems),
      imageSrc: '/api/assets/email_header.jpg',
    });
```

In the **draft** route loop, pass the customer's items:

```javascript
    for (const c of customers) {
      const { subject, html, plain } = buildCustomerEmail({
        state, template: templates[state], customerName: c.name,
        genericName: genericCustomerName, orderName: order.orderName,
        items: itemsForCustomer(order.lineItems, c.email),
      });
      await createDraft(c.email, subject, html, plain, [attachment]);
      drafted++;
    }
```

In the **send** route loop, likewise:

```javascript
      const { subject, html, plain } = buildCustomerEmail({
        state, template: templates[state], customerName: r.name,
        genericName: genericCustomerName, orderName: order.orderName,
        items: itemsForCustomer(order.lineItems, r.email),
      });
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd server && npx jest __tests__/customerEmailBuilder.test.js __tests__/customerEmail.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/gmail/customerEmailBuilder.js server/gmail/router.js server/__tests__/customerEmailBuilder.test.js
git commit -m "feat: describe each customer's items in status emails"
```

---

### Task 9: Line-item customer dropdown

**Files:**
- Modify: `src/components/LineItemCard.jsx`
- Modify: `src/components/OrderBuilder.jsx:328-337` (pass `customers`)
- Test: `src/__tests__/LineItemCard.test.jsx` (create)

**Interfaces:**
- Consumes: `order.customers` from `OrderBuilder`.
- Produces: `LineItemCard` renders a customer `<select>`; changing it calls `onChange({ ...item, customerEmail })`.

- [ ] **Step 1: Write the failing test**

```javascript
// src/__tests__/LineItemCard.test.jsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LineItemCard from '../components/LineItemCard';

const item = { num: '01', itemTypeId: '', itemTypeName: '', color: '', sizes: {},
  frontDesigns: [], backDesigns: [], frontNotes: '', backNotes: '', frontMethod: '', backMethod: '', customerEmail: '' };

describe('LineItemCard customer dropdown', () => {
  test('lists order customers and reports selection', () => {
    const onChange = vi.fn();
    render(<LineItemCard item={item} items={[]} onChange={onChange} onRemove={() => {}}
      onAddDesign={() => {}} customers={[{ name: 'Jane', email: 'jane@x.com' }]} />);
    const select = screen.getByLabelText('Customer');
    fireEvent.change(select, { target: { value: 'jane@x.com' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ customerEmail: 'jane@x.com' }));
  });

  test('shows empty hint when no customers', () => {
    render(<LineItemCard item={item} items={[]} onChange={() => {}} onRemove={() => {}}
      onAddDesign={() => {}} customers={[]} />);
    expect(screen.getByLabelText('Customer')).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/LineItemCard.test.jsx`
Expected: FAIL — no element labeled "Customer".

- [ ] **Step 3: Implement in `LineItemCard.jsx`**

Add `customers = []` to the props destructure:

```javascript
export default function LineItemCard({ item, items = [], onChange, onRemove, onAddDesign, getStock = null, customers = [] }) {
```

Insert the dropdown inside `line-item-header`, after the `#` span:

```javascript
      <span className="line-item-num">#{item.num}</span>
      <select
        className="line-item-customer"
        aria-label="Customer"
        value={item.customerEmail || ''}
        disabled={customers.length === 0}
        onChange={e => update('customerEmail', e.target.value)}
      >
        {customers.length === 0
          ? <option value="">Add customers on the Customers tab first</option>
          : <>
              <option value="">— No customer —</option>
              {customers.map(c => (
                <option key={c.email} value={c.email}>{c.name ? `${c.name} (${c.email})` : c.email}</option>
              ))}
            </>}
      </select>
      <button className="btn-danger" onClick={() => setConfirmRemove(true)}>Remove</button>
```

- [ ] **Step 4: Pass customers from `OrderBuilder.jsx`**

In the `order.lineItems.map(...)` render, add the prop to `<LineItemCard>`:

```javascript
              getStock={getStock}
              customers={order.customers || []}
```

- [ ] **Step 5: Run test to verify pass**

Run: `npx vitest run src/__tests__/LineItemCard.test.jsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/LineItemCard.jsx src/components/OrderBuilder.jsx src/__tests__/LineItemCard.test.jsx
git commit -m "feat: add per-line-item customer dropdown"
```

---

### Task 10: Delayed button + exit chooser + order handlers

**Files:**
- Modify: `src/components/OrderTopBar.jsx`
- Modify: `src/components/OrderBuilder.jsx` (`handleEnterDelayed`, `handleExitDelayed`, refactor auto-send into `maybeAutoSendEmails`)
- Test: `src/__tests__/OrderTopBar.test.jsx` (create)

**Interfaces:**
- Consumes: `EMAIL_STATES` (Task 3).
- Produces: `OrderTopBar` calls `onEnterDelayed()` (from any non-delayed state) and `onExitDelayed(state)` (from Delayed).

- [ ] **Step 1: Write the failing test**

```javascript
// src/__tests__/OrderTopBar.test.jsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OrderTopBar from '../components/OrderTopBar';

const baseProps = {
  onAdvanceState: () => {}, onRegressState: () => {}, onGenerateDraft: () => {}, onNameChange: () => {},
  onEnterDelayed: vi.fn(), onExitDelayed: vi.fn(), saving: false,
};

describe('OrderTopBar delayed controls', () => {
  test('shows a Delayed button that fires onEnterDelayed (after confirm)', () => {
    const onEnterDelayed = vi.fn();
    render(<OrderTopBar {...baseProps} onEnterDelayed={onEnterDelayed} order={{ state: 'sent', orderId: 'X' }} />);
    fireEvent.click(screen.getByRole('button', { name: /delayed/i }));
    fireEvent.click(screen.getByRole('button', { name: /^confirm$|^yes$|^ok$/i }));
    expect(onEnterDelayed).toHaveBeenCalled();
  });

  test('while delayed, exit chooser offers returning to delayedFrom', () => {
    const onExitDelayed = vi.fn();
    render(<OrderTopBar {...baseProps} onExitDelayed={onExitDelayed}
      order={{ state: 'delayed', delayedFrom: 'sent', orderId: 'X' }} />);
    fireEvent.click(screen.getByRole('button', { name: /move out of delayed/i }));
    fireEvent.click(screen.getByRole('button', { name: /return to .*sent/i }));
    expect(onExitDelayed).toHaveBeenCalledWith('sent');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/OrderTopBar.test.jsx`
Expected: FAIL — no delayed controls yet.

- [ ] **Step 3: Implement `OrderTopBar.jsx`**

Add the two new props and a delayed-exit popup. Full replacement of the component (keeps existing behavior, adds delayed):

```javascript
import { useState } from 'react';
import StateBadge from './StateBadge';
import ConfirmDialog from './ConfirmDialog';

const STATE_ORDER = ['building', 'sent', 'pending', 'paid', 'fulfilled', 'received', 'shipped'];

export default function OrderTopBar({ order, onAdvanceState, onRegressState, onGenerateDraft, saving, onNameChange, onEnterDelayed, onExitDelayed }) {
  const [confirmState, setConfirmState] = useState(false);
  const [confirmRegress, setConfirmRegress] = useState(false);
  const [confirmDraft, setConfirmDraft] = useState(false);
  const [confirmDelayed, setConfirmDelayed] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);

  const isDelayed = order?.state === 'delayed';
  const nextState = STATE_ORDER[STATE_ORDER.indexOf(order?.state) + 1];
  const prevState = STATE_ORDER[STATE_ORDER.indexOf(order?.state) - 1];
  const delayedFrom = order?.delayedFrom || 'sent';
  const otherStates = STATE_ORDER.filter(s => s !== delayedFrom);

  return (
    <div className="order-top-bar">
      <div className="order-title-group">
        <input className="order-name-input" value={order?.orderName || ''}
          onChange={e => onNameChange(e.target.value)} placeholder="Add order name..." />
        <span className="order-id-label">{order?.orderId}</span>
        <div className="order-links">
          {order?.folderId && (
            <a className="order-drive-link" href={`https://drive.google.com/drive/folders/${order.folderId}`}
              target="_blank" rel="noreferrer">Drive Folder ↗</a>
          )}
          {order?.sheetId && (
            <a className="order-drive-link" href={`https://docs.google.com/spreadsheets/d/${order.sheetId}`}
              target="_blank" rel="noreferrer">Sheet ↗</a>
          )}
        </div>
      </div>

      <button className="btn-primary" onClick={() => setConfirmDraft(true)}>Generate Email Draft</button>
      {saving && <span className="saving-indicator">Saving...</span>}

      <div className="order-state-controls">
        {isDelayed ? (
          <>
            <div className="order-state-current">
              <span className="order-state-label">Current State</span>
              <StateBadge state="delayed" />
            </div>
            <button className="move-to-btn" onClick={() => setExitOpen(true)}>Move out of Delayed</button>
          </>
        ) : (
          <>
            {prevState && (
              <button className="move-to-btn move-back-btn" onClick={() => setConfirmRegress(true)}>← Move back</button>
            )}
            <div className="order-state-current">
              <span className="order-state-label">Current State</span>
              <StateBadge state={order?.state} />
            </div>
            {nextState && (
              <>
                <button className="move-to-btn" onClick={() => setConfirmState(true)}>Move to →</button>
                <div className="order-state-next">
                  <span className="order-state-label">Next State</span>
                  <StateBadge state={nextState} dimmed />
                </div>
              </>
            )}
            <button className="move-to-btn delayed-btn" onClick={() => setConfirmDelayed(true)}>Mark Delayed</button>
          </>
        )}
      </div>

      {exitOpen && (
        <div className="delayed-exit-backdrop" role="dialog">
          <div className="delayed-exit-dialog">
            <p>Move out of Delayed — which state?</p>
            <button className="btn-primary" onClick={() => { setExitOpen(false); onExitDelayed(delayedFrom); }}>
              Return to “{delayedFrom}”
            </button>
            <div className="delayed-exit-others">
              {otherStates.map(s => (
                <button key={s} className="btn-secondary" onClick={() => { setExitOpen(false); onExitDelayed(s); }}>{s}</button>
              ))}
            </div>
            <button className="btn-secondary" onClick={() => setExitOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      <ConfirmDialog message={confirmState ? `Move order to "${nextState}"?` : null}
        onConfirm={() => { setConfirmState(false); onAdvanceState(nextState); }}
        onCancel={() => setConfirmState(false)} />
      <ConfirmDialog message={confirmRegress ? `Move order back to "${prevState}"?` : null}
        onConfirm={() => { setConfirmRegress(false); onRegressState(prevState); }}
        onCancel={() => setConfirmRegress(false)} />
      <ConfirmDialog message={confirmDraft ? 'Create Gmail draft for this order?' : null}
        onConfirm={() => { setConfirmDraft(false); onGenerateDraft(); }}
        onCancel={() => setConfirmDraft(false)} />
      <ConfirmDialog message={confirmDelayed ? 'Mark this order as Delayed? Customers will be notified if auto-send is on.' : null}
        onConfirm={() => { setConfirmDelayed(false); onEnterDelayed(); }}
        onCancel={() => setConfirmDelayed(false)} />
    </div>
  );
}
```

Note: the test clicks a confirm button matching `/^confirm$|^yes$|^ok$/i`. Verify `ConfirmDialog`'s confirm button label; if it differs, adjust the test's regex to the actual label (read `src/components/ConfirmDialog.jsx` first).

- [ ] **Step 4: Implement handlers in `OrderBuilder.jsx`**

Refactor the auto-send block out of `handleAdvanceState` into a shared function, and add the delayed handlers. Replace the tail of `handleAdvanceState` (the `if (EMAIL_STATES.includes(nextState) && autoSend) {...}` block) with a call:

```javascript
    setOrder(prev => ({ ...prev, state: nextState }));
    await maybeAutoSendEmails(nextState);
  }

  async function maybeAutoSendEmails(nextState) {
    if (!(EMAIL_STATES.includes(nextState) && autoSend)) return;
    const pending = (order.customers || []).filter(c => !(c.emailed && c.emailed[nextState]));
    if (pending.length === 0) return;
    try {
      const res = await sendCustomerEmail(sheetId, nextState, pending.map(c => ({ name: c.name, email: c.email })));
      stampEmailed(nextState, res.emails, res.at);
      setToast(`Sent ${res.sent} ${nextState} email(s)`);
    } catch (err) {
      logError(`Auto-send failed: ${err.message}`);
    }
  }

  async function handleEnterDelayed() {
    setOrder(prev => ({ ...prev, state: 'delayed', delayedFrom: prev.state }));
    await maybeAutoSendEmails('delayed');
  }

  function handleExitDelayed(toState) {
    setOrder(prev => ({ ...prev, state: toState, delayedFrom: '' }));
  }
```

Pass the new handlers to `OrderTopBar`:

```javascript
        onAdvanceState={handleAdvanceState}
        onRegressState={handleRegressState}
        onEnterDelayed={handleEnterDelayed}
        onExitDelayed={handleExitDelayed}
        onGenerateDraft={handleGenerateDraft}
```

- [ ] **Step 5: Run test to verify pass**

Run: `npx vitest run src/__tests__/OrderTopBar.test.jsx` and `npm run lint`.
Expected: PASS.

- [ ] **Step 6: Add minimal styles**

In `src/App.css`, add:

```css
.line-item-customer { margin-left: auto; margin-right: 10px; max-width: 220px; }
.delayed-btn { background: #f59e0b; color: #1f2937; }
.delayed-exit-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.delayed-exit-dialog {
  background: #fff; border-radius: 12px; padding: 20px; max-width: 420px;
  display: flex; flex-direction: column; gap: 10px;
}
.delayed-exit-others { display: flex; flex-wrap: wrap; gap: 6px; }
```

- [ ] **Step 7: Commit**

```bash
git add src/components/OrderTopBar.jsx src/components/OrderBuilder.jsx src/__tests__/OrderTopBar.test.jsx src/App.css
git commit -m "feat: add Delayed side-state button and exit chooser"
```

---

### Task 11: Bulk-CSV skip reasons

**Files:**
- Modify: `src/utils/parseCustomers.js`
- Modify: `src/__tests__/parseCustomers.test.js` (the skipped shape changes)

**Interfaces:**
- Produces: `parseCustomers(text) => { rows, skipped }` where `skipped` is `Array<{ line: string, reason: string }>`.

- [ ] **Step 1: Update the failing test**

In `src/__tests__/parseCustomers.test.js`, change the skipped expectation:

```javascript
  test('reports lines with no valid email as skipped with a reason', () => {
    const { rows, skipped } = parseCustomers('not an email\nJordan, jordan@x.com');
    expect(rows).toHaveLength(1);
    expect(skipped).toEqual([{ line: 'not an email', reason: 'no email address found' }]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/parseCustomers.test.js`
Expected: FAIL — skipped is currently `['not an email']`.

- [ ] **Step 3: Implement**

In `src/utils/parseCustomers.js`, change the skip push:

```javascript
    if (!match) { skipped.push({ line, reason: 'no email address found' }); continue; }
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/__tests__/parseCustomers.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/parseCustomers.js src/__tests__/parseCustomers.test.js
git commit -m "feat: return skip reasons from bulk-CSV parser"
```

---

### Task 12: CSV example placeholder + skip-reason display

**Files:**
- Modify: `src/components/CustomersPanel.jsx`
- Test: `src/__tests__/CustomersPanel.test.jsx` (add a case; adjust if it asserts skipped strings)

**Interfaces:**
- Consumes: `parseCustomers` skipped shape (Task 11).
- Produces: the paste textarea shows a multi-line example; skipped entries render as `'{line}' — {reason}`.

- [ ] **Step 1: Read the existing test and write the new case**

First read `src/__tests__/CustomersPanel.test.jsx` and update any assertion that expects `skipped` as bare strings. Then add:

```javascript
  test('paste textarea shows a multi-line example placeholder', () => {
    // render CustomersPanel, open the paste box, and assert the placeholder text
    // (mirror the existing render/setup already used in this file)
    // expect(screen.getByPlaceholderText(/jane@example\.com/i)).toBeInTheDocument();
  });
```

Fill the body using the same render/setup helpers already present in this test file (open the paste box via the "Paste Customer Info (CSV)" button, then assert the placeholder contains `jane@example.com`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/CustomersPanel.test.jsx`
Expected: FAIL — placeholder does not contain the example yet.

- [ ] **Step 3: Implement in `CustomersPanel.jsx`**

Change the textarea placeholder to a real multi-line example:

```javascript
          <textarea
            className="customers-paste-input"
            placeholder={"One per line. Each line needs an email address:\nJane Doe, jane@example.com\nJohn Smith <john@example.com>\nbare@example.com"}
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
          />
```

Make `addCustomer`'s duplicate message use the object shape, and update the skipped render. Change the duplicate push:

```javascript
      setSkipped([{ line: email, reason: 'already in the list' }]);
```

and the skipped display:

```javascript
      {skipped.length > 0 && (
        <p className="customers-skipped">Skipped: {skipped.map(s => `'${s.line}' — ${s.reason}`).join('; ')}</p>
      )}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/__tests__/CustomersPanel.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/CustomersPanel.jsx src/__tests__/CustomersPanel.test.jsx
git commit -m "feat: add CSV example placeholder and per-line skip reasons"
```

---

## Final verification

- [ ] Run the full frontend suite: `npm test` (from repo root) — all vitest green.
- [ ] Run the full server suite: `cd server && npm test` — all jest green.
- [ ] Run `npm run lint` — no new errors (watch for unused imports left in `OrderBuilder.jsx` after Task 5).
- [ ] Manual smoke (optional, needs Google auth): create an order with three identical line items across two customers, confirm the printer preview shows one merged row and each customer's draft lists their items; mark the order Delayed and confirm the exit chooser returns to the prior state.

## Spec coverage map

- Spec §1 (link + email description): Tasks 6, 7, 8, 9.
- Spec §2 (printer compilation): Tasks 1, 2, 4, 5.
- Spec §3 (Delayed): Tasks 3 (state/color), 6 (persistence), 10 (UI + handlers).
- Spec §4 (email states reduced): Task 3.
- Spec §5 (CSV fix): Tasks 11, 12.
