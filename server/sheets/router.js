const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { readOrderFromSheet, writeOrderToSheet } = require('./orderSheet');
const { writeOrderCache, readOrderCache } = require('../orders/cache');
const { readCatalog } = require('../items/store');
const { findFileByName, uploadFileContent, downloadFileContent, createFolder } = require('../drive/client');
const { readRange } = require('./client');
const fs = require('fs');
const config = require('../config');
const { normalizeState } = require('../orders/state');
const { captureOrderEmails } = require('../emaillist/capture');

const router = express.Router();
router.use(requireAuth);

router.get('/order/:sheetId', async (req, res) => {
  try {
    const send = (order, extra = {}) => res.json({ ...order, ...extra, state: normalizeState(order.state) });
    // Step 1: quick Sheet1 read just for orderId
    let orderId = '';
    try {
      const meta = await readRange(req.params.sheetId, 'Sheet1!A1:B10');
      const infoMap = Object.fromEntries(meta.map(([k, v]) => [k, v]));
      orderId = infoMap['Order ID'] || '';
    } catch { /* proceed without orderId */ }

    // Step 2a: local cache by orderId — primary, always complete
    if (orderId) {
      const cached = readOrderCache(orderId);
      if (cached) return send(cached, { sheetId: req.params.sheetId });
    }

    // Step 2b: local cache scan by sheetId — catches orderId mismatch / empty Sheet1
    if (fs.existsSync(config.ORDERS_CACHE_DIR)) {
      for (const file of fs.readdirSync(config.ORDERS_CACHE_DIR)) {
        const data = readOrderCache(file.replace('.json', ''));
        if (data && data.sheetId === req.params.sheetId) {
          return send(data, { sheetId: req.params.sheetId });
        }
      }
    }

    // Step 3: Drive JSON fallback (cross-machine / no cache)
    if (orderId) {
      try {
        const folder = await findFileByName(orderId, config.DRIVE.ORDER_FOLDER);
        if (folder) {
          const jsonFile = await findFileByName('order.json', folder.id);
          if (jsonFile) {
            const content = await downloadFileContent(jsonFile.id);
            const driveOrder = JSON.parse(content);
            return send(driveOrder, { sheetId: req.params.sheetId });
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
    send(order);
  } catch (err) {
    // Step 5: last-resort offline scan
    if (fs.existsSync(config.ORDERS_CACHE_DIR)) {
      for (const file of fs.readdirSync(config.ORDERS_CACHE_DIR)) {
        const data = readOrderCache(file.replace('.json', ''));
        if (data && data.sheetId === req.params.sheetId) {
          return res.json({ ...data, _fromCache: true, state: normalizeState(data.state) });
        }
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

    // Fire-and-forget: grow the central email list from this order's customers
    captureOrderEmails(orderData);

    // Sheets write only on explicit full-sync (manual Save button) to avoid quota
    if (req.query.full === '1') {
      await writeOrderToSheet(req.params.sheetId, orderData);
    }

    // Respond immediately — cache is written, client doesn't need to wait for Drive
    res.json({ ok: true });

    // Fire-and-forget Drive JSON backup (cross-machine persistence)
    if (orderData.orderId) {
      (async () => {
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
      })();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
