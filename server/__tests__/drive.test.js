const { listCachedDesigns } = require('../drive/designsCache');
const fs = require('fs');
const path = require('path');
const config = require('../config');

beforeEach(() => {
  fs.mkdirSync(config.DESIGNS_CACHE_DIR, { recursive: true });
});

afterEach(() => {
  if (fs.existsSync(config.DESIGNS_CACHE_DIR)) {
    fs.readdirSync(config.DESIGNS_CACHE_DIR).forEach(f =>
      fs.unlinkSync(path.join(config.DESIGNS_CACHE_DIR, f))
    );
  }
});

test('listCachedDesigns returns empty array when cache dir is empty', () => {
  expect(listCachedDesigns()).toEqual([]);
});

test('listCachedDesigns returns image files with url', () => {
  fs.writeFileSync(path.join(config.DESIGNS_CACHE_DIR, 'test.png'), 'fake');
  fs.writeFileSync(path.join(config.DESIGNS_CACHE_DIR, 'other.txt'), 'fake');
  const designs = listCachedDesigns();
  expect(designs).toHaveLength(1);
  expect(designs[0].name).toBe('test.png');
  expect(designs[0].url).toContain('test.png');
  expect(designs[0].url).toContain('3001');
});
