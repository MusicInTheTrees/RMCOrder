const { readOrderFromSheet, writeOrderToSheet } = require('../sheets/orderSheet');

jest.mock('../sheets/client', () => ({
  readRange: jest.fn(),
  writeRange: jest.fn(),
  clearRange: jest.fn(),
  addSheet: jest.fn(),
  getSheetNames: jest.fn(() => Promise.resolve(['Sheet1', 'Line Items', 'Designs'])),
}));

const { readRange, writeRange } = require('../sheets/client');

const SAMPLE_ORDER = {
  orderId: 'RMC-001-2026-06-28',
  state: 'building',
  created: '2026-06-28',
  notes: '',
  sheetId: 'sheet123',
  lineItems: [
    {
      num: '01',
      apparelType: "Women's Round Neck",
      color: 'Black',
      sizes: {
        XS: { total: 0, inventory: 0 },
        S: { total: 0, inventory: 0 },
        M: { total: 2, inventory: 1 },
        L: { total: 1, inventory: 0 },
        XL: { total: 0, inventory: 0 },
        XXL: { total: 0, inventory: 0 },
      },
      notes: 'Curved lettering lower back',
      designs: [{ designNum: '1', file: 'bestie_bitches.png', placement: 'Front' }],
    },
  ],
};

test('writeOrderToSheet calls writeRange for all 3 tabs', async () => {
  await writeOrderToSheet('sheet123', SAMPLE_ORDER);
  const calls = writeRange.mock.calls.map(c => c[1]);
  expect(calls.some(r => r.includes('Sheet1'))).toBe(true);
  expect(calls.some(r => r.includes('Line Items'))).toBe(true);
  expect(calls.some(r => r.includes('Designs'))).toBe(true);
});

test('readOrderFromSheet parses info, line items, and designs', async () => {
  readRange.mockImplementation((_id, range) => {
    if (range.includes('Sheet1')) return Promise.resolve([
      ['Order ID', 'RMC-001-2026-06-28'],
      ['State', 'building'],
      ['Created', '2026-06-28'],
      ['Last Updated', '2026-06-28'],
      ['Notes', ''],
      ['Sheet ID', 'sheet123'],
    ]);
    if (range.includes('Line Items')) return Promise.resolve([
      ['01', "Women's Round Neck", 'Black', '0', '0', '2', '1', '0', '0', 'Curved lettering'],
      ['01-inv', '(from stock)', '', '0', '0', '1', '0', '0', '0', ''],
    ]);
    if (range.includes('Designs')) return Promise.resolve([
      ['01', '1', 'bestie_bitches.png', 'Front'],
    ]);
    return Promise.resolve([]);
  });

  const order = await readOrderFromSheet('sheet123');
  expect(order.orderId).toBe('RMC-001-2026-06-28');
  expect(order.lineItems).toHaveLength(1);
  expect(order.lineItems[0].sizes.M.total).toBe(2);
  expect(order.lineItems[0].sizes.M.inventory).toBe(1);
  expect(order.lineItems[0].designs[0].file).toBe('bestie_bitches.png');
});
