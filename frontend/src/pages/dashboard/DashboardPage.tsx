import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { dashboardApi } from '../../services/api';
import { SectionLoader } from '../../components/ui/Loader';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Dashboard360 {
  period: { label: string; start: string; end: string };
  faturamento: { total: number; prevPeriod: number; change: number };
  recebido: { recebido: number; aReceber: number; percentRecebido: number };
  ticketMedio: { value: number; prevPeriod: number; change: number };
  novosPacientes: { total: number; prevPeriod: number; change: number };
  conversaoLeads: { percentual: number; ganhos: number; trabalhados: number };
  resultadoOperacional: { valor: number; receita: number; despesas: number };
  pacientesAtivos: { total: number };
  leadsAbertos: { total: number; semRetorno: number };
  sessoesPendentes: { total: number };
  taxaComparecimento: { realizadas: number; faltas: number; cancelamentos: number; percentual: number };
  inadimplencia: { valorVencido: number; qtdRegistros: number };
  estoqueCritico: { total: number };
  funil: {
    etapas: Array<{ status: string; count: number; value: number }>;
    ganhos: number; perdidos: number; taxaConversao: number;
  };
  financeiro: {
    receitaRecebida: number; receitaAReceber: number;
    despesasPagas: number; despesasPrevistas: number; resultado: number;
  };
  producao: {
    realizadas: number; sessoesRealizadas: number;
    porProfissional: Array<{ name: string; consultas: number; sessoes: number }>;
  };
  pacientesRetencao: { novos: number; ativos: number; inativos: number; semRetorno: number };
  alertas: Array<{ type: 'warning' | 'danger' | 'info'; category: string; message: string; count: number }>;
  profissionais: Array<{ id: string; name: string }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

const fmtK = (v: number) =>
  v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : fmt(v);

const ChangePill = ({ change }: { change: number }) => (
  <span style={{
    fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99,
    background: change >= 0 ? '#DCFCE7' : '#FEF2F2',
    color: change >= 0 ? '#16A34A' : '#DC2626',
  }}>
    {change >= 0 ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
  </span>
);

const Badge = ({ label, variant }: {
  label: string | number;
  variant: 'success' | 'warning' | 'danger' | 'info' | 'muted';
}) => {
  const map = {
    success: { bg: '#DCFCE7', color: '#16A34A' },
    warning: { bg: '#FFFBEB', color: '#D97706' },
    danger:  { bg: '#FEF2F2', color: '#DC2626' },
    info:    { bg: '#EFF6FF', color: '#2563EB' },
    muted:   { bg: '#F4F4F5', color: '#71717A' },
  };
  const s = map[variant];
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: s.bg, color: s.color }}>
      {label}
    </span>
  );
};

const STAGE_LABELS: Record<string, string> = {
  NOVO: 'Novo', CONTATADO: 'Contatado', QUALIFICADO: 'Qualificado',
  PROPOSTA: 'Proposta', NEGOCIACAO: 'Negociação',
};
const STAGE_COLORS: Record<string, string> = {
  NOVO: '#A1A1AA', CONTATADO: '#2563EB', QUALIFICADO: '#D97706',
  PROPOSTA: '#7C3AED', NEGOCIACAO: '#16A34A',
};

const card: React.CSSProperties = {
  background: '#FFFFFF', borderRadius: 14, border: '1px solid #E4E4E7',
  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
};

