const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { readOrderFromSheet, writeCustomersToSheet, EMAIL_STATES } = require('../sheets/orderSheet');
const { readOrderCache, writeOrderCache } = require('../orders/cache');
const { readSettings } = require('../settings/store');
const { readCatalog } = require('../items/store');
const { buildEmailHtml, buildEmailPlainText } = require('./emailBuilder');
const { upsertDraft, sendEmail, createDraft } = require('./client');
const { buildCustomerEmail, headerImage } = require('./customerEmailBuilder');
const { itemsForCustomer, sampleItems } = require('./customerItems');
const { readStatusEmails, writeStatusEmails } = require('./statusEmailStore');
const { listFiles, findFileByName, findFolderByName, copyFile, shareFileWithUser, uploadFileContent } = require('../drive/client');
const { readRange } = require('../sheets/client');
const config = require('../config');

const router = express.Router();
router.use(requireAuth);

router.post('/draft', async (req, res) => {
  const { sheetId, draftId: existingDraftId } = req.body;
  if (!sheetId) return res.status(400).json({ error: 'sheetId required' });
  try {
    // Read order — cache first so email reflects latest saved data
    let orderData;
    try {
      const meta = await readRange(sheetId, 'Sheet1!A1:B10');
      const infoMap = Object.fromEntries(meta.map(([k, v]) => [k, v]));
      const orderId = infoMap['Order ID'] || '';
      if (orderId) orderData = readOrderCache(orderId);
    } catch { /* fall through */ }
    if (!orderData) orderData = await readOrderFromSheet(sheetId);

    const settings = readSettings();
    const catalog = readCatalog();
    const catalogByName = Object.fromEntries(
      catalog.items.map(i => [i.name.toLowerCase(), i])
    );
    if (!settings.spewEmail) return res.status(400).json({ error: 'Spew email not configured in settings' });

    // Copy design files to order's Designs subfolder in Drive
    const orderFolder = await findFileByName(orderData.orderId, config.DRIVE.ORDER_FOLDER);
    if (orderFolder) {
      // Ensure the email links to the real Drive folder even if the cached/sheet
      // order data is missing folderId (e.g. older orders).
      orderData.folderId = orderFolder.id;

      // Give the recipient view access to the order folder so the emailed link works.
      // Cascades to the Sheet + Designs inside. Non-fatal if it fails (e.g. already shared).
      await shareFileWithUser(orderFolder.id, settings.spewEmail, 'reader').catch(err =>
        console.warn(`Could not share order folder with ${settings.spewEmail}:`, err.message)
      );

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
    const html = buildEmailHtml(orderData, settings, catalogByName);
    const plain = buildEmailPlainText(orderData, settings, catalogByName);
    const draftId = await upsertDraft(settings.spewEmail, subject, html, plain, existingDraftId || null);
    res.json({ draftId });
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('gmail.googleapis.com') && msg.includes('disabled')) {
      return res.status(500).json({ error: 'Gmail API is not enabled for this Google Cloud project. Enable it at console.developers.google.com → APIs & Services → Gmail API, then try again.' });
    }
    res.status(500).json({ error: msg });
  }
});

async function loadOrder(sheetId) {
  try {
    const meta = await readRange(sheetId, 'Sheet1!A1:B10');
    const infoMap = Object.fromEntries(meta.map(([k, v]) => [k, v]));
    const orderId = infoMap['Order ID'] || '';
    if (orderId) {
      const cached = readOrderCache(orderId);
      if (cached) return cached;
    }
  } catch { /* fall through */ }
  return readOrderFromSheet(sheetId);
}

const GMAIL_DISABLED_MSG = 'Gmail API is not enabled for this Google Cloud project. Enable it at console.developers.google.com → APIs & Services → Gmail API, then try again.';
function emailError(res, err) {
  const msg = err.message || '';
  if (msg.includes('gmail.googleapis.com') && msg.includes('disabled')) {
    return res.status(500).json({ error: GMAIL_DISABLED_MSG });
  }
  return res.status(500).json({ error: msg });
}

