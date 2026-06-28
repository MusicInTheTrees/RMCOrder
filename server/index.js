const express = require('express');
const cors = require('cors');
const fs = require('fs');
const config = require('./config');

const app = express();
app.use(cors({ origin: 'http://localhost:5175' }));
app.use(express.json());

fs.mkdirSync(config.DESIGNS_CACHE_DIR, { recursive: true });
fs.mkdirSync(config.ORDERS_CACHE_DIR, { recursive: true });
app.use('/designs-cache', express.static(config.DESIGNS_CACHE_DIR));

// Sync designs on startup (non-blocking)
const { syncDesignsCache } = require('./drive/designsCache');
syncDesignsCache().catch(err => console.warn('Design sync skipped:', err.message));

app.get('/health', (_req, res) => res.json({ ok: true }));

// Routers mounted in later tasks (leave these commented out for now):
app.use('/auth', require('./auth/router'));
app.use('/drive', require('./drive/router'));
app.use('/sheets', require('./sheets/router'));
app.use('/orders', require('./orders/router'));
// app.use('/gmail', require('./gmail/router'));
// app.use('/settings', require('./settings/router'));

if (require.main === module) {
  app.listen(config.PORT, () => console.log(`Server running on port ${config.PORT}`));
}

module.exports = app;
