import { STATE_LABELS } from '../emailStates';

export const STATE_COLORS = {
  building:  '#ef4444',
  sent:      '#f97316',
  pending:   '#eab308',
  fulfilled: '#3b82f6',
  received:  '#8b5cf6',
  shipped:   '#14b8a6',
  delayed:   '#f59e0b',
};

export default function StateBadge({ state, dimmed = false }) {
  const color = STATE_COLORS[state] || '#6b7280';
  return (
    <span
      className="state-badge"
      style={{ backgroundColor: color, opacity: dimmed ? 0.45 : 1 }}
    >
      {STATE_LABELS[state] || state}
    </span>
  );
}
