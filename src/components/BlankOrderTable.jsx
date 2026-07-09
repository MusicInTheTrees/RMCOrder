// src/components/BlankOrderTable.jsx
import { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createOrder, getOrderBySheet, saveOrderToSheet } from '../api/orders';
import { blankRowsToLineItems } from '../utils/blankRowsToLineItems';

const SIZE_ORDER = {};
['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'].forEach((s, i) => { SIZE_ORDER[s] = i; });
const keyOf = r => `${r.itemType} ${r.color} ${r.size}`;

export default function BlankOrderTable({ plan, styleItemTypeMap, onBack }) {
  const navigate = useNavigate();
  const [working, setWorking] = useState({});   // key -> qty (string/number)
  const [customRows, setCustomRows] = useState([]); // [{ id, itemType, color, size, qty }]
  const nextId = useRef(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const indMap = useMemo(() => Object.fromEntries(plan.industry.map(r => [keyOf(r), r.qty])), [plan]);
  const blMap = useMemo(() => Object.fromEntries(plan.blended.map(r => [keyOf(r), r.qty])), [plan]);

  const baseRows = useMemo(() => {
    const byKey = new Map();
    for (const r of [...plan.industry, ...plan.blended]) {
      const k = keyOf(r);
      if (!byKey.has(k)) byKey.set(k, { itemType: r.itemType, color: r.color, size: r.size });
    }
    return [...byKey.values()].sort((a, b) =>
      (a.itemType < b.itemType ? -1 : a.itemType > b.itemType ? 1 : 0) ||
      (a.color < b.color ? -1 : a.color > b.color ? 1 : 0) ||
      ((SIZE_ORDER[a.size] ?? 99) - (SIZE_ORDER[b.size] ?? 99)));
  }, [plan]);

  function fillFrom(map) {
    const next = {};
    for (const r of baseRows) next[keyOf(r)] = map[keyOf(r)] || 0;
    setWorking(next);
    setCustomRows([]);
  }

  function setWorkingQty(k, val) { setWorking(w => ({ ...w, [k]: val })); }

  function addCustomRow() {
    setCustomRows(rows => [...rows, { id: nextId.current++, itemType: '', color: '', size: '', qty: '' }]);
  }
  function updateCustom(id, field, val) {
    setCustomRows(rows => rows.map(r => r.id === id ? { ...r, [field]: val } : r));
  }
  function removeCustom(id) {
    setCustomRows(rows => rows.filter(r => r.id !== id));
  }

  const baseWorking = baseRows
    .map(r => ({ itemType: r.itemType, color: r.color, size: r.size, qty: Number(working[keyOf(r)]) || 0 }));
  const customWorking = customRows
    .map(r => ({ itemType: r.itemType, color: r.color, size: r.size, qty: Number(r.qty) || 0 }));
  const workingRows = [...baseWorking, ...customWorking].filter(r => r.qty > 0);
  const workingTotal = workingRows.reduce((s, r) => s + r.qty, 0);
  const indTotal = plan.industry.reduce((s, r) => s + r.qty, 0);
  const blTotal = plan.blended.reduce((s, r) => s + r.qty, 0);
  const canGenerate = workingRows.length > 0 && !busy;

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    try {
      const lineItems = blankRowsToLineItems(workingRows, styleItemTypeMap);
      const { orderId, sheetId } = await createOrder();
      const base = await getOrderBySheet(sheetId);
      await saveOrderToSheet(sheetId, { ...base, orderId, sheetId, lineItems }, true);
      navigate(`/orders/${orderId}?sheetId=${sheetId}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="blank-order-table">
      {error && <div className="error-banner">{error}</div>}
      <div className="blank-order-scroll">
      <table>
        <colgroup>
          <col style={{ width: '22%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '10%' }} />
        </colgroup>
        <thead>
          <tr className="bo-action-row">
            <td><button className="btn-secondary" onClick={onBack}>← Parameters</button></td>
            <td></td>
            <td></td>
            <td><button className="btn-secondary" onClick={() => fillFrom(indMap)}>Use Industry →</button></td>
            <td><button className="btn-secondary" onClick={() => fillFrom(blMap)}>Use Blended →</button></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <th>Item Type</th><th>Color</th><th>Size</th>
            <th>Industry</th><th>Blended</th><th>Working</th><th></th>
          </tr>
        </thead>
        <tbody>
          {baseRows.map(r => {
            const k = keyOf(r);
            return (
              <tr key={k}>
                <td>{r.itemType}</td><td>{r.color}</td><td>{r.size}</td>
                <td>{indMap[k] || 0}</td>
                <td>{blMap[k] || 0}</td>
                <td>
                  <input type="number" min="0" aria-label={`working qty ${k}`}
                    value={working[k] ?? ''} onChange={e => setWorkingQty(k, e.target.value)} />
                </td>
                <td></td>
              </tr>
            );
          })}
          {customRows.map((r, i) => (
            <tr key={r.id}>
              <td><input aria-label={`custom type ${i}`} value={r.itemType} onChange={e => updateCustom(r.id, 'itemType', e.target.value)} /></td>
              <td><input aria-label={`custom color ${i}`} value={r.color} onChange={e => updateCustom(r.id, 'color', e.target.value)} /></td>
              <td><input aria-label={`custom size ${i}`} value={r.size} onChange={e => updateCustom(r.id, 'size', e.target.value)} /></td>
              <td>—</td><td>—</td>
              <td><input type="number" min="0" aria-label={`custom working qty ${i}`} value={r.qty} onChange={e => updateCustom(r.id, 'qty', e.target.value)} /></td>
              <td><button aria-label={`remove custom ${i}`} onClick={() => removeCustom(r.id)}>✕</button></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}><strong>Totals</strong></td>
            <td>{indTotal}</td><td>{blTotal}</td><td>{workingTotal}</td><td></td>
          </tr>
        </tfoot>
      </table>
      </div>
      <div className="blank-order-table-footer-actions">
        <button className="btn-secondary" onClick={addCustomRow}>+ Add custom row</button>
        <button className="btn-primary" disabled={!canGenerate} onClick={handleGenerate}>
          {busy ? 'Generating…' : 'Generate Order'}
        </button>
      </div>
    </div>
  );
}
