# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**RMCOrder** — a locally-hosted web app for Rocky Meowtain Company LLC (RMC) to build, manage, and email apparel print orders to their printing partner Spew. It replaces hand-written text orders with a structured order builder backed by Google Drive and Google Sheets. Launched via `start.bat`.

> **For a feature-level overview (what the app does, the order/line-item model, the two email systems, and the three easily-confused "blank" concepts), read [`docs/APP_OVERVIEW.md`](docs/APP_OVERVIEW.md) first.** This file below covers commands, infrastructure, and file locations.

## Commands

**Run both servers (normal use):**
```
start.bat
```

**Frontend only (Vite dev server, port 5175):**
```
npm run dev
```

**Backend only (Express, port 3001):**
```
npm run dev:backend
# or: cd server && npm run dev
```

**Frontend tests:**
```
npm test              # run once
npm run test:watch    # watch mode
npm run test -- <pattern>   # single file/pattern
```

**Backend tests:**
```
cd server && npm test
cd server && npm test -- --testPathPattern=<name>   # single file
```

**Lint:**
```
npm run lint
```

## Architecture

Two processes started by `start.bat`:
- **React/Vite frontend** on port 5175 — all `/api/*` calls are proxied by Vite to `http://localhost:3001`
- **Express backend** on port 3001 — owns all Google API calls, OAuth tokens, filesystem caches

**Critical rule:** The frontend never calls Google APIs directly. All Google access goes through the backend. This keeps credentials off the browser and simplifies future deployment.

**Credentials** are stored outside the repo at `%APPDATA%\RMCOrder\rmcorder-credentials.env` (never committed). Backend falls back to `server/.env` if the external file is absent.

## Data Layer

No relational database. Three tiers:

1. **Google Sheets** (source of truth) — each order gets its own Sheet with 3 tabs: Order Info, Line Items, Designs
2. **`orders-cache/*.json`** — written on every successful Sheet write; read-only fallback when Drive is unreachable
3. **`designs-cache/`** — PNG images synced from the Google Drive "Design Source of Truth" folder on startup; served as static files by Express at `/designs-cache/`

The Blank Inventory Sheet (`1a_vMRuJPn19Y7E1z-hfV17Z-gD_63PNKAn0Rwx2tkSk`) is a separate pre-existing Sheet for blank shirt stock.

## Key File Locations

**Backend (`server/` — CommonJS):**
- `config.js` — all ports, Drive folder IDs, cache paths, credentials config
- `auth/oauth.js` — OAuth2 client, token load/save to `tokens.json`
- `middleware/requireAuth.js` — 401 guard used on all authenticated routes
- `drive/client.js` — Drive API: list, download, create folder/sheet, copy file
- `drive/designsCache.js` — syncs Drive Source of Truth → `designs-cache/`
- `sheets/orderSheet.js` — builds/parses the 3-tab Sheet structure
- `orders/idGenerator.js` — generates `RMC-NNN-YYYY-MM-DD` order IDs
- `orders/cache.js` — read/write `orders-cache/*.json`
- `gmail/emailBuilder.js` — builds HTML email body from order data

**Frontend (`src/` — ESM):**
- `api/client.js` — base `apiFetch` wrapper (all calls use path prefix `/api`)
- `hooks/useOrder.js` — loads order (Sheet → cache fallback), auto-saves, manages offline queue
- `hooks/useOfflineQueue.js` — queues failed saves, flushes on reconnect
- `components/OrderBuilder.jsx` — main order view, composes all sub-components
- `components/LineItemCard.jsx` — single line item: apparel type, color, sizes, designs, notes

## Order Data Model

**Order ID format:** `RMC-[NNN]-[YYYY-MM-DD]` (3-digit zero-padded sequential + ISO date)

**Order states** (manually advanced): `building` → `sent` → `pending` → `paid` → `fulfilled` → `received`

**Line item sizes:** Each size (`XS/S/M/L/XL/XXL`) tracks `{ total, inventory }` — quantity to order = total − inventory.

**Design numbering in order folder:** `[NN]-[original-filename]` (2-digit zero-padded prefix)

## Drive Folder Structure

```
Top Level Operating Folder (1OYG9ThPfJI0x13080vqW6sIY3c9Us4wk)
  Top Level Order Folder (1voehD5oSz0zjy0k_8Q-RoQ76Imq62dLV)
    RMC-001-2026-06-28/
      Designs/
        01-design_name.png
      RMC-001-2026-06-28 Order   ← Google Sheet
  Design Source of Truth (1CVhEtQZ5hgEB0vM83Y9WfjIo55-ouQ66)
    design_name.png
    ...
```

## Offline Behavior

When a Sheet write fails, the change is queued in `useOfflineQueue` and the UI shows an offline banner. On reconnect, the queue flushes automatically. On app load with Drive unreachable, order data loads from `orders-cache/`. Last-write-wins (no conflict resolution in Phase 1).

## Testing Conventions

- **Backend:** Jest + Supertest; `cd server && npm test`; Google API modules are mocked in unit tests
- **Frontend:** Vitest + React Testing Library; jsdom environment; API modules mocked with `vi.mock`
- Test files live in `server/__tests__/` and `src/__tests__/`

## Phase 1 Scope

Phase 1 covers order creation/editing, Drive/Sheets integration, local caching, and Gmail draft generation. Deferred to later phases: visual color swatches, SVG shirt preview, supplier catalog/pricing, and physical inventory spreadsheet updates.
