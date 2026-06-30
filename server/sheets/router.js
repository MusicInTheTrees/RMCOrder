const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { readOrderFromSheet, writeOrderToSheet } = require('./orderSheet');
const { writeOrderCache, readOrderCache } = require('../orders/cache');
const { readCatalog } = require('../items/store');
const { findFileByName, uploadFileContent, downloadFileContent, createFolder } = require('../drive/client');
const { readRange } = require('./client');
const fs = require('fs');
const config = require('../config');

const router = express.Router();
router.use(requireAuth);

router.get('/order/:sheetId', async (req, res) => {
  try {
    // Step 1: quick Sheet1 read just for orderId (single API call)
    let orderId = '';
    try {
      const meta = await readRange(req.params.sheetId, 'Sheet1!A1:B10');
      const infoMap = Object.fromEntries(meta.map(([k, v]) => [k, v]));
      orderId = infoMap['Order ID'] || '';
    } catch { /* proceed without orderId */ }

    // Step 2: local cache is the primary source — always complete, always current
    if (orderId) {
      const cached = readOrderCache(orderId);
      if (cached) return res.json({ ...cached, sheetId: req.params.sheetId });
    }

    // Step 3: Drive JSON fallback (for fresh installs / cache misses)
    if (orderId) {
      try {
        const folder = await findFileByName(orderId, config.DRIVE.ORDER_FOLDER);
        if (folder) {
          const jsonFile = await findFileByName('order.json', folder.id);
          if (jsonFile) {
            const content = await downloadFileContent(jsonFile.id);
            const driveOrder = JSON.parse(content);
            return res.json({ ...driveOrder, sheetId: req.params.sheetId });
          }
        }
      } catch (driveErr) {
        console.warn('Could not read order.json from Drive:', driveErr.message);
      }
    }

    // Step 4: full sheet parse (legacy / no cache / no Drive JSON)
    const order = await readOrderFromSheet(req.params.sheetId);
    const catalog = readCatalog();
    const byName = Object.fromEntries(catalog.items.map(i => [i.name.toLowerCase(), i.id]));
    order.lineItems = order.lineItems.map(li => ({
      ...li,
      itemTypeId: li.itemTypeId || byName[(li.itemTypeName || '').toLowerCase()] || '',
    }));
    res.json(order);
  } catch (err) {
    // Step 5: offline cache scan as last resort
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

    // Local cache first — fastest and most reliable, complete JSON
    writeOrderCache(orderData.orderId, orderData);

    // Sheet write (human-readable backup, partial fields)
    await writeOrderToSheet(req.params.sheetId, orderData);

    // Best-effort Drive JSON (cross-machine persistence)
    if (orderData.orderId) {
      try {
        let folder = await findFileByName(orderData.orderId, config.DRIVE.ORDER_FOLDER);
        if (!folder) {
          const id = await createFolder(orderData.orderId, config.DRIVE.ORDER_FOLDER);
          folder = { id };
        }
        await uploadFileContent('order.json', JSON.stringify(orderData), folder.id);
      } catch (driveErr) {
        console.warn('Could not save order.json to Drive:', driveErr.message);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
