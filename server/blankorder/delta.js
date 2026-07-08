const QTY_FIELD = 'Current Quantity Rocky Meowtain Company LLC';
const PRICE_FIELD = 'Price';
const KEY = 'Token';

function toNum(s) {
  if (s == null) return null;
  const t = String(s).trim().replace(/\$/g, '').replace(/,/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

function parseCsv(text) {
  let s = String(text);
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); // strip BOM
  const records = [];
  let field = '';
  let record = [];
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      record.push(field); field = '';
    } else if (ch === '\n') {
      record.push(field); field = '';
      records.push(record); record = [];
    } else if (ch === '\r') {
      // ignore; handled by the following \n (or EOF below)
    } else field += ch;
  }
  if (field !== '' || record.length) { record.push(field); records.push(record); }
  const fields = records.shift() || [];
  const rows = records
    .filter(r => r.length && !(r.length === 1 && r[0] === ''))
    .map(r => {
      const obj = {};
      fields.forEach((f, idx) => { obj[f] = r[idx] != null ? r[idx] : ''; });
      return obj;
    });
  return { fields, rows };
}

function category(row) {
  const name = (row['Item Name'] || '').trim();
  if (name) return name.split('|')[0].trim();
  return (row['Reporting Category'] || '').trim() || '(uncategorized)';
}

function blankSpec(row) {
  const cat = category(row);
  if (cat !== 'Shirt' && cat !== 'Tank') return null;
  const parts = (row['Item Name'] || '').split('|').map(p => p.trim());
  const gtype = parts[0] || cat;
  const style = parts.length >= 3 ? parts[1] : '';
  const color = (row['Option Value 1'] || '').trim();
  const size = (row['Option Value 2'] || '').trim();
  return { gtype, style, color, size };
}

function loadRows(csvText) {
  const { rows } = parseCsv(csvText);
  const byKey = {};
  for (const r of rows) byKey[r[KEY] || ''] = r;
  return byKey;
}

function computeVelocity(csvOld, csvNew, meta = {}) {
  const oldRows = loadRows(csvOld);
  const newRows = loadRows(csvNew);
  const common = Object.keys(newRows).filter(k => k in oldRows);

  const velocity = [];
  let totalUnits = 0;
  let totalRevenue = 0;
  for (const k of common) {
    const o = oldRows[k], n = newRows[k];
    const ovn = toNum(o[QTY_FIELD]);
    const nvn = toNum(n[QTY_FIELD]);
    if (ovn == null || nvn == null || ovn === nvn) continue;
    const units = Math.abs(nvn - ovn);
    const price = toNum(n[PRICE_FIELD]);
    const revenue = price != null ? units * price : 0;
    const custom = nvn < 0;
    const cat = category(n);
    const spec = blankSpec(n);
    velocity.push({
      token: k,
      itemType: cat,
      style: spec ? spec.style : '',
      color: (n['Option Value 1'] || '').trim(),
      size: (n['Option Value 2'] || '').trim(),
      sku: (n['SKU'] || '').trim(),
      unitsSold: units,
      unitPrice: price != null ? Math.round(price * 100) / 100 : null,
      revenue: Math.round(revenue * 100) / 100,
      isApparel: spec != null,
      customOrder: custom,
    });
    totalUnits += units;
    totalRevenue += revenue;
  }
  velocity.sort((a, b) =>
    (b.revenue - a.revenue) ||
    (a.itemType < b.itemType ? -1 : a.itemType > b.itemType ? 1 : 0) ||
    (a.color < b.color ? -1 : a.color > b.color ? 1 : 0) ||
    (a.size < b.size ? -1 : a.size > b.size ? 1 : 0));

  return {
    meta: {
      old: meta.old || '',
      new: meta.new || '',
      generatedAt: new Date().toISOString().slice(0, 19),
      totalUnits: totalUnits,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      note: 'Raw sales velocity between the two catalog exports. No ordering policy applied.',
    },
    velocity,
  };
}

module.exports = { parseCsv, computeVelocity };
