import { useState, useEffect, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

// ─── Config (future SaaS configurable) ────────────────────────────────────────
interface LoginMessage {
  titulo: string;
  descricao: string;
}

interface LoginConfig {
  appName: string;
  logoUrl: string;
  leftTitle: string;
  leftSubtitle: string;
  showSignupLink: boolean;
  supportLink: string;
  primaryColor: string;
  year: number;
  companyName: string;
  rightMessages: LoginMessage[];
}

const LOGIN_CONFIG: LoginConfig = {
  appName: 'Portal Clínica',
  logoUrl: '',
  leftTitle: 'Bem-vindo de volta',
  leftSubtitle: 'Acesse sua conta para continuar.',
  showSignupLink: false,
  supportLink: '',
  primaryColor: '#000000',
  year: 2026,
  companyName: 'Portal Clínica',
  rightMessages: [
    {
      titulo: 'Gerencie seus pacientes e receitas em um só lugar',
      descricao: 'Acompanhe indicadores em tempo real, automatize tarefas e tenha controle total da sua clínica.',
    },
    {
      titulo: 'Transforme dados em decisões inteligentes',
      descricao: 'Visualize agenda, financeiro, sessões e relacionamento em uma única plataforma.',
    },
    {
      titulo: 'Mais organização para sua clínica',
      descricao: 'Centralize prontuários, vendas, contratos, documentos e comunicação com seus pacientes.',
    },
  ],
};

// ─── Dashboard Mockup ─────────────────────────────────────────────────────────
function DashboardMockup() {
  const bars = [55, 72, 48, 88, 65, 78, 91];
  const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J'];

  return (
    <div style={{
      background: 'rgba(255,255,255,.06)',
      border: '1px solid rgba(255,255,255,.1)',
      borderRadius: 16,
      padding: '20px',
      backdropFilter: 'blur(20px)',
      width: '100%',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em' }}>Receita mensal</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#FFFFFF' }}>R$ 48.320</div>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: 'rgba(52,211,153,.2)', color: '#34D399' }}>+12,4%</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {['Sem', 'Mês', 'Ano'].map((l, i) => (
            <button key={l} style={{ height: 22, padding: '0 9px', border: i === 1 ? '1px solid rgba(255,255,255,.2)' : 'none', borderRadius: 6, background: i === 1 ? 'rgba(255,255,255,.1)' : 'transparent', fontSize: 10, color: i === 1 ? '#FFFFFF' : 'rgba(255,255,255,.35)', cursor: 'pointer', fontFamily: 'inherit' }}>{l}</button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Pacientes', value: '284', icon: 'ti-users', color: '#60A5FA', bg: 'rgba(96,165,250,.1)' },
          { label: 'Sessões', value: '1.2k', icon: 'ti-calendar-check', color: '#A78BFA', bg: 'rgba(167,139,250,.1)' },
          { label: 'Satisfação', value: '96%', icon: 'ti-heart', color: '#34D399', bg: 'rgba(52,211,153,.1)' },
        ].map(({ label, value, icon, color, bg }) => (
          <div key={label} style={{ background: bg, borderRadius: 10, padding: '10px 12px', border: `1px solid ${color}30` }}>
            <i className={`ti ${icon}`} style={{ fontSize: 13, color }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF', marginTop: 5 }}>{value}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginTop: 2, lineHeight: 1.3 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,.35)', fontWeight: 500, marginBottom: 10 }}>Atendimentos · últimos 7 meses</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 60 }}>
          {bars.map((pct, i) => {
            const h = Math.round(pct * 0.6);
            const isLast = i === bars.length - 1;
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{
                  width: '100%', height: h,
                  borderRadius: '4px 4px 0 0',
                  background: isLast
                    ? 'linear-gradient(180deg, #818CF8 0%, #6366F1 100%)'
                    : 'rgba(255,255,255,.15)',
                }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
          {months.map((m, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'rgba(255,255,255,.3)' }}>{m}</div>
          ))}
        </div>
      </div>

      {/* Agenda preview */}
      <div style={{ paddingTop: 14, borderTop: '1px solid rgba(255,255,255,.08)' }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', marginBottom: 8 }}>Agenda de hoje</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[
            { time: '09:00', name: 'Maria Silva', proc: 'Consulta nutricional', sc: { color: '#34D399', bg: 'rgba(52,211,153,.15)', label: 'Confirmado' } },
            { time: '10:30', name: 'João Santos', proc: 'Sessão fisioterapia',  sc: { color: '#60A5FA', bg: 'rgba(96,165,250,.15)', label: 'Em atendimento' } },
            { time: '14:00', name: 'Ana Oliveira', proc: 'Avaliação estética',  sc: { color: 'rgba(255,255,255,.45)', bg: 'rgba(255,255,255,.06)', label: 'Agendado' } },
          ].map(({ time, name, proc, sc }) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,.04)' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,.45)', width: 34, flexShrink: 0 }}>{time}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{proc}</div>
              </div>
              <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: sc.bg, color: sc.color, whiteSpace: 'nowrap', flexShrink: 0 }}>{sc.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Right Panel ──────────────────────────────────────────────────────────────
function RightPanel({ config }: { config: LoginConfig }) {
  const messages = config.rightMessages;
  const [idx,     setIdx]     = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (messages.length <= 1) return;
    const timer = setInterval(() => {
      setVisible(false);
      const t = setTimeout(() => { setIdx(prev => (prev + 1) % messages.length); setVisible(true); }, 450);
      return () => clearTimeout(t);
    }, 6500);
    return () => clearInterval(timer);
  }, [messages.length]);

  const current = messages[idx] ?? { titulo: '', descricao: '' };

  function goTo(i: number) {
    if (i === idx) return;
    setVisible(false);
    setTimeout(() => { setIdx(i); setVisible(true); }, 450);
  }

  return (
    <div className="login-right" style={{
      flex: 1,
      background: 'linear-gradient(150deg, #0C0F1E 0%, #0F172A 45%, #111827 100%)',
      display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Grid dots texture */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,.055) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
        pointerEvents: 'none',
      }} />

      {/* Colour blobs */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 75% 25%, rgba(99,102,241,.18) 0%, transparent 55%), radial-gradient(ellipse at 25% 85%, rgba(139,92,246,.12) 0%, transparent 50%)',
        pointerEvents: 'none',
      }} />

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '48px 52px', position: 'relative', zIndex: 1 }}>

        {/* Badge */}
        <div style={{ marginBottom: 28 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 11, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase',
            padding: '5px 14px', borderRadius: 99,
            background: 'rgba(99,102,241,.2)', border: '1px solid rgba(99,102,241,.3)',
            color: '#818CF8',
          }}>
            <i className="ti ti-sparkles" style={{ fontSize: 11 }} />
            Plataforma de Gestão Clínica
          </span>
        </div>

        {/* Rotating message */}
        <div style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(10px)',
          transition: 'opacity .42s ease, transform .42s ease',
          marginBottom: 32,
        }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.28, letterSpacing: '-0.4px', margin: '0 0 14px' }}>
            {current.titulo}
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,.5)', lineHeight: 1.75, margin: 0 }}>
            {current.descricao}
          </p>
        </div>

        {/* Dot indicators */}
        {messages.length > 1 && (
          <div style={{ display: 'flex', gap: 7, marginBottom: 36 }}>
            {messages.map((_, i) => (
              <button key={i} onClick={() => goTo(i)}
                style={{
                  width: i === idx ? 24 : 7, height: 7, borderRadius: 99,
                  background: i === idx ? '#818CF8' : 'rgba(255,255,255,.2)',
                  border: 'none', cursor: 'pointer', padding: 0,
                  transition: 'all .35s ease',
                }} />
            ))}
          </div>
        )}

        {/* Dashboard mockup */}
        <DashboardMockup />
      </div>

      {/* Footer */}
      <div style={{
        flexShrink: 0, padding: '14px 52px',
        borderTop: '1px solid rgba(255,255,255,.07)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'relative', zIndex: 1,
      }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.28)' }}>
          © {config.year} {config.companyName}
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,.28)', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit', padding: 0 }}>
            <i className="ti ti-help-circle" style={{ fontSize: 13 }} /> Ajuda
          </button>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,.28)', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit', padding: 0 }}>
            <i className="ti ti-language" style={{ fontSize: 13 }} /> PT-BR
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Login Page ───────────────────────────────────────────────────────────────
export function LoginPage() {
  const { user, login } = useAuth();

  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPw,       setShowPw]       = useState(false);
  const [remember,     setRemember]     = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [emailErr,     setEmailErr]     = useState('');
  const [pwErr,        setPwErr]        = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [pwFocused,    setPwFocused]    = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const config = LOGIN_CONFIG;

  function validateEmail(v: string) {
    if (!v.trim()) return 'Informe seu e-mail.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'E-mail inválido.';
    return '';
  }
  function validatePassword(v: string) {
    if (!v) return 'Informe sua senha.';
    return '';
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    setEmailErr(eErr);
    setPwErr(pErr);
    if (eErr || pErr) return;

    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch {
      setError('E-mail ou senha incorretos. Verifique seus dados e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const emailBorder = emailErr
    ? '#FCA5A5'
    : emailFocused ? config.primaryColor : '#E4E4E7';

  const pwBorder = pwErr
    ? '#FCA5A5'
    : pwFocused ? config.primaryColor : '#E4E4E7';

  const inp: React.CSSProperties = {
    flex: 1, border: 'none', background: 'transparent',
    outline: 'none', fontSize: 14, color: '#09090B',
    fontFamily: "'Inter', system-ui, sans-serif",
  };

  const errRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 5,
    fontSize: 12, color: '#EF4444', marginTop: 5,
  };

  const lbl: React.CSSProperties = {
    display: 'block', fontSize: 13, fontWeight: 500,
    color: '#374151', marginBottom: 7,
  };

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .login-right { display: none !important; }
          .login-left  { flex: 0 0 100% !important; min-width: 0 !important; }
        }
        @media (max-width: 1100px) {
          .login-right-pad { padding-left: 36px !important; padding-right: 36px !important; }
        }
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 1000px #FFFFFF inset !important;
          -webkit-text-fill-color: #09090B !important;
          transition: background-color 9999s ease-in-out 0s;
        }
      `}</style>

      <div style={{
        width: '100vw', height: '100vh', display: 'flex', overflow: 'hidden',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}>

        {/* ── Left column ──────────────────────────────────────────────────── */}
        <div className="login-left" style={{
          flex: '0 0 50%', minWidth: 360, display: 'flex',
          flexDirection: 'column', background: '#FFFFFF',
          overflowY: 'auto',
        }}>
          {/* Centered content */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '52px 48px',
          }}>
            <div style={{ width: '100%', maxWidth: 396 }}>

              {/* Logo + brand */}
              <div style={{ marginBottom: 36 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 14,
                  background: config.primaryColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 16, boxShadow: '0 4px 14px rgba(0,0,0,.18)',
                }}>
                  <i className="ti ti-heart-rate-monitor" style={{ fontSize: 24, color: '#FFFFFF' }} />
                </div>
                <div style={{ fontSize: 12, color: '#A1A1AA', fontWeight: 500, marginBottom: 8, letterSpacing: '.03em' }}>
                  {config.appName}
                </div>
                <h1 style={{ fontSize: 26, fontWeight: 700, color: '#09090B', margin: 0, letterSpacing: '-0.4px', lineHeight: 1.2 }}>
                  {config.leftTitle}
                </h1>
                <p style={{ fontSize: 14, color: '#71717A', margin: '7px 0 0', lineHeight: 1.55 }}>
                  {config.leftSubtitle}
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} noValidate>

                {/* Email */}
                <div style={{ marginBottom: 18 }}>
                  <label style={lbl}>E-mail</label>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    border: `1.5px solid ${emailBorder}`,
                    borderRadius: 10, padding: '0 14px', height: 46,
                    background: emailErr ? '#FFF9F9' : '#FFFFFF',
                    transition: 'border-color .15s, box-shadow .15s',
                    boxShadow: emailFocused && !emailErr ? `0 0 0 3px rgba(0,0,0,.07)` : 'none',
                  }}>
                    <i className="ti ti-mail" style={{ fontSize: 16, color: emailErr ? '#EF4444' : emailFocused ? '#374151' : '#9CA3AF', flexShrink: 0 }} />
                    <input
                      type="email" value={email}
                      onChange={e => { setEmail(e.target.value); if (emailErr) setEmailErr(''); setError(''); }}
                      onFocus={() => setEmailFocused(true)}
                      onBlur={() => { setEmailFocused(false); if (email) setEmailErr(validateEmail(email)); }}
                      placeholder="seu@email.com"
                      autoComplete="email"
                      style={inp}
                    />
                  </div>
                  {emailErr && (
                    <div style={errRow}>
                      <i className="ti ti-alert-circle" style={{ fontSize: 12, flexShrink: 0 }} />
                      {emailErr}
                    </div>
                  )}
                </div>

                {/* Password */}
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Senha</label>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    border: `1.5px solid ${pwBorder}`,
                    borderRadius: 10, padding: '0 10px 0 14px', height: 46,
                    background: pwErr ? '#FFF9F9' : '#FFFFFF',
                    transition: 'border-color .15s, box-shadow .15s',
                    boxShadow: pwFocused && !pwErr ? `0 0 0 3px rgba(0,0,0,.07)` : 'none',
                  }}>
                    <i className="ti ti-lock" style={{ fontSize: 16, color: pwErr ? '#EF4444' : pwFocused ? '#374151' : '#9CA3AF', flexShrink: 0 }} />
                    <input
                      type={showPw ? 'text' : 'password'} value={password}
                      onChange={e => { setPassword(e.target.value); if (pwErr) setPwErr(''); setError(''); }}
                      onFocus={() => setPwFocused(true)}
                      onBlur={() => { setPwFocused(false); if (password) setPwErr(validatePassword(password)); }}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      style={inp}
                    />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '4px 6px', display: 'flex', alignItems: 'center', color: '#9CA3AF', borderRadius: 6, flexShrink: 0 }}>
                      <i className={`ti ${showPw ? 'ti-eye-off' : 'ti-eye'}`} style={{ fontSize: 16 }} />
                    </button>
                  </div>
                  {pwErr && (
                    <div style={errRow}>
                      <i className="ti ti-alert-circle" style={{ fontSize: 12, flexShrink: 0 }} />
                      {pwErr}
                    </div>
                  )}
                </div>

                {/* Remember + forgot */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                    <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                      style={{ width: 15, height: 15, accentColor: config.primaryColor, cursor: 'pointer' }} />
                    <span style={{ fontSize: 13, color: '#374151' }}>Lembrar de mim</span>
                  </label>
                  <button type="button"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#71717A', padding: 0, fontFamily: 'inherit' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#09090B'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#71717A'; }}>
                    Esqueceu a senha?
                  </button>
                </div>

                {/* General error */}
                {error && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 9,
                    background: '#FEF2F2', border: '1px solid #FECACA',
                    borderRadius: 10, padding: '10px 14px', marginBottom: 16,
                    fontSize: 13, color: '#DC2626',
                  }}>
                    <i className="ti ti-alert-circle" style={{ fontSize: 16, flexShrink: 0 }} />
                    {error}
                  </div>
                )}

                {/* Submit */}
                <button type="submit" disabled={loading}
                  style={{
                    width: '100%', height: 46,
                    background: loading ? '#52525B' : config.primaryColor,
                    border: 'none', borderRadius: 10,
                    fontSize: 14, fontWeight: 600, color: '#FFFFFF',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    fontFamily: 'inherit', transition: 'background .15s, transform .1s',
                    boxShadow: loading ? 'none' : '0 1px 3px rgba(0,0,0,.2)',
                  }}
                  onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#18181B'; }}
                  onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = config.primaryColor; }}
                >
                  {loading ? (
                    <>
                      <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .75s linear infinite', flexShrink: 0 }} />
                      Entrando...
                    </>
                  ) : (
                    <>
                      <i className="ti ti-login" style={{ fontSize: 16 }} />
                      Entrar
                    </>
                  )}
                </button>
              </form>

              {/* Sign-up link */}
              {config.showSignupLink && (
                <div style={{ textAlign: 'center', marginTop: 22, fontSize: 13, color: '#71717A' }}>
                  Não tem uma conta?{' '}
                  <button style={{ background: 'none', border: 'none', color: config.primaryColor, fontWeight: 600, cursor: 'pointer', fontSize: 13, padding: 0, fontFamily: 'inherit' }}>
                    Cadastre-se
                  </button>
                </div>
              )}

              {/* Security note */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 28, padding: '10px 14px', background: '#F4F4F5', borderRadius: 8 }}>
                <i className="ti ti-shield-lock" style={{ fontSize: 14, color: '#16A34A' }} />
                <span style={{ fontSize: 11, color: '#374151', fontWeight: 500 }}>Ambiente seguro · Dados criptografados (TLS)</span>
              </div>

              {/* Footer links */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginTop: 18, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, color: '#C4C4C4' }}>Portal Clínica v1.0</span>
                {['LGPD', 'Privacidade', 'Suporte'].map((l) => (
                  <span key={l} style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: '#D4D4D8', margin: '0 6px' }}>·</span>
                    <button type="button"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#A1A1AA', padding: 0, fontFamily: 'inherit' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#71717A'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#A1A1AA'}
                    >{l}</button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Right column ─────────────────────────────────────────────────── */}
        <RightPanel config={config} />
      </div>
    </>
  );
}
