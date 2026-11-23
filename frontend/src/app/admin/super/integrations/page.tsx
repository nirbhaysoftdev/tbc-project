'use client';
// src/app/admin/super/integrations/page.tsx
//
// Super Admin -> Integrations: everything that connects the portal to something
// outside it. API keys let outside systems read the portal, Notifications is
// where the portal's own alerts are mailed, Zoho Books is where invoices go.
// The tab lives in the URL hash (/admin/super/integrations#zoho), like the
// admin panel's, so Back and a pasted link both land on the right tab.
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import ApiKeysTab from '@/components/admin/ApiKeysTab';
import SignupNotifyTab from '@/components/admin/SignupNotifyTab';
import ZohoBooksTab from '@/components/admin/ZohoBooksTab';
import { useHashTab } from '@/lib/useHashTab';

const TABS = ['apikeys', 'notifications', 'zoho'] as const;
const LABELS: Record<typeof TABS[number], string> = {
  apikeys: 'API keys', notifications: 'Notifications', zoho: 'Zoho Books',
};

function IntegrationsContent() {
  const [tab, setTab] = useHashTab(TABS, 'apikeys');

  return (
    <div className="content-left">
      <div className="page-header">
        <h1 className="page-title">Integrations</h1>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          API keys, alert recipients and Zoho Books. Every change is recorded with your name.
        </span>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 18, overflowX: 'auto' }}>
        {TABS.map((key) => (
          <button key={key} onClick={() => setTab(key)}
            style={{
              padding: '9px 16px', fontSize: 13, cursor: 'pointer', background: 'none', whiteSpace: 'nowrap',
              border: 'none', fontWeight: tab === key ? 600 : 500,
              borderBottom: tab === key ? '2px solid var(--accent-blue)' : '2px solid transparent',
              color: tab === key ? 'var(--text-primary)' : 'var(--text-muted)',
            }}>
            {LABELS[key]}
          </button>
        ))}
      </div>

      {tab === 'apikeys'       && <ApiKeysTab />}
      {tab === 'notifications' && <SignupNotifyTab />}
      {tab === 'zoho'          && <ZohoBooksTab />}
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <ProtectedLayout requireAdmin requireSuperAdmin>
      <IntegrationsContent />
    </ProtectedLayout>
  );
}
