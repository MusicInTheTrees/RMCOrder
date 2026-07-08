const { computeVelocity } = require('./delta');

function fromCsvUpload(csvOld, csvNew, meta = {}) {
  if (!csvOld || !csvNew) throw new Error('Both catalog CSV exports are required.');
  return computeVelocity(csvOld, csvNew, meta);
}

// Phase 2: pull true sales from the Square Orders/Catalog API and return the
// same feed shape. Intentionally unimplemented for now.
function fromSquare(_range) {
  throw new Error('Square integration is Phase 2 and not yet implemented.');
}

module.exports = { fromCsvUpload, fromSquare };
