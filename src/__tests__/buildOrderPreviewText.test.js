// src/__tests__/buildOrderPreviewText.test.js
import { describe, test, expect } from 'vitest';
import { buildOrderPreviewText } from '../utils/buildOrderPreviewText';

const order = {
  orderId: 'RMC-001', orderName: 'Drop', notes: '',
  lineItems: [
    { num: '01', itemTypeName: 'Tank', color: 'Gray', frontDesigns: [{ designNum: '1', file: 'BlueNeon' }],
      backDesigns: [], frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
      sizes: { M: { total: 1, inventory: 0 } } },
    { num: '02', itemTypeName: 'Tank', color: 'Gray', frontDesigns: [{ designNum: '1', file: 'BlueNeon' }],
      backDesigns: [], frontMethod: 'DTF', backMethod: '', frontNotes: '', backNotes: '',
      sizes: { L: { total: 1, inventory: 0 } } },
  ],
};

describe('buildOrderPreviewText', () => {
  test('merges identical items and shows contributing numbers', () => {
    const text = buildOrderPreviewText(order);
    expect(text).toContain('Tank');
    expect(text).toContain('M: 1');
    expect(text).toContain('L: 1');
    expect(text).toContain('#01, 02');
  });
});
