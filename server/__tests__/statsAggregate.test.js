const { aggregate, COUNTED_STATES } = require('../stats/aggregate');

const catalog = {
  items: [
    { id: 'tee1', name: 'Unisex Tee', stockBlanks: true },
    { id: 'mug1', name: 'Mug', stockBlanks: false },
  ],
};

function order(state, lineItems) {
  return { orderId: 'RMC-x', state, lineItems };
}

test('COUNTED_STATES is sent and beyond', () => {
  expect(COUNTED_STATES).toEqual(['sent', 'pending', 'paid', 'fulfilled', 'received']);
});

test('sums total per Item Type x Color x Size across counted orders', () => {
  const orders = [
    order('sent', [
      { itemTypeName: 'Unisex Tee', itemTypeId: 'tee1', color: 'Black',
        sizes: { L: { total: 10, inventory: 3 }, M: { total: 5, inventory: 0 } } },
    ]),
    order('paid', [
      { itemTypeName: 'Unisex Tee', itemTypeId: 'tee1', color: 'Black',
        sizes: { L: { total: 2, inventory: 0 } } },
    ]),
  ];
  const { shirts } = aggregate(orders, catalog);
  const blackL = shirts.find(r => r.color === 'Black' && r.size === 'L');
  expect(blackL.total).toBe(12); // 10 + 2, inventory ignored
  const blackM = shirts.find(r => r.color === 'Black' && r.size === 'M');
  expect(blackM.total).toBe(5);
});

test('excludes building orders; ignores sizes with total 0', () => {
  const orders = [
    order('building', [
      { itemTypeName: 'Unisex Tee', itemTypeId: 'tee1', color: 'Black',
        sizes: { L: { total: 99, inventory: 0 } } },
    ]),
    order('sent', [
      { itemTypeName: 'Unisex Tee', itemTypeId: 'tee1', color: 'Red',
        sizes: { S: { total: 0, inventory: 0 }, L: { total: 4, inventory: 0 } } },
    ]),
  ];
  const { shirts } = aggregate(orders, catalog);
  expect(shirts.find(r => r.color === 'Black')).toBeUndefined();
  expect(shirts.find(r => r.size === 'S')).toBeUndefined();
  expect(shirts.find(r => r.color === 'Red' && r.size === 'L').total).toBe(4);
});

test('classifies by stockBlanks flag; unmatched item types go to other', () => {
  const orders = [
    order('sent', [
      { itemTypeName: 'Unisex Tee', itemTypeId: 'tee1', color: 'Black', sizes: { L: { total: 3, inventory: 0 } } },
      { itemTypeName: 'Mug', itemTypeId: 'mug1', color: 'White', sizes: { OS: { total: 6, inventory: 0 } } },
      { itemTypeName: 'Mystery Hat', itemTypeId: '', color: 'Green', sizes: { OS: { total: 2, inventory: 0 } } },
    ]),
  ];
  const { shirts, other } = aggregate(orders, catalog);
  expect(shirts.map(r => r.itemType)).toEqual(['Unisex Tee']);
  expect(other.map(r => r.itemType).sort()).toEqual(['Mug', 'Mystery Hat']);
});

test('matches catalog by name when itemTypeId is absent', () => {
  const orders = [
    order('sent', [
      { itemTypeName: 'unisex tee', itemTypeId: '', color: 'Black', sizes: { L: { total: 1, inventory: 0 } } },
    ]),
  ];
  const { shirts } = aggregate(orders, catalog);
  expect(shirts).toHaveLength(1);
  expect(shirts[0].itemType).toBe('unisex tee');
});

test('counts blank (undecorated) line items', () => {
  const orders = [
    order('sent', [
      { itemTypeName: 'Unisex Tee', itemTypeId: 'tee1', color: 'Black',
        sizes: { L: { total: 7, inventory: 0 } }, frontDesigns: [], backDesigns: [] },
    ]),
  ];
  const { shirts } = aggregate(orders, catalog);
  expect(shirts[0].total).toBe(7);
});

test('sorts rows by total descending', () => {
  const orders = [
    order('sent', [
      { itemTypeName: 'Unisex Tee', itemTypeId: 'tee1', color: 'Black',
        sizes: { S: { total: 1, inventory: 0 }, L: { total: 9, inventory: 0 }, M: { total: 5, inventory: 0 } } },
    ]),
  ];
  const { shirts } = aggregate(orders, catalog);
  expect(shirts.map(r => r.total)).toEqual([9, 5, 1]);
});

test('missing color renders as (no color)', () => {
  const orders = [
    order('sent', [
      { itemTypeName: 'Unisex Tee', itemTypeId: 'tee1', color: '', sizes: { L: { total: 2, inventory: 0 } } },
    ]),
  ];
  const { shirts } = aggregate(orders, catalog);
  expect(shirts[0].color).toBe('(no color)');
});

test('breaks ties in total by itemType, then color, then size', () => {
  const orders = [
    order('sent', [
      { itemTypeName: 'Unisex Tee', itemTypeId: 'tee1', color: 'Red',
        sizes: { S: { total: 5, inventory: 0 } } },
      { itemTypeName: 'Unisex Tee', itemTypeId: 'tee1', color: 'Blue',
        sizes: { M: { total: 5, inventory: 0 } } },
      { itemTypeName: 'Unisex Tee', itemTypeId: 'tee1', color: 'Green',
        sizes: { L: { total: 5, inventory: 0 } } },
    ]),
  ];
  const { shirts } = aggregate(orders, catalog);
  expect(shirts).toHaveLength(3);
  // All have equal total (5), so sorted by color ascending
  expect(shirts[0]).toEqual({ itemType: 'Unisex Tee', color: 'Blue', size: 'M', total: 5 });
  expect(shirts[1]).toEqual({ itemType: 'Unisex Tee', color: 'Green', size: 'L', total: 5 });
  expect(shirts[2]).toEqual({ itemType: 'Unisex Tee', color: 'Red', size: 'S', total: 5 });
});
