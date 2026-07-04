# Blank Demand Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggregate demand across real orders (Item Type × Color × Size) and write it to a dedicated "RMC Blank Demand Stats" Google Sheet, refreshed on demand from the catalog view, so RMC can decide what blank shirts to stock.

**Architecture:** A pure `aggregate(orders, catalog)` function does all counting/classification with no I/O (fully unit-tested). A `blankStatsSheet` module owns the single reusable Google Sheet (create-once, ID persisted in `settings.json`; overwrite two tabs each refresh). A thin `stats` router reads local order caches, calls aggregate, and writes the sheet. Catalog items gain a `stockBlanks` boolean that splits rows into a **Shirts** tab and an **Other** tab. The frontend adds a "Refresh Blank Stats" button and a per-item "Stock blanks" checkbox to `ItemsTab`.

**Tech Stack:** Node/Express (CommonJS) backend with Jest + Supertest; React/Vite frontend with Vitest; Google Sheets/Drive via `googleapis` (mocked in tests).

## Global Constraints

- Backend is CommonJS (`require`/`module.exports`); frontend is ESM (`import`/`export`).
- Frontend never calls Google APIs directly — all Google access goes through the backend. (CLAUDE.md)
- All backend routes are guarded by `requireAuth`; mount new routers in `server/index.js`.
- Orders counted are those with `state ∈ {sent, pending, paid, fulfilled, received}`.
- Metric is **total ordered** = sum of each size's `total` (ignore `inventory`).
- Stats rows sorted by `total` descending; ties broken by `itemType`, then `color`, then `size`.
- Stats sheet name: `RMC Blank Demand Stats`, created in `config.DRIVE.TOP_LEVEL_FOLDER`.
- Stats sheet ID persisted as `blankStatsSheetId` in `server/settings.json` via the existing settings store.
- Backend test files live in `server/__tests__/`; frontend test files in `src/__tests__/`.
- Backend tests: `cd server && npm test`. Frontend tests: `npm test`.

---

### Task 1: Pure aggregation core

**Files:**
- Create: `server/stats/aggregate.js`
- Test: `server/__tests__/statsAggregate.test.js`

**Interfaces:**
- Consumes: nothing (pure function).
- Produces:
  - `COUNTED_STATES = ['sent', 'pending', 'paid', 'fulfilled', 'received']`
  - `aggregate(orders, catalog) -> { shirts: Row[], other: Row[] }`
    - `orders`: array of order objects shaped like `orders-cache/*.json` (`{ state, lineItems }`); each line item is `{ itemTypeName, itemTypeId, color, sizes: { [label]: { total, inventory } } }`.
    - `catalog`: `{ items: [{ id, name, stockBlanks }] }`.
    - `Row`: `{ itemType: string, color: string, size: string, total: number }`.

- [ ] **Step 1: Write the failing test**

