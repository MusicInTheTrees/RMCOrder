# Handoff: Email List & Campaigns feature — status and continuation guide

**Date:** 2026-07-13
**Branch:** `maxr/email-campaigns` (branched from `main` at `9d1e684`)
**Audience:** any agent or human (e.g. Codex) picking this work up mid-stream.

---

## 1. What this feature is

Two related capabilities for RMCOrder (see `docs/APP_OVERVIEW.md` for app context):

1. **Central email list** — every customer email added to any order is auto-captured
   into one deduplicated store (Google Sheet "RMC Email List" + local JSON mirror
   `server/email-list.json`), so RMC can build a mailing list. **This is fully built.**
2. **Campaign engine** — a JSON job queue + in-app scheduler that sends one-off
   scheduled email blasts through the existing Gmail integration. **Backend store and
   email builder are built; scheduler, HTTP endpoints, and UI remain.**

## 2. The three governing documents (read in this order)

| Doc | Path | Role |
| --- | ---- | ---- |
| Design spec | `docs/superpowers/specs/2026-07-12-email-campaigns-design.md` | What & why. All approved design decisions. Covers 5 phases; only Phases 1–2 are in scope for the current plan. |
| Implementation plan | `docs/superpowers/plans/2026-07-12-email-list-and-campaigns.md` | **The source of truth for remaining work.** 10 TDD tasks with complete test code, implementation code, run commands, and commit messages. Tasks 1–7 are done; **resume at Task 8**. |
| Progress ledger | `.superpowers/sdd/progress.md` | Per-task completion log: commit ranges, review outcomes, and accumulated Minor findings for the final review. Git-ignored scratch — do not `git clean -fdx`. |

Per-task working artifacts (also git-ignored, in `.superpowers/sdd/`): `task-N-brief.md`
(the task's extracted plan text) and `task-N-report.md` (implementer report + test
evidence + post-review fixes) for N = 1..7, plus `review-*.diff` packages.

## 3. State of the branch (commits, oldest first)

| Commit | Task | What |
| ------ | ---- | ---- |
| `a67d43a` | 1 | `server/emaillist/store.js` — contact store, case-insensitive upsert; `config.EMAIL_LIST_FILE`; gitignore |
| `1068a1c` | 2 | `server/emaillist/sheet.js` — ensure/sync "RMC Email List" Sheet; settings key `emailListSheetId` |
| `38befce` | 3 | `server/emaillist/router.js` — GET/POST/PUT `/emaillist`; mounted in `server/index.js` |
| `d22863f` | 3 fix | test: assert sheet sync fires on PUT |
| `8ed5cb7` | 4 | `server/emaillist/capture.js` — capture hook in `PUT /sheets/order/:sheetId` (sheets/router.js) + `POST /emaillist/backfill` |
| `743d7fa` | 5 | `src/api/emailList.js` + `src/components/EmailListTab.jsx` + Settings tab `'emaillist'` |
| `4137960` | 5 fix | test: mock api/emailList in SettingsScreen tests |
| `c0eb175` | 6 | `server/campaigns/jobStore.js` — JSON job queue; `config.CAMPAIGN_JOBS_FILE`; gitignore |
| `a67e1d0` | 7 | `server/campaigns/campaignEmailBuilder.js` — branded HTML + unsubscribe footer; exports `renderBodyHtml` from `gmail/customerEmailBuilder.js` |
| *(pending)* | 7 fix | refactor: drop unused `DEFAULT_GENERIC_NAME` import from campaignEmailBuilder.js — **may be uncommitted working-tree change when you arrive; if `git status` shows `server/campaigns/campaignEmailBuilder.js` modified, commit it with that message after running `cd server && npm test -- --testPathPattern=campaignEmailBuilder` (expect 3/3).** |

Every task was implemented strictly from the plan's task text (TDD: failing test →
implement → pass → full suite → commit) and passed an independent code review; fixes
found by review are the `test:`/`refactor:` commits above.

Last verified suite state (after Task 7): **backend 176 tests / 34 suites, all passing;
frontend EmailListTab 4/4 and SettingsScreen 4/4 passing.**

