import { hexToRgb, rgbToHex, rgbToCmy, cmyToRgb } from '../utils/colorUtils';

test('hexToRgb parses #ffffff', () => {
  expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
});

test('hexToRgb parses without hash', () => {
  expect(hexToRgb('000000')).toEqual({ r: 0, g: 0, b: 0 });
});

test('hexToRgb returns null for invalid', () => {
  expect(hexToRgb('nope')).toBeNull();
});

test('rgbToHex produces lowercase hex', () => {
  expect(rgbToHex({ r: 255, g: 0, b: 0 })).toBe('#ff0000');
});

test('rgbToHex clamps values', () => {
  expect(rgbToHex({ r: 300, g: -10, b: 128 })).toBe('#ff0080');
});

test('rgbToCmy converts white', () => {
  expect(rgbToCmy({ r: 255, g: 255, b: 255 })).toEqual({ c: 0, m: 0, y: 0 });
});

test('rgbToCmy converts black', () => {
  expect(rgbToCmy({ r: 0, g: 0, b: 0 })).toEqual({ c: 100, m: 100, y: 100 });
});

test('cmyToRgb round-trips', () => {
  const rgb = { r: 128, g: 64, b: 200 };
  const cmy = rgbToCmy(rgb);
  const back = cmyToRgb(cmy);
  expect(back.r).toBeCloseTo(rgb.r, 0);
  expect(back.g).toBeCloseTo(rgb.g, 0);
  expect(back.b).toBeCloseTo(rgb.b, 0);
});
