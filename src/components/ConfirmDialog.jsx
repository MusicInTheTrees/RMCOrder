export default function ConfirmDialog({ message, onConfirm, onCancel }) {
  if (!message) return null;
  return (
    <div className="dialog-overlay">
      <div className="dialog">
        <p>{message}</p>
        <div className="dialog-actions">
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn-primary" onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  );
}
