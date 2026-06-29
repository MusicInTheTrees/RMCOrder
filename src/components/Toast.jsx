export default function Toast({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="toast">
      <span className="toast-message">{message}</span>
      <button className="toast-dismiss" onClick={onDismiss} title="Dismiss">×</button>
    </div>
  );
}
