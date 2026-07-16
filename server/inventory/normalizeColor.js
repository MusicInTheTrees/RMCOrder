// "Black (440C)" / "White (11-0601 TCX)" and plain "black"/"white" are the
// same physical color — a trailing parenthetical is just a pantone/code
// annotation from the catalog. Strip it so inventory rows match.
function normalizeColor(color) {
  return (color || '').toLowerCase().replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// Same stripping but preserves the original casing — for values written
// back to the sheet.
function cleanColor(color) {
  return (color || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

module.exports = { normalizeColor, cleanColor };
