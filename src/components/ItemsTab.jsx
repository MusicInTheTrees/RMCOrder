import { useState, useEffect } from 'react';
import { useItems } from '../hooks/useItems';
import { useBugLog } from '../context/BugLogContext';
import { getInventoryStyles } from '../api/inventory';
import { refreshBlankStats } from '../api/stats';
import ActiveInactiveList from './ActiveInactiveList';
import ColorPicker from './ColorPicker';
import Toast from './Toast';
import ConfirmDialog from './ConfirmDialog';

export default function ItemsTab() {
  const { catalog, loading, createItem, updateItem, deleteItem, scrapeColors, pushToDrive, pullFromDrive } = useItems();
  const { logError } = useBugLog();
  const [selectedId, setSelectedId] = useState(null);
  const [styleOptions, setStyleOptions] = useState([]);
  const [toast, setToast] = useState(null);
  const [confirmPull, setConfirmPull] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedColor, setExpandedColor] = useState(null); // { name, hex }
  const [scrapeResult, setScrapeResult] = useState(null);

  useEffect(() => {
    getInventoryStyles().then(setStyleOptions).catch(() => {});
  }, []);

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

  async function handleRefreshStats() {
    setRefreshing(true);
    try {
      const r = await refreshBlankStats();
      setToast(`Updated ${r.rowCount} rows across ${r.orderCount} orders.`);
      window.open(r.sheetUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      const msg = `Refresh stats failed: ${err.message}`;
      setToast(msg); logError(msg);
    } finally {
      setRefreshing(false);
    }
  }

  function updateField(field, value) {
    if (!selectedItem) return;
    updateItem({ ...selectedItem, [field]: value });
  }

  // Replaces the collection at `field` (colors/sizes/decorationMethods) via updater(arr).
  function setCollection(field, updater) {
    if (!selectedItem) return;
    updateItem({ ...selectedItem, [field]: updater(selectedItem[field]) });
  }

  function toggleEntry(field, keyProp, key, makeActive) {
    setCollection(field, arr => arr.map(x => x[keyProp] === key ? { ...x, active: makeActive } : x));
  }

  function deleteEntry(field, keyProp, key) {
    setCollection(field, arr => arr.filter(x => x[keyProp] !== key));
  }

  // Colors/methods are ordered by array position: actives first, inactives appended.
  function reorderByPosition(field, fromIdx, dropIdx) {
    setCollection(field, arr => {
      const active = arr.filter(x => x.active);
      const inactive = arr.filter(x => !x.active);
      const [moved] = active.splice(fromIdx, 1);
      active.splice(dropIdx, 0, moved);
      return [...active, ...inactive];
    });
  }

  function changeColorSwatch(name, hex) {
    setCollection('colors', arr => arr.map(c => c.name === name ? { ...c, hex } : c));
  }

  // Sizes carry an explicit `order` field, so activation and reorder maintain it.
  function moveSize(label, makeActive) {
    if (!selectedItem) return;
    const activeSizes = selectedItem.sizes.filter(s => s.active && s.label !== label);
    const maxOrder = activeSizes.length > 0 ? Math.max(...activeSizes.map(s => s.order)) : -1;
    setCollection('sizes', arr => arr.map(s => s.label === label
      ? { ...s, active: makeActive, order: makeActive ? maxOrder + 1 : s.order }
      : s
    ));
  }

  function reorderSize(fromIdx, dropIdx) {
    setCollection('sizes', arr => {
      const active = arr.filter(s => s.active).sort((a, b) => a.order - b.order);
      const [moved] = active.splice(fromIdx, 1);
      active.splice(dropIdx, 0, moved);
      const reordered = active.map((s, i) => ({ ...s, order: i }));
      return arr.map(s => reordered.find(r => r.label === s.label) || s);
    });
  }

  function addColor(name) {
    if (selectedItem.colors.find(c => c.name.toLowerCase() === name.toLowerCase())) return;
    setCollection('colors', arr => [...arr, { name, hex: null, active: true }]);
  }

  function addSize(label) {
    if (selectedItem.sizes.find(s => s.label === label)) return;
    const maxOrder = Math.max(-1, ...selectedItem.sizes.filter(s => s.active).map(s => s.order));
    setCollection('sizes', arr => [...arr, { label, active: true, order: maxOrder + 1 }]);
  }

  function addMethod(name) {
    if (selectedItem.decorationMethods.find(m => m.name === name)) return;
    setCollection('decorationMethods', arr => [...arr, { name, active: true }]);
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
        <button className="btn-secondary" onClick={handleRefreshStats} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : '📊 Refresh Blank Stats'}
        </button>
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
                <label>
                  <input
                    type="checkbox"
                    checked={!!selectedItem.stockBlanks}
                    onChange={e => updateField('stockBlanks', e.target.checked)}
                  />
                  {' '}Stock blanks (include in blank demand stats)
                </label>
              </div>
              <div className="field-group">
                <label>Inventory Item</label>
                <input
                  value={selectedItem.inventoryItem || ''}
                  onChange={e => updateField('inventoryItem', e.target.value.toLowerCase())}
                  placeholder="e.g. shirt, tote"
                />
              </div>
              <div className="field-group">
                <label>Inventory Style</label>
                <input
                  value={selectedItem.inventoryStyle || ''}
                  onChange={e => updateField('inventoryStyle', e.target.value.toLowerCase())}
                  placeholder="e.g. unisex, womens v-neck"
                  list="inventory-style-options"
                />
                {styleOptions.length > 0 && (
                  <datalist id="inventory-style-options">
                    {styleOptions.map(s => <option key={s} value={s} />)}
                  </datalist>
                )}
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
              <ActiveInactiveList
                key={`colors-${selectedItem.id}`}
                label="Colors"
                itemLabel="color"
                activeItems={selectedItem.colors.filter(c => c.active)}
                inactiveItems={selectedItem.colors.filter(c => !c.active)}
                getKey={c => c.name}
                onToggle={(name, makeActive) => toggleEntry('colors', 'name', name, makeActive)}
                onDelete={name => deleteEntry('colors', 'name', name)}
                onReorder={(from, to) => reorderByPosition('colors', from, to)}
                onAdd={addColor}
                addPlaceholder="Color name..."
                addPlacement="below"
                renderLeading={c => (
                  <span
                    className={`color-swatch${c.hex ? '' : ' no-color'}`}
                    style={c.hex ? { background: c.hex } : {}}
                    onClick={() => setExpandedColor({ name: c.name, hex: c.hex })}
                    title="Edit swatch"
                  />
                )}
              >
                {/* Scrape from URL */}
                <div className="scrape-row">
                  <button className="btn-secondary" onClick={() => handleScrapeColors(selectedItem.id)}>
                    Scrape Colors from URL
                  </button>
                  {scrapeResult && <span className="scrape-result">{scrapeResult}</span>}
                </div>
              </ActiveInactiveList>
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
              <ActiveInactiveList
                key={`sizes-${selectedItem.id}`}
                label="Sizes"
                itemLabel="size"
                activeItems={[...selectedItem.sizes].filter(s => s.active).sort((a, b) => a.order - b.order)}
                inactiveItems={selectedItem.sizes.filter(s => !s.active)}
                getKey={s => s.label}
                onToggle={moveSize}
                onDelete={label => deleteEntry('sizes', 'label', label)}
                onReorder={reorderSize}
                onAdd={addSize}
                addPlaceholder="Label..."
              />

              {/* Decoration Methods section */}
              <ActiveInactiveList
                key={`methods-${selectedItem.id}`}
                label="Decoration Methods"
                itemLabel="method"
                activeItems={selectedItem.decorationMethods.filter(m => m.active)}
                inactiveItems={selectedItem.decorationMethods.filter(m => !m.active)}
                getKey={m => m.name}
                onToggle={(name, makeActive) => toggleEntry('decorationMethods', 'name', name, makeActive)}
                onDelete={name => deleteEntry('decorationMethods', 'name', name)}
                onReorder={(from, to) => reorderByPosition('decorationMethods', from, to)}
                onAdd={addMethod}
                addPlaceholder="Method name..."
              />
              <div className="field-group">
                <label>Public Notes</label>
                <textarea
                  value={selectedItem.publicNotes || ''}
                  onChange={e => updateField('publicNotes', e.target.value)}
                  placeholder="Included in order emails for this item type..."
                  rows={3}
                />
              </div>
              <div className="field-group">
                <label>Private Notes</label>
                <textarea
                  value={selectedItem.privateNotes || ''}
                  onChange={e => updateField('privateNotes', e.target.value)}
                  placeholder="Internal only — never shared..."
                  rows={3}
                />
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
