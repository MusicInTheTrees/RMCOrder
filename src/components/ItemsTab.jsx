import { useState, useRef, useEffect } from 'react';
import { useItems } from '../hooks/useItems';
import { useBugLog } from '../context/BugLogContext';
import ColorPicker from './ColorPicker';
import Toast from './Toast';
import ConfirmDialog from './ConfirmDialog';

function ColorColumn({ label, colors, onMove, onSwatchChange, onOpenPicker, moveLabel, moveSymbol, onDragStart, onDrop }) {
  return (
    <div className="active-inactive-col">
      <div className="active-inactive-col-header">{label}</div>
      {colors.map((c, idx) => (
        <div
          key={c.name}
          className="ai-row"
          draggable={!!onDragStart}
          onDragStart={onDragStart ? () => onDragStart(idx) : undefined}
          onDragOver={onDragStart ? e => e.preventDefault() : undefined}
          onDrop={onDrop ? () => onDrop(idx) : undefined}
        >
          {onDragStart && <span className="drag-handle">⠿</span>}
          <span
            className={`color-swatch${c.hex ? '' : ' no-color'}`}
            style={c.hex ? { background: c.hex } : {}}
            onClick={() => onOpenPicker(c.name, c.hex)}
            title="Edit swatch"
          />
          <span className="ai-row-name">{c.name}</span>
          <button className="ai-move-btn" title={moveLabel} onClick={() => onMove(c.name)}>
            {moveSymbol}
          </button>
        </div>
      ))}
    </div>
  );
}

