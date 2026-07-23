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

// Redirect on 401 (bad token) and 403 PENDING (awaiting admin approval)
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (typeof window !== 'undefined') {
      const status = err.response?.status;
      const path   = window.location.pathname;

      if (status === 401) {
        Cookies.remove('tbc_token');
        localStorage.removeItem('tbc_token');
        if (path !== '/login') window.location.href = '/login';
      } else if (
        status === 403 &&
        err.response?.data?.status === 'PENDING' &&
        !path.startsWith('/onboarding')
      ) {
        window.location.href = '/onboarding/pending';
      }
    }
    return Promise.reject(err);
  }
);

export default api;

// ── Auth ──────────────────────────────────────
export const authAPI = {
  register: (data: FormData) =>
    api.post('/auth/register', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  sendOtp:   (email: string)                    => api.post('/auth/send-otp',   { email }),
  verifyOtp: (email: string, code: string)      => api.post('/auth/verify-otp', { email, code }),
  google:    (credential: string)               => api.post('/auth/google',     { credential }),
  login:     (email: string, password: string)  => api.post('/auth/login',      { email, password }),
  logout:    ()                                 => api.post('/auth/logout'),
  me:        ()                                 => api.get('/auth/me'),
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
  getPending:      (params?: Record<string, string>) => api.get('/admin/pending', { params }),
  approveUser:     (id: string, data?: object) => api.post(`/admin/users/${id}/approve`, data ?? {}),
  rejectUser:      (id: string, reason?: string) => api.post(`/admin/users/${id}/reject`, { reason }),
  createMember:    (data: FormData)        => api.post('/admin/members', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  updateMember:    (id: string, data: FormData) => api.put(`/admin/members/${id}`, data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteMember:    (id: string)            => api.delete(`/admin/members/${id}`),
  toggleFreeze:    (id: string)            => api.put(`/admin/members/${id}/freeze`),
  updateWallet:    (id: string, data: object) => api.put(`/admin/members/${id}/wallet`, data),
  addTransaction:  (data: object)          => api.post('/admin/transactions', data),
  exportData:      ()                      => api.get('/admin/export', { responseType: 'blob' }),
};

// ── MMS — User Onboarding ─────────────────────
export const mmsAPI = {
  submitProfile: (data: object)  => api.post('/user/profile', data),
  submitKyc:     (data: FormData) =>
    api.post('/user/kyc', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getKycStatus:  ()              => api.get('/user/kyc'),
  getKpi:        ()              => api.get('/user/kpi'),
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
export const formatEur = (n?: number | null) => {
  const safe = Number(n) || 0;

  return `€ ${safe.toLocaleString('en-IE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}`;
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href    = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
};

// ── Withdraw ──────────────────────────────────
export const withdrawAPI = {
  create:        (data: any)  => api.post('/withdraw', data),
  getMyRequests: ()           => api.get('/withdraw/my'),
  getAllRequests: ()           => api.get('/withdraw/admin/all'),
  approve:       (id: string) => api.put(`/withdraw/admin/${id}/approve`, {}),
  reject:        (id: string) => api.put(`/withdraw/admin/${id}/reject`, {}),
};

// ── Community ──────────────────────────────────
export const communityAPI = {
  getStats:     ()                              => api.get('/community/stats'),
  getFeed:      (params?: Record<string, string>) => api.get('/community/feed', { params }),
  createPost:   (data: object)                  => api.post('/community/feed', data),
  deletePost:   (id: string)                    => api.delete(`/community/feed/${id}`),
  toggleLike:   (id: string)                    => api.post(`/community/feed/${id}/like`),
  getComments:  (id: string)                    => api.get(`/community/feed/${id}/comments`),
  addComment:   (id: string, content: string)   => api.post(`/community/feed/${id}/comments`, { content }),
  getMembers:   (params?: Record<string, string>) => api.get('/community/members', { params }),
  getMember:    (id: string)                    => api.get(`/community/members/${id}`),
  updateProfile:(data: object)                  => api.put('/community/profile', data),
  getNotifications:     ()                      => api.get('/community/notifications'),
  markNotificationRead: (id: string)            => api.put(`/community/notifications/${id}/read`),
};

// ── Events ─────────────────────────────────────
export const eventsAPI = {
  getAll:             (params?: Record<string, string>) => api.get('/events', { params }),
  getOne:             (id: string)              => api.get(`/events/${id}`),
  create:             (data: object)            => api.post('/events', data),
  update:             (id: string, data: object) => api.put(`/events/${id}`, data),
  remove:             (id: string)              => api.delete(`/events/${id}`),
  register:           (id: string)              => api.post(`/events/${id}/register`),
  cancelRegistration: (id: string)              => api.delete(`/events/${id}/register`),
};

// ── Messages / Chat ─────────────────────────────
export const messagesAPI = {
  getConversations: ()                                   => api.get('/messages'),
  getMessages:      (partnerId: string)                  => api.get(`/messages/${partnerId}`),
  sendMessage:      (receiverId: string, content: string) => api.post('/messages', { receiverId, content }),
  getUnreadCount:   ()                                   => api.get('/messages/unread'),
};

// ── Projects / Deal Room ────────────────────────
export const projectsAPI = {
  getAll:           (params?: Record<string, string>) => api.get('/projects', { params }),
  getOne:           (id: string)              => api.get(`/projects/${id}`),
  create:           (data: object)            => api.post('/projects', data),
  update:           (id: string, data: object) => api.put(`/projects/${id}`, data),
  remove:           (id: string)              => api.delete(`/projects/${id}`),
  invest:           (id: string, data: object) => api.post(`/projects/${id}/invest`, data),
  addMilestone:     (id: string, data: object) => api.post(`/projects/${id}/milestones`, data),
  getMyInvestments: ()                        => api.get('/projects/my-investments'),
};