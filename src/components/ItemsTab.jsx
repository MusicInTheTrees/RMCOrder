import { useState } from 'react';
import { useItems } from '../hooks/useItems';
import ColorPicker from './ColorPicker';
import Toast from './Toast';
import ConfirmDialog from './ConfirmDialog';

function ColorColumn({ label, colors, onMove, onSwatchChange, moveLabel, moveSymbol }) {
  return (
    <div className="active-inactive-col">
      <div className="active-inactive-col-header">{label}</div>
      {colors.map(c => (
        <div key={c.name} className="ai-row">
          <span
            className={`color-swatch${c.hex ? '' : ' no-color'}`}
            style={c.hex ? { background: c.hex } : {}}
            onClick={() => onSwatchChange(c.name, c.hex)}
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
  const [selectedId, setSelectedId] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirmPull, setConfirmPull] = useState(false);
  const [expandedColor, setExpandedColor] = useState(null); // { name, hex }
  const [scrapeResult, setScrapeResult] = useState(null);

  const selectedItem = catalog.items.find(i => i.id === selectedId) || null;

  async function handleCreate() {
    try {
      const item = await createItem();
      setSelectedId(item.id);
    } catch (err) {
      setToast(`Failed to create item: ${err.message}`);
    }
  }

  async function handleDelete() {
    if (!selectedItem) return;
    await deleteItem(selectedItem.id);
    setSelectedId(null);
  }

  async function handlePush() {
    try {
      await pushToDrive();
      setToast('Pushed to Drive!');
    } catch (err) {
      setToast(`Push failed: ${err.message}`);
    }
  }

  async function handlePull() {
    try {
      const result = await pullFromDrive();
      if (result.error) { setToast(`Pull failed: ${result.error}`); return; }
      setToast('Pulled from Drive!');
      setSelectedId(null);
    } catch (err) {
      setToast(`Pull failed: ${err.message}`);
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
        <button className="btn-secondary" onClick={handlePush}>Push to Drive</button>
        <button className="btn-secondary" onClick={() => setConfirmPull(true)}>Pull from Drive</button>
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
                <label>Supplier URL</label>
                <input
                  value={selectedItem.supplierUrl || ''}
                  onChange={e => updateField('supplierUrl', e.target.value)}
                  placeholder="https://supplier.com/product/..."
                />
              </div>
              {/* Colors section */}
              <div className="active-inactive-section">
                <div className="active-inactive-label">Colors</div>
                <div className="active-inactive-cols">
                  <ColorColumn
                    label="Active"
                    colors={selectedItem.colors.filter(c => c.active)}
                    onMove={(name) => moveColor(name, false)}
                    onSwatchChange={(name, hex) => changeColorSwatch(name, hex)}
                    moveLabel="Move to inactive"
                    moveSymbol="→"
                  />
                  <ColorColumn
                    label="Inactive"
                    colors={selectedItem.colors.filter(c => !c.active)}
                    onMove={(name) => moveColor(name, true)}
                    onSwatchChange={(name, hex) => changeColorSwatch(name, hex)}
                    moveLabel="Move to active"
                    moveSymbol="←"
                  />
                </div>
                <div className="ai-add-row">
                  <input
                    className="ai-add-input"
                    placeholder="Color name..."
                    id={`add-color-${selectedItem.id}`}
                  />
                  <button className="btn-secondary ai-add-btn" onClick={() => {
                    const inp = document.getElementById(`add-color-${selectedItem.id}`);
                    const name = inp.value.trim();
                    if (!name || selectedItem.colors.find(c => c.name.toLowerCase() === name.toLowerCase())) return;
                    inp.value = '';
                    updateItem({ ...selectedItem, colors: [...selectedItem.colors, { name, hex: null, active: true }] });
                  }}>Add</button>
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
