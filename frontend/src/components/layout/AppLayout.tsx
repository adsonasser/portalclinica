import { useState, useEffect, useRef, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';

interface NavItem {
  key: string;
  icon: string;
  label: string;
  path: string;
  module: string;
  sub?: string;
  children?: { key: string; icon: string; label: string; path: string }[];
}

const NAV: NavItem[] = [
  { key: 'dashboard',     icon: 'ti-layout-dashboard', label: 'Dashboard',  path: '/dashboard',     module: 'dashboard' },
  { key: 'patients',      icon: 'ti-users',             label: 'Pacientes',  path: '/patients',      module: 'contacts' },
  { key: 'agenda',        icon: 'ti-calendar',          label: 'Agenda',     path: '/agenda',        module: 'agenda' },
  { key: 'financial',     icon: 'ti-cash',              label: 'Financeiro', path: '/financial',     module: 'financial' },
  { key: 'sessions',      icon: 'ti-activity',          label: 'Sessões',    path: '/sessions',      module: 'sessions' },
  { key: 'contratos',     icon: 'ti-file-description',  label: 'Contratos',  path: '/contratos',     module: 'contracts' },
  { key: 'estoque',       icon: 'ti-box',               label: 'Estoque',    path: '/estoque',       module: 'inventory' },
  { key: 'messages',      icon: 'ti-message-2',         label: 'Mensagens',  path: '/messages',      module: 'messages' },
  { key: 'oportunidades', icon: 'ti-layout-kanban',     label: 'CRM',        path: '/oportunidades', module: 'opportunities' },
];

const SETTINGS: NavItem = { key: 'settings', icon: 'ti-settings', label: 'Configurações', path: '/settings', module: 'settings' };

// ─── Helpers ─────────────────────────────────────────────────────────────────
const DAYS_PT    = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
const MONTHS_PT  = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

function getGreeting(hour: number): string {
  if (hour >= 5  && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function formatDate(d: Date): string {
  const weekday = DAYS_PT[d.getDay()];
  const day     = String(d.getDate()).padStart(2, '0');
  const month   = MONTHS_PT[d.getMonth()];
  const year    = d.getFullYear();
  return `${weekday}, ${day} de ${month} de ${year}`;
}

function formatDateShort(d: Date): string {
  const day   = String(d.getDate()).padStart(2, '0');
  const month = MONTHS_PT[d.getMonth()];
  const year  = d.getFullYear();
  return `${day} de ${month} de ${year}`;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function AppLayout() {
  const { user, logout } = useAuth();
  const { canView, isAdmin } = usePermissions();
  const location         = useLocation();
  const navigate         = useNavigate();
  const mainRef          = useRef<HTMLElement>(null);

  const [tip,          setTip]          = useState<{ label: string; y: number } | null>(null);
  const [now,          setNow]          = useState(new Date());
  const [scrolled,     setScrolled]     = useState(false);
  const [avatarMenu,   setAvatarMenu]   = useState<{ x: number; y: number } | null>(null);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [impSession, setImpSession] = useState<{ clinicId: string; clinicName: string } | null>(() => {
    try { return JSON.parse(localStorage.getItem('impersonate_session') ?? 'null'); }
    catch { return null; }
  });

  // Tick every 60s so greeting/date stays current
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Shadow on scroll
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 4);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const hour      = now.getHours();
  const greeting  = getGreeting(hour);
  const firstName = user?.name?.split(' ')[0] ?? null;
  const dateStr   = formatDate(now);
  const dateShort = formatDateShort(now);

  // City: comes from clinic config when available; hidden when absent
  const city: string | null = (user?.clinic as any)?.city ?? null;

  const primaryColor = useMemo(() => {
    try { return localStorage.getItem('pcl_primary_color') || '#000000'; } catch { return '#000000'; }
  }, []);

  const clinicInitials = useMemo(() => {
    const name = user?.clinic?.name || '';
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  }, [user?.clinic?.name]);

  useEffect(() => {
    if (!avatarMenu) return;
    const h = () => setAvatarMenu(null);
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, [avatarMenu]);

  const openAvatarMenu = (e: React.MouseEvent, source: 'sidebar' | 'topbar') => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setAvatarMenu(
      source === 'sidebar'
        ? { x: rect.right + 10, y: rect.top }
        : { x: Math.max(rect.right - 180, 8), y: rect.bottom + 6 }
    );
  };

  const exitImpersonate = () => {
    const backup = localStorage.getItem('gerencial_token_backup');
    if (backup) localStorage.setItem('token', backup);
    localStorage.removeItem('gerencial_token_backup');
    localStorage.removeItem('impersonate_session');
    window.location.href = '/gerencial/empresas';
  };

  const isActive       = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');
  const isParentActive = (item: NavItem) => item.children?.some(c => isActive(c.path)) || isActive(item.path);

  const handleEnter = (e: React.MouseEvent<HTMLButtonElement> | React.FocusEvent<HTMLButtonElement>, label: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTip({ label, y: rect.top + rect.height / 2 });
  };

  const navBtn = (item: NavItem) => {
    const active = isParentActive(item);
    return (
      <button
        key={item.key}
        onClick={() => navigate(item.children?.[0]?.path || item.path)}
        onMouseEnter={e => { handleEnter(e, item.label); if (!active) (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; }}
        onMouseLeave={e => { setTip(null); if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        onFocus={e => handleEnter(e, item.label)}
        onBlur={() => setTip(null)}
        style={{
          width: 44, height: 44, borderRadius: '50%',
          border:      active ? `1.5px solid ${primaryColor}22` : 'none',
          background:  active ? `${primaryColor}0F` : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0, transition: 'background 0.15s',
        }}
      >
        <i className={`ti ${item.icon}`} style={{ fontSize: 18, color: active ? primaryColor : '#18181B' }} />
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', width: '100%', height: '100vh', overflow: 'hidden', background: '#F8F9FA', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* In-flow spacer for sidebar */}
      <div style={{ width: 92, flexShrink: 0 }} />

      {/* Tooltip */}
      {tip && (
        <div style={{
          position: 'fixed', left: 90, top: tip.y, transform: 'translateY(-50%)',
          background: '#18181B', color: '#fff', fontSize: 12, fontFamily: "'Inter', sans-serif",
          padding: '5px 10px', borderRadius: 6, whiteSpace: 'nowrap',
          pointerEvents: 'none', zIndex: 9999, boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}>
          {tip.label}
        </div>
      )}

      {/* ── Sidebar ── */}
      <nav style={{
        position: 'fixed', left: 12, top: 12, bottom: 12, width: 68,
        background: '#FFFFFF', borderRadius: 28,
        border: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.05)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: 20, paddingBottom: 16, zIndex: 40, gap: 4,
      }}>
        {/* Clinic logo / initials */}
        <div
          title={user?.clinic?.name || 'Portal Clínica'}
          style={{ width: 42, height: 42, borderRadius: 14, background: primaryColor, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4, flexShrink: 0, cursor: 'default', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
        >
          {(user?.clinic as any)?.logoUrl
            ? <img src={(user?.clinic as any).logoUrl} alt={user?.clinic?.name} style={{ width: 42, height: 42, objectFit: 'cover' }} />
            : <span style={{ fontSize: clinicInitials.length > 2 ? 11 : 14, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.5px' }}>{clinicInitials || <i className="ti ti-heart-rate-monitor" style={{ fontSize: 19 }} />}</span>
          }
        </div>
        <div style={{ fontSize: 9, fontWeight: 600, color: '#A1A1AA', marginBottom: 12, maxWidth: 56, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '.02em' }}>
          {user?.clinic?.name?.split(' ')[0] || 'Clínica'}
        </div>

        {NAV.filter(item => isAdmin || canView(item.module)).map(navBtn)}
        <div style={{ flex: 1 }} />
        {(isAdmin || canView(SETTINGS.module)) && navBtn(SETTINGS)}
        <div style={{ width: 32, height: 1, background: '#F0F0F0', margin: '6px 0' }} />

        {/* Avatar / menu */}
        <button
          onClick={e => openAvatarMenu(e, 'sidebar')}
          onMouseEnter={e => handleEnter(e, user?.name || 'Minha conta')}
          onMouseLeave={() => setTip(null)}
          style={{
            width: 36, height: 36, borderRadius: '50%',
            border: '1.5px solid #E4E4E7', background: 'transparent',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
          }}
        >
          {user?.avatarUrl
            ? <img src={user.avatarUrl} alt={user.name} style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} />
            : <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#18181B' }}>
                {user?.name?.[0]?.toUpperCase()}
              </div>
          }
        </button>
      </nav>

      {/* ── Right column ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Impersonate banner ── */}
        {impSession && (
          <div style={{
            flexShrink: 0, height: 36,
            background: '#FEF3C7', borderBottom: '1px solid #FDE68A',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 20px', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-shield-bolt" style={{ fontSize: 14, color: '#92400E' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#92400E' }}>
                Modo suporte — você está acessando como <strong>{impSession.clinicName}</strong>
              </span>
            </div>
            <button
              onClick={exitImpersonate}
              style={{
                height: 26, padding: '0 12px', background: '#92400E', border: 'none',
                borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#FEF3C7',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <i className="ti ti-arrow-back-up" style={{ fontSize: 12 }} />
              Voltar ao gerencial
            </button>
          </div>
        )}

        {/* ── Top Bar ── */}
        <header style={{
          flexShrink: 0,
          background: scrolled ? 'rgba(255,255,255,0.82)' : 'rgba(248,249,250,0.92)',
          backdropFilter:       'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderBottom: '1px solid rgba(0,0,0,0.05)',
          boxShadow: scrolled ? '0 2px 12px rgba(0,0,0,0.07)' : 'none',
          transition: 'background 0.2s, box-shadow 0.2s',
          padding: '0 24px',
          height: 52,
          display: 'flex', alignItems: 'center', gap: 0,
        }}>

          {/* ── Left: greeting + date ── */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>

            {/* Greeting */}
            <span style={{ fontSize: 13, fontWeight: 600, color: '#18181B', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {greeting}{firstName ? `, ${firstName}` : ''}
            </span>

            {/* Separator */}
            <span style={{ color: '#D1D5DB', fontSize: 13, flexShrink: 0 }}>·</span>

            {/* Full date (hidden on narrow) */}
            <span className="topbar-date-full" style={{ fontSize: 12, color: '#71717A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {dateStr}
            </span>

            {/* Short date (shown on narrow) */}
            <span className="topbar-date-short" style={{ fontSize: 12, color: '#71717A', whiteSpace: 'nowrap' }}>
              {dateShort}
            </span>

            {/* City (when available) */}
            {city && (
              <>
                <span style={{ color: '#D1D5DB', fontSize: 13, flexShrink: 0 }}>·</span>
                <span style={{ fontSize: 12, color: '#71717A', whiteSpace: 'nowrap', flexShrink: 0 }}>{city}</span>
              </>
            )}
          </div>

          {/* ── Right: actions ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 16 }}>

            {/* Notifications */}
            <button
              style={{ width: 34, height: 34, borderRadius: '50%', background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', color: '#71717A' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; (e.currentTarget as HTMLElement).style.color = '#000'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#71717A'; }}
              title="Notificações"
            >
              <i className="ti ti-bell" style={{ fontSize: 17 }} />
              <span style={{ position: 'absolute', top: 7, right: 7, width: 6, height: 6, borderRadius: '50%', background: '#DC2626', border: '1.5px solid #F8F9FA' }} />
            </button>

            {/* Help */}
            <button
              style={{ width: 34, height: 34, borderRadius: '50%', background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#71717A' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; (e.currentTarget as HTMLElement).style.color = '#000'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#71717A'; }}
              title="Ajuda"
            >
              <i className="ti ti-help" style={{ fontSize: 17 }} />
            </button>

            <div style={{ width: 1, height: 22, background: 'rgba(0,0,0,0.08)', margin: '0 4px' }} />

            {/* User avatar */}
            <button
              onClick={e => openAvatarMenu(e, 'topbar')}
              title={user?.name || 'Minha conta'}
              style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '50%', padding: 0 }}
            >
              {user?.avatarUrl
                ? <img src={user.avatarUrl} alt={user.name} style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(0,0,0,0.08)' }} />
                : <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#18181B', border: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#FFFFFF' }}>
                    {user?.name?.[0]?.toUpperCase()}
                  </div>
              }
            </button>
          </div>
        </header>

        {/* ── Responsive CSS ── */}
        <style>{`
          .topbar-date-short { display: none; }
          .topbar-date-full  { display: inline; }
          @media (max-width: 900px) {
            .topbar-date-full  { display: none; }
            .topbar-date-short { display: inline; }
          }
          @media (max-width: 600px) {
            .topbar-date-short { display: none; }
          }
        `}</style>

        {/* ── Content ── */}
        <main ref={mainRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', background: '#F8F9FA' }}>
          <Outlet />
        </main>
      </div>

      {/* ── Avatar dropdown ── */}
      {avatarMenu && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', top: avatarMenu.y, left: avatarMenu.x,
            width: 180, background: '#FFFFFF', border: '1px solid #E4E4E7',
            borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            zIndex: 9999, padding: 4, fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          <div style={{ padding: '8px 12px 8px', borderBottom: '1px solid #F4F4F5', marginBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#09090B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
            <div style={{ fontSize: 11, color: '#71717A', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(user as any)?.email}</div>
          </div>
          {([
            { icon: 'ti-user', label: 'Meu perfil', path: '/settings' },
            { icon: 'ti-settings', label: 'Configurações', path: '/settings' },
          ] as const).map(item => (
            <button key={item.label}
              onClick={() => { setAvatarMenu(null); navigate(item.path); }}
              style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 12px', border: 'none', background: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#374151', fontFamily: 'inherit', textAlign: 'left' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F4F4F5'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
            >
              <i className={`ti ${item.icon}`} style={{ fontSize: 15, color: '#71717A', flexShrink: 0 }} />
              {item.label}
            </button>
          ))}
          <div style={{ height: 1, background: '#F4F4F5', margin: '4px 0' }} />
          <button
            onClick={() => { setAvatarMenu(null); setLogoutConfirm(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 12px', border: 'none', background: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#DC2626', fontFamily: 'inherit', textAlign: 'left' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#FEF2F2'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
          >
            <i className="ti ti-logout" style={{ fontSize: 15, color: '#DC2626', flexShrink: 0 }} />
            Sair
          </button>
        </div>
      )}

      {/* ── Logout confirmation ── */}
      {logoutConfirm && (
        <>
          <div
            onClick={() => setLogoutConfirm(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 10000, backdropFilter: 'blur(3px)' }}
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            width: 360, background: '#FFFFFF', borderRadius: 16, zIndex: 10001,
            padding: '28px 28px 24px', boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
            fontFamily: "'Inter', system-ui, sans-serif",
          }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <i className="ti ti-logout" style={{ fontSize: 20, color: '#DC2626' }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#09090B', marginBottom: 6 }}>Sair da conta</div>
            <div style={{ fontSize: 13, color: '#71717A', lineHeight: 1.55, marginBottom: 24 }}>
              Tem certeza que deseja sair? Você precisará fazer login novamente para acessar o sistema.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setLogoutConfirm(false)}
                style={{ flex: 1, height: 38, border: '1px solid #E4E4E7', background: '#FFFFFF', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Cancelar
              </button>
              <button
                onClick={logout}
                style={{ flex: 1, height: 38, border: 'none', background: '#DC2626', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Sair
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
