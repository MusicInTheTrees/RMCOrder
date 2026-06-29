import { useState } from 'react';
import SizeButtons from './SizeButtons';
import ConfirmDialog from './ConfirmDialog';

const APPAREL_TYPES = ["Youth", "Women's Round Neck", "Women's V-Neck", "Men's T-Shirt", "Tote"];
const COLORS = ['White', 'Black', 'Navy', 'Red', 'Forest Green', 'Royal Blue', 'Heather Grey'];

export default function LineItemCard({ item, onChange, onRemove, onAddDesign }) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  function update(field, value) {
    onChange({ ...item, [field]: value });
  }

  function removeDesign(placement, idx) {
    const field = placement === 'front' ? 'frontDesigns' : 'backDesigns';
    const updated = (item[field] || []).filter((_, i) => i !== idx);
    update(field, updated);
  }

  return (
    <div className="line-item-card">
      <div className="line-item-header">
        <span className="line-item-num">#{item.num}</span>
        <button className="btn-danger" onClick={() => setConfirmRemove(true)}>Remove</button>
      </div>

      <div className="field-group">
        <label>Apparel Type</label>
        <div className="btn-group">
          {APPAREL_TYPES.map(t => (
            <button
              key={t}
              className={item.apparelType === t ? 'active' : ''}
              onClick={() => update('apparelType', t)}
            >{t}</button>
          ))}
        </div>
      </div>

      <div className="field-group">
        <label>Color</label>
        <div className="btn-group">
          {COLORS.map(c => (
            <button
              key={c}
              className={item.color === c ? 'active' : ''}
              onClick={() => update('color', c)}
            >{c}</button>
          ))}
        </div>
      </div>

      <div className="field-group">
        <label>Sizes</label>
        <SizeButtons sizes={item.sizes} onChange={sizes => update('sizes', sizes)} />
      </div>

      <div className="placement-section">
        <div className="placement-header">
          <span className="placement-label">Front</span>
          <button onClick={() => onAddDesign('front')}>+ Add Design</button>
        </div>
        {(item.frontDesigns || []).map((d, i) => (
          <div key={i} className="design-row">
            <span>{d.designNum}. {d.file}</span>
            <button onClick={() => removeDesign('front', i)}>×</button>
          </div>
        ))}
        <textarea
          className="placement-notes"
          value={item.frontNotes || ''}
          onChange={e => update('frontNotes', e.target.value)}
          placeholder="Front placement notes..."
        />
      </div>

      <div className="placement-section">
        <div className="placement-header">
          <span className="placement-label">Back</span>
          <button onClick={() => onAddDesign('back')}>+ Add Design</button>
        </div>
        {(item.backDesigns || []).map((d, i) => (
          <div key={i} className="design-row">
            <span>{d.designNum}. {d.file}</span>
            <button onClick={() => removeDesign('back', i)}>×</button>
          </div>
        ))}
        <textarea
          className="placement-notes"
          value={item.backNotes || ''}
          onChange={e => update('backNotes', e.target.value)}
          placeholder="Back placement notes..."
        />
      </div>

      <ConfirmDialog
        message={confirmRemove ? 'Remove this line item?' : null}
        onConfirm={() => { setConfirmRemove(false); onRemove(); }}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}
