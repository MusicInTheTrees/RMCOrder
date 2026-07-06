const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const { readSettings, writeSettings } = require('./store');

const router = express.Router();
const REPO_ROOT = path.join(__dirname, '..', '..');

router.get('/', (_req, res) => res.json(readSettings()));

router.put('/', (req, res) => {
  writeSettings({ ...readSettings(), ...req.body });
  res.json({ ok: true });
});

router.post('/update', (req, res) => {
  const run = (cmd, cwd) => new Promise((resolve, reject) => {
    exec(cmd, { cwd, timeout: 120000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve((stdout + (stderr ? `\n${stderr}` : '')).trim());
    });
  });

  (async () => {
    try {
      await run('git --version', REPO_ROOT);
    } catch {
      return res.status(500).json({ error: 'Git is not installed. Run setup.bat to install it, then try again.' });
    }

    const lines = [];
    try {
      lines.push('$ git pull');
      lines.push(await run('git pull', REPO_ROOT));

      lines.push('$ npm install (frontend)');
      lines.push(await run('npm install --prefer-offline', REPO_ROOT));

      lines.push('$ npm install (backend)');
      lines.push(await run('npm install --prefer-offline', path.join(REPO_ROOT, 'server')));

      res.json({ ok: true, log: lines.join('\n') });
    } catch (err) {
      lines.push(`ERROR: ${err.message}`);
      res.status(500).json({ error: err.message, log: lines.join('\n') });
    }
  })();
});

module.exports = router;
