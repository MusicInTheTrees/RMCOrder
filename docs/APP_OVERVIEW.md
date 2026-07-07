# RMCOrder — App & Feature Overview

A reference for anyone (human or AI) working on this codebase. CLAUDE.md covers
commands, infrastructure, and file locations; **this document covers what the app
*does* and the concepts that are easy to confuse.** Read this first when a task
touches orders, blanks, demand, or email.

---

## What RMCOrder is

A locally-hosted web app for **Rocky Meowtain Company LLC (RMC)**, a custom
apparel brand. It replaces hand-written text orders with a structured order
builder backed by Google Drive + Google Sheets. RMC uses it to build apparel
orders, email them to their **printing partner "Spew"**, keep customers updated,
and track blank-garment demand.

- **Frontend:** React 19 + Vite (port 5175), React Router. ESM.
- **Backend:** Express (port 3001), owns all Google API access + local caches. CommonJS.
- **No database.** Source of truth is a per-order Google Sheet; `orders-cache/*.json`
  is a local mirror/fallback. See CLAUDE.md → Data Layer.
- Launched via `start.bat` (runs both processes).

---

## Core concept: an Order

An **Order** is a request RMC sends to Spew to produce apparel. Each order:

- Has an ID `RMC-NNN-YYYY-MM-DD`, a Drive folder, and a Google Sheet (3 tabs:
  Order Info, Line Items, Designs).
- Moves through **states** (advanced manually):
  `building → sent → pending → paid → fulfilled → received`.
- Contains **line items**. This is the central data structure:

```js
{
  num: '01',                       // 2-digit line number within the order
  itemTypeName: 'Unisex Shirt',    // the product type (matches a catalog item name)
  itemTypeId: '<catalog item id>', // link to the catalog item
  color: 'Black',
  sizes: { S: { total: 4, inventory: 1 }, M: { total: 6, inventory: 0 } },
  frontDesigns: [{ designNum, file }],   // [] means no front print
  backDesigns:  [{ designNum, file }],   // [] means no back print
  frontMethod, frontNotes, backMethod, backNotes,
  customerEmail,                   // optional: assigns this line to a customer
}
```

**Sizes carry `{ total, inventory }`.** `total` = how many are needed;
`inventory` = how many come from existing stock; **quantity to actually order =
`total − inventory`.**

### "Blank" line item — concept #1 of three

A line item is a **blank** when it has **no designs** (`frontDesigns` and
`backDesigns` both empty). Blanks are first-class and already fully supported:

- `buildOrderPreviewText.js` and the Spew email builder split items into
  **printed items** vs. a separate **"Blank Items (no decoration)"** section.
- So "an order that is entirely blanks" is a normal, valid order — it's just an
  order whose line items happen to have no designs. **Any feature that produces
  blanks should produce ordinary line items with empty designs, not a new order
  type.**

---

## The Order Builder (main screen)

`src/components/OrderBuilder.jsx` composes the whole order-editing experience:

- **Line item cards** (`LineItemCard.jsx`) — pick item type (from the catalog),
  color, per-size quantities, front/back designs (via `DesignBrowser`), methods,
  notes.
- **Designs** come from a Google Drive "Design Source of Truth" folder, synced to
  `designs-cache/` on startup and served locally.
- **Inventory pull** — sizes can be filled from existing blank stock (`inventory`
  field); `api/inventory.js` decrement/increment adjusts the Blank Inventory Sheet.
- **Customers panel** (`CustomersPanel.jsx`) — attach customers to the order and
  assign line items to them (`customerEmail`).
- **Order preview text** — a plain-text summary (`buildOrderPreviewText.js`).
- **Auto-save** — `useOrder.js` debounces saves to the Sheet, with an offline
  queue (`useOfflineQueue.js`) that flushes on reconnect.

Orders are created from `OrdersList.jsx` via **"+ New Order"** → `POST /orders`
(creates folder + sheet + empty order) → navigates to the builder.

---

## Two separate email systems (don't conflate them)

1. **Spew order email** — `POST /gmail/draft`. The production order sent to the
   printer Spew. Built by `emailBuilder.js` from order data; copies design files
   into the order's Drive folder, shares the folder with Spew, and separates
   printed vs. blank items. One email per order.

2. **Customer status emails** — `POST /gmail/customer-email/*`. Per-customer
   updates as the order changes state. Only three states send customer emails:
   **`sent` (In Production), `shipped`, `delayed`** (see `src/emailStates.js` —
   note these differ from the *order* states above). Templates are editable
   (Status Emails settings tab); can be drafted, previewed, or auto-sent per
   customer. Built by `customerEmailBuilder.js`.

---

## Blank-garment demand & ordering (the confusing area)

There are **three different "blank" things**. Keep them straight:

