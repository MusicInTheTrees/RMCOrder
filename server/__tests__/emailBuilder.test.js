const { buildEmailHtml, buildEmailPlainText } = require('../gmail/emailBuilder');

const ORDER = {
  orderId: 'RMC-001-2026-06-28',
  lineItems: [
    {
      num: '01',
      apparelType: "Women's Round Neck",
      color: 'Black',
      sizes: { M: { total: 2, inventory: 1 }, L: { total: 1, inventory: 0 } },
      notes: 'Curved lettering lower back',
      frontDesigns: [{ designNum: '1', file: 'bestie_bitches.png' }],
      backDesigns:  [{ designNum: '2', file: 'brand_name_back.png' }],
      frontMethod: 'DTF', backMethod: 'DTF',
      frontNotes: '', backNotes: '',
    },
  ],
};
const SETTINGS = { brandName: 'Rocky Meowtain Co.', spewEmail: 'orders@spew.com' };

test('HTML includes order ID', () => {
  const html = buildEmailHtml(ORDER, SETTINGS);
  expect(html).toContain('RMC-001-2026-06-28');
});

test('HTML shows design file name', () => {
  const html = buildEmailHtml(ORDER, SETTINGS);
  expect(html).toContain('bestie_bitches.png');
});

test('HTML shows verbose size format with stock breakdown', () => {
  const html = buildEmailHtml(ORDER, SETTINGS);
  // M: total=2, inv=1 → "M: 2 (1 from stock, order 1)"
  expect(html).toContain('M: 2 (1 from stock, order 1)');
  // L: total=1, inv=0 → "L: 1"
  expect(html).toContain('L: 1');
});

test('plain text includes verbose size breakdown', () => {
  const text = buildEmailPlainText(ORDER, SETTINGS);
  expect(text).toContain('M: 2 (1 from stock, order 1)');
  expect(text).toContain('L: 1');
});

// --- Task 4: compile identical line items ---

const MERGE_ORDER = {
  orderId: 'RMC-001', orderName: 'Drop', notes: '',
  lineItems: [
    { num: '01', itemTypeName: 'Tank', color: 'Gray', frontDesigns: [{ designNum: '1', file: 'BlueNeon' }],
      backDesigns: [], frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
      sizes: { M: { total: 1, inventory: 0 } } },
    { num: '02', itemTypeName: 'Tank', color: 'Gray', frontDesigns: [{ designNum: '1', file: 'BlueNeon' }],
      backDesigns: [], frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
      sizes: { M: { total: 1, inventory: 0 } } },
    { num: '03', itemTypeName: 'Tank', color: 'Gray', frontDesigns: [{ designNum: '1', file: 'BlueNeon' }],
      backDesigns: [], frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
      sizes: { L: { total: 1, inventory: 0 } } },
  ],
};

test('printer HTML merges identical items into one row with summed sizes', () => {
  const html = buildEmailHtml(MERGE_ORDER, {}, {});
  // one merged data row -> exactly one <tr> after the header row inside the table
  const bodyRows = html.split('<tr>').length - 1; // header + 1 data row = 2
  expect(bodyRows).toBe(2);
  // MERGE_ORDER items all have inventory=0 → verbose form without stock note
  expect(html).toContain('M: 2');
  expect(html).toContain('L: 1');
  expect(html).toContain('01, 02, 03');
});

test('printer plain text merges identical items', () => {
  const text = buildEmailPlainText(MERGE_ORDER, {}, {});
  expect(text).toContain('M: 2');
  expect(text).toContain('L: 1');
  expect(text).toContain('#01, 02, 03');
});

test('printer HTML shows from-stock breakdown when merged size has inventory', () => {
  const orderWithStock = {
    orderId: 'RMC-002', orderName: 'StockTest', notes: '',
    lineItems: [
      { num: '01', itemTypeName: 'Tank', color: 'Gray', frontDesigns: [{ designNum: '1', file: 'BlueNeon' }],
        backDesigns: [], frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
        sizes: { M: { total: 1, inventory: 1 } } },
      { num: '02', itemTypeName: 'Tank', color: 'Gray', frontDesigns: [{ designNum: '1', file: 'BlueNeon' }],
        backDesigns: [], frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
        sizes: { M: { total: 1, inventory: 0 } } },
    ],
  };
  const html = buildEmailHtml(orderWithStock, {}, {});
  // merged M: total=2, inv=1 → "M: 2 (1 from stock, order 1)"
  expect(html).toContain('from stock');
  expect(html).toContain('M: 2 (1 from stock, order 1)');
});

