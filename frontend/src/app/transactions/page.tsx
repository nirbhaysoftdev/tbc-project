'use client';
// src/app/transactions/page.tsx
import { useEffect, useState } from 'react';
import { AuthProvider } from '@/lib/auth';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import { transactionsAPI, formatEur, downloadBlob } from '@/lib/api';

function TransactionsContent() {
  const [transactions, setTx]     = useState<any[]>([]);
  const [pagination,   setPag]    = useState<any>({});
  const [loading,      setLoading] = useState(true);
  const [filters,      setFilters] = useState({
    type: '', status: '', from: '', to: '', page: '1',
  });

  const fetchTx = async (f = filters) => {
    setLoading(true);
    try {
      const params: Record<string,string> = { page: f.page };
      if (f.type)   params.type   = f.type;
      if (f.status) params.status = f.status;
      if (f.from)   params.from   = f.from;
      if (f.to)     params.to     = f.to;
      const res = await transactionsAPI.getAll(params);
      setTx(res.data.transactions);
      setPag(res.data.pagination);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchTx(); }, []);

  const handleFilter = (key: string, val: string) => {
    const updated = { ...filters, [key]: val, page: '1' };
    setFilters(updated);
    fetchTx(updated);
  };

  const handlePage = (p: number) => {
    const updated = { ...filters, page: String(p) };
    setFilters(updated);
    fetchTx(updated);
  };

  const exportPDF = async () => {
    const res = await transactionsAPI.exportPDF();
    downloadBlob(res.data, `TBC-Statement-${Date.now()}.pdf`);
  };

  const exportCSV = async () => {
    const res = await transactionsAPI.exportCSV();
    downloadBlob(res.data, `TBC-Transactions-${Date.now()}.csv`);
  };

  return (
    <div className="content-left">
      <div className="page-header">
        <h1 className="page-title">Transaction History</h1>
        <div style={{ display:'flex', gap:8 }}>
          <button className="export-btn" onClick={exportCSV}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            CSV
          </button>
          <button className="export-btn" onClick={exportPDF}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            PDF
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <select className="filter-select" value={filters.type}
          onChange={e => handleFilter('type', e.target.value)}>
          <option value="">All Types</option>
          <option value="CREDIT">Credit</option>
          <option value="DEBIT">Debit</option>
        </select>
        <select className="filter-select" value={filters.status}
          onChange={e => handleFilter('status', e.target.value)}>
          <option value="">All Status</option>
          <option value="COMPLETED">Completed</option>
          <option value="PENDING">Pending</option>
          <option value="FAILED">Failed</option>
        </select>
        <input type="date" className="filter-input" value={filters.from}
          onChange={e => handleFilter('from', e.target.value)}
          placeholder="From date" />
        <input type="date" className="filter-input" value={filters.to}
          onChange={e => handleFilter('to', e.target.value)}
          placeholder="To date" />
        {(filters.type || filters.status || filters.from || filters.to) && (
          <button className="export-btn" onClick={() => {
            const reset = { type:'', status:'', from:'', to:'', page:'1' };
            setFilters(reset);
            fetchTx(reset);
          }}>Clear</button>
        )}
      </div>

      {/* Table */}
      <div className="tx-table-wrap">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" /></div>
        ) : transactions.length === 0 ? (
          <p style={{ padding: 40, textAlign:'center', color:'var(--text-muted)' }}>
            No transactions found.
          </p>
        ) : (
          <table className="tx-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx: any) => (
                <tr key={tx.id}>
                  <td>{new Date(tx.createdAt).toLocaleDateString('en-GB')}</td>
                  <td><span className={`badge badge-${tx.type.toLowerCase()}`}>{tx.type}</span></td>
                  <td>{tx.description}</td>
                  <td className={tx.type === 'CREDIT' ? 'amount-credit' : 'amount-debit'}>
                    {tx.type === 'CREDIT' ? '+' : '-'}{formatEur(tx.amount)}
                  </td>
                  <td><span className={`badge badge-${tx.status.toLowerCase()}`}>{tx.status}</span></td>
                  <td style={{ fontFamily:'monospace', fontSize:11, color:'var(--text-muted)' }}>
                    {tx.reference?.slice(0,16)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="pagination">
            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} className={`page-btn ${p === pagination.page ? 'active' : ''}`}
                onClick={() => handlePage(p)}>
                {p}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <AuthProvider>
      <ProtectedLayout>
        <TransactionsContent />
      </ProtectedLayout>
    </AuthProvider>
  );
}
