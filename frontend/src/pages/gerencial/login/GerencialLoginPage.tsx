import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useGerencialAuth } from '../../../contexts/GerencialAuthContext';

export function GerencialLoginPage() {
  const { user, login } = useGerencialAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  if (user) return <Navigate to="/gerencial/dashboard" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Preencha todos os campos.'); return; }
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err?.message || 'Credenciais inválidas ou sem permissão de acesso.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
      `}</style>

      <div style={{ width: '100vw', height: '100vh', display: 'flex', background: '#09090B', fontFamily: "'Inter', system-ui, sans-serif", overflow: 'hidden' }}>

        {/* Left — form */}
        <div style={{ flex: '0 0 50%', minWidth: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px', overflowY: 'auto', background: '#09090B' }}>
          <div style={{ width: '100%', maxWidth: 380 }}>

            {/* Logo */}
            <div style={{ marginBottom: 36 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #6366F1, #818CF8)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, boxShadow: '0 8px 24px rgba(99,102,241,.4)' }}>
                <i className="ti ti-crown" style={{ fontSize: 24, color: '#FFFFFF' }} />
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6366F1', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8 }}>Acesso Restrito</div>
              <h1 style={{ fontSize: 26, fontWeight: 700, color: '#FAFAFA', margin: 0, letterSpacing: '-0.4px', lineHeight: 1.2 }}>Painel Gerencial</h1>
              <p style={{ fontSize: 14, color: '#52525B', margin: '7px 0 0', lineHeight: 1.55 }}>Acesse com sua conta master para administrar o sistema.</p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} noValidate>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#71717A', marginBottom: 6 }}>E-mail</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1.5px solid #27272A', borderRadius: 10, padding: '0 14px', height: 44, background: '#111118', transition: 'border-color .15s' }}>
                  <i className="ti ti-mail" style={{ fontSize: 15, color: '#52525B', flexShrink: 0 }} />
                  <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }}
                    placeholder="master@sistema.com" autoComplete="email"
                    style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: '#FAFAFA', fontFamily: 'inherit' }} />
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#71717A', marginBottom: 6 }}>Senha</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1.5px solid #27272A', borderRadius: 10, padding: '0 10px 0 14px', height: 44, background: '#111118' }}>
                  <i className="ti ti-lock" style={{ fontSize: 15, color: '#52525B', flexShrink: 0 }} />
                  <input type={showPw ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
                    placeholder="••••••••" autoComplete="current-password"
                    style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: '#FAFAFA', fontFamily: 'inherit' }} />
                  <button type="button" onClick={() => setShowPw(v => !v)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#52525B', padding: '4px', display: 'flex' }}>
                    <i className={`ti ${showPw ? 'ti-eye-off' : 'ti-eye'}`} style={{ fontSize: 15 }} />
                  </button>
                </div>
              </div>

              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(220,38,38,.1)', border: '1px solid rgba(220,38,38,.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#F87171' }}>
                  <i className="ti ti-alert-circle" style={{ fontSize: 15, flexShrink: 0 }} />
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                style={{ width: '100%', height: 44, background: loading ? '#3730A3' : 'linear-gradient(135deg, #6366F1, #818CF8)', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, color: '#FFFFFF', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(99,102,241,.4)' }}>
                {loading ? (
                  <><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .75s linear infinite' }} /> Acessando...</>
                ) : (
                  <><i className="ti ti-lock-open" style={{ fontSize: 16 }} /> Acessar gerencial</>
                )}
              </button>
            </form>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 24 }}>
              <i className="ti ti-shield-lock" style={{ fontSize: 12, color: '#3F3F46' }} />
              <span style={{ fontSize: 11, color: '#3F3F46' }}>Acesso restrito · Auditado</span>
            </div>
          </div>
        </div>

        {/* Right — visual */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'linear-gradient(150deg, #0C0C18 0%, #0F0F1E 50%, #111130 100%)' }}>
          {/* Grid pattern */}
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(99,102,241,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,.07) 1px, transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />
          {/* Blobs */}
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 60% 20%, rgba(99,102,241,.25) 0%, transparent 50%), radial-gradient(ellipse at 30% 80%, rgba(139,92,246,.15) 0%, transparent 45%)', pointerEvents: 'none' }} />

          {/* Content */}
          <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 60px' }}>
            <div style={{ marginBottom: 20 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 99, background: 'rgba(99,102,241,.2)', border: '1px solid rgba(99,102,241,.3)', color: '#818CF8', letterSpacing: '.05em', textTransform: 'uppercase' }}>
                <i className="ti ti-crown" style={{ fontSize: 11 }} /> SaaS Master Control
              </span>
            </div>
            <h2 style={{ fontSize: 30, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.25, letterSpacing: '-0.4px', margin: '0 0 14px' }}>Gerencie todo o ecossistema em um único painel</h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,.45)', lineHeight: 1.7, margin: '0 0 40px' }}>Controle empresas, assinaturas, usuários, métricas, marketing global e acesso master com total segurança e auditoria.</p>

            {[
              { icon: 'ti-building', title: 'Gestão de empresas', desc: 'Crie, suspenda, bloqueie e acesse empresas' },
              { icon: 'ti-chart-bar', title: 'Métricas em tempo real', desc: 'Uso por tenant, usuários ativos, dados de crescimento' },
              { icon: 'ti-shield-check', title: 'Auditoria completa', desc: 'Todos os acessos e ações registrados' },
              { icon: 'ti-speakerphone', title: 'Marketing global', desc: 'Envie campanhas para todos os sistemas' },
            ].map(({ icon, title, desc }) => (
              <div key={title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 18 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(99,102,241,.15)', border: '1px solid rgba(99,102,241,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className={`ti ${icon}`} style={{ fontSize: 16, color: '#818CF8' }} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#E4E4E7', marginBottom: 2 }}>{title}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', lineHeight: 1.5 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '14px 60px', borderTop: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.2)' }}>© 2026 Portal Clínica</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.2)' }}>v2.0 · Acesso master</div>
          </div>
        </div>
      </div>
    </>
  );
}
