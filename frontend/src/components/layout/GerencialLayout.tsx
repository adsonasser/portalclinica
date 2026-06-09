import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useGerencialAuth } from '../../contexts/GerencialAuthContext';
import { useState } from 'react';

interface NavItem { key: string; icon: string; label: string; path: string }

const NAV: NavItem[] = [
  { key: 'dashboard',  icon: 'ti-layout-dashboard', label: 'Dashboard',       path: '/gerencial/dashboard' },
  { key: 'empresas',   icon: 'ti-building',          label: 'Empresas',        path: '/gerencial/empresas' },
  { key: 'planos',     icon: 'ti-package',           label: 'Planos',          path: '/gerencial/planos' },
  { key: 'financeiro', icon: 'ti-cash',              label: 'Financeiro',      path: '/gerencial/financeiro' },
  { key: 'marketing',  icon: 'ti-speakerphone',      label: 'Marketing',       path: '/gerencial/marketing' },
  { key: 'auditoria',  icon: 'ti-shield-check',      label: 'Auditoria',       path: '/gerencial/auditoria' },
  { key: 'config',     icon: 'ti-settings',          label: 'Configurações',   path: '/gerencial/configuracoes' },
];

export function GerencialLayout() {
  const { user, logout } = useGerencialAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [tip, setTip] = useState<{ label: string; y: number } | null>(null);

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  const handleEnter = (e: React.MouseEvent<HTMLButtonElement> | React.FocusEvent<HTMLButtonElement>, label: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTip({ label, y: rect.top + rect.height / 2 });
  };

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', background: '#09090B', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* In-flow spacer */}
      <div style={{ width: 80, flexShrink: 0 }} />

      {/* Tooltip */}
      {tip && (
        <div style={{ position: 'fixed', left: 88, top: tip.y, transform: 'translateY(-50%)', background: '#1E1E2E', color: '#C7D2FE', fontSize: 12, padding: '5px 10px', borderRadius: 6, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 9999, border: '1px solid rgba(129,140,248,.2)', boxShadow: '0 4px 12px rgba(0,0,0,.4)' }}>
          {tip.label}
        </div>
      )}

      {/* Sidebar */}
      <nav style={{ position: 'fixed', left: 10, top: 10, bottom: 10, width: 60, background: '#111118', borderRadius: 20, border: '1px solid rgba(129,140,248,.15)', boxShadow: '0 4px 24px rgba(0,0,0,.4)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 16, paddingBottom: 12, zIndex: 40, gap: 2 }}>

        {/* Logo */}
        <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg, #6366F1, #818CF8)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, flexShrink: 0, cursor: 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,.4)' }} onClick={() => navigate('/gerencial/dashboard')}>
          <i className="ti ti-crown" style={{ fontSize: 16, color: '#FFFFFF' }} />
        </div>

        {/* Badge */}
        <div style={{ fontSize: 7, fontWeight: 700, color: '#818CF8', background: 'rgba(99,102,241,.15)', border: '1px solid rgba(99,102,241,.25)', borderRadius: 4, padding: '2px 4px', letterSpacing: '.08em', marginBottom: 10, textTransform: 'uppercase' }}>MASTER</div>

        {NAV.map(item => {
          const active = isActive(item.path);
          return (
            <button key={item.key}
              onClick={() => navigate(item.path)}
              onMouseEnter={e => handleEnter(e, item.label)}
              onMouseLeave={() => setTip(null)}
              onFocus={e => handleEnter(e, item.label)}
              onBlur={() => setTip(null)}
              style={{ width: 40, height: 40, borderRadius: '50%', border: active ? '1px solid rgba(129,140,248,.4)' : 'none', background: active ? 'rgba(99,102,241,.2)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <i className={`ti ${item.icon}`} style={{ fontSize: 17, color: active ? '#818CF8' : '#52525B' }} />
            </button>
          );
        })}

        <div style={{ flex: 1 }} />
        <div style={{ width: 28, height: 1, background: 'rgba(255,255,255,.06)', margin: '6px 0' }} />

        {/* Avatar */}
        <button onClick={logout}
          onMouseEnter={e => handleEnter(e, `${user?.name} — Sair`)}
          onMouseLeave={() => setTip(null)}
          style={{ width: 34, height: 34, borderRadius: '50%', border: '1.5px solid rgba(129,140,248,.3)', background: 'rgba(99,102,241,.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#818CF8', flexShrink: 0 }}>
          {user?.name?.[0]?.toUpperCase()}
        </button>
      </nav>

      {/* Main area */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Topbar */}
        <header style={{ flexShrink: 0, height: 50, background: 'rgba(9,9,11,.9)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,.06)', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(99,102,241,.2)', border: '1px solid rgba(99,102,241,.3)', color: '#818CF8', letterSpacing: '.06em', textTransform: 'uppercase' }}>Gerencial Master</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button style={{ width: 32, height: 32, borderRadius: '50%', background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#52525B' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.06)'; (e.currentTarget as HTMLElement).style.color = '#A1A1AA'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#52525B'; }}>
              <i className="ti ti-bell" style={{ fontSize: 16 }} />
            </button>
            <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,.08)', margin: '0 4px' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(99,102,241,.2)', border: '1px solid rgba(99,102,241,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#818CF8' }}>
                {user?.name?.[0]?.toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#E4E4E7' }}>{user?.name}</div>
                <div style={{ fontSize: 10, color: '#52525B' }}>Super Admin</div>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', background: '#0D0D14' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