## 4. What remains (in order)

### Task 8 — Scheduler (`server/campaigns/scheduler.js`)
Plan section "Task 8". `processDueJobs(now, { delayMs })` + `startScheduler()` wired
into `server/index.js` under `require.main === module`. Key behaviors (all specified
with full code + 7 tests in the plan): auth-skip pass, 48h stale cutoff
(`failed`/`'stale'`), send-time unsubscribe skip (including explicit recipients),
per-recipient failure isolation, ~1s send spacing (injectable `delayMs`).

### Task 9 — Campaigns router (`server/campaigns/router.js`)
Plan section "Task 9". `POST/GET /campaigns/jobs`, `POST .../:id/cancel` (scheduled
only), `POST .../:id/reschedule` (revives any status). Mounted after `/emaillist`.
Run the FULL backend suite in its Step 5.

### Task 10 — Campaigns settings tab (frontend)
Plan section "Task 10". `src/api/campaigns.js` + `src/components/CampaignsTab.jsx` +
Settings tab key `'campaigns'`. Step 5 runs the full frontend suite AND `npm run lint`.
Note: when adding the tab to `SettingsScreen`, also add a `vi.mock('../api/campaigns', ...)`
block to `src/__tests__/SettingsScreen.test.jsx` (same rationale as the Task 5 fix
commit `4137960` — SettingsScreen eagerly imports the tab and its API module).

### Final verification (plan's last section)
Both full suites green; lint clean; manual smoke test via `start.bat` (add customer to
order → appears in Email List tab; backfill; blast to yourself with no schedule →
arrives within ~1 min with header image, personalization, unsubscribe footer); confirm
`server/email-list.json` / `server/campaign-jobs.json` are ignored by git.

### Final whole-branch review
Review `git diff 9d1e684..HEAD` as one unit, and triage the accumulated **Minor
findings** listed in `.superpowers/sdd/progress.md` (one block per task — e.g. hoist
the inline requires in the backfill handler, add `required`/`type="email"` to the
EmailListTab form, direct `writeJobs` test). Fix what's worth fixing, then re-run both
suites.

### After merge-readiness
Integration is the user's call: the repo owner (Max) pushes branches; deployment
conventions may mirror his other projects. **Do not merge or push without asking.**
Phases 3–5 of the spec (recurring newsletter, order-triggered reminders, drip
sequences) are NOT in this plan — each needs its own plan document written from the
spec before implementation.

## 5. Conventions the remaining work must follow

- Backend `server/` is **CommonJS**; frontend `src/` is **ESM**.
- Backend tests: `cd server && npm test -- --testPathPattern=<name>` (Jest + Supertest,
  Google APIs always mocked). Frontend: `npm run test -- <pattern>` from **repo root**
  (Vitest + RTL, `vi` is a global). Lint: `npm run lint` (oxlint).
- TDD per task: write the plan's test verbatim → watch it fail → apply the plan's
  implementation → watch it pass → full suite → commit with the plan's message.
- Email placeholder tokens are `[customer name]` (existing app convention — the spec's
  `{{name}}` mention was superseded; see plan Global Constraints).
- Unsubscribe is reply-based (footer says reply "unsubscribe"), not a mailto link —
  deliberate deviation recorded in the plan header.
- Job/contact record shapes are pinned in the plan's Global Constraints — do not drift.
- Runtime JSON stores (`server/email-list.json`, `server/campaign-jobs.json`,
  `server/settings.json`, `server/tokens.json`) are git-ignored; never commit them.
- `node_modules` is partially present in the repo — never `git add` it.

## 6. Environment notes

- App runs via `start.bat` (Vite on 5175 proxying `/api` → Express on 3001). Google
  OAuth credentials live at `%APPDATA%\RMCOrder\rmcorder-credentials.env` (outside repo).
- The scheduler (Task 8) only runs when the Express process is up — by design
  (spec: "in-app scheduler" decision).
- A historical local test quirk: `drive.test.js` 'empty cache dir' can fail when the
  real `designs-cache/` is populated. It did NOT fail during Tasks 1–7 runs, but if it
  appears, it is pre-existing and unrelated to this feature.
