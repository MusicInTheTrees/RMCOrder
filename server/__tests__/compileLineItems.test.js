const { compileLineItems } = require('../gmail/compileLineItems');

const base = (over) => ({
  num: '01', itemTypeName: 'Tank', color: 'Gray',
  frontDesigns: [{ designNum: '1', file: 'BlueNeon' }], backDesigns: [],
  frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
  sizes: { M: { total: 1, inventory: 0 } }, ...over,
});

test('merges identical items and sums sizes', () => {
  const out = compileLineItems([
    base({ num: '01', sizes: { M: { total: 1, inventory: 0 } } }),
    base({ num: '02', sizes: { M: { total: 1, inventory: 0 } } }),
    base({ num: '03', sizes: { L: { total: 1, inventory: 0 } } }),
  ]);
  expect(out).toHaveLength(1);
  expect(out[0].nums).toEqual(['01', '02', '03']);
  expect(out[0].sizes).toEqual({ M: { total: 2, inventory: 0 }, L: { total: 1, inventory: 0 } });
});

test('different back designs stay separate', () => {
  const out = compileLineItems([
    base({ num: '01' }),
    base({ num: '02', backDesigns: [{ designNum: '1', file: 'Logo' }] }),
  ]);
  expect(out).toHaveLength(2);
});

test('different notes prevent a merge', () => {
  const out = compileLineItems([
    base({ num: '01', frontNotes: 'center' }),
    base({ num: '02', frontNotes: 'left chest' }),
  ]);
  expect(out).toHaveLength(2);
});

test('sums inventory independently and blanks merge on type+color', () => {
  const out = compileLineItems([
    { num: '01', itemTypeName: 'Tank', color: 'Gray', frontDesigns: [], backDesigns: [],
      frontMethod: '', backMethod: '', frontNotes: '', backNotes: '',
      sizes: { M: { total: 2, inventory: 1 } } },
    { num: '02', itemTypeName: 'Tank', color: 'Gray', frontDesigns: [], backDesigns: [],
      frontMethod: '', backMethod: '', frontNotes: '', backNotes: '',
      sizes: { M: { total: 1, inventory: 1 } } },
  ]);
  expect(out).toHaveLength(1);
  expect(out[0].sizes.M).toEqual({ total: 3, inventory: 2 });
});
