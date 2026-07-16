import { useState } from 'react';
import StateBadge from './StateBadge';
import ConfirmDialog from './ConfirmDialog';
import { STATE_LABELS } from '../emailStates';
import { STATE_ORDER } from '../orderStates';

const label = s => STATE_LABELS[s] || s;

export default function OrderTopBar({ order, onAdvanceState, onRegressState, onGenerateDraft, saving, onNameChange, onEnterDelayed, onExitDelayed }) {
  const [confirmState, setConfirmState] = useState(false);
  const [confirmRegress, setConfirmRegress] = useState(false);
  const [confirmDraft, setConfirmDraft] = useState(false);
  const [confirmDelayed, setConfirmDelayed] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);

  const isDelayed = order?.state === 'delayed';
  const stateIndex = STATE_ORDER.indexOf(order?.state);
  const nextState = stateIndex === -1 ? undefined : STATE_ORDER[stateIndex + 1];
  const prevState = stateIndex === -1 ? undefined : STATE_ORDER[stateIndex - 1];
  const delayedFrom = order?.delayedFrom || 'sent';
  const otherStates = STATE_ORDER.filter(s => s !== delayedFrom);

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
        {isDelayed ? (
          <>
            <div className="order-state-current">
              <span className="order-state-label">Current State</span>
              <StateBadge state="delayed" />
            </div>
            <button className="move-to-btn" onClick={() => setExitOpen(true)}>Move out of Delayed</button>
          </>
        ) : (
          <>
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
            <button className="move-to-btn delayed-btn" onClick={() => setConfirmDelayed(true)}>Mark Delayed</button>
          </>
        )}
      </div>

      {exitOpen && (
        <div className="delayed-exit-backdrop" role="dialog">
          <div className="delayed-exit-dialog">
            <p>Move out of Delayed — which state?</p>
            <button className="btn-primary" onClick={() => { setExitOpen(false); onExitDelayed(delayedFrom); }}>
              Return to “{label(delayedFrom)}”
            </button>
            <div className="delayed-exit-others">
              {otherStates.map(s => (
                <button key={s} className="btn-secondary" onClick={() => { setExitOpen(false); onExitDelayed(s); }}>{label(s)}</button>
              ))}
            </div>
            <button className="btn-secondary" onClick={() => setExitOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      <ConfirmDialog
        message={confirmState ? `Move order to "${label(nextState)}"?` : null}
        onConfirm={() => { setConfirmState(false); onAdvanceState(nextState); }}
        onCancel={() => setConfirmState(false)}
      />
      <ConfirmDialog
        message={confirmRegress ? `Move order back to "${label(prevState)}"?` : null}
        onConfirm={() => { setConfirmRegress(false); onRegressState(prevState); }}
        onCancel={() => setConfirmRegress(false)}
      />
      <ConfirmDialog
        message={confirmDraft ? 'Create Gmail draft for this order?' : null}
        onConfirm={() => { setConfirmDraft(false); onGenerateDraft(); }}
        onCancel={() => setConfirmDraft(false)}
      />
      <ConfirmDialog
        message={confirmDelayed ? 'Mark this order as Delayed? Customers will be notified if auto-send is on.' : null}
        onConfirm={() => { setConfirmDelayed(false); onEnterDelayed(); }}
        onCancel={() => setConfirmDelayed(false)}
      />
    </div>
  );
}
