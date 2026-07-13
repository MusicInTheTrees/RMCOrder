# Email List & Campaigns — Design

**Date:** 2026-07-12
**Status:** Approved design, pending implementation plan

## Goal

Two related features:

1. **Central email list** — every customer email added to any order is captured
   into one central store, deduped, so RMC can build a mailing list.
2. **Automated/scheduled emails** — a campaign system that can send one-off
   scheduled blasts, recurring newsletters, order-triggered reminders, and drip
   sequences to that list, using the Gmail integration the app already has.

## Decisions made during brainstorming

- **In-app scheduler** (not Apps Script / external cloud). Emails send while the
  Express backend is running; anything due while the app was closed sends on
  next launch, subject to a staleness cutoff.
- **List storage: Google Sheet + local JSON mirror** — same source-of-truth /
  fallback pattern orders already use (`orders-cache/`).
- **Approach A: one unified job engine.** All four email types compile down to
  one concept — a *job* (template + recipients + send-at) in a JSON queue — with
  thin creation layers per type. (Rejected: B, four separate implementations;
  C, syncing the list to an external service like Mailchimp.)

## Section 1 — Central email list

New backend module `server/emaillist/`.

**Contact record:**

```js
{ name, email, status: 'subscribed' | 'unsubscribed', addedAt, source }
```

`source` is the order ID the contact came from, or `'manual'` / `'backfill'`.

**Storage:**

- A new **"RMC Email List" Google Sheet** (one tab, one row per contact),
  created in the Top Level Operating Folder; its ID saved in settings.
- Local mirror `server/email-list.json`, written on every successful Sheet
  write, used as read fallback when Drive is unreachable.

**Capture hook:** in the `PUT /sheets/order/:sheetId` handler
(`server/sheets/router.js`), after a successful order save, upsert every
`order.customers[].email` into the list.

- Dedupe is case-insensitive on email.
- Existing contacts keep their status — re-adding never resurrects an
  unsubscribed contact.
- Fire-and-forget: a list-update failure logs a warning and never fails the
  order save.

**Backfill:** a one-time "Import from existing orders" button (Email List tab)
sweeps all orders' Customers tabs plus line-item `customerEmail` fields and
upserts everything with `source: 'backfill'`.

**Endpoints:**

- `GET /emaillist` — list contacts
- `POST /emaillist` — manual add
- `PUT /emaillist/:email` — edit / toggle unsubscribe
- `POST /emaillist/backfill` — one-time import

## Section 2 — Job engine & scheduler

New backend module `server/campaigns/`.

**Job record:**

```js
{
  id, subject, body,
  recipients,        // 'list' (resolved at send time to subscribed contacts)
                     // or an explicit array of emails
  sendAt,
  status: 'scheduled' | 'sent' | 'failed' | 'cancelled',
  createdBy,         // 'blast' | 'newsletter' | 'drip:<sequenceId>' | 'trigger:<orderId>'
  sentAt, error,
  results,           // per-recipient outcomes after a send attempt
}
```

`recipients: 'list'` resolves at **send time**, so late unsubscribes are
respected. Explicit-recipient jobs (triggers, drips) also check status at send
time: unsubscribed addresses are skipped and recorded as such in `results`.

**Job store:** `server/campaign-jobs.json`, read/written like `settings.json`
and `items-catalog.json`. Local-only — the email *list* is the shared artifact;
the queue is machinery.

**Scheduler:** on Express startup, a `setInterval` loop (every 60s) scans for
`status: 'scheduled'` jobs with `sendAt <= now` and sends them.

- **One Gmail message per recipient** (personalized greeting, unsubscribe
  footer, no shared CC lines), via the existing `gmail/client.js` send path and
  the existing HTML wrapper (assets in `server/assets/`).
- **Staleness cutoff:** jobs more than **48 hours** overdue are marked
  `failed` with error `'stale'` instead of sent. Stale jobs appear in the
  history view with a one-click reschedule.
- **Per-recipient failure isolation:** one bad address doesn't abort the batch;
  the job records per-recipient results and ends `sent` (with a partial-failure
  note) or `failed` if every recipient failed.
