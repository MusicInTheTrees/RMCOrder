const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { listFiles, createFolder, createSpreadsheet } = require('../drive/client');
const { generateOrderId } = require('./idGenerator');
const { writeOrderCache, readOrderCache } = require('./cache');
const { initOrderSheet } = require('../sheets/orderSheet');
const config = require('../config');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  try {
    const folders = await listFiles(config.DRIVE.ORDER_FOLDER, 'application/vnd.google-apps.folder');
    const orders = folders
      .map(f => {
        const match = f.name.match(/^(RMC-\d{3}-\d{4}-\d{2}-\d{2})$/);
        if (!match) return null;
        const orderId = f.name;
        const cached = readOrderCache(orderId);
        return { orderId, folderId: f.id, sheetId: cached ? cached.sheetId : null };
      })
      .filter(Boolean);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (_req, res) => {
  try {
    const folders = await listFiles(config.DRIVE.ORDER_FOLDER, 'application/vnd.google-apps.folder');
    const orderId = generateOrderId(folders.map(f => f.name));

    const folderId = await createFolder(orderId, config.DRIVE.ORDER_FOLDER);
    await createFolder('Designs', folderId);
    const sheetId = await createSpreadsheet(`${orderId} Order`, folderId);

    const today = new Date().toISOString().slice(0, 10);
    const orderData = {
      orderId,
      folderId,
      sheetId,
      state: 'building',
      created: today,
      lastUpdated: today,
      notes: '',
      lineItems: [],
    };
    writeOrderCache(orderId, orderData);
    await initOrderSheet(sheetId, orderData);

    res.json({ orderId, sheetId, folderId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
