# SpewOrderApp Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a locally-hosted React + Node app for Rocky Meowtain Company to create, manage, and email apparel print orders to Spew, backed by Google Drive and Google Sheets.

**Architecture:** Express backend (port 3001) owns all Google API calls, OAuth tokens, local filesystem caches, and offline queue. React/Vite frontend (port 5175) calls backend via `/api/*` Vite proxy. Google Sheet per order is the source of truth; local JSON cache and design image cache provide offline resilience.

**Tech Stack:** React 18, Vite, React Router v6, Express 4, googleapis npm package, Jest + Supertest (backend tests), Vitest + React Testing Library (frontend tests), nodemon (backend dev)

## Global Constraints

- Backend port: 3001; frontend port: 5175
- Order ID format: `RMC-[NNN]-[YYYY-MM-DD]` (3-digit zero-padded sequential + ISO date)
- Design file prefix in order folder: `[NN]-[original-filename]` (2-digit zero-padded, e.g. `01-bestie_bitches.png`)
- Drive folder IDs hardcoded in `server/config.js` (values from spec)
- All Google API calls go through the backend — frontend never calls Google directly
- Order Sheet is source of truth; `orders-cache/*.json` is read-only fallback
- Line item controls are buttons, never dropdowns
- `designs-cache/`, `orders-cache/`, `server/tokens.json` are gitignored
- Frontend API calls use path prefix `/api` (proxied by Vite to `http://localhost:3001`)
- Design images served directly from `http://localhost:3001/designs-cache/` (cross-origin `<img>` is fine)

---

## File Structure

```
SpewOrderApp/
  server/
    package.json
    index.js                        # Express app entry, mounts all routers
    config.js                       # Drive IDs, ports, paths
    settings.json                   # Brand name, Spew email (gitignored initially)
    tokens.json                     # OAuth refresh token + email (gitignored)
    auth/
      oauth.js                      # OAuth2 client, token load/save
      router.js                     # GET /auth/url, GET /auth/callback, GET /auth/status, POST /auth/logout
    drive/
      client.js                     # Drive API: list files, create folder, copy file, download file
      designsCache.js               # Sync Source of Truth → designs-cache/ on disk
      router.js                     # POST /drive/designs/refresh, GET /drive/designs
    sheets/
      client.js                     # Sheets API: read/write ranges
      orderSheet.js                 # Build/parse 3-tab order sheet structure
      router.js                     # GET /sheets/order/:orderId, PUT /sheets/order/:orderId
    gmail/
      client.js                     # Gmail API: create draft
      emailBuilder.js               # Build HTML email body from order data
      router.js                     # POST /gmail/draft
    orders/
      idGenerator.js                # Scan order folder, generate next RMC-NNN-YYYY-MM-DD
      cache.js                      # Read/write orders-cache/*.json
      router.js                     # GET /orders, POST /orders, GET /orders/:id, PUT /orders/:id/state
    middleware/
      requireAuth.js                # 401 if no valid token
    __tests__/
      idGenerator.test.js
      orderSheet.test.js
      emailBuilder.test.js
      cache.test.js
      auth.test.js
      drive.test.js
      orders.test.js

  src/
    App.jsx                         # React Router setup, auth guard
    api/
      client.js                     # fetch wrapper for /api/*
      auth.js                       # getStatus, getAuthUrl, logout
      orders.js                     # listOrders, createOrder, getOrder, updateOrderState
      designs.js                    # listDesigns, refreshDesigns
      settings.js                   # getSettings, saveSettings
      gmail.js                      # createDraft
    hooks/
      useOrder.js                   # Load order (Sheet → cache fallback), auto-save, offline queue
      useDesigns.js                 # Design list state + refresh
      useOfflineQueue.js            # Queue changes, flush on reconnect, offline detection
    components/
      LandingScreen.jsx             # Continue as / Use different account
      OrdersList.jsx                # Home: list orders with state badges
      OrderBuilder.jsx              # Main order view (composes all sub-components)
      OrderTopBar.jsx               # Order ID, state badge, Generate Draft button
      DesignBrowser.jsx             # Image grid, Refresh button, selection mode
      LineItemCard.jsx              # Single line item: apparel, color, sizes, designs, notes
      SizeButtons.jsx               # XS/S/M/L/XL/XXL with total + inventory counts
      DesignsList.jsx               # Designs within a line item, Add Design button
      SettingsScreen.jsx            # Brand name, Spew email, account info
      StateBadge.jsx                # Color-coded order state pill
      ConfirmDialog.jsx             # Reusable modal with Cancel + Confirm
      Toast.jsx                     # Auto-dismissing notification
      OfflineBanner.jsx             # Offline / Syncing / Synced status bar
    __tests__/
      LandingScreen.test.jsx
      OrdersList.test.jsx
      LineItemCard.test.jsx
      SizeButtons.test.jsx
      OrderBuilder.test.jsx

  designs-cache/                    # gitignored — populated at runtime
  orders-cache/                     # gitignored — populated at runtime
  start.bat                         # Launch shortcut
  vite.config.js                    # Modified: add /api proxy to port 3001
  .gitignore                        # Modified: add server dirs
```

---

## Task 1: Backend scaffolding

**Files:**
- Create: `server/package.json`
- Create: `server/index.js`
- Create: `server/config.js`
- Create: `server/__tests__/health.test.js`

**Interfaces:**
- Produces: `GET /health → { ok: true }`, Express `app` exported from `index.js`, `config` object exported from `config.js`

- [ ] **Step 1: Create server package.json**

```json
{
  "name": "speworderapp-server",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js",
    "test": "jest --runInBand"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "googleapis": "^140.0.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "nodemon": "^3.1.0",
    "supertest": "^7.0.0"
  }
}
```

- [ ] **Step 2: Install server dependencies**

```bash
cd server && npm install
```

- [ ] **Step 3: Create server/config.js**

```js
require('dotenv').config();
const path = require('path');

module.exports = {
  PORT: 3001,
  DESIGNS_CACHE_DIR: path.join(__dirname, '..', 'designs-cache'),
  ORDERS_CACHE_DIR: path.join(__dirname, '..', 'orders-cache'),
  TOKENS_FILE: path.join(__dirname, 'tokens.json'),
  SETTINGS_FILE: path.join(__dirname, 'settings.json'),
  DRIVE: {
    TOP_LEVEL_FOLDER: '1OYG9ThPfJI0x13080vqW6sIY3c9Us4wk',
    DESIGN_SOURCE: '1CVhEtQZ5hgEB0vM83Y9WfjIo55-ouQ66',
    ORDER_FOLDER: '1voehD5oSz0zjy0k_8Q-RoQ76Imq62dLV',
  },
  GOOGLE: {
    CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI: 'http://localhost:3001/auth/callback',
  },
};
```

- [ ] **Step 4: Create server/index.js**

```js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const config = require('./config');

const app = express();
app.use(cors({ origin: 'http://localhost:5175' }));
app.use(express.json());

// Serve design image cache as static files
fs.mkdirSync(config.DESIGNS_CACHE_DIR, { recursive: true });
fs.mkdirSync(config.ORDERS_CACHE_DIR, { recursive: true });
app.use('/designs-cache', express.static(config.DESIGNS_CACHE_DIR));

app.get('/health', (_req, res) => res.json({ ok: true }));

// Routers mounted in later tasks
// app.use('/auth', require('./auth/router'));
// app.use('/drive', require('./drive/router'));
// app.use('/sheets', require('./sheets/router'));
// app.use('/orders', require('./orders/router'));
// app.use('/gmail', require('./gmail/router'));
// app.use('/settings', require('./settings/router'));

if (require.main === module) {
  app.listen(config.PORT, () => {
    console.log(`Server running on port ${config.PORT}`);
  });
}

module.exports = app;
```

- [ ] **Step 5: Write failing health test**

```js
// server/__tests__/health.test.js
const request = require('supertest');
const app = require('../index');

test('GET /health returns ok', async () => {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true });
});
```

- [ ] **Step 6: Run test — expect PASS**

```bash
cd server && npm test -- --testPathPattern=health
```

Expected: PASS

- [ ] **Step 7: Update root .gitignore**

Add to `.gitignore` at project root:
```
designs-cache/
orders-cache/
server/tokens.json
server/settings.json
server/.env
server/node_modules/
```

- [ ] **Step 8: Update vite.config.js to proxy /api to backend**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
```

- [ ] **Step 9: Commit**

```bash
git add server/ vite.config.js .gitignore
git commit -m "feat: add Express backend scaffold with health endpoint"
```

---

## Task 2: Google OAuth — backend

**Files:**
- Create: `server/auth/oauth.js`
- Create: `server/auth/router.js`
- Create: `server/middleware/requireAuth.js`
- Create: `server/__tests__/auth.test.js`
- Create: `server/.env.example`

**Interfaces:**
- Consumes: `config.GOOGLE`, `config.TOKENS_FILE`
- Produces:
  - `getOAuth2Client()` → configured `OAuth2Client` (with credentials if token saved)
  - `GET /auth/url` → `{ url: string }`
  - `GET /auth/callback?code=` → redirects to `http://localhost:5175`
  - `GET /auth/status` → `{ authenticated: bool, email: string|null }`
  - `POST /auth/logout` → `{ ok: true }`
  - `requireAuth` middleware → passes or sends 401

- [ ] **Step 1: Create server/.env.example**

```
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
```

Copy this to `server/.env` and fill in real values from Google Cloud Console.

- [ ] **Step 2: Create server/auth/oauth.js**

```js
const { google } = require('googleapis');
const fs = require('fs');
const config = require('../config');

function createOAuth2Client() {
  return new google.auth.OAuth2(
    config.GOOGLE.CLIENT_ID,
    config.GOOGLE.CLIENT_SECRET,
    config.GOOGLE.REDIRECT_URI
  );
}

function loadTokens() {
  if (!fs.existsSync(config.TOKENS_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(config.TOKENS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveTokens(tokens) {
  fs.writeFileSync(config.TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

function clearTokens() {
  if (fs.existsSync(config.TOKENS_FILE)) fs.unlinkSync(config.TOKENS_FILE);
}

function getOAuth2Client() {
  const client = createOAuth2Client();
  const tokens = loadTokens();
  if (tokens) client.setCredentials(tokens);
  return client;
}

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/userinfo.email',
];

module.exports = { createOAuth2Client, getOAuth2Client, loadTokens, saveTokens, clearTokens, SCOPES };
```

- [ ] **Step 3: Create server/auth/router.js**

