# SpewOrderApp — Phase 1 Design: Order Builder + Google Drive Integration

**Date:** 2026-06-28  
**Scope:** Phase 1 of 3  
**Company:** Rocky Meowtain Company LLC (RMC)  
**Printing partner:** Spew

---

## Overview

SpewOrderApp is a locally-hosted React + Node web app that helps Rocky Meowtain Company build, manage, and submit apparel print orders to Spew. It replaces hand-rolled text orders with a structured, visual order builder backed by Google Drive and Google Sheets.

Phase 1 covers: order creation and editing, Google Drive folder/file management, Google Sheets as live order source of truth, local caching (designs + order data), and Gmail draft generation.

**Users:** The owner (software engineer) and their partner (non-technical). The app must be usable by both without technical knowledge after initial setup.

---

## Architecture

Two processes started by a single `.bat` shortcut:

- **React frontend** — Vite, port 5175. The UI.
- **Node/Express backend** — port 3001. Owns all Google API communication, OAuth token storage, local filesystem cache, and offline queue.

The frontend never calls Google directly — all Google API calls go through the backend. This keeps credentials off the browser and makes the online migration path clean: replace `localhost:3001` with a deployed backend URL.

**Google APIs used:**
- Google Drive API — read design library, create order folders, copy design files
- Google Sheets API — read/write order spreadsheets
- Gmail API — create formatted email drafts

**Launch shortcut:** A `.bat` file starts both servers, waits for them to be ready, and opens `http://localhost:5175` in the default browser. Can be given a custom icon. Closing the terminal stops both servers.

---

## Google OAuth & Authentication

OAuth 2.0 via a Google Cloud project set up once by the owner. The backend stores the refresh token in a local `.env` file. Scopes requested: Drive, Sheets, Gmail.

**First-run flow:**
1. App opens to a setup screen: "Connect your Google account"
2. Clicking it opens Google's consent screen in the browser
3. On approval, the refresh token and account email are stored in `.env`
4. App proceeds to the landing screen — never asks again unless the token is revoked

**Every subsequent launch:** A landing screen shows:
- Primary button: "Continue as \<saved email\>"
- Secondary option: "Use a different account" (clears token, restarts OAuth flow)

Your partner always clicks the primary button and goes straight to the Orders list.

---

## Google Drive Folder Structure

```
[Top Level Operating Folder]/
  [Top Level Order Folder]/
    RMC-001-2026-06-28/
      Designs/
        01-bestie_bitches.png
        02-green_neon_cat.png
      RMC-001-2026-06-28 Order   ← Google Sheet (order data + state)

  [Design Source of Truth]/
    bestie_bitches.png
    green_neon_cat.png
    midlife_enthusiast_coffee.png
    ...
```

**Order ID format:** `RMC-[zero-padded 3-digit sequential]-[YYYY-MM-DD]`  
Example: `RMC-001-2026-06-28`

The sequential number is determined by scanning the Top Level Order Folder for existing orders and incrementing the highest number found.

**Design file naming in order folder:**  
Sequential number (zero-padded 2 digits) prepended to the original filename, preserving the source name.  
Example: `01-bestie_bitches.png`, `02-green_neon_cat.png`

Design numbers are assigned in the order the designs are added to the line items during the order build.

---

## Local Caches

### Design Image Cache
- Location: `designs-cache/` folder inside the project directory
- The backend syncs from the Drive Source of Truth on startup and on manual user-triggered refresh
- Frontend loads images from `http://localhost:3001/designs-cache/` — no Drive calls while browsing
- If Drive is unreachable during refresh, a toast shows: "Couldn't reach Drive — showing cached designs"

### Order Data Cache
- Location: `orders-cache/RMC-001-2026-06-28.json` per order
- Written every time a successful Sheet write occurs
- On app load, if Drive/Sheets are unreachable, order loads from local JSON and app shows offline banner
- When connection restores, queued changes flush to the Sheet automatically

---

## Google Sheet — Order Structure (3 tabs)

Each order has its own Google Sheet inside its Drive subfolder.

### Tab 1: Order Info

| Field | Value |
|---|---|
| Order ID | RMC-001-2026-06-28 |
| State | building |
| Created | 2026-06-28 |
| Last Updated | 2026-06-28 |
| Notes | (free text) |

### Tab 2: Line Items

One row per apparel item, plus an inventory sub-row per line item when any size has stock on hand.

| # | Apparel Type | Color | XS | S | M | L | XL | XXL | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 01 | Women's Round Neck | Black | 0 | 0 | 2 | 1 | 0 | 0 | Curved lettering lower back |
| 01-inv | *(from stock)* | | 0 | 0 | 1 | 0 | 0 | 0 | |
| 02 | Youth | White | 1 | 1 | 1 | 0 | 0 | 0 | |

The `01-inv` sub-row records how many of each size come from existing blank shirt inventory. The quantity to order per size = total row minus inventory sub-row.

### Tab 3: Designs

One row per design placement, linked to a line item by number.

| Line Item # | Design # | Design File | Placement |
|---|---|---|---|
| 01 | 1 | bestie_bitches.png | Front |
| 01 | 2 | brand_name_text | Back |
| 02 | 1 | green_neon_cat.png | Front |

"Back text" designs (brand name) are stored as a reference to the brand name setting, not a filename.

---

## Order States

Orders progress through these states, all manually advanced by the user:

