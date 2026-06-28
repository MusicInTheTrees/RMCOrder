const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { syncDesignsCache, listCachedDesigns } = require('./designsCache');

const router = express.Router();
router.use(requireAuth);

router.post('/designs/refresh', async (_req, res) => {
  try {
    const count = await syncDesignsCache();
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/designs', (_req, res) => {
  res.json(listCachedDesigns());
});

module.exports = router;
