import { useState } from 'react';
import StateBadge from './StateBadge';
import ConfirmDialog from './ConfirmDialog';

const STATE_ORDER = ['building', 'sent', 'pending', 'paid', 'fulfilled', 'received', 'shipped'];

export default function OrderTopBar({ order, onAdvanceState, onRegressState, onGenerateDraft, saving, onNameChange }) {
  const [confirmState, setConfirmState] = useState(false);
  const [confirmRegress, setConfirmRegress] = useState(false);
  const [confirmDraft, setConfirmDraft] = useState(false);

  const nextState = STATE_ORDER[STATE_ORDER.indexOf(order?.state) + 1];
  const prevState = STATE_ORDER[STATE_ORDER.indexOf(order?.state) - 1];

  return (
    <div className="order-top-bar">
      <div className="order-title-group">
        <input
          className="order-name-input"
          value={order?.orderName || ''}
          onChange={e => onNameChange(e.target.value)}
          placeholder="Add order name..."
        />
        <span className="order-id-label">{order?.orderId}</span>
        <div className="order-links">
          {order?.folderId && (
            <a
              className="order-drive-link"
              href={`https://drive.google.com/drive/folders/${order.folderId}`}
              target="_blank"
              rel="noreferrer"
            >Drive Folder ↗</a>
          )}
          {order?.sheetId && (
            <a
              className="order-drive-link"
              href={`https://docs.google.com/spreadsheets/d/${order.sheetId}`}
              target="_blank"
              rel="noreferrer"
            >Sheet ↗</a>
          )}
        </div>
      </div>

      <button className="btn-primary" onClick={() => setConfirmDraft(true)}>
        Generate Email Draft
      </button>

      {saving && <span className="saving-indicator">Saving...</span>}

      <div className="order-state-controls">
        {prevState && (
          <button className="move-to-btn move-back-btn" onClick={() => setConfirmRegress(true)}>
            ← Move back
          </button>
        )}
        <div className="order-state-current">
          <span className="order-state-label">Current State</span>
          <StateBadge state={order?.state} />
        </div>
        {nextState && (
          <>
            <button className="move-to-btn" onClick={() => setConfirmState(true)}>
              Move to →
            </button>
            <div className="order-state-next">
              <span className="order-state-label">Next State</span>
              <StateBadge state={nextState} dimmed />
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        message={confirmState ? `Move order to "${nextState}"?` : null}
        onConfirm={() => { setConfirmState(false); onAdvanceState(nextState); }}
        onCancel={() => setConfirmState(false)}
      />
      <ConfirmDialog
        message={confirmRegress ? `Move order back to "${prevState}"?` : null}
        onConfirm={() => { setConfirmRegress(false); onRegressState(prevState); }}
        onCancel={() => setConfirmRegress(false)}
      />
      <ConfirmDialog
        message={confirmDraft ? 'Create Gmail draft for this order?' : null}
        onConfirm={() => { setConfirmDraft(false); onGenerateDraft(); }}
        onCancel={() => setConfirmDraft(false)}
      />
    </div>
  );
}
