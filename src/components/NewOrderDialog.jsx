export default function NewOrderDialog({ onCustom, onBlank, onCancel }) {
  return (
    <div className="dialog-overlay" role="dialog" aria-modal="true" aria-label="Create new order">
      <div className="dialog">
        <h3>What kind of order?</h3>
        <p>Custom orders have printed designs. Blank orders restock undecorated garments from Square sales.</p>
        <div className="dialog-actions">
          <button className="btn-primary" onClick={onCustom}>Custom Order</button>
          <button className="btn-primary" onClick={onBlank}>Blank Order</button>
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
