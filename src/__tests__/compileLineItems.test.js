import { describe, test, expect } from 'vitest';
import { compileLineItems } from '../utils/compileLineItems';

const base = (over) => ({
  num: '01', itemTypeName: 'Tank', color: 'Gray',
  frontDesigns: [{ designNum: '1', file: 'BlueNeon' }], backDesigns: [],
  frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
  sizes: { M: { total: 1, inventory: 0 } }, ...over,
});

describe('compileLineItems (client)', () => {
  test('merges identical items and sums sizes', () => {
    const out = compileLineItems([
      base({ num: '01' }), base({ num: '02' }),
      base({ num: '03', sizes: { L: { total: 1, inventory: 0 } } }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].nums).toEqual(['01', '02', '03']);
    expect(out[0].sizes).toEqual({ M: { total: 2, inventory: 0 }, L: { total: 1, inventory: 0 } });
  });
  test('different notes prevent a merge', () => {
    const out = compileLineItems([base({ num: '01', frontNotes: 'a' }), base({ num: '02', frontNotes: 'b' })]);
    expect(out).toHaveLength(2);
  });
});
