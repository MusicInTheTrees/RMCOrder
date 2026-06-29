import { useRef, useEffect } from 'react';
import { useDesigns } from '../hooks/useDesigns';
import Toast from './Toast';

export default function DesignBrowser({ onSelect, selectionMode = false, selectionLabel = '', onCancel }) {
  const { designs, loading, toast, clearToast, refresh } = useDesigns();
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (selectionMode) {
      el.classList.remove('selecting');
      void el.offsetWidth; // force reflow so animation restarts each time
      el.classList.add('selecting');
    } else {
      el.classList.remove('selecting');
    }
  }, [selectionMode]);

  return (
    <div className="design-browser" ref={containerRef}>
      <div className="design-browser-header">
        {selectionMode ? (
          <>
            <span className="selection-label">Select {selectionLabel} design</span>
            <button onClick={onCancel}>Cancel</button>
          </>
        ) : (
          <>
            <span>Designs</span>
            <button onClick={refresh} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </>
        )}
      </div>
      <div className="design-grid">
        {designs.length === 0 && (
          <p className="design-empty">No designs synced yet. Click Refresh to pull from Drive.</p>
        )}
        {designs.map(d => (
          <div
            key={d.name}
            className={`design-thumb ${selectionMode ? 'selectable' : ''}`}
            onClick={() => selectionMode && onSelect && onSelect(d.name)}
          >
            <img src={d.url} alt={d.name} />
            <span>{d.name}</span>
          </div>
        ))}
      </div>
      <Toast message={toast} onDismiss={clearToast} />
    </div>
  );
}
