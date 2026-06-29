import { useState } from 'react';
import { useItems } from '../hooks/useItems';
import Toast from './Toast';
import ConfirmDialog from './ConfirmDialog';

export default function ItemsTab() {
  const { catalog, loading, createItem, updateItem, deleteItem, pushToDrive, pullFromDrive } = useItems();
  const [selectedId, setSelectedId] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirmPull, setConfirmPull] = useState(false);

  const selectedItem = catalog.items.find(i => i.id === selectedId) || null;

  async function handleCreate() {
    const item = await createItem();
    setSelectedId(item.id);
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
              {/* Colors, Sizes, Decoration Methods added in Tasks 8-9 */}
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
