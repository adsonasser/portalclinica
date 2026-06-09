import { Navigate } from 'react-router-dom';
import { useGerencialAuth } from '../../contexts/GerencialAuthContext';
import type { ReactNode } from 'react';

export function GerencialAuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useGerencialAuth();

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0A0A0A', fontFamily: "'Inter', system-ui" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,.1)', borderTopColor: '#818CF8', borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 13, color: '#52525B' }}>Verificando acesso...</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user) return <Navigate to="/gerencial/login" replace />;
  return <>{children}</>;
}
