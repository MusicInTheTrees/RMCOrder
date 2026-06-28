const express = require('express');
const { readSettings, writeSettings } = require('./store');

const router = express.Router();

router.get('/', (_req, res) => res.json(readSettings()));

router.put('/', (req, res) => {
  const { brandName, spewEmail } = req.body;
  writeSettings({ brandName, spewEmail });
  res.json({ ok: true });
});

module.exports = router;
