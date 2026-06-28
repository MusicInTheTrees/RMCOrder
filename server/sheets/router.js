const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { readOrderFromSheet, writeOrderToSheet } = require('./orderSheet');
const { writeOrderCache, readOrderCache } = require('../orders/cache');
const fs = require('fs');
const config = require('../config');

const router = express.Router();
router.use(requireAuth);

router.get('/order/:sheetId', async (req, res) => {
  try {
    const order = await readOrderFromSheet(req.params.sheetId);
    res.json(order);
  } catch (err) {
    // Fall back to local cache — scan for matching sheetId
    const cacheFiles = fs.existsSync(config.ORDERS_CACHE_DIR)
      ? fs.readdirSync(config.ORDERS_CACHE_DIR) : [];
    for (const file of cacheFiles) {
      const data = readOrderCache(file.replace('.json', ''));
      if (data && data.sheetId === req.params.sheetId) {
        return res.json({ ...data, _fromCache: true });
      }
    }
    res.status(500).json({ error: err.message });
  }
});

router.put('/order/:sheetId', async (req, res) => {
  try {
    const orderData = req.body;
    await writeOrderToSheet(req.params.sheetId, orderData);
    writeOrderCache(orderData.orderId, orderData);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
