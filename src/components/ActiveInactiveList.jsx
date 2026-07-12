import { useState, useRef } from 'react';

// Generic two-column active/inactive editor used for item colors, sizes, and
// decoration methods. The parent owns ordering/filtering; this component owns
// the shared row UI, drag-reorder wiring, and the add-entry input.
export default function ActiveInactiveList({
  label,             // section label, e.g. "Colors"
  itemLabel,         // singular noun for tooltips, e.g. "color"
  activeItems,
  inactiveItems,
  getKey,            // entry => display/key string
  onToggle,          // (key, makeActive) => void
  onDelete,          // (key) => void
  onReorder,         // (fromIdx, dropIdx) => void — indices within activeItems
  onAdd,             // (name) => void
  addPlaceholder,
  addPlacement = 'activeColumn', // 'activeColumn' | 'below'
  renderLeading,     // optional (entry) => node rendered before the name
  children,          // optional extra content below the columns
}) {
  const [newName, setNewName] = useState('');
  const dragIdx = useRef(null);

  function submitAdd() {
    const name = newName.trim();
    if (!name) return;
    setNewName('');
    onAdd(name);
  }

  const addRow = (
    <div className="ai-add-row">
      <input
        className="ai-add-input"
        placeholder={addPlaceholder}
        value={newName}
        onChange={e => setNewName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submitAdd(); }}
      />
      <button className="btn-secondary ai-add-btn" onClick={submitAdd}>Add</button>
    </div>
  );

  return (
    <div className="active-inactive-section">
      <div className="active-inactive-label">{label}</div>
      <div className="active-inactive-cols">
        <div className="active-inactive-col">
          <div className="active-inactive-col-header">Active (drag to reorder)</div>
          {activeItems.map((entry, idx) => (
            <div
              key={getKey(entry)}
              className="ai-row"
              draggable
              onDragStart={() => { dragIdx.current = idx; }}
              onDragOver={e => e.preventDefault()}
              onDrop={() => {
                if (dragIdx.current === null || dragIdx.current === idx) { dragIdx.current = null; return; }
                const from = dragIdx.current;
                dragIdx.current = null;
                onReorder(from, idx);
              }}
            >
              <span className="drag-handle">⠿</span>
              {renderLeading && renderLeading(entry)}
              <span className="ai-row-name">{getKey(entry)}</span>
              <button className="ai-move-btn" title="Move to inactive" onClick={() => onToggle(getKey(entry), false)}>→</button>
              <button className="ai-delete-btn" title={`Delete ${itemLabel}`} onClick={() => onDelete(getKey(entry))}>×</button>
            </div>
          ))}
          {addPlacement === 'activeColumn' && addRow}
        </div>
        <div className="active-inactive-col">
          <div className="active-inactive-col-header">Inactive</div>
          {inactiveItems.map(entry => (
            <div key={getKey(entry)} className="ai-row">
              {renderLeading && renderLeading(entry)}
              <span className="ai-row-name">{getKey(entry)}</span>
              <button className="ai-move-btn" title="Move to active" onClick={() => onToggle(getKey(entry), true)}>←</button>
              <button className="ai-delete-btn" title={`Delete ${itemLabel}`} onClick={() => onDelete(getKey(entry))}>×</button>
            </div>
          ))}
        </div>
      </div>
      {addPlacement === 'below' && addRow}
      {children}
    </div>
  );
}
