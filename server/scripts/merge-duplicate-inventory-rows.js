// Maintenance: merge Blank Inventory Sheet rows that are the same
// (item, color, style, size) once the color's pantone/code suffix is ignored
// (e.g. "black" vs "Black (440C)"). Sums In Stock into the first row, blanks
// the duplicate rows, and strips the suffix from surviving color names.
// Usage: node server/scripts/merge-duplicate-inventory-rows.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { readRange, batchWriteRanges } = require('../sheets/client');
const { normalizeColor, cleanColor } = require('../inventory/normalizeColor');
const config = require('../config');

function isDataRow(r) {
  return Array.isArray(r) && r.length >= 5 && r[0] !== '';
}

async function main() {
  const sheetId = config.INVENTORY_SHEET_ID;
  const rows = await readRange(sheetId, 'A2:E10000');
  const firstByKey = new Map(); // normalized key -> row index of surviving row
  const updates = [];
  let merged = 0;

  rows.forEach((r, i) => {
    if (!isDataRow(r)) return;
    const key = [
      (r[1] || '').toLowerCase().trim(),
      normalizeColor(r[2]),
      (r[3] || '').toLowerCase().trim(),
      (r[4] || '').trim(),
    ].join('|');

    if (!firstByKey.has(key)) {
      firstByKey.set(key, i);
      return;
    }

    const first = firstByKey.get(key);
    const sum = (parseInt(rows[first][0], 10) || 0) + (parseInt(r[0], 10) || 0);
    rows[first] = [String(sum), ...rows[first].slice(1)];
    updates.push({ range: `A${first + 2}`, values: [[String(sum)]] });
    updates.push({ range: `A${i + 2}:E${i + 2}`, values: [['', '', '', '', '']] });
    console.log(`merge: row ${i + 2} (${r[2]} ${r[3]} ${r[4]}) -> row ${first + 2}, new total ${sum}`);
    merged++;
  });

  for (const idx of firstByKey.values()) {
    const original = rows[idx][2] || '';
    const clean = cleanColor(original);
    if (clean !== original) {
      updates.push({ range: `C${idx + 2}`, values: [[clean]] });
      console.log(`rename: row ${idx + 2} color "${original}" -> "${clean}"`);
    }
  }

  if (updates.length === 0) {
    console.log('Nothing to merge — sheet is already normalized.');
    return;
  }
  await batchWriteRanges(sheetId, updates, 'RAW');
  console.log(`Done — merged ${merged} duplicate row(s).`);
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
