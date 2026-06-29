import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useOrder } from '../hooks/useOrder';
import { createDraft } from '../api/gmail';
import { getSettings } from '../api/settings';
import OrderTopBar from './OrderTopBar';
import LineItemCard from './LineItemCard';
import DesignBrowser from './DesignBrowser';
import OfflineBanner from './OfflineBanner';
import Toast from './Toast';

function nextLineItemNum(lineItems) {
  const max = lineItems.reduce((m, li) => Math.max(m, parseInt(li.num, 10) || 0), 0);
  return String(max + 1).padStart(2, '0');
}

export default function OrderBuilder() {
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const sheetId = searchParams.get('sheetId');
  const navigate = useNavigate();
  const { order, setOrder, saving, offline, syncPending, saveNow } = useOrder(sheetId);
  const [selectingDesign, setSelectingDesign] = useState(null); // { num, placement: 'front'|'back' }
  const [toast, setToast] = useState(null);
  const [saveMsg, setSaveMsg] = useState(null);
  const settingsRef = useRef({ defaultBackDesign: '', defaultBackNotes: '' });

  useEffect(() => {
    getSettings().then(s => { settingsRef.current = s; }).catch(() => {});
  }, []);

  if (!order) return <div className="loading">Loading order...</div>;

  function addLineItem() {
    const num = nextLineItemNum(order.lineItems);
    const { defaultBackDesign, defaultBackNotes } = settingsRef.current;
    setOrder(prev => ({
      ...prev,
      lineItems: [...prev.lineItems, {
        num,
        apparelType: '',
        color: '',
        sizes: {},
        frontDesigns: [],
        frontNotes: '',
        backDesigns: defaultBackDesign ? [{ designNum: '1', file: defaultBackDesign }] : [],
        backNotes: defaultBackNotes || '',
      }],
    }));
  }

  function updateLineItem(num, updated) {
    setOrder(prev => ({
      ...prev,
      lineItems: prev.lineItems.map(li => li.num === num ? updated : li),
    }));
  }

  function removeLineItem(num) {
    setOrder(prev => ({
      ...prev,
      lineItems: prev.lineItems.filter(li => li.num !== num),
    }));
  }

  function handleDesignSelected(designName) {
    if (!selectingDesign) return;
    const { num, placement } = selectingDesign;
    const field = placement === 'front' ? 'frontDesigns' : 'backDesigns';
    setOrder(prev => ({
      ...prev,
      lineItems: prev.lineItems.map(li => {
        if (li.num !== num) return li;
        const existing = li[field] || [];
        const designNum = String(existing.length + 1);
        return { ...li, [field]: [...existing, { designNum, file: designName }] };
      }),
    }));
    setSelectingDesign(null);
  }

  async function handleSaveNow() {
    const result = await saveNow();
    setSaveMsg(result?.skipped ? 'Already up to date' : 'Saved!');
    setTimeout(() => setSaveMsg(null), 2500);
  }

  async function handleGenerateDraft() {
    try {
      await createDraft(sheetId);
      setToast('Gmail draft created successfully!');
    } catch (err) {
      setToast(`Failed to create draft: ${err.message}`);
    }
  }

  function handleAdvanceState(nextState) {
    setOrder(prev => ({ ...prev, state: nextState }));
  }

  return (
    <div className="order-builder">
      <OfflineBanner offline={offline} syncPending={syncPending} />
      <button className="back-btn" onClick={() => navigate('/orders')}>← Orders</button>

      <OrderTopBar
        order={order}
        saving={saving}
        onAdvanceState={handleAdvanceState}
        onGenerateDraft={handleGenerateDraft}
        onNameChange={name => setOrder(prev => ({ ...prev, orderName: name }))}
      />

      <div className="builder-body">
        <div className="line-items">
          {order.lineItems.map(item => (
            <LineItemCard
              key={item.num}
              item={item}
              onChange={updated => updateLineItem(item.num, updated)}
              onRemove={() => removeLineItem(item.num)}
              onAddDesign={(placement) => setSelectingDesign({ num: item.num, placement })}
            />
          ))}
          <button className="btn-secondary add-line-item" onClick={addLineItem}>
            + Add Line Item
          </button>
        </div>

        <DesignBrowser
          selectionMode={!!selectingDesign}
          selectionLabel={selectingDesign?.placement || ''}
          onSelect={handleDesignSelected}
          onCancel={() => setSelectingDesign(null)}
        />
      </div>

      <div className="save-bar">
        <button className="btn-primary" onClick={handleSaveNow} disabled={saving}>
          {saving ? 'Saving...' : 'Save Order'}
        </button>
        {saveMsg && <span className="save-confirm">{saveMsg}</span>}
      </div>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
