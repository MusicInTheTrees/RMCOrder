import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EmailListTab from './EmailListTab';
import CampaignsTab from './CampaignsTab';

export default function EmailScreen() {
  const [tab, setTab] = useState('list');
  const navigate = useNavigate();

  return (
    <div className="settings-screen">
      <button onClick={() => navigate('/orders')}>← Back</button>
      <h2>Email</h2>

      <div className="settings-tabs">
        <button
          className={`settings-tab${tab === 'list' ? ' active' : ''}`}
          onClick={() => setTab('list')}
        >Email List</button>
        <button
          className={`settings-tab${tab === 'campaigns' ? ' active' : ''}`}
          onClick={() => setTab('campaigns')}
        >Email Campaign</button>
      </div>

      {tab === 'list' && <EmailListTab />}
      {tab === 'campaigns' && <CampaignsTab />}
    </div>
  );
}
