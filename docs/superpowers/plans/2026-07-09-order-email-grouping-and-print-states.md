# Order Email Grouping + Pending Print / Printed States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group order-email line items by item type in a fixed priority order, and reshape the order state model — relabel `pending` as "Pending Print", remove `paid` (migrate to `fulfilled` on read), add customer emails for Pending Print and Printed, and show friendly badge labels.

**Architecture:** Two independent tracks. Part A is a pure change to the email builder (`server/gmail/emailBuilder.js`) — add a shared type-priority comparator and sort printed sections and blank rows by it. Part B threads a new `normalizeState` helper through the backend read paths so legacy `paid` orders self-heal to `fulfilled`, expands `EMAIL_STATES` to include `pending`/`fulfilled` across the three files that duplicate it, adds customer-email templates for the two new states, and updates the frontend state order + friendly labels.

**Tech Stack:** Node.js (CommonJS) backend tested with **Jest** (`cd server && npm test`); React 19 frontend tested with **Vitest** (`npm test` at repo root). No new dependencies.

## Global Constraints

- **Fixed type priority** (shared ranking): `Unisex Shirt` (1), `Youth Shirt` (2), `Tank` (3), everything else alphabetically case-insensitive.
- **`EMAIL_STATES` final value** (all copies, this exact order): `['sent', 'pending', 'fulfilled', 'shipped', 'delayed']`.
- **State progression** (`STATE_ORDER`): `building → sent → pending → fulfilled → received → shipped`; `paid` removed; `delayed` remains a manual side-state.
- **Friendly labels:** `building`→Building, `sent`→In Production, `pending`→Pending Print, `fulfilled`→Printed, `received`→In-Hand, `shipped`→Shipped, `delayed`→Delayed.
- **`paid` is removed everywhere**; legacy `paid` orders are normalized to `fulfilled` on read (self-healing, no batch script).
- Backend uses CommonJS (`require`/`module.exports`); frontend uses ESM (`import`/`export`).
- Backend test command: `cd server && npm test`. Frontend test command: `npm test` (repo root, runs `vitest run`).
- Copy text (subjects/bodies) must be used **verbatim** from this plan.

---

### Task 1: Part A — Email item grouping and ordering

**Files:**
- Modify: `server/gmail/emailBuilder.js`
- Test: `server/__tests__/emailBuilder.test.js`

**Interfaces:**
- Consumes: existing `compileLineItems`, `groupByCategory`, `formatSizes`, `isBlank` in `emailBuilder.js`.
- Produces: no exported API change. `buildEmailHtml` and `buildEmailPlainText` keep the same signatures; only output ordering changes.

- [ ] **Step 1: Write the failing tests**

Append to `server/__tests__/emailBuilder.test.js`:

