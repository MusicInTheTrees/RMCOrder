const path = require('path');
const fs = require('fs');
const os = require('os');

// Credentials live OUTSIDE the repo so git never touches them and they're easy to transfer.
// Location: %APPDATA%\RMCOrder\rmcorder-credentials.env
const _externalCreds = path.join(
  process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  'RMCOrder',
  'rmcorder-credentials.env'
);
require('dotenv').config({
  path: fs.existsSync(_externalCreds) ? _externalCreds : path.join(__dirname, '.env'),
});

module.exports = {
  PORT: 3001,
  DESIGNS_CACHE_DIR: path.join(__dirname, '..', 'designs-cache'),
  ORDERS_CACHE_DIR: path.join(__dirname, '..', 'orders-cache'),
  TOKENS_FILE: path.join(__dirname, 'tokens.json'),
  SETTINGS_FILE: path.join(__dirname, 'settings.json'),
  ITEMS_CATALOG_FILE: path.join(__dirname, 'items-catalog.json'),
  BLANK_ORDER_CONFIG_FILE: path.join(__dirname, 'blankorder', 'blankOrderConfig.json'),
  STATUS_EMAIL_FILE: path.join(__dirname, 'status-email-templates.json'),
  EMAIL_LIST_FILE: path.join(__dirname, 'email-list.json'),
  CAMPAIGN_JOBS_FILE: path.join(__dirname, 'campaign-jobs.json'),
  INVENTORY_SHEET_ID: '1a_vMRuJPn19Y7E1z-hfV17Z-gD_63PNKAn0Rwx2tkSk',
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
