# Order Email Grouping + Pending Print / Printed States — Design Spec

**Date:** 2026-07-08
**Status:** Approved for planning
**Related:** `docs/APP_OVERVIEW.md`

Two independent-but-related improvements to the order lifecycle:

- **Part A** — group line items by item type in the generated order email, with a fixed type order.
- **Part B** — reshape the order states: relabel `pending` as **"Pending Print"**, remove `paid`, add customer emails (draft + auto-send) for **Pending Print** and **Printed**, and show friendly badge labels.

---

## Part A — Email item grouping

**Goal:** In the Spew order email, all line items of the same type appear together, in a consistent order — for both printed items and blank items.

**Today:** `server/gmail/emailBuilder.js` already groups printed items into a `<h3>` section per item type (`groupByCategory`), but the sections are emitted in first-appearance order, and **blank items are one flat table with no per-type grouping**. Blank orders (from the Blank Order feature) therefore show interleaved types.

**Fixed type priority.** A shared ranking:
1. `Unisex Shirt`
2. `Youth Shirt`
3. `Tank`
4. everything else, alphabetically (case-insensitive)

Implemented as a helper in `emailBuilder.js`:
```js
const TYPE_PRIORITY = ['Unisex Shirt', 'Youth Shirt', 'Tank'];
function typeRank(name) {
  const i = TYPE_PRIORITY.indexOf(name);
  return i === -1 ? TYPE_PRIORITY.length : i;
}
function compareTypes(a, b) {
  return typeRank(a) - typeRank(b) || String(a).toLowerCase().localeCompare(String(b).toLowerCase());
}
```

**Changes (both `buildEmailHtml` and `buildEmailPlainText`):**
- **Printed items:** iterate the `groupByCategory` result in `compareTypes` order instead of insertion order (`Object.keys(groups).sort(compareTypes)`).
- **Blank items:** keep the single "Blank Items (no decoration)" section, but **sort its rows** by `compareTypes(itemType)`, then color (case-insensitive), then size. `emailBuilder.js` has no size-order map today, so add a local one: `const SIZE_ORDER = {}; ['XS','S','M','L','XL','2XL','3XL','4XL','5XL'].forEach((s,i)=>{SIZE_ORDER[s]=i;});` and rank unknown sizes last (`SIZE_ORDER[s] ?? 99`). Sort so every type is contiguous. (Item type on a compiled blank row is `item.itemTypeName || item.apparelType`.)

**Scope:** email only (`emailBuilder.js`). The on-screen preview (`buildOrderPreviewText.js`) is out of scope for this change.

**Testing (`server/__tests__/emailBuilder.test.js`, extend):**
- Given line items in the order Youth, Tank, Unisex, Tank, Youth (printed), the HTML `<h3>` sections appear as Unisex Shirt, Youth Shirt, Tank.
- Given blank items of mixed types, the Blank Items table rows are contiguous per type and in priority order.

---

## Part B — Pending Print / Printed states + emails

### B.1 State model

**New progression** (`STATE_ORDER` in `src/components/OrderTopBar.jsx`):
```
building → sent → pending → fulfilled → received → shipped
```
plus `delayed` as the existing manual side-state. `paid` is removed. `pending` is kept as a key but **means "Pending Print"** now.

**Friendly display labels** — add a `STATE_LABELS` map and render it in `StateBadge` (badge currently shows the raw key):

| key | label |
| --- | --- |
| building | Building |
| sent | In Production |
| pending | Pending Print |
| fulfilled | Printed |
| received | In-Hand |
| shipped | Shipped |
| delayed | Delayed |

`StateBadge.jsx` renders `STATE_LABELS[state] || state` (so any unknown/legacy key still shows). `STATE_COLORS`: keep `pending` (recolor if desired), remove `paid`; `StateBadge` already falls back to gray for unknown keys.

### B.2 Removing `paid` (migrate → `fulfilled`)

Read-time normalization, self-healing (no batch script). A backend helper:
```js
// server/orders/state.js
function normalizeState(state) { return state === 'paid' ? 'fulfilled' : state; }
module.exports = { normalizeState };
```
Applied where orders are read/consumed on the backend:
- `server/sheets/router.js` GET `/order/:sheetId` — normalize `order.state` before responding (so the frontend always receives `fulfilled`; it persists on the next save).
- `server/orders/router.js` GET `/` list — normalize each order's `state`.
- `server/gmail/router.js` `loadOrder` — normalize.
- `server/stats/aggregate.js` — normalize each order's state before the `COUNTED_STATES` check.

`COUNTED_STATES` (`server/stats/aggregate.js`) becomes `['sent', 'pending', 'fulfilled', 'received']` (drops `paid`; `pending`/`fulfilled` still count). Because normalization runs first, a legacy `paid` order counts as `fulfilled`.

