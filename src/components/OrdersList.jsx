import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listOrders, createOrder } from '../api/orders';
import StateBadge from './StateBadge';

export default function OrdersList() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    listOrders().then(setOrders).catch(console.error);
  }, []);

  async function handleNewOrder() {
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
          <button onClick={() => navigate('/settings')}>⚙ Settings</button>
          <button className="btn-primary" onClick={handleNewOrder} disabled={loading}>
            {loading ? 'Creating...' : '+ New Order'}
          </button>
        </div>
      </header>
      {error && <div className="error-banner">{error}</div>}
      <div className="order-cards">
        {orders.length === 0 && <p>No orders yet. Create one to get started.</p>}
        {orders.map(o => (
          <div key={o.orderId} className="order-card" onClick={() => navigate(`/orders/${o.orderId}?sheetId=${o.sheetId}`)}>
            <div className="order-card-info">
              <strong>{o.orderName || o.orderId}</strong>
              {o.orderName && <span className="order-card-id">{o.orderId}</span>}
            </div>
            <StateBadge state={o.state || 'building'} />
          </div>
        ))}
      </div>
    </div>
  );
}
