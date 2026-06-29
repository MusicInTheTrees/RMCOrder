const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { readOrderFromSheet } = require('../sheets/orderSheet');
const { readSettings } = require('../settings/store');
const { buildEmailHtml, buildEmailPlainText } = require('./emailBuilder');
const { createDraft } = require('./client');
const { listFiles, findFileByName, findFolderByName, copyFile } = require('../drive/client');
const config = require('../config');

const router = express.Router();
router.use(requireAuth);

router.post('/draft', async (req, res) => {
  const { sheetId } = req.body;
  if (!sheetId) return res.status(400).json({ error: 'sheetId required' });
  try {
    const [orderData, settings] = await Promise.all([
      readOrderFromSheet(sheetId),
      Promise.resolve(readSettings()),
    ]);
    if (!settings.spewEmail) return res.status(400).json({ error: 'Spew email not configured in settings' });

    // Copy design files to order's Designs subfolder in Drive
    const orderFolder = await findFileByName(orderData.orderId, config.DRIVE.ORDER_FOLDER);
    if (orderFolder) {
      const designsFolder = await findFolderByName('Designs', orderFolder.id);
      if (designsFolder) {
        const sourceFiles = await listFiles(config.DRIVE.DESIGN_SOURCE);
        const sourceMap = Object.fromEntries(sourceFiles.map(f => [f.name, f.id]));

        // Collect unique design files and their designNum (first occurrence)
        const designNumMap = {};
        for (const li of orderData.lineItems) {
          for (const d of [...(li.frontDesigns || []), ...(li.backDesigns || [])]) {
            if (!designNumMap[d.file]) {
              designNumMap[d.file] = d.designNum;
            }
          }
        }

        for (const [file, designNum] of Object.entries(designNumMap)) {
          const sourceId = sourceMap[file];
          if (sourceId) {
            const num = String(designNum).padStart(2, '0');
            const destName = `${num}-${file}`;
            await copyFile(sourceId, destName, designsFolder.id).catch(err =>
              console.warn(`Could not copy ${file}:`, err.message)
            );
          }
        }
      }
    }

    const subject = orderData.orderName
      ? `RMC Order: ${orderData.orderName}`
      : `${orderData.orderId} — Order Request`;
    const html = buildEmailHtml(orderData, settings);
    const plain = buildEmailPlainText(orderData, settings);
    const draftId = await createDraft(settings.spewEmail, subject, html, plain);
    res.json({ draftId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
