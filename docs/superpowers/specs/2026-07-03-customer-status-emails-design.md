# Customer Status Emails — Design

**Date:** 2026-07-03
**Project:** RMCOrder (Rocky Meowtain Company LLC)
**Status:** Approved design, pending implementation plan

## Summary

Add a customer-facing email channel to RMCOrder. Each order gets a list of the
buyers whose purchases that order fulfills (collected at vending events on paper,
or pasted from a Square export). When an order advances to certain states, those
buyers receive a branded status email telling them where their order is. A new
`shipped` state is added to mark that goods have left RMC for the customer.

This is distinct from the existing **printer-facing** email (the Gmail *draft* to
Spew built in `server/gmail/emailBuilder.js` + `router.js`), which is unchanged.

## Goals

- Store a per-order list of customers as `{ name, email }`.
- Send an individual status email to each customer (no shared/BCC recipients)
  when the order reaches an emailing state.
- Emailing states: `sent`, `fulfilled`, `received`, `shipped`.
- Review-then-send by default, with an editable preview; a global setting can
  switch to auto-send.
- Add the `shipped` order state.
- Never double-email a customer for the same state.

## Non-Goals

- Bulk/marketing email, unsubscribe management, open tracking.
- Item-level personalization (which specific items each buyer purchased).
- Changing the existing printer (Spew) email flow.
- Persisting per-order edited email copy (edits apply only to the current send).

## Order States

Current chain (`src/components/OrderTopBar.jsx:5`):

```
building → sent → pending → paid → fulfilled → received
```

New chain:

```
building → sent → pending → paid → fulfilled → received → shipped
```