```javascript
// server/__tests__/statsAggregate.test.js
const { aggregate, COUNTED_STATES } = require('../stats/aggregate');

const catalog = {
  items: [
    { id: 'tee1', name: 'Unisex Tee', stockBlanks: true },
    { id: 'mug1', name: 'Mug', stockBlanks: false },
  ],
};

function order(state, lineItems) {
  return { orderId: 'RMC-x', state, lineItems };
}

test('COUNTED_STATES is sent and beyond', () => {
  expect(COUNTED_STATES).toEqual(['sent', 'pending', 'paid', 'fulfilled', 'received']);
});

test('sums total per Item Type x Color x Size across counted orders', () => {
  const orders = [
    order('sent', [
      { itemTypeName: 'Unisex Tee', itemTypeId: 'tee1', color: 'Black',
        sizes: { L: { total: 10, inventory: 3 }, M: { total: 5, inventory: 0 } } },
    ]),
    order('paid', [
      { itemTypeName: 'Unisex Tee', itemTypeId: 'tee1', color: 'Black',
        sizes: { L: { total: 2, inventory: 0 } } },
    ]),
  ];
  const { shirts } = aggregate(orders, catalog);
  const blackL = shirts.find(r => r.color === 'Black' && r.size === 'L');
  expect(blackL.total).toBe(12); // 10 + 2, inventory ignored
  const blackM = shirts.find(r => r.color === 'Black' && r.size === 'M');
  expect(blackM.total).toBe(5);
});

test('excludes building orders; ignores sizes with total 0', () => {
  const orders = [
    order('building', [
      { itemTypeName: 'Unisex Tee', itemTypeId: 'tee1', color: 'Black',
        sizes: { L: { total: 99, inventory: 0 } } },
    ]),
    order('sent', [
      { itemTypeName: 'Unisex Tee', itemTypeId: 'tee1', color: 'Red',
        sizes: { S: { total: 0, inventory: 0 }, L: { total: 4, inventory: 0 } } },
    ]),
  ];
  const { shirts } = aggregate(orders, catalog);
  expect(shirts.find(r => r.color === 'Black')).toBeUndefined();
  expect(shirts.find(r => r.size === 'S')).toBeUndefined();
  expect(shirts.find(r => r.color === 'Red' && r.size === 'L').total).toBe(4);
});

test('classifies by stockBlanks flag; unmatched item types go to other', () => {
  const orders = [
    order('sent', [
      { itemTypeName: 'Unisex Tee', itemTypeId: 'tee1', color: 'Black', sizes: { L: { total: 3, inventory: 0 } } },
      { itemTypeName: 'Mug', itemTypeId: 'mug1', color: 'White', sizes: { OS: { total: 6, inventory: 0 } } },
      { itemTypeName: 'Mystery Hat', itemTypeId: '', color: 'Green', sizes: { OS: { total: 2, inventory: 0 } } },
    ]),
  ];
  const { shirts, other } = aggregate(orders, catalog);
  expect(shirts.map(r => r.itemType)).toEqual(['Unisex Tee']);
  expect(other.map(r => r.itemType).sort()).toEqual(['Mug', 'Mystery Hat']);
});

test('matches catalog by name when itemTypeId is absent', () => {
  const orders = [
    order('sent', [
      { itemTypeName: 'unisex tee', itemTypeId: '', color: 'Black', sizes: { L: { total: 1, inventory: 0 } } },
    ]),
  ];
  const { shirts } = aggregate(orders, catalog);
  expect(shirts).toHaveLength(1);
  expect(shirts[0].itemType).toBe('unisex tee');
});

test('counts blank (undecorated) line items', () => {
  const orders = [
    order('sent', [
      { itemTypeName: 'Unisex Tee', itemTypeId: 'tee1', color: 'Black',
        sizes: { L: { total: 7, inventory: 0 } }, frontDesigns: [], backDesigns: [] },
    ]),
  ];
  const { shirts } = aggregate(orders, catalog);
  expect(shirts[0].total).toBe(7);
});

test('sorts rows by total descending', () => {
  const orders = [
    order('sent', [
      { itemTypeName: 'Unisex Tee', itemTypeId: 'tee1', color: 'Black',
        sizes: { S: { total: 1, inventory: 0 }, L: { total: 9, inventory: 0 }, M: { total: 5, inventory: 0 } } },
    ]),
  ];
  const { shirts } = aggregate(orders, catalog);
  expect(shirts.map(r => r.total)).toEqual([9, 5, 1]);
});

test('missing color renders as (no color)', () => {
  const orders = [
    order('sent', [
      { itemTypeName: 'Unisex Tee', itemTypeId: 'tee1', color: '', sizes: { L: { total: 2, inventory: 0 } } },
    ]),
  ];
  const { shirts } = aggregate(orders, catalog);
  expect(shirts[0].color).toBe('(no color)');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- statsAggregate`
Expected: FAIL — `Cannot find module '../stats/aggregate'`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// server/stats/aggregate.js
const COUNTED_STATES = ['sent', 'pending', 'paid', 'fulfilled', 'received'];

function buildCatalogIndex(catalog) {
  const byId = new Map();
  const byName = new Map();
  for (const item of (catalog && catalog.items) || []) {
    if (item.id) byId.set(item.id, item);
    if (item.name) byName.set(item.name.toLowerCase(), item);
  }
  return { byId, byName };
}

