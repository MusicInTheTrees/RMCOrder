const fs = require('fs');
const config = require('../config');

const DEFAULTS = { items: [] };

function readCatalog() {
  if (!fs.existsSync(config.ITEMS_CATALOG_FILE)) return { ...DEFAULTS, items: [] };
  try { return JSON.parse(fs.readFileSync(config.ITEMS_CATALOG_FILE, 'utf8')); }
  catch { return { ...DEFAULTS, items: [] }; }
}

function writeCatalog(data) {
  fs.writeFileSync(config.ITEMS_CATALOG_FILE, JSON.stringify(data, null, 2));
}

module.exports = { readCatalog, writeCatalog };
