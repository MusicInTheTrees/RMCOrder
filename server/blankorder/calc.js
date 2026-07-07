const SIZE_ORDER = {};
['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'].forEach((s, i) => { SIZE_ORDER[s] = i; });

// Python's round(): round half to even (banker's rounding).
function pyRound(n) {
  const floor = Math.floor(n);
  const diff = n - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

// Ascending string compare matching Python's default (code-point order for ASCII).
function byKey(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

function allocate(weights, total, floors) {
  const keys = Object.keys(weights);
  const result = {};
  for (const k of keys) result[k] = 0;
  if (total <= 0 || keys.length === 0) return result;

  const fl = {};
  for (const k of keys) fl[k] = floors ? Math.trunc(floors[k] || 0) : 0;

  const reserved = keys.reduce((s, k) => s + fl[k], 0);
  if (reserved > total) {
    const order = [...keys].sort((a, b) => (fl[b] - fl[a]) || byKey(a, b));
    let left = total;
    for (const k of order) {
      const give = Math.min(fl[k], left);
      result[k] += give;
      left -= give;
    }
    return result;
  }
  for (const k of keys) result[k] += fl[k];

  const remaining = total - reserved;
  const wsum = keys.reduce((s, k) => s + Math.max(0, weights[k]), 0);
  if (remaining <= 0) return result;
  if (wsum <= 0) {
    const order = [...keys].sort(byKey);
    for (let i = 0; i < remaining; i++) result[order[i % order.length]] += 1;
    return result;
  }
  const exact = {};
  for (const k of keys) exact[k] = (remaining * Math.max(0, weights[k])) / wsum;
  const floorAlloc = {};
  for (const k of keys) floorAlloc[k] = Math.floor(exact[k]);
  for (const k of keys) result[k] += floorAlloc[k];
  let leftover = remaining - keys.reduce((s, k) => s + floorAlloc[k], 0);
  const frac = [...keys].sort((a, b) =>
    ((exact[b] - floorAlloc[b]) - (exact[a] - floorAlloc[a])) || byKey(a, b));
  for (let i = 0; i < leftover; i++) result[frac[i % frac.length]] += 1;
  return result;
}

module.exports = { SIZE_ORDER, pyRound, allocate };