// Editable status-email templates (subject + body per state) + generic name.
router.get('/customer-email/templates', (_req, res) => {
  res.json(readStatusEmails());
});

router.put('/customer-email/templates', (req, res) => {
  try {
    const saved = writeStatusEmails(req.body || {});
    res.json(saved);
    // Fire-and-forget backup to the top-level Drive project folder.
    (async () => {
      try {
        await uploadFileContent('status-email-templates.json', JSON.stringify(saved, null, 2), config.DRIVE.TOP_LEVEL_FOLDER);
      } catch (e) {
        console.warn('Could not save status-email-templates.json to Drive:', e.message);
      }
    })();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rendered preview (branded HTML) for one state, using the generic name.
router.post('/customer-email/preview', async (req, res) => {
  const { sheetId, state } = req.body;
  if (!sheetId || !state) return res.status(400).json({ error: 'sheetId and state required' });
  if (!EMAIL_STATES.includes(state)) return res.status(400).json({ error: `State "${state}" does not send customer emails` });
  try {
    const order = await loadOrder(sheetId);
    const { templates, genericCustomerName } = readStatusEmails();
    const { subject, html } = buildCustomerEmail({
      state, template: templates[state], customerName: '',
      genericName: genericCustomerName, orderName: order.orderName,
      items: sampleItems(order.lineItems),
      imageSrc: '/api/assets/email_header.jpg', // browser-loadable for the on-screen preview
    });
    res.json({ subject, html });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create one personalized Gmail draft per customer for the given state.
router.post('/customer-email/draft', async (req, res) => {
  const { sheetId, state } = req.body;
  if (!sheetId || !state) return res.status(400).json({ error: 'sheetId and state required' });
  if (!EMAIL_STATES.includes(state)) return res.status(400).json({ error: `State "${state}" does not send customer emails` });
  try {
    const order = await loadOrder(sheetId);
    const customers = order.customers || [];
    if (customers.length === 0) return res.status(400).json({ error: 'No customers on this order' });
    const { templates, genericCustomerName } = readStatusEmails();
    const attachment = headerImage();
    let drafted = 0;
    for (const c of customers) {
      const { subject, html, plain } = buildCustomerEmail({
        state, template: templates[state], customerName: c.name,
        genericName: genericCustomerName, orderName: order.orderName,
        items: itemsForCustomer(order.lineItems, c.email),
      });
      await createDraft(c.email, subject, html, plain, [attachment]);
      drafted++;
    }
    res.json({ drafted });
  } catch (err) {
    emailError(res, err);
  }
});

// Send an individual email to each recipient (used by auto-send on state change).
router.post('/customer-email/send', async (req, res) => {
  const { sheetId, state, recipients } = req.body;
  if (!sheetId || !state) return res.status(400).json({ error: 'sheetId and state required' });
  if (!EMAIL_STATES.includes(state)) return res.status(400).json({ error: `State "${state}" does not send customer emails` });
  if (!Array.isArray(recipients) || recipients.length === 0) return res.status(400).json({ error: 'recipients required' });
  try {
    const order = await loadOrder(sheetId);
    const { templates, genericCustomerName } = readStatusEmails();
    const attachment = headerImage();
    const at = new Date().toISOString();
    const emails = [];

    for (const r of recipients) {
      const { subject, html, plain } = buildCustomerEmail({
        state, template: templates[state], customerName: r.name,
        genericName: genericCustomerName, orderName: order.orderName,
        items: itemsForCustomer(order.lineItems, r.email),
      });
      await sendEmail(r.email, subject, html, plain, [attachment]);
      emails.push(r.email);
    }

    order.customers = (order.customers || []).map(c => {
      if (!emails.includes(c.email)) return c;
      return { ...c, emailed: { ...(c.emailed || {}), [state]: at } };
    });

    writeOrderCache(order.orderId, order);
    await writeCustomersToSheet(sheetId, order.customers).catch(err =>
      console.warn('Could not write Customers tab:', err.message));

    res.json({ sent: emails.length, at, emails });
  } catch (err) {
    emailError(res, err);
  }
});

module.exports = router;
