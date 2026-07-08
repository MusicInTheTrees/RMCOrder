import { describe, test, expect } from 'vitest';
import { blankRowsToLineItems } from '../utils/blankRowsToLineItems';

describe('blankRowsToLineItems', () => {
  const map = { 'Unisex Shirt': { id: 'i1', name: 'Unisex Shirt' } };
  test('collapses rows by item type + color into blank line items', () => {
    const rows = [
      { itemType: 'Unisex Shirt', color: 'Black', size: 'M', qty: 6 },
      { itemType: 'Unisex Shirt', color: 'Black', size: 'L', qty: 10 },
      { itemType: 'Unisex Shirt', color: 'White', size: 'M', qty: 5 },
    ];
    const items = blankRowsToLineItems(rows, map);
    expect(items).toHaveLength(2);
    const black = items.find(i => i.color === 'Black');
    expect(black.itemTypeName).toBe('Unisex Shirt');
    expect(black.itemTypeId).toBe('i1');
    expect(black.sizes).toEqual({ M: { total: 6, inventory: 0 }, L: { total: 10, inventory: 0 } });
    expect(black.frontDesigns).toEqual([]);
    expect(black.backDesigns).toEqual([]);
    expect(items[0].num).toBe('01');
    expect(items[1].num).toBe('02');
  });
  test('drops non-positive quantities; falls back to styleKey when unmapped', () => {
    const items = blankRowsToLineItems(
      [{ itemType: 'Tank', color: 'Red', size: 'L', qty: 0 },
       { itemType: 'Tank', color: 'Red', size: 'M', qty: 3 }],
      {}
    );
    expect(items).toHaveLength(1);
    expect(items[0].itemTypeName).toBe('Tank');
    expect(items[0].itemTypeId).toBe('');
    expect(items[0].sizes).toEqual({ M: { total: 3, inventory: 0 } });
  });
});
