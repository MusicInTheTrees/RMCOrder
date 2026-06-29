import { useDesigns } from '../hooks/useDesigns';
import Toast from './Toast';

export default function DesignPicker({ value, onChange }) {
  const { designs, loading, toast, clearToast, refresh } = useDesigns();

  return (
    <div className="design-picker">
      <div className="design-picker-toolbar">
        <span className="design-picker-current">
          {value ? `Selected: ${value}` : 'None selected'}
        </span>
        <div className="design-picker-actions">
          {value && (
            <button onClick={() => onChange('')}>Clear</button>
          )}
          <button onClick={refresh} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh Designs'}
          </button>
        </div>
      </div>
      <div className="design-picker-grid">
        {designs.length === 0 && (
          <p className="design-empty">No designs synced yet. Click Refresh to pull from Drive.</p>
        )}
        {designs.map(d => (
          <div
            key={d.name}
            className={`design-thumb selectable${value === d.name ? ' selected' : ''}`}
            onClick={() => onChange(d.name === value ? '' : d.name)}
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