function isShirt(lineItem, index) {
  const match =
    (lineItem.itemTypeId && index.byId.get(lineItem.itemTypeId)) ||
    (lineItem.itemTypeName && index.byName.get(lineItem.itemTypeName.toLowerCase()));
  return !!(match && match.stockBlanks === true);
}

function sortRows(rows) {
  return rows.sort((a, b) =>
    b.total - a.total ||
    a.itemType.localeCompare(b.itemType) ||
    a.color.localeCompare(b.color) ||
    a.size.localeCompare(b.size)
  );
}

function mapToRows(map) {
  return sortRows(Array.from(map.values()));
}

function aggregate(orders, catalog) {
  const index = buildCatalogIndex(catalog);
  const shirtMap = new Map(); // key -> Row
  const otherMap = new Map();

  for (const order of orders || []) {
    if (!COUNTED_STATES.includes(order.state)) continue;
    for (const li of order.lineItems || []) {
      const itemType = li.itemTypeName || li.apparelType || '(unknown)';
      const color = li.color || '(no color)';
      const target = isShirt(li, index) ? shirtMap : otherMap;
      for (const [size, v] of Object.entries(li.sizes || {})) {
        const total = (v && v.total) || 0;
        if (total <= 0) continue;
        const key = `${itemType} ${color} ${size}`;
        const row = target.get(key) || { itemType, color, size, total: 0 };
        row.total += total;
        target.set(key, row);
      }
    }
  }

  return { shirts: mapToRows(shirtMap), other: mapToRows(otherMap) };
}

module.exports = { aggregate, COUNTED_STATES };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- statsAggregate`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add server/stats/aggregate.js server/__tests__/statsAggregate.test.js
git commit -m "feat: add blank-demand aggregation core"
```

---

### Task 2: Read all order caches

**Files:**
- Modify: `server/orders/cache.js` (add `readAllOrderCaches`, export it)
- Test: `server/__tests__/cacheReadAll.test.js`

**Interfaces:**
- Consumes: `config.ORDERS_CACHE_DIR`.
- Produces: `readAllOrderCaches() -> Array<object>` — every parseable `*.json` in the orders cache dir; unreadable/corrupt files are skipped.

- [ ] **Step 1: Write the failing test**

```javascript
// server/__tests__/cacheReadAll.test.js
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { readAllOrderCaches } = require('../orders/cache');

const SEEDED = ['ZZTEST-001.json', 'ZZTEST-002.json', 'ZZTEST-bad.json'];

beforeAll(() => {
  fs.mkdirSync(config.ORDERS_CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(config.ORDERS_CACHE_DIR, 'ZZTEST-001.json'),
    JSON.stringify({ orderId: 'ZZTEST-001', state: 'sent' }));
  fs.writeFileSync(path.join(config.ORDERS_CACHE_DIR, 'ZZTEST-002.json'),
    JSON.stringify({ orderId: 'ZZTEST-002', state: 'building' }));
  fs.writeFileSync(path.join(config.ORDERS_CACHE_DIR, 'ZZTEST-bad.json'), '{ not valid json');
});

afterAll(() => {
  for (const f of SEEDED) {
    const p = path.join(config.ORDERS_CACHE_DIR, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

test('reads all parseable caches and skips corrupt files', () => {
  const all = readAllOrderCaches();
  const seeded = all.filter(o => o.orderId && o.orderId.startsWith('ZZTEST-'));
  expect(seeded.map(o => o.orderId).sort()).toEqual(['ZZTEST-001', 'ZZTEST-002']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- cacheReadAll`
Expected: FAIL — `readAllOrderCaches is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `server/orders/cache.js` (above `module.exports`):

```javascript
function readAllOrderCaches() {
  if (!fs.existsSync(config.ORDERS_CACHE_DIR)) return [];
  const orders = [];
  for (const file of fs.readdirSync(config.ORDERS_CACHE_DIR)) {
    if (!file.endsWith('.json')) continue;
    try {
      orders.push(JSON.parse(fs.readFileSync(path.join(config.ORDERS_CACHE_DIR, file), 'utf8')));
    } catch (err) {
      console.warn(`Skipping unreadable order cache ${file}:`, err.message);
    }
  }
  return orders;
}
```

Update the exports line:

```javascript
module.exports = { writeOrderCache, readOrderCache, deleteOrderCache, readAllOrderCaches };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- cacheReadAll`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/orders/cache.js server/__tests__/cacheReadAll.test.js
git commit -m "feat: add readAllOrderCaches helper"
```

