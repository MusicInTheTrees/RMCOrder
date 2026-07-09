const fs = require('fs');
const config = require('../config');

const DEFAULTS = {
  sizeCurves: { industry: { XS: 1, S: 10, M: 23, L: 31, XL: 23, '2XL': 9, '3XL': 3 } },
  styleCurves: {},
  blendWeight: 0.5,
  colorAliases: { Ash: 'Heather Gray' },
  excludedColors: ['Daisy'],
  excludedSizes: ['XS', 'S', '3XL', '4XL', '5XL'],
  coreColors: ['Black', 'White'],
  coreColorFloorPct: 0.1,
  styleSuppliers: { 'Unisex Shirt': 'M&O 4800', 'Youth Shirt': 'M&O 4850', Tank: 'Tultex S105' },
  styleItemTypeMap: {},
  manualHistory: [],
};

function readBlankOrderConfig() {
  try {
    if (fs.existsSync(config.BLANK_ORDER_CONFIG_FILE)) {
      return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(config.BLANK_ORDER_CONFIG_FILE, 'utf8')) };
    }
  } catch { /* fall through to defaults */ }
  return { ...DEFAULTS };
}

module.exports = { readBlankOrderConfig, DEFAULTS };
