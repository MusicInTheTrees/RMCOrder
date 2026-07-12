jest.mock('../middleware/requireAuth', () => (req, res, next) => next());
jest.mock('../sheets/client', () => ({
  readRange: jest.fn(),
  batchWriteRanges: jest.fn(),
}));

const request = require('supertest');
const express = require('express');
const { readRange, batchWriteRanges } = require('../sheets/client');
const router = require('../inventory/router');

const app = express();
app.use(express.json());
app.use('/inventory', router);

// Sheet rows (A2 onward): In Stock | Item | Color | Style | Size
const ROWS = [
  ['10', 'shirt', 'black', 'unisex', 'M'],
  ['4',  'shirt', 'black', 'unisex', 'L'],
  ['7',  'tote',  'natural', '', 'OS'],
];

beforeEach(() => {
  jest.clearAllMocks();
  readRange.mockResolvedValue(ROWS.map(r => [...r]));
  batchWriteRanges.mockResolvedValue();
});

test('GET /inventory returns parsed rows', async () => {
  const res = await request(app).get('/inventory');
  expect(res.status).toBe(200);
  expect(res.body[0]).toEqual({ inStock: 10, item: 'shirt', color: 'black', style: 'unisex', size: 'M' });
});

test('decrement updates all matched rows in a single batch write', async () => {
  const res = await request(app).post('/inventory/decrement').send([
    { item: 'Shirt', color: 'Black', style: 'Unisex', size: 'M', qty: 3 },
    { item: 'Shirt', color: 'Black', style: 'Unisex', size: 'L', qty: 1 },
  ]);
  expect(res.status).toBe(200);
  expect(res.body.updated).toBe(2);
  expect(batchWriteRanges).toHaveBeenCalledTimes(1);
  const data = batchWriteRanges.mock.calls[0][1];
  expect(data).toContainEqual({ range: 'A2', values: [['7']] });
  expect(data).toContainEqual({ range: 'A3', values: [['3']] });
});

test('decrement touches only the first matching row when duplicates exist', async () => {
  readRange.mockResolvedValue([
    ['10', 'shirt', 'black', 'unisex', 'M'],
    ['5',  'shirt', 'black', 'unisex', 'M'], // duplicate row
  ]);
  const res = await request(app).post('/inventory/decrement').send([
    { item: 'shirt', color: 'black', style: 'unisex', size: 'M', qty: 2 },
  ]);
  expect(res.body.updated).toBe(1);
  const data = batchWriteRanges.mock.calls[0][1];
  expect(data).toEqual([{ range: 'A2', values: [['8']] }]);
});

test('decrement clamps at zero and reports the shortfall', async () => {
  const res = await request(app).post('/inventory/decrement').send([
    { item: 'shirt', color: 'black', style: 'unisex', size: 'L', qty: 9 },
  ]);
  expect(res.body.updated).toBe(1);
  expect(res.body.shortfalls).toEqual([
    { item: 'shirt', color: 'black', style: 'unisex', size: 'L', requested: 9, applied: 4, shortfall: 5 },
  ]);
  const data = batchWriteRanges.mock.calls[0][1];
  expect(data).toEqual([{ range: 'A3', values: [['0']] }]);
});

test('decrement writes to correct sheet rows when the sheet has blank rows', async () => {
  readRange.mockResolvedValue([
    ['10', 'shirt', 'black', 'unisex', 'M'],
    [],                                       // blank row in the sheet
    ['4', 'shirt', 'black', 'unisex', 'L'],
  ]);
  await request(app).post('/inventory/decrement').send([
    { item: 'shirt', color: 'black', style: 'unisex', size: 'L', qty: 1 },
  ]);
  const data = batchWriteRanges.mock.calls[0][1];
  expect(data).toEqual([{ range: 'A4', values: [['3']] }]); // row 4, not row 3
});

test('increment updates existing rows and appends new ones in a single batch write', async () => {
  const res = await request(app).post('/inventory/increment').send([
    { item: 'shirt', color: 'black', style: 'unisex', size: 'M', qty: 5 },
    { item: 'hat', color: 'red', style: '', size: 'OS', qty: 2 },
  ]);
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ updated: 1, added: 1 });
  expect(batchWriteRanges).toHaveBeenCalledTimes(1);
  const data = batchWriteRanges.mock.calls[0][1];
  expect(data).toContainEqual({ range: 'A2', values: [['15']] });
  expect(data).toContainEqual({ range: 'A5', values: [['2', 'hat', 'red', '', 'OS']] });
});

test('increment accumulates two increments to the same row', async () => {
  await request(app).post('/inventory/increment').send([
    { item: 'shirt', color: 'black', style: 'unisex', size: 'M', qty: 2 },
    { item: 'shirt', color: 'black', style: 'unisex', size: 'M', qty: 3 },
  ]);
  const data = batchWriteRanges.mock.calls[0][1];
  expect(data[data.length - 1]).toEqual({ range: 'A2', values: [['15']] });
});
