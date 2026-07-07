# Blank Order Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Blank Order" path to RMCOrder that turns Square sales data into a recommended blank-apparel purchase and generates a normal all-blanks order.

**Architecture:** A new self-contained server module `server/blankorder/` ports the external Python toolkit's pure logic (CSV-diff velocity feed + largest-remainder allocation) behind a swappable demand-source interface. The frontend adds a New Order popup (Custom vs Blank), a two-step Blank Order flow (parameters → three-column curve table), and "Generate Order," which collapses the chosen column into blank line items on a brand-new order created through the existing order machinery.

**Tech Stack:** Backend Express (CommonJS, Jest + Supertest). Frontend React 19 + Vite (ESM, Vitest + React Testing Library). No new runtime dependencies.

## Global Constraints

- Backend is CommonJS (`require`/`module.exports`); frontend is ESM (`import`).
- All frontend API calls go through `src/api/client.js` `apiFetch` (path prefix `/api`, proxied to `http://localhost:3001`). The frontend never calls Google APIs directly.
- All backend routers use `requireAuth` middleware.
- Row type used throughout: `Row = { itemType, color, size, qty }` where `itemType` is the calc **style key** (`"Unisex Shirt" | "Youth Shirt" | "Tank"`).
- Line item shape: `{ num, itemTypeName, itemTypeId, color, sizes: { [size]: { total, inventory } }, frontDesigns: [], backDesigns: [], frontMethod, backMethod, frontNotes, backNotes }`. **Blank = `frontDesigns` and `backDesigns` both empty.**
- Size ordering: `["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]`.
- Backend tests: `cd server && npm test`. Frontend tests: `npm test` (from repo root).
- The port must reproduce the Python numbers exactly: Hamilton (largest-remainder) rounding, core-color floor with **Python banker's rounding** (`round-half-to-even`), color aliases/exclusions, excluded sizes.

---

## File Structure

**New — backend (`server/blankorder/`):**
- `calc.js` — pure allocation logic (port of `blank_calc.py`): `allocate`, `styleKey`, `normalize`, `buildDemand`, `curveFor`, `planRows`, `computePlans`.
- `delta.js` — CSV parse + velocity feed (port of `delta.py`): `parseCsv`, `computeVelocity`.
- `demandSource.js` — `fromCsvUpload(csvOld, csvNew)`, `fromSquare(range)` (Phase-2 stub).
- `config.js` — `readBlankOrderConfig()` (defaults + file merge), `DEFAULTS`.
- `blankOrderConfig.json` — seeded policy config (written on first run if absent).
- `router.js` — `POST /blankorder/plan`, `GET /blankorder/config`.

**New — backend tests (`server/__tests__/`):**
- `blankorderCalc.test.js`, `blankorderDelta.test.js`, `blankorderConfig.test.js`, `blankorderRouter.test.js`
- `fixtures/blankorder/` — copied feed, config, and expected recommendation JSONs.

**New — frontend:**
- `src/api/blankOrder.js` — `computeBlankPlan(payload)`, `getBlankOrderConfig()`.
- `src/utils/blankRowsToLineItems.js` — collapse Working rows → line items.
- `src/components/NewOrderDialog.jsx` — Custom vs Blank popup.
- `src/components/BlankOrderFlow.jsx` — the two-step flow container + Generate.
- `src/components/BlankOrderParams.jsx` — Step 1 parameters form.
- `src/components/BlankOrderTable.jsx` — Step 2 three-column table.

**New — frontend tests (`src/__tests__/`):**
- `blankRowsToLineItems.test.js`, `blankOrderApi.test.js`, `NewOrderDialog.test.jsx`, `BlankOrderTable.test.jsx`, `BlankOrderFlow.test.jsx`

**Modified:**
- `server/config.js` — add `BLANK_ORDER_CONFIG_FILE`.
- `server/index.js` — mount `/blankorder`.
- `src/App.jsx` — add `/blank-order` route.
- `src/components/OrdersList.jsx` — "+ New Order" opens `NewOrderDialog`.

---

## Task 1: `calc.js` — `allocate()` (largest-remainder rounding)

**Files:**
- Create: `server/blankorder/calc.js`
- Test: `server/__tests__/blankorderCalc.test.js`

**Interfaces:**
- Produces: `allocate(weights: {[k]: number}, total: number, floors?: {[k]: number}) → {[k]: number}` — non-negative ints, exact sum `== total` (when `total >= 0`), floors reserved first. Also exports `pyRound(n) → number` (round half to even) and `SIZE_ORDER: {[size]: number}`.

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/blankorderCalc.test.js
const { allocate, pyRound } = require('../blankorder/calc');

describe('pyRound (banker rounding)', () => {
  test('rounds half to even', () => {
    expect(pyRound(0.5)).toBe(0);
    expect(pyRound(1.5)).toBe(2);
    expect(pyRound(2.5)).toBe(2);
    expect(pyRound(3.5)).toBe(4);
    expect(pyRound(2.4)).toBe(2);
  });
});

