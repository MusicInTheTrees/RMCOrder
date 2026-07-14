import { useState, useEffect, useMemo } from 'react';
import {
  getContacts, addContact, updateContact, deleteContact,
  bulkAction, runBackfill, syncSheet,
} from '../api/emailList';
import ConfirmDialog from './ConfirmDialog';

export default function EmailListTab() {
  const [contacts, setContacts] = useState([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [sortKey, setSortKey] = useState('addedAt');
  const [sortDir, setSortDir] = useState('desc');
  const [selected, setSelected] = useState(new Set());
  const [confirm, setConfirm] = useState(null); // { message, emails }

  function load() {
    getContacts().then(d => setContacts(d.contacts)).catch(err => setMsg(err.message));
  }
  useEffect(() => { load(); }, []);

  const sorted = useMemo(() => {
    const list = [...contacts];
    list.sort((a, b) => {
      const av = String(a[sortKey] || '').toLowerCase();
      const bv = String(b[sortKey] || '').toLowerCase();
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [contacts, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }
  const arrow = key => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  function toggleSelected(addr) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(addr)) next.delete(addr); else next.add(addr);
      return next;
    });
  }
  const allSelected = contacts.length > 0 && selected.size === contacts.length;
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(contacts.map(c => c.email)));
  }

  async function handleAdd(e) {
    e.preventDefault();
    setMsg('');
    try {
      await addContact({ name: name.trim(), email: email.trim() });
      setName(''); setEmail('');
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

  async function handleSync() {
    setMsg('Syncing…');
    try { await syncSheet(); setMsg('Synced to Google Sheet ✓'); }
    catch (err) { setMsg(`Sheet sync failed: ${err.message}`); }
  }

  function askDelete(emails) {
    const message = emails.length === 1
      ? `This permanently removes ${emails[0]} from the list.`
      : `This permanently removes ${emails.length} contacts from the list.`;
    setConfirm({ message, emails });
  }

  async function handleConfirmDelete() {
    const { emails } = confirm;
    setConfirm(null);
    try {
      if (emails.length === 1) await deleteContact(emails[0]);
      else await bulkAction(emails, 'delete');
      setSelected(new Set());
      load();
    } catch (err) { setMsg(err.message); }
  }

  async function handleBulkStatus(action) {
    try {
      await bulkAction([...selected], action);
      setSelected(new Set());
      load();
    } catch (err) { setMsg(err.message); }
  }

  return (
    <div className="emaillist-tab">
      <h3>Email List</h3>
      <p className="emaillist-hint">
        Every customer email added to an order lands here automatically. This list feeds the Email Campaign tab.
      </p>

      <form className="emaillist-add" onSubmit={handleAdd}>
        <div className="field-group">
          <label>Name</label>
          <input placeholder="Name" value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <div className="field-group">
          <label>Email</label>
          <input type="email" placeholder="email@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <button className="btn-primary" type="submit">Add</button>
      </form>

      <div className="emaillist-toolbar">
        <button className="btn-secondary" onClick={handleBackfill}>Import from existing orders</button>
        <button className="btn-secondary" onClick={handleSync}>Sync to Google Sheet</button>
        <span className="emaillist-autosave-note">
          Changes save automatically; sync pushes the list to your Google Sheet.
        </span>
      </div>

      {msg && <p className="emaillist-msg">{msg}</p>}

      {selected.size > 0 && (
        <div className="emaillist-bulkbar">
          <span>{selected.size} selected</span>
          <button className="btn-secondary" onClick={() => handleBulkStatus('subscribe')}>Subscribe selected</button>
          <button className="btn-secondary" onClick={() => handleBulkStatus('unsubscribe')}>Unsubscribe selected</button>
          <button className="btn-danger" onClick={() => askDelete([...selected])}>Delete selected</button>
        </div>
      )}

      {contacts.length === 0 ? (
        <p className="emaillist-empty">No contacts yet — they'll appear as you add customers to orders.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th className="data-table-check">
                <input type="checkbox" aria-label="Select all" checked={allSelected} onChange={toggleAll} />
              </th>
              <th>Name</th>
              <th>Email</th>
              <th><button type="button" className="data-table-sort" onClick={() => toggleSort('status')}>Status{arrow('status')}</button></th>
              <th><button type="button" className="data-table-sort" onClick={() => toggleSort('addedAt')}>Added{arrow('addedAt')}</button></th>
              <th><button type="button" className="data-table-sort" onClick={() => toggleSort('source')}>Source{arrow('source')}</button></th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(c => (
              <tr key={c.email}>
                <td className="data-table-check">
                  <input
                    type="checkbox"
                    aria-label={`Select ${c.email}`}
                    checked={selected.has(c.email)}
                    onChange={() => toggleSelected(c.email)}
                  />
                </td>
                <td>{c.name}</td>
                <td>{c.email}</td>
                <td>{c.status}</td>
                <td>{(c.addedAt || '').slice(0, 10)}</td>
                <td>{c.source}</td>
                <td className="data-table-actions">
                  <button className="btn-secondary" onClick={() => toggleStatus(c)}>
                    {c.status === 'subscribed' ? 'Unsubscribe' : 'Resubscribe'}
                  </button>
                  <button className="btn-danger" onClick={() => askDelete([c.email])}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
