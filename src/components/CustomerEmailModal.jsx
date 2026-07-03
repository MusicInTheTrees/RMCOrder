import { useState, useEffect } from 'react';
import { previewCustomerEmail, sendCustomerEmail } from '../api/customerEmails';
import { STATE_LABELS } from '../emailStates';

export default function CustomerEmailModal({ sheetId, state, orderName, customers = [], onClose, onSent }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [checked, setChecked] = useState(() =>
    customers.reduce((acc, c) => { acc[c.email] = !(c.emailed && c.emailed[state]); return acc; }, {}));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    previewCustomerEmail(sheetId, state)
      .then(d => { if (alive) { setSubject(d.subject); setBody(d.body); } })
      .catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [sheetId, state]);

  const recipients = customers.filter(c => checked[c.email]).map(c => ({ name: c.name, email: c.email }));

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      const res = await sendCustomerEmail(sheetId, state, recipients, subject, body);
      onSent(state, res.emails, res.at);
      onClose();
    } catch (e) {
      setError(e.message);
      setSending(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal customer-email-modal" onClick={e => e.stopPropagation()}>
        <h3>Send “{STATE_LABELS[state]}” email — {orderName}</h3>

        <label className="modal-label">Subject</label>
        <input className="modal-input" value={subject} onChange={e => setSubject(e.target.value)} />

        <label className="modal-label">Message</label>
        <textarea className="modal-textarea" value={body} onChange={e => setBody(e.target.value)} rows={5} />

        <label className="modal-label">Recipients</label>
        <div className="modal-recipients">
          {customers.map(c => (
            <label key={c.email} className="modal-recipient">
              <input
                type="checkbox"
                checked={!!checked[c.email]}
                onChange={e => setChecked(prev => ({ ...prev, [c.email]: e.target.checked }))}
              />
              {c.name ? `${c.name} — ` : ''}{c.email}
              {c.emailed && c.emailed[state] ? ' (already sent)' : ''}
            </label>
          ))}
        </div>

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={sending}>Cancel</button>
          <button className="btn-primary" onClick={handleSend} disabled={sending || recipients.length === 0}>
            {sending ? 'Sending…' : `Send to ${recipients.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}
