const fs = require('fs');
const path = require('path');
const config = require('../config');

function cacheFilePath(orderId) {
  return path.join(config.ORDERS_CACHE_DIR, `${orderId}.json`);
}

function writeOrderCache(orderId, data) {
  fs.mkdirSync(config.ORDERS_CACHE_DIR, { recursive: true });
  fs.writeFileSync(cacheFilePath(orderId), JSON.stringify(data, null, 2));
}

function readOrderCache(orderId) {
  const p = cacheFilePath(orderId);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function deleteOrderCache(orderId) {
  const p = cacheFilePath(orderId);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

module.exports = { writeOrderCache, readOrderCache, deleteOrderCache };
