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
};

// ─── Plans ───────────────────────────────────────────────────────────────────

export const plansApi = {
  list: () => api.get('/plans').then((r) => r.data),
  get: (id: string) => api.get(`/plans/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/plans', data).then((r) => r.data),
  update: (id: string, data: any) => api.patch(`/plans/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/plans/${id}`).then((r) => r.data),
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
  deleteTransaction: (id: string) =>
    api.delete(`/financial/transactions/${id}`).then((r) => r.data),
  categories: () => api.get('/financial/categories').then((r) => r.data),
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
  remove: (id: string) => api.delete(`/leads/${id}`).then((r) => r.data),
};

// ─── Tasks ───────────────────────────────────────────────────────────────────

export const tasksApi = {
  list: (params?: Record<string, string>) =>
    api.get('/tasks', { params }).then((r) => r.data),
  create: (data: any) => api.post('/tasks', data).then((r) => r.data),
  update: (id: string, data: any) => api.patch(`/tasks/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/tasks/${id}`).then((r) => r.data),
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