- **Rate guard:** sends spaced ~1/second (consumer Gmail caps at roughly 500
  sends/day — fine at RMC's scale, but no giant blasts).

**Unsubscribe:** every campaign email gets an automatic footer with a `mailto:`
link pre-filled with subject "unsubscribe". Marking the contact unsubscribed is
manual (one click in the Email List tab) when the reply arrives — no inbox
polling in this phase. Order *status* emails (the existing system) remain
transactional and still send to unsubscribed contacts.

## Section 3 — The four email types & UI

Each type is a different way of **creating jobs**:

1. **One-off blast** — compose subject/body, pick recipients (whole list or a
   checkbox subset), pick date/time or "send now" → creates one job.
2. **Recurring newsletter** — definition
   `{ name, subject, body, schedule (weekly/monthly + day + time), enabled }`
   in `server/campaign-definitions.json`. Each scheduler pass ensures the next
   occurrence exists as a job; the body is editable any time before it sends.
   Disabling the definition cancels its pending job.
3. **Order-triggered reminders** — rules
   `{ afterState, delayDays, subject, body, enabled }` (e.g. 14 days after
   `shipped`). The `PUT /sheets/order` handler detects a state *transition*
   into a rule's state and enqueues one job per customer on that order,
   `sendAt = now + delayDays`, tagged `trigger:<orderId>` so the same rule
   never double-fires for the same order.
4. **Drip sequence** — definition
   `{ name, steps: [{ offsetDays, subject, body }], enabled }`. When a **new**
   contact is upserted into the email list, one job per step is enqueued for
   them. Editing a sequence affects only future joiners. Unsubscribing cancels
   the contact's pending drip jobs.

**Templates** reuse the placeholder convention from the existing status emails
(`{{name}}` etc.), matching the Status Emails tab experience.

**UI — two new Settings tabs** (following the `StatusEmailsTab` pattern):

- **Email List tab** — contact table (name, email, status, source, added),
  manual add, unsubscribe toggle, backfill button.
- **Campaigns tab** — compose/schedule a blast; manage newsletter, trigger, and
  drip definitions; history/queue view of jobs (scheduled / sent / failed /
  stale) with cancel and reschedule actions.

## Section 4 — Error handling

- **Not signed in / token expired:** scheduler checks auth first and skips the
  pass; jobs stay `scheduled` and send once signed in (staleness cutoff still
  applies).
- **Drive unreachable at send time:** `'list'` recipient resolution falls back
  to `email-list.json`.
- **Every job send is wrapped:** unexpected errors mark the job `failed` with
  the message stored; the scheduler loop never crashes the server.
- **JSON stores** follow the existing `settings.json` / `items-catalog.json`
  write pattern.

## Testing

Existing conventions: Jest + Supertest (backend, Google APIs mocked in
`server/__tests__/`), Vitest + RTL (frontend, API mocked, `src/__tests__/`).

- **Email list:** upsert/dedupe (case-insensitive), unsubscribed stays
  unsubscribed on re-add, capture hook never fails an order save, backfill
  sweep covers Customers tabs and line-item `customerEmail`.
- **Scheduler:** due-job selection, 48h stale marking, per-recipient failure
  isolation, auth-skip pass.
- **Type layers:** state-transition detection with no double-fire per
  order+rule, drip enqueues on *new* contact only, newsletter next-occurrence
  creation, disabling a definition cancels its pending jobs.
- **Frontend:** both tabs render and drive the mocked API.

## Build phasing

Five independently shippable chunks, in order:

1. **Email list capture** — Sheet + mirror + capture hook + backfill + Email
   List tab. Useful on day one.
2. **Job engine + scheduler + one-off blasts** — Campaigns tab with compose +
   history.
3. **Recurring newsletter.**
4. **Order-triggered reminders.**
5. **Drip sequences.**

## Out of scope (this design)

- Public unsubscribe page / inbox polling for unsubscribe replies.
- Open/click tracking and analytics.
- Sending while the app is closed (Apps Script or hosted deployment — revisit
  if the SaaS conversion happens).
- Syncing to external marketing services.