const selStyle: React.CSSProperties = {
  height: 34, padding: '0 14px', border: '1px solid #E4E4E7', borderRadius: 20,
  fontSize: 12, color: '#09090B', background: '#FFFFFF', cursor: 'pointer',
  outline: 'none', fontFamily: 'inherit',
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon, iconBg, iconColor, valueColor, change, onClick }: {
  label: string; value: string | number; sub: React.ReactNode;
  icon: string; iconBg: string; iconColor: string;
  valueColor?: string; change?: number; onClick?: () => void;
}) {
  return (
    <div onClick={onClick} style={{ ...card, padding: '14px 16px', cursor: onClick ? 'pointer' : 'default' }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'; }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className={`ti ${icon}`} style={{ fontSize: 17, color: iconColor }} />
        </div>
        <div style={{ fontSize: 11, fontWeight: 500, color: '#71717A', lineHeight: 1.3 }}>{label}</div>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: valueColor || '#09090B', letterSpacing: '-0.3px', marginBottom: 3 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#71717A', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>{sub}</div>
      {change !== undefined && (
        <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
          <ChangePill change={change} />
          <span style={{ fontSize: 10, color: '#A1A1AA' }}>vs anterior</span>
        </div>
      )}
    </div>
  );
}

function AlertCard({ label, value, sub, icon, iconBg, iconColor, statusBadge, onClick }: {
  label: string; value: string | number; sub: React.ReactNode;
  icon: string; iconBg: string; iconColor: string;
  statusBadge?: React.ReactNode; onClick?: () => void;
}) {
  return (
    <div onClick={onClick} style={{ ...card, padding: '14px 16px', cursor: onClick ? 'pointer' : 'default' }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'; }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className={`ti ${icon}`} style={{ fontSize: 16, color: iconColor }} />
        </div>
        {statusBadge}
      </div>
      <div style={{ fontSize: 10, fontWeight: 500, color: '#71717A', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#09090B', letterSpacing: '-0.4px', marginBottom: 3 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#71717A' }}>{sub}</div>
    </div>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #F4F4F5' }}>
      <i className={`ti ${icon}`} style={{ fontSize: 15, color: '#71717A' }} />
      <span style={{ fontSize: 13, fontWeight: 700, color: '#09090B' }}>{title}</span>
      {subtitle && <span style={{ fontSize: 11, color: '#A1A1AA', marginLeft: 4 }}>{subtitle}</span>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function DashboardPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState('mes_atual');
  const [professionalId, setProfessionalId] = useState('');

  const { data, isLoading, isError, refetch } = useQuery<Dashboard360>({
    queryKey: ['dashboard-360', period, professionalId],
    queryFn: () => dashboardApi.dashboard360({ period, professionalId: professionalId || undefined }),
    staleTime: 60_000,
  });

  const hasFilters = period !== 'mes_atual' || professionalId !== '';

  if (isLoading) return <SectionLoader label="Carregando dashboard..." />;

  if (isError) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <i className="ti ti-alert-circle" style={{ fontSize: 32, color: '#DC2626' }} />
      <div style={{ fontSize: 14, color: '#71717A' }}>Erro ao carregar dados do dashboard</div>
      <button onClick={() => refetch()} style={{ height: 34, padding: '0 16px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
        Tentar novamente
      </button>
    </div>
  );

  const d = data!;
  const maxFunilCount = Math.max(...d.funil.etapas.map(e => e.count), 1);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'transparent', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── Filter bar ── */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px 14px', flexWrap: 'wrap' }}>
        <select value={period} onChange={e => setPeriod(e.target.value)} style={selStyle}>
          <option value="mes_atual">Mês atual</option>
          <option value="mes_anterior">Mês anterior</option>
          <option value="ultimos_7">Últimos 7 dias</option>
          <option value="ultimos_30">Últimos 30 dias</option>
          <option value="ultimos_90">Últimos 90 dias</option>
          <option value="ano_atual">Ano atual</option>
        </select>
        <select value={professionalId} onChange={e => setProfessionalId(e.target.value)} style={selStyle}>
          <option value="">Todos os profissionais</option>
          {d.profissionais.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {hasFilters && (
          <button
            onClick={() => { setPeriod('mes_atual'); setProfessionalId(''); }}
            style={{ height: 34, padding: '0 14px', background: 'transparent', border: '1px solid #E4E4E7', borderRadius: 20, fontSize: 12, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
            <i className="ti ti-x" style={{ fontSize: 11 }} /> Limpar
          </button>
        )}
        <Badge label={d.period.label} variant="muted" />
        {professionalId && <Badge label="Profissional filtrado" variant="info" />}
      </div>

      {/* ── Body (no scroll) ── */}
      <div style={{ flex: 1, minHeight: 0, padding: '0 24px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* ── Row 1: KPI Cards ── */}
        <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
          <KpiCard
            label="Faturamento"
            value={fmt(d.faturamento.total)}
            sub={<><ChangePill change={d.faturamento.change} /> <span>vs anterior</span></>}
            icon="ti-currency-dollar" iconBg="#F0FDF4" iconColor="#16A34A"
            valueColor="#16A34A"
            onClick={() => navigate('/financial')}
          />
          <KpiCard
            label="Recebido"
            value={fmt(d.recebido.recebido)}
            sub={<>A receber: {fmtK(d.recebido.aReceber)} <Badge label={d.recebido.percentRecebido + '%'} variant="info" /></>}
            icon="ti-receipt" iconBg="#F0FDF4" iconColor="#16A34A"
            onClick={() => navigate('/financial')}
          />
          <KpiCard
            label="Ticket Médio"
            value={fmt(d.ticketMedio.value)}
            sub={<><ChangePill change={d.ticketMedio.change} /> <span>vs anterior</span></>}
            icon="ti-chart-bar" iconBg="#F5F3FF" iconColor="#7C3AED"
            onClick={() => navigate('/financial')}
          />
          <KpiCard
            label="Novos Pacientes"
            value={d.novosPacientes.total}
            sub={<><ChangePill change={d.novosPacientes.change} /> <span>vs anterior</span></>}
            icon="ti-user-plus" iconBg="#EFF6FF" iconColor="#2563EB"
            onClick={() => navigate('/patients')}
          />
          <KpiCard
            label="Conversão de Leads"
            value={d.conversaoLeads.percentual + '%'}
            sub={`${d.conversaoLeads.ganhos}/${d.conversaoLeads.trabalhados} leads`}
            icon="ti-target-arrow" iconBg="#F5F3FF" iconColor="#7C3AED"
            onClick={() => navigate('/crm')}
          />
          <KpiCard
            label="Resultado"
            value={fmt(d.resultadoOperacional.valor)}
            sub={`Rec: ${fmtK(d.resultadoOperacional.receita)} · Desp: ${fmtK(d.resultadoOperacional.despesas)}`}
            icon="ti-trending-up"
            iconBg={d.resultadoOperacional.valor >= 0 ? '#F0FDF4' : '#FEF2F2'}
            iconColor={d.resultadoOperacional.valor >= 0 ? '#16A34A' : '#DC2626'}
            valueColor={d.resultadoOperacional.valor >= 0 ? '#16A34A' : '#DC2626'}
            onClick={() => navigate('/financial')}
          />
        </div>

        {/* ── Row 2: Alert Cards ── */}
        <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
          <AlertCard
            label="Pacientes Ativos"
            value={d.pacientesAtivos.total}
            sub="Com plano ou em tratamento"
            icon="ti-users" iconBg="#EFF6FF" iconColor="#2563EB"
            statusBadge={<Badge label="Ativo" variant="success" />}
            onClick={() => navigate('/patients')}
          />
          <AlertCard
            label="Leads em Aberto"
            value={d.leadsAbertos.total}
            sub={d.leadsAbertos.semRetorno > 0 ? `${d.leadsAbertos.semRetorno} sem retorno` : 'Todos em dia'}
            icon="ti-layout-kanban" iconBg="#F5F3FF" iconColor="#7C3AED"
            statusBadge={d.leadsAbertos.semRetorno > 0
              ? <Badge label={d.leadsAbertos.semRetorno + ' atrasados'} variant="danger" />
              : <Badge label="Em dia" variant="success" />}
            onClick={() => navigate('/crm')}
          />
          <AlertCard
            label="Sessões Pendentes"
            value={d.sessoesPendentes.total}
            sub="Vendidas e não agendadas"
            icon="ti-clock" iconBg="#FFFBEB" iconColor="#D97706"
            statusBadge={d.sessoesPendentes.total > 0
              ? <Badge label={d.sessoesPendentes.total} variant="warning" />
              : <Badge label="Ok" variant="success" />}
            onClick={() => navigate('/sessions')}
          />
          <AlertCard
            label="Comparecimento"
            value={d.taxaComparecimento.percentual + '%'}
            sub={`${d.taxaComparecimento.realizadas} real. · ${d.taxaComparecimento.faltas} faltas`}
            icon="ti-calendar-check"
            iconBg={d.taxaComparecimento.percentual >= 70 ? '#F0FDF4' : '#FEF2F2'}
            iconColor={d.taxaComparecimento.percentual >= 70 ? '#16A34A' : '#DC2626'}
            statusBadge={d.taxaComparecimento.percentual >= 70
              ? <Badge label="Boa" variant="success" />
              : <Badge label="Atenção" variant="warning" />}
            onClick={() => navigate('/agenda')}
          />
          <AlertCard
            label="Inadimplência"
            value={fmt(d.inadimplencia.valorVencido)}
            sub={`${d.inadimplencia.qtdRegistros} registros vencidos`}
            icon="ti-alert-triangle" iconBg="#FEF2F2" iconColor="#DC2626"
            statusBadge={d.inadimplencia.valorVencido > 0
              ? <Badge label="Atenção" variant="danger" />
              : <Badge label="Ok" variant="success" />}
            onClick={() => navigate('/financial')}
          />
          <AlertCard
            label="Estoque Crítico"
            value={d.estoqueCritico.total}
            sub="Itens abaixo do mínimo"
            icon="ti-package" iconBg="#FFFBEB" iconColor="#D97706"
            statusBadge={d.estoqueCritico.total > 0
              ? <Badge label={d.estoqueCritico.total + ' itens'} variant="danger" />
              : <Badge label="Ok" variant="success" />}
            onClick={() => navigate('/estoque')}
          />
        </div>

        {/* ── Row 3: Analytics — 5 colunas, ocupa espaço restante ── */}
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1.1fr 1fr 0.9fr 0.9fr 1.1fr', gap: 10 }}>

          {/* A) Funil Comercial */}
          <div style={{ ...card, padding: '14px 16px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <SectionHeader icon="ti-filter-dollar" title="Funil Comercial" />
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
              {d.funil.etapas.map(etapa => (
                <div key={etapa.status} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 0', borderBottom: '1px solid #F9F9F9' }}>
                  <span style={{ width: 70, fontSize: 11, color: '#71717A', flexShrink: 0 }}>
                    {STAGE_LABELS[etapa.status] || etapa.status}
                  </span>
                  <div style={{ flex: 1, height: 5, background: '#F4F4F5', borderRadius: 3 }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      background: STAGE_COLORS[etapa.status] || '#A1A1AA',
                      width: `${Math.max((etapa.count / maxFunilCount) * 100, etapa.count > 0 ? 4 : 0)}%`,
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#09090B', width: 20, textAlign: 'right', flexShrink: 0 }}>{etapa.count}</span>
                  {etapa.value > 0 && (
                    <span style={{ fontSize: 10, color: '#71717A', width: 44, textAlign: 'right', flexShrink: 0 }}>{fmtK(etapa.value)}</span>
                  )}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid #F4F4F5', flexShrink: 0 }}>
              <Badge label={`${d.funil.ganhos} ganhos`} variant="success" />
              <Badge label={`${d.funil.perdidos} perdidos`} variant="danger" />
              <Badge label={`${d.funil.taxaConversao}%`} variant="info" />
            </div>
          </div>

          {/* B) Financeiro Resumido */}
          <div style={{ ...card, padding: '14px 16px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <SectionHeader icon="ti-cash" title="Financeiro" />
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {([
                { label: 'Rec. recebida',   value: d.financeiro.receitaRecebida,   color: '#16A34A', icon: 'ti-arrow-up-circle' },
                { label: 'Rec. a receber',  value: d.financeiro.receitaAReceber,   color: '#2563EB', icon: 'ti-clock' },
                { label: 'Desp. pagas',     value: d.financeiro.despesasPagas,     color: '#DC2626', icon: 'ti-arrow-down-circle' },
                { label: 'Desp. previstas', value: d.financeiro.despesasPrevistas, color: '#D97706', icon: 'ti-calendar-due' },
              ] as Array<{ label: string; value: number; color: string; icon: string }>).map(row => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #F9F9F9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className={`ti ${row.icon}`} style={{ fontSize: 12, color: row.color }} />
                    <span style={{ fontSize: 11, color: '#71717A' }}>{row.label}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: row.color }}>{fmtK(row.value)}</span>
                </div>
              ))}
            </div>
            <div style={{ paddingTop: 8, borderTop: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#09090B' }}>Resultado</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: d.financeiro.resultado >= 0 ? '#16A34A' : '#DC2626' }}>
                  {fmtK(d.financeiro.resultado)}
                </span>
                <Badge label={d.financeiro.resultado >= 0 ? 'Pos.' : 'Neg.'} variant={d.financeiro.resultado >= 0 ? 'success' : 'danger'} />
              </div>
            </div>
          </div>

          {/* C) Produção */}
          <div style={{ ...card, padding: '14px 16px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <SectionHeader icon="ti-activity" title="Produção" />
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexShrink: 0 }}>
              <div style={{ flex: 1, background: '#F4F4F5', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#09090B' }}>{d.producao.realizadas}</div>
                <div style={{ fontSize: 10, color: '#71717A', marginTop: 1 }}>Consultas</div>
              </div>
              <div style={{ flex: 1, background: '#F4F4F5', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#09090B' }}>{d.producao.sessoesRealizadas}</div>
                <div style={{ fontSize: 10, color: '#71717A', marginTop: 1 }}>Sessões</div>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {d.producao.porProfissional.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#A1A1AA', fontSize: 11, padding: '8px 0' }}>Sem dados</div>
              ) : (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '3px 8px', marginBottom: 3 }}>
                    {(['Prof.', 'C', 'S'] as const).map(h => (
                      <span key={h} style={{ fontSize: 10, fontWeight: 600, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</span>
                    ))}
                  </div>
                  {d.producao.porProfissional.map((p, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '3px 8px', padding: '4px 0', borderTop: '1px solid #F9F9F9' }}>
                      <span style={{ fontSize: 11, color: '#09090B', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#2563EB', textAlign: 'right' }}>{p.consultas}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#7C3AED', textAlign: 'right' }}>{p.sessoes}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* D) Pacientes e Retenção */}
          <div style={{ ...card, padding: '14px 16px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <SectionHeader icon="ti-heart-handshake" title="Pacientes" />
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {([
                { label: 'Novos',        value: d.pacientesRetencao.novos,      variant: 'info' as const,    icon: 'ti-user-plus' },
                { label: 'Ativos',       value: d.pacientesRetencao.ativos,     variant: 'success' as const, icon: 'ti-users' },
                { label: 'Inativos',     value: d.pacientesRetencao.inativos,   variant: 'muted' as const,   icon: 'ti-user-minus' },
                { label: 'Sem retorno',  value: d.pacientesRetencao.semRetorno, variant: 'danger' as const,  icon: 'ti-user-exclamation' },
              ] as Array<{ label: string; value: number; variant: 'info' | 'success' | 'muted' | 'danger'; icon: string }>).map(row => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: '#FAFAFA' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <i className={`ti ${row.icon}`} style={{ fontSize: 13, color: '#71717A' }} />
                    <span style={{ fontSize: 12, color: '#18181B' }}>{row.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#09090B' }}>{row.value}</span>
                    <Badge label={row.label.split(' ')[0]} variant={row.variant} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* E) Alertas Inteligentes */}
          <div style={{ ...card, padding: '14px 16px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <SectionHeader icon="ti-bell" title="Alertas" subtitle={d.alertas.length > 0 ? `${d.alertas.length}` : undefined} />
            {d.alertas.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#71717A' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ti ti-circle-check" style={{ fontSize: 20, color: '#16A34A' }} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#16A34A', textAlign: 'center' }}>Nenhum alerta</div>
                <div style={{ fontSize: 11, color: '#A1A1AA', textAlign: 'center' }}>Operação normal</div>
              </div>
            ) : (
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {d.alertas.map((alerta, i) => {
                  const styles = {
                    warning: { bg: '#FFFBEB', border: '#FDE68A', icon: 'ti-alert-triangle', iconColor: '#D97706' },
                    danger:  { bg: '#FEF2F2', border: '#FCA5A5', icon: 'ti-circle-x',       iconColor: '#DC2626' },
                    info:    { bg: '#EFF6FF', border: '#BFDBFE', icon: 'ti-info-circle',     iconColor: '#2563EB' },
                  }[alerta.type];
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: styles.bg, border: `1px solid ${styles.border}`, flexShrink: 0 }}>
                      <i className={`ti ${styles.icon}`} style={{ fontSize: 14, color: styles.iconColor, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 1 }}>{alerta.category}</div>
                        <div style={{ fontSize: 11, color: '#09090B' }}>{alerta.message}</div>
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 800, color: styles.iconColor, flexShrink: 0 }}>{alerta.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
