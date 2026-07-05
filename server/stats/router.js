const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { readAllOrderCaches } = require('../orders/cache');
const { readCatalog } = require('../items/store');
const { aggregate, COUNTED_STATES } = require('./aggregate');
const { getOrCreateStatsSheet, writeStats } = require('./blankStatsSheet');

const router = express.Router();
router.use(requireAuth);

function formatTimestamp(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

router.post('/refresh', async (_req, res) => {
  try {
    const orders = readAllOrderCaches();
    const catalog = readCatalog();
    const orderCount = orders.filter(o => COUNTED_STATES.includes(o.state)).length;
    const { shirts, other } = aggregate(orders, catalog);
    const updatedAt = formatTimestamp(new Date());

    const sheetId = await getOrCreateStatsSheet();
    await writeStats(sheetId, { shirts, other, orderCount, updatedAt });

    res.json({
      sheetId,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}`,
      orderCount,
      rowCount: shirts.length + other.length,
      updatedAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