| # | Name | What it is | Where |
| - | ---- | ---------- | ----- |
| 1 | **Blank line item** | A line item in an order with no designs. A concept *inside* an order. | `buildOrderPreviewText.js`, email builders |
| 2 | **Blank Demand Stats** | Aggregates **placed orders** (customer-facing orders RMC has taken) into `{itemType, color, size, total}` and writes a Google Sheet. This is *order-driven* demand: "what have we committed to make." Only counts catalog items flagged `stockBlanks`. Triggered by the "📊 Refresh Blank Stats" button in the Items settings tab. | `server/stats/aggregate.js`, `blankStatsSheet.js`, `POST /stats/refresh` |
| 3 | **Blank Inventory Sheet** | A separate pre-existing Google Sheet holding physical blank-garment stock counts. The inventory pull reads/writes this. | `server/inventory/*`, sheet id in `config.js` |

### The external Python toolkit (being integrated as "Blank Order")

Separate from this repo, at
`C:\PERSONAL_INTEREST\RockyMeowtainCompanyLLC\Inventory`, there is a Python
**blank-ordering toolkit** that answers a *different* question than Blank Demand
Stats:

- **Blank Demand Stats (#2 above)** = demand from **orders placed in this app**.
- **The Python toolkit** = **sales velocity from Square** (what actually sold at
  retail), used to recommend a **blank purchase order** to restock.

The toolkit is two stages, built on a **facts-vs-policy** split:

1. `delta.py` — diffs two Square catalog CSV exports (drop in "Current Quantity"
   = units sold) → a **sales-velocity feed** (`catalog_delta_*.json`). Faithful
   record of what sold; **no policy applied.**
2. `blank_calc.py` + `blank_calc_config.json` — applies ordering **policy**
   (color aliases/merges, excluded colors/sizes, core-color floor, size curve,
   blend weight) and splits a target total across **style → color → size** using
   largest-remainder (Hamilton) rounding. Produces an "industry" curve plan and a
   "blended" (demand + industry) plan.

**Integration direction (in progress):** port this toolkit into RMCOrder as a
**"Blank Order"** path off the New Order popup. It computes a recommendation,
lets the user pick/edit a curve, then **generates a normal order made of blank
line items** (concept #1) that opens in the Order Builder. See the design spec
under `docs/superpowers/specs/` for the current plan. Phase 1 ingests uploaded
Square CSVs; a later phase links the Square API directly behind the same
demand-source interface.

> **Why this matters:** "make a Blank Order" (the new Square-driven purchase
> flow) is *not* the same as the existing "Blank Demand Stats" report, and its
> end product *is* an ordinary order with blank line items — not a new order
> type and not the demand sheet. Conflating these is the mistake to avoid.

---

## Feature map (quick index)

| Area | Frontend | Backend |
| ---- | -------- | ------- |
| Orders list / create / delete | `OrdersList.jsx`, `api/orders.js` | `orders/router.js`, `orders/cache.js` |
| Order builder | `OrderBuilder.jsx`, `LineItemCard.jsx`, `hooks/useOrder.js` | `sheets/orderSheet.js` |
| Designs | `DesignBrowser.jsx`, `DesignPicker.jsx`, `hooks/useDesigns.js` | `drive/designsCache.js` |
| Item catalog (types, `stockBlanks`) | `ItemsTab.jsx`, `hooks/useItems.js` | `items/store.js`, `items/router.js` |
| Blank inventory (physical stock) | `hooks/useInventory.js`, `api/inventory.js` | `inventory/router.js` |
| Blank Demand Stats (order-driven) | Items tab "Refresh Blank Stats" button | `stats/aggregate.js`, `stats/router.js` |
| Customers | `CustomersPanel.jsx`, `api/customerEmails.js` | `gmail/customerItems.js` |
| Spew order email | `api/gmail.js` | `gmail/emailBuilder.js`, `gmail/router.js` |
| Customer status emails | `StatusEmailsTab.jsx` | `gmail/customerEmailBuilder.js`, `gmail/statusEmailStore.js` |
| Settings | `SettingsScreen.jsx`, `api/settings.js` | `settings/store.js` |
| Bug log | `BugLogTab.jsx`, `context/BugLogContext.jsx` | `buglog/router.js` |
| Auth (Google OAuth) | `LandingScreen.jsx`, `api/auth.js` | `auth/oauth.js`, `auth/router.js` |

---

## Glossary

- **Spew** — RMC's external printing partner (order recipient).
- **Blank** — an undecorated garment (line item with no designs).
- **Sales velocity** — units actually sold at retail over a period (from Square).
- **Demand (stats)** — quantities committed via orders placed in this app.
- **Curve** — a size distribution (e.g. industry screen-print curve S/M/L/XL…).
- **Facts vs. policy** — `delta.py` records what sold (facts); `blank_calc.py`
  applies ordering rules (policy). The integration preserves this split.
</content>
</invoke>
