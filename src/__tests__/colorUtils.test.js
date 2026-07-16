import { hexToRgb, rgbToHex, rgbToCmy, cmyToRgb, normalizeColor } from '../utils/colorUtils';

test('normalizeColor strips a trailing pantone/code annotation', () => {
  expect(normalizeColor('Black (440C)')).toBe('black');
  expect(normalizeColor('White (11-0601 TCX)')).toBe('white');
  expect(normalizeColor('  Athletic Grey ')).toBe('athletic grey');
  expect(normalizeColor('')).toBe('');
  expect(normalizeColor(undefined)).toBe('');
});

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
  // Allow for rounding loss in the CMY->RGB conversion
  expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(2);
  expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(2);
  expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(2);
});

test('rgbToCmy returns integers for arbitrary values', () => {
  const cmy = rgbToCmy({ r: 128, g: 64, b: 200 });
  expect(Number.isInteger(cmy.c)).toBe(true);
  expect(Number.isInteger(cmy.m)).toBe(true);
  expect(Number.isInteger(cmy.y)).toBe(true);
});
