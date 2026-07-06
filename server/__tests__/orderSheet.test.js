const { writeOrderToSheet, readOrderFromSheet, writeCustomersToSheet, EMAIL_STATES } = require('../sheets/orderSheet');

// Mock the sheets client
jest.mock('../sheets/client', () => ({
  readRange: jest.fn(),
  writeRange: jest.fn(),
  clearRange: jest.fn(),
  addSheet: jest.fn(),
  getSheetNames: jest.fn().mockResolvedValue(['Sheet1', 'Line Items', 'Designs', 'Customers']),
}));

const { readRange, writeRange, clearRange } = require('../sheets/client');

beforeEach(() => {
  jest.clearAllMocks();
  writeRange.mockResolvedValue();
  readRange.mockResolvedValue();
  clearRange.mockResolvedValue();
});

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
  const liCall = writeRange.mock.calls.find(c => c[1].includes('Line Items'));
  const rows = liCall[2];
  expect(rows[0]).toEqual(['#', 'Item Type', 'Color', 'Sizes', 'Front Method', 'Front Notes', 'Back Method', 'Back Notes', 'Item Type ID']);
  expect(rows[1][0]).toBe('01');
  expect(rows[1][1]).toBe('Unisex Tee');
  expect(rows[1][3]).toBe('M×5, L×3');
  expect(rows[1][4]).toBe('DTF');
  expect(rows[1][8]).toBe('abc'); // itemTypeId in column I
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
    if (range.includes('Line Items')) return Promise.resolve([
      ['#', 'Item Type', 'Color', 'Sizes', 'Front Method', 'Front Notes', 'Back Method', 'Back Notes', 'Item Type ID'],
      ['01', 'Unisex Tee', 'White', 'M×5, L×3', 'DTF', 'chest', '', '', 'type-abc'],
    ]);
    if (range.startsWith('Designs')) return Promise.resolve([]);
    return Promise.resolve([]);
  });

  const order = await readOrderFromSheet('sheet123');
  expect(order.lineItems[0].itemTypeName).toBe('Unisex Tee');
  expect(order.lineItems[0].itemTypeId).toBe('type-abc');
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
    if (range.includes('Line Items')) return Promise.resolve([
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

test('EMAIL_STATES is the agreed set', () => {
  expect(EMAIL_STATES).toEqual(['sent', 'fulfilled', 'received', 'shipped']);
});

test('writeOrderToSheet writes the Customers tab', async () => {
  clearRange.mockResolvedValue();
  writeRange.mockResolvedValue();
  const order = {
    orderId: 'RMC-002-2026-07-03', orderName: 'Drop', state: 'building',
    created: '2026-07-03', notes: '', sheetId: 's', lineItems: [],
    customers: [
      { name: 'Jordan', email: 'jordan@x.com', emailed: { sent: '2026-07-03T00:00:00Z' } },
      { name: '', email: 'sam@x.com', emailed: {} },
    ],
  };
  await writeOrderToSheet('s', order);
  const call = writeRange.mock.calls.find(c => c[1].includes('Customers'));
  expect(call).toBeTruthy();
  const rows = call[2];
  expect(rows[0]).toEqual(['Name', 'Email', 'Sent: sent', 'Sent: fulfilled', 'Sent: received', 'Sent: shipped']);
  expect(rows[1]).toEqual(['Jordan', 'jordan@x.com', '2026-07-03T00:00:00Z', '', '', '']);
  expect(rows[2]).toEqual(['', 'sam@x.com', '', '', '', '']);
});

test('readOrderFromSheet reads the Customers tab', async () => {
  readRange.mockImplementation((sheetId, range) => {
    if (range.startsWith('Sheet1')) return Promise.resolve([
      ['Order ID', 'RMC-002'], ['State', 'sent'], ['Sheet ID', 's'],
    ]);
    if (range.includes('Line Items')) return Promise.resolve([
      ['#', 'Item Type', 'Color', 'Sizes', 'Front Method', 'Front Notes', 'Back Method', 'Back Notes', 'Item Type ID'],
    ]);
    if (range.startsWith('Designs')) return Promise.resolve([]);
    if (range.startsWith('Customers')) return Promise.resolve([
      ['Name', 'Email', 'Sent: sent', 'Sent: fulfilled', 'Sent: received', 'Sent: shipped'],
      ['Jordan', 'jordan@x.com', '2026-07-03T00:00:00Z', '', '', ''],
    ]);
    return Promise.resolve([]);
  });
  const order = await readOrderFromSheet('s');
  expect(order.customers).toEqual([
    { name: 'Jordan', email: 'jordan@x.com', emailed: { sent: '2026-07-03T00:00:00Z', fulfilled: '', received: '', shipped: '' } },
  ]);
});

test('readOrderFromSheet defaults customers to [] when tab missing', async () => {
  readRange.mockImplementation((sheetId, range) => {
    if (range.startsWith('Sheet1')) return Promise.resolve([['Order ID', 'RMC-003'], ['Sheet ID', 's']]);
    if (range.includes('Line Items')) return Promise.resolve([['#', 'Item Type', 'Color', 'Sizes', 'Front Method', 'Front Notes', 'Back Method', 'Back Notes', 'Item Type ID']]);
    return Promise.resolve([]); // Designs + Customers empty
  });
  const order = await readOrderFromSheet('s');
  expect(order.customers).toEqual([]);
});

test('writeCustomersToSheet writes only the Customers tab', async () => {
  clearRange.mockResolvedValue();
  writeRange.mockResolvedValue();
  await writeCustomersToSheet('s', [{ name: 'A', email: 'a@x.com', emailed: { shipped: '2026-07-03T00:00:00Z' } }]);
  const call = writeRange.mock.calls.find(c => c[1].includes('Customers'));
  expect(call[2][1]).toEqual(['A', 'a@x.com', '', '', '', '2026-07-03T00:00:00Z']);
});
