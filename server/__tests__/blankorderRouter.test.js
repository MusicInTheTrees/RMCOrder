jest.mock('../middleware/requireAuth', () => (req, res, next) => next());
jest.mock('../items/store', () => ({
  readCatalog: () => ({ items: [
    { id: 'i1', name: 'Unisex Shirt', stockBlanks: true },
    { id: 'i2', name: 'Sticker', stockBlanks: false },
  ] }),
}));

const request = require('supertest');
const express = require('express');
const router = require('../blankorder/router');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/blankorder', router);

const QTY = 'Current Quantity Rocky Meowtain Company LLC';
const header = `Token,Item Name,Variation Name,SKU,Option Value 1,Option Value 2,Price,${QTY}`;
const csvOld = `${header}\nT1,Shirt | UM | Logo,,W1,Black,L,$25.00,20`;
const csvNew = `${header}\nT1,Shirt | UM | Logo,,W1,Black,L,$25.00,8`;

describe('POST /blankorder/plan', () => {
  test('returns industry + blended plans summing to the total', async () => {
    const res = await request(app).post('/blankorder/plan').send({
      csvOld, csvNew, grandTotal: 12, perTypeTotals: {}, perTypeSizeRestrictions: {},
    });
    expect(res.status).toBe(200);
    const sum = res.body.industry.reduce((s, r) => s + r.qty, 0);
    expect(sum).toBe(12);
    expect(res.body.blended.reduce((s, r) => s + r.qty, 0)).toBe(12);
    expect(res.body.effectiveTotal).toBe(12);
    expect(res.body.feedMeta).toBeDefined();
  });
  test('400 when CSVs are missing', async () => {
    const res = await request(app).post('/blankorder/plan').send({ grandTotal: 12 });
    expect(res.status).toBe(400);
  });
  test('accepts a pre-built feed instead of CSVs', async () => {
    const feed = { meta: { totalUnits: 12 }, velocity: [
      { itemType: 'Shirt', style: 'UM', color: 'Black', size: 'L', unitsSold: 12, isApparel: true },
    ] };
    const res = await request(app).post('/blankorder/plan').send({
      feed, grandTotal: 12, perTypeTotals: {}, perTypeSizeRestrictions: {},
    });
    expect(res.status).toBe(200);
    expect(res.body.industry.reduce((s, r) => s + r.qty, 0)).toBe(12);
  });
});

describe('GET /blankorder/config', () => {
  test('returns config and only stockBlanks item types', async () => {
    const res = await request(app).get('/blankorder/config');
    expect(res.status).toBe(200);
    expect(res.body.stockBlankItems).toEqual([{ id: 'i1', name: 'Unisex Shirt' }]);
    expect(res.body.config.blendWeight).toBeDefined();
  });
});