export default function ItemsTab() {
  const { catalog, loading, createItem, updateItem, deleteItem, scrapeColors, pushToDrive, pullFromDrive } = useItems();
  const { logError } = useBugLog();
  const [selectedId, setSelectedId] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirmPull, setConfirmPull] = useState(false);
  const [expandedColor, setExpandedColor] = useState(null); // { name, hex }
  const [scrapeResult, setScrapeResult] = useState(null);
  const dragSizeIdx = useRef(null);
  const dragColorIdx = useRef(null);
  const dragMethodIdx = useRef(null);
  const [newColorName, setNewColorName] = useState('');
  const [newSizeLabel, setNewSizeLabel] = useState('');
  const [newMethodName, setNewMethodName] = useState('');

  useEffect(() => {
    setNewColorName('');
    setNewSizeLabel('');
    setNewMethodName('');
  }, [selectedId]);

  const selectedItem = catalog.items.find(i => i.id === selectedId) || null;

  async function handleCreate() {
    try {
      const item = await createItem();
      setSelectedId(item.id);
    } catch (err) {
      const msg = `Failed to create item: ${err.message}`;
      setToast(msg); logError(msg);
    }
  }

  async function handleDelete() {
    if (!selectedItem) return;
    try {
      await deleteItem(selectedItem.id);
      setSelectedId(null);
    } catch (err) {
      const msg = `Failed to delete item: ${err.message}`;
      setToast(msg); logError(msg);
    }
  }

  async function handlePush() {
    try {
      await pushToDrive();
      setToast('Pushed to Drive!');
    } catch (err) {
      const msg = `Push failed: ${err.message}`;
      setToast(msg); logError(msg);
    }
  }

  async function handlePull() {
    try {
      const result = await pullFromDrive();
      if (result.error) { const m = `Pull failed: ${result.error}`; setToast(m); logError(m); return; }
      setToast('Pulled from Drive!');
      setSelectedId(null);
    } catch (err) {
      const msg = `Pull failed: ${err.message}`;
      setToast(msg); logError(msg);
    }
  }

  function updateField(field, value) {
    if (!selectedItem) return;
    updateItem({ ...selectedItem, [field]: value });
  }

  function moveColor(name, makeActive) {
    if (!selectedItem) return;
    updateItem({
      ...selectedItem,
      colors: selectedItem.colors.map(c => c.name === name ? { ...c, active: makeActive } : c),
    });
  }

  function changeColorSwatch(name, hex) {
    if (!selectedItem) return;
    updateItem({
      ...selectedItem,
      colors: selectedItem.colors.map(c => c.name === name ? { ...c, hex } : c),
    });
  }

  function moveSize(label, makeActive) {
    if (!selectedItem) return;
    const activeSizes = selectedItem.sizes.filter(s => s.active && s.label !== label).sort((a, b) => a.order - b.order);
    const maxOrder = activeSizes.length > 0 ? Math.max(...activeSizes.map(s => s.order)) : -1;
    updateItem({
      ...selectedItem,
      sizes: selectedItem.sizes.map(s => s.label === label
        ? { ...s, active: makeActive, order: makeActive ? maxOrder + 1 : s.order }
        : s
      ),
    });
  }

  function reorderSize(dropIdx) {
    if (!selectedItem || dragSizeIdx.current === null) return;
    const fromIdx = dragSizeIdx.current;
    dragSizeIdx.current = null;
    if (fromIdx === dropIdx) return;
    const active = [...selectedItem.sizes].filter(s => s.active).sort((a, b) => a.order - b.order);
    const [moved] = active.splice(fromIdx, 1);
    active.splice(dropIdx, 0, moved);
    const reordered = active.map((s, i) => ({ ...s, order: i }));
    updateItem({
      ...selectedItem,
      sizes: selectedItem.sizes.map(s => {
        const found = reordered.find(r => r.label === s.label);
        return found || s;
      }),
    });
  }

  function reorderColor(dropIdx) {
    if (!selectedItem || dragColorIdx.current === null) return;
    const fromIdx = dragColorIdx.current;
    dragColorIdx.current = null;
    if (fromIdx === dropIdx) return;
    const active = selectedItem.colors.filter(c => c.active);
    const inactive = selectedItem.colors.filter(c => !c.active);
    const [moved] = active.splice(fromIdx, 1);
    active.splice(dropIdx, 0, moved);
    updateItem({ ...selectedItem, colors: [...active, ...inactive] });
  }

  function reorderMethod(dropIdx) {
    if (!selectedItem || dragMethodIdx.current === null) return;
    const fromIdx = dragMethodIdx.current;
    dragMethodIdx.current = null;
    if (fromIdx === dropIdx) return;
    const active = selectedItem.decorationMethods.filter(m => m.active);
    const inactive = selectedItem.decorationMethods.filter(m => !m.active);
    const [moved] = active.splice(fromIdx, 1);
    active.splice(dropIdx, 0, moved);
    updateItem({ ...selectedItem, decorationMethods: [...active, ...inactive] });
  }

  function addColor() {
    const name = newColorName.trim();
    if (!name || selectedItem.colors.find(c => c.name.toLowerCase() === name.toLowerCase())) return;
    setNewColorName('');
    updateItem({ ...selectedItem, colors: [...selectedItem.colors, { name, hex: null, active: true }] });
  }

  function addSize() {
    const label = newSizeLabel.trim();
    if (!label || selectedItem.sizes.find(s => s.label === label)) return;
    setNewSizeLabel('');
    const maxOrder = Math.max(-1, ...selectedItem.sizes.filter(s => s.active).map(s => s.order));
    updateItem({ ...selectedItem, sizes: [...selectedItem.sizes, { label, active: true, order: maxOrder + 1 }] });
  }

  function addMethod() {
    const name = newMethodName.trim();
    if (!name || selectedItem.decorationMethods.find(m => m.name === name)) return;
    setNewMethodName('');
    updateItem({ ...selectedItem, decorationMethods: [...selectedItem.decorationMethods, { name, active: true }] });
  }

  function moveMethod(name, makeActive) {
    if (!selectedItem) return;
    updateItem({
      ...selectedItem,
      decorationMethods: selectedItem.decorationMethods.map(m =>
        m.name === name ? { ...m, active: makeActive } : m
      ),
    });
  }

  async function handleScrapeColors(id) {
    setScrapeResult('Scraping...');
    try {
      const result = await scrapeColors(id);
      if (result.error) { setScrapeResult(`Error: ${result.error}`); return; }
      setScrapeResult(`Added ${result.added}, skipped ${result.skipped}`);
    } catch (err) {
      setScrapeResult(`Error: ${err.message}`);
    }
  }

  if (loading) return <div className="loading">Loading catalog...</div>;

  return (
    <div className="items-tab">
      <div className="items-sync-bar">
        <button className="btn-secondary" onClick={handlePush}>⬆ Push to Drive</button>
        <button className="btn-secondary items-pull-btn" onClick={() => setConfirmPull(true)}>⬇ Pull from Drive</button>
      </div>

      <div className="items-layout">
        <div className="items-list-panel">
          {catalog.items.map(item => (
            <div
              key={item.id}
              className={`items-list-row${selectedId === item.id ? ' selected' : ''}`}
              onClick={() => setSelectedId(item.id)}
            >
              {item.name}
            </div>
          ))}
          <button className="btn-secondary items-new-btn" onClick={handleCreate}>+ New Item</button>
        </div>

        <div className="items-editor-panel">
          {!selectedItem ? (
            <p className="items-empty">Select an item to edit, or create a new one.</p>
          ) : (
            <>
              <div className="field-group">
                <label>Name</label>
                <input
                  value={selectedItem.name}
                  onChange={e => updateField('name', e.target.value)}
                />
              </div>
              <div className="field-group">
                <label>Inventory Item</label>
                <input
                  value={selectedItem.inventoryItem || ''}
                  onChange={e => updateField('inventoryItem', e.target.value)}
                  placeholder="e.g. shirt, tote"
                />
              </div>
              <div className="field-group">
                <label>Inventory Style</label>
                <input
                  value={selectedItem.inventoryStyle || ''}
                  onChange={e => updateField('inventoryStyle', e.target.value)}
                  placeholder="e.g. Unisex, V-Neck"
                />
              </div>
              <div className="field-group">
                <label>Supplier URL</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={selectedItem.supplierUrl || ''}
                    onChange={e => updateField('supplierUrl', e.target.value)}
                    placeholder="https://supplier.com/product/..."
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn-secondary"
                    disabled={!selectedItem.supplierUrl}
                    onClick={() => window.open(selectedItem.supplierUrl, '_blank', 'noopener,noreferrer')}
                    title="Open in new tab"
                  >↗</button>
                </div>
              </div>
              {/* Colors section */}
              <div className="active-inactive-section">
                <div className="active-inactive-label">Colors</div>
                <div className="active-inactive-cols">
                  <ColorColumn
                    label="Active (drag to reorder)"
                    colors={selectedItem.colors.filter(c => c.active)}
                    onMove={(name) => moveColor(name, false)}
                    onSwatchChange={(name, hex) => changeColorSwatch(name, hex)}
                    onOpenPicker={(name, hex) => setExpandedColor({ name, hex })}
                    moveLabel="Move to inactive"
                    moveSymbol="→"
                    onDragStart={(idx) => { dragColorIdx.current = idx; }}
                    onDrop={(idx) => reorderColor(idx)}
                  />
                  <ColorColumn
                    label="Inactive"
                    colors={selectedItem.colors.filter(c => !c.active)}
                    onMove={(name) => moveColor(name, true)}
                    onSwatchChange={(name, hex) => changeColorSwatch(name, hex)}
                    onOpenPicker={(name, hex) => setExpandedColor({ name, hex })}
                    moveLabel="Move to active"
                    moveSymbol="←"
                  />
                </div>
                <div className="ai-add-row">
                  <input
                    className="ai-add-input"
                    placeholder="Color name..."
                    value={newColorName}
                    onChange={e => setNewColorName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addColor(); }}
                  />
                  <button className="btn-secondary ai-add-btn" onClick={addColor}>Add</button>
                </div>
                {/* Scrape from URL */}
                <div className="scrape-row">
                  <button className="btn-secondary" onClick={() => handleScrapeColors(selectedItem.id)}>
                    Scrape Colors from URL
                  </button>
                  {scrapeResult && <span className="scrape-result">{scrapeResult}</span>}
                </div>
              </div>
              {/* Color picker open state managed per-color via expandedColor state */}
              {expandedColor && (
                <div className="color-picker-popover">
                  <ColorPicker
                    hex={expandedColor.hex}
                    onChange={(hex) => {
                      changeColorSwatch(expandedColor.name, hex);
                      setExpandedColor(prev => ({ ...prev, hex }));
                    }}
                  />
                  <button onClick={() => setExpandedColor(null)}>Done</button>
                </div>
              )}
              {/* Sizes section */}
              <div className="active-inactive-section">
                <div className="active-inactive-label">Sizes</div>
                <div className="active-inactive-cols">
                  <div className="active-inactive-col">
                    <div className="active-inactive-col-header">Active (drag to reorder)</div>
                    {[...selectedItem.sizes].filter(s => s.active).sort((a, b) => a.order - b.order).map((s, idx, arr) => (
                      <div
                        key={s.label}
                        className="ai-row"
                        draggable
                        onDragStart={() => { dragSizeIdx.current = idx; }}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => reorderSize(idx)}
                      >
                        <span className="drag-handle">⠿</span>
                        <span className="ai-row-name">{s.label}</span>
                        <button className="ai-move-btn" title="Move size to inactive" onClick={() => moveSize(s.label, false)}>→</button>
                      </div>
                    ))}
                    <div className="ai-add-row">
                      <input
                        className="ai-add-input"
                        placeholder="Label..."
                        value={newSizeLabel}
                        onChange={e => setNewSizeLabel(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addSize(); }}
                      />
                      <button className="btn-secondary ai-add-btn" onClick={addSize}>Add</button>
                    </div>
                  </div>
                  <div className="active-inactive-col">
                    <div className="active-inactive-col-header">Inactive</div>
                    {selectedItem.sizes.filter(s => !s.active).map(s => (
                      <div key={s.label} className="ai-row">
                        <span className="ai-row-name">{s.label}</span>
                        <button className="ai-move-btn" title="Move size to active" onClick={() => moveSize(s.label, true)}>←</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Decoration Methods section */}
              <div className="active-inactive-section">
                <div className="active-inactive-label">Decoration Methods</div>
                <div className="active-inactive-cols">
                  <div className="active-inactive-col">
                    <div className="active-inactive-col-header">Active (drag to reorder)</div>
                    {selectedItem.decorationMethods.filter(m => m.active).map((m, idx) => (
                      <div
                        key={m.name}
                        className="ai-row"
                        draggable
                        onDragStart={() => { dragMethodIdx.current = idx; }}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => reorderMethod(idx)}
                      >
                        <span className="drag-handle">⠿</span>
                        <span className="ai-row-name">{m.name}</span>
                        <button className="ai-move-btn" title="Move to inactive" onClick={() => moveMethod(m.name, false)}>→</button>
                      </div>
                    ))}
                    <div className="ai-add-row">
                      <input
                        className="ai-add-input"
                        placeholder="Method name..."
                        value={newMethodName}
                        onChange={e => setNewMethodName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addMethod(); }}
                      />
                      <button className="btn-secondary ai-add-btn" onClick={addMethod}>Add</button>
                    </div>
                  </div>
                  <div className="active-inactive-col">
                    <div className="active-inactive-col-header">Inactive</div>
                    {selectedItem.decorationMethods.filter(m => !m.active).map(m => (
                      <div key={m.name} className="ai-row">
                        <span className="ai-row-name">{m.name}</span>
                        <button className="ai-move-btn" title="Move to active" onClick={() => moveMethod(m.name, true)}>←</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <button className="btn-danger" onClick={handleDelete}>Delete Item</button>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        message={confirmPull ? 'This will overwrite your local catalog with the Drive version. Continue?' : null}
        onConfirm={() => { setConfirmPull(false); handlePull(); }}
        onCancel={() => setConfirmPull(false)}
      />
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
