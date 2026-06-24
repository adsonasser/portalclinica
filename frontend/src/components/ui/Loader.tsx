import { type CSSProperties } from 'react';

const KEYFRAMES = `
@keyframes _pcl_slide  { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
@keyframes _pcl_spin   { to { transform: rotate(360deg); } }

/* SVG draw — stroke-dashoffset 1→0, pathLength normalised to 1 */
@keyframes _pcl_draw {
  from { stroke-dashoffset: 1; }
  to   { stroke-dashoffset: 0; }
}

/* Fade + glow after draw completes */
@keyframes _pcl_glow {
  0%   { opacity: 1; filter: drop-shadow(0 0 0px #00000000); }
  50%  { filter: drop-shadow(0 0 6px rgba(0,0,0,0.18)); }
  100% { opacity: 1; filter: drop-shadow(0 0 0px #00000000); }
}

/* NC symbol: float loop (SectionLoader) */
@keyframes _pcl_nc_pop {
  0%   { transform: scale(0.55); opacity: 0; }
  65%  { transform: scale(1.06); opacity: 1; }
  82%  { transform: scale(0.97); }
  100% { transform: scale(1);    opacity: 1; }
}
@keyframes _pcl_nc_float {
  0%, 100% { transform: translateY(0px); }
  50%       { transform: translateY(-5px); }
}

/* Wordmark: fade-slide up */
@keyframes _pcl_word_in {
  0%   { opacity: 0; transform: translateY(6px); }
  100% { opacity: 1; transform: translateY(0); }
}

/* Progress bar fade-in */
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

// ── PageLoader — full-screen com fundo de vidro fosco + SVG draw ──────────────
//
// Sequência:
//   0.0–0.9s   letra "n" desenhada
//   0.5–1.4s   letra "c" desenhada (com sobreposição)
//   1.2s       glow sutil no SVG
//   1.4s       wordmark aparece
//   1.7s       barra de progresso inicia

export function PageLoader() {
  injectKeyframes();
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'rgba(255, 255, 255, 0.55)',
      backdropFilter: 'blur(32px) saturate(180%)',
      WebkitBackdropFilter: 'blur(32px) saturate(180%)',
    }}>

      {/*
        SVG "nc" com animação de desenho stroke por stroke.
        pathLength="1" normaliza o comprimento → stroke-dasharray/offset em [0,1].
        Cada letra parte de stroke-dashoffset:1 (invisível) → 0 (completo).
      */}
      <svg
        viewBox="0 0 106 44"
        width="120"
        height="50"
        fill="none"
        stroke="#09090B"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ animation: '_pcl_glow 1.4s ease-in-out 1.2s 1 both' }}
      >
        {/* Letra n */}
        <path
          d="M 6,39 L 6,8 C 6,4 12,4 18,4 C 26,4 30,11 30,21 L 30,39"
          pathLength="1"
          strokeDasharray="1"
          style={{ animation: '_pcl_draw 0.9s cubic-bezier(0.4,0,0.2,1) 0.05s both' }}
        />
        {/* Letra c */}
        <path
          d="M 99,10 C 87,3 50,3 44,22 C 38,41 73,41 99,34"
          pathLength="1"
          strokeDasharray="1"
          style={{ animation: '_pcl_draw 0.9s cubic-bezier(0.4,0,0.2,1) 0.55s both' }}
        />
      </svg>

      {/* Barra de progresso fina */}
      <div style={{
        width: 120, height: 1.5, borderRadius: 99,
        background: 'rgba(0,0,0,0.1)', overflow: 'hidden', position: 'relative',
        marginTop: 32,
        animation: '_pcl_bar_in 0.3s ease 1.2s both',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0,
          width: '45%', height: '100%',
          background: '#09090B', borderRadius: 99,
          animation: '_pcl_slide 1.5s ease-in-out 1.2s infinite',
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
