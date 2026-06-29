require('dotenv').config();
const path = require('path');

module.exports = {
  PORT: 3001,
  DESIGNS_CACHE_DIR: path.join(__dirname, '..', 'designs-cache'),
  ORDERS_CACHE_DIR: path.join(__dirname, '..', 'orders-cache'),
  TOKENS_FILE: path.join(__dirname, 'tokens.json'),
  SETTINGS_FILE: path.join(__dirname, 'settings.json'),
  ITEMS_CATALOG_FILE: path.join(__dirname, 'items-catalog.json'),
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
