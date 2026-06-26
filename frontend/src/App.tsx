import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { NavigationGuardProvider } from './contexts/NavigationGuardContext'
import { AppLayout } from './components/layout/AppLayout'
import { AuthGuard } from './components/layout/AuthGuard'
import { AuthProvider } from './contexts/AuthContext'
import { GerencialAuthProvider } from './contexts/GerencialAuthContext'
import { GerencialAuthGuard } from './components/layout/GerencialAuthGuard'
import { GerencialLayout } from './components/layout/GerencialLayout'
import { ToastProvider } from './components/ui/Toast'
import { PermissionsProvider, usePermissions } from './contexts/PermissionsContext'
import type { ReactNode } from 'react'

// Gerencial pages
import { GerencialLoginPage } from './pages/gerencial/login/GerencialLoginPage'
import { GerencialDashboardPage } from './pages/gerencial/dashboard/GerencialDashboardPage'
import { EmpresasPage } from './pages/gerencial/empresas/EmpresasPage'
import { EmpresaDetailPage } from './pages/gerencial/empresas/EmpresaDetailPage'

// Pages
import { LoginPage } from './pages/auth/LoginPage'
import { DashboardPage } from './pages/dashboard/DashboardPage'
import { PatientsPage } from './pages/patients/PatientsPage'
import { PatientDetailPage } from './pages/patients/PatientDetailPage'
import { AgendaPage } from './pages/agenda/AgendaPage'
import { FinancialPage } from './pages/financial/FinancialPage'
import { CRMPage } from './pages/crm/CRMPage'
import { CRMLeadsPage } from './pages/crm/CRMLeadsPage'
import { TasksPage } from './pages/tasks/TasksPage'
import { PlansPage } from './pages/plans/PlansPage'
import { SessionsPage } from './pages/sessions/SessionsPage'
import { EstoquePage } from './pages/estoque/EstoquePage'
import { MessagesPage } from './pages/messages/MessagesPage'
import { SettingsPage } from './pages/settings/SettingsPage'
import { ProceduresPage } from './pages/settings/ProceduresPage'
import { ContratosPage } from './pages/contratos/ContratosPage'
import { ProntuarioPage } from './pages/prontuario/ProntuarioPage'
import { InicioPage } from './pages/inicio/InicioPage'
import { ReceitaInteligentePage } from './pages/receita-inteligente/ReceitaInteligentePage'

function NoPermission() {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, fontFamily: "'Inter', system-ui, sans-serif", background: '#F8F9FA' }}>
      <div style={{ width: 64, height: 64, borderRadius: 18, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <i className="ti ti-lock" style={{ fontSize: 28, color: '#DC2626' }} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#09090B', marginBottom: 6 }}>Acesso negado</div>
        <div style={{ fontSize: 14, color: '#71717A', maxWidth: 340, lineHeight: 1.6 }}>
          Você não tem permissão para acessar esta área. Contate o administrador do sistema.
        </div>
      </div>
      <button onClick={() => window.history.back()} style={{ height: 36, padding: '0 16px', border: '1px solid #E4E4E7', background: '#FFFFFF', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
        Voltar
      </button>
    </div>
  );
}

function RequirePermission({ module, children }: { module: string; children: ReactNode }) {
  const { canView } = usePermissions();
  if (!canView(module)) return <NoPermission />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
    <GerencialAuthProvider>
    <ToastProvider>
    <BrowserRouter>
    <NavigationGuardProvider>
      <Routes>
        {/* ── Gerencial ── */}
        <Route path="/gerencial/login" element={<GerencialLoginPage />} />
        <Route path="/gerencial" element={<GerencialAuthGuard><GerencialLayout /></GerencialAuthGuard>}>
          <Route index element={<Navigate to="/gerencial/dashboard" replace />} />
          <Route path="dashboard"       element={<GerencialDashboardPage />} />
          <Route path="empresas"        element={<EmpresasPage />} />
          <Route path="empresas/:id"    element={<EmpresaDetailPage />} />
          <Route path="planos"          element={<div style={{ padding:40, color:'#71717A', fontFamily:'Inter' }}>Em breve — Planos</div>} />
          <Route path="financeiro"      element={<div style={{ padding:40, color:'#71717A', fontFamily:'Inter' }}>Em breve — Financeiro</div>} />
          <Route path="marketing"       element={<div style={{ padding:40, color:'#71717A', fontFamily:'Inter' }}>Em breve — Marketing</div>} />
          <Route path="auditoria"       element={<div style={{ padding:40, color:'#71717A', fontFamily:'Inter' }}>Em breve — Auditoria</div>} />
          <Route path="configuracoes"   element={<div style={{ padding:40, color:'#71717A', fontFamily:'Inter' }}>Em breve — Configurações</div>} />
        </Route>

        {/* ── App ── */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<AuthGuard><PermissionsProvider><AppLayout /></PermissionsProvider></AuthGuard>}>
          <Route index element={<Navigate to="/inicio" replace />} />
          <Route path="inicio"      element={<InicioPage />} />
          <Route path="dashboard"   element={<RequirePermission module="dashboard"><DashboardPage /></RequirePermission>} />
          <Route path="patients"    element={<RequirePermission module="contacts"><PatientsPage /></RequirePermission>} />
          <Route path="patients/:id" element={<RequirePermission module="contacts"><PatientDetailPage /></RequirePermission>} />
          <Route path="agenda"      element={<RequirePermission module="agenda"><AgendaPage /></RequirePermission>} />
          <Route path="financial"   element={<RequirePermission module="financial"><FinancialPage /></RequirePermission>} />
          <Route path="crm"             element={<RequirePermission module="opportunities"><CRMPage /></RequirePermission>} />
          <Route path="crm/leads"       element={<RequirePermission module="opportunities"><CRMLeadsPage /></RequirePermission>} />
          <Route path="crm/importacoes" element={<RequirePermission module="opportunities"><CRMPage /></RequirePermission>} />
          <Route path="crm/perdidos"    element={<RequirePermission module="opportunities"><CRMLeadsPage /></RequirePermission>} />
          <Route path="receita-inteligente" element={<ReceitaInteligentePage />} />
          <Route path="tarefas"         element={<RequirePermission module="tasks"><TasksPage /></RequirePermission>} />
          <Route path="oportunidades"   element={<Navigate to="/crm" replace />} />
          <Route path="plans"       element={<PlansPage />} />
          <Route path="sessions"    element={<RequirePermission module="sessions"><SessionsPage /></RequirePermission>} />
          <Route path="estoque"     element={<RequirePermission module="inventory"><EstoquePage /></RequirePermission>} />
          <Route path="messages"    element={<RequirePermission module="messages"><MessagesPage /></RequirePermission>} />
          <Route path="settings"    element={<RequirePermission module="settings"><SettingsPage /></RequirePermission>} />
          <Route path="settings/procedures" element={<RequirePermission module="settings"><ProceduresPage /></RequirePermission>} />
          <Route path="contratos"   element={<RequirePermission module="contracts"><ContratosPage /></RequirePermission>} />
          <Route path="prontuario/:patientId" element={<RequirePermission module="medicalRecords"><ProntuarioPage /></RequirePermission>} />
        </Route>
        <Route path="*" element={<Navigate to="/inicio" replace />} />
      </Routes>
    </NavigationGuardProvider>
    </BrowserRouter>
    </ToastProvider>
    </GerencialAuthProvider>
    </AuthProvider>
  )
}