Frontend needs no `paid` handling: the backend normalizes on read, and `StateBadge`/`OrderTopBar` tolerate unknown keys (label/color fallback; see B.4 for nav guard).

### B.3 Customer emails for Pending Print + Printed

`EMAIL_STATES` is duplicated in three files and MUST be updated in all three to:
```
['sent', 'pending', 'fulfilled', 'shipped', 'delayed']
```
- `src/emailStates.js` (frontend) — also add `STATE_LABELS` entries `pending: 'Pending Print'`, `fulfilled: 'Printed'`.
- `server/gmail/statusEmailStore.js`
- `server/sheets/orderSheet.js` (this adds `Sent: pending` / `Sent: fulfilled` columns to the Customers tab — additive; existing rows read `''` for the new columns).

`server/gmail/customerEmailBuilder.js` — add entries for the two new states to `PILLS`, `STATUS_LABELS`, and `DEFAULT_TEMPLATES`:
- `PILLS`: `pending: '🖨️ Pending Print'`, `fulfilled: '👕 Printed'`.
- `STATUS_LABELS`: `pending: 'Pending Print'`, `fulfilled: 'Printed'`.
- `DEFAULT_TEMPLATES`:
  - `pending` (Pending Print): subject `We're prepping your RMC order`, body: `Hello [customer name],\n\nYour order "[order name]" is with our print shop and we're lining up the blank garments for it. Once they're in and your order is printed, we'll let you know. Thanks for repping the Meowtain! 🐱`
  - `fulfilled` (Printed): subject `Your RMC order is printed!`, body: `Hello [customer name],\n\nGreat news — your order "[order name]" is printed and moving toward shipment. We'll email again when it ships. Thanks for repping the Meowtain! 🐱`

**Auto-send:** no logic change. `maybeAutoSendEmails(nextState)` in `OrderBuilder.jsx` already fires for any `EMAIL_STATES` member when the auto-send toggle is on, so advancing to Pending Print or Printed auto-sends once these states are in `EMAIL_STATES`.

### B.4 State-navigation guard (legacy safety)

`OrderTopBar` computes `nextState`/`prevState` via `STATE_ORDER.indexOf(order.state)`. With backend normalization a `paid` order arrives as `fulfilled`, but to be safe against any unknown key, guard: if `indexOf(state) === -1`, hide the forward/back controls (show only the current badge) rather than jumping to index 0. Small defensive change.

### B.5 Testing

- `server/__tests__/statsAggregate.test.js` — `COUNTED_STATES` excludes `paid`; an order in `paid` is counted (normalized to `fulfilled`); a `paid`-normalization unit test for `normalizeState`.
- `server/__tests__/customerEmailBuilder.test.js` — `buildCustomerEmail` renders for `pending` and `fulfilled` (subject/pill/status correct).
- `server/__tests__/statsRouter.test.js` / sheets/order tests — Customers tab includes the two new `Sent:` columns; round-trips `emailed` for new states.
- Frontend: `StateBadge` renders friendly labels (e.g. `pending` → "Pending Print"); `OrderTopBar` progression excludes `paid` and includes `pending → fulfilled`; nav guard hides controls for an unknown state.

---

## File change summary

**Part A**
- `server/gmail/emailBuilder.js` — type-priority ordering for printed sections + blank rows.
- `server/__tests__/emailBuilder.test.js` — grouping/order assertions.

**Part B**
- `src/components/OrderTopBar.jsx` — `STATE_ORDER` (remove `paid`); nav guard.
- `src/components/StateBadge.jsx` — `STATE_LABELS` map + render; `STATE_COLORS` drop `paid`.
- `src/emailStates.js` — `EMAIL_STATES` + `STATE_LABELS` add `pending`, `fulfilled`.
- `server/gmail/statusEmailStore.js` — `EMAIL_STATES`.
- `server/sheets/orderSheet.js` — `EMAIL_STATES`.
- `server/gmail/customerEmailBuilder.js` — `PILLS`, `STATUS_LABELS`, `DEFAULT_TEMPLATES` for `pending`, `fulfilled`.
- `server/stats/aggregate.js` — `COUNTED_STATES` (drop `paid`); normalize state.
- `server/orders/state.js` (new) — `normalizeState`.
- `server/sheets/router.js`, `server/orders/router.js`, `server/gmail/router.js` — apply `normalizeState` on read.
- Tests as listed in B.5 + Part A.

## Non-goals
- Reworking the on-screen order preview grouping.
- Changing `pending`'s color scheme beyond what's needed (optional).
- Any Square work (separate track).
</content>
