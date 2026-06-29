const { writeOrderToSheet, readOrderFromSheet } = require('../sheets/orderSheet');

// Mock the sheets client
jest.mock('../sheets/client', () => ({
  readRange: jest.fn(),
  writeRange: jest.fn(),
  clearRange: jest.fn(),
  addSheet: jest.fn(),
  getSheetNames: jest.fn().mockResolvedValue(['Sheet1', 'Line Items', 'Designs']),
}));

const { readRange, writeRange, clearRange } = require('../sheets/client');

test('writeOrderToSheet writes compact sizes and methods', async () => {
  clearRange.mockResolvedValue();
  writeRange.mockResolvedValue();

  const order = {
    orderId: 'RMC-001-2026-06-28',
    orderName: 'Summer Drop',
    state: 'building',
    created: '2026-06-28',
    notes: 'All DTG',
    sheetId: 'sheet123',
    lineItems: [{
      num: '01',
      itemTypeId: 'abc',
      itemTypeName: 'Unisex Tee',
      color: 'White',
      sizes: { M: { total: 5, inventory: 0 }, L: { total: 3, inventory: 1 } },
      frontMethod: 'DTF',
      frontNotes: 'chest center',
      frontDesigns: [{ designNum: '1', file: 'logo.png' }],
      backMethod: '',
      backNotes: '',
      backDesigns: [],
    }],
  };

  await writeOrderToSheet('sheet123', order);

  // Find the Line Items writeRange call
  const liCall = writeRange.mock.calls.find(c => c[1].startsWith('Line Items'));
  const rows = liCall[2];
  expect(rows[0]).toEqual(['#', 'Item Type', 'Color', 'Sizes', 'Front Method', 'Front Notes', 'Back Method', 'Back Notes']);
  expect(rows[1][0]).toBe('01');
  expect(rows[1][1]).toBe('Unisex Tee');
  expect(rows[1][3]).toBe('M×5, L×3');
  expect(rows[1][4]).toBe('DTF');
});

test('readOrderFromSheet reads new format', async () => {
  readRange.mockImplementation((sheetId, range) => {
    if (range.startsWith('Sheet1')) return Promise.resolve([
      ['Order ID', 'RMC-001'],
      ['Order Name', 'Test'],
      ['State', 'building'],
      ['Created', '2026-06-28'],
      ['Last Updated', '2026-06-28'],
      ['Notes', 'Global note'],
      ['Sheet ID', 'sheet123'],
    ]);
    if (range.startsWith('Line Items')) return Promise.resolve([
      ['#', 'Item Type', 'Color', 'Sizes', 'Front Method', 'Front Notes', 'Back Method', 'Back Notes'],
      ['01', 'Unisex Tee', 'White', 'M×5, L×3', 'DTF', 'chest', '', ''],
    ]);
    if (range.startsWith('Designs')) return Promise.resolve([]);
    return Promise.resolve([]);
  });

  const order = await readOrderFromSheet('sheet123');
  expect(order.lineItems[0].itemTypeName).toBe('Unisex Tee');
  expect(order.lineItems[0].sizes).toEqual({ M: { total: 5, inventory: 0 }, L: { total: 3, inventory: 0 } });
  expect(order.lineItems[0].frontMethod).toBe('DTF');
  expect(order.notes).toBe('Global note');
});

test('readOrderFromSheet reads legacy format with inventory', async () => {
  readRange.mockImplementation((sheetId, range) => {
    if (range.startsWith('Sheet1')) return Promise.resolve([
      ['Order ID', 'RMC-001'],
      ['Order Name', 'Legacy'],
      ['State', 'building'],
      ['Created', '2026-06-28'],
      ['Last Updated', '2026-06-28'],
      ['Notes', ''],
      ['Sheet ID', 'sheet123'],
    ]);
    if (range.startsWith('Line Items')) return Promise.resolve([
      ['#', 'Apparel Type', 'Color', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'Front Notes', 'Back Notes'],
      ['01', 'Youth', 'White', '0', '0', '5', '3', '0', '0', '', ''],
      ['01-inv', '', '', '0', '0', '2', '1', '0', '0', '', ''],
    ]);
    if (range.startsWith('Designs')) return Promise.resolve([]);
    return Promise.resolve([]);
  });

  const order = await readOrderFromSheet('sheet123');
  expect(order.lineItems[0].apparelType).toBe('Youth');
  expect(order.lineItems[0].sizes.M.total).toBe(5);
  expect(order.lineItems[0].sizes.M.inventory).toBe(2);
  expect(order.lineItems[0].sizes.L.inventory).toBe(1);
});
