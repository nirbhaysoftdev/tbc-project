// src/lib/api.ts
import axios from 'axios';
import Cookies from 'js-cookie';
import i18n from '@/i18n';
import { DEFAULT_LANGUAGE, normalizeLanguage } from '@/i18n/languages';
import { formatCurrency } from '@/i18n/format';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token and the active language on every request.
api.interceptors.request.use((config) => {
  const token = Cookies.get('tbc_token') || (typeof localStorage !== 'undefined' ? localStorage.getItem('tbc_token') : null);
  if (token) config.headers.Authorization = `Bearer ${token}`;

  const lang = normalizeLanguage(i18n.language) || DEFAULT_LANGUAGE;
  config.headers['Accept-Language'] = lang;

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
        // Debug mode (in progress): log the response instead of clearing the
        // token and bouncing to /login, so a 401 can be inspected.
        try { console.warn('[api] 401 (auth) at', err.config?.url, err.response?.data); } catch (e) {}
        return Promise.reject(err);
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
  // Switching a member's wallet on. Opening BALANCES are a separate,
  // super-admin-only call (superAdminAPI has no equivalent: the balances
  // endpoint below is the one that moved).
  setWalletEnabled:(id: string, enabled = true) =>
    api.put(`/admin/members/${id}/wallet-enabled`, { enabled }),
  // Super admin only. An ADMIN calling this gets a 403.
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

// ── Super admin ───────────────────────────────
// Everything behind requireSuperAdmin. An ADMIN calling any of these gets a
// 403, so the UI must gate the controls with isSuperAdminRole() rather than
// relying on the error — see src/lib/roles.ts.
export const superAdminAPI = {
  // ── Users ──
  // Not limited to role MEMBER, unlike adminAPI.getMembers: managing admins is
  // the point of the panel.
  listUsers:   (params?: Record<string, string>) => api.get('/super-admin/users', { params }),
  getUser:     (id: string) => api.get(`/super-admin/users/${id}`),

  /**
   * The whole record in one call: account fields at the top level, with
   * `profile` and `membership` nested. Only the keys present are written, so
   * an omitted field is left alone rather than cleared.
   */
  updateUser:  (id: string, data: object | FormData) =>
    data instanceof FormData
      ? api.put(`/super-admin/users/${id}`, data, { headers: { 'Content-Type': 'multipart/form-data' } })
      : api.put(`/super-admin/users/${id}`, data),

  // Credentials and role are separate endpoints: each is logged and notified on
  // its own, because either one hands over control of the account.
  changeEmail: (id: string, email: string, markVerified = false) =>
    api.put(`/super-admin/users/${id}/email`, { email, markVerified }),

  /**
   * mode "link" emails the member a reset code and changes nothing — prefer it,
   * since nobody but the member ever learns the password. mode "set" writes one
   * directly and returns the plaintext ONCE, for a member who cannot receive
   * mail. It is never logged, so it cannot be recovered after this response.
   */
  resetPassword: (id: string, body: { mode: 'link' } | { mode: 'set'; password?: string }) =>
    api.post(`/super-admin/users/${id}/reset-password`, body),

  setRole: (id: string, role: 'MEMBER' | 'ADMIN' | 'SUPER_ADMIN') =>
    api.put(`/super-admin/users/${id}/role`, { role }),

  // Recoverable. The account vanishes from the portal and cannot sign in, but
  // the row survives so the ledger keeps its references.
  deleteUser:  (id: string) => api.delete(`/super-admin/users/${id}`),
  restoreUser: (id: string) => api.post(`/super-admin/users/${id}/restore`),

  /**
   * Irreversible. `confirm` must be the member's exact email address, which is
   * what makes this impossible to reach by a mistyped id or a stale tab.
   */
  purgeUser:   (id: string, confirm: string) =>
    api.post(`/super-admin/users/${id}/purge`, { confirm }),

  /**
   * Returns a 30-minute token that authenticates AS the member. Read-only: the
   * API refuses every non-GET made with it, which is what keeps the audit log
   * truthful. Swap it in, then call endImpersonation to drop back.
   */
  impersonate: (id: string) => api.post(`/super-admin/users/${id}/impersonate`),
  impersonationStatus: () => api.get('/super-admin/impersonation/status'),

  // ── Identity documents ──
  // kind is passport | residentId | tradeLicense | cv. These land in uploads/
  // and are authorised per request by fileAccess.js (readable by the owner or
  // an admin). Open them with openDocument(), never a plain <a href>.
  uploadDocument: (id: string, kind: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post(`/super-admin/users/${id}/documents/${kind}`, fd,
      { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  deleteDocument: (id: string, kind: string) =>
    api.delete(`/super-admin/users/${id}/documents/${kind}`),

  addKycDocument: (id: string, documentType: 'id_proof' | 'business_proof', file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('documentType', documentType);
    return api.post(`/super-admin/users/${id}/kyc-documents`, fd,
      { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  reviewKycDocument: (id: string, docId: string, status: 'pending' | 'approved' | 'rejected') =>
    api.put(`/super-admin/users/${id}/kyc-documents/${docId}`, { status }),
  deleteKycDocument: (id: string, docId: string) =>
    api.delete(`/super-admin/users/${id}/kyc-documents/${docId}`),

  // ── Projects and companies ──
  /**
   * What a forced delete would destroy, before anything happens. Ask for this
   * first and show it: a project with settled investments cannot be deleted at
   * all, and the manifest is the only place that says so in advance.
   */
  projectDeleteManifest: (id: string) =>
    api.get(`/super-admin/projects/${id}/delete-manifest`),

  /** `confirm` must be the project's exact title. */
  forceDeleteProject: (id: string, confirm: string, cascadeRequests = false) =>
    api.post(`/super-admin/projects/${id}/force-delete`, { confirm, cascadeRequests }),

  transferProject: (id: string, data: { ownerId?: string; managerId?: string }) =>
    api.put(`/super-admin/projects/${id}/transfer`, data),
  transferCompany: (id: string, createdById: string) =>
    api.put(`/super-admin/companies/${id}/transfer`, { createdById }),

  // ── Content ──
  deletePost:    (id: string) => api.delete(`/super-admin/posts/${id}`),
  deleteComment: (id: string) => api.delete(`/super-admin/comments/${id}`),
  deleteEnquiry: (id: string) => api.delete(`/super-admin/enquiries/${id}`),

  // ── Ledger ──
  /**
   * Books the mirror-image entry and lets the wallet recompute. The original
   * row stays in the member's statement with the correction beside it — which
   * is why no endpoint anywhere edits a balance directly. Only the manual
   * categories (ADMIN_CREDIT, ADMIN_DEBIT, WITHDRAWAL) can be reversed.
   */
  reverseTransaction: (id: string) =>
    api.post(`/super-admin/transactions/${id}/reverse`),
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

  /**
   * Persist the member's UI language so it follows them to another device.
   *
   * Fire-and-forget at the call site (lib/auth.tsx): the language has already
   * been applied in the browser by the time this runs, so a failure here means
   * the preference is not remembered, not that the switch did not happen. The
   * server validates the code against its own allowlist — PATCH /profile/language.
   */
  setLanguage: (locale: string) => api.patch('/profile/language', { locale }),
};

// ── Helpers ───────────────────────────────────
// Formatting lives in src/i18n/format.ts, which reads the active i18next
// language, memoises its Intl formatters and pins Persian and Arabic to
// Western digits. It is re-exported here because dozens of call sites across
// the dashboard, portfolio, transactions, admin, project and company pages
// import these from '@/lib/api' — re-exporting keeps one implementation
// behind both import paths rather than a second copy that drifts from it.
export {
  formatNumber,
  formatPercent,
  formatDate,
  formatDateTime,
  formatDateLong,
  formatRelative,
  formatCurrency,
} from '@/i18n/format';


/**
 * Every figure in this portal is euros, so this is the formatter to reach for.
 * A thin alias over formatCurrency so there is no second place where the
 * currency, the fraction digits or the numeral system could be decided.
 */
export const formatEur = (n?: number | null) => formatCurrency(n, 'EUR');

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

// ── Private files ──────────────────────────────
// Identity and KYC documents are not publicly readable. Ask for a short-lived
// signed URL, then open that - a plain <a href> cannot carry the Bearer token.
export const filesAPI = {
  sign: (path: string) => api.get('/files/sign', { params: { path } }),
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
  // Category / location / owner / valuation-range options for the listing's
  // filter bar, built from the live data rather than a hardcoded list.
  getFacets:        ()                        => api.get('/projects/facets'),
  create:           (data: object)            => api.post('/projects', data),
  update:           (id: string, data: object) => api.put(`/projects/${id}`, data),
  remove:           (id: string)              => api.delete(`/projects/${id}`),
  invest:           (id: string, data: object) => api.post(`/projects/${id}/invest`, data),
  addMilestone:     (id: string, data: object) => api.post(`/projects/${id}/milestones`, data),
  getMyInvestments: ()                        => api.get('/projects/my-investments'),

  // Member search behind the owner / manager / team / investor / partner /
  // client pickers. Admin-only on the server, and it returns names and
  // professional fields only - never an email or a phone number.
  searchPeople:     (q: string, limit = 10) =>
    api.get('/projects/people/search', { params: { q, limit: String(limit) } }),

  // ── Deal-room media (images / PDFs / video) ──
  // A listing returns a short-lived stream URL per item. Those URLs are the only
  // way to reach the bytes, and they are for viewing in-page: there is
  // deliberately no download endpoint. See projectMediaController.
  listMedia:        (id: string)              => api.get(`/projects/${id}/media`),
  uploadMedia:      (id: string, data: FormData) =>
    api.post(`/projects/${id}/media`, data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  removeMedia:      (id: string, docId: string) => api.delete(`/projects/${id}/media/${docId}`),
};

// ── Companies ───────────────────────────────────
// The company profile module. Same contract as projectsAPI: server-side
// search, filters, sorting and pagination, and media that is only reachable
// through short-lived ticketed URLs.
export const companiesAPI = {
  getAll:    (params?: Record<string, string>) => api.get('/companies', { params }),
  getOne:    (id: string)                      => api.get(`/companies/${id}`),
  // Category / location / owner / valuation-range options for the filter bar,
  // built from the live data rather than a hardcoded list.
  getFacets: ()                                => api.get('/companies/facets'),
  create:    (data: object)                    => api.post('/companies', data),
  update:    (id: string, data: object)        => api.put(`/companies/${id}`, data),
  remove:    (id: string)                      => api.delete(`/companies/${id}`),

  // ── Media (logo, banner, gallery, documents, video) ──
  // `purpose` tells the server what a batch is for: uploading with
  // purpose=LOGO or BANNER also points the profile at the new file.
  listMedia:   (id: string) => api.get(`/companies/${id}/media`),
  uploadMedia: (id: string, data: FormData) =>
    api.post(`/companies/${id}/media`, data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  removeMedia: (id: string, docId: string) => api.delete(`/companies/${id}/media/${docId}`),

  // A Word document is converted to sanitised HTML on the server so it can be
  // read inside the portal; no browser renders .docx natively. The URL comes
  // from the media listing, ticket included.
  previewDoc:  (previewUrl: string) => api.get(previewUrl.replace(/^\/api/, '')),
};

// ── Connect Now / Enquire Now ───────────────────
// Replaces published contact details: a member sends a message and the server
// delivers it to the recipient configured for that project or company.
//
// The member's identity is NOT sent. The server takes it from the session
// token — the name and email shown in the modal are read-only because they are
// display copies of what the server already knows, not inputs.
export const enquiriesAPI = {
  create: (payload: { projectId?: string; companyId?: string; message: string }) =>
    api.post('/enquiries', payload),

  // The record side: who asked about what, and whether it was delivered.
  // Admin-only on the server.
  list: (params?: Record<string, string>) => api.get('/enquiries', { params }),

  // The portal-wide recipients. Several addresses are supported and every one
  // receives every enquiry. Changing the list emails the addresses added and
  // removed — the server does that, not the client.
  getRecipient:    ()                 => api.get('/enquiries/recipient'),
  updateRecipient: (emails: string[]) => api.put('/enquiries/recipient', { emails }),
};

// Media stream URLs come back relative to the API root, so they need the same
// base as the axios client when handed to an <img>, <video> or <iframe>.
export const mediaSrc = (streamUrl: string) => `${API_URL}${streamUrl}`;