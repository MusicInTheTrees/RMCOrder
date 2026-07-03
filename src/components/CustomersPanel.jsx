import { useState } from 'react';
import { parseCustomers } from '../utils/parseCustomers';
import { EMAIL_STATES, STATE_LABELS } from '../emailStates';

export default function CustomersPanel({ customers = [], onChange, onSend }) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [skipped, setSkipped] = useState([]);

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

  function addBlank() {
    onChange([...customers, { name: '', email: '', emailed: {} }]);
  }

  const pendingCount = (state) => customers.filter(c => !(c.emailed && c.emailed[state])).length;

  return (
    <div className="customers-panel">
      <div className="customers-actions">
        <button className="btn-secondary" onClick={() => setPasteOpen(o => !o)}>Paste emails</button>
        <button className="btn-secondary" onClick={addBlank}>+ Add row</button>
      </div>

      {pasteOpen && (
        <div className="customers-paste">
          <textarea
            placeholder="One per line — 'Name, email', 'Name <email>', or just email"
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
          />
          <button className="btn-primary" onClick={addFromPaste}>Add to list</button>
        </div>
      )}
      {skipped.length > 0 && (
        <p className="customers-skipped">Skipped {skipped.length} line(s) with no email.</p>
      )}

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

      <div className="customers-send">
        {EMAIL_STATES.map(state => (
          <div key={state} className="customers-send-row">
            <button className="btn-secondary" onClick={() => onSend(state)}>
              Send {state} email
            </button>
            <span className="customers-pending" data-testid={`pending-${state}`}>
              {pendingCount(state)} of {customers.length} not yet emailed ({STATE_LABELS[state]})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
