import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSettings, saveSettings, updateApp } from '../api/settings';
import { getAuthStatus } from '../api/auth';
import { useBugLog } from '../context/BugLogContext';
import DesignPicker from './DesignPicker';
import ItemsTab from './ItemsTab';
import BugLogTab from './BugLogTab';
import StatusEmailsTab from './StatusEmailsTab';
import EmailListTab from './EmailListTab';
import Toast from './Toast';

export default function SettingsScreen() {
  const [tab, setTab] = useState('system');
  const { logError } = useBugLog();
  const [settings, setSettings] = useState({
    brandName: '',
    spewEmail: '',
    defaultBackDesign: '',
    defaultBackNotes: '',
    autoSendCustomerEmails: false,
  });
  const [email, setEmail] = useState(null);
  const [toast, setToast] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [updateLog, setUpdateLog] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    getSettings().then(setSettings).catch(console.error);
    getAuthStatus().then(s => setEmail(s.email)).catch(console.error);
  }, []);

  async function handleSave() {
    try {
      await saveSettings(settings);
      setToast('Settings saved');
    } catch (err) {
      const msg = `Settings save failed: ${err.message}`;
      setToast(msg);
      logError(msg);
    }
  }

  async function handleUpdate() {
    setUpdating(true);
    setUpdateLog('Pulling latest from GitHub...\n');
    try {
      const result = await updateApp();
      setUpdateLog(result.log + '\n\n✅ Update complete! Close and reopen the app to use the latest version.');
    } catch (err) {
      setUpdateLog((err.log ? err.log + '\n\n' : '') + '❌ Update failed: ' + err.message);
    } finally {
      setUpdating(false);
    }
  }

  function set(field) {
    return e => setSettings(s => ({ ...s, [field]: e.target.value }));
  }

  return (
    <div className="settings-screen">
      <button onClick={() => navigate('/orders')}>← Back</button>
      <h2>Settings</h2>

      <div className="settings-tabs">
        <button
          className={`settings-tab${tab === 'system' ? ' active' : ''}`}
          onClick={() => setTab('system')}
        >System</button>
        <button
          className={`settings-tab${tab === 'items' ? ' active' : ''}`}
          onClick={() => setTab('items')}
        >Items</button>
        <button
          className={`settings-tab${tab === 'status' ? ' active' : ''}`}
          onClick={() => setTab('status')}
        >Status Emails</button>
        <button
          className={`settings-tab${tab === 'emaillist' ? ' active' : ''}`}
          onClick={() => setTab('emaillist')}
        >Email List</button>
        <button
          className={`settings-tab${tab === 'bugs' ? ' active' : ''}`}
          onClick={() => setTab('bugs')}
        >Bugs</button>
      </div>

      {tab === 'system' && (
        <>
          <div className="field-group">
            <label>Brand Name (back-print reference)</label>
            <input value={settings.brandName} onChange={set('brandName')} />
          </div>
          <div className="field-group">
            <label>Spew Email Address</label>
            <input type="email" value={settings.spewEmail} onChange={set('spewEmail')} />
          </div>
          <div className="settings-section-label">Line Item Defaults</div>
          <div className="field-group">
            <label>Default Back Design</label>
            <DesignPicker
              value={settings.defaultBackDesign}
              onChange={val => setSettings(s => ({ ...s, defaultBackDesign: val }))}
            />
          </div>
          <div className="field-group">
            <label>Default Back Notes</label>
            <textarea
              value={settings.defaultBackNotes}
              onChange={set('defaultBackNotes')}
              placeholder="e.g. Center back, 3 inches below collar"
            />
          </div>
          <button className="btn-primary" onClick={handleSave}>Save Settings</button>
          <div className="account-section">
            <p>Connected as: {email || 'Unknown'}</p>
            <button className="btn-secondary" onClick={() => navigate('/')}>Landing Page</button>
          </div>

          <div className="settings-section-label">App Updates</div>
          <div className="field-group">
            <p style={{ margin: '0 0 8px', color: '#666', fontSize: '0.9em' }}>
              Pulls the latest version from GitHub and installs any new packages.
              After updating, close and reopen the app.
            </p>
            <button className="btn-secondary" onClick={handleUpdate} disabled={updating}>
              {updating ? 'Updating...' : 'Update App'}
            </button>
            {updateLog && (
              <pre style={{
                marginTop: '10px',
                padding: '10px',
                background: '#1e1e1e',
                color: '#d4d4d4',
                fontSize: '0.8em',
                borderRadius: '4px',
                whiteSpace: 'pre-wrap',
                maxHeight: '300px',
                overflowY: 'auto',
              }}>{updateLog}</pre>
            )}
          </div>
        </>
      )}

      {tab === 'items' && <ItemsTab />}
      {tab === 'status' && <StatusEmailsTab />}
      {tab === 'emaillist' && <EmailListTab />}
      {tab === 'bugs' && <BugLogTab />}

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