```javascript
// --- Task: Part A type-priority ordering ---

const GROUP_ORDER = {
  orderId: 'RMC-777', orderName: 'Grouped', notes: '',
  lineItems: [
    { num: '01', itemTypeName: 'Youth Shirt', color: 'Black', frontDesigns: [{ designNum: '1', file: 'y1' }],
      backDesigns: [], frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
      sizes: { M: { total: 1, inventory: 0 } } },
    { num: '02', itemTypeName: 'Tank', color: 'Black', frontDesigns: [{ designNum: '1', file: 't1' }],
      backDesigns: [], frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
      sizes: { M: { total: 1, inventory: 0 } } },
    { num: '03', itemTypeName: 'Unisex Shirt', color: 'Black', frontDesigns: [{ designNum: '1', file: 'u1' }],
      backDesigns: [], frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
      sizes: { M: { total: 1, inventory: 0 } } },
  ],
};

test('printed HTML sections are ordered Unisex, Youth, Tank regardless of input order', () => {
  const html = buildEmailHtml(GROUP_ORDER, {}, {});
  const iUnisex = html.indexOf('<h3>Unisex Shirt</h3>');
  const iYouth = html.indexOf('<h3>Youth Shirt</h3>');
  const iTank = html.indexOf('<h3>Tank</h3>');
  expect(iUnisex).toBeGreaterThan(-1);
  expect(iUnisex).toBeLessThan(iYouth);
  expect(iYouth).toBeLessThan(iTank);
});

test('printed plain-text sections are ordered Unisex, Youth, Tank', () => {
  const text = buildEmailPlainText(GROUP_ORDER, {}, {});
  expect(text.indexOf('Unisex Shirt')).toBeLessThan(text.indexOf('Youth Shirt'));
  expect(text.indexOf('Youth Shirt')).toBeLessThan(text.indexOf('Tank'));
});

test('unknown types sort alphabetically after the priority types', () => {
  const order = {
    orderId: 'RMC-778', lineItems: [
      { num: '01', itemTypeName: 'Beanie', color: 'Black', frontDesigns: [{ designNum: '1', file: 'b' }],
        backDesigns: [], frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
        sizes: { OS: { total: 1, inventory: 0 } } },
      { num: '02', itemTypeName: 'Apron', color: 'Black', frontDesigns: [{ designNum: '1', file: 'a' }],
        backDesigns: [], frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
        sizes: { OS: { total: 1, inventory: 0 } } },
      { num: '03', itemTypeName: 'Tank', color: 'Black', frontDesigns: [{ designNum: '1', file: 't' }],
        backDesigns: [], frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
        sizes: { OS: { total: 1, inventory: 0 } } },
    ],
  };
  const html = buildEmailHtml(order, {}, {});
  const iTank = html.indexOf('<h3>Tank</h3>');
  const iApron = html.indexOf('<h3>Apron</h3>');
  const iBeanie = html.indexOf('<h3>Beanie</h3>');
  expect(iTank).toBeLessThan(iApron); // priority type first
  expect(iApron).toBeLessThan(iBeanie); // then alphabetical
});

test('blank item rows are contiguous per type and in priority order', () => {
  const order = {
    orderId: 'RMC-779', lineItems: [
      { num: '01', itemTypeName: 'Tank', color: 'Gray', frontDesigns: [], backDesigns: [],
        sizes: { M: { total: 1, inventory: 0 } } },
      { num: '02', itemTypeName: 'Unisex Shirt', color: 'Gray', frontDesigns: [], backDesigns: [],
        sizes: { M: { total: 1, inventory: 0 } } },
      { num: '03', itemTypeName: 'Tank', color: 'Black', frontDesigns: [], backDesigns: [],
        sizes: { M: { total: 1, inventory: 0 } } },
      { num: '04', itemTypeName: 'Youth Shirt', color: 'Gray', frontDesigns: [], backDesigns: [],
        sizes: { M: { total: 1, inventory: 0 } } },
    ],
  };
  const html = buildEmailHtml(order, {}, {});
  // Locate the Blank Items table and read Item Type cells in row order.
  const blankSection = html.slice(html.indexOf('Blank Items (no decoration)'));
  const types = [...blankSection.matchAll(/<td>(Unisex Shirt|Youth Shirt|Tank)<\/td>/g)].map(m => m[1]);
  expect(types).toEqual(['Unisex Shirt', 'Youth Shirt', 'Tank', 'Tank']);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && npx jest emailBuilder -t "priority"`
Expected: FAIL — sections currently appear in first-appearance order (Youth, Tank, Unisex), so ordering assertions fail.

- [ ] **Step 3: Add the shared comparators and size ranking**

In `server/gmail/emailBuilder.js`, immediately after the `require` on line 1, add:

```javascript
const TYPE_PRIORITY = ['Unisex Shirt', 'Youth Shirt', 'Tank'];
function typeRank(name) {
  const i = TYPE_PRIORITY.indexOf(name);
  return i === -1 ? TYPE_PRIORITY.length : i;
}
function compareTypes(a, b) {
  return typeRank(a) - typeRank(b) ||
    String(a).toLowerCase().localeCompare(String(b).toLowerCase());
}

const SIZE_ORDER = {};
['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'].forEach((s, i) => { SIZE_ORDER[s] = i; });
function minSizeRank(sizes) {
  const ranks = Object.entries(sizes || {})
    .filter(([, v]) => (v?.total ?? 0) > 0)
    .map(([label]) => SIZE_ORDER[label] ?? 99);
  return ranks.length ? Math.min(...ranks) : 99;
}
function blankType(item) {
  return item.itemTypeName || item.apparelType || '';
}
function compareBlank(a, b) {
  return compareTypes(blankType(a), blankType(b)) ||
    String(a.color || '').toLowerCase().localeCompare(String(b.color || '').toLowerCase()) ||
    minSizeRank(a.sizes) - minSizeRank(b.sizes);
}
```

- [ ] **Step 4: Order the printed sections and blank rows in `buildEmailHtml`**

