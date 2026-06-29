const fs = require('fs');
const config = require('../config');

const DEFAULTS = {
  brandName: 'Rocky Meowtain Co.',
  spewEmail: '',
  defaultBackDesign: '',
  defaultBackNotes: '',
};

function readSettings() {
  if (!fs.existsSync(config.SETTINGS_FILE)) return { ...DEFAULTS };
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(config.SETTINGS_FILE, 'utf8')) }; }
  catch { return { ...DEFAULTS }; }
}

function writeSettings(settings) {
  fs.writeFileSync(config.SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

module.exports = { readSettings, writeSettings };
