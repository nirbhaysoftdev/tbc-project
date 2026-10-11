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
      // A sign-in attempt that comes back PENDING must stay on the page so the
      // form can show why. There is no session to redirect into either - the
      // pending screen would only bounce straight back to /login.
      const isAuthAttempt = /\/auth\/(login|google|register)$/.test(
        err.config?.url || '',
      );

      if (status === 401) {
        Cookies.remove('tbc_token');
        localStorage.removeItem('tbc_token');
        if (path !== '/login') window.location.href = '/login';
      } else if (
        status === 403 &&
        err.response?.data?.status === 'PENDING' &&
        !isAuthAttempt &&
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
  forgotPassword: (email: string)                           => api.post('/auth/forgot-password', { email }),
  resetPassword:  (email: string, code: string, newPassword: string) =>
    api.post('/auth/reset-password', { email, code, newPassword }),
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
  // Counts behind the gold notification badge (pending members / requests)
  getNotifications:()                      => api.get('/admin/notifications'),
  getMembers:      (params?: Record<string, string>) => api.get('/admin/members', { params }),
  getPending:      (params?: Record<string, string>) => api.get('/admin/pending', { params }),
  approveUser:     (id: string, data?: FormData | object) =>
    data instanceof FormData
      ? api.post(`/admin/users/${id}/approve`, data, { headers: { 'Content-Type': 'multipart/form-data' } })
      : api.post(`/admin/users/${id}/approve`, data ?? {}),
  rejectUser:      (id: string, reason?: string) => api.post(`/admin/users/${id}/reject`, { reason }),
  createMember:    (data: FormData)        => api.post('/admin/members', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  updateMember:    (id: string, data: FormData) => api.put(`/admin/members/${id}`, data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteMember:    (id: string)            => api.delete(`/admin/members/${id}`),
  toggleFreeze:    (id: string)            => api.put(`/admin/members/${id}/freeze`),
  updateWallet:    (id: string, data: object) => api.put(`/admin/members/${id}/wallet`, data),
  addTransaction:  (data: object)          => api.post('/admin/transactions', data),
  // One member's full money picture (detail page) and the statement email it sends
  getMemberOverview:   (id: string)                 => api.get(`/admin/members/${id}/overview`),
  sendMemberStatement: (id: string, note?: string)  => api.post(`/admin/members/${id}/send-statement`, note ? { note } : {}),
  exportData:      ()                      => api.get('/admin/export', { responseType: 'blob' }),
  // Activity logs (emails, member/investment requests, profit, withdrawals)
  getLogs:         (params?: Record<string, string>) => api.get('/admin/logs', { params }),
  getLogTypes:     ()                      => api.get('/admin/logs/types'),
};

// ── Investment / Profit Engine (admin) ────────
// Projects come from the Deal Room. `projectId` is always optional: capital
// booked with no project is a supported, permanent case.
export const investmentAPI = {
  listProjects:         ()                      => api.get('/admin/investment-projects'),
  listInvestments:      (params?: Record<string, string>) => api.get('/admin/investments', { params }),
  createInvestment:     (data: { userId: string; projectId?: string | null; amount: number | string; investedAt: string; description?: string }) =>
    api.post('/admin/investments', data),
  returnCapital:        (investmentId: string, data: { amount?: number | string; description?: string }) =>
    api.post(`/admin/investments/${investmentId}/return-capital`, data),
  createOneTimeProfit:  (data: { userId: string; projectId?: string | null; profitType: 'ONE_TIME_AMOUNT' | 'ONE_TIME_PERCENT'; value: number | string; effectiveDate: string; description?: string }) =>
    api.post('/admin/profit/one-time', data),
  setMonthlyProfitConfig: (data: { userId: string; projectId?: string | null; rate: number | string; monthlyProfitDay?: number; effectiveFrom: string }) =>
    api.put('/admin/profit/monthly-config', data),
  previewMonthlyProfit: (userId: string, projectId?: string | null) =>
    api.get('/admin/profit/monthly-preview', { params: { userId, projectId: projectId || '' } }),
  listProfitRecords:    (params?: Record<string, string>) => api.get('/admin/profit/records', { params }),
  runMonthlyGeneration: (periodDate?: string)   => api.post('/admin/profit/generate-monthly', periodDate ? { periodDate } : {}),
};

// ── Investment Requests ────────────────────────
// A member can only ASK to invest. Admin confirms the money arrived offline and
// completes the request with the ACTUAL amount received - that is the only step
// that creates capital, wallet movement and a transaction.
export const investmentRequestAPI = {
  // member
  create:        (projectId: string, data: { amount: number | string; message?: string }) =>
    api.post(`/projects/${projectId}/invest`, data),
  getMine:       ()           => api.get('/projects/my-investment-requests'),
  cancel:        (id: string) => api.put(`/projects/investment-requests/${id}/cancel`, {}),
  // admin
  list:            (params?: Record<string, string>) => api.get('/admin/investment-requests', { params }),
  getOne:          (id: string) => api.get(`/admin/investment-requests/${id}`),
  paymentReceived: (id: string) => api.put(`/admin/investment-requests/${id}/payment-received`, {}),
  reject:          (id: string, reason?: string) => api.put(`/admin/investment-requests/${id}/reject`, { reason }),
  complete:        (id: string, data: { actualAmount: number | string; investedAt?: string; description?: string }) =>
    api.post(`/admin/investment-requests/${id}/complete`, data),
};

// ── MMS - User Onboarding ─────────────────────
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

  // ── Deal-room media (images / PDFs / video) ──
  // A listing returns a short-lived stream URL per item. Those URLs are the only
  // way to reach the bytes, and they are for viewing in-page: there is
  // deliberately no download endpoint. See projectMediaController.
  listMedia:        (id: string)              => api.get(`/projects/${id}/media`),
  uploadMedia:      (id: string, data: FormData) =>
    api.post(`/projects/${id}/media`, data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  removeMedia:      (id: string, docId: string) => api.delete(`/projects/${id}/media/${docId}`),
};

// Media stream URLs come back relative to the API root, so they need the same
// base as the axios client when handed to an <img>, <video> or <iframe>.
export const mediaSrc = (streamUrl: string) => `${API_URL}${streamUrl}`;