'use client';
import { useEffect, useState } from 'react';
import { AuthProvider } from '@/lib/auth';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import { withdrawAPI } from '@/lib/api';

interface Request {
  id: string;
  firstName: string;
  lastName: string;
  companyName: string;
  bankName: string;
  iban: string;
  swiftNumber: string;
  address: string;
  amount: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  user: { name: string; email: string };
}

function WithdrawalsContent() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<Request | null>(null);
  const [processing, setProcessing] = useState('');

  const load = async () => {
    try {
      const res = await withdrawAPI.getAllRequests();
      setRequests(res.data.requests);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handle = async (id: string, action: 'approve' | 'reject') => {
    setProcessing(id + action);
    try {
      if (action === 'approve') await withdrawAPI.approve(id);
      else await withdrawAPI.reject(id);
      await load();
      setSelected(null);
    } catch (e: any) {
      alert(e.response?.data?.error || 'Action failed');
    }
    setProcessing('');
  };

  const statusColor = (s: string) =>
    s === 'APPROVED' ? 'var(--green)' : s === 'REJECTED' ? 'var(--red)' : '#ffbe32';

  const statusBg = (s: string) =>
    s === 'APPROVED' ? 'rgba(76,217,138,0.1)' : s === 'REJECTED' ? 'rgba(224,82,82,0.1)' : 'rgba(255,190,50,0.1)';

  return (
    <div className="content-left">
      <div className="page-header">
        <h1 className="page-title">Withdrawal Requests</h1>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {requests.filter(r => r.status === 'PENDING').length} pending
        </span>
      </div>

      {loading ? (
        <div className="spinner" />
      ) : requests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          No withdrawal requests yet
        </div>
      ) : (
        <div className="tx-table-wrap">
          <table className="tx-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Amount</th>
                <th>Bank</th>
                <th>Reason</th>
                <th>Date</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(r => (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.user.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.user.email}</div>
                  </td>
                  <td style={{ fontWeight: 700, color: 'var(--red)' }}>
                    €{r.amount.toLocaleString()}
                  </td>
                  <td>
                    <div>{r.bankName}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.iban}</div>
                  </td>
                  <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.reason}
                  </td>
                  <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td>
                    <span style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      color: statusColor(r.status), background: statusBg(r.status),
                    }}>
                      {r.status}
                    </span>
                  </td>
                  <td>
                    {r.status === 'PENDING' ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => setSelected(r)}
                          style={{
                            padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                            background: 'rgba(76,217,138,0.15)', color: 'var(--green)',
                            border: '1px solid rgba(76,217,138,0.3)', cursor: 'pointer',
                          }}>
                          Review
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Done</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 500 }}>
            <h2 className="modal-title">Withdrawal Request — {selected.user.name}</h2>

            {[
              ['Member',       selected.user.name],
              ['Email',        selected.user.email],
              ['Full Name',    `${selected.firstName} ${selected.lastName}`],
              ['Company',      selected.companyName],
              ['Bank',         selected.bankName],
              ['IBAN',         selected.iban],
              ['SWIFT',        selected.swiftNumber],
              ['Address',      selected.address],
              ['Amount',       `€${selected.amount.toLocaleString()}`],
              ['Reason',       selected.reason],
            ].map(([label, value]) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '8px 0', borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: 13, color: 'var(--text-primary)', maxWidth: 280, textAlign: 'right' }}>{value}</span>
              </div>
            ))}

            <div className="modal-actions" style={{ marginTop: 24 }}>
              <button className="btn-secondary" onClick={() => setSelected(null)}>Close</button>
              <button className="btn-danger"
                disabled={processing === selected.id + 'reject'}
                onClick={() => handle(selected.id, 'reject')}>
                {processing === selected.id + 'reject' ? 'Rejecting...' : 'Reject'}
              </button>
              <button className="btn-primary"
                style={{ width: 'auto', padding: '10px 24px', marginTop: 0 }}
                disabled={processing === selected.id + 'approve'}
                onClick={() => handle(selected.id, 'approve')}>
                {processing === selected.id + 'approve' ? 'Approving...' : 'Approve & Debit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WithdrawalsPage() {
  return (
    <AuthProvider>
      <ProtectedLayout requireAdmin>
        <WithdrawalsContent />
      </ProtectedLayout>
    </AuthProvider>
  );
}