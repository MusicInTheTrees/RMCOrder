# Blank Order Integration — Design Spec

**Date:** 2026-07-07
**Status:** Approved for planning
**Related:** `docs/APP_OVERVIEW.md`, external toolkit at
`C:\PERSONAL_INTEREST\RockyMeowtainCompanyLLC\Inventory`

---

## 1. Summary

Port the standalone Python **blank-ordering toolkit** into RMCOrder as a
**"Blank Order"** path off the "+ New Order" popup. The flow ingests Square sales
data, recommends how to split a target purchase across style/color/size, lets the
user pick and edit a curve in a three-column table, then **generates an ordinary
RMCOrder order composed of blank line items** that opens in the normal Order
Builder.

The end product is a **real order** (concept #1 in `APP_OVERVIEW.md`) — not a new
order type, not the Blank Demand Stats report. All existing order machinery
(Sheet, Spew email with its "Blank Items" section, states) applies unchanged.

### Goals
- Reproduce the Python toolkit's recommendation logic faithfully in JS.
- Keep the demand source swappable so the **Square API** can replace CSV upload
  later with no change to the calculator (Phase 2).
- Fit the RMC mental model: a Blank Order is created where orders are created.

### Non-goals (Phase 1)
- Live Square API integration (Phase 2; interface is stubbed now).
- **Persisting** policy edits back to the config file. Step 1 exposes every policy
  knob as a **per-run input seeded from `blankOrderConfig.json`**, but "Save these
  as my new defaults" is deferred to Phase 2. The JSON file remains the source of
  defaults, edited by hand if you want new defaults now.
- Any order-text / email-draft export from the toolkit — the generated real order
  already produces the Spew email and Blank Item sheet rows.

---

## 2. User flow

```
OrdersList "+ New Order"
      │
      ▼
 NewOrderDialog ── "Custom Order" ─▶ existing createOrder() → OrderBuilder (unchanged)
      │
      └──────────── "Blank Order" ─▶ BlankOrderFlow (route: /blank-order)
                                          │
              Step 1  PARAMETERS ─────────┤
                • upload 2 Square CSVs (older + newer)
                • grand total (with optional per-item-type override)
                • per-item-type size restrictions
                • size curve + blend weight; core colors + floor
                • color aliases; excluded colors; manual history
                • style→item-type mapping (only if a style is unmapped)
                          │  POST /blankorder/plan
                          ▼
              Step 2  CURVE TABLE (3 columns) ──┐
                • Industry | Blended | Working  │
                • "Use Industry/Blended" copies into editable Working
                • edit qtys, add/remove custom rows
                          │  Generate Order
                          ▼
              Step 3  REAL ORDER
                • POST /orders + save blank line items
                • navigate to OrderBuilder (all-blanks order)
```

---

## 3. Server module: `server/blankorder/`

CommonJS, mounted at `/blankorder`, auth-guarded (`requireAuth`).

### 3.1 `delta.js` — sales-velocity feed (port of `delta.py`)
- `computeVelocity(csvTextOld, csvTextNew)` → feed:
  ```js
  { meta: { old, new, generatedAt, totalUnits, totalRevenue, note },
    velocity: [{ token, itemType, style, color, size, sku,
                 unitsSold, unitPrice, revenue, isApparel, customOrder }] }
  ```
- Keyed on `Token`. Units sold = magnitude of the drop in the
  "Current Quantity …" column; a value going negative ⇒ `customOrder: true`.
- Pure and in-memory (no filesystem). CSV parsed with a small helper (handle the
  `utf-8-sig` BOM and quoted fields) or a lightweight dependency.
- `style` / `itemType` derived from the Item Name prefix segments, color/size
  from Option Value 1/2 — same rules as `delta.py`.

### 3.2 `calc.js` — allocation (port of `blank_calc.py` pure fns)
Port only the I/O-free functions:
- `allocate(weights, total, floors?)` — largest-remainder (Hamilton) rounding,
  floors reserved first. Exact behavior of the Python version.
- `styleKey(itemType, style)` → `"Unisex Shirt" | "Youth Shirt" | "Tank" | …`.
- `buildDemand(feed, config)` → `{ styles, colors, sizes }` after applying color
  aliases and excluded colors, folding in `config.manualHistory`.
- `curveFor(style, mode, observedSizes, config, sizeRestrictions)` → normalized
  size curve, dropping excluded/restricted sizes and renormalizing.
- `plan(mode, totals, styles, colors, sizes, config, sizeRestrictions)` →
  `[{ itemType, color, size, qty }]`.

**Do NOT port** the markdown / order-text / email renderers — superseded by the
real order.

Public entry:
```js
computePlans(effectiveConfig, { grandTotal, perTypeTotals, perTypeSizeRestrictions })
  → { industry: Row[], blended: Row[], effectiveTotal }
```
`Row = { itemType, color, size, qty }`. `effectiveConfig` is the persisted
`blankOrderConfig.json` shallow-merged with the per-run `policyOverrides` from
Step 1 (aliases/exclusions/floor/blend/manualHistory), so the calculator always
sees a single resolved config and never reads two sources.

**Total model (grand default + per-type override).** In `plan`, the split across
item types works as:
1. Reserve each overridden type's fixed total (`perTypeTotals[type]`).
2. Distribute `max(0, grandTotal − sumOfOverrides)` across the non-overridden
   types by sales share (largest-remainder).
3. `effectiveTotal = sumOfOverrides + distributedRemainder` (shown in the UI).
Within each type, color and size splits are unchanged from the Python logic
(core-color floor, size curve).

### 3.3 `demandSource.js` — Square-ready seam
```js
fromCsvUpload(csvOld, csvNew) → feed         // Phase 1
fromSquare({ start, end })     → feed         // Phase 2 stub: throws "not yet implemented"
```
Both return the identical feed shape, so `calc.js` is source-agnostic.

### 3.4 Config: `blankOrderConfig.json` + `config.js` store
Seeded from the current `blank_calc_config.json`:
- `sizeCurves.industry`, `styleCurves`, `blendWeight`
- `colorAliases`, `excludedColors`, `excludedSizes`
- `coreColors`, `coreColorFloorPct`
- **`styleItemTypeMap`** — NEW: maps calc style keys → catalog item
  `{ id, name }` (a `stockBlanks` item). Drives Step-3 line-item creation.

Read/write via a small store mirroring `settings/store.js` (defaults + file
merge). "File now, UI later."

### 3.5 `router.js`
- `POST /blankorder/plan` — body: `{ csvOld, csvNew }` (or a precomputed feed),
  `{ grandTotal, perTypeTotals, perTypeSizeRestrictions, policyOverrides }`.
  - `perTypeTotals` — fixed per-item-type total overrides (see Total model).
  - `perTypeSizeRestrictions` — per-item-type allowed/excluded sizes.
  - `policyOverrides` — a full, per-run copy of the policy knobs, seeded from
    `blankOrderConfig.json` and editable in Step 1: `colorAliases`,
    `excludedColors`, `excludedSizes` (global default), `coreColors`,
    `coreColorFloorPct`, `blendWeight`, and `manualHistory`. Applied to this run
    only; not persisted in Phase 1.
  - Returns `{ industry, blended, effectiveTotal, feedMeta }`.
- `GET /blankorder/config` — returns policy config + the catalog's `stockBlanks`
  item types (for dropdowns) + which styles are unmapped.

Mounted in `server/index.js`: `app.use('/blankorder', require('./blankorder/router'))`.

---

## 4. Generate Order → real order (Step 3)

1. **Collapse** Working rows by `(itemType, color)` into line items:
   ```js
   { num, itemTypeName, itemTypeId, color,
     sizes: { <size>: { total: qty, inventory: 0 }, … },
     frontDesigns: [], backDesigns: [] }   // no designs ⇒ blank
   ```
   Drop rows with qty ≤ 0. Resolve `itemTypeName`/`itemTypeId` via
   `styleItemTypeMap`. Assign `num` sequentially (`01`, `02`, …).
2. **Create + populate** the order: `POST /orders` (existing — folder + sheet +
   empty order), then persist the line items through the existing
   `saveOrderToSheet` path. A thin server helper may wrap create-then-populate,
   but reuses existing sheet-write code; no new order storage is introduced.
3. **Navigate** to `/orders/:orderId?sheetId=…` — the standard OrderBuilder,
   showing an all-blanks order ready to edit / email / advance states.

**Item-type mapping guard:** if any style lacks a `styleItemTypeMap` entry, Step 1
requires the user to pick a catalog item for it before computing, so Step 3 never
emits a line item with a dangling item type.

---

## 5. Frontend

- `src/api/blankOrder.js` — `computePlan(payload)`, `getBlankOrderConfig()`.
- `NewOrderDialog` (modeled on `ConfirmDialog.jsx`) — replaces the immediate
  `createOrder()` call in `OrdersList.jsx` with a Custom/Blank choice.
- `BlankOrderFlow` screen (route `/blank-order`), two internal steps:
  - **Step 1 — Parameters:** every input below is seeded from
    `blankOrderConfig.json` and sent as a per-run override (not persisted):
    - **CSV upload** — the two Square exports (older + newer).
    - **Grand total** + optional **per-item-type total** overrides (live
      effective-total readout).
    - **Per-item-type size restrictions** — size checkbox grid per `stockBlanks`
      item type, defaulted from `excludedSizes`.
    - **Size curve** — the industry curve values (editable numbers) + `blendWeight`.
    - **Core colors + floor %** — `coreColors` list and `coreColorFloorPct`.
    - **Color aliases** — editable list of `sold color → orderable blank color`.
    - **Excluded colors** — editable list of colors to never order.
    - **Manual history** — editable list of extra sales rows
      (`itemType, style, color, size, unitsSold`) folded into demand.
    - **Style→item-type mapping** — shown for any unmapped style (required).
    Advanced sections (aliases, excluded colors, manual history, curve) live under
    collapsible groups so the common case (total + sizes) stays simple.
  - **Step 2 — Curve table:** union of Industry/Blended row-keys; read-only
    Industry & Blended columns; "Use Industry →" / "Use Blended →" copy into the
    editable Working column (confirm if overwriting edits); editable Working
    cells; add/remove custom rows (item type from `stockBlanks` dropdown, color,
    size, qty) appended to Working only; per-column totals with a live Working
    total; "Generate Order" enabled when Working has ≥1 positive row.
- Custom Order path and the OrderBuilder are unchanged.

---

## 6. Testing

**Server (Jest + fixtures from the Python outputs):**
- `delta.js`: feed produced from the existing `RMC_catalog-*.csv` pair matches
  `catalog_delta_2026-07-04_to_2026-07-06.json`.
- `calc.js`: `computePlans` reproduces `recommended_order_{22,50,100}.json`
  (industry + blended) exactly — rounding, core-color floor, exclusions.
- Total model: per-type override reserves correctly; remainder split; edge cases
  (overrides ≥ grand total → non-overridden get 0, effectiveTotal = sum).
- Row→line-item collapse + style→item-type resolution; unmapped-style guard.

**Frontend (Vitest + RTL):**
- NewOrderDialog routes Custom vs Blank correctly.
- Curve table: copy buttons fill Working; editing; add/remove custom rows;
  totals update; Generate disabled until valid.
- Generate builds the expected blank line items and calls create/save.

---

## 7. Phasing

- **Phase 1 (this spec):** CSV upload → recommendation → curve table → real order.
- **Phase 2 (future):** implement `demandSource.fromSquare` (Square OAuth +
  Orders/Catalog API) behind the same interface; add a policy-config UI. No change
  to `calc.js` or the flow.

---

## 8. File change summary

**New**
- `server/blankorder/delta.js`, `calc.js`, `demandSource.js`, `config.js`,
  `router.js`, `blankOrderConfig.json`
- `server/__tests__/blankorderDelta.test.js`, `blankorderCalc.test.js`
- `src/api/blankOrder.js`
- `src/components/NewOrderDialog.jsx`, `BlankOrderFlow.jsx` (+ step subcomponents)
- `src/__tests__/NewOrderDialog.test.jsx`, `BlankOrderFlow.test.jsx`

**Modified**
- `server/index.js` — mount `/blankorder`
- `src/App.jsx` — add `/blank-order` route
- `src/components/OrdersList.jsx` — "+ New Order" opens `NewOrderDialog`
- (Test fixtures copied from the Inventory toolkit outputs.)
</content>