```js
const express = require('express');
const { google } = require('googleapis');
const { createOAuth2Client, getOAuth2Client, saveTokens, clearTokens, SCOPES } = require('./oauth');

const router = express.Router();

router.get('/url', (_req, res) => {
  const client = createOAuth2Client();
  const url = client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
  res.json({ url });
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'Missing code' });
  try {
    const client = createOAuth2Client();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    // Get user email
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data } = await oauth2.userinfo.get();
    saveTokens({ ...tokens, email: data.email });
    res.redirect('http://localhost:5175');
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/status', (_req, res) => {
  const { loadTokens } = require('./oauth');
  const tokens = loadTokens();
  if (!tokens) return res.json({ authenticated: false, email: null });
  res.json({ authenticated: true, email: tokens.email || null });
});

router.post('/logout', (_req, res) => {
  clearTokens();
  res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Step 4: Create server/middleware/requireAuth.js**

```js
const { loadTokens } = require('../auth/oauth');

function requireAuth(req, res, next) {
  const tokens = loadTokens();
  if (!tokens || !tokens.refresh_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

module.exports = requireAuth;
```

- [ ] **Step 5: Mount auth router in server/index.js**

Uncomment this line in `server/index.js`:
```js
app.use('/auth', require('./auth/router'));
```

- [ ] **Step 6: Write auth tests**

```js
// server/__tests__/auth.test.js
const request = require('supertest');
const fs = require('fs');
const path = require('path');

jest.mock('../auth/oauth', () => ({
  createOAuth2Client: jest.fn(() => ({
    generateAuthUrl: jest.fn(() => 'https://accounts.google.com/mock'),
  })),
  loadTokens: jest.fn(),
  saveTokens: jest.fn(),
  clearTokens: jest.fn(),
  getOAuth2Client: jest.fn(),
  SCOPES: [],
}));

const app = require('../index');
const { loadTokens, clearTokens } = require('../auth/oauth');

test('GET /auth/url returns a url', async () => {
  const res = await request(app).get('/auth/url');
  expect(res.status).toBe(200);
  expect(res.body.url).toContain('google.com');
});

test('GET /auth/status returns unauthenticated when no tokens', async () => {
  loadTokens.mockReturnValue(null);
  const res = await request(app).get('/auth/status');
  expect(res.body).toEqual({ authenticated: false, email: null });
});

test('GET /auth/status returns authenticated with email when tokens exist', async () => {
  loadTokens.mockReturnValue({ refresh_token: 'tok', email: 'test@example.com' });
  const res = await request(app).get('/auth/status');
  expect(res.body).toEqual({ authenticated: true, email: 'test@example.com' });
});

test('POST /auth/logout calls clearTokens', async () => {
  const res = await request(app).post('/auth/logout');
  expect(res.body).toEqual({ ok: true });
  expect(clearTokens).toHaveBeenCalled();
});
```

- [ ] **Step 7: Run tests — expect PASS**

```bash
cd server && npm test -- --testPathPattern=auth
```

- [ ] **Step 8: Commit**

```bash
git add server/auth/ server/middleware/ server/__tests__/auth.test.js server/.env.example server/index.js
git commit -m "feat: add Google OAuth backend (auth routes, token storage, requireAuth middleware)"
```

---

## Task 3: Landing screen + frontend auth flow

**Files:**
- Modify: `src/App.jsx`
- Create: `src/api/client.js`
- Create: `src/api/auth.js`
- Create: `src/components/LandingScreen.jsx`
- Create: `src/__tests__/LandingScreen.test.jsx`

**Interfaces:**
- Consumes: `GET /api/auth/status`, `GET /api/auth/url`, `POST /api/auth/logout`
- Produces: `<LandingScreen>` rendered at `/`, redirects to `/orders` when authenticated

- [ ] **Step 1: Install frontend dependencies**

```bash
npm install react-router-dom
npm install --save-dev @testing-library/react @testing-library/jest-dom vitest jsdom
```

- [ ] **Step 2: Add vitest config to vite.config.js**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/__tests__/setup.js',
  },
})
```

- [ ] **Step 3: Create src/__tests__/setup.js**

```js
import '@testing-library/jest-dom';
```

- [ ] **Step 4: Add test script to root package.json**

Add to `scripts` in the root `package.json`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Create src/api/client.js**

```js
export async function apiFetch(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}
```

- [ ] **Step 6: Create src/api/auth.js**

```js
import { apiFetch } from './client';

export const getAuthStatus = () => apiFetch('/auth/status');
export const getAuthUrl = () => apiFetch('/auth/url').then(d => d.url);
export const logout = () => apiFetch('/auth/logout', { method: 'POST' });
```

- [ ] **Step 7: Create src/components/LandingScreen.jsx**

```jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthStatus, getAuthUrl, logout } from '../api/auth';

export default function LandingScreen() {
  const [status, setStatus] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    getAuthStatus().then(setStatus).catch(() => setStatus({ authenticated: false, email: null }));
  }, []);

  async function handleContinue() {
    navigate('/orders');
  }

  async function handleSwitchAccount() {
    await logout();
    const url = await getAuthUrl();
    window.location.href = url;
  }

  async function handleConnect() {
    const url = await getAuthUrl();
    window.location.href = url;
  }

  if (!status) return <div className="landing">Loading...</div>;

  return (
    <div className="landing">
      <h1>SpewOrderApp</h1>
      {status.authenticated ? (
        <>
          <button className="btn-primary" onClick={handleContinue}>
            Continue as {status.email}
          </button>
          <button className="btn-secondary" onClick={handleSwitchAccount}>
            Use a different account
          </button>
        </>
      ) : (
        <button className="btn-primary" onClick={handleConnect}>
          Connect your Google account
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Rewrite src/App.jsx**

```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingScreen from './components/LandingScreen';

// Placeholders — replaced in later tasks
function OrdersList() { return <div>Orders List</div>; }
function OrderBuilder() { return <div>Order Builder</div>; }
function SettingsScreen() { return <div>Settings</div>; }

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingScreen />} />
        <Route path="/orders" element={<OrdersList />} />
        <Route path="/orders/:orderId" element={<OrderBuilder />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 9: Write LandingScreen tests**

```jsx
// src/__tests__/LandingScreen.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LandingScreen from '../components/LandingScreen';
import * as authApi from '../api/auth';

vi.mock('../api/auth');

function renderLanding() {
  return render(<MemoryRouter><LandingScreen /></MemoryRouter>);
}

test('shows Connect button when not authenticated', async () => {
  authApi.getAuthStatus.mockResolvedValue({ authenticated: false, email: null });
  renderLanding();
  await waitFor(() => expect(screen.getByText(/Connect your Google account/i)).toBeInTheDocument());
});

test('shows Continue as when authenticated', async () => {
  authApi.getAuthStatus.mockResolvedValue({ authenticated: true, email: 'max@test.com' });
  renderLanding();
  await waitFor(() => expect(screen.getByText(/Continue as max@test.com/i)).toBeInTheDocument());
});

test('shows Use a different account when authenticated', async () => {
  authApi.getAuthStatus.mockResolvedValue({ authenticated: true, email: 'max@test.com' });
  renderLanding();
  await waitFor(() => expect(screen.getByText(/Use a different account/i)).toBeInTheDocument());
});
```

- [ ] **Step 10: Install userEvent**

```bash
npm install --save-dev @testing-library/user-event
```

- [ ] **Step 11: Run frontend tests — expect PASS**

```bash
npm test
```

- [ ] **Step 12: Commit**

```bash
git add src/ vite.config.js package.json
git commit -m "feat: add landing screen with Google auth flow"
```

---

## Task 4: Design cache — backend

**Files:**
- Create: `server/drive/client.js`
- Create: `server/drive/designsCache.js`
- Create: `server/drive/router.js`
- Create: `server/__tests__/drive.test.js`
- Modify: `server/index.js`

**Interfaces:**
- Consumes: `getOAuth2Client()`, `config.DRIVE.DESIGN_SOURCE`, `config.DESIGNS_CACHE_DIR`
- Produces:
  - `listFiles(folderId)` → `[{ id, name, mimeType }]`
  - `downloadFile(fileId, destPath)` → writes file to disk
  - `syncDesignsCache()` → downloads all images from Source of Truth to `designs-cache/`
  - `POST /drive/designs/refresh` → triggers sync, returns `{ count: number }`
  - `GET /drive/designs` → `[{ name, url }]` list from cache dir

- [ ] **Step 1: Create server/drive/client.js**

```js
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { getOAuth2Client } = require('../auth/oauth');

function getDrive() {
  return google.drive({ version: 'v3', auth: getOAuth2Client() });
}

async function listFiles(folderId, mimeTypeFilter = null) {
  const drive = getDrive();
  let q = `'${folderId}' in parents and trashed = false`;
  if (mimeTypeFilter) q += ` and mimeType = '${mimeTypeFilter}'`;
  const res = await drive.files.list({ q, fields: 'files(id, name, mimeType)', pageSize: 200 });
  return res.data.files || [];
}

async function downloadFile(fileId, destPath) {
  const drive = getDrive();
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
  await new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(destPath);
    res.data.pipe(dest);
    dest.on('finish', resolve);
    dest.on('error', reject);
  });
}

async function createFolder(name, parentId) {
  const drive = getDrive();
  const res = await drive.files.create({
    resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
  });
  return res.data.id;
}

async function createSpreadsheet(name, parentId) {
  const drive = getDrive();
  const res = await drive.files.create({
    resource: { name, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [parentId] },
    fields: 'id',
  });
  return res.data.id;
}

async function copyFile(fileId, name, parentId) {
  const drive = getDrive();
  const res = await drive.files.copy({
    fileId,
    resource: { name, parents: [parentId] },
    fields: 'id, name',
  });
  return res.data;
}

async function getFileMetadata(fileId) {
  const drive = getDrive();
  const res = await drive.files.get({ fileId, fields: 'id, name, mimeType, parents, webViewLink' });
  return res.data;
}

module.exports = { listFiles, downloadFile, createFolder, createSpreadsheet, copyFile, getFileMetadata };
```

- [ ] **Step 2: Create server/drive/designsCache.js**

```js
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { listFiles, downloadFile } = require('./client');

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];

async function syncDesignsCache() {
  fs.mkdirSync(config.DESIGNS_CACHE_DIR, { recursive: true });
  const files = await listFiles(config.DRIVE.DESIGN_SOURCE);
  const images = files.filter(f => IMAGE_TYPES.includes(f.mimeType));

  for (const file of images) {
    const destPath = path.join(config.DESIGNS_CACHE_DIR, file.name);
    await downloadFile(file.id, destPath);
  }

  return images.length;
}

function listCachedDesigns() {
  if (!fs.existsSync(config.DESIGNS_CACHE_DIR)) return [];
  return fs.readdirSync(config.DESIGNS_CACHE_DIR)
    .filter(name => /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(name))
    .map(name => ({ name, url: `http://localhost:${3001}/designs-cache/${name}` }));
}

module.exports = { syncDesignsCache, listCachedDesigns };
```

- [ ] **Step 3: Create server/drive/router.js**

```js
const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { syncDesignsCache, listCachedDesigns } = require('./designsCache');

const router = express.Router();
router.use(requireAuth);

router.post('/designs/refresh', async (_req, res) => {
  try {
    const count = await syncDesignsCache();
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/designs', (_req, res) => {
  res.json(listCachedDesigns());
});

module.exports = router;
```

- [ ] **Step 4: Mount drive router in server/index.js**

Uncomment:
```js
app.use('/drive', require('./drive/router'));
```

Also add sync on startup after the `app.use('/designs-cache', ...)` line:
```js
// Sync designs on startup (non-blocking, errors logged only)
const { syncDesignsCache } = require('./drive/designsCache');
syncDesignsCache().catch(err => console.warn('Design sync skipped:', err.message));
```

- [ ] **Step 5: Write drive tests**

```js
// server/__tests__/drive.test.js
const { listCachedDesigns } = require('../drive/designsCache');
const fs = require('fs');
const path = require('path');
const config = require('../config');

beforeEach(() => {
  fs.mkdirSync(config.DESIGNS_CACHE_DIR, { recursive: true });
});

afterEach(() => {
  // Clean up test cache files
  if (fs.existsSync(config.DESIGNS_CACHE_DIR)) {
    fs.readdirSync(config.DESIGNS_CACHE_DIR).forEach(f =>
      fs.unlinkSync(path.join(config.DESIGNS_CACHE_DIR, f))
    );
  }
});

test('listCachedDesigns returns empty array when cache dir is empty', () => {
  expect(listCachedDesigns()).toEqual([]);
});

test('listCachedDesigns returns image files with url', () => {
  fs.writeFileSync(path.join(config.DESIGNS_CACHE_DIR, 'test.png'), 'fake');
  fs.writeFileSync(path.join(config.DESIGNS_CACHE_DIR, 'other.txt'), 'fake');
  const designs = listCachedDesigns();
  expect(designs).toHaveLength(1);
  expect(designs[0].name).toBe('test.png');
  expect(designs[0].url).toContain('test.png');
});
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
cd server && npm test -- --testPathPattern=drive
```

- [ ] **Step 7: Commit**

```bash
git add server/drive/ server/__tests__/drive.test.js server/index.js
git commit -m "feat: add design cache sync from Google Drive"
```

---

## Task 5: Design browser — frontend

**Files:**
- Create: `src/api/designs.js`
- Create: `src/hooks/useDesigns.js`
- Create: `src/components/DesignBrowser.jsx`
- Create: `src/components/Toast.jsx`

**Interfaces:**
- Consumes: `GET /api/drive/designs`, `POST /api/drive/designs/refresh`
- Produces: `<DesignBrowser onSelect={fn} selectionMode={bool} />` — grid of design thumbnails with Refresh button; calls `onSelect(designName)` when a design is clicked in selection mode

- [ ] **Step 1: Create src/api/designs.js**

```js
import { apiFetch } from './client';

export const listDesigns = () => apiFetch('/drive/designs');
export const refreshDesigns = () => apiFetch('/drive/designs/refresh', { method: 'POST' });
```

- [ ] **Step 2: Create src/components/Toast.jsx**

```jsx
import { useEffect } from 'react';

export default function Toast({ message, onDismiss, durationMs = 3000 }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [message, onDismiss, durationMs]);

  if (!message) return null;
  return <div className="toast">{message}</div>;
}
```

- [ ] **Step 3: Create src/hooks/useDesigns.js**

```js
import { useState, useEffect, useCallback } from 'react';
import { listDesigns, refreshDesigns } from '../api/designs';

export function useDesigns() {
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    listDesigns().then(setDesigns).catch(() => setToast("Couldn't reach Drive — showing cached designs"));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await refreshDesigns();
      const updated = await listDesigns();
      setDesigns(updated);
    } catch {
      setToast("Couldn't reach Drive — showing cached designs");
    } finally {
      setLoading(false);
    }
  }, []);

  return { designs, loading, toast, clearToast: () => setToast(null), refresh };
}
```

- [ ] **Step 4: Create src/components/DesignBrowser.jsx**

```jsx
import { useDesigns } from '../hooks/useDesigns';
import Toast from './Toast';

