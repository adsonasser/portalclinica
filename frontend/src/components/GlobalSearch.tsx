import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { searchApi } from '../services/api';

interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  route: string;
}

interface SearchResults {
  contacts?:     SearchResult[];
  appointments?: SearchResult[];
  sales?:        SearchResult[];
  sessions?:     SearchResult[];
}

const CATEGORY_CFG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  contacts:     { label: 'Contatos',      icon: 'ti-user',     color: '#2563EB', bg: '#EFF6FF' },
  appointments: { label: 'Agendamentos',  icon: 'ti-calendar', color: '#7C3AED', bg: '#F5F3FF' },
  sales:        { label: 'Vendas',        icon: 'ti-receipt',  color: '#16A34A', bg: '#F0FDF4' },
  sessions:     { label: 'Sessões',       icon: 'ti-activity', color: '#D97706', bg: '#FFFBEB' },
};

const CATEGORY_ORDER = ['contacts', 'appointments', 'sales', 'sessions'] as const;

export function GlobalSearch() {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(false);
  const [open,    setOpen]    = useState(false);
  const [focused, setFocused] = useState(0);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });

  const inputRef    = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const wrapperRef  = useRef<HTMLDivElement>(null);
  const shellRef    = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate    = useNavigate();

  // ── Debounced search ────────────────────────────────────────────────────────
  const runSearch = useCallback((q: string) => {
    setLoading(true);
    setError(false);
    searchApi.search(q)
      .then(data => { setResults(data); setFocused(0); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults(null); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(() => runSearch(query), 320);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, runSearch]);

  // ── Recalculate portal position whenever open/query changes ─────────────
  useEffect(() => {
    if (open && shellRef.current) {
      const r = shellRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 8, left: r.left, width: r.width });
    }
  }, [open, query]);

  // ── Close on outside click ───────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideWrapper  = wrapperRef.current?.contains(target);
      const insideDropdown = dropdownRef.current?.contains(target);
      if (!insideWrapper && !insideDropdown) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // ── Flatten for keyboard nav ─────────────────────────────────────────────
  const flatResults: SearchResult[] = CATEGORY_ORDER.flatMap(cat => results?.[cat] ?? []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || flatResults.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(i => Math.min(i + 1, flatResults.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocused(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && flatResults[focused]) navigateTo(flatResults[focused]);
  };

  const navigateTo = (result: SearchResult) => {
    setOpen(false); setQuery(''); setResults(null);
    navigate(result.route);
  };

  const hasResults = results && CATEGORY_ORDER.some(cat => (results[cat]?.length ?? 0) > 0);
  let flatIdx = 0;

  // ── Portal dropdown ─────────────────────────────────────────────────────
  const dropdown = (open && query.trim().length >= 2) ? createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: dropPos.top,
        left: dropPos.left,
        width: dropPos.width,
        background: 'rgba(255,255,255,0.96)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(15,23,42,0.10)',
        borderRadius: 18,
        boxShadow: '0 20px 60px rgba(0,0,0,0.14), 0 4px 16px rgba(0,0,0,0.06)',
        zIndex: 2147483647,
        maxHeight: '60vh', overflowY: 'auto',
        overscrollBehavior: 'contain',
        fontFamily: "'Inter', system-ui, sans-serif",
        animation: 'gsDropIn 0.14s cubic-bezier(0.32,0.72,0,1)',
      }}
    >
      {loading && !results && (
        <div style={{ padding: '18px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="ti ti-loader-2" style={{ fontSize: 14, color: '#A1A1AA', animation: 'gspin 0.8s linear infinite' }} />
          <span style={{ fontSize: 12, color: '#71717A' }}>Buscando...</span>
        </div>
      )}

      {error && (
        <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="ti ti-alert-circle" style={{ fontSize: 14, color: '#DC2626' }} />
          <span style={{ fontSize: 12, color: '#DC2626' }}>Não foi possível realizar a busca.</span>
        </div>
      )}

      {!loading && !error && results && !hasResults && (
        <div style={{ padding: '32px 16px', textAlign: 'center' }}>
          <i className="ti ti-search-off" style={{ fontSize: 32, color: '#D1D5DB', display: 'block', marginBottom: 10 }} />
          <div style={{ fontSize: 13, fontWeight: 500, color: '#6B7280' }}>Nenhum resultado encontrado</div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>Tente outros termos de busca</div>
        </div>
      )}

      {!error && hasResults && CATEGORY_ORDER.map(cat => {
        const items = results?.[cat];
        if (!items?.length) return null;
        const cfg = CATEGORY_CFG[cat];
        return (
          <div key={cat}>
            <div style={{ padding: '11px 16px 5px', display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 20, height: 20, borderRadius: 6, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className={`ti ${cfg.icon}`} style={{ fontSize: 11, color: cfg.color }} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                {cfg.label}
              </span>
            </div>
            {items.map(item => {
              const idx = flatIdx++;
              const isActive = focused === idx;
              return (
                <div
                  key={item.id}
                  onClick={() => navigateTo(item)}
                  onMouseEnter={() => setFocused(idx)}
                  style={{
                    padding: '9px 16px 9px 43px',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 10,
                    transition: 'background 0.08s',
                    background: isActive ? 'rgba(0,0,0,0.04)' : 'transparent',
                    margin: '1px 6px',
                    borderRadius: 10,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#09090B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: 11, color: '#71717A', marginTop: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.subtitle}
                    </div>
                  </div>
                  <i className="ti ti-chevron-right" style={{ fontSize: 13, color: isActive ? '#9CA3AF' : '#E4E4E7', flexShrink: 0 }} />
                </div>
              );
            })}
            <div style={{ height: 1, background: 'rgba(0,0,0,0.05)', margin: '6px 0' }} />
          </div>
        );
      })}

      {!loading && hasResults && (
        <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 10, color: '#C8CACD' }}>↑↓ navegar</span>
          <span style={{ fontSize: 10, color: '#C8CACD' }}>↵ abrir</span>
          <span style={{ fontSize: 10, color: '#C8CACD' }}>esc fechar</span>
        </div>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>

      {/* ── Pill input ──────────────────────────────────────────────────────── */}
      <div ref={shellRef}
        className={open ? 'gs-shell gs-shell--focused' : 'gs-shell gs-shell--idle'}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          height: 40,
          width: 540,
          padding: '0 14px',
          borderRadius: 999,
          background: 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          border: `1px solid ${open ? 'rgba(99,102,241,0.38)' : 'rgba(15,23,42,0.10)'}`,
          transition: 'border-color 0.18s',
          boxSizing: 'border-box',
        }}>

        {loading
          ? <i className="ti ti-loader-2" style={{ fontSize: 15, color: '#A1A1AA', animation: 'gspin 0.8s linear infinite', flexShrink: 0 }} />
          : <i className="ti ti-search"   style={{ fontSize: 15, color: '#A1A1AA', flexShrink: 0 }} />
        }

        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar no sistema..."
          style={{
            flex: 1, border: 'none', background: 'transparent',
            fontSize: 13, color: '#09090B', outline: 'none',
            fontFamily: 'inherit',
          }}
        />

        {query ? (
          <button
            onClick={() => { setQuery(''); setResults(null); setOpen(false); }}
            style={{ border: 'none', background: 'rgba(0,0,0,0.06)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', width: 18, height: 18, flexShrink: 0 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.10)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.06)'; }}
          >
            <i className="ti ti-x" style={{ fontSize: 10, color: '#71717A' }} />
          </button>
        ) : (
          <kbd style={{
            fontSize: 10, fontWeight: 600, color: '#9CA3AF',
            background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 6, padding: '2px 7px', fontFamily: 'inherit',
            whiteSpace: 'nowrap', cursor: 'default', flexShrink: 0,
            lineHeight: 1.6,
          }}>
            ⌘K
          </kbd>
        )}
      </div>

      {dropdown}

      <style>{`
        @keyframes gspin { to { transform: rotate(360deg); } }
        @keyframes gsDropIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.99); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes gsShadowPulse {
          0%, 100% {
            box-shadow:
              0 6px 20px rgba(15,23,42,0.06),
              0 0 0px rgba(99,102,241,0);
          }
          50% {
            box-shadow:
              0 8px 28px rgba(15,23,42,0.08),
              0 0 22px rgba(99,102,241,0.22);
          }
        }
        .gs-shell--idle {
          animation: gsShadowPulse 4.5s ease-in-out infinite;
        }
        .gs-shell--focused {
          box-shadow:
            0 0 0 4px rgba(99,102,241,0.10),
            0 8px 26px rgba(15,23,42,0.08);
        }
        @media (prefers-reduced-motion: reduce) {
          .gs-shell--idle {
            animation: none;
            box-shadow: 0 6px 20px rgba(15,23,42,0.06);
          }
        }
      `}</style>
    </div>
  );
}
