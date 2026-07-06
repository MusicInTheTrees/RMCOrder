const fs = require('fs');
const path = require('path');
const config = require('../config');
const { readAllOrderCaches } = require('../orders/cache');

const SEEDED = ['ZZTEST-001.json', 'ZZTEST-002.json', 'ZZTEST-bad.json'];

beforeAll(() => {
  fs.mkdirSync(config.ORDERS_CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(config.ORDERS_CACHE_DIR, 'ZZTEST-001.json'),
    JSON.stringify({ orderId: 'ZZTEST-001', state: 'sent' }));
  fs.writeFileSync(path.join(config.ORDERS_CACHE_DIR, 'ZZTEST-002.json'),
    JSON.stringify({ orderId: 'ZZTEST-002', state: 'building' }));
  fs.writeFileSync(path.join(config.ORDERS_CACHE_DIR, 'ZZTEST-bad.json'), '{ not valid json');
});

afterAll(() => {
  for (const f of SEEDED) {
    const p = path.join(config.ORDERS_CACHE_DIR, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

test('reads all parseable caches and skips corrupt files', () => {
  const all = readAllOrderCaches();
  const seeded = all.filter(o => o.orderId && o.orderId.startsWith('ZZTEST-'));
  expect(seeded.map(o => o.orderId).sort()).toEqual(['ZZTEST-001', 'ZZTEST-002']);
});