export default function DesignBrowser({ onSelect, selectionMode = false }) {
  const { designs, loading, toast, clearToast, refresh } = useDesigns();

  return (
    <div className="design-browser">
      <div className="design-browser-header">
        <span>Designs</span>
        <button onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh Designs'}
        </button>
      </div>
      <div className="design-grid">
        {designs.map(d => (
          <div
            key={d.name}
            className={`design-thumb ${selectionMode ? 'selectable' : ''}`}
            onClick={() => selectionMode && onSelect && onSelect(d.name)}
          >
            <img src={d.url} alt={d.name} />
            <span>{d.name}</span>
          </div>
        ))}
      </div>
      <Toast message={toast} onDismiss={clearToast} />
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/api/designs.js src/hooks/useDesigns.js src/components/DesignBrowser.jsx src/components/Toast.jsx
git commit -m "feat: add design browser with local cache and refresh"
```

---

## Task 6: Order ID generation + Drive order creation

**Files:**
- Create: `server/orders/idGenerator.js`
- Create: `server/orders/cache.js`
- Create: `server/orders/router.js`
- Create: `server/__tests__/idGenerator.test.js`
- Create: `server/__tests__/cache.test.js`
- Modify: `server/index.js`

**Interfaces:**
- Consumes: `listFiles(folderId)`, `createFolder()`, `createSpreadsheet()`, `config.DRIVE.ORDER_FOLDER`
- Produces:
  - `generateOrderId(existingFolderNames)` → `'RMC-001-2026-06-28'`
  - `POST /orders` → `{ orderId, sheetId, folderId }` (creates Drive folder + Designs subfolder + Sheet)
  - `GET /orders` → `[{ orderId, state, created }]`
  - `cache.writeOrderCache(orderId, data)`, `cache.readOrderCache(orderId)`

- [ ] **Step 1: Create server/orders/idGenerator.js**

```js
function generateOrderId(existingFolderNames) {
  const today = new Date().toISOString().slice(0, 10);
  let maxSeq = 0;
  for (const name of existingFolderNames) {
    const match = name.match(/^RMC-(\d{3})-/);
    if (match) {
      const seq = parseInt(match[1], 10);
      if (seq > maxSeq) maxSeq = seq;
    }
  }
  const next = String(maxSeq + 1).padStart(3, '0');
  return `RMC-${next}-${today}`;
}

module.exports = { generateOrderId };
```

- [ ] **Step 2: Write idGenerator tests**

```js
// server/__tests__/idGenerator.test.js
const { generateOrderId } = require('../orders/idGenerator');

// Fix date for deterministic tests
const FIXED_DATE = '2026-06-28';
beforeAll(() => {
  jest.spyOn(global, 'Date').mockImplementation(() => ({ toISOString: () => `${FIXED_DATE}T00:00:00.000Z` }));
});
afterAll(() => jest.restoreAllMocks());

test('generates RMC-001 when no existing orders', () => {
  expect(generateOrderId([])).toBe('RMC-001-2026-06-28');
});

test('increments from highest existing order', () => {
  expect(generateOrderId(['RMC-001-2026-06-01', 'RMC-003-2026-06-15', 'RMC-002-2026-06-10']))
    .toBe('RMC-004-2026-06-28');
});

test('ignores non-RMC folder names', () => {
  expect(generateOrderId(['SomeOtherFolder', 'RMC-002-2026-01-01'])).toBe('RMC-003-2026-06-28');
});
```

- [ ] **Step 3: Run idGenerator tests — expect PASS**

```bash
cd server && npm test -- --testPathPattern=idGenerator
```

- [ ] **Step 4: Create server/orders/cache.js**

```js
const fs = require('fs');
const path = require('path');
const config = require('../config');

function cacheFilePath(orderId) {
  return path.join(config.ORDERS_CACHE_DIR, `${orderId}.json`);
}

function writeOrderCache(orderId, data) {
  fs.mkdirSync(config.ORDERS_CACHE_DIR, { recursive: true });
  fs.writeFileSync(cacheFilePath(orderId), JSON.stringify(data, null, 2));
}

function readOrderCache(orderId) {
  const p = cacheFilePath(orderId);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function deleteOrderCache(orderId) {
  const p = cacheFilePath(orderId);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

module.exports = { writeOrderCache, readOrderCache, deleteOrderCache };
```

- [ ] **Step 5: Write cache tests**

```js
// server/__tests__/cache.test.js
const { writeOrderCache, readOrderCache, deleteOrderCache } = require('../orders/cache');

const TEST_ID = 'RMC-TEST-2026-06-28';
afterEach(() => deleteOrderCache(TEST_ID));

test('writeOrderCache then readOrderCache round-trips data', () => {
  const data = { orderId: TEST_ID, state: 'building', lineItems: [] };
  writeOrderCache(TEST_ID, data);
  expect(readOrderCache(TEST_ID)).toEqual(data);
});

test('readOrderCache returns null for missing order', () => {
  expect(readOrderCache('RMC-MISSING-2026-01-01')).toBeNull();
});
```

- [ ] **Step 6: Run cache tests — expect PASS**

```bash
cd server && npm test -- --testPathPattern=cache
```

- [ ] **Step 7: Create server/orders/router.js**

```js
const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { listFiles, createFolder, createSpreadsheet } = require('../drive/client');
const { generateOrderId } = require('./idGenerator');
const { writeOrderCache, readOrderCache } = require('./cache');
const config = require('../config');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  try {
    const folders = await listFiles(config.DRIVE.ORDER_FOLDER, 'application/vnd.google-apps.folder');
    const orders = folders.map(f => {
      const match = f.name.match(/^(RMC-\d{3}-\d{4}-\d{2}-\d{2})$/);
      return match ? { orderId: f.name, folderId: f.id } : null;
    }).filter(Boolean);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (_req, res) => {
  try {
    const folders = await listFiles(config.DRIVE.ORDER_FOLDER, 'application/vnd.google-apps.folder');
    const orderId = generateOrderId(folders.map(f => f.name));

    // Create order folder
    const folderId = await createFolder(orderId, config.DRIVE.ORDER_FOLDER);
    // Create Designs subfolder
    await createFolder('Designs', folderId);
    // Create order spreadsheet
    const sheetId = await createSpreadsheet(`${orderId} Order`, folderId);

    const orderData = {
      orderId,
      folderId,
      sheetId,
      state: 'building',
      created: new Date().toISOString().slice(0, 10),
      lastUpdated: new Date().toISOString().slice(0, 10),
      notes: '',
      lineItems: [],
    };
    writeOrderCache(orderId, orderData);

    res.json({ orderId, sheetId, folderId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

- [ ] **Step 8: Mount orders router in server/index.js**

Uncomment:
```js
app.use('/orders', require('./orders/router'));
```

- [ ] **Step 9: Commit**

```bash
git add server/orders/ server/__tests__/idGenerator.test.js server/__tests__/cache.test.js server/index.js
git commit -m "feat: order ID generation and Drive folder/sheet creation"
```

---

## Task 7: Google Sheets order — backend

**Files:**
- Create: `server/sheets/client.js`
- Create: `server/sheets/orderSheet.js`
- Create: `server/sheets/router.js`
- Create: `server/__tests__/orderSheet.test.js`
- Modify: `server/index.js`

**Interfaces:**
- Consumes: `getOAuth2Client()`, sheetId from order creation
- Produces:
  - `initOrderSheet(sheetId, orderData)` → writes 3 tabs with headers + initial data
  - `readOrderFromSheet(sheetId)` → `{ orderId, state, created, notes, lineItems, designs }`
  - `writeOrderToSheet(sheetId, orderData)` → full overwrite of all tabs
  - `GET /sheets/order/:sheetId` → order data object
  - `PUT /sheets/order/:sheetId` → accepts order data, writes to sheet, returns `{ ok: true }`

- [ ] **Step 1: Create server/sheets/client.js**

```js
const { google } = require('googleapis');
const { getOAuth2Client } = require('../auth/oauth');

function getSheets() {
  return google.sheets({ version: 'v4', auth: getOAuth2Client() });
}

async function readRange(spreadsheetId, range) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return res.data.values || [];
}

async function writeRange(spreadsheetId, range, values) {
  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    resource: { values },
  });
}

async function clearRange(spreadsheetId, range) {
  const sheets = getSheets();
  await sheets.spreadsheets.values.clear({ spreadsheetId, range });
}

async function addSheet(spreadsheetId, title) {
  const sheets = getSheets();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: { requests: [{ addSheet: { properties: { title } } }] },
  });
}

async function getSheetNames(spreadsheetId) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  return res.data.sheets.map(s => s.properties.title);
}

module.exports = { readRange, writeRange, clearRange, addSheet, getSheetNames };
```

- [ ] **Step 2: Create server/sheets/orderSheet.js**

```js
const { readRange, writeRange, clearRange, addSheet, getSheetNames } = require('./client');

const SIZE_COLS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

async function initOrderSheet(sheetId, orderData) {
  // Google creates one default sheet named "Sheet1" — rename it to "Order Info"
  // and add two more tabs
  const existingNames = await getSheetNames(sheetId);
  if (!existingNames.includes('Line Items')) await addSheet(sheetId, 'Line Items');
  if (!existingNames.includes('Designs')) await addSheet(sheetId, 'Designs');

  await writeOrderToSheet(sheetId, orderData);
}

async function writeOrderToSheet(sheetId, orderData) {
  // Tab 1: Order Info
  await clearRange(sheetId, 'Sheet1!A1:B10');
  await writeRange(sheetId, 'Sheet1!A1:B6', [
    ['Order ID', orderData.orderId],
    ['State', orderData.state],
    ['Created', orderData.created],
    ['Last Updated', new Date().toISOString().slice(0, 10)],
    ['Notes', orderData.notes || ''],
    ['Sheet ID', orderData.sheetId || ''],
  ]);

  // Tab 2: Line Items
  await clearRange(sheetId, 'Line Items!A1:Z1000');
  const liHeader = ['#', 'Apparel Type', 'Color', ...SIZE_COLS, 'Notes'];
  const liRows = [liHeader];
  for (const item of orderData.lineItems || []) {
    const sizes = SIZE_COLS.map(s => item.sizes?.[s]?.total ?? 0);
    const invSizes = SIZE_COLS.map(s => item.sizes?.[s]?.inventory ?? 0);
    liRows.push([item.num, item.apparelType || '', item.color || '', ...sizes, item.notes || '']);
    if (invSizes.some(v => v > 0)) {
      liRows.push([`${item.num}-inv`, '(from stock)', '', ...invSizes, '']);
    }
  }
  await writeRange(sheetId, 'Line Items!A1', liRows);

  // Tab 3: Designs
  await clearRange(sheetId, 'Designs!A1:Z1000');
  const dHeader = ['Line Item #', 'Design #', 'Design File', 'Placement'];
  const dRows = [dHeader];
  for (const item of orderData.lineItems || []) {
    for (const d of item.designs || []) {
      dRows.push([item.num, d.designNum, d.file, d.placement]);
    }
  }
  await writeRange(sheetId, 'Designs!A1', dRows);
}

async function readOrderFromSheet(sheetId) {
  // Tab 1
  const info = await readRange(sheetId, 'Sheet1!A1:B10');
  const infoMap = Object.fromEntries(info.map(([k, v]) => [k, v]));

  // Tab 2: Line Items
  const liRows = await readRange(sheetId, 'Line Items!A2:Z1000');
  const lineItemsMap = {};
  for (const row of liRows) {
    const [num, apparelType, color, ...rest] = row;
    if (!num) continue;
    if (num.endsWith('-inv')) {
      const baseNum = num.replace('-inv', '');
      if (lineItemsMap[baseNum]) {
        SIZE_COLS.forEach((s, i) => {
          lineItemsMap[baseNum].sizes[s] = lineItemsMap[baseNum].sizes[s] || { total: 0, inventory: 0 };
          lineItemsMap[baseNum].sizes[s].inventory = parseInt(rest[i], 10) || 0;
        });
      }
    } else {
      const sizes = {};
      SIZE_COLS.forEach((s, i) => { sizes[s] = { total: parseInt(rest[i], 10) || 0, inventory: 0 }; });
      const notes = rest[SIZE_COLS.length] || '';
      lineItemsMap[num] = { num, apparelType, color, sizes, notes, designs: [] };
    }
  }

  // Tab 3: Designs
  const dRows = await readRange(sheetId, 'Designs!A2:D1000');
  for (const [lineItemNum, designNum, file, placement] of dRows) {
    if (lineItemsMap[lineItemNum]) {
      lineItemsMap[lineItemNum].designs.push({ designNum, file, placement });
    }
  }

  return {
    orderId: infoMap['Order ID'] || '',
    state: infoMap['State'] || 'building',
    created: infoMap['Created'] || '',
    lastUpdated: infoMap['Last Updated'] || '',
    notes: infoMap['Notes'] || '',
    sheetId: infoMap['Sheet ID'] || sheetId,
    lineItems: Object.values(lineItemsMap),
  };
}

module.exports = { initOrderSheet, writeOrderToSheet, readOrderFromSheet };
```

- [ ] **Step 3: Write orderSheet tests**

```js
// server/__tests__/orderSheet.test.js
const { readOrderFromSheet, writeOrderToSheet } = require('../sheets/orderSheet');

jest.mock('../sheets/client', () => ({
  readRange: jest.fn(),
  writeRange: jest.fn(),
  clearRange: jest.fn(),
  addSheet: jest.fn(),
  getSheetNames: jest.fn(() => Promise.resolve(['Sheet1', 'Line Items', 'Designs'])),
}));

const { readRange, writeRange } = require('../sheets/client');

const SAMPLE_ORDER = {
  orderId: 'RMC-001-2026-06-28',
  state: 'building',
  created: '2026-06-28',
  notes: '',
  sheetId: 'sheet123',
  lineItems: [
    {
      num: '01',
      apparelType: "Women's Round Neck",
      color: 'Black',
      sizes: { XS: { total: 0, inventory: 0 }, S: { total: 0, inventory: 0 }, M: { total: 2, inventory: 1 }, L: { total: 1, inventory: 0 }, XL: { total: 0, inventory: 0 }, XXL: { total: 0, inventory: 0 } },
      notes: 'Curved lettering lower back',
      designs: [{ designNum: '1', file: 'bestie_bitches.png', placement: 'Front' }],
    },
  ],
};

test('writeOrderToSheet calls writeRange for all 3 tabs', async () => {
  await writeOrderToSheet('sheet123', SAMPLE_ORDER);
  const calls = writeRange.mock.calls.map(c => c[1]);
  expect(calls.some(r => r.includes('Sheet1'))).toBe(true);
  expect(calls.some(r => r.includes('Line Items'))).toBe(true);
  expect(calls.some(r => r.includes('Designs'))).toBe(true);
});

test('readOrderFromSheet parses info, line items, and designs', async () => {
  readRange.mockImplementation((_id, range) => {
    if (range.includes('Sheet1')) return Promise.resolve([
      ['Order ID', 'RMC-001-2026-06-28'],
      ['State', 'building'],
      ['Created', '2026-06-28'],
      ['Last Updated', '2026-06-28'],
      ['Notes', ''],
      ['Sheet ID', 'sheet123'],
    ]);
    if (range.includes('Line Items')) return Promise.resolve([
      ['01', "Women's Round Neck", 'Black', '0', '0', '2', '1', '0', '0', 'Curved lettering'],
      ['01-inv', '(from stock)', '', '0', '0', '1', '0', '0', '0', ''],
    ]);
    if (range.includes('Designs')) return Promise.resolve([
      ['01', '1', 'bestie_bitches.png', 'Front'],
    ]);
    return Promise.resolve([]);
  });

  const order = await readOrderFromSheet('sheet123');
  expect(order.orderId).toBe('RMC-001-2026-06-28');
  expect(order.lineItems).toHaveLength(1);
  expect(order.lineItems[0].sizes.M.total).toBe(2);
  expect(order.lineItems[0].sizes.M.inventory).toBe(1);
  expect(order.lineItems[0].designs[0].file).toBe('bestie_bitches.png');
});
```

- [ ] **Step 4: Run orderSheet tests — expect PASS**

```bash
cd server && npm test -- --testPathPattern=orderSheet
```

- [ ] **Step 5: Create server/sheets/router.js**

```js
const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { readOrderFromSheet, writeOrderToSheet } = require('./orderSheet');
const { writeOrderCache } = require('../orders/cache');

const router = express.Router();
router.use(requireAuth);

router.get('/order/:sheetId', async (req, res) => {
  try {
    const order = await readOrderFromSheet(req.params.sheetId);
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/order/:sheetId', async (req, res) => {
  try {
    const orderData = req.body;
    await writeOrderToSheet(req.params.sheetId, orderData);
    writeOrderCache(orderData.orderId, orderData);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

- [ ] **Step 6: Mount sheets router + update order creation to init sheet**

In `server/index.js`, uncomment:
```js
app.use('/sheets', require('./sheets/router'));
```

In `server/orders/router.js`, add after `createSpreadsheet`:
```js
const { initOrderSheet } = require('../sheets/orderSheet');
// ...after sheetId is created:
await initOrderSheet(sheetId, orderData);
```

- [ ] **Step 7: Commit**

```bash
git add server/sheets/ server/__tests__/orderSheet.test.js server/index.js server/orders/router.js
git commit -m "feat: Google Sheets order read/write with 3-tab structure"
```

---

## Task 8: Orders list — frontend

**Files:**
- Create: `src/api/orders.js`
- Create: `src/components/StateBadge.jsx`
- Create: `src/components/OrdersList.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `GET /api/orders`, `POST /api/orders`
- Produces: `<OrdersList />` renders list of orders, "New Order" navigates to `/orders/:orderId`

- [ ] **Step 1: Create src/api/orders.js**

```js
import { apiFetch } from './client';

export const listOrders = () => apiFetch('/orders');
export const createOrder = () => apiFetch('/orders', { method: 'POST' });
export const getOrderBySheet = (sheetId) => apiFetch(`/sheets/order/${sheetId}`);
export const saveOrderToSheet = (sheetId, data) =>
  apiFetch(`/sheets/order/${sheetId}`, { method: 'PUT', body: data });
export const updateOrderState = (sheetId, state, data) =>
  saveOrderToSheet(sheetId, { ...data, state });
```

- [ ] **Step 2: Create src/components/StateBadge.jsx**

```jsx
const STATE_COLORS = {
  building: '#6366f1',
  sent: '#f59e0b',
  pending: '#3b82f6',
  paid: '#10b981',
  fulfilled: '#8b5cf6',
  received: '#22c55e',
};

export default function StateBadge({ state }) {
  const color = STATE_COLORS[state] || '#6b7280';
  return (
    <span className="state-badge" style={{ backgroundColor: color }}>
      {state}
    </span>
  );
}
```

- [ ] **Step 3: Create src/components/OrdersList.jsx**

```jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listOrders, createOrder } from '../api/orders';
import StateBadge from './StateBadge';

export default function OrdersList() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    listOrders().then(setOrders).catch(console.error);
  }, []);

  async function handleNewOrder() {
    setLoading(true);
    try {
      const { orderId } = await createOrder();
      navigate(`/orders/${orderId}`);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="orders-list">
      <header>
        <h1>SpewOrderApp</h1>
        <div>
          <button onClick={() => navigate('/settings')}>⚙ Settings</button>
          <button className="btn-primary" onClick={handleNewOrder} disabled={loading}>
            {loading ? 'Creating...' : '+ New Order'}
          </button>
        </div>
      </header>
      <div className="order-cards">
        {orders.length === 0 && <p>No orders yet. Create one to get started.</p>}
        {orders.map(o => (
          <div key={o.orderId} className="order-card" onClick={() => navigate(`/orders/${o.orderId}`)}>
            <strong>{o.orderId}</strong>
            <StateBadge state={o.state || 'building'} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Replace placeholder in src/App.jsx**

Replace the line `function OrdersList() { return <div>Orders List</div>; }` with:
```js
import OrdersList from './components/OrdersList';
```

- [ ] **Step 5: Write OrdersList test**

```jsx
// src/__tests__/OrdersList.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OrdersList from '../components/OrdersList';
import * as ordersApi from '../api/orders';

vi.mock('../api/orders');

test('shows no orders message when list is empty', async () => {
  ordersApi.listOrders.mockResolvedValue([]);
  render(<MemoryRouter><OrdersList /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText(/No orders yet/i)).toBeInTheDocument());
});

test('renders order cards', async () => {
  ordersApi.listOrders.mockResolvedValue([
    { orderId: 'RMC-001-2026-06-28', state: 'building' },
  ]);
  render(<MemoryRouter><OrdersList /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('RMC-001-2026-06-28')).toBeInTheDocument());
});
```

- [ ] **Step 6: Run frontend tests — expect PASS**

```bash
npm test
```

- [ ] **Step 7: Commit**

```bash
git add src/api/orders.js src/components/StateBadge.jsx src/components/OrdersList.jsx src/App.jsx src/__tests__/OrdersList.test.jsx
git commit -m "feat: orders list with state badges and new order creation"
```

---

## Task 9: Order auto-save + offline queue

**Files:**
- Create: `src/hooks/useOfflineQueue.js`
- Create: `src/hooks/useOrder.js`
- Create: `src/components/OfflineBanner.jsx`

**Interfaces:**
- Consumes: `saveOrderToSheet(sheetId, data)`, `getOrderBySheet(sheetId)`, `readOrderCache` (via backend fallback — if Sheet fails, backend returns cached data)
- Produces:
  - `useOrder(orderId, sheetId)` → `{ order, setOrder, saving, offline, syncPending }`
    - Every call to `setOrder(data)` writes to Sheet; on failure queues locally and retries when online
  - `useOfflineQueue()` → `{ enqueue(fn), online }`
  - `<OfflineBanner offline={bool} syncing={bool} />`

- [ ] **Step 1: Add backend fallback to sheets router**

In `server/sheets/router.js`, modify `GET /order/:sheetId` to fall back to cache:
```js
const { readOrderCache } = require('../orders/cache');

router.get('/order/:sheetId', async (req, res) => {
  try {
    const order = await readOrderFromSheet(req.params.sheetId);
    res.json(order);
  } catch (err) {
    // Fall back to local cache — find by sheetId
    // The cache is keyed by orderId; we need to scan
    const fs = require('fs');
    const config = require('../config');
    const cacheFiles = fs.existsSync(config.ORDERS_CACHE_DIR)
      ? fs.readdirSync(config.ORDERS_CACHE_DIR) : [];
    for (const file of cacheFiles) {
      const data = require('../orders/cache').readOrderCache(file.replace('.json', ''));
      if (data && data.sheetId === req.params.sheetId) {
        return res.json({ ...data, _fromCache: true });
      }
    }
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Create src/hooks/useOfflineQueue.js**

```js
import { useState, useEffect, useRef, useCallback } from 'react';

export function useOfflineQueue() {
  const [online, setOnline] = useState(navigator.onLine);
  const queue = useRef([]);
  const flushing = useRef(false);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    if (online && queue.current.length > 0 && !flushing.current) {
      flushing.current = true;
      const items = [...queue.current];
      queue.current = [];
      Promise.all(items.map(fn => fn())).finally(() => { flushing.current = false; });
    }
  }, [online]);

  const enqueue = useCallback((fn) => {
    queue.current.push(fn);
  }, []);

  return { online, enqueue, queueLength: queue.current.length };
}
```

- [ ] **Step 3: Create src/hooks/useOrder.js**

```js
import { useState, useEffect, useCallback, useRef } from 'react';
import { getOrderBySheet, saveOrderToSheet } from '../api/orders';
import { useOfflineQueue } from './useOfflineQueue';

export function useOrder(sheetId) {
  const [order, setOrderState] = useState(null);
  const [saving, setSaving] = useState(false);
  const [syncPending, setSyncPending] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const { online, enqueue } = useOfflineQueue();

  useEffect(() => {
    if (!sheetId) return;
    getOrderBySheet(sheetId).then(data => {
      setOrderState(data);
      if (data._fromCache) setFromCache(true);
    }).catch(console.error);
  }, [sheetId]);

  const setOrder = useCallback((updater) => {
    setOrderState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;

      const save = () => {
        setSaving(true);
        return saveOrderToSheet(sheetId, next)
          .then(() => setSyncPending(false))
          .catch(() => {
            setSyncPending(true);
            enqueue(() => saveOrderToSheet(sheetId, next).then(() => setSyncPending(false)));
          })
          .finally(() => setSaving(false));
      };

      save();
      return next;
    });
  }, [sheetId, enqueue]);

  return { order, setOrder, saving, offline: !online, syncPending, fromCache };
}
```

- [ ] **Step 4: Create src/components/OfflineBanner.jsx**

```jsx
export default function OfflineBanner({ offline, syncPending }) {
  if (!offline && !syncPending) return null;
  return (
    <div className={`offline-banner ${syncPending && !offline ? 'syncing' : 'offline'}`}>
      {offline ? '⚠️ Offline — changes saving locally' : '↑ Syncing changes...'}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/ src/components/OfflineBanner.jsx server/sheets/router.js
git commit -m "feat: order auto-save with offline queue and cache fallback"
```

---

## Task 10: Line item card — apparel, color, sizes

**Files:**
- Create: `src/components/ConfirmDialog.jsx`
- Create: `src/components/SizeButtons.jsx`
- Create: `src/components/LineItemCard.jsx`
- Create: `src/__tests__/SizeButtons.test.jsx`
- Create: `src/__tests__/LineItemCard.test.jsx`

**Interfaces:**
- Consumes: line item object `{ num, apparelType, color, sizes, notes, designs }`
- Produces:
  - `<SizeButtons sizes={obj} onChange={fn} />` — buttons for XS/S/M/L/XL/XXL, each tap increments total; secondary shows inventory input
  - `<LineItemCard item={obj} onChange={fn} onRemove={fn} onAddDesign={fn} designBrowserOpen={bool} />` — full card with all controls

- [ ] **Step 1: Create src/components/ConfirmDialog.jsx**

```jsx
export default function ConfirmDialog({ message, onConfirm, onCancel }) {
  if (!message) return null;
  return (
    <div className="dialog-overlay">
      <div className="dialog">
        <p>{message}</p>
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={onConfirm}>Confirm</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create src/components/SizeButtons.jsx**

```jsx
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

export default function SizeButtons({ sizes = {}, onChange }) {
  function getVal(size, key) {
    return sizes[size]?.[key] ?? 0;
  }

  function updateSize(size, key, delta) {
    const current = getVal(size, key);
    const next = Math.max(0, current + delta);
    // Inventory can't exceed total
    const total = key === 'total' ? next : getVal(size, 'total');
    const inventory = key === 'inventory' ? Math.min(next, total) : getVal(size, 'inventory');
    onChange({ ...sizes, [size]: { total: key === 'total' ? next : total, inventory } });
  }

  return (
    <div className="size-buttons">
      {SIZES.map(size => {
        const total = getVal(size, 'total');
        const inv = getVal(size, 'inventory');
        return (
          <div key={size} className={`size-btn-group ${total > 0 ? 'active' : ''}`}>
            <button onClick={() => updateSize(size, 'total', 1)}>{size}: {total}</button>
            {total > 0 && (
              <>
                <button className="size-decrement" onClick={() => updateSize(size, 'total', -1)}>−</button>
                <div className="inv-row">
                  <span>inv:</span>
                  <button onClick={() => updateSize(size, 'inventory', -1)} disabled={inv === 0}>−</button>
                  <span>{inv}</span>
                  <button onClick={() => updateSize(size, 'inventory', 1)} disabled={inv >= total}>+</button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Write SizeButtons tests**

```jsx
// src/__tests__/SizeButtons.test.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SizeButtons from '../components/SizeButtons';

test('clicking size button increments total', async () => {
  const onChange = vi.fn();
  render(<SizeButtons sizes={{}} onChange={onChange} />);
  await userEvent.click(screen.getByText(/^M: 0/));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ M: { total: 1, inventory: 0 } }));
});

test('inventory cannot exceed total', async () => {
  const onChange = vi.fn();
  const sizes = { M: { total: 2, inventory: 2 } };
  render(<SizeButtons sizes={sizes} onChange={onChange} />);
  // The + inventory button should be disabled when inv === total
  const invPlusButtons = screen.getAllByText('+');
  // The M row's + button should be disabled
  expect(invPlusButtons[0]).toBeDisabled();
});
```

- [ ] **Step 4: Run SizeButtons tests — expect PASS**

```bash
npm test
```

- [ ] **Step 5: Create src/components/LineItemCard.jsx**

```jsx
import { useState } from 'react';
import SizeButtons from './SizeButtons';
import ConfirmDialog from './ConfirmDialog';

const APPAREL_TYPES = ["Youth", "Women's Round Neck", "Women's V-Neck", "Men's T-Shirt", "Tote"];
const COLORS = ['White', 'Black', 'Navy', 'Red', 'Forest Green', 'Royal Blue', 'Heather Grey'];

export default function LineItemCard({ item, onChange, onRemove, onAddDesign }) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  function update(field, value) {
    onChange({ ...item, [field]: value });
  }

  return (
    <div className="line-item-card">
      <div className="line-item-header">
        <span className="line-item-num">#{item.num}</span>
        <button className="btn-danger" onClick={() => setConfirmRemove(true)}>Remove</button>
      </div>

      <div className="field-group">
        <label>Apparel Type</label>
        <div className="btn-group">
          {APPAREL_TYPES.map(t => (
            <button
              key={t}
              className={item.apparelType === t ? 'active' : ''}
              onClick={() => update('apparelType', t)}
            >{t}</button>
          ))}
        </div>
      </div>

      <div className="field-group">
        <label>Color</label>
        <div className="btn-group">
          {COLORS.map(c => (
            <button
              key={c}
              className={item.color === c ? 'active' : ''}
              onClick={() => update('color', c)}
            >{c}</button>
          ))}
        </div>
      </div>

      <div className="field-group">
        <label>Sizes</label>
        <SizeButtons sizes={item.sizes} onChange={sizes => update('sizes', sizes)} />
      </div>

      <div className="field-group">
        <label>Designs</label>
        {(item.designs || []).map((d, i) => (
          <div key={i} className="design-row">
            <span>{d.designNum}. {d.file}</span>
            <button
              className={d.placement === 'Front' ? 'active' : ''}
              onClick={() => {
                const designs = [...item.designs];
                designs[i] = { ...d, placement: 'Front' };
                update('designs', designs);
              }}
            >Front</button>
            <button
              className={d.placement === 'Back' ? 'active' : ''}
              onClick={() => {
                const designs = [...item.designs];
                designs[i] = { ...d, placement: 'Back' };
                update('designs', designs);
              }}
            >Back</button>
            <button onClick={() => {
              const designs = item.designs.filter((_, idx) => idx !== i);
              update('designs', designs);
            }}>×</button>
          </div>
        ))}
        <button onClick={onAddDesign}>+ Add Design</button>
      </div>

      <div className="field-group">
        <label>Notes</label>
        <textarea
          value={item.notes || ''}
          onChange={e => update('notes', e.target.value)}
          placeholder="Layout instructions, special notes..."
        />
      </div>

      <ConfirmDialog
        message={confirmRemove ? 'Remove this line item?' : null}
        onConfirm={() => { setConfirmRemove(false); onRemove(); }}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}
```

- [ ] **Step 6: Write LineItemCard test**

```jsx
// src/__tests__/LineItemCard.test.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LineItemCard from '../components/LineItemCard';

const BASE_ITEM = { num: '01', apparelType: '', color: '', sizes: {}, notes: '', designs: [] };

test('calls onChange when apparel type selected', async () => {
  const onChange = vi.fn();
  render(<LineItemCard item={BASE_ITEM} onChange={onChange} onRemove={vi.fn()} onAddDesign={vi.fn()} />);
  await userEvent.click(screen.getByText('Youth'));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ apparelType: 'Youth' }));
});

test('shows confirm dialog before removing', async () => {
  render(<LineItemCard item={BASE_ITEM} onChange={vi.fn()} onRemove={vi.fn()} onAddDesign={vi.fn()} />);
  await userEvent.click(screen.getByText('Remove'));
  expect(screen.getByText('Remove this line item?')).toBeInTheDocument();
});
```

- [ ] **Step 7: Run tests — expect PASS**

```bash
npm test
```

- [ ] **Step 8: Commit**

```bash
git add src/components/ConfirmDialog.jsx src/components/SizeButtons.jsx src/components/LineItemCard.jsx src/__tests__/SizeButtons.test.jsx src/__tests__/LineItemCard.test.jsx
git commit -m "feat: line item card with apparel, color, size buttons and confirm dialog"
```

---

## Task 11: Order builder — top bar, state, full assembly

**Files:**
- Create: `src/components/OrderTopBar.jsx`
- Create: `src/components/OrderBuilder.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `useOrder(sheetId)`, `<LineItemCard>`, `<DesignBrowser>`, `<OfflineBanner>`, `<ConfirmDialog>`, `useParams()` from react-router-dom
- Produces: `<OrderBuilder />` — full working order builder page

The `orderId` comes from the URL param. The `sheetId` is stored in the order cache or must be looked up. To keep it simple: store `sheetId` in the URL as a query param when navigating from OrdersList (`/orders/RMC-001-2026-06-28?sheetId=abc123`).

- [ ] **Step 1: Update createOrder in src/api/orders.js to return sheetId**

The `POST /orders` backend already returns `{ orderId, sheetId, folderId }`. Update navigation in `OrdersList.jsx`:

```jsx
// In handleNewOrder, change navigate call to:
navigate(`/orders/${orderId}?sheetId=${sheetId}`);
```

- [ ] **Step 2: Create src/components/OrderTopBar.jsx**

```jsx
import { useState } from 'react';
import StateBadge from './StateBadge';
import ConfirmDialog from './ConfirmDialog';

const STATE_ORDER = ['building', 'sent', 'pending', 'paid', 'fulfilled', 'received'];

export default function OrderTopBar({ order, onAdvanceState, onGenerateDraft, saving }) {
  const [confirmState, setConfirmState] = useState(false);
  const [confirmDraft, setConfirmDraft] = useState(false);

  const nextState = STATE_ORDER[STATE_ORDER.indexOf(order?.state) + 1];

  return (
    <div className="order-top-bar">
      <h2>{order?.orderId}</h2>
      <StateBadge state={order?.state} />
      {nextState && (
        <button onClick={() => setConfirmState(true)}>
          Mark as {nextState}
        </button>
      )}
      <button className="btn-primary" onClick={() => setConfirmDraft(true)}>
        Generate Email Draft
      </button>
      {saving && <span className="saving-indicator">Saving...</span>}

      <ConfirmDialog
        message={confirmState ? `Mark order as "${nextState}"?` : null}
        onConfirm={() => { setConfirmState(false); onAdvanceState(nextState); }}
        onCancel={() => setConfirmState(false)}
      />
      <ConfirmDialog
        message={confirmDraft ? 'Create Gmail draft for this order?' : null}
        onConfirm={() => { setConfirmDraft(false); onGenerateDraft(); }}
        onCancel={() => setConfirmDraft(false)}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create src/components/OrderBuilder.jsx**

```jsx
import { useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useOrder } from '../hooks/useOrder';
import { createDraft } from '../api/gmail';
import OrderTopBar from './OrderTopBar';
import LineItemCard from './LineItemCard';
import DesignBrowser from './DesignBrowser';
import OfflineBanner from './OfflineBanner';
import Toast from './Toast';

function nextLineItemNum(lineItems) {
  const max = lineItems.reduce((m, li) => Math.max(m, parseInt(li.num, 10) || 0), 0);
  return String(max + 1).padStart(2, '0');
}

function nextDesignNum(designs) {
  const max = designs.reduce((m, d) => Math.max(m, parseInt(d.designNum, 10) || 0), 0);
  return String(max + 1);
}

export default function OrderBuilder() {
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const sheetId = searchParams.get('sheetId');
  const navigate = useNavigate();
  const { order, setOrder, saving, offline, syncPending } = useOrder(sheetId);
  const [selectingDesignFor, setSelectingDesignFor] = useState(null); // line item num
  const [toast, setToast] = useState(null);

  if (!order) return <div className="loading">Loading order...</div>;

  function addLineItem() {
    const num = nextLineItemNum(order.lineItems);
    setOrder(prev => ({
      ...prev,
      lineItems: [...prev.lineItems, { num, apparelType: '', color: '', sizes: {}, notes: '', designs: [] }],
    }));
  }

  function updateLineItem(num, updated) {
    setOrder(prev => ({
      ...prev,
      lineItems: prev.lineItems.map(li => li.num === num ? updated : li),
    }));
  }

  function removeLineItem(num) {
    setOrder(prev => ({
      ...prev,
      lineItems: prev.lineItems.filter(li => li.num !== num),
    }));
  }

  function handleDesignSelected(designName) {
    if (!selectingDesignFor) return;
    setOrder(prev => ({
      ...prev,
      lineItems: prev.lineItems.map(li => {
        if (li.num !== selectingDesignFor) return li;
        const designNum = nextDesignNum(li.designs);
        return { ...li, designs: [...li.designs, { designNum, file: designName, placement: 'Front' }] };
      }),
    }));
    setSelectingDesignFor(null);
  }

  async function handleGenerateDraft() {
    try {
      await createDraft(sheetId);
      setToast('Gmail draft created successfully!');
    } catch (err) {
      setToast(`Failed to create draft: ${err.message}`);
    }
  }

  function handleAdvanceState(nextState) {
    setOrder(prev => ({ ...prev, state: nextState }));
  }

  return (
    <div className="order-builder">
      <OfflineBanner offline={offline} syncPending={syncPending} />
      <button className="back-btn" onClick={() => navigate('/orders')}>← Orders</button>

      <OrderTopBar
        order={order}
        saving={saving}
        onAdvanceState={handleAdvanceState}
        onGenerateDraft={handleGenerateDraft}
      />

      <div className="builder-body">
        <div className="line-items">
          {order.lineItems.map(item => (
            <LineItemCard
              key={item.num}
              item={item}
              onChange={updated => updateLineItem(item.num, updated)}
              onRemove={() => removeLineItem(item.num)}
              onAddDesign={() => setSelectingDesignFor(item.num)}
            />
          ))}
          <button className="btn-secondary add-line-item" onClick={addLineItem}>
            + Add Line Item
          </button>
        </div>

        <DesignBrowser
          selectionMode={!!selectingDesignFor}
          onSelect={handleDesignSelected}
        />
      </div>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
```

- [ ] **Step 4: Update src/App.jsx to use real OrderBuilder**

Replace `function OrderBuilder() { return <div>Order Builder</div>; }` with:
```js
import OrderBuilder from './components/OrderBuilder';
```

- [ ] **Step 5: Write OrderBuilder test**

```jsx
// src/__tests__/OrderBuilder.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import OrderBuilder from '../components/OrderBuilder';
import * as ordersApi from '../api/orders';

vi.mock('../api/orders');
vi.mock('../api/gmail', () => ({ createDraft: vi.fn() }));
vi.mock('../api/designs', () => ({ listDesigns: vi.fn(() => Promise.resolve([])), refreshDesigns: vi.fn() }));

const MOCK_ORDER = {
  orderId: 'RMC-001-2026-06-28',
  state: 'building',
  created: '2026-06-28',
  notes: '',
  sheetId: 'sheet123',
  lineItems: [],
};

function renderBuilder() {
  ordersApi.getOrderBySheet.mockResolvedValue(MOCK_ORDER);
  ordersApi.saveOrderToSheet.mockResolvedValue({ ok: true });
  return render(
    <MemoryRouter initialEntries={['/orders/RMC-001-2026-06-28?sheetId=sheet123']}>
      <Routes>
        <Route path="/orders/:orderId" element={<OrderBuilder />} />
      </Routes>
    </MemoryRouter>
  );
}

test('renders order ID in top bar', async () => {
  renderBuilder();
  await waitFor(() => expect(screen.getByText('RMC-001-2026-06-28')).toBeInTheDocument());
});

test('adds line item on button click', async () => {
  renderBuilder();
  await waitFor(() => screen.getByText('+ Add Line Item'));
  await userEvent.click(screen.getByText('+ Add Line Item'));
  await waitFor(() => expect(screen.getByText('#01')).toBeInTheDocument());
});
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
npm test
```

- [ ] **Step 7: Commit**

```bash
git add src/components/OrderTopBar.jsx src/components/OrderBuilder.jsx src/App.jsx src/__tests__/OrderBuilder.test.jsx
git commit -m "feat: order builder with top bar, state advancement, and line items"
```

---

## Task 12: Settings — backend + frontend

**Files:**
- Create: `server/settings/router.js`
- Create: `server/settings/store.js`
- Create: `src/api/settings.js`
- Create: `src/components/SettingsScreen.jsx`
- Modify: `server/index.js`
- Modify: `src/App.jsx`

**Interfaces:**
- Produces:
  - `GET /settings` → `{ brandName, spewEmail }`
  - `PUT /settings` → accepts `{ brandName, spewEmail }`, saves to `server/settings.json`, returns `{ ok: true }`
  - `<SettingsScreen />` — form with brand name and Spew email fields, save button

- [ ] **Step 1: Create server/settings/store.js**

```js
const fs = require('fs');
const config = require('../config');

const DEFAULTS = { brandName: 'Rocky Meowtain Co.', spewEmail: '' };

function readSettings() {
  if (!fs.existsSync(config.SETTINGS_FILE)) return { ...DEFAULTS };
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(config.SETTINGS_FILE, 'utf8')) }; }
  catch { return { ...DEFAULTS }; }
}

function writeSettings(settings) {
  fs.writeFileSync(config.SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

module.exports = { readSettings, writeSettings };
```

- [ ] **Step 2: Create server/settings/router.js**

```js
const express = require('express');
const { readSettings, writeSettings } = require('./store');

const router = express.Router();

router.get('/', (_req, res) => res.json(readSettings()));

router.put('/', (req, res) => {
  const { brandName, spewEmail } = req.body;
  writeSettings({ brandName, spewEmail });
  res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Step 3: Mount settings router in server/index.js**

Uncomment:
```js
app.use('/settings', require('./settings/router'));
```

- [ ] **Step 4: Create src/api/settings.js**

```js
import { apiFetch } from './client';

export const getSettings = () => apiFetch('/settings');
export const saveSettings = (data) => apiFetch('/settings', { method: 'PUT', body: data });
```

- [ ] **Step 5: Create src/components/SettingsScreen.jsx**

```jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSettings, saveSettings } from '../api/settings';
import { getAuthStatus, logout } from '../api/auth';
import Toast from './Toast';

export default function SettingsScreen() {
  const [settings, setSettings] = useState({ brandName: '', spewEmail: '' });
  const [email, setEmail] = useState(null);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    getSettings().then(setSettings).catch(console.error);
    getAuthStatus().then(s => setEmail(s.email)).catch(console.error);
  }, []);

  async function handleSave() {
    try {
      await saveSettings(settings);
      setToast('Settings saved');
    } catch (err) {
      setToast(`Error: ${err.message}`);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <div className="settings-screen">
      <button onClick={() => navigate('/orders')}>← Back</button>
      <h2>Settings</h2>

      <div className="field-group">
        <label>Brand Name (back-print text)</label>
        <input
          value={settings.brandName}
          onChange={e => setSettings(s => ({ ...s, brandName: e.target.value }))}
        />
      </div>

      <div className="field-group">
        <label>Spew Email Address</label>
        <input
          type="email"
          value={settings.spewEmail}
          onChange={e => setSettings(s => ({ ...s, spewEmail: e.target.value }))}
        />
      </div>

      <button className="btn-primary" onClick={handleSave}>Save Settings</button>

      <div className="account-section">
        <p>Connected as: {email || 'Unknown'}</p>
        <button className="btn-secondary" onClick={handleLogout}>Sign out</button>
      </div>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
```

- [ ] **Step 6: Update src/App.jsx to use real SettingsScreen**

Replace `function SettingsScreen() { return <div>Settings</div>; }` with:
```js
import SettingsScreen from './components/SettingsScreen';
```

- [ ] **Step 7: Commit**

```bash
git add server/settings/ server/index.js src/api/settings.js src/components/SettingsScreen.jsx src/App.jsx
git commit -m "feat: settings screen with brand name and Spew email"
```

---

## Task 13: Email builder + Gmail draft

**Files:**
- Create: `server/gmail/emailBuilder.js`
- Create: `server/gmail/client.js`
- Create: `server/gmail/router.js`
- Create: `src/api/gmail.js`
- Create: `server/__tests__/emailBuilder.test.js`
- Modify: `server/index.js`

**Interfaces:**
- Consumes: order data from Sheet, settings for brand name + Spew email, `getOAuth2Client()`
- Produces:
  - `buildEmailHtml(orderData, settings)` → HTML string
  - `buildEmailPlainText(orderData, settings)` → plain text string
  - `POST /gmail/draft` body `{ sheetId }` → creates Gmail draft, returns `{ draftId }`
  - `createDraft(sheetId)` (frontend api)

- [ ] **Step 1: Create server/gmail/emailBuilder.js**

```js
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

function groupByCategory(lineItems) {
  const groups = {};
  for (const item of lineItems) {
    const cat = item.apparelType || 'Other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }
  return groups;
}

function sizeBreakdown(item) {
  return SIZES
    .filter(s => (item.sizes?.[s]?.total ?? 0) > 0)
    .map(s => {
      const total = item.sizes[s].total;
      const inv = item.sizes[s].inventory ?? 0;
      const toOrder = total - inv;
      if (inv > 0 && toOrder > 0) return `${s}: ${total} (${inv} from stock, order ${toOrder})`;
      if (inv === total) return `${s}: ${total} (all from stock)`;
      return `${s}: ${total}`;
    })
    .join(', ');
}

function buildEmailHtml(orderData, settings) {
  const groups = groupByCategory(orderData.lineItems || []);
  const brandName = settings.brandName || '';

  let html = `<h2>${orderData.orderId} — Order Request</h2>`;

  for (const [category, items] of Object.entries(groups)) {
    html += `<h3>${category}</h3><table border="1" cellpadding="6" cellspacing="0">`;
    html += '<tr><th>#</th><th>Design(s)</th><th>Color</th><th>Sizes</th><th>Notes</th></tr>';
    for (const item of items) {
      const designs = (item.designs || [])
        .map(d => `${d.placement}: ${d.file === 'brand_name_text' ? brandName : d.file}`)
        .join('<br>');
      html += `<tr>
        <td>${item.num}</td>
        <td>${designs || '—'}</td>
        <td>${item.color || '—'}</td>
        <td>${sizeBreakdown(item)}</td>
        <td>${item.notes || ''}</td>
      </tr>`;
    }
    html += '</table>';
  }

  html += `<p>📁 Design files: see order folder in Google Drive (Order ID: ${orderData.orderId})</p>`;
  return html;
}

function buildEmailPlainText(orderData, settings) {
  const groups = groupByCategory(orderData.lineItems || []);
  const brandName = settings.brandName || '';
  let text = `${orderData.orderId} — Order Request\n\n`;

  for (const [category, items] of Object.entries(groups)) {
    text += `${category}\n${'—'.repeat(category.length)}\n`;
    for (const item of items) {
      const designs = (item.designs || [])
        .map(d => `  ${d.placement}: ${d.file === 'brand_name_text' ? brandName : d.file}`)
        .join('\n');
      text += `• #${item.num} | ${item.color || ''} | ${sizeBreakdown(item)}\n`;
      if (designs) text += `${designs}\n`;
      if (item.notes) text += `  Notes: ${item.notes}\n`;
    }
    text += '\n';
  }
  text += `Design files: Order folder in Google Drive (${orderData.orderId})\n`;
  return text;
}

module.exports = { buildEmailHtml, buildEmailPlainText };
```

- [ ] **Step 2: Write emailBuilder tests**

```js
// server/__tests__/emailBuilder.test.js
const { buildEmailHtml, buildEmailPlainText } = require('../gmail/emailBuilder');

const ORDER = {
  orderId: 'RMC-001-2026-06-28',
  lineItems: [
    {
      num: '01',
      apparelType: "Women's Round Neck",
      color: 'Black',
      sizes: { M: { total: 2, inventory: 1 }, L: { total: 1, inventory: 0 } },
      notes: 'Curved lettering lower back',
      designs: [
        { designNum: '1', file: 'bestie_bitches.png', placement: 'Front' },
        { designNum: '2', file: 'brand_name_text', placement: 'Back' },
      ],
    },
  ],
};
const SETTINGS = { brandName: 'Rocky Meowtain Co.', spewEmail: 'orders@spew.com' };

test('HTML includes order ID', () => {
  const html = buildEmailHtml(ORDER, SETTINGS);
  expect(html).toContain('RMC-001-2026-06-28');
});

test('HTML shows brand name for back text design', () => {
  const html = buildEmailHtml(ORDER, SETTINGS);
  expect(html).toContain('Rocky Meowtain Co.');
});

test('HTML shows partial inventory breakdown', () => {
  const html = buildEmailHtml(ORDER, SETTINGS);
  expect(html).toContain('from stock');
});

test('plain text includes size breakdown', () => {
  const text = buildEmailPlainText(ORDER, SETTINGS);
  expect(text).toContain('M: 2');
  expect(text).toContain('from stock');
});
```

- [ ] **Step 3: Run emailBuilder tests — expect PASS**

```bash
cd server && npm test -- --testPathPattern=emailBuilder
```

- [ ] **Step 4: Create server/gmail/client.js**

```js
const { google } = require('googleapis');
const { getOAuth2Client } = require('../auth/oauth');

async function createDraft(to, subject, htmlBody, plainTextBody) {
  const auth = getOAuth2Client();
  const gmail = google.gmail({ version: 'v1', auth });

  const boundary = 'boundary_speworderapp';
  const rawEmail = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    plainTextBody,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    htmlBody,
    '',
    `--${boundary}--`,
  ].join('\r\n');

  const encoded = Buffer.from(rawEmail).toString('base64url');
  const res = await gmail.users.drafts.create({
    userId: 'me',
    resource: { message: { raw: encoded } },
  });
  return res.data.id;
}

module.exports = { createDraft };
```

- [ ] **Step 5: Create server/gmail/router.js**

```js
const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { readOrderFromSheet } = require('../sheets/orderSheet');
const { readSettings } = require('../settings/store');
const { buildEmailHtml, buildEmailPlainText } = require('./emailBuilder');
const { createDraft } = require('./client');

const router = express.Router();
router.use(requireAuth);

router.post('/draft', async (req, res) => {
  const { sheetId } = req.body;
  if (!sheetId) return res.status(400).json({ error: 'sheetId required' });
  try {
    const [orderData, settings] = await Promise.all([
      readOrderFromSheet(sheetId),
      Promise.resolve(readSettings()),
    ]);
    if (!settings.spewEmail) return res.status(400).json({ error: 'Spew email not configured in settings' });

    const subject = `${orderData.orderId} — Order Request`;
    const html = buildEmailHtml(orderData, settings);
    const plain = buildEmailPlainText(orderData, settings);
    const draftId = await createDraft(settings.spewEmail, subject, html, plain);
    res.json({ draftId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

- [ ] **Step 6: Mount gmail router in server/index.js**

Uncomment:
```js
app.use('/gmail', require('./gmail/router'));
```

- [ ] **Step 7: Create src/api/gmail.js**

```js
import { apiFetch } from './client';

export const createDraft = (sheetId) =>
  apiFetch('/gmail/draft', { method: 'POST', body: { sheetId } });
```

- [ ] **Step 8: Commit**

```bash
git add server/gmail/ server/__tests__/emailBuilder.test.js server/index.js src/api/gmail.js
git commit -m "feat: Gmail draft creation with HTML email builder"
```

---

## Task 14: Design file copy to Drive on draft generation

**Files:**
- Modify: `server/gmail/router.js`
- Modify: `server/drive/client.js` (already has `copyFile` — verify it's there)

**Interfaces:**
- Consumes: `listFiles(folderId)`, `copyFile(fileId, name, parentId)`, order's Designs subfolder ID
- Produces: before creating the Gmail draft, copies design images from the Source of Truth into the order's Drive `Designs/` subfolder with numbered prefixes

When the draft is generated:
1. Find the `Designs/` subfolder inside the order folder in Drive
2. List files in the Source of Truth that match the designs in the order
3. Copy each matching file into `Designs/` with the prefix `NN-` (e.g. `01-bestie_bitches.png`)
4. Then generate the draft

- [ ] **Step 1: Add helper to find order's Designs subfolder**

Add to `server/drive/client.js`:
```js
async function findFolderByName(name, parentId) {
  const files = await listFiles(parentId, 'application/vnd.google-apps.folder');
  return files.find(f => f.name === name) || null;
}

// Also export getFileId by name (for finding order folder):
async function findFileByName(name, parentId) {
  const drive = getDrive();
  const q = `'${parentId}' in parents and name = '${name.replace("'", "\\'")}' and trashed = false`;
  const res = await drive.files.list({ q, fields: 'files(id, name)', pageSize: 1 });
  return res.data.files?.[0] || null;
}

module.exports = { listFiles, downloadFile, createFolder, createSpreadsheet, copyFile, getFileMetadata, findFolderByName, findFileByName };
```

- [ ] **Step 2: Add design copy step to gmail/router.js**

Add before the `createDraft` call in `POST /gmail/draft`:

```js
const { listFiles, findFileByName, findFolderByName, copyFile } = require('../drive/client');
const config = require('../config');

// Find the order folder in Drive
const orderFolder = await findFileByName(orderData.orderId, config.DRIVE.ORDER_FOLDER);
if (orderFolder) {
  // Find the Designs subfolder
  const designsFolder = await findFolderByName('Designs', orderFolder.id);
  if (designsFolder) {
    // List source of truth files
    const sourceFiles = await listFiles(config.DRIVE.DESIGN_SOURCE);
    const sourceMap = Object.fromEntries(sourceFiles.map(f => [f.name, f.id]));

    // Get all unique design files referenced in this order
    const allDesigns = orderData.lineItems.flatMap(li => li.designs || []);
    const uniqueDesigns = [...new Map(allDesigns.filter(d => d.file !== 'brand_name_text').map(d => [d.file, d])).values()];

    // Assign numbers: use the design's designNum from the first line item referencing it
    const designNumMap = {};
    for (const li of orderData.lineItems) {
      for (const d of li.designs || []) {
        if (!designNumMap[d.file]) designNumMap[d.file] = d.designNum;
      }
    }

    for (const design of uniqueDesigns) {
      const sourceId = sourceMap[design.file];
      if (sourceId) {
        const num = String(designNumMap[design.file] || '00').padStart(2, '0');
        const destName = `${num}-${design.file}`;
        await copyFile(sourceId, destName, designsFolder.id).catch(err =>
          console.warn(`Could not copy ${design.file}:`, err.message)
        );
      }
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add server/gmail/router.js server/drive/client.js
git commit -m "feat: copy design files to order Drive folder on draft generation"
```

---

## Task 15: Launch script

**Files:**
- Create: `start.bat`
- Create: `start.sh` (optional Linux/Mac companion)

**Interfaces:**
- Produces: double-clickable `.bat` that starts both servers and opens the browser

- [ ] **Step 1: Create start.bat**

```bat
@echo off
title SpewOrderApp

echo Starting SpewOrderApp...

:: Start backend
start "SpewOrderApp Backend" /min cmd /c "cd server && npm start"

:: Wait for backend to be ready (poll /health)
:wait_backend
timeout /t 1 /nobreak >nul
curl -s http://localhost:3001/health >nul 2>&1
if errorlevel 1 goto wait_backend
echo Backend ready.

:: Start frontend in background
start "SpewOrderApp Frontend" /min cmd /c "npm run dev"

:: Wait for frontend to be ready
:wait_frontend
timeout /t 1 /nobreak >nul
curl -s http://localhost:5175 >nul 2>&1
if errorlevel 1 goto wait_frontend
echo Frontend ready.

:: Open browser
start http://localhost:5175

echo SpewOrderApp is running. Close this window to stop both servers.
pause
```

- [ ] **Step 2: Test the launch script manually**

Close any existing servers, then double-click `start.bat`. Verify:
- Browser opens to `http://localhost:5175`
- Landing screen appears
- No error messages in either server window

- [ ] **Step 3: Add root package.json convenience script**

In root `package.json`, add:
```json
"start": "start.bat",
"dev:backend": "cd server && npm run dev",
"dev:frontend": "vite"
```

- [ ] **Step 4: Commit**

```bash
git add start.bat package.json
git commit -m "feat: single .bat launch script for both servers"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered in task |
|---|---|
| React + Node/Express architecture | Task 1 |
| `.bat` launch shortcut | Task 15 |
| Google OAuth landing screen with saved account | Task 2, 3 |
| Orders list with state badges | Task 8 |
| Order builder: button-based line items | Task 10, 11 |
| Multiple designs per line item | Task 10 (DesignsList in LineItemCard) |
| Per-size inventory tracking | Task 10 (SizeButtons) |
| Notes field per line item | Task 10 (LineItemCard) |
| Local design image cache + manual refresh | Task 4, 5 |
| Design sync on startup | Task 4 (index.js startup sync) |
| Drive order folder + Designs subfolder creation | Task 6 |
| Google Sheet per order (3 tabs) | Task 7 |
| Sheet as live source of truth, auto-save | Task 9 |
| Local JSON fallback on connection loss | Task 9 |
| Offline banner | Task 9 |
| Offline queue flush on reconnect | Task 9 |
| Order states: building→sent→pending→paid→fulfilled→received | Task 11 (OrderTopBar) |
| State advancement with confirmation | Task 11 |
| Settings: brand name, Spew email | Task 12 |
| Gmail draft creation with HTML email | Task 13 |
| Confirmation dialog before draft | Task 11 (OrderTopBar) |
| Email grouped by category, sizes with inventory breakdown | Task 13 (emailBuilder) |
| Drive folder link in email footer | Task 13 (emailBuilder) |
| Design files copied to Drive on draft | Task 14 |
| Numbered design file prefix (`01-filename`) | Task 14 |
| Design browser grid with selection mode | Task 5 |
| "Add Design" button per line item | Task 10 |
| "New Order" creates Drive folder immediately | Task 6 |
| Orders list fetches from Drive | Task 8 |

All spec requirements are covered.

**Type/name consistency check:**
- `sheetId` used consistently across `useOrder`, `api/orders`, `gmail/router`, `sheets/router` ✓
- `orderId` format `RMC-NNN-YYYY-MM-DD` consistent across `idGenerator`, `orderSheet`, `emailBuilder` ✓
- Line item `num` field (string, zero-padded 2-digit) consistent across `orderSheet`, `LineItemCard`, `OrderBuilder` ✓
- `designs` array with `{ designNum, file, placement }` consistent across `orderSheet`, `LineItemCard`, `emailBuilder` ✓
- `sizes` object with `{ [size]: { total, inventory } }` consistent across `SizeButtons`, `orderSheet`, `emailBuilder` ✓
- `listCachedDesigns` returns `[{ name, url }]` consistent across `designsCache`, `DesignBrowser` ✓