// --- Task: Part A type-priority ordering ---

const GROUP_ORDER = {
  orderId: 'RMC-777', orderName: 'Grouped', notes: '',
  lineItems: [
    { num: '01', itemTypeName: 'Youth Shirt', color: 'Black', frontDesigns: [{ designNum: '1', file: 'y1' }],
      backDesigns: [], frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
      sizes: { M: { total: 1, inventory: 0 } } },
    { num: '02', itemTypeName: 'Tank', color: 'Black', frontDesigns: [{ designNum: '1', file: 't1' }],
      backDesigns: [], frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
      sizes: { M: { total: 1, inventory: 0 } } },
    { num: '03', itemTypeName: 'Unisex Shirt', color: 'Black', frontDesigns: [{ designNum: '1', file: 'u1' }],
      backDesigns: [], frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
      sizes: { M: { total: 1, inventory: 0 } } },
  ],
};

test('printed HTML sections are ordered Unisex, Youth, Tank regardless of input order', () => {
  const html = buildEmailHtml(GROUP_ORDER, {}, {});
  const iUnisex = html.indexOf('<h3>Unisex Shirt</h3>');
  const iYouth = html.indexOf('<h3>Youth Shirt</h3>');
  const iTank = html.indexOf('<h3>Tank</h3>');
  expect(iUnisex).toBeGreaterThan(-1);
  expect(iUnisex).toBeLessThan(iYouth);
  expect(iYouth).toBeLessThan(iTank);
});

test('printed plain-text sections are ordered Unisex, Youth, Tank', () => {
  const text = buildEmailPlainText(GROUP_ORDER, {}, {});
  expect(text.indexOf('Unisex Shirt')).toBeLessThan(text.indexOf('Youth Shirt'));
  expect(text.indexOf('Youth Shirt')).toBeLessThan(text.indexOf('Tank'));
});

test('unknown types sort alphabetically after the priority types', () => {
  const order = {
    orderId: 'RMC-778', lineItems: [
      { num: '01', itemTypeName: 'Beanie', color: 'Black', frontDesigns: [{ designNum: '1', file: 'b' }],
        backDesigns: [], frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
        sizes: { OS: { total: 1, inventory: 0 } } },
      { num: '02', itemTypeName: 'Apron', color: 'Black', frontDesigns: [{ designNum: '1', file: 'a' }],
        backDesigns: [], frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
        sizes: { OS: { total: 1, inventory: 0 } } },
      { num: '03', itemTypeName: 'Tank', color: 'Black', frontDesigns: [{ designNum: '1', file: 't' }],
        backDesigns: [], frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
        sizes: { OS: { total: 1, inventory: 0 } } },
    ],
  };
  const html = buildEmailHtml(order, {}, {});
  const iTank = html.indexOf('<h3>Tank</h3>');
  const iApron = html.indexOf('<h3>Apron</h3>');
  const iBeanie = html.indexOf('<h3>Beanie</h3>');
  expect(iTank).toBeLessThan(iApron); // priority type first
  expect(iApron).toBeLessThan(iBeanie); // then alphabetical
});

test('blank item rows are contiguous per type and in priority order', () => {
  const order = {
    orderId: 'RMC-779', lineItems: [
      { num: '01', itemTypeName: 'Tank', color: 'Gray', frontDesigns: [], backDesigns: [],
        sizes: { M: { total: 1, inventory: 0 } } },
      { num: '02', itemTypeName: 'Unisex Shirt', color: 'Gray', frontDesigns: [], backDesigns: [],
        sizes: { M: { total: 1, inventory: 0 } } },
      { num: '03', itemTypeName: 'Tank', color: 'Black', frontDesigns: [], backDesigns: [],
        sizes: { M: { total: 1, inventory: 0 } } },
      { num: '04', itemTypeName: 'Youth Shirt', color: 'Gray', frontDesigns: [], backDesigns: [],
        sizes: { M: { total: 1, inventory: 0 } } },
    ],
  };
  const html = buildEmailHtml(order, {}, {});
  // Locate the Blank Items table and read Item Type cells in row order.
  const blankSection = html.slice(html.indexOf('Blank Items (no decoration)'));
  const types = [...blankSection.matchAll(/<td>(Unisex Shirt|Youth Shirt|Tank)<\/td>/g)].map(m => m[1]);
  expect(types).toEqual(['Unisex Shirt', 'Youth Shirt', 'Tank', 'Tank']);
});
