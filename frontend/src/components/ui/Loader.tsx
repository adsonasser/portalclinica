import { type CSSProperties } from 'react';

const KEYFRAMES = `
@keyframes _pcl_spin   { to { transform: rotate(360deg); } }
@keyframes _pcl_slide  { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
@keyframes _pcl_pulse  { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
`;

function injectKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('_pcl_loader_kf')) return;
  const s = document.createElement('style');
  s.id = '_pcl_loader_kf';
  s.textContent = KEYFRAMES;
  document.head.appendChild(s);
}

// ── Spinner ───────────────────────────────────────────────────────────────────

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
      background: '#FAFAFA', gap: 28,
    }}>
      {/* Logo mark */}
      <img
        src="/nassclin-logo.png"
        alt="nassclin"
        style={{
          height: 28, width: 'auto', objectFit: 'contain',
          animation: '_pcl_pulse 2s ease-in-out infinite',
        }}
      />

      {/* Indeterminate progress bar */}
      <div style={{
        width: 200, height: 2, borderRadius: 99,
        background: '#E4E4E7', overflow: 'hidden', position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0,
          width: '40%', height: '100%',
          background: '#000000', borderRadius: 99,
          animation: '_pcl_slide 1.4s ease-in-out infinite',
        }} />
      </div>
    </div>
  );
}

// ── SectionLoader — centered inside a page area ───────────────────────────────

interface SectionLoaderProps {
  label?: string;
  size?: 'sm' | 'md';
  style?: CSSProperties;
}

export function SectionLoader({ label = 'Carregando...', size = 'md', style }: SectionLoaderProps) {
  injectKeyframes();
  const spinSize = size === 'sm' ? 16 : 22;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 10, padding: size === 'sm' ? '24px 16px' : '48px 16px',
      ...style,
    }}>
      <Spinner size={spinSize} thickness={size === 'sm' ? 1.5 : 2} />
      {label && (
        <span style={{ fontSize: 12, color: '#A1A1AA', letterSpacing: '0.02em' }}>
          {label}
        </span>
      )}
    </div>
  );
}

// ── TableLoader — a <tr> row with centered spinner ────────────────────────────

interface TableLoaderProps { colSpan?: number; label?: string; }

export function TableLoader({ colSpan = 10, label = 'Carregando...' }: TableLoaderProps) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 0, border: 'none' }}>
        <SectionLoader label={label} size="sm" style={{ padding: '36px 16px' }} />
      </td>
    </tr>
  );
}
