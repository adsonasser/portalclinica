import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../../services/gerencialApi';
import { useNavigate } from 'react-router-dom';

const STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  ATIVA:        { bg: 'rgba(22,163,74,.15)',  color: '#4ADE80', label: 'Ativa' },
  TESTE:        { bg: 'rgba(96,165,250,.15)', color: '#60A5FA', label: 'Teste' },
  IMPLANTACAO:  { bg: 'rgba(251,191,36,.15)', color: '#FCD34D', label: 'Implantação' },
  SUSPENSA:     { bg: 'rgba(251,146,60,.15)', color: '#FB923C', label: 'Suspensa' },
  BLOQUEADA:    { bg: 'rgba(239,68,68,.15)',  color: '#F87171', label: 'Bloqueada' },
  INADIMPLENTE: { bg: 'rgba(239,68,68,.15)',  color: '#F87171', label: 'Inadimplente' },
  CANCELADA:    { bg: 'rgba(82,82,91,.2)',    color: '#71717A', label: 'Cancelada' },
};

const dark = { h1: '#F4F4F5', h2: '#E4E4E7', muted: '#71717A', border: 'rgba(255,255,255,.07)', surface: 'rgba(255,255,255,.04)' };

export function GerencialDashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['gerencial-dashboard'],
    queryFn: adminApi.dashboard,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 32, height: 32, border: '3px solid rgba(99,102,241,.2)', borderTopColor: '#818CF8', borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 13, color: dark.muted }}>Carregando dados...</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const d = data as any;

  const kpis = [
    { label: 'Empresas ativas',     value: d?.activeClinics ?? 0,     icon: 'ti-building-check', color: '#4ADE80', bg: 'rgba(22,163,74,.15)' },
    { label: 'Em teste',            value: d?.testClinics ?? 0,        icon: 'ti-flask',          color: '#60A5FA', bg: 'rgba(96,165,250,.15)' },
    { label: 'Inadimplentes',       value: d?.inadimpleteClinics ?? 0, icon: 'ti-alert-triangle', color: '#F87171', bg: 'rgba(239,68,68,.15)' },
    { label: 'Total de usuários',   value: d?.totalUsers ?? 0,         icon: 'ti-users',          color: '#A78BFA', bg: 'rgba(167,139,250,.15)' },
    { label: 'Total de empresas',   value: d?.totalClinics ?? 0,       icon: 'ti-world',          color: '#34D399', bg: 'rgba(52,211,153,.15)' },
    { label: 'Suspensas/Bloqueadas',value: (d?.suspendedClinics ?? 0) + (d?.blockedClinics ?? 0), icon: 'ti-ban', color: '#FB923C', bg: 'rgba(251,146,60,.15)' },
  ];

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'Inter', system-ui, sans-serif" }}>

        {/* Header */}
        <div style={{ flexShrink: 0, padding: '22px 28px 18px', borderBottom: `1px solid ${dark.border}` }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: dark.h1, margin: 0, letterSpacing: '-0.3px' }}>Dashboard</h1>
          <p style={{ fontSize: 12, color: dark.muted, margin: '3px 0 0' }}>Visão geral do ecossistema SaaS</p>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '22px 28px' }}>

          {/* KPI grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 24 }}>
            {kpis.map(k => (
              <div key={k.label} style={{ background: dark.surface, border: `1px solid ${dark.border}`, borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', transition: 'border-color .15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,.3)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = dark.border; }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: k.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className={`ti ${k.icon}`} style={{ fontSize: 20, color: k.color }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: dark.muted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{k.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: dark.h1, lineHeight: 1.1 }}>{k.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom two-col */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>

            {/* Empresas recentes */}
            <div style={{ background: dark.surface, border: `1px solid ${dark.border}`, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${dark.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: dark.h2 }}>Empresas recentes</div>
                <button onClick={() => navigate('/gerencial/empresas')} style={{ fontSize: 11, color: '#818CF8', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Ver todas →</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,.03)' }}>
                    {['Empresa','Status','Usuários','Cadastro'].map(h => (
                      <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: dark.muted, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(d?.recentClinics ?? []).map((c: any) => {
                    const st = STATUS_CFG[c.status] ?? STATUS_CFG['ATIVA'];
                    return (
                      <tr key={c.id} style={{ borderTop: `1px solid ${dark.border}`, cursor: 'pointer' }}
                        onClick={() => navigate(`/gerencial/empresas/${c.id}`)}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.03)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                        <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: dark.h2, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: st.bg, color: st.color }}>{st.label}</span>
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 11, color: dark.muted }}>{c._count?.users ?? 0}</td>
                        <td style={{ padding: '10px 14px', fontSize: 11, color: dark.muted, whiteSpace: 'nowrap' }}>{new Date(c.createdAt).toLocaleDateString('pt-BR')}</td>
                      </tr>
                    );
                  })}
                  {(!d?.recentClinics || d.recentClinics.length === 0) && (
                    <tr><td colSpan={4} style={{ padding: '24px 14px', textAlign: 'center', fontSize: 12, color: dark.muted }}>Nenhuma empresa cadastrada ainda</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Alertas */}
            <div style={{ background: dark.surface, border: `1px solid ${dark.border}`, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${dark.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: dark.h2 }}>Alertas e pendências</div>
              </div>
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {d?.inadimpleteClinics > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 10 }}>
                    <i className="ti ti-alert-circle" style={{ fontSize: 15, color: '#F87171', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#F87171' }}>{d.inadimpleteClinics} empresa(s) inadimplente(s)</div>
                      <div style={{ fontSize: 11, color: 'rgba(248,113,113,.6)', marginTop: 1 }}>Requerem atenção financeira</div>
                    </div>
                    <button onClick={() => navigate('/gerencial/empresas?status=INADIMPLENTE')} style={{ fontSize: 10, color: '#F87171', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Ver →</button>
                  </div>
                )}
                {d?.suspendedClinics > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(251,146,60,.08)', border: '1px solid rgba(251,146,60,.2)', borderRadius: 10 }}>
                    <i className="ti ti-player-pause" style={{ fontSize: 15, color: '#FB923C', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#FB923C' }}>{d.suspendedClinics} empresa(s) suspensa(s)</div>
                      <div style={{ fontSize: 11, color: 'rgba(251,146,60,.6)', marginTop: 1 }}>Acesso temporariamente bloqueado</div>
                    </div>
                  </div>
                )}
                {d?.clinicsNearExpiry?.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.2)', borderRadius: 10 }}>
                    <i className="ti ti-clock" style={{ fontSize: 15, color: '#FCD34D', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#FCD34D' }}>{d.clinicsNearExpiry.length} vencimento(s) em 7 dias</div>
                      <div style={{ fontSize: 11, color: 'rgba(252,211,77,.6)', marginTop: 1 }}>Contatos precisam de renovação</div>
                    </div>
                  </div>
                )}
                {(!d?.inadimpleteClinics && !d?.suspendedClinics && !d?.clinicsNearExpiry?.length) && (
                  <div style={{ padding: '24px 0', textAlign: 'center' }}>
                    <i className="ti ti-checks" style={{ fontSize: 28, color: '#4ADE80', display: 'block', marginBottom: 8 }} />
                    <div style={{ fontSize: 13, color: dark.muted }}>Tudo em ordem por aqui</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
