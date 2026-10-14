'use client';
// src/app/transactions/page.tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import { useAuth } from '@/lib/auth';
import { transactionsAPI, formatEur, formatDate, downloadBlob } from '@/lib/api';

function TransactionsContent() {
  const { t } = useTranslation(['dashboard', 'common']);
  const { user } = useAuth();
  // An admin's list spans every member, so the rows have to name their owner.
  // A member only ever sees their own rows, where the column is noise.
  const showMember = user?.role === 'ADMIN';

  const [transactions, setTx]     = useState<any[]>([]);
  const [pagination,   setPag]    = useState<any>({});
  const [loading,      setLoading] = useState(true);
  const [filters,      setFilters] = useState({
    type: '', status: '',category: '', from: '', to: '', page: '1',
  });

  const fetchTx = async (f = filters) => {
    
    setLoading(true);
    try {
      const params: Record<string,string> = { page: f.page };
      if (f.type)   params.type   = f.type;
      if (f.category)   params.category   = f.category;
      if (f.status) params.status = f.status;
      if (f.from)   params.from   = f.from;
      if (f.to)     params.to     = f.to;
      const res = await transactionsAPI.getAll(params);
      setTx(res.data.transactions);
      setPag(res.data.pagination);
      console.log("API RESPONSE:", res.data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
  fetchTx(filters);
}, []);

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
        <h1 className="page-title">{t('dashboard:transactions.pageTitle')}</h1>
        <div style={{ display:'flex', gap:8 }}>
          <button className="export-btn" onClick={exportCSV}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {t('dashboard:transactions.csv')}
          </button>
          <button className="export-btn" onClick={exportPDF}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            {t('dashboard:transactions.pdf')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-bar">

        <select className="filter-select" value={filters.category}
  onChange={e => handleFilter('category', e.target.value)}>
  {/* `value` is the API filter parameter and must stay the raw enum; only
      the visible option text is translated (§3). */}
  <option value="">{t('dashboard:transactions.allCategories')}</option>
  <option value="INVESTMENT">{t('dashboard:transactions.category.INVESTMENT')}</option>
  <option value="PROFIT">{t('dashboard:transactions.category.PROFIT')}</option>
  <option value="WITHDRAWAL">{t('dashboard:transactions.category.WITHDRAWAL')}</option>
</select>

        <select className="filter-select" value={filters.type}
          onChange={e => handleFilter('type', e.target.value)}>
          <option value="">{t('dashboard:transactions.allTypes')}</option>
          <option value="CREDIT">{t('dashboard:transactions.type.CREDIT')}</option>
          <option value="DEBIT">{t('dashboard:transactions.type.DEBIT')}</option>
        </select>
        <select className="filter-select" value={filters.status}
          onChange={e => handleFilter('status', e.target.value)}>
          <option value="">{t('dashboard:transactions.allStatus')}</option>
          <option value="COMPLETED">{t('dashboard:transactions.txStatus.COMPLETED')}</option>
          <option value="PENDING">{t('dashboard:transactions.txStatus.PENDING')}</option>
          <option value="FAILED">{t('dashboard:transactions.txStatus.FAILED')}</option>
        </select>
        <input type="date" className="filter-input" value={filters.from}
          onChange={e => handleFilter('from', e.target.value)}
          placeholder={t('dashboard:transactions.fromDate')} />
        <input type="date" className="filter-input" value={filters.to}
          onChange={e => handleFilter('to', e.target.value)}
          placeholder={t('dashboard:transactions.toDate')} />
        {(filters.type || filters.status || filters.from || filters.category || filters.to) && (
          <button className="export-btn" onClick={() => {
            const reset = { type:'', status:'', from:'', category:'', to:'', page:'1' };
            setFilters(reset);
            fetchTx(reset);
          }}>{t('common:action.clear')}</button>
        )}
      </div>

      {/* Table */}
      <div className="tx-table-wrap">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" /></div>
        ) : transactions.length === 0 ? (
          <p style={{ padding: 40, textAlign:'center', color:'var(--text-muted)' }}>
            {t('dashboard:transactions.none')}
          </p>
        ) : (
          <table className="tx-table">
            <thead>
              <tr>
                <th>{t('dashboard:transactions.columns.date')}</th>
                {showMember && <th>{t('dashboard:transactions.columns.member')}</th>}
                <th>{t('dashboard:transactions.columns.type')}</th>
                <th>{t('dashboard:transactions.columns.description')}</th>
                <th>{t('dashboard:transactions.columns.amount')}</th>
                <th>{t('dashboard:transactions.columns.status')}</th>
                <th>{t('dashboard:transactions.columns.balance')}</th>
                <th>{t('dashboard:transactions.columns.reference')}</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx: any) => (
                <tr key={tx.id}>
                  <td>{formatDate(tx.createdAt)}</td>
                  {showMember && (
                    <td>
                      <div style={{ fontWeight:600, color:'var(--text-primary)' }}>
                        {tx.user?.name || '—'}
                      </div>
                      {tx.user?.email && (
                        // Email addresses stay LTR inside an RTL page (§10).
                        <div className="ltr-embed" style={{ fontSize:11, color:'var(--text-muted)' }}>{tx.user.email}</div>
                      )}
                    </td>
                  )}
                  <td>
                    <span className={`badge badge-${tx.type.toLowerCase()}`}>
                      {t(`dashboard:transactions.type.${tx.type}`)}
                    </span>
                  </td>
                 <td> <div style={{ fontWeight:600 }}>
                        {tx.category
                          // A category the registry does not know yet falls back
                          // to the raw value rather than rendering blank.
                          ? t(`dashboard:transactions.category.${tx.category}`, { defaultValue: tx.category })
                          : ''}
                      </div>
                     <div style={{ fontSize:12, color:'var(--text-muted)' }}>
                       {tx.description}
                     </div>
                  </td>
                  <td className={tx.type === 'CREDIT' ? 'amount-credit' : 'amount-debit'}>
                    <span className="ltr-embed">
                      {tx.type === 'CREDIT' ? '+' : '-'}{formatEur(tx.amount)}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${tx.status.toLowerCase()}`}>
                      {t(`dashboard:transactions.txStatus.${tx.status}`)}
                    </span>
                  </td>
                  <td><span className="ltr-embed">{formatEur(tx.balanceAfter || 0)}</span></td>
                  {/* A reference code is an identifier: never translated, and
                      always rendered LTR (§10, §6.A.13). */}
                  <td className="ltr-embed" style={{ fontFamily:'monospace', fontSize:11, color:'var(--text-muted)' }}>
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
    <ProtectedLayout>
      <TransactionsContent />
    </ProtectedLayout>
  );
}
