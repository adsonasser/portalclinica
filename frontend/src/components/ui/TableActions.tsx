import { useState, useRef, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActionVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'purple' | 'blue';

export interface PrimaryAction {
  label: string;
  icon?: string;
  onClick: () => void;
  variant?: ActionVariant;
}

export interface SecondaryAction {
  label: string;
  icon?: string;
  onClick: () => void;
  variant?: 'default' | 'danger';
  separator?: boolean;
  disabled?: boolean;
}

interface TableActionsProps {
  primaryAction?: PrimaryAction;
  secondaryActions?: SecondaryAction[];
}

// ─── Variant styles ───────────────────────────────────────────────────────────

const VARIANTS: Record<ActionVariant, { bg: string; color: string; border: string }> = {
  default: { bg: '#F4F4F5', color: '#374151', border: '#E4E4E7' },
  primary: { bg: '#000000', color: '#FFFFFF', border: '#000000' },
  success: { bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0' },
  warning: { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' },
  danger:  { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' },
  purple:  { bg: '#F5F3FF', color: '#7C3AED', border: '#DDD6FE' },
  blue:    { bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE' },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function TableActions({ primaryAction, secondaryActions = [] }: TableActionsProps) {
  const [open, setOpen]   = useState(false);
  const [pos, setPos]     = useState({ top: 0, left: 0 });
  const dotsRef           = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (dotsRef.current && dotsRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!dotsRef.current) return;
    const rect = dotsRef.current.getBoundingClientRect();
    const menuW = 214;
    const left = Math.max(8, Math.min(rect.right - menuW, window.innerWidth - menuW - 8));
    const top = rect.bottom + 4 + window.scrollY;
    setPos({ top, left });
    setOpen(o => !o);
  };

  const variantStyle = VARIANTS[primaryAction?.variant ?? 'default'];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
      {/* Primary action button */}
      {primaryAction && (
        <button
          onClick={e => { e.stopPropagation(); primaryAction.onClick(); }}
          style={{
            height: 28, padding: '0 10px',
            background: variantStyle.bg, border: `1px solid ${variantStyle.border}`,
            borderRadius: 7, fontSize: 12, fontWeight: 500, color: variantStyle.color,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
        >
          {primaryAction.icon && <i className={`ti ${primaryAction.icon}`} style={{ fontSize: 12 }} />}
          {primaryAction.label}
        </button>
      )}

      {/* Three-dot button */}
      {secondaryActions.length > 0 && (
        <button
          ref={dotsRef}
          onClick={toggleMenu}
          style={{
            width: 28, height: 28, border: `1px solid ${open ? '#D4D4D8' : '#E4E4E7'}`,
            background: open ? '#F4F4F5' : '#FFFFFF', borderRadius: 7,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#71717A',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; (e.currentTarget as HTMLElement).style.borderColor = '#D4D4D8'; }}
          onMouseLeave={e => { if (!open) { (e.currentTarget as HTMLElement).style.background = '#FFFFFF'; (e.currentTarget as HTMLElement).style.borderColor = '#E4E4E7'; } }}
        >
          <i className="ti ti-dots-vertical" style={{ fontSize: 14 }} />
        </button>
      )}

      {/* Dropdown menu */}
      {open && (
        <>
          {/* Invisible backdrop to catch outside clicks */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onClick={e => { e.stopPropagation(); setOpen(false); }}
          />
          <div
            style={{
              position: 'fixed', top: pos.top, left: pos.left,
              width: 214, background: '#FFFFFF',
              border: '1px solid #E4E4E7', borderRadius: 10,
              boxShadow: '0 8px 32px rgba(0,0,0,0.13)',
              zIndex: 9999, overflow: 'hidden', padding: '4px 0',
              fontFamily: "'Inter', system-ui, sans-serif",
            }}
            onClick={e => e.stopPropagation()}
          >
            {secondaryActions.map((action, i) => (
              <div key={i}>
                {action.separator && (
                  <div style={{ height: 1, background: '#F1F3F5', margin: '4px 0' }} />
                )}
                <button
                  onClick={() => { setOpen(false); action.onClick(); }}
                  disabled={action.disabled}
                  style={{
                    width: '100%', padding: '8px 14px',
                    background: 'none', border: 'none', textAlign: 'left',
                    cursor: action.disabled ? 'default' : 'pointer',
                    fontSize: 13, fontWeight: 400,
                    color: action.variant === 'danger' ? '#DC2626' : action.disabled ? '#A1A1AA' : '#191C1D',
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => {
                    if (!action.disabled)
                      (e.currentTarget as HTMLElement).style.background =
                        action.variant === 'danger' ? '#FEF2F2' : '#F9F9F9';
                  }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                >
                  {action.icon && <i className={`ti ${action.icon}`} style={{ fontSize: 13, color: action.variant === 'danger' ? '#DC2626' : '#71717A' }} />}
                  {action.label}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
