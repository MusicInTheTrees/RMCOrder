const express = require('express');
const { createId } = require('@paralleldrive/cuid2');
const requireAuth = require('../middleware/requireAuth');
const { readCatalog, writeCatalog } = require('./store');

const router = express.Router();
router.use(requireAuth);

router.get('/', (_req, res) => {
  res.json(readCatalog());
});

router.post('/', (req, res) => {
  const { name = 'New Item' } = req.body;
  const catalog = readCatalog();
  const item = { id: createId(), name, supplierUrl: '', colors: [], sizes: [], decorationMethods: [] };
  catalog.items.push(item);
  writeCatalog(catalog);
  res.json(item);
});

// push and pull routes must come before /:id to avoid capture
router.post('/push', async (req, res) => {
  res.status(501).json({ error: 'Not implemented — see Task 2' });
});

router.post('/pull', async (req, res) => {
  res.status(501).json({ error: 'Not implemented — see Task 2' });
});

router.put('/:id', (req, res) => {
  const catalog = readCatalog();
  const idx = catalog.items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Item not found' });
  catalog.items[idx] = { ...req.body, id: req.params.id };
  writeCatalog(catalog);
  res.json(catalog.items[idx]);
});

router.delete('/:id', (req, res) => {
  const catalog = readCatalog();
  const before = catalog.items.length;
  catalog.items = catalog.items.filter(i => i.id !== req.params.id);
  if (catalog.items.length === before) return res.status(404).json({ error: 'Item not found' });
  writeCatalog(catalog);
  res.json({ ok: true });
});

router.post('/:id/scrape-colors', async (req, res) => {
  res.status(501).json({ error: 'Not implemented — see Task 3' });
});

module.exports = router;
