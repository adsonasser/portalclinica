import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';

const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

export default api;

// ─── Auth ────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
};

// ─── Dashboard ───────────────────────────────────────────────────────────────

export const dashboardApi = {
  stats: () => api.get('/dashboard').then((r) => r.data),
  chart: (months = 6) => api.get(`/dashboard/chart?months=${months}`).then((r) => r.data),
  dashboard360: (params?: { period?: string; professionalId?: string }) =>
    api.get('/dashboard/360', { params }).then((r) => r.data),
};

// ─── Patients ────────────────────────────────────────────────────────────────

export const patientsApi = {
  list: (params?: Record<string, string>) =>
    api.get('/patients', { params }).then((r) => r.data),
  get: (id: string) => api.get(`/patients/${id}`).then((r) => r.data),
  stats: () => api.get('/patients/stats').then((r) => r.data),
  create: (data: any) => api.post('/patients', data).then((r) => r.data),
  update: (id: string, data: any) => api.patch(`/patients/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/patients/${id}`).then((r) => r.data),
  import: (patients: any[]) => api.post('/patients/import', { patients }).then((r) => r.data),
};

// ─── Plans ───────────────────────────────────────────────────────────────────

export const plansApi = {
  list: () => api.get('/plans').then((r) => r.data),
  get: (id: string) => api.get(`/plans/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/plans', data).then((r) => r.data),
  update: (id: string, data: any) => api.patch(`/plans/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/plans/${id}`).then((r) => r.data),
};

// ─── Appointment Types ────────────────────────────────────────────────────────

export const appointmentTypesApi = {
  list: () => api.get('/appointment-types').then((r) => r.data),
  get: (id: string) => api.get(`/appointment-types/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/appointment-types', data).then((r) => r.data),
  update: (id: string, data: any) => api.patch(`/appointment-types/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/appointment-types/${id}`).then((r) => r.data),
};

// ─── Agenda ──────────────────────────────────────────────────────────────────

export const agendaApi = {
  list: (params?: Record<string, string>) =>
    api.get('/agenda', { params }).then((r) => r.data),
  get: (id: string) => api.get(`/agenda/${id}`).then((r) => r.data),
  professionals: () => api.get('/agenda/professionals').then((r) => r.data),
  stats: (date: string) => api.get(`/agenda/stats?date=${date}`).then((r) => r.data),
  create: (data: any) => api.post('/agenda', data).then((r) => r.data),
  update: (id: string, data: any) => api.patch(`/agenda/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/agenda/${id}`).then((r) => r.data),
  createReservation: (id: string, data: any) =>
    api.post(`/agenda/${id}/reservation`, data).then((r) => r.data),
  getSale: (id: string) => api.get(`/agenda/${id}/sale`).then((r) => r.data),
};

// ─── Financial ───────────────────────────────────────────────────────────────

export const financialApi = {
  summary: () => api.get('/financial/summary').then((r) => r.data),
  dre: (year: number, month?: number) =>
    api.get(`/financial/dre?year=${year}${month ? `&month=${month}` : ''}`).then((r) => r.data),
  transactions: (params?: Record<string, string>) =>
    api.get('/financial/transactions', { params }).then((r) => r.data),
  createTransaction: (data: any) =>
    api.post('/financial/transactions', data).then((r) => r.data),
  updateTransaction: (id: string, data: any) =>
    api.patch(`/financial/transactions/${id}`, data).then((r) => r.data),
  receiveTransaction: (id: string, data: any) =>
    api.post(`/financial/transactions/${id}/receive`, data).then((r) => r.data),
  cancelTransaction: (id: string, motivo?: string) =>
    api.post(`/financial/transactions/${id}/cancel`, { motivo }).then((r) => r.data),
  deleteTransaction: (id: string) =>
    api.delete(`/financial/transactions/${id}`).then((r) => r.data),
  categories: () => api.get('/financial/categories').then((r) => r.data),
  ensureDefaultCategory: () => api.post('/financial/categories/ensure-defaults').then((r) => r.data),
  createCategory: (data: any) => api.post('/financial/categories', data).then((r) => r.data),
  updateCategory: (id: string, data: any) =>
    api.patch(`/financial/categories/${id}`, data).then((r) => r.data),
  deleteCategory: (id: string) => api.delete(`/financial/categories/${id}`).then((r) => r.data),
  paymentMethods: () => api.get('/financial/payment-methods').then((r) => r.data),
  createPaymentMethod: (data: any) =>
    api.post('/financial/payment-methods', data).then((r) => r.data),
  updatePaymentMethod: (id: string, data: any) =>
    api.patch(`/financial/payment-methods/${id}`, data).then((r) => r.data),
  deletePaymentMethod: (id: string) =>
    api.delete(`/financial/payment-methods/${id}`).then((r) => r.data),
};

// ─── Sales ───────────────────────────────────────────────────────────────────

export const salesApi = {
  list: (params?: Record<string, string>) =>
    api.get('/sales', { params }).then((r) => r.data),
  get: (id: string) => api.get(`/sales/${id}`).then((r) => r.data),
  stats: () => api.get('/sales/stats').then((r) => r.data),
  create: (data: any) => api.post('/sales', data).then((r) => r.data),
  receive: (id: string, data: any) => api.post(`/sales/${id}/receive`, data).then((r) => r.data),
  generateSessions: (id: string) => api.post(`/sales/${id}/generate-sessions`).then((r) => r.data),
  updateStatus: (id: string, status: string) =>
    api.patch(`/sales/${id}/status`, { status }).then((r) => r.data),
};

// ─── Leads / CRM ─────────────────────────────────────────────────────────────

export const leadsApi = {
  funnels: () => api.get('/leads/funnels').then((r) => r.data),
  createFunnel: (data: any) => api.post('/leads/funnels', data).then((r) => r.data),
  list: (params?: Record<string, string>) =>
    api.get('/leads', { params }).then((r) => r.data),
  get: (id: string) => api.get(`/leads/${id}`).then((r) => r.data),
  stats: () => api.get('/leads/stats').then((r) => r.data),
  create: (data: any) => api.post('/leads', data).then((r) => r.data),
  update: (id: string, data: any) => api.patch(`/leads/${id}`, data).then((r) => r.data),
  move: (id: string, stageId: string, stageOrder: number) =>
    api.patch(`/leads/${id}/move`, { stageId, stageOrder }).then((r) => r.data),
  moveStage: (id: string, stageId: string, stageOrder: number) =>
    api.patch(`/leads/${id}/move`, { stageId, stageOrder }).then((r) => r.data),
  remove: (id: string) => api.delete(`/leads/${id}`).then((r) => r.data),
  updateFunnel: (id: string, data: any) => api.patch(`/leads/funnels/${id}`, data).then(r => r.data),
  deleteFunnel: (id: string) => api.delete(`/leads/funnels/${id}`).then(r => r.data),
  createStage: (funnelId: string, data: any) => api.post(`/leads/funnels/${funnelId}/stages`, data).then(r => r.data),
  updateStage: (stageId: string, data: any) => api.patch(`/leads/funnels/stages/${stageId}`, data).then(r => r.data),
  deleteStage: (stageId: string) => api.delete(`/leads/funnels/stages/${stageId}`).then(r => r.data),
  sources: () => api.get('/leads/sources').then(r => r.data),
  createSource: (data: any) => api.post('/leads/sources', data).then(r => r.data),
  lossReasons: () => api.get('/leads/loss-reasons').then(r => r.data),
  createLossReason: (data: any) => api.post('/leads/loss-reasons', data).then(r => r.data),
  convert: (id: string) => api.post(`/leads/${id}/convert`).then(r => r.data),
  markLost: (id: string, lostReason: string) => api.post(`/leads/${id}/mark-lost`, { lostReason }).then(r => r.data),
  markWon: (id: string) => api.post(`/leads/${id}/mark-won`).then(r => r.data),
  changeFunnel: (id: string, funnelId: string, stageId: string) => api.patch(`/leads/${id}`, { funnelId, stageId, stageOrder: 0 }).then(r => r.data),
  getHistory: (id: string) => api.get(`/leads/${id}/history`).then(r => r.data),
  addActivity: (id: string, data: any) => api.post(`/leads/${id}/activities`, data).then(r => r.data),
  importLeads: (leads: any[]) => api.post('/leads/import', { leads }).then(r => r.data),
};

// ─── Tasks ───────────────────────────────────────────────────────────────────

export const tasksApi = {
  list: (params?: Record<string, string>) =>
    api.get('/tasks', { params }).then((r) => r.data),
  create: (data: any) => api.post('/tasks', data).then((r) => r.data),
  update: (id: string, data: any) => api.patch(`/tasks/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/tasks/${id}`).then((r) => r.data),
  stats: () => api.get('/tasks/stats').then(r => r.data),
  postIts: () => api.get('/tasks/post-its').then(r => r.data),
  createPostIt: (data: any) => api.post('/tasks/post-its', data).then(r => r.data),
  updatePostIt: (id: string, data: any) => api.patch(`/tasks/post-its/${id}`, data).then(r => r.data),
  deletePostIt: (id: string) => api.delete(`/tasks/post-its/${id}`).then(r => r.data),
};

// ─── Inventory ───────────────────────────────────────────────────────────────

export const inventoryApi = {
  stats: () => api.get('/inventory/stats').then((r) => r.data),
  products: (params?: Record<string, string>) =>
    api.get('/inventory/products', { params }).then((r) => r.data),
  product: (id: string) => api.get(`/inventory/products/${id}`).then((r) => r.data),
  createProduct: (data: any) => api.post('/inventory/products', data).then((r) => r.data),
  updateProduct: (id: string, data: any) =>
    api.patch(`/inventory/products/${id}`, data).then((r) => r.data),
  deleteProduct: (id: string) => api.delete(`/inventory/products/${id}`).then((r) => r.data),
  movements: (params?: Record<string, string>) =>
    api.get('/inventory/movements', { params }).then((r) => r.data),
  expiryMovements: () => api.get('/inventory/expiry').then((r) => r.data),
  movementStats: (params?: Record<string, string>) =>
    api.get('/inventory/movement-stats', { params }).then((r) => r.data),
  createMovement: (data: any) => api.post('/inventory/movements', data).then((r) => r.data),
  categories: () => api.get('/inventory/categories').then((r) => r.data),
  createCategory: (data: any) => api.post('/inventory/categories', data).then((r) => r.data),
  suppliers: () => api.get('/inventory/suppliers').then((r) => r.data),
  createSupplier: (data: any) => api.post('/inventory/suppliers', data).then((r) => r.data),
};

// ─── Prontuário ──────────────────────────────────────────────────────────────

export const prontuarioApi = {
  get: (patientId: string) =>
    api.get(`/prontuario/patient/${patientId}`).then((r) => r.data),
  createEvolution: (patientId: string, data: any) =>
    api.post(`/prontuario/evolution/${patientId}`, data).then((r) => r.data),
  deleteEvolution: (id: string) =>
    api.delete(`/prontuario/evolution/${id}`).then((r) => r.data),
  createPrescription: (patientId: string, data: any) =>
    api.post(`/prontuario/prescription/${patientId}`, data).then((r) => r.data),
  saveAnamnesis: (patientId: string, answers: any) =>
    api.post(`/prontuario/anamnesis/${patientId}`, { answers }).then((r) => r.data),
  createNote: (patientId: string, data: any) =>
    api.post(`/prontuario/note/${patientId}`, data).then((r) => r.data),
  updateNote: (id: string, data: any) =>
    api.patch(`/prontuario/note/${id}`, data).then((r) => r.data),
  deleteNote: (id: string) =>
    api.delete(`/prontuario/note/${id}`).then((r) => r.data),
  // Modelos de documentos
  listDocTemplates: (onlyProntuario = false) =>
    api.get('/prontuario/doc-templates', { params: onlyProntuario ? { prontuario: 'true' } : {} }).then((r) => r.data),
  createDocTemplate: (data: any) =>
    api.post('/prontuario/doc-templates', data).then((r) => r.data),
  updateDocTemplate: (id: string, data: any) =>
    api.patch(`/prontuario/doc-templates/${id}`, data).then((r) => r.data),
  deleteDocTemplate: (id: string) =>
    api.delete(`/prontuario/doc-templates/${id}`).then((r) => r.data),
  // Documentos do paciente
  listPatientDocuments: (patientId: string) =>
    api.get(`/prontuario/patient-documents/${patientId}`).then((r) => r.data),
  savePatientDocument: (patientId: string, data: any) =>
    api.post(`/prontuario/patient-documents/${patientId}`, data).then((r) => r.data),
  // Rascunho (não vai para histórico clínico)
  saveDraft: (patientId: string, content: string) =>
    api.post(`/prontuario/draft/${patientId}`, { content }).then((r) => r.data),
  deleteDraft: (patientId: string) =>
    api.delete(`/prontuario/draft/${patientId}`).then((r) => r.data),
};

// ─── Sessions ────────────────────────────────────────────────────────────────

export const sessionsApi = {
  list: (params?: Record<string, string>) =>
    api.get('/sessions', { params }).then((r) => r.data),
  create: (data: any) => api.post('/sessions', data).then((r) => r.data),
  update: (id: string, data: any) => api.patch(`/sessions/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/sessions/${id}`).then((r) => r.data),
};

// ─── Messages ────────────────────────────────────────────────────────────────

export const messagesApi = {
  list: (params?: Record<string, string>) =>
    api.get('/messages', { params }).then((r) => r.data),
  create: (data: any) => api.post('/messages', data).then((r) => r.data),
  templates: () => api.get('/messages/templates').then((r) => r.data),
  createTemplate: (data: any) =>
    api.post('/messages/templates', data).then((r) => r.data),
};

// ─── Opportunities ───────────────────────────────────────────────────────────

export const opportunitiesApi = {
  list: (params?: Record<string, string>) =>
    api.get('/opportunities', { params }).then((r) => r.data),
  create: (data: any) => api.post('/opportunities', data).then((r) => r.data),
  update: (id: string, data: any) =>
    api.patch(`/opportunities/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/opportunities/${id}`).then((r) => r.data),
};

// ─── Users ───────────────────────────────────────────────────────────────────

export const usersApi = {
  list: () => api.get('/users').then((r) => r.data),
  create: (data: any) => api.post('/users', data).then((r) => r.data),
  update: (id: string, data: any) => api.patch(`/users/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/users/${id}`).then((r) => r.data),
};

export const accessProfilesApi = {
  list: () => api.get('/access-profiles').then((r) => r.data),
  get: (id: string) => api.get(`/access-profiles/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/access-profiles', data).then((r) => r.data),
  update: (id: string, data: any) => api.patch(`/access-profiles/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/access-profiles/${id}`).then((r) => r.data),
  duplicate: (id: string) => api.post(`/access-profiles/${id}/duplicate`).then((r) => r.data),
  seedDefaults: () => api.post('/access-profiles/seed-defaults').then((r) => r.data),
};


// ─── Contract Templates ───────────────────────────────────────────────────────

export const contractTemplatesApi = {
  list:   ()                        => api.get('/contract-templates').then((r) => r.data),
  get:    (id: string)              => api.get(`/contract-templates/${id}`).then((r) => r.data),
  create: (data: any)               => api.post('/contract-templates', data).then((r) => r.data),
  update: (id: string, data: any)   => api.patch(`/contract-templates/${id}`, data).then((r) => r.data),
  remove: (id: string)              => api.delete(`/contract-templates/${id}`).then((r) => r.data),
};

// ─── Contracts ────────────────────────────────────────────────────────────────

export const contractsApi = {
  list:     (params?: any)             => api.get('/contracts', { params }).then((r) => r.data),
  get:      (id: string)               => api.get(`/contracts/${id}`).then((r) => r.data),
  create:   (data: any)                => api.post('/contracts', data).then((r) => r.data),
  update:   (id: string, data: any)    => api.patch(`/contracts/${id}`, data).then((r) => r.data),
  generate: (id: string, data: any)    => api.patch(`/contracts/${id}/generate`, data).then((r) => r.data),
  remove:   (id: string)               => api.delete(`/contracts/${id}`).then((r) => r.data),
};

// ─── Contact Types ───────────────────────────────────────────────────────────

export const contactTypesApi = {
  list: () => api.get('/contact-types').then((r) => r.data),
  create: (data: any) => api.post('/contact-types', data).then((r) => r.data),
  update: (id: string, data: any) => api.patch(`/contact-types/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/contact-types/${id}`).then((r) => r.data),
};

// ─── WhatsApp Integration ────────────────────────────────────────────────────

export const whatsAppApi = {
  getConfig: (provider?: string) => api.get('/integrations/whatsapp', { params: provider ? { provider } : {} }).then((r) => r.data),
  getAllIntegrations: () => api.get('/integrations/whatsapp/all').then((r) => r.data),
  saveConfig: (data: any) => api.post('/integrations/whatsapp', data).then((r) => r.data),
  generateQrCode: () => api.post('/integrations/whatsapp/qrcode').then((r) => r.data),
  getStatus: () => api.get('/integrations/whatsapp/status').then((r) => r.data),
  disconnect: () => api.post('/integrations/whatsapp/disconnect').then((r) => r.data),
  forceClear: () => api.post('/integrations/whatsapp/force-clear').then((r) => r.data),
};

// ─── Conversations ────────────────────────────────────────────────────────────

export const conversationsApi = {
  list: (status?: string) => api.get('/conversations', { params: status ? { status } : {} }).then((r) => r.data),
  messages: (id: string) => api.get(`/conversations/${id}/messages`).then((r) => r.data),
  open: (contactId: string) => api.post('/conversations/open', { contactId }).then((r) => r.data),
  close: (id: string, reason?: string) => api.post(`/conversations/${id}/close`, { reason }).then((r) => r.data),
  send: (id: string, content: string) => api.post(`/conversations/${id}/send`, { content }).then((r) => r.data),
};

export const quickRepliesApi = {
  list: (activeOnly?: boolean) => api.get('/quick-replies', { params: activeOnly ? { active: 'true' } : {} }).then((r) => r.data),
  create: (data: any) => api.post('/quick-replies', data).then((r) => r.data),
  update: (id: string, data: any) => api.patch(`/quick-replies/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/quick-replies/${id}`).then((r) => r.data),
};

// ─── Global Search ────────────────────────────────────────────────────────────

export const searchApi = {
  search: (q: string) => api.get('/search', { params: { q } }).then((r) => r.data),
};

// ─── Home ─────────────────────────────────────────────────────────────────────

export const homeApi = {
  summary: () => api.get('/home/summary').then((r) => r.data),
};

// ─── Revenue Intelligence ─────────────────────────────────────────────────────

export const revenueApi = {
  summary: () => api.get('/revenue-intelligence/summary').then((r) => r.data),
};

// ─── Settings ─────────────────────────────────────────────────────────────────

export const settingsApi = {
  getOverview:      () => api.get('/settings/overview').then((r) => r.data),
  update:           (data: any) => api.patch('/settings', data).then((r) => r.data),
  getClinicInfo:    () => api.get('/settings/clinic-info').then((r) => r.data),
  updateClinicInfo: (data: any) => api.patch('/settings/clinic-info', data).then((r) => r.data),
};
