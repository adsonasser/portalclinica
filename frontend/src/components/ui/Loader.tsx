import { type CSSProperties } from 'react';

const KEYFRAMES = `
@keyframes _pcl_slide  { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
@keyframes _pcl_spin   { to { transform: rotate(360deg); } }

/* NC symbol: pop in, then float */
@keyframes _pcl_nc_pop {
  0%   { transform: scale(0.55); opacity: 0; }
  65%  { transform: scale(1.06); opacity: 1; }
  82%  { transform: scale(0.97); }
  100% { transform: scale(1);    opacity: 1; }
}
@keyframes _pcl_nc_float {
  0%, 100% { transform: scale(1) translateY(0px);  }
  50%       { transform: scale(1) translateY(-5px); }
}

/* Wordmark: fade-slide up after symbol appears */
@keyframes _pcl_word_in {
  0%   { opacity: 0; transform: translateY(6px); }
  100% { opacity: 1; transform: translateY(0);   }
}

/* Progress bar track fade in */
@keyframes _pcl_bar_in {
  0%   { opacity: 0; }
  100% { opacity: 1; }
}
`;

function injectKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('_pcl_loader_kf')) return;
  const s = document.createElement('style');
  s.id = '_pcl_loader_kf';
  s.textContent = KEYFRAMES;
  document.head.appendChild(s);
}

// ── Spinner — raw, used in gerencial dark theme ───────────────────────────────

interface SpinnerProps { size?: number; thickness?: number; color?: string; }

export function Spinner({ size = 20, thickness = 2, color = '#000000' }: SpinnerProps) {
  injectKeyframes();
  return (
    <div style={{
      width: size, height: size, flexShrink: 0,
      border: `${thickness}px solid ${color}22`,
      borderTopColor: color,
      borderRadius: '50%',
      animation: '_pcl_spin 0.75s linear infinite',
    }} />
  );
}

// ── PageLoader — full-screen (AuthGuard) ──────────────────────────────────────

export function PageLoader() {
  injectKeyframes();
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#FAFAFA',
    }}>
      {/* NC symbol — pops in then floats */}
      <img
        src="/nc-symbol.png"
        alt=""
        style={{
          width: 64, height: 64, objectFit: 'contain',
          animation: '_pcl_nc_pop 0.55s cubic-bezier(0.34,1.56,0.64,1) forwards, _pcl_nc_float 2.4s ease-in-out 0.55s infinite',
        }}
      />

      {/* Wordmark fades in after symbol */}
      <img
        src="/nassclin-logo.png"
        alt="nassclin"
        style={{
          height: 18, width: 'auto', objectFit: 'contain', marginTop: 18,
          animation: '_pcl_word_in 0.4s ease-out 0.7s both',
        }}
      />

      {/* Progress bar */}
      <div style={{
        width: 160, height: 1.5, borderRadius: 99,
        background: '#E4E4E7', overflow: 'hidden', position: 'relative',
        marginTop: 28,
        animation: '_pcl_bar_in 0.3s ease 1s both',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0,
          width: '45%', height: '100%',
          background: '#000000', borderRadius: 99,
          animation: '_pcl_slide 1.4s ease-in-out 1s infinite',
        }} />
      </div>
    </div>
  );
}

// ── SectionLoader — carregamento de dados de página ───────────────────────────

interface SectionLoaderProps {
  label?: string;
  size?: 'sm' | 'md';
  style?: CSSProperties;
}

export function SectionLoader({ label, size = 'md', style }: SectionLoaderProps) {
  injectKeyframes();
  const imgSize = size === 'sm' ? 32 : 44;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 12, padding: size === 'sm' ? '32px 16px' : '56px 16px',
      ...style,
    }}>
      <img
        src="/nc-symbol.png"
        alt=""
        style={{
          width: imgSize, height: imgSize, objectFit: 'contain',
          animation: '_pcl_nc_float 2s ease-in-out infinite',
          opacity: 0.75,
        }}
      />
      {label && (
        <span style={{ fontSize: 12, color: '#A1A1AA', letterSpacing: '0.02em' }}>
          {label}
        </span>
      )}
    </div>
  );
}

// ── TableLoader — linha de tbody durante fetch ────────────────────────────────

interface TableLoaderProps { colSpan?: number; label?: string; }

export function TableLoader({ colSpan = 10, label }: TableLoaderProps) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 0, border: 'none' }}>
        <SectionLoader label={label} size="sm" style={{ padding: '40px 16px' }} />
      </td>
    </tr>
  );
}
