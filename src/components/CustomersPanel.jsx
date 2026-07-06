import { useState, useEffect } from 'react';
import { parseCustomers } from '../utils/parseCustomers';
import { EMAIL_STATES, STATE_LABELS } from '../emailStates';
import { previewCustomerEmail, generateCustomerDrafts } from '../api/customerEmails';
import ConfirmDialog from './ConfirmDialog';

export default function CustomersPanel({ customers = [], onChange, sheetId, orderState, autoSend = false, onToggleAutoSend }) {
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [skipped, setSkipped] = useState([]);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewSubject, setPreviewSubject] = useState('');
  const [draftMsg, setDraftMsg] = useState(null);
  const [confirmAuto, setConfirmAuto] = useState(false);

  const canEmail = EMAIL_STATES.includes(orderState);
  const statusList = EMAIL_STATES.map(s => STATE_LABELS[s]).join(', ');

  // Live preview for the order's current state (when it's an emailing state).
  useEffect(() => {
    if (!sheetId || !canEmail) { setPreviewHtml(''); setPreviewSubject(''); return; }
    let alive = true;
    previewCustomerEmail(sheetId, orderState)
      .then(d => { if (alive) { setPreviewHtml(d.html); setPreviewSubject(d.subject); } })
      .catch(() => { if (alive) { setPreviewHtml(''); setPreviewSubject(''); } });
    return () => { alive = false; };
  }, [sheetId, orderState, canEmail]);

  function addCustomer() {
    const email = newEmail.trim();
    if (!email) return;
    if (customers.some(c => c.email.toLowerCase() === email.toLowerCase())) {
      setSkipped([`${email} is already in the list`]);
      return;
    }
    onChange([...customers, { name: newName.trim(), email, emailed: {} }]);
    setNewName('');
    setNewEmail('');
    setSkipped([]);
  }

  function addFromPaste() {
    const { rows, skipped } = parseCustomers(pasteText);
    const existing = new Set(customers.map(c => c.email.toLowerCase()));
    const additions = rows
      .filter(r => !existing.has(r.email.toLowerCase()))
      .map(r => ({ name: r.name, email: r.email, emailed: {} }));
    onChange([...customers, ...additions]);
    setPasteText('');
    setSkipped(skipped);
    setPasteOpen(false);
  }

  function removeAt(idx) {
    onChange(customers.filter((_, i) => i !== idx));
  }

  function updateAt(idx, field, value) {
    onChange(customers.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  }

  async function handleGenerateDraft() {
    setDraftMsg('Creating drafts…');
    try {
      const { drafted } = await generateCustomerDrafts(sheetId, orderState);
      setDraftMsg(`Created ${drafted} draft${drafted === 1 ? '' : 's'} in Gmail — review and send them there.`);
    } catch (e) {
      setDraftMsg(`Draft failed: ${e.message}`);
    }
  }

  function onAutoSendChange(e) {
    if (e.target.checked) setConfirmAuto(true);   // ask before turning ON
    else onToggleAutoSend(false);
  }

  return (
    <div className="customers-panel">
      <h3 className="customers-heading">Customers on this order</h3>

      {/* Add one customer */}
      <div className="add-customer-form">
        <input
          className="add-customer-name"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Name"
        />
        <input
          className="add-customer-email"
          value={newEmail}
          onChange={e => setNewEmail(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addCustomer(); }}
          placeholder="email@example.com"
        />
        <button className="btn-primary" onClick={addCustomer} disabled={!newEmail.trim()}>Add Customer</button>
        <button className="btn-secondary" onClick={() => setPasteOpen(o => !o)}>Paste Customer Info (CSV)</button>
      </div>

      {pasteOpen && (
        <div className="customers-paste">
          <textarea
            className="customers-paste-input"
            placeholder="One per line — 'Name, email', 'Name <email>', or just email"
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
          />
          <button className="btn-primary" onClick={addFromPaste}>Add to list</button>
        </div>
      )}
      {skipped.length > 0 && (
        <p className="customers-skipped">Skipped: {skipped.join('; ')}</p>
      )}

      {/* Editable list */}
      {customers.length === 0 ? (
        <p className="customers-empty">No customers yet — add them above.</p>
      ) : (
        <table className="customers-table">
          <thead><tr><th>Name</th><th>Email</th><th></th></tr></thead>
          <tbody>
            {customers.map((c, i) => (
              <tr key={i}>
                <td><input value={c.name} onChange={e => updateAt(i, 'name', e.target.value)} placeholder="Name" /></td>
                <td><input value={c.email} onChange={e => updateAt(i, 'email', e.target.value)} placeholder="email@example.com" /></td>
                <td><button className="btn-remove" onClick={() => removeAt(i)} aria-label={`Remove ${c.email}`}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Email preview */}
      <div className="customers-preview">
        <div className="field-section-header">Email Preview</div>
        {canEmail ? (
          previewHtml ? (
            <>
              <p className="preview-subject"><strong>Subject:</strong> {previewSubject}</p>
              <iframe title="Customer email preview" className="email-preview-frame" srcDoc={previewHtml} />
            </>
          ) : (
            <p className="customers-hint">Loading preview…</p>
          )
        ) : (
          <p className="customers-hint">A preview appears when this order is in an emailing state ({statusList}).</p>
        )}
      </div>

      {/* Draft + auto-send controls */}
      <div className="customers-send-controls">
        <button
          className="btn-primary generate-draft-btn"
          onClick={handleGenerateDraft}
          disabled={!canEmail || autoSend || customers.length === 0}
          title={autoSend ? 'Disabled while auto-send is on' : (!canEmail ? 'Order is not in an emailing state' : '')}
        >
          {canEmail ? `Generate Draft — ${STATE_LABELS[orderState]}` : 'Generate Draft (order not in an emailing state)'}
        </button>
        {draftMsg && <span className="draft-msg">{draftMsg}</span>}

        <label className="auto-send-toggle">
          <span className="auto-send-row">
            <input type="checkbox" checked={autoSend} onChange={onAutoSendChange} />
            Automatically Send Status Emails?
          </span>
          <span className="auto-send-note">Sends automatically on: {statusList}</span>
        </label>
      </div>

      <ConfirmDialog
        message={confirmAuto ? `Turn ON automatic sending? Customers will be emailed automatically — with no draft review — whenever an order reaches: ${statusList}.` : null}
        onConfirm={() => { setConfirmAuto(false); onToggleAutoSend(true); }}
        onCancel={() => setConfirmAuto(false)}
      />
    </div>
  );
}
