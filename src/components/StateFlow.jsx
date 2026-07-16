import { STATE_LABELS } from '../emailStates';
import { STATE_COLORS } from './StateBadge';
import { STATE_ORDER } from '../orderStates';

// Horizontal map of the order's state progression. Past states are filled,
// the current state is highlighted, future states are outlined. A delayed
// order highlights the state it was delayed from and shows a Delayed tag.
// Pass a different `states` array for flows with other progressions
// (e.g. a future pure-blank-order flow).
export default function StateFlow({ order, states = STATE_ORDER }) {
  const isDelayed = order?.state === 'delayed';
  const effectiveState = isDelayed ? (order?.delayedFrom || 'sent') : order?.state;
  const currentIdx = states.indexOf(effectiveState);

  return (
    <div className="state-flow">
      {states.map((s, i) => {
        const status = i < currentIdx ? 'past' : i === currentIdx ? 'current' : 'future';
        const color = STATE_COLORS[s] || '#6b7280';
        return (
          <span key={s} className="state-flow-item">
            {i > 0 && <span className={`state-flow-arrow ${i <= currentIdx ? 'reached' : ''}`}>→</span>}
            <span
              className={`state-flow-step ${status}`}
              style={
                status === 'current' ? { backgroundColor: color, borderColor: color }
                : status === 'past' ? { color, borderColor: color }
                : undefined
              }
            >
              {STATE_LABELS[s] || s}
              {isDelayed && i === currentIdx && <span className="state-flow-delayed-tag">Delayed</span>}
            </span>
          </span>
        );
      })}
    </div>
  );
}
