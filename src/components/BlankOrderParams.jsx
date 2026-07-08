import { useState } from 'react';

const ALL_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];

function readFileInto(setter) {
  return (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setter(String(reader.result || ''));
    reader.readAsText(file);
  };
}

export default function BlankOrderParams({ config, stockBlankItems, onCompute }) {
  const [csvOld, setCsvOld] = useState('');
  const [csvNew, setCsvNew] = useState('');
  const [grandTotal, setGrandTotal] = useState('');
  const [perTypeTotals, setPerTypeTotals] = useState({});
  const [restrictions, setRestrictions] = useState(
    Object.fromEntries(stockBlankItems.map(i => [i.name, [...(config.excludedSizes || [])]]))
  ); // { itemName: [excludedSize,...] }
  const [blendWeight, setBlendWeight] = useState(config.blendWeight ?? 0.5);
  const [floorPct, setFloorPct] = useState(config.coreColorFloorPct ?? 0);
  const [excludedColors, setExcludedColors] = useState((config.excludedColors || []).join(', '));
  const [aliases, setAliases] = useState(
    Object.entries(config.colorAliases || {}).filter(([k]) => !k.startsWith('_')).map(([k, v]) => `${k}=${v}`).join('\n'));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState(null);

  const styleNames = stockBlankItems.map(i => i.name);

  function toggleSize(name, size) {
    setRestrictions(prev => {
      const cur = new Set(prev[name] || []);
      if (cur.has(size)) cur.delete(size); else cur.add(size);
      return { ...prev, [name]: [...cur] };
    });
  }

  function parseAliases(text) {
    const out = {};
    for (const line of text.split('\n')) {
      const [k, v] = line.split('=').map(s => (s || '').trim());
      if (k && v) out[k] = v;
    }
    return out;
  }

  function handleCompute() {
    if (!csvOld || !csvNew) { setError('Please provide both CSV exports.'); return; }
    if (!(Number(grandTotal) > 0)) { setError('Enter a total greater than zero.'); return; }
    setError(null);
    const policyOverrides = {
      blendWeight: Number(blendWeight),
      coreColorFloorPct: Number(floorPct),
      excludedColors: excludedColors.split(',').map(s => s.trim()).filter(Boolean),
      colorAliases: parseAliases(aliases),
      excludedSizes: [],
    };
    // styleItemTypeMap: map each catalog stockBlanks item name to itself so the
    // calc style keys resolve to real catalog items where names match.
    const styleItemTypeMap = { ...(config.styleItemTypeMap || {}) };
    for (const it of stockBlankItems) {
      if (!styleItemTypeMap[it.name]) styleItemTypeMap[it.name] = { id: it.id, name: it.name };
    }
    onCompute({
      csvOld, csvNew,
      grandTotal: Number(grandTotal),
      perTypeTotals,
      perTypeSizeRestrictions: restrictions,
      policyOverrides,
      styleItemTypeMap,
    });
  }

  return (
    <div className="blank-order-params">
      <h2>Blank Order — Parameters</h2>
      {error && <div className="error-banner">{error}</div>}

      <div className="field-group">
        <label htmlFor="csv-old">Older CSV</label>
        <textarea id="csv-old" value={csvOld} onChange={e => setCsvOld(e.target.value)} placeholder="Paste the older Square catalog export, or choose a file" />
        <input type="file" accept=".csv" aria-label="Upload file for old export" onChange={readFileInto(setCsvOld)} />
      </div>
      <div className="field-group">
        <label htmlFor="csv-new">Newer CSV</label>
        <textarea id="csv-new" value={csvNew} onChange={e => setCsvNew(e.target.value)} placeholder="Paste the newer Square catalog export, or choose a file" />
        <input type="file" accept=".csv" aria-label="Upload file for new export" onChange={readFileInto(setCsvNew)} />
      </div>

      <div className="field-group">
        <label htmlFor="grand-total">Total blanks</label>
        <input id="grand-total" type="number" min="1" value={grandTotal} onChange={e => setGrandTotal(e.target.value)} />
      </div>

      <div className="field-group">
        <label>Per-item-type totals (optional override) &amp; size restrictions</label>
        {styleNames.map(name => (
          <div key={name} className="per-type-row">
            <strong>{name}</strong>
            <input
              type="number" min="0" placeholder="auto"
              aria-label={`${name} total`}
              value={perTypeTotals[name] ?? ''}
              onChange={e => setPerTypeTotals(p => ({ ...p, [name]: e.target.value === '' ? '' : Number(e.target.value) }))}
            />
            <span className="size-restrict">
              {ALL_SIZES.map(size => (
                <label key={size} className="size-check">
                  <input
                    type="checkbox"
                    aria-label={`${name} exclude ${size}`}
                    checked={(restrictions[name] || []).includes(size)}
                    onChange={() => toggleSize(name, size)}
                  />{size}
                </label>
              ))}
            </span>
          </div>
        ))}
      </div>

      <button className="btn-secondary" onClick={() => setShowAdvanced(s => !s)}>
        {showAdvanced ? 'Hide advanced policy' : 'Show advanced policy'}
      </button>
      {showAdvanced && (
        <div className="advanced-policy">
          <div className="field-group">
            <label htmlFor="blend">Blend weight (0–1)</label>
            <input id="blend" type="number" step="0.1" min="0" max="1" value={blendWeight} onChange={e => setBlendWeight(e.target.value)} />
          </div>
          <div className="field-group">
            <label htmlFor="floor">Core-color floor %</label>
            <input id="floor" type="number" step="0.05" min="0" max="1" value={floorPct} onChange={e => setFloorPct(e.target.value)} />
          </div>
          <div className="field-group">
            <label htmlFor="excol">Excluded colors (comma-separated)</label>
            <input id="excol" value={excludedColors} onChange={e => setExcludedColors(e.target.value)} />
          </div>
          <div className="field-group">
            <label htmlFor="aliases">Color aliases (one per line, sold=blank)</label>
            <textarea id="aliases" value={aliases} onChange={e => setAliases(e.target.value)} />
          </div>
        </div>
      )}

      <button className="btn-primary" onClick={handleCompute}>Compute →</button>
    </div>
  );
}
