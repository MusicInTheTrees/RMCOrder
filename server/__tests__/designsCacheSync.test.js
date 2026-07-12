const os = require('os');
const path = require('path');
const fs = require('fs');

// Throwaway temp dir — never point tests at the real designs-cache.
const mockCacheDir = path.join(os.tmpdir(), 'rmco-designs-sync-test');

jest.mock('../config', () => ({
  ...jest.requireActual('../config'),
  DESIGNS_CACHE_DIR: mockCacheDir,
}));

jest.mock('../drive/client', () => ({
  listFiles: jest.fn(),
  downloadFile: jest.fn(),
}));

const { listFiles, downloadFile } = require('../drive/client');
const { syncDesignsCache } = require('../drive/designsCache');
const config = require('../config');

const OLD = '2026-01-01T00:00:00.000Z';
const NEW = '2026-07-01T00:00:00.000Z';

function driveFile(name, modifiedTime) {
  return { id: `id-${name}`, name, mimeType: 'image/png', modifiedTime };
}

beforeEach(() => {
  fs.rmSync(config.DESIGNS_CACHE_DIR, { recursive: true, force: true });
  fs.mkdirSync(config.DESIGNS_CACHE_DIR, { recursive: true });
  downloadFile.mockReset();
  downloadFile.mockImplementation(async (_id, dest) => fs.writeFileSync(dest, 'img'));
  listFiles.mockReset();
});

afterAll(() => {
  fs.rmSync(config.DESIGNS_CACHE_DIR, { recursive: true, force: true });
});

test('downloads files missing from the local cache', async () => {
  listFiles.mockResolvedValue([driveFile('a.png', OLD), driveFile('b.png', OLD)]);
  const count = await syncDesignsCache();
  expect(count).toBe(2);
  expect(downloadFile).toHaveBeenCalledTimes(2);
  expect(fs.existsSync(path.join(config.DESIGNS_CACHE_DIR, 'a.png'))).toBe(true);
});

test('skips files whose local copy is already up to date', async () => {
  listFiles.mockResolvedValue([driveFile('a.png', OLD)]);
  await syncDesignsCache();
  downloadFile.mockClear();

  await syncDesignsCache();
  expect(downloadFile).not.toHaveBeenCalled();
});

test('re-downloads a file when the Drive copy is newer', async () => {
  listFiles.mockResolvedValue([driveFile('a.png', OLD)]);
  await syncDesignsCache();
  downloadFile.mockClear();

  listFiles.mockResolvedValue([driveFile('a.png', NEW)]);
  await syncDesignsCache();
  expect(downloadFile).toHaveBeenCalledTimes(1);
});

test('always downloads when Drive gives no modifiedTime', async () => {
  listFiles.mockResolvedValue([driveFile('a.png', undefined)]);
  await syncDesignsCache();
  downloadFile.mockClear();

  await syncDesignsCache();
  expect(downloadFile).toHaveBeenCalledTimes(1);
});
