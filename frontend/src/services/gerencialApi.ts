import axios from 'axios';

const BASE_URL = 'http://localhost:3002/api';

export const gerencialAxios = axios.create({ baseURL: BASE_URL });

gerencialAxios.interceptors.request.use((config) => {
  const token = localStorage.getItem('gerencial_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

gerencialAxios.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 || err.response?.status === 403) {
      localStorage.removeItem('gerencial_token');
      localStorage.removeItem('gerencial_user');
      window.location.href = '/gerencial/login';
    }
    return Promise.reject(err);
  },
);

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const gerencialAuthApi = {
  login: (email: string, password: string) =>
    gerencialAxios.post('/auth/login', { email, password }).then((r) => {
      const data = r.data;
      if (data.user?.role !== 'SUPER_ADMIN') {
        throw new Error('Acesso restrito a administradores master');
      }
      return data;
    }),
  me: () => gerencialAxios.get('/auth/me').then((r) => r.data),
};

// ─── Admin ────────────────────────────────────────────────────────────────────

export const adminApi = {
  dashboard: () => gerencialAxios.get('/admin/dashboard').then((r) => r.data),

  // Clinics
  listClinics: (params?: Record<string, string>) =>
    gerencialAxios.get('/admin/clinics', { params }).then((r) => r.data),
  getClinic: (id: string) => gerencialAxios.get(`/admin/clinics/${id}`).then((r) => r.data),
  createClinic: (data: any) => gerencialAxios.post('/admin/clinics', data).then((r) => r.data),
  updateClinic: (id: string, data: any) =>
    gerencialAxios.patch(`/admin/clinics/${id}`, data).then((r) => r.data),
  updateStatus: (id: string, status: string) =>
    gerencialAxios.patch(`/admin/clinics/${id}/status`, { status }).then((r) => r.data),
  getClinicUsers: (id: string) =>
    gerencialAxios.get(`/admin/clinics/${id}/users`).then((r) => r.data),
  getClinicMetrics: (id: string) =>
    gerencialAxios.get(`/admin/clinics/${id}/metrics`).then((r) => r.data),
  impersonate: (id: string) =>
    gerencialAxios.post(`/admin/clinics/${id}/impersonate`).then((r) => r.data),
  upsertSubscription: (id: string, data: any) =>
    gerencialAxios.post(`/admin/clinics/${id}/subscription`, data).then((r) => r.data),

  // Plans
  listPlans: () => gerencialAxios.get('/admin/plans').then((r) => r.data),
  createPlan: (data: any) => gerencialAxios.post('/admin/plans', data).then((r) => r.data),
  updatePlan: (id: string, data: any) =>
    gerencialAxios.patch(`/admin/plans/${id}`, data).then((r) => r.data),

  // Audit
  getAuditLogs: (clinicId?: string) =>
    gerencialAxios
      .get('/admin/audit-logs', { params: clinicId ? { clinicId } : {} })
      .then((r) => r.data),
};
