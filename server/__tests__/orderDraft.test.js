const request = require('supertest');

jest.mock('../auth/oauth', () => ({
  loadTokens: () => ({ refresh_token: 'x' }),
  getOAuth2Client: () => ({}),
}));
jest.mock('../gmail/client', () => ({
  upsertDraft: jest.fn().mockResolvedValue('draft-123'),
  sendEmail: jest.fn(),
  createDraft: jest.fn(),
}));
jest.mock('../sheets/client', () => ({
  readRange: jest.fn().mockResolvedValue([['Order ID', 'RMC-050'], ['Sheet ID', 's']]),
  writeRange: jest.fn(), clearRange: jest.fn(), addSheet: jest.fn(),
  getSheetNames: jest.fn().mockResolvedValue(['Sheet1', 'Line Items', 'Designs', 'Customers']),
}));
jest.mock('../orders/cache', () => ({
  readOrderCache: jest.fn(), writeOrderCache: jest.fn(), deleteOrderCache: jest.fn(),
}));
jest.mock('../settings/store', () => ({
  readSettings: jest.fn().mockReturnValue({ spewEmail: 'spew@print.com' }),
  writeSettings: jest.fn(),
}));
jest.mock('../items/store', () => ({
  readCatalog: jest.fn().mockReturnValue({ items: [] }),
}));
jest.mock('../drive/client', () => ({
  listFiles: jest.fn(), findFileByName: jest.fn(), findFolderByName: jest.fn(),
  copyFile: jest.fn(), shareFileWithUser: jest.fn().mockResolvedValue(),
  uploadFileContent: jest.fn().mockResolvedValue('id'),
}));

const { upsertDraft } = require('../gmail/client');
const { readOrderCache } = require('../orders/cache');
const { listFiles, findFileByName, findFolderByName, copyFile } = require('../drive/client');

const ORDER = {
  orderId: 'RMC-050', orderName: 'Summer Drop', sheetId: 's', state: 'building',
  lineItems: [
    {
      num: '01', itemTypeName: 'Tee', color: 'Black', sizes: {},
      frontDesigns: [{ designNum: '1', file: 'logo.png' }],
      backDesigns: [{ designNum: '2', file: 'back.png' }],
    },
    {
      num: '02', itemTypeName: 'Tote', color: 'Natural', sizes: {},
      frontDesigns: [{ designNum: '1', file: 'logo.png' }], // duplicate design
      backDesigns: [],
    },
  ],
};

function getApp() { return require('../index'); }

beforeEach(() => {
  jest.clearAllMocks();
  readOrderCache.mockReturnValue(JSON.parse(JSON.stringify(ORDER)));
  upsertDraft.mockResolvedValue('draft-123');
  findFileByName.mockResolvedValue({ id: 'order-folder' });
  findFolderByName.mockResolvedValue({ id: 'designs-folder' });
  listFiles.mockResolvedValue([
    { name: 'logo.png', id: 'src-logo' },
    { name: 'back.png', id: 'src-back' },
  ]);
  copyFile.mockResolvedValue({ id: 'copy' });
});

test('draft copies each unique design once with numbered name and returns draftId', async () => {
  const res = await request(getApp()).post('/gmail/draft').send({ sheetId: 's' });
  expect(res.status).toBe(200);
  expect(res.body.draftId).toBe('draft-123');
  expect(copyFile).toHaveBeenCalledTimes(2); // logo.png deduped
  const names = copyFile.mock.calls.map(c => c[1]).sort();
  expect(names).toEqual(['01-logo.png', '02-back.png']);
});

test('draft copies design files concurrently, not one at a time', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  copyFile.mockImplementation(async () => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise(r => setTimeout(r, 10));
    inFlight--;
    return { id: 'copy' };
  });

  await request(getApp()).post('/gmail/draft').send({ sheetId: 's' });
  expect(maxInFlight).toBeGreaterThan(1);
});

test('draft 400s when spew email is not configured', async () => {
  const { readSettings } = require('../settings/store');
  readSettings.mockReturnValueOnce({});
  const res = await request(getApp()).post('/gmail/draft').send({ sheetId: 's' });
  expect(res.status).toBe(400);
});
