const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { listFiles, createFolder, createSpreadsheet, findFileByName, trashFile, downloadFileContent } = require('../drive/client');
const { generateOrderId } = require('./idGenerator');
const { writeOrderCache, readOrderCache, deleteOrderCache } = require('./cache');
const { normalizeState } = require('./state');
const { initOrderSheet } = require('../sheets/orderSheet');
const config = require('../config');

const router = express.Router();
router.use(requireAuth);

// Recover an order that has a Drive folder but no local cache (e.g. it was
// created on another machine). Prefer the full order.json snapshot the app
// writes on every save; otherwise just locate its Sheet so it can be opened.
async function recoverOrderFromDrive(orderId, folderId) {
  try {
    const jsonFile = await findFileByName('order.json', folderId);
    if (jsonFile) {
      const data = JSON.parse(await downloadFileContent(jsonFile.id));
      if (data && data.sheetId) return { ...data, folderId };
    }
  } catch { /* fall through to sheet lookup */ }
  try {
    const sheet = await findFileByName(`${orderId} Order`, folderId);
    if (sheet) {
      return { orderId, folderId, sheetId: sheet.id, state: 'building', created: '', lastUpdated: '', orderName: '', notes: '', lineItems: [] };
    }
  } catch { /* nothing recoverable */ }
  return null;
}

router.get('/', async (_req, res) => {
  try {
    const folders = await listFiles(config.DRIVE.ORDER_FOLDER, 'application/vnd.google-apps.folder');
    const orders = await Promise.all(folders.map(async (f) => {
      const match = f.name.match(/^(RMC-\d{3}-\d{4}-\d{2}-\d{2})$/);
      if (!match) return null;
      const orderId = f.name;
      let cached = readOrderCache(orderId);
      if (!cached || !cached.sheetId) {
        const recovered = await recoverOrderFromDrive(orderId, f.id);
        if (recovered) {
          writeOrderCache(orderId, recovered); // self-heal so future loads use the cache
          cached = recovered;
        }
      }
      return {
        orderId,
        folderId: f.id,
        sheetId: cached ? cached.sheetId : null,
        state: cached ? normalizeState(cached.state) : null,
        created: cached ? cached.created : null,
        orderName: cached ? (cached.orderName || '') : '',
      };
    }));
    res.json(orders.filter(Boolean));
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
      orderName: '',
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

router.delete('/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    // Trash the Drive folder (contains the Sheet + Designs) — recoverable from Drive trash.
    const folder = await findFileByName(orderId, config.DRIVE.ORDER_FOLDER);
    if (folder) await trashFile(folder.id);
    deleteOrderCache(orderId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
