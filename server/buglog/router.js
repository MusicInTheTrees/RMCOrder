const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { uploadFileContent, downloadFileContent, findFileByName } = require('../drive/client');
const config = require('../config');

const router = express.Router();
router.use(requireAuth);

const LOG_FILE = 'bug-log.json';

async function readLog() {
  const file = await findFileByName(LOG_FILE, config.DRIVE.TOP_LEVEL_FOLDER);
  if (!file) return [];
  const text = await downloadFileContent(file.id);
  try { return JSON.parse(text); } catch { return []; }
}

async function writeLog(entries) {
  await uploadFileContent(LOG_FILE, JSON.stringify(entries, null, 2), config.DRIVE.TOP_LEVEL_FOLDER);
}

router.get('/', async (_req, res) => {
  try {
    res.json(await readLog());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/append', async (req, res) => {
  try {
    const entry = req.body;
    const entries = await readLog();
    entries.push(entry);
    await writeLog(entries);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/', async (_req, res) => {
  try {
    await writeLog([]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
