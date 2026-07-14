import { useState, useEffect } from 'react';
import {
  getStatusEmailTemplates, saveStatusEmailTemplates,
  pullStatusEmailTemplates, pushStatusEmailTemplates,
} from '../api/customerEmails';
import ConfirmDialog from './ConfirmDialog';
import { EMAIL_STATES, STATE_LABELS } from '../emailStates';

export default function StatusEmailsTab() {
  const [templates, setTemplates] = useState(null);
  const [genericName, setGenericName] = useState('');
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmPull, setConfirmPull] = useState(false);

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

  async function handlePush() {
    setMsg(null);
    try {
      await pushStatusEmailTemplates();
      setMsg('Pushed to Drive ✓');
    } catch (e) {
      setMsg(`Push failed: ${e.message}`);
    }
  }

  async function handlePull() {
    setConfirmPull(false);
    setMsg(null);
    try {
      const d = await pullStatusEmailTemplates();
      setTemplates(d.templates);
      setGenericName(d.genericCustomerName || '');
      setMsg('Pulled latest from Drive ✓');
    } catch (e) {
      setMsg(`Pull failed: ${e.message}`);
    }
  }

  return (
    <div className="status-emails-tab">
      <div className="emaillist-toolbar">
        <button className="btn-secondary" onClick={() => setConfirmPull(true)}>Pull from Drive</button>
        <button className="btn-secondary" onClick={handlePush}>Push to Drive</button>
        <span className="emaillist-autosave-note">Saving also backs up to Drive automatically.</span>
      </div>

      <div className="placeholder-help">
        <div className="placeholder-help-title">Placeholders you can use in any subject or body:</div>
        <div><code>[customer name]</code> — replaced with each customer&apos;s name (or the generic name below when they have none).</div>
        <div><code>[order name]</code> — replaced with this order&apos;s name.</div>
      </div>

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

      {confirmPull && (
        <ConfirmDialog
          message="This replaces your local status emails with the shared Drive copy."
          onConfirm={handlePull}
          onCancel={() => setConfirmPull(false)}
        />
      )}
    </div>
  );
}
