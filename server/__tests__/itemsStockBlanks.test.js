const request = require('supertest');

jest.mock('../auth/oauth', () => ({
  loadTokens: () => ({ refresh_token: 'x' }),
  getOAuth2Client: () => ({}),
}));
jest.mock('../items/store', () => {
  let catalog = { items: [] };
  return {
    readCatalog: jest.fn(() => catalog),
    writeCatalog: jest.fn(c => { catalog = c; }),
  };
});

function getApp() { return require('../index'); }
beforeEach(() => jest.clearAllMocks());

test('POST /items creates an item with stockBlanks false by default', async () => {
  const res = await request(getApp()).post('/items').send({ name: 'Unisex Tee' });
  expect(res.status).toBe(200);
  expect(res.body.stockBlanks).toBe(false);
});
