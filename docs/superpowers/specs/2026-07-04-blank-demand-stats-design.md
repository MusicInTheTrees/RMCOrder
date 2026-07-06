# Blank Demand Stats — Design

**Date:** 2026-07-04
**Status:** Approved (brainstorm)

## Purpose

Give RMC a running picture of which apparel is actually being ordered, broken
down finely enough to decide **what blank shirts to stock**. The app aggregates
demand across real orders and writes it to a dedicated Google Sheet that is
created once and overwritten on demand.

## Decisions (from brainstorming)

- **Granularity:** Item Type × Color × Size.
- **Orders counted:** state is `sent` or later — i.e. one of
  `sent`, `pending`, `paid`, `fulfilled`, `received`. In-progress `building`
  drafts are excluded.
- **Metric:** Total ordered (sum of each size's `total`), regardless of how much
  came from stock. This is the demand signal for future stocking.
- **Shirt classification:** a new `stockBlanks` boolean flag on catalog items.
  Flagged items go to a **Shirts** tab; everything else goes to an **Other** tab.
- **Trigger:** a manual "Refresh Blank Stats" button in the catalog view. Each
  refresh recomputes from scratch and overwrites the sheet (no drift).
- **Data source:** local `orders-cache/*.json` files (Approach A). Fast, offline
  friendly, no per-order Drive calls. Caches are written on every save and
  self-heal on load, so they are a safe source of truth.
- **Sort:** rows sorted by Total Ordered **descending** so the most-demanded
  blanks surface at the top.

## Components

All backend units live under `server/stats/`.

### `server/stats/aggregate.js` (pure, no I/O)

The testable core. Signature:

```
aggregate(orders, catalog) -> { shirts: Row[], other: Row[] }
```

- `orders`: array of order objects (same shape as `orders-cache/*.json` /
  `readOrderFromSheet` output).
- `catalog`: the object returned by `readCatalog()` (`{ items: [...] }`).
- `Row`: `{ itemType, color, size, total }`.

Behavior:

- Filter orders to `state ∈ {sent, pending, paid, fulfilled, received}`.
- For each line item, for each size entry with `total > 0`, accumulate
  `total` into a map keyed by `(itemTypeName, color, size)`.
- **Blank (undecorated) line items are included** — they still consume blank
  stock.
- Classify each line item as shirt vs. other:
  - Match to a catalog item by `itemTypeId` first, then by case-insensitive
    `itemTypeName`.
  - Matched item with `stockBlanks === true` → **shirts**.
  - Otherwise (unmatched, unflagged, or free-typed name) → **other**.
- Return both arrays sorted by `total` descending. Ties broken by
  `itemType`, then `color`, then `size` for stable output.
- Missing color renders as `"(no color)"`; missing size label is skipped.

### `server/stats/blankStatsSheet.js`

Owns the Google Sheet lifecycle. Uses existing `sheets/client.js` and
`drive/client.js`.

- `getOrCreateStatsSheet()` — read `blankStatsSheetId` from settings. If set,
  verify the sheet is reachable; if reachable, reuse it. If unset or the sheet
  is missing/trashed, create a new spreadsheet named `RMC Blank Demand Stats`
  in `config.DRIVE.TOP_LEVEL_FOLDER`, save its ID to settings, and return it.
- `writeStats(sheetId, { shirts, other, orderCount, updatedAt })` — ensure the
  `Shirts` and `Other` tabs exist, clear each, and write:
  - Row 1: a header line, e.g.
    `Last refreshed: 2026-07-04 14:22 · 14 orders counted`.
  - Row 2: column headers `Item Type | Color | Size | Total Ordered`.
  - Rows 3+: the aggregated rows.

### `server/stats/router.js`

One route:

- `POST /api/stats/refresh`:
  1. Read all `orders-cache/*.json` (skip unreadable/corrupt files with a
     `console.warn`).
  2. `readCatalog()`.
  3. `aggregate(orders, catalog)`.
  4. `getOrCreateStatsSheet()` then `writeStats(...)`.
  5. Respond `{ sheetId, sheetUrl, orderCount, rowCount, updatedAt }` where
     `sheetUrl` is `https://docs.google.com/spreadsheets/d/<id>`.

Mounted under `/api/stats` in the server entry, guarded by `requireAuth` like
the other routers.

### Catalog change

- `server/items/router.js` POST default gains `stockBlanks: false`.
- The catalog editor UI gains a "Stock blanks" checkbox per item (bound to the
  existing PUT `/:id` update path, which already spreads `req.body`).
- No migration: items without the field are treated as `false`.

### Frontend

- A "Refresh Blank Stats" button in the catalog / items view.
- On click: `POST /api/stats/refresh`, show a spinner, then a result line
  ("Updated 231 rows across 14 orders") and an "Open Sheet" link to `sheetUrl`.
- Errors surface inline with the returned message.

## Data flow

```
Click "Refresh Blank Stats"
  → POST /api/stats/refresh
      → read orders-cache/*.json (all orders; skip bad files)
      → filter to state ∈ {sent, pending, paid, fulfilled, received}
      → aggregate(orders, catalog):
          per line item, per size with total>0:
            key = (itemType, color, size); sum += total
          classify shirt vs other via catalog stockBlanks flag
      → getOrCreateStatsSheet()  (reuse stored id, else create + save)
      → writeStats: overwrite "Shirts" and "Other" tabs
  → { sheetId, sheetUrl, orderCount, rowCount, updatedAt }
  → UI: "Updated N rows across M orders" + Open Sheet link
```

## Sheet layout (both tabs)

```
Last refreshed: 2026-07-04 14:22 · 14 orders counted
Item Type        Color    Size   Total Ordered
Unisex Tee       Black    L      42
Unisex Tee       Black    M      31
Women's V-neck   Black    S      12
...
```

Sorted by Total Ordered descending. Both tabs fully cleared and rewritten each
refresh, so removed/edited orders never leave stale rows.

## Persistence

- `blankStatsSheetId` stored in `server/settings.json` via the existing settings
  store. Written only after a successful create, so a failed create leaves no
  dangling ID.

## Error handling

- Corrupt/unreadable individual cache file → skipped with `console.warn`;
  refresh continues.
- Stored sheet ID no longer valid (trashed/deleted) → recreate and resave.
- Google/network failure during create or write → route returns 500 with the
  message; UI surfaces it. No partial persisted state.
- No qualifying orders → tabs written with just the header lines;
  `orderCount: 0` returned.

## Testing

- **`server/__tests__/statsAggregate.test.js`** (no mocks — the core):
  - Sums correctly per Item Type × Color × Size across multiple orders.
  - `building` orders excluded; `sent`+ included.
  - Shirt vs. other classification honors `stockBlanks` (matched by id and by
    name; unmatched → other).
  - Blank (undecorated) line items are counted.
  - Sizes with `total: 0` ignored.
  - Output sorted by total descending.
- **`server/__tests__/blankStatsSheet.test.js`** (Google modules mocked, per
  existing backend style): reuse-existing-id vs. create-on-missing; verifies
  clear + write of both tabs.
- Router test optional (thin glue over the two units above).

## Out of scope (YAGNI)

- Automatic/event-driven refresh (manual only for now).
- Historical trends / time windows (current snapshot only).
- Writing into the existing Blank Inventory Sheet (kept separate).
- Reconciling demand against current blank stock levels.
```
