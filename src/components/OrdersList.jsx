import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listOrders, createOrder, deleteOrder } from '../api/orders';
import StateBadge, { STATE_COLORS } from './StateBadge';
import NewOrderDialog from './NewOrderDialog';

export default function OrdersList() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    listOrders().then(setOrders).catch(console.error);
  }, []);

  async function handleDeleteOrder(e, order) {
    e.stopPropagation();
    const label = order.orderName ? `${order.orderName} (${order.orderId})` : order.orderId;
    if (!window.confirm(`Delete ${label}? This moves its Drive folder to the trash.`)) return;
    setError(null);
    try {
      await deleteOrder(order.orderId);
      setOrders(prev => prev.filter(o => o.orderId !== order.orderId));
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to delete order.');
    }
  }

  function handleBlankOrder() {
    setShowNewDialog(false);
    navigate('/blank-order');
  }

  async function handleNewOrder() {
    setShowNewDialog(false);
    setLoading(true);
    setError(null);
    try {
      const { orderId, sheetId } = await createOrder();
      navigate(`/orders/${orderId}?sheetId=${sheetId}`);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to create order. Check that your Google Drive folders are configured in server/config.js.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="orders-list">
      <header>
        <h1>RMC Ordering</h1>
        <div className="header-actions">
          <button onClick={() => navigate('/email')}>✉ Email</button>
          <button onClick={() => navigate('/settings')}>⚙ Settings</button>
          <button className="btn-primary" onClick={() => setShowNewDialog(true)} disabled={loading}>
            {loading ? 'Creating...' : '+ New Order'}
          </button>
        </div>
      </header>
      {error && <div className="error-banner">{error}</div>}
      <div className="order-cards">
        {orders.length === 0 && <p>No orders yet. Create one to get started.</p>}
        {orders.map(o => (
          <div
            key={o.orderId}
            className="order-card"
            style={{ borderColor: STATE_COLORS[o.state || 'building'] }}
            onClick={() => navigate(`/orders/${o.orderId}?sheetId=${o.sheetId}`)}
          >
            <div className="order-card-info">
              <strong>{o.orderName || o.orderId}</strong>
              {o.orderName && <span className="order-card-id">{o.orderId}</span>}
            </div>
            <StateBadge state={o.state || 'building'} />
            <button
              className="order-delete-btn"
              title="Delete order"
              aria-label={`Delete ${o.orderName || o.orderId}`}
              onClick={(e) => handleDeleteOrder(e, o)}
            >
              🗑
            </button>
          </div>
        ))}
      </div>
      {showNewDialog && (
        <NewOrderDialog
          onCustom={handleNewOrder}
          onBlank={handleBlankOrder}
          onCancel={() => setShowNewDialog(false)}
        />
      )}
    </div>
  );
}
