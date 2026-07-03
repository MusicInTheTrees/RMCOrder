const request = require('supertest');

jest.mock('../auth/oauth', () => ({
  loadTokens: () => ({ refresh_token: 'x' }),
  getOAuth2Client: () => ({}),
}));
jest.mock('../drive/client', () => ({
  listFiles: jest.fn(),
  findFileByName: jest.fn(),
  downloadFileContent: jest.fn(),
  createFolder: jest.fn(),
  createSpreadsheet: jest.fn(),
  trashFile: jest.fn(),
  uploadFileContent: jest.fn(),
  findFolderByName: jest.fn(),
  copyFile: jest.fn(),
  shareFileWithUser: jest.fn(),
}));
jest.mock('../orders/cache', () => ({
  readOrderCache: jest.fn(),
  writeOrderCache: jest.fn(),
  deleteOrderCache: jest.fn(),
}));

const { listFiles, findFileByName, downloadFileContent } = require('../drive/client');
const { readOrderCache, writeOrderCache } = require('../orders/cache');

function getApp() { return require('../index'); }

beforeEach(() => jest.clearAllMocks());

test('GET /orders recovers sheetId from Drive order.json when local cache is missing', async () => {
  listFiles.mockResolvedValue([
    { id: 'folderA', name: 'RMC-001-2026-06-29' },
    { id: 'folderB', name: 'RMC-002-2026-06-30' },
  ]);
  readOrderCache.mockImplementation(id => id === 'RMC-001-2026-06-29'
    ? { orderId: id, sheetId: 'sheetA', state: 'sent', created: '2026-06-29', orderName: 'Fake Test Order' }
    : null);
  findFileByName.mockImplementation(name => (name === 'order.json' ? { id: 'jsonB' } : null));
  downloadFileContent.mockResolvedValue(JSON.stringify({
    orderId: 'RMC-002-2026-06-30', sheetId: 'sheetB', state: 'building', created: '2026-06-30', orderName: '',
  }));

  const res = await request(getApp()).get('/orders');
  expect(res.status).toBe(200);
  const b = res.body.find(o => o.orderId === 'RMC-002-2026-06-30');
  expect(b.sheetId).toBe('sheetB'); // previously null — the bug
  expect(b.state).toBe('building');
  expect(writeOrderCache).toHaveBeenCalledWith('RMC-002-2026-06-30', expect.objectContaining({ sheetId: 'sheetB' }));
});

test('GET /orders locates the Sheet by name when there is no order.json', async () => {
  listFiles.mockResolvedValue([{ id: 'folderC', name: 'RMC-003-2026-07-01' }]);
  readOrderCache.mockReturnValue(null);
  findFileByName.mockImplementation(name => (name === 'RMC-003-2026-07-01 Order' ? { id: 'sheetC' } : null));

  const res = await request(getApp()).get('/orders');
  const c = res.body.find(o => o.orderId === 'RMC-003-2026-07-01');
  expect(c.sheetId).toBe('sheetC');
  expect(downloadFileContent).not.toHaveBeenCalled();
});

test('GET /orders leaves sheetId null when nothing is recoverable', async () => {
  listFiles.mockResolvedValue([{ id: 'folderD', name: 'RMC-004-2026-07-02' }]);
  readOrderCache.mockReturnValue(null);
  findFileByName.mockResolvedValue(null);

  const res = await request(getApp()).get('/orders');
  const d = res.body.find(o => o.orderId === 'RMC-004-2026-07-02');
  expect(d.sheetId).toBeNull();
  expect(writeOrderCache).not.toHaveBeenCalled();
});