---

### Task 3: Stats sheet lifecycle (create-once + write tabs)

**Files:**
- Create: `server/stats/blankStatsSheet.js`
- Test: `server/__tests__/blankStatsSheet.test.js`

**Interfaces:**
- Consumes:
  - `server/settings/store.js`: `readSettings()`, `writeSettings(settings)`.
  - `server/drive/client.js`: `createSpreadsheet(name, parentId) -> Promise<id>`.
  - `server/sheets/client.js`: `getSheetNames(id) -> Promise<string[]>`, `addSheet(id, title)`, `clearRange(id, range)`, `writeRange(id, range, values, inputOption)`.
  - `server/stats/aggregate.js` `Row` shape.
- Produces:
  - `getOrCreateStatsSheet() -> Promise<string>` (spreadsheet id; persists `blankStatsSheetId`).
  - `writeStats(sheetId, { shirts, other, orderCount, updatedAt }) -> Promise<void>`.
  - `SHEET_NAME = 'RMC Blank Demand Stats'`.

- [ ] **Step 1: Write the failing test**

```javascript
// server/__tests__/blankStatsSheet.test.js
jest.mock('../settings/store', () => ({ readSettings: jest.fn(), writeSettings: jest.fn() }));
jest.mock('../drive/client', () => ({ createSpreadsheet: jest.fn() }));
jest.mock('../sheets/client', () => ({
  getSheetNames: jest.fn(), addSheet: jest.fn(), clearRange: jest.fn(), writeRange: jest.fn(),
}));

const { readSettings, writeSettings } = require('../settings/store');
const { createSpreadsheet } = require('../drive/client');
const { getSheetNames, addSheet, clearRange, writeRange } = require('../sheets/client');
const { getOrCreateStatsSheet, writeStats, SHEET_NAME } = require('../stats/blankStatsSheet');

beforeEach(() => jest.clearAllMocks());

test('reuses stored sheet id when the sheet is reachable', async () => {
  readSettings.mockReturnValue({ blankStatsSheetId: 'existing123' });
  getSheetNames.mockResolvedValue(['Shirts', 'Other']);
  const id = await getOrCreateStatsSheet();
  expect(id).toBe('existing123');
  expect(createSpreadsheet).not.toHaveBeenCalled();
  expect(writeSettings).not.toHaveBeenCalled();
});

test('creates and persists a new sheet when none is stored', async () => {
  readSettings.mockReturnValue({});
  createSpreadsheet.mockResolvedValue('new456');
  const id = await getOrCreateStatsSheet();
  expect(createSpreadsheet).toHaveBeenCalledWith(SHEET_NAME, expect.any(String));
  expect(id).toBe('new456');
  expect(writeSettings).toHaveBeenCalledWith(expect.objectContaining({ blankStatsSheetId: 'new456' }));
});

test('recreates when the stored sheet is unreachable', async () => {
  readSettings.mockReturnValue({ blankStatsSheetId: 'gone789' });
  getSheetNames.mockRejectedValue(new Error('File not found'));
  createSpreadsheet.mockResolvedValue('fresh000');
  const id = await getOrCreateStatsSheet();
  expect(id).toBe('fresh000');
  expect(writeSettings).toHaveBeenCalledWith(expect.objectContaining({ blankStatsSheetId: 'fresh000' }));
});

test('writeStats ensures tabs, clears, and writes header + rows to both tabs', async () => {
  getSheetNames.mockResolvedValue([]); // neither tab exists yet
  await writeStats('sheetABC', {
    shirts: [{ itemType: 'Unisex Tee', color: 'Black', size: 'L', total: 42 }],
    other: [{ itemType: 'Mug', color: 'White', size: 'OS', total: 6 }],
    orderCount: 3,
    updatedAt: '2026-07-04 14:22',
  });
  expect(addSheet).toHaveBeenCalledWith('sheetABC', 'Shirts');
  expect(addSheet).toHaveBeenCalledWith('sheetABC', 'Other');
  expect(clearRange).toHaveBeenCalledWith('sheetABC', 'Shirts!A1:Z10000');
  const shirtsWrite = writeRange.mock.calls.find(c => c[1] === 'Shirts!A1');
  expect(shirtsWrite[2][0][0]).toContain('Last refreshed: 2026-07-04 14:22');
  expect(shirtsWrite[2][1]).toEqual(['Item Type', 'Color', 'Size', 'Total Ordered']);
  expect(shirtsWrite[2][2]).toEqual(['Unisex Tee', 'Black', 'L', 42]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- blankStatsSheet`
