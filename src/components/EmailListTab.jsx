import { useState, useEffect } from 'react';
import { getContacts, addContact, updateContact, runBackfill } from '../api/emailList';

export default function EmailListTab() {
  const [contacts, setContacts] = useState([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');

  function load() {
    getContacts().then(d => setContacts(d.contacts)).catch(err => setMsg(err.message));
  }
  useEffect(() => { load(); }, []);

  async function handleAdd(e) {
    e.preventDefault();
    try {
      await addContact({ name: name.trim(), email: email.trim() });
      setName(''); setEmail(''); setMsg('');
      load();
    } catch (err) { setMsg(err.message); }
  }

  async function toggleStatus(c) {
    const status = c.status === 'subscribed' ? 'unsubscribed' : 'subscribed';
    try { await updateContact(c.email, { status }); load(); }
    catch (err) { setMsg(err.message); }
  }

  async function handleBackfill() {
    try {
      const r = await runBackfill();
      setMsg(`Imported ${r.added} new contact(s) — ${r.total} total on the list.`);
      load();
    } catch (err) { setMsg(err.message); }
  }

  return (
    <div className="emaillist-tab">
      <h3>Email List</h3>
      <p className="emaillist-hint">
        Every customer email added to an order lands here automatically. This list feeds the Campaigns tab.
      </p>

      <form className="emaillist-add" onSubmit={handleAdd}>
        <input placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
        <input placeholder="email@example.com" value={email} onChange={e => setEmail(e.target.value)} />
        <button className="btn-primary" type="submit">Add</button>
      </form>

      <button className="btn-secondary" onClick={handleBackfill}>Import from existing orders</button>
      {msg && <p className="emaillist-msg">{msg}</p>}

      {contacts.length === 0 ? (
        <p className="emaillist-empty">No contacts yet — they'll appear as you add customers to orders.</p>
      ) : (
        <table className="emaillist-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Status</th><th>Added</th><th>Source</th><th></th></tr>
          </thead>
          <tbody>
            {contacts.map(c => (
              <tr key={c.email}>
                <td>{c.name}</td>
                <td>{c.email}</td>
                <td>{c.status}</td>
                <td>{(c.addedAt || '').slice(0, 10)}</td>
                <td>{c.source}</td>
                <td>
                  <button className="btn-secondary" onClick={() => toggleStatus(c)}>
                    {c.status === 'subscribed' ? 'Unsubscribe' : 'Resubscribe'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