In `buildEmailHtml`, change the blank-items line (currently `const blankItems = compileLineItems(allItems.filter(isBlank));`) to:

```javascript
  const blankItems = compileLineItems(allItems.filter(isBlank)).sort(compareBlank);
```

Then replace the printed-groups loop header (currently `for (const [category, items] of Object.entries(groups)) {`) with:

```javascript
  for (const category of Object.keys(groups).sort(compareTypes)) {
    const items = groups[category];
```

(The loop body is unchanged; it already references `category` and `items`.)

- [ ] **Step 5: Order the printed sections and blank rows in `buildEmailPlainText`**

In `buildEmailPlainText`, make the same two changes: append `.sort(compareBlank)` to the `blankItems` assignment, and replace `for (const [category, items] of Object.entries(groups)) {` with:

```javascript
  for (const category of Object.keys(groups).sort(compareTypes)) {
    const items = groups[category];
```

- [ ] **Step 6: Run the full email builder suite**

Run: `cd server && npx jest emailBuilder`
Expected: PASS — new ordering tests pass and all pre-existing `emailBuilder` tests still pass.

- [ ] **Step 7: Commit**

```bash
git add server/gmail/emailBuilder.js server/__tests__/emailBuilder.test.js
git commit -m "feat(email): group order-email items by fixed type priority"
```

---

### Task 2: `normalizeState` helper + apply on backend reads

**Files:**
- Create: `server/orders/state.js`
- Create: `server/__tests__/orderState.test.js`
- Modify: `server/sheets/router.js:14-78` (GET `/order/:sheetId`)
- Modify: `server/orders/router.js:44-58` (GET `/` list mapping)
- Modify: `server/gmail/router.js:97-108` (`loadOrder`)

**Interfaces:**
- Produces: `server/orders/state.js` exports `{ normalizeState }` where `normalizeState(state: string) => string` returns `'fulfilled'` when given `'paid'`, otherwise returns the input unchanged. Tasks 3 consumes this same export.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/orderState.test.js`:

```javascript
const { normalizeState } = require('../orders/state');

test('normalizeState maps paid to fulfilled', () => {
  expect(normalizeState('paid')).toBe('fulfilled');
});

test('normalizeState leaves other states unchanged', () => {
  for (const s of ['building', 'sent', 'pending', 'fulfilled', 'received', 'shipped', 'delayed']) {
    expect(normalizeState(s)).toBe(s);
  }
});

