function typeOf(item) { return item.itemTypeName || item.apparelType || ''; }
function files(list) { return (list || []).map(d => d.file); }

function signatureOf(item) {
  return JSON.stringify([
    typeOf(item), item.color || '',
    files(item.frontDesigns), files(item.backDesigns),
    item.frontMethod || '', item.backMethod || '',
    item.frontNotes || '', item.backNotes || '',
  ]);
}

// Merge line items sharing an identical print-job signature, summing sizes.
// customerEmail is intentionally ignored. Input order is preserved.
function compileLineItems(lineItems) {
  const bySig = new Map();
  for (const item of lineItems || []) {
    const sig = signatureOf(item);
    let merged = bySig.get(sig);
    if (!merged) {
      merged = {
        nums: [], itemTypeName: item.itemTypeName || '', apparelType: item.apparelType || '',
        color: item.color || '',
        frontDesigns: item.frontDesigns || [], backDesigns: item.backDesigns || [],
        frontMethod: item.frontMethod || '', backMethod: item.backMethod || '',
        frontNotes: item.frontNotes || '', backNotes: item.backNotes || '',
        sizes: {},
      };
      bySig.set(sig, merged);
    }
    merged.nums.push(item.num);
    for (const [label, v] of Object.entries(item.sizes || {})) {
      if (!merged.sizes[label]) merged.sizes[label] = { total: 0, inventory: 0 };
      merged.sizes[label].total += v?.total ?? 0;
      merged.sizes[label].inventory += v?.inventory ?? 0;
    }
  }
  return [...bySig.values()];
}

module.exports = { compileLineItems, signatureOf };
