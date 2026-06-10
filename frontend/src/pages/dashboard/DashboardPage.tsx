import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { dashboardApi } from '../../services/api';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

const STATUS_COLORS: Record<string, string> = {
  CONFIRMADO: '#16A34A', AGUARDANDO: '#71717A', ATENCAO: '#DC2626',
  RETORNO: '#7C3AED', AVALIACAO: '#2563EB', ENCAIXE: '#A1A1AA',
};

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: stats, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: dashboardApi.stats });
  const { data: chart } = useQuery({ queryKey: ['dashboard-chart'], queryFn: () => dashboardApi.chart(6) });

  if (isLoading) {
    return (
      <div style={{ padding: '60px 40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 32, height: 32, border: '2.5px solid #000000', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 13, color: '#71717A' }}>Carregando dashboard...</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  const kpis = stats?.kpis || {};
  const proximos = stats?.proximosAgendamentos || [];

  const kpiCards = [
    { label: 'Pacientes', value: kpis.totalPacientes || 0, sub: `+${kpis.novosPatients || 0} novos este mês`, icon: 'ti-users', iconBg: '#EFF6FF', iconColor: '#2563EB', path: '/patients', tooltip: 'Pacientes cadastrados e ativos na clínica.' },
    { label: 'Agenda hoje', value: kpis.agendamentosHoje || 0, sub: `${kpis.agendamentosMes || 0} este mês`, icon: 'ti-calendar', iconBg: '#EFF6FF', iconColor: '#2563EB', path: '/agenda', tooltip: 'Consultas e atendimentos programados para o dia atual.' },
    { label: 'Receita mês', value: fmt(kpis.receitaMes || 0), sub: `Despesas: ${fmt(kpis.despesaMes || 0)}`, icon: 'ti-cash', iconBg: '#F0FDF4', iconColor: '#16A34A', valueColor: '#16A34A', path: '/financial', tooltip: 'Total de receitas registradas no mês atual.' },
    { label: 'Saldo mês', value: fmt(kpis.saldoMes || 0), sub: (kpis.saldoMes || 0) >= 0 ? 'Resultado positivo' : 'Resultado negativo', icon: 'ti-trending-up', iconBg: kpis.saldoMes >= 0 ? '#F0FDF4' : '#FEF2F2', iconColor: kpis.saldoMes >= 0 ? '#16A34A' : '#DC2626', valueColor: kpis.saldoMes >= 0 ? '#16A34A' : '#DC2626', path: '/financial', tooltip: 'Receitas menos despesas registradas no mês atual.' },
    { label: 'Potenciais pacientes', value: kpis.leadsAtivos || 0, sub: 'No funil de acompanhamento', icon: 'ti-layout-kanban', iconBg: '#F5F3FF', iconColor: '#7C3AED', path: '/oportunidades', tooltip: 'Pessoas em negociação ou acompanhamento antes da conversão.' },
    { label: 'Tarefas pendentes', value: kpis.tasksPendentes || 0, sub: 'Aguardando conclusão', icon: 'ti-checkbox', iconBg: '#F5F3FF', iconColor: '#7C3AED', path: '/crm/tarefas', tooltip: 'Tarefas abertas atribuídas à equipe da clínica.' },
  ];

  return (
    <div style={{ padding: '24px 28px', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14, marginBottom: 20 }}>
        {kpiCards.map((k, i) => (
          <div key={i}
            onClick={() => k.path && navigate(k.path)}
            title={k.tooltip}
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px', borderRadius: 20, border: '1px solid #EAECEF', background: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,0,0,0.03)', cursor: k.path ? 'pointer' : 'default', transition: 'box-shadow 0.15s, border-color 0.15s' }}
            onMouseEnter={e => { if (k.path) { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)'; (e.currentTarget as HTMLElement).style.borderColor = '#D4D4D8'; } }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.03)'; (e.currentTarget as HTMLElement).style.borderColor = '#EAECEF'; }}
          >
            <div style={{ width: 46, height: 46, borderRadius: 14, background: k.iconBg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className={`ti ${k.icon}`} style={{ fontSize: 21, color: k.iconColor }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#71717A', fontWeight: 500, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.05em' }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: (k as any).valueColor || '#09090B', lineHeight: 1.1 }}>{k.value}</div>
              <div style={{ fontSize: 11, color: '#71717A', marginTop: 2 }}>{k.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts + Right sidebar */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* Charts */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ background: '#FFFFFF', borderRadius: 20, border: '1px solid #EAECEF', padding: '20px 24px', marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#09090B' }}>Receita vs Despesa</div>
              <div style={{ fontSize: 12, color: '#71717A', marginTop: 2 }}>Últimos 6 meses</div>
            </div>
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={chart || []} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="recv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16A34A" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#16A34A" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="desp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#DC2626" stopOpacity={0.07} />
                    <stop offset="95%" stopColor="#DC2626" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F4F4F5" />
                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#71717A' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#71717A' }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => fmt(v)} contentStyle={{ borderRadius: 10, border: '1px solid #E4E4E7', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} formatter={(value) => <span style={{ color: '#71717A' }}>{value}</span>} />
                <Area type="monotone" dataKey="receita" name="Receita" stroke="#16A34A" strokeWidth={2} fill="url(#recv)" />
                <Area type="monotone" dataKey="despesa" name="Despesa" stroke="#DC2626" strokeWidth={2} fill="url(#desp)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background: '#FFFFFF', borderRadius: 20, border: '1px solid #EAECEF', padding: '20px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#09090B', marginBottom: 2 }}>Novos pacientes</div>
            <div style={{ fontSize: 12, color: '#71717A', marginBottom: 16 }}>Últimos 6 meses</div>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={chart || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F4F4F5" />
                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#71717A' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#71717A' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #E4E4E7', fontSize: 12 }} />
                <Bar dataKey="pacientes" name="Pacientes" fill="#2563EB" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right sidebar */}
        <div style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Atenção agora */}
          <div style={{ background: '#FFFFFF', border: '1px solid #EAECEF', borderRadius: 20, padding: '16px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#71717A', marginBottom: 6 }}>Atenção agora</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#09090B', marginBottom: 2 }}>Agenda de hoje</div>
            <div style={{ fontSize: 12, color: '#71717A', marginBottom: 12 }}>{kpis.agendamentosHoje || 0} agendamentos programados para hoje</div>
            <button onClick={() => navigate('/agenda')} style={{ width: '100%', height: 34, background: '#000000', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 600, color: '#FFFFFF', cursor: 'pointer' }}>
              Ver agenda completa
            </button>
          </div>

          {/* Próximos agendamentos */}
          <div style={{ background: '#FFFFFF', borderRadius: 20, border: '1px solid #EAECEF', padding: '16px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#71717A', marginBottom: 12 }}>
              Próximos agendamentos
            </div>
            {proximos.length === 0 ? (
              <div style={{ fontSize: 13, color: '#71717A', textAlign: 'center', padding: '16px 0' }}>
                Nenhum agendamento próximo
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {proximos.map((a: any) => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #F4F4F5' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <i className="ti ti-user" style={{ fontSize: 14, color: STATUS_COLORS[a.status] || '#71717A' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#09090B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.patient?.name}</div>
                      <div style={{ fontSize: 11, color: '#71717A' }}>{a.plan?.name} · {format(new Date(a.startTime), 'HH:mm')}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#F4F4F5', color: STATUS_COLORS[a.status] || '#71717A', whiteSpace: 'nowrap' }}>
                      {a.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resumo rápido */}
          <div style={{ background: '#FFFFFF', borderRadius: 20, border: '1px solid #EAECEF', padding: '16px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#71717A', marginBottom: 12 }}>Resumo rápido</div>
            {[
              { label: 'Prospects no funil', value: kpis.leadsAtivos, icon: 'ti-layout-kanban', color: '#7C3AED' },
              { label: 'Tarefas pendentes', value: kpis.tasksPendentes, icon: 'ti-checkbox', color: '#7C3AED' },
              { label: 'A receber', value: fmt(kpis.receitaMes || 0), icon: 'ti-cash', color: '#16A34A' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < 2 ? '1px solid #F4F4F5' : 'none' }}>
                <i className={`ti ${item.icon}`} style={{ fontSize: 15, color: item.color }} />
                <span style={{ flex: 1, fontSize: 12, color: '#71717A' }}>{item.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#09090B' }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
