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
    await downloadFile(file.id, destPath);
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
      url: `http://localhost:${config.PORT}/designs-cache/${name}`,
    }));
}

module.exports = { syncDesignsCache, listCachedDesigns };
