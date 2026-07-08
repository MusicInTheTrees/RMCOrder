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

function styleKey(itemType, style) {
  const it = (itemType || '').trim();
  const st = (style || '').trim().toUpperCase();
  if (it === 'Tank') return 'Tank';
  if (it === 'Shirt') {
    if (st === 'UM') return 'Unisex Shirt';
    if (st === 'Y') return 'Youth Shirt';
  }
  return `${it} ${style || ''}`.trim() || '(unknown)';
}

function normalize(d) {
  const vals = Object.values(d || {});
  const total = vals.reduce((s, v) => s + v, 0);
  if (!total) return {};
  const out = {};
  for (const [k, v] of Object.entries(d)) out[k] = v / total;
  return out;
}

function cleanObj(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) if (!k.startsWith('_')) out[k] = v;
  return out;
}

function buildDemand(feed, config) {
  const aliases = cleanObj(config.colorAliases);
  const excluded = new Set(config.excludedColors || []);
  const styles = {}, colors = {}, sizes = {};
  const rows = [...((feed && feed.velocity) || []), ...(config.manualHistory || [])];
  for (const r of rows) {
    if (!r.itemType) continue;
    if (r.isApparel === false) continue;
    if (r.isApparel == null && r.itemType !== 'Shirt' && r.itemType !== 'Tank') continue;
    let color = (r.color || '').trim();
    color = aliases[color] || color;
    if (excluded.has(color)) continue;
    const units = r.unitsSold || 0;
    if (units <= 0) continue;
    const sk = styleKey(r.itemType, r.style);
    const size = (r.size || '').trim();
    styles[sk] = (styles[sk] || 0) + units;
    colors[sk] = colors[sk] || {};
    if (color) colors[sk][color] = (colors[sk][color] || 0) + units;
    sizes[sk] = sizes[sk] || {};
    if (size) sizes[sk][size] = (sizes[sk][size] || 0) + units;
  }
  return { styles, colors, sizes };
}

function curveFor(style, mode, observedSizes, config, perTypeSizeRestrictions) {
  const curves = config.sizeCurves || {};
  const styleCurveNames = cleanObj(config.styleCurves);
  const curveName = styleCurveNames[style] || 'industry';
  const industry = normalize(cleanObj(curves[curveName] || {}));

  let result;
  if (mode === 'industry') {
    result = industry;
  } else {
    const observed = normalize(observedSizes);
    if (Object.keys(observed).length === 0) {
      result = industry;
    } else {
      const w = Number(config.blendWeight != null ? config.blendWeight : 0.5);
      const allSizes = new Set([...Object.keys(industry), ...Object.keys(observed)]);
      const blended = {};
      for (const s of allSizes) blended[s] = w * (observed[s] || 0) + (1 - w) * (industry[s] || 0);
      result = normalize(blended);
    }
  }

  const excluded = new Set([
    ...(config.excludedSizes || []),
    ...((perTypeSizeRestrictions && perTypeSizeRestrictions[style]) || []),
  ]);
  if (excluded.size) {
    const filtered = {};
    for (const [s, v] of Object.entries(result)) if (!excluded.has(s)) filtered[s] = v;
    result = normalize(filtered);
    if (Object.keys(result).length === 0) {
      throw new Error(`Size restrictions removed every size for style '${style}'.`);
    }
  }
  return result;
}

function planRows(mode, styles, colors, sizes, config, opts) {
  const grandTotal = Math.max(0, Math.trunc(Number(opts.grandTotal) || 0));
  const perTypeTotals = opts.perTypeTotals || {};
  const perTypeSizeRestrictions = opts.perTypeSizeRestrictions || {};

  const excludedColors = new Set(config.excludedColors || []);
  const core = (config.coreColors || []).filter(c => !excludedColors.has(c));
  const floorPct = Number(config.coreColorFloorPct || 0);

  const styleKeys = Object.keys(styles);
  const overrides = {};
  let fixed = 0;
  for (const k of styleKeys) {
    const v = perTypeTotals[k];
    if (v != null && v !== '') {
      overrides[k] = Math.max(0, Math.trunc(Number(v)));
      fixed += overrides[k];
    }
  }
  const remainderTotal = Math.max(0, grandTotal - fixed);
  const nonOverridden = {};
  for (const k of styleKeys) if (!(k in overrides)) nonOverridden[k] = styles[k];
  const distributed = allocate(nonOverridden, remainderTotal);
  const styleAlloc = { ...overrides };
  for (const k of Object.keys(distributed)) styleAlloc[k] = (styleAlloc[k] || 0) + distributed[k];
  const effectiveTotal = Object.values(styleAlloc).reduce((s, n) => s + n, 0);

  const rows = [];
  for (const sk of Object.keys(styleAlloc)) {
    const sunits = styleAlloc[sk];
    if (sunits <= 0) continue;
    const colorWeights = { ...(colors[sk] || {}) };
    for (const c of core) if (!(c in colorWeights)) colorWeights[c] = 0;
    const floors = {};
    if (floorPct > 0 && sunits > 0) for (const c of core) floors[c] = Math.max(1, pyRound(floorPct * sunits));
    const colorAlloc = allocate(colorWeights, sunits, floors);
    const curve = curveFor(sk, mode, sizes[sk] || {}, config, perTypeSizeRestrictions);
    for (const color of Object.keys(colorAlloc)) {
      const cunits = colorAlloc[color];
      if (cunits <= 0) continue;
      const sizeAlloc = allocate(curve, cunits);
      for (const size of Object.keys(sizeAlloc)) {
        const q = sizeAlloc[size];
        if (q <= 0) continue;
        rows.push({ itemType: sk, color, size, qty: q });
      }
    }
  }
  rows.sort((a, b) =>
    (a.itemType < b.itemType ? -1 : a.itemType > b.itemType ? 1 : 0) ||
    (b.qty - a.qty) ||
    (a.color < b.color ? -1 : a.color > b.color ? 1 : 0) ||
    ((SIZE_ORDER[a.size] ?? 99) - (SIZE_ORDER[b.size] ?? 99)));
  return { rows, effectiveTotal };
}

function computePlans(feed, config, opts) {
  const { styles, colors, sizes } = buildDemand(feed, config);
  const ind = planRows('industry', styles, colors, sizes, config, opts);
  const bl = planRows('blended', styles, colors, sizes, config, opts);
  return { industry: ind.rows, blended: bl.rows, effectiveTotal: ind.effectiveTotal };
}

module.exports = { SIZE_ORDER, pyRound, allocate, styleKey, normalize, buildDemand, curveFor, planRows, computePlans };
