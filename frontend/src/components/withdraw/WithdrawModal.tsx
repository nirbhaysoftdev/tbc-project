'use client';
import { useState } from 'react';
import { withdrawAPI } from '@/lib/api';

interface Props {
  balance:   number;
  userName:  string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function WithdrawModal({ balance, userName, onClose, onSuccess }: Props) {
 const nameParts = userName.split(' ');
  const [form, setForm] = useState({
    firstName:   nameParts[0] || '',
    lastName:    nameParts.slice(1).join(' ') || '',
    companyName: '',
    bankName:    '',
    iban:        '',
    swiftNumber: '',
    address:     '',
    amount:      '',
    reason:      '',
  });
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (parseFloat(form.amount) > balance) {
      setError('Amount cannot exceed your available balance.');
      return;
    }
    if (parseFloat(form.amount) <= 0) {
      setError('Amount must be greater than 0.');
      return;
    }

    setLoading(true);
    try {
      await withdrawAPI.create(form);
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Submission failed.');
    }
    setLoading(false);
  };

  const inputStyle = {
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '10px 12px',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
  };

  const labelStyle = {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 5,
    letterSpacing: '0.04em',
  };

  const rowStyle = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 14,
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}
        style={{ width: 560, maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>Withdraw Funds</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              Available Balance:
              <span style={{ color: 'var(--green)', fontWeight: 700, marginLeft: 6 }}>
                €{balance.toLocaleString()}
              </span>
            </p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Name row */}
          <div style={{ ...rowStyle, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>FIRST NAME</label>
              <input style={inputStyle} value={form.firstName}
                onChange={e => set('firstName', e.target.value)} required />
            </div>
            <div>
              <label style={labelStyle}>LAST NAME</label>
              <input style={inputStyle} value={form.lastName}
                onChange={e => set('lastName', e.target.value)} required />
            </div>
          </div>

          {/* Company */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>COMPANY NAME</label>
            <input style={inputStyle} value={form.companyName}
              onChange={e => set('companyName', e.target.value)} required />
          </div>

          {/* Bank row */}
          <div style={{ ...rowStyle, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>BANK NAME</label>
              <input style={inputStyle} value={form.bankName}
                onChange={e => set('bankName', e.target.value)} required />
            </div>
            <div>
              <label style={labelStyle}>SWIFT NUMBER</label>
              <input style={inputStyle} value={form.swiftNumber}
                onChange={e => set('swiftNumber', e.target.value)} required />
            </div>
          </div>

          {/* IBAN */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>IBAN</label>
            <input style={inputStyle} value={form.iban}
              onChange={e => set('iban', e.target.value)} required />
          </div>

          {/* Address */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>ADDRESS</label>
            <input style={inputStyle} value={form.address}
              onChange={e => set('address', e.target.value)} required />
          </div>

          {/* Amount + Balance row */}
          <div style={{ ...rowStyle, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>AMOUNT (€)</label>
              <input style={{
                  ...inputStyle,
                  borderColor: parseFloat(form.amount) > balance ? 'var(--red)' : undefined,
                }}
                type="number" min="1" max={balance} step="0.01"
                value={form.amount}
                onChange={e => set('amount', e.target.value)} required />
              {parseFloat(form.amount) > balance && (
                <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>
                  Exceeds available balance
                </p>
              )}
            </div>
            <div>
              <label style={labelStyle}>AVAILABLE BALANCE</label>
              <input style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }}
                value={`€${balance.toLocaleString()}`} readOnly />
            </div>
          </div>

          {/* Reason */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>REASON</label>
            <textarea style={{ ...inputStyle, height: 80, resize: 'vertical' } as any}
              value={form.reason}
              onChange={e => set('reason', e.target.value)} required />
          </div>

          {error && (
            <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 14, textAlign: 'center' }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary"
              style={{ width: 'auto', padding: '10px 28px', marginTop: 0 }}
              disabled={loading || parseFloat(form.amount) > balance}>
              {loading ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}