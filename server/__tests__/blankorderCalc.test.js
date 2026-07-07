const { allocate, pyRound } = require('../blankorder/calc');

describe('pyRound (banker rounding)', () => {
  test('rounds half to even', () => {
    expect(pyRound(0.5)).toBe(0);
    expect(pyRound(1.5)).toBe(2);
    expect(pyRound(2.5)).toBe(2);
    expect(pyRound(3.5)).toBe(4);
    expect(pyRound(2.4)).toBe(2);
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
