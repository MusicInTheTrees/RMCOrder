const { allocate, pyRound, SIZE_ORDER } = require('../blankorder/calc');

describe('pyRound (banker rounding)', () => {
  test('rounds half to even', () => {
    expect(pyRound(0.5)).toBe(0);
    expect(pyRound(1.5)).toBe(2);
    expect(pyRound(2.5)).toBe(2);
    expect(pyRound(3.5)).toBe(4);
    expect(pyRound(2.4)).toBe(2);
  });
});

describe('SIZE_ORDER', () => {
  test('maps the nine sizes in canonical order', () => {
    expect(SIZE_ORDER.XL).toBe(4);
    expect(SIZE_ORDER['2XL']).toBe(5);
    expect(Object.keys(SIZE_ORDER)).toEqual(['XS','S','M','L','XL','2XL','3XL','4XL','5XL']);
  });
});

describe('allocate', () => {
  test('splits by weight and sums exactly', () => {
    const r = allocate({ a: 1, b: 1, c: 2 }, 8);
    expect(r.a + r.b + r.c).toBe(8);
    expect(r.c).toBeGreaterThanOrEqual(r.a);
  });
  test('reserves floors first', () => {
    const r = allocate({ a: 0, b: 10 }, 10, { a: 2 });
    expect(r.a).toBe(2);
    expect(r.b).toBe(8);
  });
  test('floors exceeding total are handed out by largest floor', () => {
    const r = allocate({ a: 1, b: 1 }, 3, { a: 5, b: 1 });
    expect(r.a).toBe(3);
    expect(r.b).toBe(0);
  });
  test('no demand signal spreads evenly by sorted key', () => {
    const r = allocate({ b: 0, a: 0 }, 3);
    expect(r.a + r.b).toBe(3);
    expect(r.a).toBe(2); // 'a' sorts first, gets the extra
  });
  test('zero total yields all zeros', () => {
    expect(allocate({ a: 1, b: 1 }, 0)).toEqual({ a: 0, b: 0 });
  });
});

const { styleKey, buildDemand, curveFor } = require('../blankorder/calc');

const CFG = {
  sizeCurves: { industry: { XS: 1, S: 10, M: 23, L: 31, XL: 23, '2XL': 9, '3XL': 3 } },
  styleCurves: {},
  blendWeight: 0.5,
  colorAliases: { Ash: 'Heather Gray' },
  excludedColors: ['Daisy'],
  excludedSizes: ['XS', 'S', '3XL', '4XL', '5XL'],
  coreColors: ['Black', 'White'],
  coreColorFloorPct: 0.1,
  manualHistory: [],
};

describe('styleKey', () => {
  test('maps apparel to blank buckets', () => {
    expect(styleKey('Shirt', 'UM')).toBe('Unisex Shirt');
    expect(styleKey('Shirt', 'Y')).toBe('Youth Shirt');
    expect(styleKey('Tank', '')).toBe('Tank');
  });
});

describe('buildDemand', () => {
  const feed = { velocity: [
    { itemType: 'Shirt', style: 'UM', color: 'Ash', size: 'L', unitsSold: 4, isApparel: true },
    { itemType: 'Shirt', style: 'UM', color: 'Daisy', size: 'M', unitsSold: 2, isApparel: true },
    { itemType: 'Sticker', style: '', color: '', size: '', unitsSold: 9, isApparel: false },
  ] };
  test('applies aliases, drops excluded colors and non-apparel', () => {
    const { styles, colors } = buildDemand(feed, CFG);
    expect(styles['Unisex Shirt']).toBe(4);            // Daisy row dropped
    expect(colors['Unisex Shirt']['Heather Gray']).toBe(4); // Ash -> Heather Gray
    expect(colors['Unisex Shirt'].Daisy).toBeUndefined();
  });
  test('folds config.manualHistory into demand', () => {
    const cfg = { ...CFG, manualHistory: [{ itemType: 'Shirt', style: 'UM', color: 'Navy', size: 'L', unitsSold: 3 }] };
    const { styles, colors } = buildDemand({ velocity: [] }, cfg);
    expect(styles['Unisex Shirt']).toBe(3);
    expect(colors['Unisex Shirt'].Navy).toBe(3);
  });
});

describe('curveFor', () => {
  test('industry mode drops excluded sizes and renormalizes to 1', () => {
    const c = curveFor('Unisex Shirt', 'industry', {}, CFG, {});
    expect(c.XS).toBeUndefined();
    expect(c['3XL']).toBeUndefined();
    const sum = Object.values(c).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1, 9);
  });
  test('per-type size restriction removes additional sizes', () => {
    const c = curveFor('Tank', 'industry', {}, CFG, { Tank: ['2XL'] });
    expect(c['2XL']).toBeUndefined();
  });
  test('blend mode mixes observed size mix with industry and renormalizes', () => {
    const c = curveFor('Unisex Shirt', 'blend', { M: 10, L: 10 }, CFG, {});
    expect(c.XS).toBeUndefined();            // still excluded
    const sum = Object.values(c).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1, 9);
    expect(c.M).toBeGreaterThan(c.XL);       // observed pushes M above XL
  });
});
