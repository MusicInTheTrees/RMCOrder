import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useOrder } from '../hooks/useOrder';
import { useItems } from '../hooks/useItems';
import { upsertDraft } from '../api/gmail';
import { getSettings, saveSettings } from '../api/settings';
import { decrementInventory, incrementInventory } from '../api/inventory';
import { useBugLog } from '../context/BugLogContext';
import { useInventory } from '../hooks/useInventory';
import OrderTopBar from './OrderTopBar';
import LineItemCard from './LineItemCard';
import DesignBrowser from './DesignBrowser';
import OfflineBanner from './OfflineBanner';
import Toast from './Toast';
import CustomersPanel from './CustomersPanel';
import { EMAIL_STATES } from '../emailStates';
import { sendCustomerEmail } from '../api/customerEmails';

function nextLineItemNum(lineItems) {
  const max = lineItems.reduce((m, li) => Math.max(m, parseInt(li.num, 10) || 0), 0);
  return String(max + 1).padStart(2, '0');
}

export default function OrderBuilder() {
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const sheetId = searchParams.get('sheetId');
  const navigate = useNavigate();
  const { order, setOrder, saving, offline, syncPending, saveNow, loadError, reload } = useOrder(sheetId, {
    onError: (msg) => {
      const err = `Save failed: ${msg}`;
      setToast(err);
      logError(err);
    },
  });
  const { catalog } = useItems();
  const { logError } = useBugLog();
  const { getStock } = useInventory();
  const [selectingDesign, setSelectingDesign] = useState(null); // { num, placement: 'front'|'back' }
  const [toast, setToast] = useState(null);
  const [saveMsg, setSaveMsg] = useState(null);
  const [previewText, setPreviewText] = useState(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [activeTab, setActiveTab] = useState('order');
  const [autoSend, setAutoSend] = useState(false);
  const settingsRef = useRef({ defaultBackDesign: '', defaultBackNotes: '', autoSendCustomerEmails: false });

  useEffect(() => {
    getSettings().then(s => { settingsRef.current = s; setAutoSend(!!s.autoSendCustomerEmails); }).catch(() => {});
  }, []);

  async function handleToggleAutoSend(next) {
    setAutoSend(next);
    const updated = { ...settingsRef.current, autoSendCustomerEmails: next };
    settingsRef.current = updated;
    try {
      await saveSettings(updated);
    } catch (err) {
      logError(`Could not save auto-send setting: ${err.message}`);
    }
  }

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 400);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (loadError) {
    const isAuth = /auth|401|invalid_grant|credential|token/i.test(loadError);
    return (
      <div className="loading load-error">
        <p>Couldn't load this order: {loadError}</p>
        {isAuth && <p>Your Google session may have expired — try signing in again.</p>}
        <div className="load-error-actions">
          <button className="btn-primary" onClick={reload}>Retry</button>
          <button className="btn-secondary" onClick={() => navigate('/orders')}>← Back to Orders</button>
        </div>
      </div>
    );
  }

  if (!order) return <div className="loading">Loading order...</div>;

  function addLineItem() {
    const num = nextLineItemNum(order.lineItems);
    const { defaultBackDesign, defaultBackNotes } = settingsRef.current;
    setOrder(prev => ({
      ...prev,
      lineItems: [...prev.lineItems, {
        num,
        itemTypeId: '',
        itemTypeName: '',
        color: '',
        sizes: {},
        frontDesigns: [],
        frontNotes: '',
        frontMethod: '',
        backDesigns: defaultBackDesign ? [{ designNum: '1', file: defaultBackDesign }] : [],
        backNotes: defaultBackNotes || '',
        backMethod: '',
      }],
    }));
  }

  function updateLineItem(num, updated) {
    setOrder(prev => ({
      ...prev,
      lineItems: prev.lineItems.map(li => li.num === num ? updated : li),
    }));
  }

  function setCustomers(next) {
    setOrder(prev => ({ ...prev, customers: next }));
  }

  function stampEmailed(state, emails, at) {
    setOrder(prev => ({
      ...prev,
      customers: (prev.customers || []).map(c =>
        emails.includes(c.email) ? { ...c, emailed: { ...(c.emailed || {}), [state]: at } } : c),
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
      const { draftId } = await upsertDraft(sheetId, order.draftId || null);
      const isUpdate = !!(order.draftId && draftId === order.draftId);
      setOrder(prev => ({ ...prev, draftId }));
      setToast(isUpdate ? 'Gmail draft updated!' : 'Gmail draft created!');
    } catch (err) {
      const msg = `Failed to create draft: ${err.message}`;
      setToast(msg);
      logError(msg);
    }
  }

  function handleGeneratePreview() {
    function formatSizes(sizes) {
      return Object.entries(sizes || {})
        .filter(([, v]) => (v?.total ?? 0) > 0)
        .map(([label, v]) => {
          const total = v.total, inv = v.inventory ?? 0, toOrder = total - inv;
          if (inv > 0 && toOrder > 0) return `${label}: ${total} (${inv} from stock, order ${toOrder})`;
          if (inv === total) return `${label}: ${total} (all from stock)`;
          return `${label}: ${total}`;
        })
        .join(', ');
    }
    const isBlank = i => (i.frontDesigns || []).length === 0 && (i.backDesigns || []).length === 0;
    const allItems = order.lineItems || [];
    const printItems = allItems.filter(i => !isBlank(i));
    const blankItems = allItems.filter(isBlank);
    const title = order.orderName
      ? `RMC Order: ${order.orderName} (${order.orderId})`
      : `${order.orderId} — Order Request`;
    let text = `${title}\n\n`;
    if (order.notes) text += `Order Notes: ${order.notes}\n\n`;
    const groups = {};
    for (const item of printItems) {
      const cat = item.itemTypeName || item.apparelType || 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    for (const [category, items] of Object.entries(groups)) {
      text += `${category}\n${'—'.repeat(category.length)}\n`;
      for (const item of items) {
        text += `• #${item.num} | ${item.color || ''} | ${formatSizes(item.sizes)}\n`;
        const frontList = (item.frontDesigns || []).map(d => `  ${d.file}`).join('\n');
        if (item.frontMethod) text += `  Front method: ${item.frontMethod}\n`;
        if (frontList) text += `  Front:\n${frontList}\n`;
        if (item.frontNotes) text += `  Front notes: ${item.frontNotes}\n`;
        const backList = (item.backDesigns || []).map(d => `  ${d.file}`).join('\n');
        if (item.backMethod) text += `  Back method: ${item.backMethod}\n`;
        if (backList) text += `  Back:\n${backList}\n`;
        if (item.backNotes) text += `  Back notes: ${item.backNotes}\n`;
      }
      text += '\n';
    }
    if (blankItems.length > 0) {
      text += `Blank Items (no decoration)\n${'—'.repeat(26)}\n`;
      for (const item of blankItems) {
        text += `• #${item.num} | ${item.itemTypeName || item.apparelType || ''} | ${item.color || ''} | ${formatSizes(item.sizes)}\n`;
      }
      text += '\n';
    }
    if (order.folderId) text += `Order folder (design files):\nhttps://drive.google.com/drive/folders/${order.folderId}\n`;
    if (order.sheetId) text += `Order sheet:\nhttps://docs.google.com/spreadsheets/d/${order.sheetId}\n`;
    setPreviewText(text);
  }

  async function handleAdvanceState(nextState) {
    if (nextState === 'sent') {
      const decrements = [];
      for (const li of order.lineItems) {
        const catalogItem = catalog.items.find(i => i.id === li.itemTypeId);
        if (!catalogItem?.inventoryItem) continue;
        const { inventoryItem, inventoryStyle = '' } = catalogItem;
        for (const [size, v] of Object.entries(li.sizes || {})) {
          if ((v?.inventory ?? 0) > 0) {
            decrements.push({ item: inventoryItem, color: li.color, style: inventoryStyle, size, qty: v.inventory });
          }
        }
      }
      if (decrements.length > 0) {
        try {
          await decrementInventory(decrements);
        } catch (err) {
          logError(`Failed to update blank inventory: ${err.message}`);
        }
      }
    }

    if (nextState === 'received') {
      const increments = [];
      for (const li of order.lineItems) {
        const isBlank = (li.frontDesigns || []).length === 0 && (li.backDesigns || []).length === 0;
        if (!isBlank) continue;
        const catalogItem = catalog.items.find(i => i.id === li.itemTypeId);
        if (!catalogItem?.inventoryItem) continue;
        const { inventoryItem, inventoryStyle = '' } = catalogItem;
        for (const [size, v] of Object.entries(li.sizes || {})) {
          const qty = v?.total ?? 0;
          if (qty > 0) {
            increments.push({ item: inventoryItem, color: li.color, style: inventoryStyle, size, qty });
          }
        }
      }
      if (increments.length > 0) {
        try {
          await incrementInventory(increments);
        } catch (err) {
          logError(`Failed to update blank inventory: ${err.message}`);
        }
      }
    }

    setOrder(prev => ({ ...prev, state: nextState }));

    if (EMAIL_STATES.includes(nextState) && autoSend) {
      const pending = (order.customers || []).filter(c => !(c.emailed && c.emailed[nextState]));
      if (pending.length > 0) {
        try {
          const res = await sendCustomerEmail(sheetId, nextState, pending.map(c => ({ name: c.name, email: c.email })));
          stampEmailed(nextState, res.emails, res.at);
          setToast(`Sent ${res.sent} ${nextState} email(s)`);
        } catch (err) {
          logError(`Auto-send failed: ${err.message}`);
        }
      }
    }
  }

  // Moving backward is a manual correction — no inventory changes, no emails.
  function handleRegressState(prevState) {
    setOrder(prev => ({ ...prev, state: prevState }));
  }

  return (
    <div className="order-builder">
      <OfflineBanner offline={offline} syncPending={syncPending} />
      <button className="back-btn" onClick={() => navigate('/orders')}>← Orders</button>

      <OrderTopBar
        order={order}
        saving={saving}
        onAdvanceState={handleAdvanceState}
        onRegressState={handleRegressState}
        onGenerateDraft={handleGenerateDraft}
        onNameChange={name => setOrder(prev => ({ ...prev, orderName: name }))}
      />

      <div className="order-tabs">
        <button className={`order-tab${activeTab === 'order' ? ' active' : ''}`} onClick={() => setActiveTab('order')}>Order</button>
        <button className={`order-tab${activeTab === 'customers' ? ' active' : ''}`} onClick={() => setActiveTab('customers')}>Customers</button>
      </div>

      {activeTab === 'order' && (<>
      <div className="order-notes-section">
        <div className="field-section-header">Global Notes</div>
        <textarea
          className="order-notes"
          value={order.notes || ''}
          onChange={e => setOrder(prev => ({ ...prev, notes: e.target.value }))}
          placeholder="Order notes — e.g. All shirts DTG unless noted per placement"
        />
      </div>

      <div className="save-bar save-bar-inline">
        <button className="btn-primary" onClick={handleSaveNow} disabled={saving}>
          {saving ? 'Saving...' : 'Save Order'}
        </button>
        {saveMsg && <span className="save-confirm">{saveMsg}</span>}
      </div>

      <div className="builder-body">
        <div className="line-items">
          {order.lineItems.map(item => (
            <LineItemCard
              key={item.num}
              item={item}
              items={catalog.items}
              onChange={updated => updateLineItem(item.num, updated)}
              onRemove={() => removeLineItem(item.num)}
              onAddDesign={(placement) => setSelectingDesign({ num: item.num, placement })}
              getStock={getStock}
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

      <div className="preview-section">
        <button className="btn-secondary" onClick={handleGeneratePreview}>
          Generate Preview
        </button>
        {previewText && (
          <pre className="email-preview">{previewText}</pre>
        )}
      </div>
      </>)}

      {activeTab === 'customers' && (
        <CustomersPanel
          customers={order.customers || []}
          onChange={setCustomers}
          sheetId={sheetId}
          orderState={order.state}
          autoSend={autoSend}
          onToggleAutoSend={handleToggleAutoSend}
        />
      )}

      <button
        className={`back-to-top-fab${showBackToTop ? ' visible' : ''}`}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Back to top"
        title="Back to top"
      >
        ↑
      </button>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
