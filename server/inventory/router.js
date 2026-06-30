const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { readRange, writeRange } = require('../sheets/client');
const config = require('../config');

const router = express.Router();
router.use(requireAuth);

// Sheet columns: In Stock | Item | Color | Style | Size (A-E, row 1 is header)
const SHEET_ID = config.INVENTORY_SHEET_ID;

async function fetchRows() {
  const rows = await readRange(SHEET_ID, 'A2:E10000');
  return rows.filter(r => r.length >= 5 && r[0] !== '');
}

function parseRow([inStock, item, color, style, size]) {
  return {
    inStock: parseInt(inStock, 10) || 0,
    item: (item || '').toLowerCase().trim(),
    color: (color || '').toLowerCase().trim(),
    style: (style || '').toLowerCase().trim(),
    size: (size || '').trim(),
  };
}

router.get('/', async (_req, res) => {
  try {
    const rows = await fetchRows();
    res.json(rows.map(parseRow));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/styles', async (_req, res) => {
  try {
    const rows = await fetchRows();
    const styles = [...new Set(rows.map(r => parseRow(r).style))].filter(Boolean).sort();
    res.json(styles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Body: [{ item, color, style, size, qty }]
router.post('/decrement', async (req, res) => {
  const decrements = req.body;
  if (!Array.isArray(decrements) || decrements.length === 0) return res.json({ ok: true, updated: 0 });

  try {
    const rows = await fetchRows();
    let updated = 0;

    for (let i = 0; i < rows.length; i++) {
      const parsed = parseRow(rows[i]);
      const match = decrements.find(d =>
        d.item.toLowerCase().trim() === parsed.item &&
        d.color.toLowerCase().trim() === parsed.color &&
        d.style.toLowerCase().trim() === parsed.style &&
        d.size.trim() === parsed.size
      );
      if (match) {
        const newVal = Math.max(0, parsed.inStock - match.qty);
        await writeRange(SHEET_ID, `A${i + 2}`, [[String(newVal)]], 'RAW');
        updated++;
      }
    }

    res.json({ ok: true, updated });
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
    let updated = 0;
    let added = 0;

    for (const inc of increments) {
      const idx = rows.findIndex(r => {
        const p = parseRow(r);
        return p.item  === inc.item.toLowerCase().trim() &&
               p.color === inc.color.toLowerCase().trim() &&
               p.style === inc.style.toLowerCase().trim() &&
               p.size  === inc.size.trim();
      });

      if (idx !== -1) {
        const current = parseInt(rows[idx][0], 10) || 0;
        const newVal = current + inc.qty;
        await writeRange(SHEET_ID, `A${idx + 2}`, [[String(newVal)]], 'RAW');
        rows[idx] = [String(newVal), ...rows[idx].slice(1)];
        updated++;
      } else {
        const nextRow = rows.length + 2;
        const newRow = [String(inc.qty), inc.item, inc.color, inc.style, inc.size];
        await writeRange(SHEET_ID, `A${nextRow}`, [newRow], 'RAW');
        rows.push(newRow);
        added++;
      }
    }

    res.json({ ok: true, updated, added });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
