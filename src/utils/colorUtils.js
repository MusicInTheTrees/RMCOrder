// "Black (440C)" / "White (11-0601 TCX)" and plain "black"/"white" are the
// same physical color — a trailing parenthetical is just a pantone/code
// annotation from the catalog. Mirrors server/inventory/normalizeColor.js.
export function normalizeColor(color) {
  return (color || '').toLowerCase().replace(/\s*\([^)]*\)\s*$/, '').trim();
}

export function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

export function rgbToHex({ r, g, b }) {
  const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [r, g, b].map(v => clamp(v).toString(16).padStart(2, '0')).join('');
}

export function rgbToCmy({ r, g, b }) {
  return {
    c: Math.round((1 - r / 255) * 100),
    m: Math.round((1 - g / 255) * 100),
    y: Math.round((1 - b / 255) * 100),
  };
}

export function cmyToRgb({ c, m, y }) {
  return {
    r: Math.round((1 - c / 100) * 255),
    g: Math.round((1 - m / 100) * 255),
    b: Math.round((1 - y / 100) * 255),
  };
}
