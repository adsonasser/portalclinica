import { useState, useEffect, useRef, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { GlobalSearch } from '../GlobalSearch';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubItem {
  key: string;
  icon: string;
  label: string;
  desc: string;
  path: string;
}

interface NavItem {
  key: string;
  icon: string;
  label: string;
  path: string;
  module: string;
  desc?: string;
  subItems?: SubItem[];
}

// ─── Nav Config ───────────────────────────────────────────────────────────────

const NAV: NavItem[] = [
  { key: 'dashboard',     icon: 'ti-layout-dashboard', label: 'Dashboard',  path: '/dashboard',     module: 'dashboard' },
  { key: 'patients',      icon: 'ti-users',             label: 'Contatos',   path: '/patients',      module: 'contacts' },
  { key: 'agenda',        icon: 'ti-calendar',          label: 'Agenda',     path: '/agenda',        module: 'agenda' },
  {
    key: 'financial',
    icon: 'ti-cash',
    label: 'Financeiro',
    path: '/financial',
    module: 'financial',
    desc: 'Controle de vendas e caixa',
    subItems: [
      { key: 'vendas',     icon: 'ti-shopping-cart',  label: 'Vendas',                   desc: 'Orçamentos, vendas e recebimentos',   path: '/financial?tab=vendas' },
      { key: 'contas',     icon: 'ti-file-invoice',   label: 'Lançamentos financeiros',  desc: 'Entradas, saídas e conferência',       path: '/financial?tab=contas' },
      { key: 'relatorios', icon: 'ti-chart-bar',      label: 'Relatórios',               desc: 'Fluxo de caixa, DRE e indicadores',    path: '/financial?tab=relatorios' },
    ],
  },
  { key: 'sessions',      icon: 'ti-activity',          label: 'Sessões',    path: '/sessions',      module: 'sessions' },
  { key: 'contratos',     icon: 'ti-file-description',  label: 'Contratos',  path: '/contratos',     module: 'contracts' },
  {
    key: 'estoque',
    icon: 'ti-box',
    label: 'Estoque',
    path: '/estoque',
    module: 'inventory',
    desc: 'Controle de insumos e produtos',
    subItems: [
      { key: 'produtos',   icon: 'ti-package',           label: 'Itens do estoque',     desc: 'Cadastro e controle dos insumos/produtos',    path: '/estoque?tab=produtos' },
      { key: 'movimentos', icon: 'ti-arrows-exchange',   label: 'Movimentações',        desc: 'Entradas, saídas, consumo e ajustes',         path: '/estoque?tab=movimentos' },
      { key: 'validades',  icon: 'ti-calendar-check',    label: 'Validades',            desc: 'Acompanhamento de lotes e vencimentos',       path: '/estoque?tab=validades' },
      { key: 'sugestao',   icon: 'ti-clipboard-list',    label: 'Sugestão de compras',  desc: 'Itens abaixo do estoque mínimo/ideal',        path: '/estoque?tab=sugestao' },
      { key: 'relatorios', icon: 'ti-chart-bar',         label: 'Relatórios',           desc: 'Giro, consumo e posição de estoque',          path: '/estoque?tab=relatorios' },
    ],
  },
  { key: 'messages',      icon: 'ti-message-2',         label: 'Mensagens',  path: '/messages',      module: 'messages' },
  { key: 'oportunidades', icon: 'ti-layout-kanban',     label: 'CRM',        path: '/oportunidades', module: 'opportunities' },
];

const SETTINGS: NavItem = { key: 'settings', icon: 'ti-settings', label: 'Configurações', path: '/settings', module: 'settings' };

const TOP_H  = 60;
const IMP_H  = 36;

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

  const [tip,           setTip]           = useState<{ label: string; y: number } | null>(null);
  const [flyoutItem,    setFlyoutItem]    = useState<NavItem | null>(null);
  const [flyoutAnchorY, setFlyoutAnchorY] = useState(0);
  const [now,           setNow]           = useState(new Date());
  const [scrolled,      setScrolled]      = useState(false);
  const [avatarMenu,    setAvatarMenu]    = useState<{ x: number; y: number } | null>(null);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [impSession, _setImpSession] = useState<{ clinicId: string; clinicName: string } | null>(() => {
    try { return JSON.parse(localStorage.getItem('impersonate_session') ?? 'null'); }
    catch { return null; }
  });

  const openTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const topOffset = impSession ? TOP_H + IMP_H : TOP_H;

  // Tick every 60s
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

  // Close flyout on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFlyoutItem(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Close flyout on route change
  useEffect(() => { setFlyoutItem(null); }, [location.pathname, location.search]);

  const hour      = now.getHours();
  const greeting  = getGreeting(hour);
  const firstName = user?.name?.split(' ')[0] ?? null;
  const dateStr   = formatDate(now);
  const dateShort = formatDateShort(now);

  const city: string | null = (user?.clinic as any)?.city ?? null;

  const primaryColor = useMemo(() => {
    try { return localStorage.getItem('pcl_primary_color') || '#000000'; } catch { return '#000000'; }
  }, []);

  useEffect(() => {
    if (!avatarMenu) return;
    const h = () => setAvatarMenu(null);
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, [avatarMenu]);

  const openAvatarMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setAvatarMenu({ x: Math.max(rect.right - 180, 8), y: rect.bottom + 6 });
  };

  const exitImpersonate = () => {
    const backup = localStorage.getItem('gerencial_token_backup');
    if (backup) localStorage.setItem('token', backup);
    localStorage.removeItem('gerencial_token_backup');
    localStorage.removeItem('impersonate_session');
    window.location.href = '/gerencial/empresas';
  };

  // ─── Active checks ─────────────────────────────────────────────────────────

  const isSubItemActive = (subPath: string) => {
    const [basePath, query] = subPath.split('?');
    if (!location.pathname.startsWith(basePath)) return false;
    if (!query) return true;
    const sp  = new URLSearchParams(query);
    const lsp = new URLSearchParams(location.search);
    for (const [k, v] of sp.entries()) {
      if (lsp.get(k) !== v) return false;
    }
    return true;
  };

  const isSimpleActive = (path: string) => {
    const base = path.split('?')[0];
    return location.pathname === base || location.pathname.startsWith(base + '/');
  };

  const isParentActive = (item: NavItem) => {
    if (item.subItems?.length) {
      const base = item.path.split('?')[0];
      return item.subItems.some(s => isSubItemActive(s.path)) || location.pathname === base;
    }
    return isSimpleActive(item.path);
  };

  // ─── Flyout timers ─────────────────────────────────────────────────────────

  const clearTimers = () => {
    if (openTimerRef.current)  clearTimeout(openTimerRef.current);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  };

  const scheduleFlyoutOpen = (item: NavItem, anchorY: number) => {
    clearTimers();
    openTimerRef.current = setTimeout(() => {
      setFlyoutItem(item);
      setFlyoutAnchorY(anchorY);
    }, 120);
  };

  const scheduleFlyoutClose = () => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    closeTimerRef.current = setTimeout(() => setFlyoutItem(null), 200);
  };

  // ─── Nav button ────────────────────────────────────────────────────────────

  const navBtn = (item: NavItem) => {
    const active      = isParentActive(item);
    const hasSubItems = Boolean(item.subItems?.length);

    const onEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      if (hasSubItems) {
        scheduleFlyoutOpen(item, rect.top);
      } else {
        setFlyoutItem(null);
        setTip({ label: item.label, y: rect.top + rect.height / 2 });
      }
      if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.06)';
    };

    const onLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (hasSubItems) {
        scheduleFlyoutClose();
      } else {
        setTip(null);
      }
      if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent';
    };

    return (
      <button
        key={item.key}
        onClick={() => navigate(item.subItems?.[0]?.path || item.path)}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={e => { if (!hasSubItems) { const r = e.currentTarget.getBoundingClientRect(); setTip({ label: item.label, y: r.top + r.height / 2 }); } }}
        onBlur={() => setTip(null)}
        aria-label={item.label}
        aria-expanded={hasSubItems ? flyoutItem?.key === item.key : undefined}
        style={{
          width: 38, height: 38, borderRadius: '50%',
          border:      active ? `1.5px solid ${primaryColor}22` : 'none',
          background:  active ? `${primaryColor}0F` : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0, transition: 'background 0.15s',
          position: 'relative',
        }}
      >
        <i className={`ti ${item.icon}`} style={{ fontSize: 18, color: active ? primaryColor : '#18181B' }} />
        {/* Dot indicator for items with submenus */}
        {hasSubItems && (
          <span style={{
            position: 'absolute', bottom: 3, right: 3,
            width: 4, height: 4, borderRadius: '50%',
            background: active ? primaryColor : '#C4C4C8',
            flexShrink: 0,
          }} />
        )}
      </button>
    );
  };

  // ─── Flyout clamped Y position ─────────────────────────────────────────────
  const flyoutEstimatedH = flyoutItem
    ? 56 + (flyoutItem.subItems?.length ?? 0) * 56 + 16
    : 0;
  const flyoutTop = flyoutItem
    ? Math.min(flyoutAnchorY, Math.max(8, (typeof window !== 'undefined' ? window.innerHeight : 800) - flyoutEstimatedH - 8))
    : 0;

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      background: 'linear-gradient(135deg, #F0F0F2 0%, #F5F5F7 45%, #EBEBED 100%)',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>

      {/* ── Decorative blobs ── */}
      <div style={{ position:'fixed', top:-120, left:-120, width:420, height:420, borderRadius:'50%', pointerEvents:'none', zIndex:0, background:'radial-gradient(circle, rgba(0,0,0,0.07) 0%, transparent 70%)' }} />
      <div style={{ position:'fixed', top:-60, right:-80, width:320, height:320, borderRadius:'50%', pointerEvents:'none', zIndex:0, background:'radial-gradient(circle, rgba(0,0,0,0.05) 0%, transparent 70%)' }} />
      <div style={{ position:'fixed', bottom:80, left:-80, width:340, height:340, borderRadius:'50%', pointerEvents:'none', zIndex:0, background:'radial-gradient(circle, rgba(0,0,0,0.04) 0%, transparent 70%)' }} />
      <div style={{ position:'fixed', bottom:-100, right:-60, width:380, height:380, borderRadius:'50%', pointerEvents:'none', zIndex:0, background:'radial-gradient(circle, rgba(0,0,0,0.05) 0%, transparent 70%)' }} />

      {/* ── Tooltip (only for items without submenus) ── */}
      {tip && (
        <div style={{
          position: 'fixed', left: 76, top: tip.y, transform: 'translateY(-50%)',
          background: '#18181B', color: '#fff', fontSize: 12, fontFamily: "'Inter', sans-serif",
          padding: '5px 10px', borderRadius: 6, whiteSpace: 'nowrap',
          pointerEvents: 'none', zIndex: 9999, boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}>
          {tip.label}
        </div>
      )}

      {/* ── Flyout panel ── */}
      {flyoutItem && flyoutItem.subItems && (
        <div
          onMouseEnter={clearTimers}
          onMouseLeave={scheduleFlyoutClose}
          style={{
            position: 'fixed',
            left: 78,
            top: flyoutTop,
            zIndex: 9990,
            background: 'rgba(255,255,255,0.97)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(0,0,0,0.07)',
            borderRadius: 16,
            boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
            width: 268,
            padding: '10px 8px',
            animation: 'flyoutIn 0.14s cubic-bezier(0.16,1,0.3,1)',
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          {/* Header */}
          <div style={{ padding: '6px 10px 10px', borderBottom: '1px solid #F0F0F2', marginBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#09090B', letterSpacing: '-0.2px' }}>
              {flyoutItem.label}
            </div>
            {flyoutItem.desc && (
              <div style={{ fontSize: 11, color: '#A1A1AA', marginTop: 2 }}>
                {flyoutItem.desc}
              </div>
            )}
          </div>

          {/* Sub-items */}
          {flyoutItem.subItems.map(sub => {
            const subActive = isSubItemActive(sub.path);
            return (
              <button
                key={sub.key}
                onClick={() => { navigate(sub.path); setFlyoutItem(null); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '8px 10px', border: 'none', cursor: 'pointer',
                  background: subActive ? `${primaryColor}0C` : 'transparent',
                  borderRadius: 10, textAlign: 'left', fontFamily: 'inherit',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!subActive) (e.currentTarget as HTMLElement).style.background = '#F5F5F7'; }}
                onMouseLeave={e => { if (!subActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: subActive ? primaryColor : '#F2F2F4',
                  transition: 'background 0.1s',
                }}>
                  <i className={`ti ${sub.icon}`} style={{ fontSize: 15, color: subActive ? '#fff' : '#71717A' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: subActive ? 700 : 500, color: subActive ? '#09090B' : '#18181B', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {sub.label}
                  </div>
                  <div style={{ fontSize: 11, color: '#A1A1AA', marginTop: 2, lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {sub.desc}
                  </div>
                </div>
                {subActive && (
                  <i className="ti ti-chevron-right" style={{ fontSize: 11, color: primaryColor, flexShrink: 0 }} />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Animations ── */}
      <style>{`
        @keyframes flyoutIn {
          from { opacity: 0; transform: translateX(-10px) scale(0.97); }
          to   { opacity: 1; transform: translateX(0)     scale(1); }
        }
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

      {/* ── Top Bar ── */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: TOP_H,
        zIndex: 30,
        background: scrolled ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.60)',
        backdropFilter:       'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderBottom: '1px solid rgba(255,255,255,0.5)',
        boxShadow: scrolled ? '0 2px 16px rgba(0,0,0,0.08)' : '0 1px 0 rgba(255,255,255,0.6)',
        transition: 'background 0.2s, box-shadow 0.2s',
        display: 'flex', alignItems: 'center',
        padding: '0 24px 0 0',
      }}>
        <div style={{ width: 80, flexShrink: 0 }} />

        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#18181B', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {greeting}{firstName ? `, ${firstName}` : ''}
          </span>
          <span style={{ color: '#D1D5DB', fontSize: 13, flexShrink: 0 }}>·</span>
          <span className="topbar-date-full" style={{ fontSize: 12, color: '#71717A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {dateStr}
          </span>
          <span className="topbar-date-short" style={{ fontSize: 12, color: '#71717A', whiteSpace: 'nowrap' }}>
            {dateShort}
          </span>
          {city && (
            <>
              <span style={{ color: '#D1D5DB', fontSize: 13, flexShrink: 0 }}>·</span>
              <span style={{ fontSize: 12, color: '#71717A', whiteSpace: 'nowrap', flexShrink: 0 }}>{city}</span>
            </>
          )}
        </div>

        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
          <GlobalSearch />
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
          <button
            style={{ width: 34, height: 34, borderRadius: '50%', background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', color: '#71717A' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; (e.currentTarget as HTMLElement).style.color = '#000'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#71717A'; }}
            title="Notificações"
          >
            <i className="ti ti-bell" style={{ fontSize: 17 }} />
            <span style={{ position: 'absolute', top: 7, right: 7, width: 6, height: 6, borderRadius: '50%', background: '#DC2626', border: '1.5px solid #F8F9FA' }} />
          </button>

          <button
            style={{ width: 34, height: 34, borderRadius: '50%', background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#71717A' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; (e.currentTarget as HTMLElement).style.color = '#000'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#71717A'; }}
            title="Ajuda"
          >
            <i className="ti ti-help" style={{ fontSize: 17 }} />
          </button>

          <div style={{ width: 1, height: 22, background: 'rgba(0,0,0,0.08)', margin: '0 4px' }} />

          <button
            onClick={e => openAvatarMenu(e)}
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

      {/* ── Impersonate banner ── */}
      {impSession && (
        <div style={{
          position: 'fixed', top: TOP_H, left: 0, right: 0, height: IMP_H,
          zIndex: 29,
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
            style={{ height: 26, padding: '0 12px', background: '#92400E', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#FEF3C7', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <i className="ti ti-arrow-back-up" style={{ fontSize: 12 }} />
            Voltar ao gerencial
          </button>
        </div>
      )}

      {/* ── Sidebar ── */}
      <nav style={{
        position: 'fixed',
        left: 12,
        top: topOffset + 12,
        bottom: 12,
        width: 56,
        zIndex: 25,
        borderRadius: 28,
        background: 'rgba(255,255,255,0.55)',
        backdropFilter:       'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.6)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 1px 0 rgba(255,255,255,0.8) inset',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: 16, paddingBottom: 16, gap: 4,
      }}>
        {NAV.filter(item => isAdmin || canView(item.module)).map(navBtn)}
        <div style={{ flex: 1 }} />
        {(isAdmin || canView(SETTINGS.module)) && navBtn(SETTINGS)}
      </nav>

      {/* ── Content area ── */}
      <main ref={mainRef} style={{
        position: 'fixed',
        top: topOffset,
        left: 80,
        right: 0,
        bottom: 0,
        zIndex: 31,
        overflowY: 'auto',
        overflowX: 'hidden',
        background: 'transparent',
      }}>
        <Outlet />
      </main>

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
