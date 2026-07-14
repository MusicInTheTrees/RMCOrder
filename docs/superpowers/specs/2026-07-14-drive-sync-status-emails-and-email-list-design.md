# Drive Sync: Status Emails Pull/Push + Merging Email List Sync

**Date:** 2026-07-14
**Status:** Approved

## Problem

Both machines (Max + partner) run their own local server, and two data sets live in
per-machine JSON files with no way to converge:

- **Status email templates** (`server/status-email-templates.json`): saving already
  fire-and-forget uploads the file to the shared Drive folder
  (`server/gmail/router.js:119-126`), but there is **no pull** — partner edits sit on
  Drive with no way to retrieve them.
- **Email list** (`server/email-list.json`, git-ignored): fully per-machine. The Google
  Sheet sync is push-only and overwrites, so two machines clobber each other's view and
  contacts captured on one machine never reach the other.

## Decisions Made

| Question | Decision |
|---|---|
| Status Emails sync UX | Explicit **Pull from Drive** and **Push to Drive** buttons (Items-catalog pattern) |
| Pull safety | Pull goes through `ConfirmDialog` (it replaces local templates + any unsaved edits) |
| Email list sync model | One **"Sync with Drive"** button that merges (union), not whole-file overwrite |
| Merge conflict rules | `unsubscribed` beats `subscribed`; earliest `addedAt` + its `source` kept; non-empty name preferred (local wins if both non-empty) |
| Deletion caveat | Accepted: a contact deleted on one machine reappears until both machines sync after the delete |
| Background freshness | Existing fire-and-forget mutation syncs also upload the local email-list JSON to Drive |

## Design

### 1. Status Emails routes (`server/gmail/router.js`)

Both routes sit next to the existing GET/PUT template routes and use the existing
`findFileByName` / `uploadFileContent` / `downloadFileContent` from `server/drive/client.js`
with `config.DRIVE.TOP_LEVEL_FOLDER` and the existing Drive filename
`status-email-templates.json` (keep the literal in a `const STATUS_TEMPLATES_DRIVE_NAME`
and reuse it in the PUT route's background upload).

- `POST /gmail/customer-email/templates/pull`
  - `findFileByName(...)`; if absent → 404 `{ error: 'No status emails on Drive yet — save or push from the other machine first.' }`
  - `downloadFileContent(file.id)` → `JSON.parse` → `writeStatusEmails(parsed)` (existing
    validation/default-filling) → 200 with the saved `{ templates, genericCustomerName }`.
  - Invalid JSON or Drive failure → 502 `{ error: err.message }`.
- `POST /gmail/customer-email/templates/push`
  - `writeStatusEmails` is NOT called — push uploads the current local file content:
    `uploadFileContent(STATUS_TEMPLATES_DRIVE_NAME, JSON.stringify(readStatusEmails(), null, 2), ...)`,
    **awaited** → 200 `{ ok: true }`; failure → 502 `{ error: err.message }`.

Client API (`src/api/customerEmails.js`):
`pullStatusEmailTemplates()` and `pushStatusEmailTemplates()` POSTing to the routes above.

### 2. Status Emails tab UI (`src/components/StatusEmailsTab.jsx`)

- Toolbar (styled like the Email List tab toolbar) above the template blocks:
  **Pull from Drive** and **Push to Drive** (`btn-secondary`), plus muted note:
  *"Saving also backs up to Drive automatically."*
- **Pull** opens `ConfirmDialog`: "This replaces your local status emails with the shared
  Drive copy." Confirm → call pull, replace `templates` + `genericName` state with the
  response, message "Pulled latest from Drive ✓". Cancel → nothing.
- **Push** → call push, message "Pushed to Drive ✓" or the server's error message.
- Messages reuse the tab's existing `msg` line.

### 3. Email list merge (`server/emaillist/store.js`)

New `mergeContacts(remote)` — `remote` is an array of contact objects (possibly from an
older file; tolerate missing fields):

- Build map of local contacts by lowercased email.
- For each remote contact with a non-empty email:
  - **Not present locally** → append as-is (preserve its `status`/`addedAt`/`source`;
    default missing fields like `upsertContacts` does).
  - **Present locally** → merge in place:
    - `status`: `unsubscribed` if either side is `unsubscribed`, else `subscribed`.
    - `addedAt`: the earlier ISO timestamp; `source`: the source belonging to whichever
      side had that earlier `addedAt` (missing/blank `addedAt` counts as later).
    - `name`: keep local if non-empty, else remote's.
- Write the file once; return `{ contacts, added }` where `added` = count of appended
  remote-only contacts.

### 4. Email list sync route (`server/emaillist/router.js` + `server/emaillist/sheet.js`)

- New Drive JSON transport: filename constant `email-list.json`, stored in
  `config.DRIVE.TOP_LEVEL_FOLDER` (same folder as the items catalog / templates).
- `POST /emaillist/sync` becomes the full merge cycle (all awaited, honest errors):
  1. `findFileByName('email-list.json', ...)`; if found, download + parse (tolerate parse
     failure by treating as empty → still proceed) and `mergeContacts(remote)`.
  2. Upload merged local list as `email-list.json`.
  3. `syncEmailListSheet()` (existing full sheet rewrite).
  - 200 `{ ok: true, added, total }`; any Drive/Sheets failure → 502 `{ error }`.
- `fireSync()` (background, on add/update/delete/bulk/backfill) now does BOTH
  fire-and-forget: the existing sheet rewrite AND `uploadFileContent('email-list.json', ...)`
  of the local list. Failures stay console-warn only. (Drive JSON is a transport; the
  merge always runs against the local list, so an overwritten Drive copy cannot lose data.)

### 5. Email List tab UI (`src/components/EmailListTab.jsx`)

- Button label "Sync to Google Sheet" → **"Sync with Drive"**.
- Success message: `Synced — {added} new contact(s) pulled in, {total} total.`;
  failure: `Sync failed: {error}`.
- Note text becomes: *"Changes save locally right away; Sync merges with the shared Drive
  copy and updates the Google Sheet."*

### 6. Error handling

- All sync/pull/push routes report real errors (502 + message); the UI shows them in the
  tab's message line. No silent failures on user-initiated actions.
- Background uploads remain fire-and-forget with console warnings (existing pattern).

### 7. Testing

- Server, store: merge semantics — remote-only append (fields preserved), status conflict
  (unsubscribed wins both directions), earliest addedAt + matching source kept, name
  fill rules, case-insensitive matching, malformed remote entries skipped.
- Server, routes (Drive/Sheets clients mocked): templates pull (found / not found / bad
  JSON), templates push (success / Drive failure), emaillist sync (no Drive file, merge
  path with added count, upload + sheet both called, 502 on failure), fireSync uploads
  JSON alongside sheet rewrite.
- Frontend: StatusEmailsTab pull confirm flow (cancel = no call, confirm = state replaced),
  push button + messages; EmailListTab renamed button, new success message shape.

## Out of Scope

- Tombstones / true two-way deletion propagation (deletes stick once both sides sync).
- Auto-pull on tab open, conflict UI, or sync scheduling.
- Any change to campaign jobs storage (per-machine by design — the scheduler runs where
  the blast was created).
- Migrating the Google Sheet away from being a push-only human-readable view.
