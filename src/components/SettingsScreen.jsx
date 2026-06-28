import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSettings, saveSettings } from '../api/settings';
import { getAuthStatus, logout } from '../api/auth';
import Toast from './Toast';

export default function SettingsScreen() {
  const [settings, setSettings] = useState({ brandName: '', spewEmail: '' });
  const [email, setEmail] = useState(null);
  const [toast, setToast] = useState(null);
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
      setToast(`Error: ${err.message}`);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <div className="settings-screen">
      <button onClick={() => navigate('/orders')}>← Back</button>
      <h2>Settings</h2>

      <div className="field-group">
        <label>Brand Name (back-print text)</label>
        <input
          value={settings.brandName}
          onChange={e => setSettings(s => ({ ...s, brandName: e.target.value }))}
        />
      </div>

      <div className="field-group">
        <label>Spew Email Address</label>
        <input
          type="email"
          value={settings.spewEmail}
          onChange={e => setSettings(s => ({ ...s, spewEmail: e.target.value }))}
        />
      </div>

      <button className="btn-primary" onClick={handleSave}>Save Settings</button>

      <div className="account-section">
        <p>Connected as: {email || 'Unknown'}</p>
        <button className="btn-secondary" onClick={handleLogout}>Sign out</button>
      </div>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
