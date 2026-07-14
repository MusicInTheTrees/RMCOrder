# Email Screen & List/Campaign Redesign

**Date:** 2026-07-14
**Status:** Approved

## Problem

The Email List and Campaigns tabs live inside the Settings screen and have no CSS at all —
their class names (`emaillist-*`, `campaigns-*`) were never added to `App.css`, so both pages
render with raw browser defaults: cramped inputs, no spacing, plain tables. There is also no
way to delete a contact, no bulk actions, no sorting, and no visible confirmation that the
list is persisted.

## Decisions Made

| Question | Decision |
|---|---|
| Where do the tabs live? | New dedicated `/email` screen; **removed** from Settings entirely |
| Entry point | "✉ Email" button next to "⚙ Settings" in the orders list header |
| Save button | "Sync to Google Sheet" button (persistence is already automatic); note on page explains auto-save |
| Delete semantics | Straight delete with a `ConfirmDialog` warning; no forced unsubscribe-first step |
| Campaign layout | Two-column compose (message left, recipients/schedule right), full-width history below |
| Sorting UI | Clickable column headers with ▲/▼ indicator |

## Background: how persistence works today

- Contacts are stored in a JSON file on the server (`config.EMAIL_LIST_FILE`), written
  synchronously on every add/update — nothing is ever "unsaved."
- Every mutation also fires a background, fire-and-forget sync to a Google Sheet named
  "RMC Email List" (`server/emaillist/sheet.js`). Failures are logged and swallowed.
- The new Sync button exists to force that sheet sync on demand and surface real
  success/failure to the user.

## Design

### 1. New EmailScreen + navigation

- New route `/email` in `src/App.jsx` renders `src/components/EmailScreen.jsx`.
- `EmailScreen` mirrors `SettingsScreen` structure: `← Back` button navigating to `/orders`,
  `<h2>Email</h2>`, and a `settings-tabs`-styled tab bar with two tabs:
  **Email List** (default) and **Email Campaign**. Tabs render `EmailListTab` / `CampaignsTab`.
- `src/components/OrdersList.jsx`: add `<button onClick={() => navigate('/email')}>✉ Email</button>`
  beside the existing ⚙ Settings button.
- `src/components/SettingsScreen.jsx`: remove the Email List and Campaigns tab buttons,
  renders, and imports. Settings keeps System, Items, Status Emails, Bugs.

### 2. Server API additions

`server/emaillist/store.js`:
- `deleteContacts(emails)` — removes matching contacts (case-insensitive email match),
  writes the file, returns the number removed.
- `updateContactsStatus(emails, status)` — bulk sets `status` (`subscribed`/`unsubscribed`)
  on matching contacts, writes the file, returns the number updated.

`server/emaillist/router.js`:
- `DELETE /:email` — deletes one contact; 404 if not found; fires background sheet sync.
- `POST /bulk` — body `{ emails: string[], action: 'subscribe' | 'unsubscribe' | 'delete' }`;
  400 on unknown action or empty list; fires background sheet sync; returns `{ affected }`.
- `POST /sync` — awaits `syncEmailListSheet()`; 200 on success, 502 with the error message on
  failure (unlike the fire-and-forget syncs elsewhere, this one reports honestly).

`src/api/emailList.js`: add `deleteContact(email)`, `bulkAction(emails, action)`, `syncSheet()`.

### 3. Email List tab redesign (`EmailListTab.jsx` + new CSS)

Layout (top to bottom, generous spacing throughout):
1. Heading + hint text (existing copy).
2. **Add-contact form** — `field-group`-styled labeled inputs ("Name", "Email") sized like the
   settings inputs, laid out in a row with real gaps; "Add" button separated from the fields.
3. **Toolbar row** — "Import from existing orders" and "Sync to Google Sheet"
   (`btn-secondary`), plus muted note: *"Changes save automatically; sync pushes the list to
   your Google Sheet."* Sync button shows a success or failure message after running.
4. **Bulk action bar** — visible only when ≥1 row is checked: "N selected" plus
   Subscribe / Unsubscribe / Delete buttons.
5. **Table** with columns: ☑ (select-all in header), Name, Email, Status, Added, Source, Actions.

Table behavior and styling:
- Real-table treatment: 1px gridlines using `var(--border)`, subtly alternating row
  backgrounds, styled header row, comfortable cell padding. New CSS classes in `App.css`
  under a `/* ===== Email List ===== */` section, reusing existing CSS variables.
- Checkboxes follow the app's existing checkbox styling.
- **Sorting**: Status, Added, and Source headers are clickable; first click sorts ascending,
  second click flips. Active column shows ▲ or ▼. Default sort: Added, newest first.
  Sorting is client-side state only.
- **Row actions**: Unsubscribe/Resubscribe toggle (existing) + Delete button.
- **Delete confirmation**: per-row delete and bulk delete open the existing `ConfirmDialog`
  component — "This permanently removes {email} from the list." / "This permanently removes
  {N} contacts from the list." Bulk subscribe/unsubscribe do not need confirmation.
- Selection state clears after any bulk action completes.

### 4. Email Campaign tab redesign (`CampaignsTab.jsx` + new CSS)

- **Two-column compose grid** (CSS grid, collapses to one column on narrow widths):
  - Left: "Message" section — Subject input and a tall Body textarea (≥12 rows).
  - Right: "Recipients" section — Whole list / Selected radios, scrollable contact picker
    when Selected is active; "Schedule" section — datetime-local input and the
    "Schedule blast" primary button.
  - Section labels use the existing `settings-section-label` uppercase style.
- Inputs sized to match settings-screen inputs (15px font, 10px+ padding).
- **History** below, full width, with the same real-table styling as the email list table
  (shared CSS classes where practical).
- No behavioral changes to campaign scheduling — this is layout/styling only.

### 5. Error handling

- All API errors surface through each tab's existing message line (or Toast where already
  present). The Sync button distinguishes success ("Synced to Google Sheet ✓") from failure
  (the server's error message).
- Bulk endpoint is transactional per-file-write: read once, mutate matches, write once.

### 6. Testing

- `server/__tests__/emaillistStore.test.js`: `deleteContacts`, `updateContactsStatus`
  (including case-insensitive matching and no-match cases).
- `server/__tests__/emaillistRouter.test.js`: DELETE, `/bulk` (each action + validation),
  `/sync` success and failure paths.
- `src/__tests__/EmailListTab.test.jsx`: sorting toggles, select-all, bulk bar visibility,
  delete confirm flow (dialog appears, confirm deletes, cancel doesn't).
- `src/__tests__/EmailScreen.test.jsx` (new): renders, switches tabs.
- `src/__tests__/SettingsScreen.test.jsx`: email tabs no longer present.
- `src/__tests__/CampaignsTab.test.jsx`: existing behavior still passes (layout-only change).

## Out of Scope

- Any change to campaign scheduling/sending logic.
- External mail-service integration (unsubscribe is and remains a local status field).
- CSV export/backup.
- Pagination or search on the contact table.
