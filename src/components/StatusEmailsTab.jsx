import { useState, useEffect } from 'react';
import { getStatusEmailTemplates, saveStatusEmailTemplates } from '../api/customerEmails';
import { EMAIL_STATES, STATE_LABELS } from '../emailStates';

export default function StatusEmailsTab() {
  const [templates, setTemplates] = useState(null);
  const [genericName, setGenericName] = useState('');
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getStatusEmailTemplates()
      .then(d => { setTemplates(d.templates); setGenericName(d.genericCustomerName || ''); })
      .catch(e => setMsg(`Load failed: ${e.message}`));
  }, []);

  if (!templates) return <p className="customers-hint">{msg || 'Loading status email templates…'}</p>;

  function updateField(state, field, value) {
    setTemplates(t => ({ ...t, [state]: { ...t[state], [field]: value } }));
  }

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      await saveStatusEmailTemplates({ templates, genericCustomerName: genericName });
      setMsg('Saved!');
    } catch (e) {
      setMsg(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="status-emails-tab">
      <p className="status-emails-hint">
        Use <code>[customer name]</code> (replaced with each customer&apos;s name, or the generic name below when they have none)
        and <code>[order name]</code> in any subject or body.
      </p>

      <div className="field-group">
        <label>Generic Customer Name (used when a customer has no name)</label>
        <input value={genericName} onChange={e => setGenericName(e.target.value)} placeholder="Fellow Cat Lover" />
      </div>

      {EMAIL_STATES.map(state => (
        <div key={state} className="status-email-block">
          <div className="settings-section-label">{STATE_LABELS[state]} — “{state}”</div>
          <div className="field-group">
            <label>Subject</label>
            <input value={templates[state].subject} onChange={e => updateField(state, 'subject', e.target.value)} />
          </div>
          <div className="field-group">
            <label>Body</label>
            <textarea rows={6} value={templates[state].body} onChange={e => updateField(state, 'body', e.target.value)} />
          </div>
        </div>
      ))}

      <button className="btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save Status Emails'}
      </button>
      {msg && <span className="save-confirm"> {msg}</span>}
    </div>
  );
}
