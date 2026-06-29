import { useState } from 'react';
import { useBugLog } from '../context/BugLogContext';
import ConfirmDialog from './ConfirmDialog';
import Toast from './Toast';

export default function BugLogTab() {
  const { entries, clear } = useBugLog();
  const [confirmClear, setConfirmClear] = useState(false);
  const [toast, setToast] = useState(null);

  async function handleClear() {
    try {
      await clear();
      setToast('Bug log cleared.');
    } catch (err) {
      setToast(`Failed to clear log: ${err.message}`);
    }
  }

  const sorted = [...entries].reverse();

  return (
    <div className="buglog-tab">
      <div className="buglog-header">
        <span className="buglog-count">{entries.length} error{entries.length !== 1 ? 's' : ''} logged</span>
        <button className="btn-danger" onClick={() => setConfirmClear(true)} disabled={entries.length === 0}>
          Clear Log
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="buglog-empty">No errors logged.</p>
      ) : (
        <div className="buglog-entries">
          {sorted.map((e, i) => (
            <div key={i} className="buglog-entry">
              <span className="buglog-time">{new Date(e.timestamp).toLocaleString()}</span>
              <span className="buglog-msg">{e.message}</span>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        message={confirmClear ? 'Clear the entire bug log on Drive? This cannot be undone.' : null}
        onConfirm={() => { setConfirmClear(false); handleClear(); }}
        onCancel={() => setConfirmClear(false)}
      />
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
