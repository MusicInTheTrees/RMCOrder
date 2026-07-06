# Design: Customer-linked line items, Delayed state, email-state changes, CSV fix

Date: 2026-07-06
Status: Approved

## Overview

Related changes to the order → customer-email workflow:

1. **Line item ↔ customer link** — associate each line item with one customer, and
   describe that customer's items in their status email.
2. **Printer-order compilation** — merge identical line items into a single row
   (summed sizes) in the order sent to the printer.
3. **Delayed state** — a side state with a dedicated button and an exit chooser.
4. **Email states reduced** to Sent, Shipped, Delayed.
5. **Bulk CSV fix** — example placeholder + per-line skip reasons.

## 1. Line item ↔ customer link + per-customer email descriptions

### Data model
- Each line item gains an optional `customerEmail` string (empty = unlinked).
- Exactly one customer per line item. One customer may be linked to many line items.
- The email is the stable key. If the linked customer is later removed from the
  order, the link is treated as unlinked (the dangling email is ignored, not shown).

### Persistence (`server/sheets/orderSheet.js`)
- Add a **"Customer Email"** column to the `Line Items` sheet header (appended after
  "Item Type ID" so column order of existing fields is unchanged).
- `writeOrderToSheet` writes `item.customerEmail || ''`.
- `readOrderFromSheet` reads it back into `customerEmail` (new-format rows only;
  legacy rows default to `''`). The `<num>-inv` helper rows do not carry it.

### UI (`src/components/LineItemCard.jsx`)
- A **customer dropdown** near the `#` header of each card.
- Options are the order's customers, rendered as `Name (email)` (falling back to just
  the email when the name is blank), plus a leading "— No customer —" option.
- Empty state (order has no customers): a disabled control with hint
  "Add customers on the Customers tab first."
- `OrderBuilder` passes `order.customers` into each `LineItemCard`.
- Selecting an option calls `onChange({ ...item, customerEmail })`.

### Customer email "Your items" section
- `buildCustomerEmail` (`server/gmail/customerEmailBuilder.js`) accepts an optional
  `items` array (the line items linked to this customer) and renders a **"Your items"**
  section inserted **after the template body, before the Status box**.
- Each linked item renders as: `{itemType} — {color}, {sizes}, {front design name(s)}`.
  - Item type = `itemTypeName || apparelType`.
  - `sizes` uses the size×qty form (`M×2, L×1`); only sizes with `total > 0`.
  - Front design name(s) = `frontDesigns[].file` joined by `, `. **Front only** — back
    designs are intentionally omitted from the customer-facing description.
  - An item with no front design renders `blank (no print)` in the design slot.
- If a customer has no linked items, the section is omitted entirely (body + status
  only, exactly as today).
- Both HTML and plain-text variants render the section.

### Wiring linked items to each recipient
- The customer-email routes (`preview`, `draft`, `send` in `server/gmail/router.js`)
  already load the full order. For each recipient, filter
  `order.lineItems.filter(li => li.customerEmail === recipient.email)` and pass as `items`.
- Preview uses the generic name and **no** items list (there is no specific recipient),
  so the preview shows body + status only, matching prior behavior. (Per-recipient item
  descriptions appear in real drafts/sends.)

## 2. Printer-order compilation (merge identical line items)

### `compileLineItems(lineItems)` helper
Groups line items by a **signature** and sums their sizes. Two items merge only when
ALL of these match:

- item type (`itemTypeName || apparelType`)
- color
- front designs (ordered list of `file`)
- back designs (ordered list of `file`)
- front method
- back method
- **front notes and back notes** (differing notes prevent a merge)

`customerEmail` is NOT part of the signature — linking never changes compilation.

Output: one merged item per signature, with:
- `sizes` summed per size label (`total` and `inventory` summed independently).
- `nums`: the sorted list of contributing line-item numbers (e.g. `["01","02","03"]`),
  displayed as `#01,02,03`.
- All signature fields carried through unchanged (including the shared notes).

Blank items (no front and no back designs) merge on the same signature rules
(type + color + notes; designs/methods are empty) and are summed the same way.

### Placement
- Shared logic lives in two mirrored helpers (client + server runtimes cannot share a
  module here, mirroring the existing duplicated `formatSizes`):
  - `src/utils/compileLineItems.js` (ESM) — used by `OrderBuilder.handleGeneratePreview`.
  - `server/gmail/compileLineItems.js` (CommonJS) — used by `emailBuilder.js`
    (`buildEmailHtml` + `buildEmailPlainText`).
- Both produce the same grouping so the on-screen preview equals the printer email.
- The printer email/preview render merged rows: number cell shows `#01,02,03`, notes
  cells show the shared notes.

