const os = require('os');
const path = require('path');
const fs = require('fs');

// Isolate the test onto a throwaway temp dir instead of the real designs-cache
// (the cleanup below unlinks every file in DESIGNS_CACHE_DIR — pointing that at
// the real cache would wipe the user's downloaded designs).
const mockCacheDir = path.join(os.tmpdir(), 'rmco-designs-cache-test');

jest.mock('../config', () => ({
  ...jest.requireActual('../config'),
  DESIGNS_CACHE_DIR: mockCacheDir,
}));

const { listCachedDesigns } = require('../drive/designsCache');
const config = require('../config');

beforeEach(() => {
  fs.rmSync(config.DESIGNS_CACHE_DIR, { recursive: true, force: true });
  fs.mkdirSync(config.DESIGNS_CACHE_DIR, { recursive: true });
});

afterAll(() => {
  fs.rmSync(config.DESIGNS_CACHE_DIR, { recursive: true, force: true });
});

test('listCachedDesigns returns empty array when cache dir is empty', () => {
  expect(listCachedDesigns()).toEqual([]);
});

test('listCachedDesigns returns image files with relative url', () => {
  fs.writeFileSync(path.join(config.DESIGNS_CACHE_DIR, 'test.png'), 'fake');
  fs.writeFileSync(path.join(config.DESIGNS_CACHE_DIR, 'other.txt'), 'fake');
  const designs = listCachedDesigns();
  expect(designs).toHaveLength(1);
  expect(designs[0].name).toBe('test.png');
  // Relative so the app works from any host (LAN devices), via the Vite proxy in dev.
  expect(designs[0].url).toBe('/designs-cache/test.png');
});