Expected: FAIL — `Cannot find module '../stats/blankStatsSheet'`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// server/stats/blankStatsSheet.js
const { readSettings, writeSettings } = require('../settings/store');
const { createSpreadsheet } = require('../drive/client');
const { getSheetNames, addSheet, clearRange, writeRange } = require('../sheets/client');
const config = require('../config');

const SHEET_NAME = 'RMC Blank Demand Stats';
const TABS = ['Shirts', 'Other'];
const HEADER = ['Item Type', 'Color', 'Size', 'Total Ordered'];

async function isReachable(sheetId) {
  try { await getSheetNames(sheetId); return true; }
  catch { return false; }
}

async function createAndPersist() {
  const id = await createSpreadsheet(SHEET_NAME, config.DRIVE.TOP_LEVEL_FOLDER);
  writeSettings({ ...readSettings(), blankStatsSheetId: id });
  return id;
}

async function getOrCreateStatsSheet() {
  const existing = readSettings().blankStatsSheetId;
  if (existing && (await isReachable(existing))) return existing;
  return createAndPersist();
}

async function ensureTab(sheetId, title, existingNames) {
  if (!existingNames.includes(title)) await addSheet(sheetId, title);
}

function rowsToValues(rows, orderCount, updatedAt) {
  const banner = `Last refreshed: ${updatedAt} · ${orderCount} orders counted`;
  const values = [[banner], HEADER];
  for (const r of rows) values.push([r.itemType, r.color, r.size, r.total]);
  return values;
}

async function writeStats(sheetId, { shirts, other, orderCount, updatedAt }) {
  const names = await getSheetNames(sheetId);
  await ensureTab(sheetId, 'Shirts', names);
  await ensureTab(sheetId, 'Other', names);
  const byTab = { Shirts: shirts, Other: other };
  for (const tab of TABS) {
    await clearRange(sheetId, `${tab}!A1:Z10000`);
    await writeRange(sheetId, `${tab}!A1`, rowsToValues(byTab[tab], orderCount, updatedAt), 'RAW');
  }
}

module.exports = { getOrCreateStatsSheet, writeStats, SHEET_NAME };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- blankStatsSheet`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/stats/blankStatsSheet.js server/__tests__/blankStatsSheet.test.js
git commit -m "feat: add blank stats sheet create-once + write"
```

---

### Task 4: Stats router + mount

**Files:**
- Create: `server/stats/router.js`
- Modify: `server/index.js` (mount `/stats`)
- Test: `server/__tests__/statsRouter.test.js`

**Interfaces:**
- Consumes:
  - `server/orders/cache.js`: `readAllOrderCaches()`.
  - `server/items/store.js`: `readCatalog()`.
  - `server/stats/aggregate.js`: `aggregate(orders, catalog)`.
  - `server/stats/blankStatsSheet.js`: `getOrCreateStatsSheet()`, `writeStats(...)`.
- Produces: `POST /api/stats/refresh` → `{ sheetId, sheetUrl, orderCount, rowCount, updatedAt }`.

- [ ] **Step 1: Write the failing test**