describe('allocate', () => {
  test('splits by weight and sums exactly', () => {
    const r = allocate({ a: 1, b: 1, c: 2 }, 8);
    expect(r.a + r.b + r.c).toBe(8);
    expect(r.c).toBeGreaterThanOrEqual(r.a);
  });
  test('reserves floors first', () => {
    const r = allocate({ a: 0, b: 10 }, 10, { a: 2 });
    expect(r.a).toBe(2);
    expect(r.b).toBe(8);
  });
  test('floors exceeding total are handed out by largest floor', () => {
    const r = allocate({ a: 1, b: 1 }, 3, { a: 5, b: 1 });
    expect(r.a).toBe(2);
    expect(r.b).toBe(1);
  });
  test('no demand signal spreads evenly by sorted key', () => {
    const r = allocate({ b: 0, a: 0 }, 3);
    expect(r.a + r.b).toBe(3);
    expect(r.a).toBe(2); // 'a' sorts first, gets the extra
  });
  test('zero total yields all zeros', () => {
    expect(allocate({ a: 1, b: 1 }, 0)).toEqual({ a: 0, b: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --testPathPattern=blankorderCalc`
Expected: FAIL — `Cannot find module '../blankorder/calc'`.

- [ ] **Step 3: Write minimal implementation**

```js
// server/blankorder/calc.js
const SIZE_ORDER = {};
['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'].forEach((s, i) => { SIZE_ORDER[s] = i; });

// Python's round(): round half to even (banker's rounding).
function pyRound(n) {
  const floor = Math.floor(n);
  const diff = n - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

// Ascending string compare matching Python's default (code-point order for ASCII).
function byKey(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

function allocate(weights, total, floors) {
  const keys = Object.keys(weights);
  const result = {};
  for (const k of keys) result[k] = 0;
  if (total <= 0 || keys.length === 0) return result;

  const fl = {};
  for (const k of keys) fl[k] = floors ? Math.trunc(floors[k] || 0) : 0;

  const reserved = keys.reduce((s, k) => s + fl[k], 0);
  if (reserved > total) {
    const order = [...keys].sort((a, b) => (fl[b] - fl[a]) || byKey(a, b));
    let left = total;
    for (const k of order) {
      const give = Math.min(fl[k], left);
      result[k] += give;
      left -= give;
    }
    return result;
  }
  for (const k of keys) result[k] += fl[k];

  const remaining = total - reserved;
  const wsum = keys.reduce((s, k) => s + Math.max(0, weights[k]), 0);
  if (remaining <= 0) return result;
  if (wsum <= 0) {
    const order = [...keys].sort(byKey);
    for (let i = 0; i < remaining; i++) result[order[i % order.length]] += 1;
    return result;
  }
  const exact = {};
  for (const k of keys) exact[k] = (remaining * Math.max(0, weights[k])) / wsum;
  const floorAlloc = {};
  for (const k of keys) floorAlloc[k] = Math.floor(exact[k]);
  for (const k of keys) result[k] += floorAlloc[k];
  let leftover = remaining - keys.reduce((s, k) => s + floorAlloc[k], 0);
  const frac = [...keys].sort((a, b) =>
    ((exact[b] - floorAlloc[b]) - (exact[a] - floorAlloc[a])) || byKey(a, b));
  for (let i = 0; i < leftover; i++) result[frac[i % frac.length]] += 1;
  return result;
}

module.exports = { SIZE_ORDER, pyRound, allocate };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- --testPathPattern=blankorderCalc`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add server/blankorder/calc.js server/__tests__/blankorderCalc.test.js
git commit -m "feat(blankorder): add largest-remainder allocate() with banker rounding"
```

---

## Task 2: `calc.js` — demand model (`styleKey`, `buildDemand`, `curveFor`)

**Files:**
- Modify: `server/blankorder/calc.js`
- Test: `server/__tests__/blankorderCalc.test.js`

**Interfaces:**
- Consumes: `allocate`, `SIZE_ORDER` from Task 1.
- Produces:
  - `styleKey(itemType, style) → string`
  - `normalize(obj) → obj` (values sum to 1, or `{}` if empty)
  - `buildDemand(feed, config) → { styles: {[sk]: n}, colors: {[sk]: {[color]: n}}, sizes: {[sk]: {[size]: n}} }`
  - `curveFor(style, mode, observedSizes, config, perTypeSizeRestrictions) → {[size]: share}`

- [ ] **Step 1: Write the failing test**

```js
// append to server/__tests__/blankorderCalc.test.js
const { styleKey, buildDemand, curveFor } = require('../blankorder/calc');

const CFG = {
  sizeCurves: { industry: { XS: 1, S: 10, M: 23, L: 31, XL: 23, '2XL': 9, '3XL': 3 } },
  styleCurves: {},
  blendWeight: 0.5,
  colorAliases: { Ash: 'Heather Gray' },
  excludedColors: ['Daisy'],
  excludedSizes: ['XS', 'S', '3XL', '4XL', '5XL'],
  coreColors: ['Black', 'White'],
  coreColorFloorPct: 0.1,
  manualHistory: [],
};

describe('styleKey', () => {
  test('maps apparel to blank buckets', () => {
    expect(styleKey('Shirt', 'UM')).toBe('Unisex Shirt');
    expect(styleKey('Shirt', 'Y')).toBe('Youth Shirt');
    expect(styleKey('Tank', '')).toBe('Tank');
  });
});

describe('buildDemand', () => {
  const feed = { velocity: [
    { itemType: 'Shirt', style: 'UM', color: 'Ash', size: 'L', unitsSold: 4, isApparel: true },
    { itemType: 'Shirt', style: 'UM', color: 'Daisy', size: 'M', unitsSold: 2, isApparel: true },
    { itemType: 'Sticker', style: '', color: '', size: '', unitsSold: 9, isApparel: false },
  ] };
  test('applies aliases, drops excluded colors and non-apparel', () => {
    const { styles, colors } = buildDemand(feed, CFG);
    expect(styles['Unisex Shirt']).toBe(4);            // Daisy row dropped
    expect(colors['Unisex Shirt']['Heather Gray']).toBe(4); // Ash -> Heather Gray
    expect(colors['Unisex Shirt'].Daisy).toBeUndefined();
  });
});

describe('curveFor', () => {
  test('industry mode drops excluded sizes and renormalizes to 1', () => {
    const c = curveFor('Unisex Shirt', 'industry', {}, CFG, {});
    expect(c.XS).toBeUndefined();
    expect(c['3XL']).toBeUndefined();
    const sum = Object.values(c).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1, 9);
  });
  test('per-type size restriction removes additional sizes', () => {
    const c = curveFor('Tank', 'industry', {}, CFG, { Tank: ['2XL'] });
    expect(c['2XL']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --testPathPattern=blankorderCalc`
Expected: FAIL — `styleKey is not a function` (not yet exported).

- [ ] **Step 3: Write minimal implementation**

Add to `server/blankorder/calc.js` (above `module.exports`):

```js
function styleKey(itemType, style) {
  const it = (itemType || '').trim();
  const st = (style || '').trim().toUpperCase();
  if (it === 'Tank') return 'Tank';
  if (it === 'Shirt') {
    if (st === 'UM') return 'Unisex Shirt';
    if (st === 'Y') return 'Youth Shirt';
  }
  return `${it} ${style || ''}`.trim() || '(unknown)';
}

function normalize(d) {
  const total = Object.values(d).reduce((s, v) => s + v, 0);
  if (!total) return {};
  const out = {};
  for (const [k, v] of Object.entries(d)) out[k] = v / total;
  return out;
}

function cleanObj(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) if (!k.startsWith('_')) out[k] = v;
  return out;
}

function buildDemand(feed, config) {
  const aliases = cleanObj(config.colorAliases);
  const excluded = new Set(config.excludedColors || []);
  const styles = {}, colors = {}, sizes = {};
  const rows = [...((feed && feed.velocity) || []), ...(config.manualHistory || [])];
  for (const r of rows) {
    if (!r.itemType) continue;
    if (r.isApparel === false) continue;
    if (r.isApparel == null && r.itemType !== 'Shirt' && r.itemType !== 'Tank') continue;
    let color = (r.color || '').trim();
    color = aliases[color] || color;
    if (excluded.has(color)) continue;
    const units = r.unitsSold || 0;
    if (units <= 0) continue;
    const sk = styleKey(r.itemType, r.style);
    const size = (r.size || '').trim();
    styles[sk] = (styles[sk] || 0) + units;
    colors[sk] = colors[sk] || {};
    if (color) colors[sk][color] = (colors[sk][color] || 0) + units;
    sizes[sk] = sizes[sk] || {};
    if (size) sizes[sk][size] = (sizes[sk][size] || 0) + units;
  }
  return { styles, colors, sizes };
}

function curveFor(style, mode, observedSizes, config, perTypeSizeRestrictions) {
  const curves = config.sizeCurves || {};
  const styleCurveNames = cleanObj(config.styleCurves);
  const curveName = styleCurveNames[style] || 'industry';
  const industry = normalize(cleanObj(curves[curveName] || {}));

  let result;
  if (mode === 'industry') {
    result = industry;
  } else {
    const observed = normalize(observedSizes);
    if (Object.keys(observed).length === 0) {
      result = industry;
    } else {
      const w = Number(config.blendWeight != null ? config.blendWeight : 0.5);
      const allSizes = new Set([...Object.keys(industry), ...Object.keys(observed)]);
      const blended = {};
      for (const s of allSizes) blended[s] = w * (observed[s] || 0) + (1 - w) * (industry[s] || 0);
      result = normalize(blended);
    }
  }

  const excluded = new Set([
    ...(config.excludedSizes || []),
    ...((perTypeSizeRestrictions && perTypeSizeRestrictions[style]) || []),
  ]);
  if (excluded.size) {
    const filtered = {};
    for (const [s, v] of Object.entries(result)) if (!excluded.has(s)) filtered[s] = v;
    result = normalize(filtered);
    if (Object.keys(result).length === 0) {
      throw new Error(`Size restrictions removed every size for style '${style}'.`);
    }
  }
  return result;
}
```

Update `module.exports` to include the new functions:

```js
module.exports = { SIZE_ORDER, pyRound, allocate, styleKey, normalize, buildDemand, curveFor };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- --testPathPattern=blankorderCalc`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/blankorder/calc.js server/__tests__/blankorderCalc.test.js
git commit -m "feat(blankorder): add demand model and size-curve logic"
```

---

## Task 3: `calc.js` — `planRows` + `computePlans` (verified against Python fixtures)

**Files:**
- Modify: `server/blankorder/calc.js`
- Create fixtures: `server/__tests__/fixtures/blankorder/catalog_delta.json`, `recommended_order_22.json`, `recommended_order_50.json`, `recommended_order_100.json`, `blank_calc_config.json`
- Test: `server/__tests__/blankorderCalc.test.js`

**Interfaces:**
- Consumes: everything from Tasks 1–2.
- Produces:
  - `planRows(mode, styles, colors, sizes, config, { grandTotal, perTypeTotals, perTypeSizeRestrictions }) → { rows: Row[], effectiveTotal: number }`
  - `computePlans(feed, config, opts) → { industry: Row[], blended: Row[], effectiveTotal: number }`

- [ ] **Step 1: Copy fixtures from the toolkit**

```bash
mkdir -p server/__tests__/fixtures/blankorder
cp "/c/PERSONAL_INTEREST/RockyMeowtainCompanyLLC/Inventory/catalog_delta_2026-07-04_to_2026-07-06.json" server/__tests__/fixtures/blankorder/catalog_delta.json
cp "/c/PERSONAL_INTEREST/RockyMeowtainCompanyLLC/Inventory/blank_calc_config.json" server/__tests__/fixtures/blankorder/blank_calc_config.json
cp "/c/PERSONAL_INTEREST/RockyMeowtainCompanyLLC/Inventory/recommended_order_22.json" server/__tests__/fixtures/blankorder/recommended_order_22.json
cp "/c/PERSONAL_INTEREST/RockyMeowtainCompanyLLC/Inventory/recommended_order_50.json" server/__tests__/fixtures/blankorder/recommended_order_50.json
cp "/c/PERSONAL_INTEREST/RockyMeowtainCompanyLLC/Inventory/recommended_order_100.json" server/__tests__/fixtures/blankorder/recommended_order_100.json
```

> If a fixture is stale relative to `blank_calc_config.json`, regenerate it:
> `cd /c/PERSONAL_INTEREST/RockyMeowtainCompanyLLC/Inventory && python blank_calc.py --total 22 && python blank_calc.py --total 50 && python blank_calc.py --total 100`, then re-copy.

- [ ] **Step 2: Write the failing test**

```js
// append to server/__tests__/blankorderCalc.test.js
const fs = require('fs');
const path = require('path');
const { computePlans } = require('../blankorder/calc');

const FX = path.join(__dirname, 'fixtures', 'blankorder');
const feed = JSON.parse(fs.readFileSync(path.join(FX, 'catalog_delta.json'), 'utf8'));
const fxConfig = JSON.parse(fs.readFileSync(path.join(FX, 'blank_calc_config.json'), 'utf8'));

// The Python recommendation JSON rows are {itemType, style, color, size, total};
// our Row is {itemType: styleKey, color, size, qty}. Normalize both to a sorted
// comparable form keyed on style+color+size.
function norm(rows, useStyle) {
  return rows
    .map(r => ({
      k: `${useStyle ? r.style : r.itemType} ${r.color} ${r.size}`,
      qty: useStyle ? r.total : r.qty,
    }))
    .filter(r => r.qty > 0)
    .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
}

describe.each([22, 50, 100])('computePlans matches Python for total=%i', (total) => {
  const expected = JSON.parse(fs.readFileSync(path.join(FX, `recommended_order_${total}.json`), 'utf8'));
  const { industry, blended, effectiveTotal } = computePlans(feed, fxConfig, {
    grandTotal: total, perTypeTotals: {}, perTypeSizeRestrictions: {},
  });
  test('industry matches', () => {
    expect(norm(industry, false)).toEqual(norm(expected.industry, true));
  });
  test('blended matches', () => {
    expect(norm(blended, false)).toEqual(norm(expected.blended, true));
  });
  test('effectiveTotal equals grand total', () => {
    expect(effectiveTotal).toBe(total);
  });
});

describe('per-type total override', () => {
  test('reserves the override and splits the remainder', () => {
    const { industry, effectiveTotal } = computePlans(feed, fxConfig, {
      grandTotal: 50, perTypeTotals: { Tank: 10 }, perTypeSizeRestrictions: {},
    });
    const tankTotal = industry.filter(r => r.itemType === 'Tank').reduce((s, r) => s + r.qty, 0);
    expect(tankTotal).toBe(10);
    expect(effectiveTotal).toBe(50);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && npm test -- --testPathPattern=blankorderCalc`
Expected: FAIL — `computePlans is not a function`.

- [ ] **Step 4: Write minimal implementation**

Add to `server/blankorder/calc.js` (above `module.exports`):

```js
function planRows(mode, styles, colors, sizes, config, opts) {
  const grandTotal = Math.max(0, Math.trunc(Number(opts.grandTotal) || 0));
  const perTypeTotals = opts.perTypeTotals || {};
  const perTypeSizeRestrictions = opts.perTypeSizeRestrictions || {};

  const excludedColors = new Set(config.excludedColors || []);
  const core = (config.coreColors || []).filter(c => !excludedColors.has(c));
  const floorPct = Number(config.coreColorFloorPct || 0);

  const styleKeys = Object.keys(styles);
  const overrides = {};
  let fixed = 0;
  for (const k of styleKeys) {
    const v = perTypeTotals[k];
    if (v != null && v !== '') {
      overrides[k] = Math.max(0, Math.trunc(Number(v)));
      fixed += overrides[k];
    }
  }
  const remainderTotal = Math.max(0, grandTotal - fixed);
  const nonOverridden = {};
  for (const k of styleKeys) if (!(k in overrides)) nonOverridden[k] = styles[k];
  const distributed = allocate(nonOverridden, remainderTotal);
  const styleAlloc = { ...overrides };
  for (const k of Object.keys(distributed)) styleAlloc[k] = (styleAlloc[k] || 0) + distributed[k];
  const effectiveTotal = Object.values(styleAlloc).reduce((s, n) => s + n, 0);

  const rows = [];
  for (const sk of Object.keys(styleAlloc)) {
    const sunits = styleAlloc[sk];
    if (sunits <= 0) continue;
    const colorWeights = { ...(colors[sk] || {}) };
    for (const c of core) if (!(c in colorWeights)) colorWeights[c] = 0;
    const floors = {};
    if (floorPct > 0 && sunits > 0) for (const c of core) floors[c] = Math.max(1, pyRound(floorPct * sunits));
    const colorAlloc = allocate(colorWeights, sunits, floors);
    const curve = curveFor(sk, mode, sizes[sk] || {}, config, perTypeSizeRestrictions);
    for (const color of Object.keys(colorAlloc)) {
      const cunits = colorAlloc[color];
      if (cunits <= 0) continue;
      const sizeAlloc = allocate(curve, cunits);
      for (const size of Object.keys(sizeAlloc)) {
        const q = sizeAlloc[size];
        if (q <= 0) continue;
        rows.push({ itemType: sk, color, size, qty: q });
      }
    }
  }
  rows.sort((a, b) =>
    (a.itemType < b.itemType ? -1 : a.itemType > b.itemType ? 1 : 0) ||
    (b.qty - a.qty) ||
    (a.color < b.color ? -1 : a.color > b.color ? 1 : 0) ||
    ((SIZE_ORDER[a.size] ?? 99) - (SIZE_ORDER[b.size] ?? 99)));
  return { rows, effectiveTotal };
}

function computePlans(feed, config, opts) {
  const { styles, colors, sizes } = buildDemand(feed, config);
  const ind = planRows('industry', styles, colors, sizes, config, opts);
  const bl = planRows('blended', styles, colors, sizes, config, opts);
  return { industry: ind.rows, blended: bl.rows, effectiveTotal: ind.effectiveTotal };
}
```

Update `module.exports`:

```js
module.exports = { SIZE_ORDER, pyRound, allocate, styleKey, normalize, buildDemand, curveFor, planRows, computePlans };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npm test -- --testPathPattern=blankorderCalc`
Expected: PASS. If the fixture comparison fails, regenerate fixtures per Step 1's note (config drift) and re-run.

- [ ] **Step 6: Commit**

```bash
git add server/blankorder/calc.js server/__tests__/blankorderCalc.test.js server/__tests__/fixtures/blankorder
git commit -m "feat(blankorder): add planRows + computePlans; verify against Python fixtures"
```

---

## Task 4: `delta.js` — CSV parse + velocity feed

**Files:**
- Create: `server/blankorder/delta.js`
- Test: `server/__tests__/blankorderDelta.test.js`

**Interfaces:**
- Produces:
  - `parseCsv(text) → { fields: string[], rows: Array<{[col]: string}> }` (handles BOM, quoted fields, `""` escapes, CRLF).
  - `computeVelocity(csvOld, csvNew) → { meta, velocity: Row[] }` with velocity rows `{ token, itemType, style, color, size, sku, unitsSold, unitPrice, revenue, isApparel, customOrder }`.

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/blankorderDelta.test.js
const fs = require('fs');
const path = require('path');
const { parseCsv, computeVelocity } = require('../blankorder/delta');

describe('parseCsv', () => {
  test('parses quoted fields, escaped quotes, and BOM', () => {
    const text = '﻿Item Name,Price\r\n"Shirt | UM | Logo","$25.00"\r\n"a ""q"" b","1"\r\n';
    const { fields, rows } = parseCsv(text);
    expect(fields).toEqual(['Item Name', 'Price']);
    expect(rows[0]['Item Name']).toBe('Shirt | UM | Logo');
    expect(rows[1]['Item Name']).toBe('a "q" b');
  });
});

describe('computeVelocity', () => {
  const QTY = 'Current Quantity Rocky Meowtain Company LLC';
  const header = `Token,Item Name,Variation Name,SKU,Option Value 1,Option Value 2,Price,${QTY}`;
  const oldCsv = `${header}\nT1,Shirt | UM | Logo,,W1,Black,L,$25.00,10\nT2,Sticker,,W2,,,${'$3.00'},5`;
  const newCsv = `${header}\nT1,Shirt | UM | Logo,,W1,Black,L,$25.00,6\nT2,Sticker,,W2,,,${'$3.00'},1`;

  test('computes units sold from quantity drop and flags apparel', () => {
    const feed = computeVelocity(oldCsv, newCsv);
    const shirt = feed.velocity.find(v => v.token === 'T1');
    expect(shirt.unitsSold).toBe(4);
    expect(shirt.itemType).toBe('Shirt');
    expect(shirt.style).toBe('UM');
    expect(shirt.color).toBe('Black');
    expect(shirt.size).toBe('L');
    expect(shirt.isApparel).toBe(true);
    expect(shirt.revenue).toBe(100);
    const sticker = feed.velocity.find(v => v.token === 'T2');
    expect(sticker.isApparel).toBe(false);
    expect(feed.meta.totalUnits).toBe(8);
  });

  test('negative new quantity flags a custom order', () => {
    const nc = `${header}\nT1,Shirt | UM | Logo,,W1,Black,L,$25.00,-2`;
    const oc = `${header}\nT1,Shirt | UM | Logo,,W1,Black,L,$25.00,3`;
    const feed = computeVelocity(oc, nc);
    expect(feed.velocity[0].customOrder).toBe(true);
    expect(feed.velocity[0].unitsSold).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --testPathPattern=blankorderDelta`
Expected: FAIL — `Cannot find module '../blankorder/delta'`.

- [ ] **Step 3: Write minimal implementation**

```js
// server/blankorder/delta.js
const QTY_FIELD = 'Current Quantity Rocky Meowtain Company LLC';
const PRICE_FIELD = 'Price';
const KEY = 'Token';

function toNum(s) {
  if (s == null) return null;
  const t = String(s).trim().replace(/\$/g, '').replace(/,/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

function parseCsv(text) {
  let s = String(text);
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); // strip BOM
  const records = [];
  let field = '';
  let record = [];
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      record.push(field); field = '';
    } else if (ch === '\n') {
      record.push(field); field = '';
      records.push(record); record = [];
    } else if (ch === '\r') {
      // ignore; handled by the following \n (or EOF below)
    } else field += ch;
  }
  if (field !== '' || record.length) { record.push(field); records.push(record); }
  const fields = records.shift() || [];
  const rows = records
    .filter(r => r.length && !(r.length === 1 && r[0] === ''))
    .map(r => {
      const obj = {};
      fields.forEach((f, idx) => { obj[f] = r[idx] != null ? r[idx] : ''; });
      return obj;
    });
  return { fields, rows };
}

function category(row) {
  const name = (row['Item Name'] || '').trim();
  if (name) return name.split('|')[0].trim();
  return (row['Reporting Category'] || '').trim() || '(uncategorized)';
}

function blankSpec(row) {
  const cat = category(row);
  if (cat !== 'Shirt' && cat !== 'Tank') return null;
  const parts = (row['Item Name'] || '').split('|').map(p => p.trim());
  const gtype = parts[0] || cat;
  const style = parts.length >= 3 ? parts[1] : '';
  const color = (row['Option Value 1'] || '').trim();
  const size = (row['Option Value 2'] || '').trim();
  return { gtype, style, color, size };
}

function loadRows(csvText) {
  const { rows } = parseCsv(csvText);
  const byKey = {};
  for (const r of rows) byKey[r[KEY] || ''] = r;
  return byKey;
}

function computeVelocity(csvOld, csvNew, meta = {}) {
  const oldRows = loadRows(csvOld);
  const newRows = loadRows(csvNew);
  const common = Object.keys(newRows).filter(k => k in oldRows);

  const velocity = [];
  let totalUnits = 0;
  let totalRevenue = 0;
  for (const k of common) {
    const o = oldRows[k], n = newRows[k];
    const ovn = toNum(o[QTY_FIELD]);
    const nvn = toNum(n[QTY_FIELD]);
    if (ovn == null || nvn == null || ovn === nvn) continue;
    const units = Math.abs(nvn - ovn);
    const price = toNum(n[PRICE_FIELD]);
    const revenue = price != null ? units * price : 0;
    const custom = nvn < 0;
    const cat = category(n);
    const spec = blankSpec(n);
    velocity.push({
      token: k,
      itemType: cat,
      style: spec ? spec.style : '',
      color: (n['Option Value 1'] || '').trim(),
      size: (n['Option Value 2'] || '').trim(),
      sku: (n['SKU'] || '').trim(),
      unitsSold: Number.isInteger(units) ? units : units,
      unitPrice: price != null ? Math.round(price * 100) / 100 : null,
      revenue: Math.round(revenue * 100) / 100,
      isApparel: spec != null,
      customOrder: custom,
    });
    totalUnits += units;
    totalRevenue += revenue;
  }
  velocity.sort((a, b) =>
    (b.revenue - a.revenue) ||
    (a.itemType < b.itemType ? -1 : a.itemType > b.itemType ? 1 : 0) ||
    (a.color < b.color ? -1 : a.color > b.color ? 1 : 0) ||
    (a.size < b.size ? -1 : a.size > b.size ? 1 : 0));

  return {
    meta: {
      old: meta.old || '',
      new: meta.new || '',
      generatedAt: new Date().toISOString().slice(0, 19),
      totalUnits: Number.isInteger(totalUnits) ? totalUnits : totalUnits,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      note: 'Raw sales velocity between the two catalog exports. No ordering policy applied.',
    },
    velocity,
  };
}

module.exports = { parseCsv, computeVelocity };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- --testPathPattern=blankorderDelta`
Expected: PASS.

- [ ] **Step 5: Add a fixture-parity test against the toolkit feed**

```js
// append to server/__tests__/blankorderDelta.test.js
describe('parity with the Python feed fixture', () => {
  test('velocity array matches catalog_delta.json (order-independent)', () => {
    const dir = path.join(__dirname, 'fixtures', 'blankorder');
    const oldName = 'RMC_catalog-2026-07-04-0226.csv';
    const newName = 'RMC_catalog-2026-07-06-1817.csv';
    const src = 'C:/PERSONAL_INTEREST/RockyMeowtainCompanyLLC/Inventory';
    const csvOld = fs.readFileSync(path.join(src, oldName), 'utf8');
    const csvNew = fs.readFileSync(path.join(src, newName), 'utf8');
    const expected = JSON.parse(fs.readFileSync(path.join(dir, 'catalog_delta.json'), 'utf8'));
    const feed = computeVelocity(csvOld, csvNew);
    const key = v => `${v.token}`;
    const sortByToken = a => [...a].sort((x, y) => (key(x) < key(y) ? -1 : 1));
    const strip = v => ({ ...v }); // compare all velocity fields
    expect(sortByToken(feed.velocity).map(strip)).toEqual(sortByToken(expected.velocity).map(strip));
  });
});
```

Run: `cd server && npm test -- --testPathPattern=blankorderDelta`
Expected: PASS. (If the source CSVs have moved, skip this parity test — the unit tests above still guard the logic.)

- [ ] **Step 6: Commit**

```bash
git add server/blankorder/delta.js server/__tests__/blankorderDelta.test.js
git commit -m "feat(blankorder): add CSV parser and velocity-feed computation"
```

---

## Task 5: `demandSource.js` — the Square-ready seam

**Files:**
- Create: `server/blankorder/demandSource.js`
- Test: `server/__tests__/blankorderDelta.test.js` (append)

**Interfaces:**
- Consumes: `computeVelocity` from Task 4.
- Produces: `fromCsvUpload(csvOld, csvNew, meta?) → feed`; `fromSquare(range) → feed` (throws Phase-2 error).

- [ ] **Step 1: Write the failing test**

```js
// append to server/__tests__/blankorderDelta.test.js
const { fromCsvUpload, fromSquare } = require('../blankorder/demandSource');

describe('demandSource', () => {
  const QTY = 'Current Quantity Rocky Meowtain Company LLC';
  const header = `Token,Item Name,Variation Name,SKU,Option Value 1,Option Value 2,Price,${QTY}`;
  test('fromCsvUpload returns a velocity feed', () => {
    const feed = fromCsvUpload(
      `${header}\nT1,Shirt | UM | Logo,,W1,Black,L,$25.00,10`,
      `${header}\nT1,Shirt | UM | Logo,,W1,Black,L,$25.00,7`
    );
    expect(feed.velocity[0].unitsSold).toBe(3);
  });
  test('fromSquare is a Phase-2 stub', () => {
    expect(() => fromSquare({})).toThrow(/Phase 2/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --testPathPattern=blankorderDelta`
Expected: FAIL — `Cannot find module '../blankorder/demandSource'`.

- [ ] **Step 3: Write minimal implementation**

```js
// server/blankorder/demandSource.js
const { computeVelocity } = require('./delta');

function fromCsvUpload(csvOld, csvNew, meta = {}) {
  if (!csvOld || !csvNew) throw new Error('Both catalog CSV exports are required.');
  return computeVelocity(csvOld, csvNew, meta);
}

// Phase 2: pull true sales from the Square Orders/Catalog API and return the
// same feed shape. Intentionally unimplemented for now.
function fromSquare(_range) {
  throw new Error('Square integration is Phase 2 and not yet implemented.');
}

module.exports = { fromCsvUpload, fromSquare };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- --testPathPattern=blankorderDelta`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/blankorder/demandSource.js server/__tests__/blankorderDelta.test.js
git commit -m "feat(blankorder): add swappable demand source (CSV now, Square stub)"
```

---

## Task 6: Config store + seeded `blankOrderConfig.json`

**Files:**
- Modify: `server/config.js` (add `BLANK_ORDER_CONFIG_FILE`)
- Create: `server/blankorder/config.js`, `server/blankorder/blankOrderConfig.json`
- Test: `server/__tests__/blankorderConfig.test.js`

**Interfaces:**
- Produces: `readBlankOrderConfig() → config object`; `DEFAULTS` (the seed). Config includes `styleItemTypeMap: { [styleKey]: { id, name } }` (starts empty).

- [ ] **Step 1: Add the config path**

Modify `server/config.js` — add inside the exported object after `ITEMS_CATALOG_FILE`:

```js
  BLANK_ORDER_CONFIG_FILE: path.join(__dirname, 'blankorder', 'blankOrderConfig.json'),
```

- [ ] **Step 2: Write the seeded config file**

```json
// server/blankorder/blankOrderConfig.json
{
  "sizeCurves": { "industry": { "XS": 1, "S": 10, "M": 23, "L": 31, "XL": 23, "2XL": 9, "3XL": 3 } },
  "styleCurves": {},
  "blendWeight": 0.5,
  "colorAliases": { "Ash": "Heather Gray" },
  "excludedColors": ["Daisy"],
  "excludedSizes": ["XS", "S", "3XL", "4XL", "5XL"],
  "coreColors": ["Black", "White"],
  "coreColorFloorPct": 0.1,
  "styleSuppliers": { "Unisex Shirt": "M&O 4800", "Youth Shirt": "M&O 4850", "Tank": "Tultex S105" },
  "styleItemTypeMap": {},
  "manualHistory": []
}
```

- [ ] **Step 3: Write the failing test**

```js
// server/__tests__/blankorderConfig.test.js
const { readBlankOrderConfig, DEFAULTS } = require('../blankorder/config');

describe('readBlankOrderConfig', () => {
  test('returns a config with the expected policy keys', () => {
    const cfg = readBlankOrderConfig();
    expect(cfg.blendWeight).toBeDefined();
    expect(cfg.coreColors).toContain('Black');
    expect(cfg.sizeCurves.industry.M).toBe(23);
    expect(cfg.styleItemTypeMap).toBeDefined();
  });
  test('DEFAULTS includes core-color floor', () => {
    expect(DEFAULTS.coreColorFloorPct).toBe(0.1);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd server && npm test -- --testPathPattern=blankorderConfig`
Expected: FAIL — `Cannot find module '../blankorder/config'`.

- [ ] **Step 5: Write minimal implementation**

```js
// server/blankorder/config.js
const fs = require('fs');
const config = require('../config');

const DEFAULTS = {
  sizeCurves: { industry: { XS: 1, S: 10, M: 23, L: 31, XL: 23, '2XL': 9, '3XL': 3 } },
  styleCurves: {},
  blendWeight: 0.5,
  colorAliases: { Ash: 'Heather Gray' },
  excludedColors: ['Daisy'],
  excludedSizes: ['XS', 'S', '3XL', '4XL', '5XL'],
  coreColors: ['Black', 'White'],
  coreColorFloorPct: 0.1,
  styleSuppliers: { 'Unisex Shirt': 'M&O 4800', 'Youth Shirt': 'M&O 4850', Tank: 'Tultex S105' },
  styleItemTypeMap: {},
  manualHistory: [],
};

function readBlankOrderConfig() {
  try {
    if (fs.existsSync(config.BLANK_ORDER_CONFIG_FILE)) {
      return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(config.BLANK_ORDER_CONFIG_FILE, 'utf8')) };
    }
  } catch { /* fall through to defaults */ }
  return { ...DEFAULTS };
}

module.exports = { readBlankOrderConfig, DEFAULTS };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && npm test -- --testPathPattern=blankorderConfig`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/config.js server/blankorder/config.js server/blankorder/blankOrderConfig.json server/__tests__/blankorderConfig.test.js
git commit -m "feat(blankorder): add seeded policy config store"
```

---

## Task 7: `router.js` + mount in `index.js`

**Files:**
- Create: `server/blankorder/router.js`
- Modify: `server/index.js`
- Test: `server/__tests__/blankorderRouter.test.js`

**Interfaces:**
- Consumes: `fromCsvUpload` (Task 5), `computePlans` (Task 3), `readBlankOrderConfig` (Task 6), `readCatalog` (existing `server/items/store.js`).
- Produces: `POST /blankorder/plan` → `{ industry, blended, effectiveTotal, feedMeta }`; `GET /blankorder/config` → `{ config, stockBlankItems }`.

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/blankorderRouter.test.js
jest.mock('../middleware/requireAuth', () => (req, res, next) => next());
jest.mock('../items/store', () => ({
  readCatalog: () => ({ items: [
    { id: 'i1', name: 'Unisex Shirt', stockBlanks: true },
    { id: 'i2', name: 'Sticker', stockBlanks: false },
  ] }),
}));

const request = require('supertest');
const express = require('express');
const router = require('../blankorder/router');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/blankorder', router);

const QTY = 'Current Quantity Rocky Meowtain Company LLC';
const header = `Token,Item Name,Variation Name,SKU,Option Value 1,Option Value 2,Price,${QTY}`;
const csvOld = `${header}\nT1,Shirt | UM | Logo,,W1,Black,L,$25.00,20`;
const csvNew = `${header}\nT1,Shirt | UM | Logo,,W1,Black,L,$25.00,8`;

describe('POST /blankorder/plan', () => {
  test('returns industry + blended plans summing to the total', async () => {
    const res = await request(app).post('/blankorder/plan').send({
      csvOld, csvNew, grandTotal: 12, perTypeTotals: {}, perTypeSizeRestrictions: {},
    });
    expect(res.status).toBe(200);
    const sum = res.body.industry.reduce((s, r) => s + r.qty, 0);
    expect(sum).toBe(12);
    expect(res.body.effectiveTotal).toBe(12);
    expect(res.body.feedMeta).toBeDefined();
  });
  test('400 when CSVs are missing', async () => {
    const res = await request(app).post('/blankorder/plan').send({ grandTotal: 12 });
    expect(res.status).toBe(400);
  });
});

describe('GET /blankorder/config', () => {
  test('returns config and only stockBlanks item types', async () => {
    const res = await request(app).get('/blankorder/config');
    expect(res.status).toBe(200);
    expect(res.body.stockBlankItems).toEqual([{ id: 'i1', name: 'Unisex Shirt' }]);
    expect(res.body.config.blendWeight).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --testPathPattern=blankorderRouter`
Expected: FAIL — `Cannot find module '../blankorder/router'`.

- [ ] **Step 3: Write minimal implementation**

```js
// server/blankorder/router.js
const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { fromCsvUpload } = require('./demandSource');
const { computePlans } = require('./calc');
const { readBlankOrderConfig } = require('./config');
const { readCatalog } = require('../items/store');

const router = express.Router();
router.use(requireAuth);

router.post('/plan', (req, res) => {
  try {
    const { csvOld, csvNew, feed: feedIn, grandTotal, perTypeTotals, perTypeSizeRestrictions, policyOverrides } = req.body || {};
    if (!feedIn && (!csvOld || !csvNew)) {
      return res.status(400).json({ error: 'Both catalog CSV exports (csvOld, csvNew) are required.' });
    }
    const feed = feedIn || fromCsvUpload(csvOld, csvNew);
    const cfg = { ...readBlankOrderConfig(), ...(policyOverrides || {}) };
    const { industry, blended, effectiveTotal } = computePlans(feed, cfg, {
      grandTotal: Number(grandTotal) || 0,
      perTypeTotals: perTypeTotals || {},
      perTypeSizeRestrictions: perTypeSizeRestrictions || {},
    });
    res.json({ industry, blended, effectiveTotal, feedMeta: feed.meta });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/config', (_req, res) => {
  try {
    const cfg = readBlankOrderConfig();
    const catalog = readCatalog();
    const stockBlankItems = (catalog.items || [])
      .filter(i => i.stockBlanks)
      .map(i => ({ id: i.id, name: i.name }));
    res.json({ config: cfg, stockBlankItems });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

- [ ] **Step 4: Mount the router**

Modify `server/index.js` — add after the `/stats` mount:

```js
app.use('/blankorder', require('./blankorder/router'));
```

Also raise the JSON body limit for CSV uploads. Change line `app.use(express.json());` to:

```js
app.use(express.json({ limit: '15mb' }));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npm test -- --testPathPattern=blankorderRouter`
Expected: PASS.

- [ ] **Step 6: Run the full backend suite (no regressions)**

Run: `cd server && npm test`
Expected: All suites pass except the pre-existing environmental `drive.test.js` "empty cache dir" case on populated dev machines. No new failures.

- [ ] **Step 7: Commit**

```bash
git add server/blankorder/router.js server/index.js server/__tests__/blankorderRouter.test.js
git commit -m "feat(blankorder): add plan + config endpoints and mount router"
```

---

## Task 8: `blankRowsToLineItems` util (frontend, pure)

**Files:**
- Create: `src/utils/blankRowsToLineItems.js`
- Test: `src/__tests__/blankRowsToLineItems.test.js`

**Interfaces:**
- Produces: `blankRowsToLineItems(rows: Row[], styleItemTypeMap: {[styleKey]: {id, name}}) → LineItem[]` — collapses by `(itemType→resolved catalog item, color)`; sizes summed; designs empty; `num` sequential (`'01'`…).

- [ ] **Step 1: Write the failing test**

```js
// src/__tests__/blankRowsToLineItems.test.js
import { describe, test, expect } from 'vitest';
import { blankRowsToLineItems } from '../utils/blankRowsToLineItems';

describe('blankRowsToLineItems', () => {
  const map = { 'Unisex Shirt': { id: 'i1', name: 'Unisex Shirt' } };
  test('collapses rows by item type + color into blank line items', () => {
    const rows = [
      { itemType: 'Unisex Shirt', color: 'Black', size: 'M', qty: 6 },
      { itemType: 'Unisex Shirt', color: 'Black', size: 'L', qty: 10 },
      { itemType: 'Unisex Shirt', color: 'White', size: 'M', qty: 5 },
    ];
    const items = blankRowsToLineItems(rows, map);
    expect(items).toHaveLength(2);
    const black = items.find(i => i.color === 'Black');
    expect(black.itemTypeName).toBe('Unisex Shirt');
    expect(black.itemTypeId).toBe('i1');
    expect(black.sizes).toEqual({ M: { total: 6, inventory: 0 }, L: { total: 10, inventory: 0 } });
    expect(black.frontDesigns).toEqual([]);
    expect(black.backDesigns).toEqual([]);
    expect(items[0].num).toBe('01');
    expect(items[1].num).toBe('02');
  });
  test('drops non-positive quantities; falls back to styleKey when unmapped', () => {
    const items = blankRowsToLineItems(
      [{ itemType: 'Tank', color: 'Red', size: 'L', qty: 0 },
       { itemType: 'Tank', color: 'Red', size: 'M', qty: 3 }],
      {}
    );
    expect(items).toHaveLength(1);
    expect(items[0].itemTypeName).toBe('Tank');
    expect(items[0].itemTypeId).toBe('');
    expect(items[0].sizes).toEqual({ M: { total: 3, inventory: 0 } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- blankRowsToLineItems`
Expected: FAIL — cannot resolve `../utils/blankRowsToLineItems`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/utils/blankRowsToLineItems.js
export function blankRowsToLineItems(rows, styleItemTypeMap = {}) {
  const groups = new Map();
  for (const r of rows || []) {
    if (!r || (r.qty ?? 0) <= 0) continue;
    const mapped = styleItemTypeMap[r.itemType] || {};
    const itemTypeName = mapped.name || r.itemType;
    const itemTypeId = mapped.id || '';
    const key = `${itemTypeId} ${itemTypeName} ${r.color}`;
    let g = groups.get(key);
    if (!g) { g = { itemTypeName, itemTypeId, color: r.color, sizes: {} }; groups.set(key, g); }
    const prev = g.sizes[r.size]?.total || 0;
    g.sizes[r.size] = { total: prev + r.qty, inventory: 0 };
  }
  return [...groups.values()].map((g, i) => ({
    num: String(i + 1).padStart(2, '0'),
    itemTypeName: g.itemTypeName,
    itemTypeId: g.itemTypeId,
    color: g.color,
    sizes: g.sizes,
    frontDesigns: [],
    backDesigns: [],
    frontMethod: '',
    backMethod: '',
    frontNotes: '',
    backNotes: '',
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- blankRowsToLineItems`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/blankRowsToLineItems.js src/__tests__/blankRowsToLineItems.test.js
git commit -m "feat(blankorder): add row-to-blank-line-item collapsing util"
```

---

## Task 9: `src/api/blankOrder.js`

**Files:**
- Create: `src/api/blankOrder.js`
- Test: `src/__tests__/blankOrderApi.test.js`

**Interfaces:**
- Produces: `computeBlankPlan(payload) → Promise`; `getBlankOrderConfig() → Promise`.

- [ ] **Step 1: Write the failing test**

```js
// src/__tests__/blankOrderApi.test.js
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/client', () => ({ apiFetch: vi.fn(() => Promise.resolve({ ok: true })) }));
import { apiFetch } from '../api/client';
import { computeBlankPlan, getBlankOrderConfig } from '../api/blankOrder';

describe('blankOrder api', () => {
  beforeEach(() => apiFetch.mockClear());
  test('computeBlankPlan POSTs to /blankorder/plan', async () => {
    await computeBlankPlan({ grandTotal: 10 });
    expect(apiFetch).toHaveBeenCalledWith('/blankorder/plan', { method: 'POST', body: { grandTotal: 10 } });
  });
  test('getBlankOrderConfig GETs /blankorder/config', async () => {
    await getBlankOrderConfig();
    expect(apiFetch).toHaveBeenCalledWith('/blankorder/config');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- blankOrderApi`
Expected: FAIL — cannot resolve `../api/blankOrder`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/api/blankOrder.js
import { apiFetch } from './client';

export const computeBlankPlan = (payload) =>
  apiFetch('/blankorder/plan', { method: 'POST', body: payload });

export const getBlankOrderConfig = () => apiFetch('/blankorder/config');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- blankOrderApi`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/blankOrder.js src/__tests__/blankOrderApi.test.js
git commit -m "feat(blankorder): add frontend api client"
```

---

## Task 10: `NewOrderDialog` popup + wire `OrdersList` + route

**Files:**
- Create: `src/components/NewOrderDialog.jsx`
- Modify: `src/components/OrdersList.jsx`, `src/App.jsx`
- Test: `src/__tests__/NewOrderDialog.test.jsx`

**Interfaces:**
- `NewOrderDialog({ onCustom, onBlank, onCancel })` renders two choice buttons + cancel.
- Route `/blank-order` renders `BlankOrderFlow` (created in Task 11; add a placeholder import now so the route compiles — Task 11 fills it in).

- [ ] **Step 1: Write the failing test**

```jsx
// src/__tests__/NewOrderDialog.test.jsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NewOrderDialog from '../components/NewOrderDialog';

describe('NewOrderDialog', () => {
  test('invokes the right callback per choice', () => {
    const onCustom = vi.fn(), onBlank = vi.fn(), onCancel = vi.fn();
    render(<NewOrderDialog onCustom={onCustom} onBlank={onBlank} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /custom order/i }));
    expect(onCustom).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /blank order/i }));
    expect(onBlank).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- NewOrderDialog`
Expected: FAIL — cannot resolve `../components/NewOrderDialog`.

- [ ] **Step 3: Write minimal implementation**

```jsx
// src/components/NewOrderDialog.jsx
export default function NewOrderDialog({ onCustom, onBlank, onCancel }) {
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label="Create new order">
      <div className="confirm-dialog">
        <h3>What kind of order?</h3>
        <p>Custom orders have printed designs. Blank orders restock undecorated garments from Square sales.</p>
        <div className="confirm-actions">
          <button className="btn-primary" onClick={onCustom}>Custom Order</button>
          <button className="btn-primary" onClick={onBlank}>Blank Order</button>
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- NewOrderDialog`
Expected: PASS.

- [ ] **Step 5: Wire OrdersList to open the dialog**

Modify `src/components/OrdersList.jsx`:
- Add import: `import NewOrderDialog from './NewOrderDialog';`
- Add state near the other `useState`s: `const [showNewDialog, setShowNewDialog] = useState(false);`
- Change the "+ New Order" button's `onClick={handleNewOrder}` to `onClick={() => setShowNewDialog(true)}`.
- Add a `handleBlankOrder` function next to `handleNewOrder`:

```jsx
  function handleBlankOrder() {
    setShowNewDialog(false);
    navigate('/blank-order');
  }
```

- In `handleNewOrder`, add `setShowNewDialog(false);` as the first line inside `try` (so choosing Custom closes the dialog).
- Render the dialog before the closing `</div>` of the component:

```jsx
      {showNewDialog && (
        <NewOrderDialog
          onCustom={handleNewOrder}
          onBlank={handleBlankOrder}
          onCancel={() => setShowNewDialog(false)}
        />
      )}
```

- [ ] **Step 6: Add the route**

Modify `src/App.jsx`:
- Add import: `import BlankOrderFlow from './components/BlankOrderFlow';`
- Add route inside `<Routes>` after the `/orders/:orderId` route:

```jsx
          <Route path="/blank-order" element={<BlankOrderFlow />} />
```

> `BlankOrderFlow` is implemented in Task 11. To keep this task's build green on its own, create a temporary stub now and replace it in Task 11:
> ```jsx
> // src/components/BlankOrderFlow.jsx (temporary stub — replaced in Task 11)
> export default function BlankOrderFlow() { return <div>Blank Order</div>; }
> ```

- [ ] **Step 7: Run the frontend suite**

Run: `npm test -- NewOrderDialog OrdersList`
Expected: PASS (existing `OrdersList` tests still pass; the button now opens a dialog — if an existing test asserted the button immediately creates an order, update it to click through the dialog's "Custom Order" button).

- [ ] **Step 8: Commit**

```bash
git add src/components/NewOrderDialog.jsx src/components/OrdersList.jsx src/App.jsx src/components/BlankOrderFlow.jsx src/__tests__/NewOrderDialog.test.jsx
git commit -m "feat(blankorder): add New Order popup (Custom vs Blank) and route"
```

---

## Task 11: `BlankOrderParams` (Step 1) + `BlankOrderFlow` shell

**Files:**
- Create: `src/components/BlankOrderParams.jsx`
- Replace stub: `src/components/BlankOrderFlow.jsx`
- Test: `src/__tests__/BlankOrderFlow.test.jsx`

**Interfaces:**
- `BlankOrderParams({ config, stockBlankItems, onCompute })` — collects two CSV file contents, grand total, per-type totals, per-type size restrictions, blend weight, core floor, aliases/excluded colors/manual history (advanced), and (when needed) the style→item-type mapping. Calls `onCompute({ csvOld, csvNew, grandTotal, perTypeTotals, perTypeSizeRestrictions, policyOverrides, styleItemTypeMap })`.
- `BlankOrderFlow()` — loads config on mount (`getBlankOrderConfig`), holds `step` state, renders `BlankOrderParams` (step 1) then `BlankOrderTable` (step 2, Task 12).

- [ ] **Step 1: Write the failing test**

```jsx
// src/__tests__/BlankOrderFlow.test.jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/blankOrder', () => ({
  getBlankOrderConfig: vi.fn(() => Promise.resolve({
    config: {
      sizeCurves: { industry: { M: 23, L: 31, XL: 23 } }, blendWeight: 0.5,
      coreColors: ['Black', 'White'], coreColorFloorPct: 0.1,
      colorAliases: {}, excludedColors: [], excludedSizes: [], manualHistory: [],
      styleItemTypeMap: {},
    },
    stockBlankItems: [{ id: 'i1', name: 'Unisex Shirt' }],
  })),
  computeBlankPlan: vi.fn(() => Promise.resolve({
    industry: [{ itemType: 'Unisex Shirt', color: 'Black', size: 'M', qty: 12 }],
    blended: [{ itemType: 'Unisex Shirt', color: 'Black', size: 'M', qty: 12 }],
    effectiveTotal: 12, feedMeta: { totalUnits: 20 },
  })),
}));
import { computeBlankPlan } from '../api/blankOrder';

function renderFlow() {
  return render(<MemoryRouter><BlankOrderFlowWrapper /></MemoryRouter>);
}
import BlankOrderFlow from '../components/BlankOrderFlow';
function BlankOrderFlowWrapper() { return <BlankOrderFlow />; }

describe('BlankOrderFlow', () => {
  beforeEach(() => computeBlankPlan.mockClear());
  test('computes a plan and advances to the table', async () => {
    renderFlow();
    await screen.findByLabelText(/total blanks/i);
    // Provide CSV contents directly via the hidden inputs' onChange handlers.
    fireEvent.change(screen.getByLabelText(/older csv/i), { target: { value: 'OLD' } });
    fireEvent.change(screen.getByLabelText(/newer csv/i), { target: { value: 'NEW' } });
    fireEvent.change(screen.getByLabelText(/total blanks/i), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /compute/i }));
    await waitFor(() => expect(computeBlankPlan).toHaveBeenCalled());
    // Step 2 shows the compare table headers.
    await screen.findByText(/industry/i);
  });
});
```

> Note: to keep the test deterministic, `BlankOrderParams` exposes the two CSV inputs as `<textarea>`s labeled "Older CSV" / "Newer CSV" that accept pasted content, plus optional file inputs that populate them via `FileReader`. Tests use the textareas.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- BlankOrderFlow`
Expected: FAIL — `BlankOrderParams` missing / current `BlankOrderFlow` is the stub.

- [ ] **Step 3: Write `BlankOrderParams`**

```jsx
// src/components/BlankOrderParams.jsx
import { useState } from 'react';

const ALL_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];

function readFileInto(setter) {
  return (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setter(String(reader.result || ''));
    reader.readAsText(file);
  };
}

export default function BlankOrderParams({ config, stockBlankItems, onCompute }) {
  const [csvOld, setCsvOld] = useState('');
  const [csvNew, setCsvNew] = useState('');
  const [grandTotal, setGrandTotal] = useState('');
  const [perTypeTotals, setPerTypeTotals] = useState({});
  const [restrictions, setRestrictions] = useState({}); // { itemName: [excludedSize,...] }
  const [blendWeight, setBlendWeight] = useState(config.blendWeight ?? 0.5);
  const [floorPct, setFloorPct] = useState(config.coreColorFloorPct ?? 0);
  const [excludedColors, setExcludedColors] = useState((config.excludedColors || []).join(', '));
  const [aliases, setAliases] = useState(
    Object.entries(config.colorAliases || {}).filter(([k]) => !k.startsWith('_')).map(([k, v]) => `${k}=${v}`).join('\n'));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState(null);

  const styleNames = stockBlankItems.map(i => i.name);

  function toggleSize(name, size) {
    setRestrictions(prev => {
      const cur = new Set(prev[name] || []);
      if (cur.has(size)) cur.delete(size); else cur.add(size);
      return { ...prev, [name]: [...cur] };
    });
  }

  function parseAliases(text) {
    const out = {};
    for (const line of text.split('\n')) {
      const [k, v] = line.split('=').map(s => (s || '').trim());
      if (k && v) out[k] = v;
    }
    return out;
  }

  function handleCompute() {
    if (!csvOld || !csvNew) { setError('Please provide both CSV exports.'); return; }
    if (!(Number(grandTotal) > 0)) { setError('Enter a total greater than zero.'); return; }
    setError(null);
    const policyOverrides = {
      blendWeight: Number(blendWeight),
      coreColorFloorPct: Number(floorPct),
      excludedColors: excludedColors.split(',').map(s => s.trim()).filter(Boolean),
      colorAliases: parseAliases(aliases),
    };
    // styleItemTypeMap: map each catalog stockBlanks item name to itself so the
    // calc style keys resolve to real catalog items where names match.
    const styleItemTypeMap = { ...(config.styleItemTypeMap || {}) };
    for (const it of stockBlankItems) {
      if (!styleItemTypeMap[it.name]) styleItemTypeMap[it.name] = { id: it.id, name: it.name };
    }
    onCompute({
      csvOld, csvNew,
      grandTotal: Number(grandTotal),
      perTypeTotals,
      perTypeSizeRestrictions: restrictions,
      policyOverrides,
      styleItemTypeMap,
    });
  }

  return (
    <div className="blank-order-params">
      <h2>Blank Order — Parameters</h2>
      {error && <div className="error-banner">{error}</div>}

      <div className="field-group">
        <label htmlFor="csv-old">Older CSV</label>
        <textarea id="csv-old" value={csvOld} onChange={e => setCsvOld(e.target.value)} placeholder="Paste the older Square catalog export, or choose a file" />
        <input type="file" accept=".csv" aria-label="Older CSV file" onChange={readFileInto(setCsvOld)} />
      </div>
      <div className="field-group">
        <label htmlFor="csv-new">Newer CSV</label>
        <textarea id="csv-new" value={csvNew} onChange={e => setCsvNew(e.target.value)} placeholder="Paste the newer Square catalog export, or choose a file" />
        <input type="file" accept=".csv" aria-label="Newer CSV file" onChange={readFileInto(setCsvNew)} />
      </div>

      <div className="field-group">
        <label htmlFor="grand-total">Total blanks</label>
        <input id="grand-total" type="number" min="1" value={grandTotal} onChange={e => setGrandTotal(e.target.value)} />
      </div>

      <div className="field-group">
        <label>Per-item-type totals (optional override) &amp; size restrictions</label>
        {styleNames.map(name => (
          <div key={name} className="per-type-row">
            <strong>{name}</strong>
            <input
              type="number" min="0" placeholder="auto"
              aria-label={`${name} total`}
              value={perTypeTotals[name] ?? ''}
              onChange={e => setPerTypeTotals(p => ({ ...p, [name]: e.target.value }))}
            />
            <span className="size-restrict">
              {ALL_SIZES.map(size => (
                <label key={size} className="size-check">
                  <input
                    type="checkbox"
                    aria-label={`${name} exclude ${size}`}
                    checked={(restrictions[name] || config.excludedSizes || []).includes(size)}
                    onChange={() => toggleSize(name, size)}
                  />{size}
                </label>
              ))}
            </span>
          </div>
        ))}
      </div>

      <button className="btn-secondary" onClick={() => setShowAdvanced(s => !s)}>
        {showAdvanced ? 'Hide advanced policy' : 'Show advanced policy'}
      </button>
      {showAdvanced && (
        <div className="advanced-policy">
          <div className="field-group">
            <label htmlFor="blend">Blend weight (0–1)</label>
            <input id="blend" type="number" step="0.1" min="0" max="1" value={blendWeight} onChange={e => setBlendWeight(e.target.value)} />
          </div>
          <div className="field-group">
            <label htmlFor="floor">Core-color floor %</label>
            <input id="floor" type="number" step="0.05" min="0" max="1" value={floorPct} onChange={e => setFloorPct(e.target.value)} />
          </div>
          <div className="field-group">
            <label htmlFor="excol">Excluded colors (comma-separated)</label>
            <input id="excol" value={excludedColors} onChange={e => setExcludedColors(e.target.value)} />
          </div>
          <div className="field-group">
            <label htmlFor="aliases">Color aliases (one per line, sold=blank)</label>
            <textarea id="aliases" value={aliases} onChange={e => setAliases(e.target.value)} />
          </div>
        </div>
      )}

      <button className="btn-primary" onClick={handleCompute}>Compute →</button>
    </div>
  );
}
```

- [ ] **Step 4: Write `BlankOrderFlow`** (replace the stub)

```jsx
// src/components/BlankOrderFlow.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBlankOrderConfig, computeBlankPlan } from '../api/blankOrder';
import BlankOrderParams from './BlankOrderParams';
import BlankOrderTable from './BlankOrderTable';

export default function BlankOrderFlow() {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState(null);
  const [step, setStep] = useState(1);
  const [plan, setPlan] = useState(null);
  const [params, setParams] = useState(null);
  const [error, setError] = useState(null);
  const [computing, setComputing] = useState(false);

  useEffect(() => {
    getBlankOrderConfig().then(setCfg).catch(e => setError(e.message));
  }, []);

  async function handleCompute(p) {
    setComputing(true);
    setError(null);
    try {
      const result = await computeBlankPlan({
        csvOld: p.csvOld, csvNew: p.csvNew,
        grandTotal: p.grandTotal, perTypeTotals: p.perTypeTotals,
        perTypeSizeRestrictions: p.perTypeSizeRestrictions,
        policyOverrides: p.policyOverrides,
      });
      setParams(p);
      setPlan(result);
      setStep(2);
    } catch (e) {
      setError(e.message);
    } finally {
      setComputing(false);
    }
  }

  if (!cfg) return <div className="blank-order-flow">{error ? <div className="error-banner">{error}</div> : 'Loading…'}</div>;

  return (
    <div className="blank-order-flow">
      <button onClick={() => navigate('/orders')}>← Back to orders</button>
      {error && <div className="error-banner">{error}</div>}
      {step === 1 && (
        <BlankOrderParams
          config={cfg.config}
          stockBlankItems={cfg.stockBlankItems}
          onCompute={handleCompute}
        />
      )}
      {step === 2 && plan && (
        <BlankOrderTable
          plan={plan}
          styleItemTypeMap={params.styleItemTypeMap}
          onBack={() => setStep(1)}
        />
      )}
      {computing && <div className="computing">Computing…</div>}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- BlankOrderFlow`
Expected: PASS. (`BlankOrderTable` from Task 12 must exist; if running this task before Task 12, create the Task 12 stub first: `export default function BlankOrderTable(){ return <div>Industry</div>; }`.)

- [ ] **Step 6: Commit**

```bash
git add src/components/BlankOrderParams.jsx src/components/BlankOrderFlow.jsx src/__tests__/BlankOrderFlow.test.jsx
git commit -m "feat(blankorder): add parameters step and flow shell"
```

---

## Task 12: `BlankOrderTable` (Step 2 — the three-column table) + Generate

**Files:**
- Create/replace: `src/components/BlankOrderTable.jsx`
- Modify: `src/api/orders.js` is already sufficient (`createOrder`, `getOrderBySheet`, `saveOrderToSheet`).
- Test: `src/__tests__/BlankOrderTable.test.jsx`

**Interfaces:**
- Consumes: `blankRowsToLineItems` (Task 8); `createOrder`, `getOrderBySheet`, `saveOrderToSheet` (existing `src/api/orders.js`); `useNavigate`.
- `BlankOrderTable({ plan, styleItemTypeMap, onBack })` — renders unioned rows with Industry, Blended, and editable Working columns; "Use Industry"/"Use Blended" fill Working; add/remove custom rows; totals; "Generate Order" builds line items and creates the order.

- [ ] **Step 1: Write the failing test**

```jsx
// src/__tests__/BlankOrderTable.test.jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navigate }));
vi.mock('../api/orders', () => ({
  createOrder: vi.fn(() => Promise.resolve({ orderId: 'RMC-009-2026-07-07', sheetId: 'sh1' })),
  getOrderBySheet: vi.fn(() => Promise.resolve({ orderId: 'RMC-009-2026-07-07', sheetId: 'sh1', folderId: 'f1', state: 'building', lineItems: [] })),
  saveOrderToSheet: vi.fn(() => Promise.resolve({ ok: true })),
}));
import { createOrder, saveOrderToSheet } from '../api/orders';
import BlankOrderTable from '../components/BlankOrderTable';

const plan = {
  industry: [
    { itemType: 'Unisex Shirt', color: 'Black', size: 'M', qty: 7 },
    { itemType: 'Unisex Shirt', color: 'Black', size: 'L', qty: 5 },
  ],
  blended: [
    { itemType: 'Unisex Shirt', color: 'Black', size: 'M', qty: 6 },
    { itemType: 'Unisex Shirt', color: 'Black', size: 'L', qty: 6 },
  ],
  effectiveTotal: 12,
};
const map = { 'Unisex Shirt': { id: 'i1', name: 'Unisex Shirt' } };

function renderTable() {
  return render(<MemoryRouter><BlankOrderTable plan={plan} styleItemTypeMap={map} onBack={() => {}} /></MemoryRouter>);
}

describe('BlankOrderTable', () => {
  beforeEach(() => { navigate.mockClear(); createOrder.mockClear(); saveOrderToSheet.mockClear(); });

  test('Generate is disabled until Working has values', () => {
    renderTable();
    expect(screen.getByRole('button', { name: /generate order/i })).toBeDisabled();
  });

  test('Use Industry fills Working and enables Generate', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: /use industry/i }));
    const inputs = screen.getAllByLabelText(/working qty/i);
    expect(inputs[0].value).toBe('7');
    expect(screen.getByRole('button', { name: /generate order/i })).not.toBeDisabled();
  });

  test('Generate creates an order with collapsed blank line items and navigates', async () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: /use blended/i }));
    fireEvent.click(screen.getByRole('button', { name: /generate order/i }));
    await waitFor(() => expect(createOrder).toHaveBeenCalled());
    const savedArgs = saveOrderToSheet.mock.calls[0];
    expect(savedArgs[0]).toBe('sh1');
    const savedItems = savedArgs[1].lineItems;
    expect(savedItems).toHaveLength(1); // one Black Unisex Shirt line item
    expect(savedItems[0].sizes).toEqual({ M: { total: 6, inventory: 0 }, L: { total: 6, inventory: 0 } });
    expect(savedArgs[2]).toBe(true); // full save
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/orders/RMC-009-2026-07-07?sheetId=sh1'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- BlankOrderTable`
Expected: FAIL — component missing (or is the Task 11 stub).

- [ ] **Step 3: Write minimal implementation**

```jsx
// src/components/BlankOrderTable.jsx
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createOrder, getOrderBySheet, saveOrderToSheet } from '../api/orders';
import { blankRowsToLineItems } from '../utils/blankRowsToLineItems';

const SIZE_ORDER = {};
['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'].forEach((s, i) => { SIZE_ORDER[s] = i; });
const keyOf = r => `${r.itemType} ${r.color} ${r.size}`;

export default function BlankOrderTable({ plan, styleItemTypeMap, onBack }) {
  const navigate = useNavigate();
  const [working, setWorking] = useState({});   // key -> qty (string/number)
  const [customRows, setCustomRows] = useState([]); // [{itemType,color,size}]
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const indMap = useMemo(() => Object.fromEntries(plan.industry.map(r => [keyOf(r), r.qty])), [plan]);
  const blMap = useMemo(() => Object.fromEntries(plan.blended.map(r => [keyOf(r), r.qty])), [plan]);

  const baseRows = useMemo(() => {
    const byKey = new Map();
    for (const r of [...plan.industry, ...plan.blended]) {
      const k = keyOf(r);
      if (!byKey.has(k)) byKey.set(k, { itemType: r.itemType, color: r.color, size: r.size });
    }
    return [...byKey.values()].sort((a, b) =>
      (a.itemType < b.itemType ? -1 : a.itemType > b.itemType ? 1 : 0) ||
      (a.color < b.color ? -1 : a.color > b.color ? 1 : 0) ||
      ((SIZE_ORDER[a.size] ?? 99) - (SIZE_ORDER[b.size] ?? 99)));
  }, [plan]);

  const allRows = [...baseRows, ...customRows];

  function fillFrom(map) {
    const next = {};
    for (const r of baseRows) next[keyOf(r)] = map[keyOf(r)] || 0;
    setWorking(next);
    setCustomRows([]);
  }

  function setWorkingQty(k, val) { setWorking(w => ({ ...w, [k]: val })); }

  function addCustomRow() {
    setCustomRows(rows => [...rows, { itemType: '', color: '', size: '' }]);
  }
  function updateCustom(i, field, val) {
    setCustomRows(rows => rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }
  function removeCustom(i) {
    const r = customRows[i];
    setWorking(w => { const n = { ...w }; delete n[keyOf(r)]; return n; });
    setCustomRows(rows => rows.filter((_, idx) => idx !== i));
  }

  const workingRows = allRows
    .map(r => ({ itemType: r.itemType, color: r.color, size: r.size, qty: Number(working[keyOf(r)]) || 0 }))
    .filter(r => r.qty > 0);
  const workingTotal = workingRows.reduce((s, r) => s + r.qty, 0);
  const indTotal = plan.industry.reduce((s, r) => s + r.qty, 0);
  const blTotal = plan.blended.reduce((s, r) => s + r.qty, 0);
  const canGenerate = workingRows.length > 0 && !busy;

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    try {
      const lineItems = blankRowsToLineItems(workingRows, styleItemTypeMap);
      const { orderId, sheetId } = await createOrder();
      const base = await getOrderBySheet(sheetId);
      await saveOrderToSheet(sheetId, { ...base, orderId, sheetId, lineItems }, true);
      navigate(`/orders/${orderId}?sheetId=${sheetId}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="blank-order-table">
      <div className="blank-order-table-actions">
        <button className="btn-secondary" onClick={onBack}>← Parameters</button>
        <button className="btn-secondary" onClick={() => fillFrom(indMap)}>Use Industry →</button>
        <button className="btn-secondary" onClick={() => fillFrom(blMap)}>Use Blended →</button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <table>
        <thead>
          <tr>
            <th>Item Type</th><th>Color</th><th>Size</th>
            <th>Industry</th><th>Blended</th><th>Working</th><th></th>
          </tr>
        </thead>
        <tbody>
          {baseRows.map(r => {
            const k = keyOf(r);
            return (
              <tr key={k}>
                <td>{r.itemType}</td><td>{r.color}</td><td>{r.size}</td>
                <td>{indMap[k] || 0}</td>
                <td>{blMap[k] || 0}</td>
                <td>
                  <input type="number" min="0" aria-label={`working qty ${k}`}
                    value={working[k] ?? ''} onChange={e => setWorkingQty(k, e.target.value)} />
                </td>
                <td></td>
              </tr>
            );
          })}
          {customRows.map((r, i) => {
            const k = keyOf(r);
            return (
              <tr key={`custom-${i}`}>
                <td><input aria-label={`custom type ${i}`} value={r.itemType} onChange={e => updateCustom(i, 'itemType', e.target.value)} /></td>
                <td><input aria-label={`custom color ${i}`} value={r.color} onChange={e => updateCustom(i, 'color', e.target.value)} /></td>
                <td><input aria-label={`custom size ${i}`} value={r.size} onChange={e => updateCustom(i, 'size', e.target.value)} /></td>
                <td>—</td><td>—</td>
                <td><input type="number" min="0" aria-label={`working qty ${k}`} value={working[k] ?? ''} onChange={e => setWorkingQty(k, e.target.value)} /></td>
                <td><button aria-label={`remove custom ${i}`} onClick={() => removeCustom(i)}>✕</button></td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}><strong>Totals</strong></td>
            <td>{indTotal}</td><td>{blTotal}</td><td>{workingTotal}</td><td></td>
          </tr>
        </tfoot>
      </table>
      <button className="btn-secondary" onClick={addCustomRow}>+ Add custom row</button>
      <button className="btn-primary" disabled={!canGenerate} onClick={handleGenerate}>
        {busy ? 'Generating…' : 'Generate Order'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- BlankOrderTable`
Expected: PASS.

- [ ] **Step 5: Run the full frontend suite**

Run: `npm test`
Expected: All suites pass (58 prior + the new blank-order suites).

- [ ] **Step 6: Commit**

```bash
git add src/components/BlankOrderTable.jsx src/__tests__/BlankOrderTable.test.jsx
git commit -m "feat(blankorder): add three-column curve table and Generate Order"
```

---

## Task 13: End-to-end wiring check + docs

**Files:**
- Modify: `docs/APP_OVERVIEW.md` (mark the Blank Order flow as implemented)

- [ ] **Step 1: Manual smoke test (documented, run locally)**

Start the app (`start.bat`), then:
1. Orders list → "+ New Order" → dialog appears with **Custom Order** / **Blank Order**.
2. "Blank Order" → parameters screen loads (config fetched).
3. Paste/choose the two sample CSVs from the Inventory folder, total = 50, Compute.
4. Three-column table appears; "Use Blended →" fills Working; edit a cell; add a custom row.
5. "Generate Order" → lands in the OrderBuilder with an all-blanks order; verify the order preview shows a "Blank Items (no decoration)" section.

Record the result in the commit message.

- [ ] **Step 2: Update the overview doc**

In `docs/APP_OVERVIEW.md`, under "The external Python toolkit (being integrated as 'Blank Order')", change "**(in progress)**" to note it is implemented (Phase 1) with the entry point at the New Order popup and the flow at `/blank-order`.

- [ ] **Step 3: Run both suites once more**

Run: `npm test && cd server && npm test`
Expected: Frontend all pass; backend all pass except the pre-existing environmental `drive.test.js` case.

- [ ] **Step 4: Commit**

```bash
git add docs/APP_OVERVIEW.md
git commit -m "docs: mark Blank Order flow implemented (Phase 1)"
```

---

## Self-Review

**Spec coverage:**
- Server module (delta, calc, demandSource, config, router) → Tasks 1–7. ✓
- Square-ready seam → Task 5 (`fromSquare` stub). ✓
- Grand-total-with-per-type-override allocation → Task 3 (`planRows`). ✓
- Per-item-type size restrictions → Tasks 2 (`curveFor`) + 11 (UI grid). ✓
- All policy params in Step 1 (aliases, excluded colors, blend, floor) → Task 11. ✓
- New Order popup (Custom vs Blank) → Task 10. ✓
- Three-column curve table with copy/edit/add-row → Task 12. ✓
- Generate → real all-blanks order via existing machinery → Tasks 8 + 12. ✓
- Style→item-type mapping → Task 11 (`styleItemTypeMap` build) + Task 8 (resolution). ✓
- Fixture parity with Python outputs → Tasks 3 + 4. ✓

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to" — each step carries full code. Temporary stubs in Tasks 10/11 are explicitly labeled and replaced in the next task. ✓

**Type consistency:** `Row = {itemType, color, size, qty}` used consistently in calc, router, table, and `blankRowsToLineItems`. `computePlans(feed, config, opts)` signature matches its callers (Task 7 router). `styleItemTypeMap` shape `{ [styleKey]: {id, name} }` consistent between Tasks 8, 11, 12. Save path `saveOrderToSheet(sheetId, data, true)` matches `src/api/orders.js`. ✓

**Note on `styleItemTypeMap`:** Task 11 auto-maps each `stockBlanks` catalog item name to itself, so calc style keys that match a catalog item name (e.g. "Unisex Shirt") resolve automatically; unmatched styles fall back to the style key as `itemTypeName` with an empty `itemTypeId` (Task 8), which the OrderBuilder still renders and lets the user correct. A dedicated "unmapped style" required-picker UI is a possible follow-up but not required for Phase 1 correctness.
</content>
