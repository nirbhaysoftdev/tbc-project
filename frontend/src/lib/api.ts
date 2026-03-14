// src/lib/api.ts
import axios from 'axios';
import Cookies from 'js-cookie';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token on every request
api.interceptors.request.use((config) => {
  const token = Cookies.get('tbc_token') || (typeof localStorage !== 'undefined' ? localStorage.getItem('tbc_token') : null);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      Cookies.remove('tbc_token');
      localStorage.removeItem('tbc_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

// ── Auth ──────────────────────────────────────
export const authAPI = {
  login:  (email: string, password: string) => api.post('/auth/login', { email, password }),
  logout: ()                                 => api.post('/auth/logout'),
  me:     ()                                 => api.get('/auth/me'),
};

// ── Dashboard ─────────────────────────────────
export const dashboardAPI = {
  getSummary:  ()                    => api.get('/dashboard/summary'),
  getChart:    (period: string = '1Y') => api.get(`/dashboard/chart?period=${period}`),
};

// ── Transactions ──────────────────────────────
export const transactionsAPI = {
  getAll:    (params?: Record<string, string>) => api.get('/transactions', { params }),
  exportPDF: ()                                => api.get('/transactions/export',  { responseType: 'blob' }),
  exportCSV: ()                                => api.get('/transactions/csv',     { responseType: 'blob' }),
};

// ── Admin ─────────────────────────────────────
export const adminAPI = {
  getStats:        ()                      => api.get('/admin/stats'),
  getMembers:      (params?: Record<string, string>) => api.get('/admin/members', { params }),
  createMember:    (data: FormData)        => api.post('/admin/members', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  updateMember:    (id: string, data: FormData) => api.put(`/admin/members/${id}`, data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteMember:    (id: string)            => api.delete(`/admin/members/${id}`),
  toggleFreeze:    (id: string)            => api.put(`/admin/members/${id}/freeze`),
  updateWallet:    (id: string, data: object) => api.put(`/admin/members/${id}/wallet`, data),
  addTransaction:  (data: object)          => api.post('/admin/transactions', data),
  exportData:      ()                      => api.get('/admin/export', { responseType: 'blob' }),
};

// ── Profile ───────────────────────────────────
export const profileAPI = {
  update: (data: FormData) => api.put('/profile', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

// ── System (dev notice — always from DB) ──────
export const systemAPI = {
  getNotice:    ()                    => api.get('/system/notice'),
  updateNotice: (text: string)        => api.put('/system/notice', { text }),
};

// ── Helpers ───────────────────────────────────
export const formatEur = (n: number) =>
  `€ ${n.toLocaleString('de-DE', { minimumFractionDigits: 0 })}`;

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href    = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
};

// Withdraw
// ── Withdraw ──────────────────────────────────
export const withdrawAPI = {
  create:          (data: any)    => api.post('/withdraw', data),
  getMyRequests:   ()             => api.get('/withdraw/my'),
  getAllRequests:   ()             => api.get('/withdraw/admin/all'),
  approve:         (id: string)   => api.put(`/withdraw/admin/${id}/approve`, {}),
  reject:          (id: string)   => api.put(`/withdraw/admin/${id}/reject`, {}),
};