State meanings (buyer's perspective) and email mapping:

| State       | Meaning                                          | Emails buyer? |
|-------------|--------------------------------------------------|:-------------:|
| `building`  | RMC still assembling the order                   | no            |
| `sent`      | Order sent to the printer (Spew)                 | **yes**       |
| `pending`   | Internal (awaiting printer)                      | no            |
| `paid`      | RMC has paid the printer                         | no            |
| `fulfilled` | Printer finished; RMC is going to pick it up     | **yes**       |
| `received`  | Printed goods physically back at RMC             | **yes**       |
| `shipped`   | **(new)** Goods handed off / shipped to customer | **yes**       |

`shipped` has no inventory side-effects (contrast `sent`, which decrements blank
inventory, and `received`, which increments it — see
`OrderBuilder.handleAdvanceState`).

## Data Model

### Google Sheet — new "Customers" tab

Each order Sheet gains a 4th tab, `Customers`, following the existing 3-tab
pattern (Order Info / Line Items / Designs).

| Column          | Contents                                        |
|-----------------|-------------------------------------------------|
| `Name`          | Customer name (may be blank)                    |
| `Email`         | Customer email address                          |
| `Sent: sent`    | ISO timestamp the `sent` email went to them     |
| `Sent: fulfilled` | ISO timestamp the `fulfilled` email went out  |
| `Sent: received` | ISO timestamp the `received` email went out    |
| `Sent: shipped` | ISO timestamp the `shipped` email went out      |

Empty tracking cell = not yet emailed for that state.

### orders-cache JSON

The order object gains:

```json
"customers": [
  {
    "name": "Jordan",
    "email": "jordan@example.com",
    "emailed": { "sent": "2026-07-03T15:00:00Z", "fulfilled": "", "received": "", "shipped": "" }
  }
]
```

`readOrderFromSheet` / `writeOrderToSheet` in `server/sheets/orderSheet.js` are
extended to round-trip the Customers tab. Orders with no Customers tab (legacy)
read back as `customers: []`.

## UI

### Order/Customers tabs

`OrderBuilder` gains a top-level tab toggle: **Order** | **Customers**. The
existing builder body moves under the "Order" tab; the new `CustomersPanel`
renders under "Customers". Customer data lives on the same `order` object and
saves through the existing `useOrder` auto-save/offline path.

### CustomersPanel

- **Bulk paste box** — paste one entry per line. Parser accepts:
  - `Name, email`
  - `Name <email>`
  - bare `email` (name left blank)
  Lines that contain no valid email are skipped and reported.
- **Editable table** — rows of `{ name, email }` with add-row and remove-row.
- **Per-state send controls** — for each emailing state, a "Send status email"
  button plus a small indicator of how many customers have/haven't received it.

## Emails

### Appearance ("Trailhead" style)

- Cream header band (`#f3ecd9`) with a 3px forest-green (`#22402f`) underline,
  containing the RMC mountain logo (centered, ~230px).
- Body: burnt-orange (`#e07a3f`) status pill, green headline, order name, short
  friendly copy.
- Forest-green footer: "Rocky Meowtain Company LLC · Made with 🐾 in the Rockies".
- Greeting personalizes: `Hi {name},` → falls back to `Hi there,` when name blank.

### Logo embedding

The email references the logo as an **inline image (CID)**, embedded in the MIME
so no public hosting is required and it renders in Gmail. The logo asset ships
with the backend (e.g. `server/assets/rmc_logo.png`, optionally downscaled for
email weight). This requires `multipart/related` wrapping the existing
`multipart/alternative` body.

### Default copy per state

Placeholders: `{name}` (customer), `{orderName}` (order).

- **sent** — Subject: `Your RMC order is being made 🖨️`
  Pill: `🖨️ In Production`. "Your order "{orderName}" is now with our print shop
  getting made. We'll keep you posted as it moves along. Thanks for repping the
  Meowtain!"
- **fulfilled** — Subject: `Your RMC order is printed ✅`
  Pill: `✅ Printed`. "Great news — "{orderName}" is finished at the print shop
  and we're heading out to pick it up. You're almost at the summit!"
- **received** — Subject: `Your RMC order is in-hand 📥`
  Pill: `📥 In-Hand`. "Your order "{orderName}" has arrived at RMC and we're
  getting it packed up and ready for you. We'll let you know the moment it's on
  its way."
- **shipped** — Subject: `Your RMC order is on its way! 📦`
  Pill: `📦 Shipped`. "Your order "{orderName}" just left the den. Keep an eye
  out — your gear should reach you soon. Thanks for repping the Meowtain!"

Customer emails deliberately omit the internal Drive folder / Sheet links used in
the printer email.

## Send Flow

### Review-then-send (default)

1. User clicks "Send status email" for a state (or advances the order to that
   state while auto-send is off).
2. An **editable preview modal** opens:
   - Editable **subject** and **body** (pre-filled from the state's default
     template with `{orderName}` resolved; `{name}` shown per-recipient at send).
   - **Recipient checklist** — everyone on the order, pre-checked for those whose
     `emailed[state]` is empty; already-emailed customers shown unchecked/greyed.
   - **Send** button.
3. On send, the backend sends **one individual message per checked recipient**,
   resolving `{name}` per recipient, and records the timestamp into
   `emailed[state]` for each (written to the Customers tab + cache).

Edits made in the modal apply only to that send; they are not persisted.

### Auto-send (global setting)

A boolean in the settings store (`autoSendCustomerEmails`, default `false`) with a
checkbox in Settings. When on, advancing an order to an emailing state skips the
modal and sends the default-template email to every customer whose
`emailed[state]` is empty.

### Idempotency

`emailed[state]` timestamps are the single source of truth for "already sent."
Both flows only target customers with an empty timestamp for the state, so
re-running a send or re-entering a state never double-emails. A customer added
after a state was emailed simply has an empty timestamp and can be caught up on
the next send for that state.

## Backend Changes

- `server/gmail/client.js` — add `sendEmail(to, subject, html, plain, inlineImages)`
  using `gmail.users.messages.send` with `multipart/related` for the inline logo.
  (Existing `upsertDraft` unchanged.)
- `server/gmail/customerEmailBuilder.js` *(new)* — builds `{ subject, html, plain }`
  for a given `(state, orderData, customer)` from the default templates; handles
  greeting fallback and logo CID.
- `server/gmail/router.js` — add:
  - `POST /customer-email/preview` → `{ subject, html }` for a state (sample/first
    customer) to populate the modal.
  - `POST /customer-email/send` → body `{ sheetId, state, recipients[], subject?,
    body? }`; sends individually, records timestamps, returns per-recipient result.
- `server/sheets/orderSheet.js` — read/write the Customers tab (name, email,
  per-state timestamps); default to `[]` when the tab is absent.
- `server/settings/store.js` — add `autoSendCustomerEmails` boolean.
- `server/assets/rmc_logo.png` — bundled logo for inline embedding.

## Frontend Changes

- `src/api/customerEmails.js` *(new)* — `previewCustomerEmail`, `sendCustomerEmail`.
- `src/components/CustomersPanel.jsx` *(new)* — paste/parse, editable table,
  per-state send controls.
- `src/components/CustomerEmailModal.jsx` *(new)* — editable preview + recipient
  checklist + send.
- `src/components/OrderBuilder.jsx` — Order/Customers tab toggle; thread customers
  through `order` state and save.
- `src/hooks/useOrder.js` — include `customers` in the order object.
- `src/components/OrderTopBar.jsx` + `StateBadge.jsx` — add `shipped` to
  `STATE_ORDER` and badge styling; trigger send/auto-send on advancing to an
  emailing state.
- Settings UI — `autoSendCustomerEmails` checkbox.

## Testing

Backend (Jest + Supertest, Google APIs mocked):
- Customer paste parser: `Name, email` / `Name <email>` / bare email / invalid.
- `customerEmailBuilder`: correct subject/pill/copy per state; greeting fallback.
- Customers tab round-trip in `orderSheet` (including legacy order with no tab).
- `/customer-email/send`: individual sends, timestamp recording, skips
  already-emailed recipients.

Frontend (Vitest + RTL, API mocked):
- CustomersPanel parse/add/remove.
- CustomerEmailModal recipient pre-selection (already-emailed unchecked) and send.
- `shipped` state appears in the advance flow.

## Open Implementation Notes

- Downscale `rmc_logo.png` (currently 1536×1024, ~2 MB) before bundling for email
  weight; keep it crisp on the cream band.
- Gmail per-message send has daily quota limits; individual sends to a large list
  could hit them. Out of scope to solve now, but worth surfacing if lists grow.
