import { useState, useEffect } from 'react';
import { getJobs, createJob, cancelJob, rescheduleJob } from '../api/campaigns';
import { getContacts } from '../api/emailList';

export default function CampaignsTab() {
  const [jobs, setJobs] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [mode, setMode] = useState('list');           // 'list' | 'selected'
  const [selected, setSelected] = useState(new Set()); // emails
  const [when, setWhen] = useState('');               // datetime-local value; '' = now
  const [msg, setMsg] = useState('');

  function load() {
    getJobs().then(d => setJobs(d.jobs)).catch(err => setMsg(err.message));
    getContacts().then(d => setContacts(d.contacts)).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  function toggleSelected(email) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email); else next.add(email);
      return next;
    });
  }

  async function handleSchedule(e) {
    e.preventDefault();
    const recipients = mode === 'list' ? 'list' : [...selected];
    if (mode === 'selected' && recipients.length === 0) { setMsg('Pick at least one contact.'); return; }
    try {
      await createJob({
        subject: subject.trim(),
        body,
        recipients,
        sendAt: when ? new Date(when).toISOString() : undefined,
      });
      setSubject(''); setBody(''); setWhen(''); setSelected(new Set());
      setMsg(when ? 'Blast scheduled.' : 'Blast queued to send now.');
      load();
    } catch (err) { setMsg(err.message); }
  }

  async function handleCancel(id) {
    try { await cancelJob(id); load(); } catch (err) { setMsg(err.message); }
  }

  async function handleRetryNow(id) {
    try { await rescheduleJob(id, new Date().toISOString()); load(); } catch (err) { setMsg(err.message); }
  }

  const subscribed = contacts.filter(c => c.status === 'subscribed');

  return (
    <div className="campaigns-tab">
      <h3>Email Campaign</h3>
      <p className="campaigns-hint">
        Compose an email blast for your list. Use [customer name] to personalize.
        Scheduled emails send while the app is running (missed sends go out on next launch, up to 48h late).
      </p>

      <form className="campaigns-compose" onSubmit={handleSchedule}>
        <div className="campaigns-message">
          <div className="settings-section-label">Message</div>
          <div className="field-group">
            <label>Subject</label>
            <input placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div className="field-group">
            <label>Body</label>
            <textarea
              placeholder="Hello [customer name],&#10;&#10;Write your email here…"
              rows={14}
              value={body}
              onChange={e => setBody(e.target.value)}
            />
          </div>
        </div>

        <div className="campaigns-side">
          <div className="settings-section-label">Recipients</div>
          <div className="campaigns-recipients">
            <label>
              <input type="radio" checked={mode === 'list'} onChange={() => setMode('list')} />
              Whole list ({subscribed.length} subscribed)
            </label>
            <label>
              <input type="radio" checked={mode === 'selected'} onChange={() => setMode('selected')} />
              Selected contacts
            </label>
            {mode === 'selected' && (
              <div className="campaigns-contact-picker">
                {subscribed.map(c => (
                  <label key={c.email}>
                    <input type="checkbox" checked={selected.has(c.email)} onChange={() => toggleSelected(c.email)} />
                    {c.name ? `${c.name} — ` : ''}{c.email}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="settings-section-label">Schedule</div>
          <div className="field-group">
            <label>Send at (leave blank to send now)</label>
            <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} />
          </div>
          <button className="btn-primary" type="submit">Schedule blast</button>
        </div>
      </form>

      {msg && <p className="campaigns-msg">{msg}</p>}

      <div className="settings-section-label">History</div>
      {jobs.length === 0 ? (
        <p className="campaigns-empty">No campaigns yet.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>Subject</th><th>Recipients</th><th>Send at</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {jobs.map(j => (
              <tr key={j.id}>
                <td>{j.subject}</td>
                <td>{j.recipients === 'list' ? 'Whole list' : `${j.recipients.length} contact(s)`}</td>
                <td>{new Date(j.sendAt).toLocaleString()}</td>
                <td>
                  {j.status}{j.error ? ` — ${j.error}` : ''}
                  {j.results?.length > 0 && ` (${j.results.filter(r => r.status === 'sent').length}/${j.results.length} sent)`}
                </td>
                <td className="data-table-actions">
                  {j.status === 'scheduled' && (
                    <button className="btn-secondary" onClick={() => handleCancel(j.id)}>Cancel</button>
                  )}
                  {(j.status === 'failed' || j.status === 'cancelled') && (
                    <button className="btn-secondary" onClick={() => handleRetryNow(j.id)}>Send now</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
