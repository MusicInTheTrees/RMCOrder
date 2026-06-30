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

module.exports = router;
