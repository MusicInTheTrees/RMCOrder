const fs = require('fs');
const path = require('path');
const config = require('../config');
const { listFiles, downloadFile } = require('./client');

const IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];

async function syncDesignsCache() {
  fs.mkdirSync(config.DESIGNS_CACHE_DIR, { recursive: true });
  const files = await listFiles(config.DRIVE.DESIGN_SOURCE);
  const images = files.filter(f => IMAGE_MIME_TYPES.includes(f.mimeType));

  for (const file of images) {
    const destPath = path.join(config.DESIGNS_CACHE_DIR, file.name);
    const driveMtime = new Date(file.modifiedTime || NaN).getTime();
    if (driveMtime && fs.existsSync(destPath) && fs.statSync(destPath).mtimeMs >= driveMtime) {
      continue;
    }
    await downloadFile(file.id, destPath);
    // Stamp the local copy with Drive's modifiedTime so future syncs can skip it.
    if (driveMtime) fs.utimesSync(destPath, new Date(), new Date(driveMtime));
  }

  return images.length;
}

function listCachedDesigns() {
  if (!fs.existsSync(config.DESIGNS_CACHE_DIR)) return [];
  return fs
    .readdirSync(config.DESIGNS_CACHE_DIR)
    .filter(name => /\.(png|jpe?g|gif|webp|svg)$/i.test(name))
    .map(name => ({
      name,
      // Relative so the app works from any host; Vite proxies /designs-cache in dev.
      url: `/designs-cache/${name}`,
    }));
}

module.exports = { syncDesignsCache, listCachedDesigns };
