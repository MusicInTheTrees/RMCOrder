const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { readOrderFromSheet, writeOrderToSheet } = require('./orderSheet');
const { writeOrderCache } = require('../orders/cache');

const router = express.Router();
router.use(requireAuth);

router.get('/order/:sheetId', async (req, res) => {
  try {
    const order = await readOrderFromSheet(req.params.sheetId);
    res.json(order);
  } catch (err) {
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
