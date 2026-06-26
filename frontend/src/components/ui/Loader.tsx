import { type CSSProperties } from 'react';

const KEYFRAMES = `
@keyframes _pcl_slide  { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
@keyframes _pcl_spin   { to { transform: rotate(360deg); } }
@keyframes _pcl_nc_float {
  0%, 100% { transform: translateY(0px); }
  50%       { transform: translateY(-5px); }
}
@keyframes _pcl_glass_in {
  from { opacity: 0; backdrop-filter: blur(0px); }
  to   { opacity: 1; backdrop-filter: blur(24px); }
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

// ── GlassOverlay — fullscreen frosted glass com GIF ───────────────────────────

function GlassOverlay({ gifSize = 200 }: { gifSize?: number }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(255, 255, 255, 0.45)',
      backdropFilter: 'blur(24px) saturate(180%)',
      WebkitBackdropFilter: 'blur(24px) saturate(180%)',
      animation: '_pcl_glass_in 0.2s ease both',
    }}>
      <img
        src="/nassclin-loading.gif"
        alt="Carregando..."
        style={{ width: gifSize, objectFit: 'contain', userSelect: 'none', pointerEvents: 'none' }}
      />
    </div>
  );
}

// ── PageLoader — tela inicial (AuthGuard) ─────────────────────────────────────

export function PageLoader() {
  injectKeyframes();
  return <GlassOverlay gifSize={220} />;
}

// ── SectionLoader — loading de dados de página ────────────────────────────────
//
// size="md" (padrão): overlay fullscreen com vidro fosco + GIF
// size="sm":          inline, no fluxo do documento (sub-painéis, tabelas)

interface SectionLoaderProps {
  label?: string;
  size?: 'sm' | 'md';
  style?: CSSProperties;
}

export function SectionLoader({ label, size = 'md', style }: SectionLoaderProps) {
  injectKeyframes();

  if (size === 'sm') {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 10, padding: '32px 16px',
        ...style,
      }}>
        <img
          src="/nc-symbol.png"
          alt=""
          style={{ width: 32, height: 32, objectFit: 'contain', animation: '_pcl_nc_float 2s ease-in-out infinite', opacity: 0.7 }}
        />
        {label && <span style={{ fontSize: 12, color: '#A1A1AA', letterSpacing: '0.02em' }}>{label}</span>}
      </div>
    );
  }

  return <GlassOverlay gifSize={200} />;
}

// ── TableLoader — fullscreen glass overlay durante fetch de tabela ────────────

interface TableLoaderProps { colSpan?: number; label?: string; }

export function TableLoader({ colSpan = 10 }: TableLoaderProps) {
  injectKeyframes();
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 0, border: 'none', height: 0 }}>
        <GlassOverlay gifSize={200} />
      </td>
    </tr>
  );
}
