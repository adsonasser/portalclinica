import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3002';

export function ConfirmarEmailPage() {
  const [params]  = useSearchParams();
  const token     = params.get('token') ?? '';
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [msg, setMsg]       = useState('');

  useEffect(() => {
    if (!token) { setStatus('error'); setMsg('Link inválido ou expirado.'); return; }
    fetch(`${API}/public/confirm-email?token=${encodeURIComponent(token)}`)
      .then(async res => {
        const data = await res.json();
        if (res.ok) { setStatus('success'); setMsg(data.message ?? 'E-mail confirmado!'); }
        else        { setStatus('error');   setMsg(data.message ?? 'Erro ao confirmar.'); }
      })
      .catch(() => { setStatus('error'); setMsg('Erro de conexão. Tente novamente.'); });
  }, [token]);

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', system-ui, sans-serif", padding: 24 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ background: '#FFFFFF', borderRadius: 20, border: '1px solid #E4E4E7', padding: '48px 40px', maxWidth: 460, width: '100%', textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
        {status === 'loading' && (
          <>
            <div style={{ width: 48, height: 48, border: '3px solid #E4E4E7', borderTopColor: '#000', borderRadius: '50%', animation: 'spin .75s linear infinite', margin: '0 auto 20px' }} />
            <p style={{ fontSize: 15, color: '#71717A', margin: 0 }}>Confirmando seu e-mail...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <i className="ti ti-circle-check" style={{ fontSize: 32, color: '#16A34A' }} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#09090B', margin: '0 0 10px' }}>E-mail confirmado!</h1>
            <p style={{ fontSize: 14, color: '#71717A', lineHeight: 1.7, margin: '0 0 28px' }}>{msg}</p>
            <a href="/login" style={{ display: 'inline-block', height: 44, lineHeight: '44px', padding: '0 32px', background: '#000', color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
              Fazer login →
            </a>
          </>
        )}
        {status === 'error' && (
          <>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <i className="ti ti-alert-circle" style={{ fontSize: 32, color: '#DC2626' }} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#09090B', margin: '0 0 10px' }}>Link inválido</h1>
            <p style={{ fontSize: 14, color: '#71717A', lineHeight: 1.7, margin: '0 0 28px' }}>{msg}</p>
            <a href="/login" style={{ display: 'inline-block', fontSize: 13, color: '#000', fontWeight: 600, textDecoration: 'none' }}>
              Voltar para o login
            </a>
          </>
        )}
      </div>
    </div>
  );
}