`building` → `sent` → `pending` → `paid` → `fulfilled` → `received`

- **building** — order is being assembled in the app
- **sent** — email draft was generated and sent to Spew
- **pending** — Spew has received the order and is working on it
- **paid** — payment has been made
- **fulfilled** — Spew has completed printing
- **received** — merchandise has been received by RMC

State is stored in Tab 1 of the order Sheet and displayed as a colored badge throughout the UI.

---

## UI Structure

### Landing Screen
Shows saved account or OAuth prompt (see Authentication section above).

### Orders List (Home Screen)
- Lists all orders found in the Top Level Order Folder in Drive
- Each order shows: order ID, creation date, state badge (color-coded)
- "New Order" button immediately creates the Drive subfolder and Google Sheet (so the order exists in Drive from the moment it's created), then opens the Order Builder
- Clicking an existing order opens it in the Order Builder

### Order Builder

**Top bar:**
- Order ID (read-only)
- State badge — click to advance to the next state (with confirmation for `sent`, since that implies the draft has been sent)
- "Generate Email Draft" button — always available; primary use is while in `building` state to create the initial draft, but can be used at any state to regenerate

**Design Browser (sidebar or panel):**
- Grid of design images loaded from `designs-cache/`
- "Refresh Designs" button — re-syncs from Drive Source of Truth
- Click a design to add it to a line item, or drag to an existing line item

**Line Item Cards:**
Each card represents one apparel item. Controls are buttons, not dropdowns.

- **Apparel category buttons:** Youth, Women's Round Neck, Women's V-Neck, Men's T-Shirt, Tote, etc.
- **Color buttons:** Text-labeled buttons in Phase 1 (visual color swatches added in Phase 2)
- **Size buttons:** XS / S / M / L / XL / XXL — tap to increment total quantity; secondary tap/control to set inventory quantity for that size. Sizes with inventory show a small indicator.
- **Designs list:** Each added design shows thumbnail, filename, and a Front / Back toggle. "Add Design" button opens the design browser in selection mode.
- **Notes field:** Free text area for layout instructions and any other specifics.
- **Remove line item** button (with confirmation).

Every change to a line item auto-saves to the order's Google Sheet (with local cache fallback if offline).

### Settings Screen (gear icon)
- **Brand name** — default back-print text (e.g., "Rocky Meowtain Co.") — pre-loaded, editable
- **Spew email address** — recipient for generated drafts
- **Google account** — displays connected account, option to re-authenticate

---

## Email Generation

Triggered by the "Generate Email Draft" button. A confirmation dialog appears: "Create Gmail draft for this order?" with Cancel and Confirm buttons.

On confirm, the backend:
1. Reads the complete order from the Google Sheet
2. Groups line items by apparel category (matching the hand-rolled order format)
3. Builds an HTML email body
4. Creates a Gmail draft via the Gmail API addressed to Spew's email

**Subject:** `RMC-001-2026-06-28 — Order Request`

**Body structure:**
- One section per apparel category
- Each section has a table of line items: design numbers, apparel type, color, per-size breakdown (total / from stock / to order), print placements, notes
- Zero-quantity sizes are omitted
- "From stock" quantities are visually distinguished (italic or noted inline)
- Footer includes a direct link to the order's Drive subfolder so Spew can access design files

**On failure:** Error dialog with Retry option and a "Copy to clipboard" fallback that copies the plain-text version of the order body.

**Brand name back-print:** Sourced from the Settings value at draft generation time.

---

## Offline Behavior

| Scenario | Behavior |
|---|---|
| Sheet write fails | Change queued locally; "⚠️ Offline — changes saving locally" banner shown |
| Connection restores | Queue flushes to Sheet; "✓ Synced" banner shown briefly |
| App load with Drive unreachable | Order loaded from local JSON cache; offline banner shown immediately |
| Design refresh fails | Toast: "Couldn't reach Drive — showing cached designs"; cached images still display |
| Gmail draft creation fails | Error dialog with Retry and Copy to Clipboard fallback |

**Known limitation (Phase 1):** No real-time conflict resolution. If two users edit the same order simultaneously, last write wins. Only one person should actively build an order at a time.

---

## Out of Scope (Phase 1)

The following are deferred to Phase 2 and Phase 3:

- Supplier catalog and pricing
- Visual color swatches (shirt color buttons are text-only in Phase 1)
- SVG shirt preview with dynamic color fill
- Blank shirt inventory tracking (Phase 3)
- Physical inventory spreadsheet updates from orders (Phase 3)

---

## Drive Folder IDs (Configuration)

Pulled from `drive_links.txt` and hardcoded in backend config at setup:

| Name | Drive ID |
|---|---|
| Top Level Operating Folder | `1OYG9ThPfJI0x13080vqW6sIY3c9Us4wk` |
| Design Source of Truth | `1CVhEtQZ5hgEB0vM83Y9WfjIo55-ouQ66` |
| Top Level Order Folder | `1voehD5oSz0zjy0k_8Q-RoQ76Imq62dLV` |
| Active Physical Inventory Sheet | `16_es4t4yNLP4D1r1E1Yqju5EN4gBheUHzQTTmc3SK_c` |
| Active Blank Inventory Sheet | `1a_vMRuJPn19Y7E1z-hfV17Z-gD_63PNKAn0Rwx2tkSk` |
