const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { readRange, batchWriteRanges } = require('../sheets/client');
const { normalizeColor, cleanColor } = require('./normalizeColor');
const config = require('../config');

const router = express.Router();
router.use(requireAuth);

// Sheet columns: In Stock | Item | Color | Style | Size (A-E, row 1 is header)
const SHEET_ID = config.INVENTORY_SHEET_ID;

// Raw rows, index i ↔ sheet row i+2. Keep gaps so row numbers stay correct.
async function fetchRows() {
  return readRange(SHEET_ID, 'A2:E10000');
}

function isDataRow(r) {
  return Array.isArray(r) && r.length >= 5 && r[0] !== '';
}

function parseRow([inStock, item, color, style, size]) {
  return {
    inStock: parseInt(inStock, 10) || 0,
    item: (item || '').toLowerCase().trim(),
    color: normalizeColor(color),
    style: (style || '').toLowerCase().trim(),
    size: (size || '').trim(),
  };
}

// First row index matching the entry's item/color/style/size, or -1.
function findRowIndex(rows, entry) {
  return rows.findIndex(r => {
    if (!isDataRow(r)) return false;
    const p = parseRow(r);
    return p.item  === (entry.item || '').toLowerCase().trim() &&
           p.color === normalizeColor(entry.color) &&
           p.style === (entry.style || '').toLowerCase().trim() &&
           p.size  === (entry.size || '').trim();
  });
}

router.get('/', async (_req, res) => {
  try {
    const rows = await fetchRows();
    res.json(rows.filter(isDataRow).map(parseRow));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/styles', async (_req, res) => {
  try {
    const rows = await fetchRows();
    const styles = [...new Set(rows.filter(isDataRow).map(r => parseRow(r).style))].filter(Boolean).sort();
    res.json(styles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Body: [{ item, color, style, size, qty }]
// Decrements the first matching row per entry; clamps at 0 and reports shortfalls.
router.post('/decrement', async (req, res) => {
  const decrements = req.body;
  if (!Array.isArray(decrements) || decrements.length === 0) return res.json({ ok: true, updated: 0, shortfalls: [] });

  try {
    const rows = await fetchRows();
    const updates = [];
    const shortfalls = [];

    for (const dec of decrements) {
      const idx = findRowIndex(rows, dec);
      if (idx === -1) continue;
      const current = parseInt(rows[idx][0], 10) || 0;
      const newVal = Math.max(0, current - dec.qty);
      if (dec.qty > current) {
        shortfalls.push({
          item: dec.item, color: dec.color, style: dec.style, size: dec.size,
          requested: dec.qty, applied: current, shortfall: dec.qty - current,
        });
      }
      rows[idx] = [String(newVal), ...rows[idx].slice(1)];
      updates.push({ range: `A${idx + 2}`, values: [[String(newVal)]] });
    }

    if (updates.length > 0) await batchWriteRanges(SHEET_ID, updates, 'RAW');
    res.json({ ok: true, updated: updates.length, shortfalls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Body: [{ item, color, style, size, qty }]
// Increments matching rows; appends new rows for unmatched entries.
router.post('/increment', async (req, res) => {
  const increments = req.body;
  if (!Array.isArray(increments) || increments.length === 0) return res.json({ ok: true, updated: 0, added: 0 });

  try {
    const rows = await fetchRows();
    const updates = [];
    let updated = 0;
    let added = 0;

    for (const inc of increments) {
      const idx = findRowIndex(rows, inc);
      if (idx !== -1) {
        const current = parseInt(rows[idx][0], 10) || 0;
        const newVal = current + inc.qty;
        rows[idx] = [String(newVal), ...rows[idx].slice(1)];
        updates.push({ range: `A${idx + 2}`, values: [[String(newVal)]] });
        updated++;
      } else {
        const newRow = [String(inc.qty), inc.item, cleanColor(inc.color), inc.style, inc.size];
        rows.push(newRow);
        updates.push({ range: `A${rows.length + 1}`, values: [newRow] });
        added++;
      }
    }

    if (updates.length > 0) await batchWriteRanges(SHEET_ID, updates, 'RAW');
    res.json({ ok: true, updated, added });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