## 3. Delayed state

- `delayed` is a **side state**, NOT part of the linear `STATE_ORDER`
  (`building → sent → pending → paid → fulfilled → received → shipped`).
- `StateBadge` gets a color for `delayed` (amber, e.g. `#f59e0b`).
- **Entering Delayed:** a dedicated **"Delayed"** button in `OrderTopBar`'s
  `order-state-controls`, visible whenever the order is not already delayed.
  Clicking it (with confirm) records the current state as `delayedFrom` and sets
  `state = 'delayed'`. Because `delayed` is an email state, this goes through
  `handleAdvanceState('delayed')` so auto-send (if on) sends the delayed email.
- **While Delayed:** the linear Move-to →/← Move-back controls are hidden. A single
  **"Move out of Delayed"** button opens a popup:
  - Primary action: **"Return to '{delayedFrom}'"** (defaults to the recorded state;
    if `delayedFrom` is missing, defaults to `sent`).
  - Plus a chooser (buttons) to move to any other state instead.
  - On confirm: set `state` to the chosen state, clear `delayedFrom`. Leaving Delayed is
    treated as a manual correction (like Move-back): **no** inventory changes and **no**
    auto-email for the destination state.
- **Persistence:** `delayedFrom` stored on `Sheet1` as a new "Delayed From" info row and
  read back in `readOrderFromSheet` (defaults to `''`).

## 4. Email states reduced to Sent, Shipped, Delayed

- `EMAIL_STATES` becomes `['sent', 'shipped', 'delayed']` in all three definitions:
  - `src/emailStates.js`
  - `server/sheets/orderSheet.js`
  - `server/gmail/statusEmailStore.js`
- `src/emailStates.js` `STATE_LABELS` updated: keep `sent: 'In Production'`,
  `shipped: 'Shipped'`, add `delayed: 'Delayed'`. (`fulfilled`/`received` labels no
  longer needed for emailing; leave any other consumers unaffected.)
- `server/gmail/customerEmailBuilder.js`:
  - `PILLS`, `STATUS_LABELS`, `DEFAULT_TEMPLATES` updated to `sent`/`shipped`/`delayed`.
    Add a `delayed` template (subject + body), pill (e.g. `⏳ Delayed`) and label
    (`Delayed`). Remove `fulfilled`/`received` entries.
- `fulfilled` and `received` remain valid workflow states (still in `STATE_ORDER`,
  `StateBadge`), they simply no longer send customer emails.

### Migration
- The `Customers` sheet header changes to
  `Name, Email, Sent: sent, Sent: shipped, Sent: delayed`.
- On the next save of any order, the old `Sent: fulfilled` / `Sent: received` columns are
  dropped. Historical send-timestamps for those two states are discarded (tracking data
  only). **Accepted.**
- `rowsToCustomers` / `customersToRows` follow `EMAIL_STATES`, so they map the new
  columns positionally; old sheets read until first save produce empty timestamps for the
  new columns, which is harmless.

## 5. Bulk CSV fix (`src/utils/parseCustomers.js` + `CustomersPanel.jsx`)

- `parseCustomers` returns skipped entries as objects `{ line, reason }` instead of bare
  strings. Reason is `"no email address found"` when no `@…tld` match exists.
  (This is the only skip reason today; structure allows more later.)
- `CustomersPanel` renders each skipped entry as `'{line}' — {reason}`.
- The paste `<textarea>` placeholder becomes a concrete multi-line example:
  ```
  Jane Doe, jane@example.com
  John Smith <john@example.com>
  bare@example.com
  ```

## Testing

Unit tests (following existing `__tests__` patterns):
- `compileLineItems` (both mirrors): merges identical items and sums sizes; keeps items
  with differing back designs separate; keeps items with differing notes separate; blank
  items merge on type+color+notes; `nums` collects contributing numbers.
- `parseCustomers`: returns `{line, reason}` for lines with no email; still parses
  `Name, email`, `Name <email>`, and bare email.
- Line-item `customerEmail` round-trips through `writeOrderToSheet` / `readOrderFromSheet`.
- `buildCustomerEmail` renders the "Your items" section (front design only; blank items;
  omitted when no linked items) in HTML and plain text.
- `delayed` is a valid email state end-to-end (template exists; preview/draft/send accept
  it); `fulfilled`/`received` are rejected as email states.

## Out of scope
- No change to how sizes/quantities are entered per line item.
- No multi-customer-per-line-item.
- No reordering of existing sheet columns beyond the appended "Customer Email" column and
  the appended "Delayed From" info row.