```javascript
// server/__tests__/statsRouter.test.js
const request = require('supertest');

jest.mock('../auth/oauth', () => ({
  loadTokens: () => ({ refresh_token: 'x' }),
  getOAuth2Client: () => ({}),
}));
jest.mock('../orders/cache', () => ({
  readOrderCache: jest.fn(), writeOrderCache: jest.fn(), deleteOrderCache: jest.fn(),
  readAllOrderCaches: jest.fn(),
}));
jest.mock('../items/store', () => ({ readCatalog: jest.fn(), writeCatalog: jest.fn() }));
jest.mock('../stats/blankStatsSheet', () => ({
  getOrCreateStatsSheet: jest.fn(), writeStats: jest.fn(), SHEET_NAME: 'RMC Blank Demand Stats',
}));

const { readAllOrderCaches } = require('../orders/cache');
const { readCatalog } = require('../items/store');
const { getOrCreateStatsSheet, writeStats } = require('../stats/blankStatsSheet');

function getApp() { return require('../index'); }
beforeEach(() => jest.clearAllMocks());

test('POST /stats/refresh aggregates, writes, and returns a summary', async () => {
  readAllOrderCaches.mockReturnValue([
    { state: 'sent', lineItems: [
      { itemTypeName: 'Unisex Tee', itemTypeId: 'tee1', color: 'Black', sizes: { L: { total: 4, inventory: 0 } } },
    ] },
    { state: 'building', lineItems: [
      { itemTypeName: 'Unisex Tee', itemTypeId: 'tee1', color: 'Black', sizes: { L: { total: 99, inventory: 0 } } },
    ] },
  ]);
  readCatalog.mockReturnValue({ items: [{ id: 'tee1', name: 'Unisex Tee', stockBlanks: true }] });
  getOrCreateStatsSheet.mockResolvedValue('sheetXYZ');
  writeStats.mockResolvedValue();

  const res = await request(getApp()).post('/stats/refresh');
  expect(res.status).toBe(200);
  expect(res.body.sheetId).toBe('sheetXYZ');
  expect(res.body.sheetUrl).toBe('https://docs.google.com/spreadsheets/d/sheetXYZ');
  expect(res.body.orderCount).toBe(1); // building excluded
  expect(res.body.rowCount).toBe(1);

  const payload = writeStats.mock.calls[0][1];
  expect(payload.shirts[0]).toEqual({ itemType: 'Unisex Tee', color: 'Black', size: 'L', total: 4 });
  expect(payload.orderCount).toBe(1);
});

test('POST /stats/refresh returns 500 with the message when writing fails', async () => {
  readAllOrderCaches.mockReturnValue([]);
  readCatalog.mockReturnValue({ items: [] });
  getOrCreateStatsSheet.mockRejectedValue(new Error('Drive is down'));

  const res = await request(getApp()).post('/stats/refresh');
  expect(res.status).toBe(500);
  expect(res.body.error).toBe('Drive is down');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- statsRouter`
Expected: FAIL — `Cannot find module '../stats/router'` (thrown when `index.js` mounts it), or route 404 before the mount is added.

- [ ] **Step 3: Write minimal implementation**

Create `server/stats/router.js`:

```javascript
const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { readAllOrderCaches } = require('../orders/cache');
const { readCatalog } = require('../items/store');
const { aggregate, COUNTED_STATES } = require('./aggregate');
const { getOrCreateStatsSheet, writeStats } = require('./blankStatsSheet');

const router = express.Router();
router.use(requireAuth);

function formatTimestamp(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

router.post('/refresh', async (_req, res) => {
  try {
    const orders = readAllOrderCaches();
    const catalog = readCatalog();
    const orderCount = orders.filter(o => COUNTED_STATES.includes(o.state)).length;
    const { shirts, other } = aggregate(orders, catalog);
    const updatedAt = formatTimestamp(new Date());

    const sheetId = await getOrCreateStatsSheet();
    await writeStats(sheetId, { shirts, other, orderCount, updatedAt });

    res.json({
      sheetId,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}`,
      orderCount,
      rowCount: shirts.length + other.length,
      updatedAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

Mount in `server/index.js` after the `/inventory` line:

