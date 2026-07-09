const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { fromCsvUpload } = require('./demandSource');
const { computePlans } = require('./calc');
const { readBlankOrderConfig } = require('./config');
const { readCatalog } = require('../items/store');

const router = express.Router();
router.use(requireAuth);

router.post('/plan', (req, res) => {
  try {
    const { csvOld, csvNew, feed: feedIn, grandTotal, perTypeTotals, perTypeSizeRestrictions, policyOverrides } = req.body || {};
    if (!feedIn && (!csvOld || !csvNew)) {
      return res.status(400).json({ error: 'Both catalog CSV exports (csvOld, csvNew) are required.' });
    }
    const feed = feedIn || fromCsvUpload(csvOld, csvNew);
    const cfg = { ...readBlankOrderConfig(), ...(policyOverrides || {}) };
    const { industry, blended, effectiveTotal } = computePlans(feed, cfg, {
      grandTotal: Number(grandTotal) || 0,
      perTypeTotals: perTypeTotals || {},
      perTypeSizeRestrictions: perTypeSizeRestrictions || {},
    });
    res.json({ industry, blended, effectiveTotal, feedMeta: feed.meta });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/config', (_req, res) => {
  try {
    const cfg = readBlankOrderConfig();
    const catalog = readCatalog();
    const stockBlankItems = (catalog.items || [])
      .filter(i => i.stockBlanks)
      .map(i => ({ id: i.id, name: i.name }));
    res.json({ config: cfg, stockBlankItems });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