test('normalizeState passes through undefined/empty', () => {
  expect(normalizeState(undefined)).toBe(undefined);
  expect(normalizeState('')).toBe('');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server && npx jest orderState`
Expected: FAIL with "Cannot find module '../orders/state'".

- [ ] **Step 3: Create the helper**

Create `server/orders/state.js`:

```javascript
// Legacy `paid` orders migrate to `fulfilled` on read (self-healing; no batch
// script). Applied wherever an order's state is read/consumed on the backend.
function normalizeState(state) {
  return state === 'paid' ? 'fulfilled' : state;
}

module.exports = { normalizeState };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd server && npx jest orderState`
Expected: PASS (all three tests).

- [ ] **Step 5: Apply on the sheets router read path**

In `server/sheets/router.js`, add to the imports (after line 3):

```javascript
const { normalizeState } = require('../orders/state');
```

Inside the `router.get('/order/:sheetId', ...)` handler, add a local `send` helper as the first line of the `try` block (before `// Step 1: quick Sheet1 read just for orderId`):

```javascript
    const send = (order, extra = {}) => res.json({ ...order, ...extra, state: normalizeState(order.state) });
```

Then replace each order response in this handler with `send(...)`:
- Line ~27 `if (cached) return res.json({ ...cached, sheetId: req.params.sheetId });` → `if (cached) return send(cached, { sheetId: req.params.sheetId });`
- Line ~35 `return res.json({ ...data, sheetId: req.params.sheetId });` → `return send(data, { sheetId: req.params.sheetId });`
- Line ~49 `return res.json({ ...driveOrder, sheetId: req.params.sheetId });` → `return send(driveOrder, { sheetId: req.params.sheetId });`
- Line ~65 `res.json(order);` → `send(order);`
- Line ~72 (inside the `catch`) `return res.json({ ...data, _fromCache: true });` → `return res.json({ ...data, _fromCache: true, state: normalizeState(data.state) });` (the `catch` block cannot see `send`, so inline it).

- [ ] **Step 6: Apply on the orders list router**

In `server/orders/router.js`, add to the imports (after the `writeOrderCache` line, ~line 5):

```javascript
const { normalizeState } = require('./state');
```

In the `router.get('/', ...)` mapping, change the `state` field (currently `state: cached ? cached.state : null,`) to:

```javascript
        state: cached ? normalizeState(cached.state) : null,
```

- [ ] **Step 7: Apply on the gmail router `loadOrder`**

In `server/gmail/router.js`, add to the imports (after line 4):

```javascript
const { normalizeState } = require('../orders/state');
```

Replace the `loadOrder` function body (lines 97-108) so both return paths normalize:

```javascript
async function loadOrder(sheetId) {
  let order;
  try {
    const meta = await readRange(sheetId, 'Sheet1!A1:B10');
    const infoMap = Object.fromEntries(meta.map(([k, v]) => [k, v]));
    const orderId = infoMap['Order ID'] || '';
    if (orderId) {
      const cached = readOrderCache(orderId);
      if (cached) order = cached;
    }
  } catch { /* fall through */ }
  if (!order) order = await readOrderFromSheet(sheetId);
  return { ...order, state: normalizeState(order.state) };
}
```

- [ ] **Step 8: Run the backend suite to confirm no regression**

Run: `cd server && npm test`
Expected: PASS — `orderState` passes and all existing router/order tests still pass (normalization is a no-op for every non-`paid` state).

- [ ] **Step 9: Commit**

```bash
git add server/orders/state.js server/__tests__/orderState.test.js server/sheets/router.js server/orders/router.js server/gmail/router.js
git commit -m "feat(orders): normalize legacy paid state to fulfilled on read"
```

---

### Task 3: Stats aggregate — drop `paid` from `COUNTED_STATES`, normalize on read

**Files:**
- Modify: `server/stats/aggregate.js:1,38-39`
- Test: `server/__tests__/statsAggregate.test.js:14-16` (update) + new case

**Interfaces:**
- Consumes: `normalizeState` from `server/orders/state.js` (Task 2).
- Produces: `COUNTED_STATES` export becomes `['sent', 'pending', 'fulfilled', 'received']`.

- [ ] **Step 1: Update the existing assertion and add a normalization test**

In `server/__tests__/statsAggregate.test.js`, replace the existing `COUNTED_STATES` test (lines 14-16):

```javascript
test('COUNTED_STATES is sent and beyond, without paid', () => {
  expect(COUNTED_STATES).toEqual(['sent', 'pending', 'fulfilled', 'received']);
});
```

Then update the second `order(...)` in the "sums total" test (lines 24-27) from state `'paid'` to `'fulfilled'` so it still counts, and append a new test at the end of the file:

```javascript
test('a legacy paid order is counted (normalized to fulfilled)', () => {
  const orders = [
    order('paid', [
      { itemTypeName: 'Unisex Tee', itemTypeId: 'tee1', color: 'Black',
        sizes: { L: { total: 4, inventory: 0 } } },
    ]),
  ];
  const { shirts } = aggregate(orders, catalog);
  expect(shirts.find(r => r.color === 'Black' && r.size === 'L').total).toBe(4);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && npx jest statsAggregate`
Expected: FAIL — `COUNTED_STATES` still contains `'paid'`, and the `paid` order is currently counted only because `'paid'` is in the list; after Step 1 the assertion expects the new list and the "sums total" test now uses `fulfilled`.

- [ ] **Step 3: Update `COUNTED_STATES` and normalize before the check**

In `server/stats/aggregate.js`, change line 1:

```javascript
const { normalizeState } = require('../orders/state');
const COUNTED_STATES = ['sent', 'pending', 'fulfilled', 'received'];
```

Then in `aggregate`, replace the counted-state guard (currently `if (!COUNTED_STATES.includes(order.state)) continue;`) with:

```javascript
    if (!COUNTED_STATES.includes(normalizeState(order.state))) continue;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd server && npx jest statsAggregate`
Expected: PASS — the legacy `paid` order normalizes to `fulfilled`, which is in `COUNTED_STATES`.

- [ ] **Step 5: Commit**

```bash
git add server/stats/aggregate.js server/__tests__/statsAggregate.test.js
git commit -m "feat(stats): drop paid from counted states, normalize on read"
```

---

### Task 4: Customer-email templates for Pending Print + Printed

**Files:**
- Modify: `server/gmail/customerEmailBuilder.js:10-37` (`PILLS`, `STATUS_LABELS`, `DEFAULT_TEMPLATES`)
- Test: `server/__tests__/customerEmailBuilder.test.js`

**Interfaces:**
- Produces: `PILLS`, `STATUS_LABELS`, and `DEFAULT_TEMPLATES` each gain `pending` and `fulfilled` keys. Task 5 relies on `DEFAULT_TEMPLATES.pending` / `DEFAULT_TEMPLATES.fulfilled` existing when `statusEmailStore.defaults()` iterates the expanded `EMAIL_STATES`.

- [ ] **Step 1: Write the failing tests**

Append to `server/__tests__/customerEmailBuilder.test.js`:

```javascript
test('buildCustomerEmail renders the Pending Print state', () => {
  const { subject, html } = buildCustomerEmail({
    state: 'pending', template: DEFAULT_TEMPLATES.pending,
    customerName: 'Jordan', genericName: 'Fellow Cat Lover', orderName: 'Summer Drop',
  });
  expect(subject).toBe('We\'re prepping your RMC order');
  expect(html).toContain('Pending Print'); // status chrome label
  expect(html).toContain('Hello Jordan');
  expect(html).toContain('Summer Drop');
});

test('buildCustomerEmail renders the Printed state', () => {
  const { subject, html } = buildCustomerEmail({
    state: 'fulfilled', template: DEFAULT_TEMPLATES.fulfilled,
    customerName: 'Jordan', genericName: 'Fellow Cat Lover', orderName: 'Summer Drop',
  });
  expect(subject).toBe('Your RMC order is printed!');
  expect(html).toContain('Printed'); // status chrome label
  expect(html).toContain('Hello Jordan');
});
```

Also extend the existing `default subjects contain no emoji` test loop (line 21) to include the two new states:

```javascript
  for (const state of ['sent', 'pending', 'fulfilled', 'shipped', 'delayed']) {
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && npx jest customerEmailBuilder -t "Pending Print"`
Expected: FAIL — `DEFAULT_TEMPLATES.pending` is undefined, so `buildCustomerEmail` throws "No customer email template for state \"pending\"".

- [ ] **Step 3: Add the two states to `PILLS` and `STATUS_LABELS`**

In `server/gmail/customerEmailBuilder.js`, update `PILLS` (lines 10-14) to:

```javascript
const PILLS = {
  sent: '🖨️ In Production',
  pending: '🖨️ Pending Print',
  fulfilled: '👕 Printed',
  shipped: '📦 Shipped',
  delayed: '⏳ Delayed',
};
```

And `STATUS_LABELS` (lines 15-19) to:

```javascript
const STATUS_LABELS = {
  sent: 'In Production',
  pending: 'Pending Print',
  fulfilled: 'Printed',
  shipped: 'Shipped',
  delayed: 'Delayed',
};
```

- [ ] **Step 4: Add the two default templates**

In `DEFAULT_TEMPLATES` (lines 24-37), add these two entries (place `pending` and `fulfilled` after the `sent` entry):

```javascript
  pending: {
    subject: 'We\'re prepping your RMC order',
    body: `Hello [customer name],\n\nYour order "[order name]" is with our print shop and we're lining up the blank garments for it. Once they're in and your order is printed, we'll let you know. Thanks for repping the Meowtain! 🐱`,
  },
  fulfilled: {
    subject: 'Your RMC order is printed!',
    body: `Hello [customer name],\n\nGreat news — your order "[order name]" is printed and moving toward shipment. We'll email again when it ships. Thanks for repping the Meowtain! 🐱`,
  },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd server && npx jest customerEmailBuilder`
Expected: PASS — new Pending Print / Printed tests pass; existing tests (including `throws for a state with no template` using `paid`, which still has no template) still pass.

- [ ] **Step 6: Commit**

```bash
git add server/gmail/customerEmailBuilder.js server/__tests__/customerEmailBuilder.test.js
git commit -m "feat(email): add Pending Print and Printed customer templates"
```

---

### Task 5: Backend `EMAIL_STATES` expansion + Customers-tab read range

**Files:**
- Modify: `server/gmail/statusEmailStore.js:5`
- Modify: `server/sheets/orderSheet.js:3,185` (`EMAIL_STATES` + widen Customers read range)
- Test: `server/__tests__/orderSheet.test.js:114-116,133,148,155,174` (update)

**Interfaces:**
- Consumes: `DEFAULT_TEMPLATES.pending` / `DEFAULT_TEMPLATES.fulfilled` from Task 4 (required so `statusEmailStore.defaults()` produces real templates for the new states).
- Produces: `EMAIL_STATES = ['sent', 'pending', 'fulfilled', 'shipped', 'delayed']` in both `statusEmailStore.js` and `orderSheet.js`. Customers tab gains `Sent: pending` and `Sent: fulfilled` columns (7 columns total: A–G).

> **Why the read-range change:** `readOrderFromSheet` currently reads `Customers!A1:F1000` (columns A–F). With 5 email states the Customers header is `Name, Email, Sent: sent, Sent: pending, Sent: fulfilled, Sent: shipped, Sent: delayed` = 7 columns (A–G). Reading only A–F silently drops the last state's column. The range must widen.

- [ ] **Step 1: Update the existing orderSheet tests to the new EMAIL_STATES**

In `server/__tests__/orderSheet.test.js`:

Replace the `EMAIL_STATES is the agreed set` test (lines 114-116):

```javascript
test('EMAIL_STATES is the agreed set', () => {
  expect(EMAIL_STATES).toEqual(['sent', 'pending', 'fulfilled', 'shipped', 'delayed']);
});
```

In `writeOrderToSheet writes the Customers tab` (around line 133), update the header and row expectations:

```javascript
  expect(rows[0]).toEqual(['Name', 'Email', 'Sent: sent', 'Sent: pending', 'Sent: fulfilled', 'Sent: shipped', 'Sent: delayed']);
  expect(rows[1]).toEqual(['Jordan', 'jordan@x.com', '2026-07-03T00:00:00Z', '', '', '', '']);
  expect(rows[2]).toEqual(['', 'sam@x.com', '', '', '', '', '']);
```

In `readOrderFromSheet reads the Customers tab` (around lines 147-156), update the mocked Customers rows and the expectation:

```javascript
    if (range.startsWith('Customers')) return Promise.resolve([
      ['Name', 'Email', 'Sent: sent', 'Sent: pending', 'Sent: fulfilled', 'Sent: shipped', 'Sent: delayed'],
      ['Jordan', 'jordan@x.com', '2026-07-03T00:00:00Z', '', '', '', ''],
    ]);
```

```javascript
  expect(order.customers).toEqual([
    { name: 'Jordan', email: 'jordan@x.com',
      emailed: { sent: '2026-07-03T00:00:00Z', pending: '', fulfilled: '', shipped: '', delayed: '' } },
  ]);
```

In `writeCustomersToSheet writes only the Customers tab` (around line 174), update the expected row (a `shipped` timestamp now sits in the 4th `Sent:` column):

```javascript
  expect(call[2][1]).toEqual(['A', 'a@x.com', '', '', '', '2026-07-03T00:00:00Z', '']);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && npx jest orderSheet`
Expected: FAIL — `EMAIL_STATES` is still `['sent', 'shipped', 'delayed']`, so headers, emailed maps, and the widened rows don't match.

- [ ] **Step 3: Expand `EMAIL_STATES` in `statusEmailStore.js`**

In `server/gmail/statusEmailStore.js`, change line 5:

```javascript
const EMAIL_STATES = ['sent', 'pending', 'fulfilled', 'shipped', 'delayed'];
```

- [ ] **Step 4: Expand `EMAIL_STATES` and widen the read range in `orderSheet.js`**

In `server/sheets/orderSheet.js`, change line 3:

```javascript
const EMAIL_STATES = ['sent', 'pending', 'fulfilled', 'shipped', 'delayed'];
```

Then in `readOrderFromSheet`, widen the Customers read range (currently `const custRows = await readRange(sheetId, 'Customers!A1:F1000');`) to:

```javascript
    const custRows = await readRange(sheetId, 'Customers!A1:Z1000');
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd server && npx jest orderSheet`
Expected: PASS — headers, emailed maps, and widened rows all match the new 5-state layout.

- [ ] **Step 6: Run the whole backend suite**

Run: `cd server && npm test`
Expected: PASS — no cross-file regressions (statusEmailStore `defaults()` now builds templates for `pending`/`fulfilled`, which exist from Task 4).

- [ ] **Step 7: Commit**

```bash
git add server/gmail/statusEmailStore.js server/sheets/orderSheet.js server/__tests__/orderSheet.test.js
git commit -m "feat(orders): add Pending Print/Printed to EMAIL_STATES and Customers tab"
```

---

### Task 6: Frontend state model — order, labels, badge, nav guard

**Files:**
- Modify: `src/emailStates.js` (`EMAIL_STATES`, full `STATE_LABELS`)
- Modify: `src/components/StateBadge.jsx` (render label, drop `paid` color)
- Modify: `src/components/OrderTopBar.jsx:5,14-16` (`STATE_ORDER`, nav guard)
- Test: `src/__tests__/StateBadge.test.jsx` (update), `src/__tests__/OrderTopBar.test.jsx` (add cases)

**Interfaces:**
- Consumes: nothing from earlier tasks (frontend is independent; the backend normalizes `paid`→`fulfilled` on read so the frontend never receives `paid`).
- Produces: `STATE_LABELS` in `src/emailStates.js` becomes the single source of friendly labels for all states; `StateBadge` imports and renders it. `STATE_ORDER` in `OrderTopBar.jsx` = `['building', 'sent', 'pending', 'fulfilled', 'received', 'shipped']`.

> **Design note:** `emailStates.js` already exports `STATE_LABELS` (consumed by `CustomersPanel` and `StatusEmailsTab` via `EMAIL_STATES.map`). To stay DRY, make it the single full label map (all 7 states) and have `StateBadge` import it, rather than defining a second labels map inside `StateBadge`.

- [ ] **Step 1: Write/update the failing frontend tests**

Replace the body of `src/__tests__/StateBadge.test.jsx`:

```javascript
import { render, screen } from '@testing-library/react';
import StateBadge, { STATE_COLORS } from '../components/StateBadge';

test('shipped has a distinct badge color', () => {
  expect(STATE_COLORS.shipped).toBeTruthy();
  expect(STATE_COLORS.shipped).not.toBe(STATE_COLORS.received);
});

test('renders the friendly label for shipped', () => {
  render(<StateBadge state="shipped" />);
  expect(screen.getByText('Shipped')).toBeInTheDocument();
});

test('renders Pending Print for the pending state', () => {
  render(<StateBadge state="pending" />);
  expect(screen.getByText('Pending Print')).toBeInTheDocument();
});

test('renders Printed for the fulfilled state', () => {
  render(<StateBadge state="fulfilled" />);
  expect(screen.getByText('Printed')).toBeInTheDocument();
});

test('falls back to the raw key for an unknown state', () => {
  render(<StateBadge state="mystery" />);
  expect(screen.getByText('mystery')).toBeInTheDocument();
});
```

Append to `src/__tests__/OrderTopBar.test.jsx` (inside the file, after the existing `describe` block):

```javascript
import { STATE_LABELS } from '../emailStates';

describe('OrderTopBar state progression', () => {
  test('pending advances to fulfilled (paid removed)', () => {
    render(<OrderTopBar {...baseProps} order={{ state: 'pending', orderId: 'X' }} />);
    // Next-state badge shows the friendly label for fulfilled
    expect(screen.getByText(STATE_LABELS.fulfilled)).toBeInTheDocument();
    expect(screen.queryByText('paid')).not.toBeInTheDocument();
  });

  test('hides move controls for an unknown state', () => {
    render(<OrderTopBar {...baseProps} order={{ state: 'paid', orderId: 'X' }} />);
    expect(screen.queryByRole('button', { name: /move to/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /move back/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- StateBadge OrderTopBar`
Expected: FAIL — `StateBadge` currently renders the raw key `shipped` (not `Shipped`); `STATE_LABELS.fulfilled` is undefined; and `OrderTopBar` still contains `paid` in `STATE_ORDER` without a nav guard.

- [ ] **Step 3: Make `emailStates.js` the full label source and expand `EMAIL_STATES`**

Replace the contents of `src/emailStates.js`:

```javascript
export const EMAIL_STATES = ['sent', 'pending', 'fulfilled', 'shipped', 'delayed'];

export const STATE_LABELS = {
  building: 'Building',
  sent: 'In Production',
  pending: 'Pending Print',
  fulfilled: 'Printed',
  received: 'In-Hand',
  shipped: 'Shipped',
  delayed: 'Delayed',
};
```

- [ ] **Step 4: Render labels in `StateBadge` and drop the `paid` color**

Replace the contents of `src/components/StateBadge.jsx`:

```javascript
import { STATE_LABELS } from '../emailStates';

export const STATE_COLORS = {
  building:  '#ef4444',
  sent:      '#f97316',
  pending:   '#eab308',
  fulfilled: '#3b82f6',
  received:  '#8b5cf6',
  shipped:   '#14b8a6',
  delayed:   '#f59e0b',
};

export default function StateBadge({ state, dimmed = false }) {
  const color = STATE_COLORS[state] || '#6b7280';
  return (
    <span
      className="state-badge"
      style={{ backgroundColor: color, opacity: dimmed ? 0.45 : 1 }}
    >
      {STATE_LABELS[state] || state}
    </span>
  );
}
```

- [ ] **Step 5: Update `STATE_ORDER` and add the nav guard in `OrderTopBar`**

In `src/components/OrderTopBar.jsx`, change line 5:

```javascript
const STATE_ORDER = ['building', 'sent', 'pending', 'fulfilled', 'received', 'shipped'];
```

Then replace the `nextState`/`prevState` derivation (lines 15-16) so an unknown state hides both controls:

```javascript
  const stateIndex = STATE_ORDER.indexOf(order?.state);
  const nextState = stateIndex === -1 ? undefined : STATE_ORDER[stateIndex + 1];
  const prevState = stateIndex === -1 ? undefined : STATE_ORDER[stateIndex - 1];
```

(The existing JSX already renders the "Move back" button only when `prevState` is truthy and the "Move to →" block only when `nextState` is truthy, so an unknown state now shows just the current badge.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- StateBadge OrderTopBar`
Expected: PASS — badge renders friendly labels, `pending → fulfilled` progression is shown, and unknown states hide the move controls.

- [ ] **Step 7: Run the full frontend suite for regressions**

Run: `npm test`
Expected: PASS — `CustomersPanel` and `StatusEmailsTab` (which read `STATE_LABELS[s]` for `EMAIL_STATES` members) still resolve every key; no test references `paid`.

- [ ] **Step 8: Commit**

```bash
git add src/emailStates.js src/components/StateBadge.jsx src/components/OrderTopBar.jsx src/__tests__/StateBadge.test.jsx src/__tests__/OrderTopBar.test.jsx
git commit -m "feat(orders): Pending Print/Printed state model, friendly badges, nav guard"
```

---

## Self-Review

**Spec coverage:**
- Part A email grouping (printed + blank, priority order, HTML + plain text) → Task 1. ✅
- `normalizeState` helper + apply on `sheets/router`, `orders/router`, `gmail/router` reads → Task 2. ✅
- `COUNTED_STATES` drops `paid` + normalize before check → Task 3. ✅
- `customerEmailBuilder` `PILLS`/`STATUS_LABELS`/`DEFAULT_TEMPLATES` for `pending`/`fulfilled` → Task 4. ✅
- `EMAIL_STATES` expanded in all three files (`emailStates.js` Task 6, `statusEmailStore.js` + `orderSheet.js` Task 5) → ✅
- Customers tab gains `Sent: pending` / `Sent: fulfilled` columns → Task 5 (+ read-range fix the spec omitted). ✅
- `STATE_ORDER` (remove `paid`), `STATE_LABELS`, `StateBadge` labels, `STATE_COLORS` drop `paid`, nav guard → Task 6. ✅
- Auto-send: no code change needed — `maybeAutoSendEmails` already fires for any `EMAIL_STATES` member; expanding `EMAIL_STATES` in Task 6 is sufficient. Confirmed against `src/components/OrderBuilder.jsx:220-224`. ✅

**Placeholder scan:** No TBD/TODO/"handle edge cases" placeholders; every code step shows complete code.

**Type consistency:** `normalizeState` signature identical in Tasks 2 and 3. `EMAIL_STATES` value identical across Tasks 5 and 6. `STATE_LABELS` keys in `emailStates.js` (Task 6) cover every state `StateBadge` and `OrderTopBar` render.

**Cross-task note:** Task 4 must precede Task 5 (so `statusEmailStore.defaults()` finds real `DEFAULT_TEMPLATES` for the new states). Tasks 1, 6 are independent of the others. Recommended order: 1 → 2 → 3 → 4 → 5 → 6.

## Non-goals
- Reworking the on-screen order preview grouping (`buildOrderPreviewText.js`).
- Changing `pending`'s color scheme beyond removing `paid`.
- Any Square work (separate track).
