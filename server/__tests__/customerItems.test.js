const { itemsForCustomer, sampleItems } = require('../gmail/customerItems');

const items = [
  { num: '01', customerEmail: 'jane@x.com' },
  { num: '02', customerEmail: 'JANE@x.com' },
  { num: '03', customerEmail: '' },
];

test('itemsForCustomer matches case-insensitively', () => {
  expect(itemsForCustomer(items, 'jane@x.com').map(i => i.num)).toEqual(['01', '02']);
});
test('itemsForCustomer returns [] for falsy email', () => {
  expect(itemsForCustomer(items, '')).toEqual([]);
});
test('sampleItems prefers first customer with linked items', () => {
  expect(sampleItems(items).map(i => i.num)).toEqual(['01', '02']);
});
test('sampleItems falls back to first two when none linked', () => {
  const none = [{ num: '01' }, { num: '02' }, { num: '03' }];
  expect(sampleItems(none).map(i => i.num)).toEqual(['01', '02']);
});