```javascript
app.use('/stats', require('./stats/router'));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- statsRouter`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add server/stats/router.js server/index.js server/__tests__/statsRouter.test.js
git commit -m "feat: add POST /stats/refresh route"
```

---

### Task 5: `stockBlanks` default on new catalog items

**Files:**
- Modify: `server/items/router.js:18` (POST handler default item)
- Test: `server/__tests__/itemsStockBlanks.test.js`

**Interfaces:**
- Consumes: existing items router.
- Produces: new items include `stockBlanks: false`.

- [ ] **Step 1: Write the failing test**

```javascript
// server/__tests__/itemsStockBlanks.test.js
const request = require('supertest');

jest.mock('../auth/oauth', () => ({
  loadTokens: () => ({ refresh_token: 'x' }),
  getOAuth2Client: () => ({}),
}));
jest.mock('../items/store', () => {
  let catalog = { items: [] };
  return {
    readCatalog: jest.fn(() => catalog),
    writeCatalog: jest.fn(c => { catalog = c; }),
  };
});

function getApp() { return require('../index'); }
beforeEach(() => jest.clearAllMocks());

test('POST /items creates an item with stockBlanks false by default', async () => {
  const res = await request(getApp()).post('/items').send({ name: 'Unisex Tee' });
  expect(res.status).toBe(200);
  expect(res.body.stockBlanks).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- itemsStockBlanks`
Expected: FAIL — `res.body.stockBlanks` is `undefined`, not `false`.

- [ ] **Step 3: Write minimal implementation**

In `server/items/router.js`, change the POST default item (currently line 20):

```javascript
  const item = { id: createId(), name, supplierUrl: '', colors: [], sizes: [], decorationMethods: [], stockBlanks: false };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- itemsStockBlanks`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/items/router.js server/__tests__/itemsStockBlanks.test.js
git commit -m "feat: default stockBlanks false on new catalog items"
```

---

### Task 6: Frontend stats API wrapper

**Files:**
- Create: `src/api/stats.js`
- Test: `src/__tests__/statsApi.test.js`

**Interfaces:**
- Consumes: `src/api/client.js` `apiFetch(path, options)`.
- Produces: `refreshBlankStats() -> Promise<{ sheetId, sheetUrl, orderCount, rowCount, updatedAt }>`.

- [ ] **Step 1: Write the failing test**

```javascript
// src/__tests__/statsApi.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch } from '../api/client';
import { refreshBlankStats } from '../api/stats';

vi.mock('../api/client', () => ({ apiFetch: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe('refreshBlankStats', () => {
  it('POSTs to /stats/refresh and returns the summary', async () => {
    apiFetch.mockResolvedValue({ sheetId: 's1', sheetUrl: 'u', orderCount: 3, rowCount: 10, updatedAt: 't' });
    const result = await refreshBlankStats();
    expect(apiFetch).toHaveBeenCalledWith('/stats/refresh', { method: 'POST' });
    expect(result.orderCount).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- statsApi`
Expected: FAIL — cannot resolve `../api/stats`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/api/stats.js
import { apiFetch } from './client';

export function refreshBlankStats() {
  return apiFetch('/stats/refresh', { method: 'POST' });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- statsApi`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/stats.js src/__tests__/statsApi.test.js
git commit -m "feat: add refreshBlankStats api wrapper"
```

---

### Task 7: Catalog UI — "Stock blanks" checkbox + "Refresh Blank Stats" button

**Files:**
- Modify: `src/components/ItemsTab.jsx`

**Interfaces:**
- Consumes: `refreshBlankStats` from `src/api/stats.js`; existing `updateField`, `setToast`, `logError`, `selectedItem`.
- Produces: UI only (verified manually).

- [ ] **Step 1: Add the import and refresh handler**

At the top of `src/components/ItemsTab.jsx`, add after the existing `getInventoryStyles` import:

```javascript
import { refreshBlankStats } from '../api/stats';
```

Inside the `ItemsTab` component, add state near the other `useState` calls:

```javascript
  const [refreshing, setRefreshing] = useState(false);
```

Add a handler alongside `handlePush`/`handlePull`:

```javascript
  async function handleRefreshStats() {
    setRefreshing(true);
    try {
      const r = await refreshBlankStats();
      setToast(`Updated ${r.rowCount} rows across ${r.orderCount} orders.`);
      window.open(r.sheetUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      const msg = `Refresh stats failed: ${err.message}`;
      setToast(msg); logError(msg);
    } finally {
      setRefreshing(false);
    }
  }
```

- [ ] **Step 2: Add the button to the sync bar**

Replace the `items-sync-bar` block (currently lines ~249-252) with:

```javascript
      <div className="items-sync-bar">
        <button className="btn-secondary" onClick={handlePush}>⬆ Push to Drive</button>
        <button className="btn-secondary items-pull-btn" onClick={() => setConfirmPull(true)}>⬇ Pull from Drive</button>
        <button className="btn-secondary" onClick={handleRefreshStats} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : '📊 Refresh Blank Stats'}
        </button>
      </div>
```

- [ ] **Step 3: Add the "Stock blanks" checkbox**

Immediately after the Name `field-group` block (currently ends at line ~279), add:

```javascript
              <div className="field-group">
                <label>
                  <input
                    type="checkbox"
                    checked={!!selectedItem.stockBlanks}
                    onChange={e => updateField('stockBlanks', e.target.checked)}
                  />
                  {' '}Stock blanks (include in blank demand stats)
                </label>
              </div>
```

- [ ] **Step 4: Verify the full suite still passes**

Run: `npm test` (frontend) — expect no new failures.
Run: `cd server && npm test` — expect Task 1–5 suites green (pre-existing `emailBuilder`/`drive` failures unrelated; see plan note).

- [ ] **Step 5: Manual verification**

1. Restart the backend: stop the running `node index.js`, then `cd server && node index.js`.
2. Start the frontend (`npm run dev`) if not running; open http://localhost:5175.
3. Go to the Items/catalog tab. Confirm each item shows a "Stock blanks" checkbox; check it for a shirt item and confirm it persists after reselecting the item.
4. Click "📊 Refresh Blank Stats". Confirm a toast like "Updated N rows across M orders." appears and a new browser tab opens the "RMC Blank Demand Stats" sheet with **Shirts** and **Other** tabs, a "Last refreshed…" banner, `Item Type | Color | Size | Total Ordered` header, and rows sorted by Total Ordered descending.
5. Click Refresh again; confirm it reuses the same sheet (no duplicate created in Drive) and overwrites the rows.

- [ ] **Step 6: Commit**

```bash
git add src/components/ItemsTab.jsx
git commit -m "feat: add stock-blanks checkbox and refresh-stats button to catalog"
```

---

## Self-Review

**Spec coverage:**
- Granularity Type×Color×Size — Task 1 (`aggregate` keys on itemType+color+size). ✓
- Orders counted = sent+ — Task 1 `COUNTED_STATES`; Task 4 orderCount filter. ✓
- Metric total ordered, ignore inventory — Task 1 uses `v.total` only. ✓
- Shirt classification via `stockBlanks` flag → Shirts/Other tabs — Task 1 `isShirt`, Task 3 two tabs, Task 5 default, Task 7 checkbox. ✓
- Manual refresh button in catalog view — Task 6 API, Task 7 button. ✓
- Data source = local order caches — Task 2 `readAllOrderCaches`, Task 4 wiring. ✓
- Create-once sheet, ID in settings.json, recreate if missing — Task 3. ✓
- Sort by demand descending — Task 1 `sortRows`. ✓
- Sheet layout (banner + header + rows), both tabs overwritten — Task 3 `writeStats`. ✓
- Error handling: skip corrupt caches (Task 2), recreate missing sheet (Task 3), 500 with message (Task 4), no qualifying orders → empty tabs + orderCount 0 (Task 3/4). ✓
- Tests: aggregate unmocked (Task 1), sheet get-or-create mocked (Task 3). ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `Row = { itemType, color, size, total }` used identically in Tasks 1, 3, 4. `writeStats(sheetId, { shirts, other, orderCount, updatedAt })` matches between Tasks 3 and 4. `refreshBlankStats()` return shape matches router response in Tasks 4, 6, 7. ✓
