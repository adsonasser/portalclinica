import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { revenueApi } from '../../services/api';
import { SectionLoader } from '../../components/ui/Loader';

// ─── Types ────────────────────────────────────────────────────────────────────

type OppType = 'sessoes_acabando' | 'reativacao' | 'leads_parados' | 'falta_reagendamento' | 'financeiro' | 'upsell';
type Priority = 'alta' | 'media' | 'baixa';

interface Opportunity {
  id: string;
  type: OppType;
  priority: Priority;
  score: number;
  title: string;
  personName: string;
  personType: 'patient' | 'lead';
  reason: string;
  estimatedValue: number;
  suggestedAction: string;
  phone?: string;
  relatedEntityId: string;
  relatedEntityType: string;
}

interface SummaryData {
  aiInsight: { estimatedTotal: number; topRecommendation: string; topCategory: string };
  cards: {
    potentialTotal: number;
    sessoesAcabando: number;
    pacientesSemRetorno: number;
    leadsParados: number;
    faltasSemReagendamento: number;
    financeiroRecuperavel: number;
  };
  opportunities: Opportunity[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_INFO: Record<OppType, { label: string; icon: string; bg: string; color: string }> = {
  sessoes_acabando:    { label: 'Sessões Acabando',   icon: 'ti-refresh',       bg: '#F5F3FF', color: '#7C3AED' },
  reativacao:          { label: 'Reativação',          icon: 'ti-user-heart',    bg: '#EFF6FF', color: '#2563EB' },
  leads_parados:       { label: 'Lead Parado',         icon: 'ti-layout-kanban', bg: '#F5F3FF', color: '#7C3AED' },
  falta_reagendamento: { label: 'Falta/Cancelamento', icon: 'ti-calendar-x',    bg: '#FEF2F2', color: '#DC2626' },
  financeiro:          { label: 'Financeiro',          icon: 'ti-cash',          bg: '#F0FDF4', color: '#16A34A' },
  upsell:              { label: 'Upsell',              icon: 'ti-trending-up',   bg: '#FFFBEB', color: '#D97706' },
};

const PRIORITY_INFO: Record<Priority, { label: string; bg: string; color: string }> = {
  alta:  { label: 'Alta',  bg: '#FEF2F2', color: '#DC2626' },
  media: { label: 'Média', bg: '#FFFBEB', color: '#D97706' },
  baixa: { label: 'Baixa', bg: '#EFF6FF', color: '#2563EB' },
};

const TABS = [
  { key: 'todas',      label: 'Todas' },
  { key: 'alta',       label: 'Alta Prioridade' },
  { key: 'sessoes',    label: 'Sessões Acabando' },
  { key: 'reativacao', label: 'Reativação' },
  { key: 'leads',      label: 'Leads Parados' },
  { key: 'faltas',     label: 'Faltas/Cancel.' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'upsell',     label: 'Upsell' },
];

const TAB_TYPE_MAP: Record<string, OppType | null> = {
  todas: null, alta: null,
  sessoes: 'sessoes_acabando', reativacao: 'reativacao',
  leads: 'leads_parados', faltas: 'falta_reagendamento',
  financeiro: 'financeiro', upsell: 'upsell',
};

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);


// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({
  icon, iconBg, iconColor, label, value, sub, active, onClick,
}: {
  icon: string; iconBg: string; iconColor: string; label: string;
  value: string | number; sub?: string; active?: boolean; onClick?: () => void;
}) {
  return (
    <div onClick={onClick} style={{
      background: '#FFFFFF', borderRadius: 12, cursor: 'pointer',
      border: active ? '1.5px solid #6366F1' : '1px solid #E4E4E7',
      padding: '12px 14px',
      boxShadow: active ? '0 0 0 3px rgba(99,102,241,0.1)' : '0 1px 3px rgba(0,0,0,0.04)',
      transition: 'all .15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className={`ti ${icon}`} style={{ fontSize: 14, color: iconColor }} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 500, color: '#71717A', lineHeight: 1.3 }}>{label}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#09090B', letterSpacing: '-0.4px' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#71717A', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function OpportunityCard({ opp, onIgnore }: { opp: Opportunity; onIgnore: (id: string) => void }) {
  const ti = TYPE_INFO[opp.type];
  const pi = PRIORITY_INFO[opp.priority];

  return (
    <div
      style={{
        background: '#FFFFFF', borderRadius: 10, border: '1px solid #E4E4E7',
        padding: '10px 14px', marginBottom: 6,
        transition: 'background .12s, border-color .12s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.background = '#F9F9F9';
        (e.currentTarget as HTMLElement).style.borderColor = '#D4D4D8';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = '#FFFFFF';
        (e.currentTarget as HTMLElement).style.borderColor = '#E4E4E7';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Avatar */}
        <div style={{
          width: 34, height: 34, borderRadius: 10, background: '#F4F4F5',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, fontSize: 13, fontWeight: 700, color: '#18181B',
        }}>
          {opp.personName.charAt(0).toUpperCase()}
        </div>

        {/* Main info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#09090B' }}>{opp.personName}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '1px 7px', borderRadius: 99, background: ti.bg }}>
              <i className={`ti ${ti.icon}`} style={{ fontSize: 10, color: ti.color }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: ti.color }}>{ti.label}</span>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: pi.bg, color: pi.color, textTransform: 'uppercase', letterSpacing: '.05em' }}>{pi.label}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 11, color: '#71717A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{opp.reason}</span>
            <i className="ti ti-sparkles" style={{ fontSize: 10, color: '#6366F1', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#6366F1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>{opp.suggestedAction}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          {opp.phone && (
            <a href={`https://wa.me/55${opp.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
              style={{ height: 28, width: 28, background: '#22C55E', border: 'none', borderRadius: 8, fontSize: 14, color: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
              <i className="ti ti-brand-whatsapp" />
            </a>
          )}
          <button style={{ height: 28, padding: '0 10px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 11, fontWeight: 500, color: '#09090B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
            <i className="ti ti-checkbox" style={{ fontSize: 12 }} /> Tarefa
          </button>
          {(opp.type === 'sessoes_acabando' || opp.type === 'upsell') && (
            <button style={{ height: 28, padding: '0 10px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 11, fontWeight: 500, color: '#09090B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
              <i className="ti ti-receipt" style={{ fontSize: 12 }} /> Orçamento
            </button>
          )}
          {opp.type === 'falta_reagendamento' && (
            <button style={{ height: 28, padding: '0 10px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 11, fontWeight: 500, color: '#09090B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
              <i className="ti ti-calendar-plus" style={{ fontSize: 12 }} /> Reagendar
            </button>
          )}
          {opp.type === 'financeiro' && (
            <button style={{ height: 28, padding: '0 10px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 11, fontWeight: 500, color: '#09090B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
              <i className="ti ti-cash" style={{ fontSize: 12 }} /> Cobrança
            </button>
          )}
        </div>

        {/* Value */}
        <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 76 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#16A34A' }}>{fmt(opp.estimatedValue)}</div>
          <div style={{ fontSize: 10, color: '#A1A1AA' }}>potencial</div>
        </div>

        {/* Ignore */}
        <button onClick={() => onIgnore(opp.id)}
          style={{ height: 28, width: 28, padding: 0, background: 'transparent', border: 'none', borderRadius: 8, color: '#D4D4D8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'inherit' }}>
          <i className="ti ti-x" style={{ fontSize: 14 }} />
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ReceitaInteligentePage() {
  const [activeTab, setActiveTab] = useState('todas');
  const [filterType, setFilterType] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [ignored, setIgnored] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, refetch } = useQuery<SummaryData>({
    queryKey: ['revenue-intelligence'],
    queryFn: revenueApi.summary,
    staleTime: 120_000,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.opportunities.filter(o => {
      if (ignored.has(o.id)) return false;
      if (activeTab === 'alta') return o.priority === 'alta';
      const typeFilter = TAB_TYPE_MAP[activeTab];
      if (typeFilter && o.type !== typeFilter) return false;
      if (filterType && o.type !== filterType) return false;
      if (filterPriority && o.priority !== filterPriority) return false;
      return true;
    });
  }, [data, activeTab, filterType, filterPriority, ignored]);

  const handleIgnore = (id: string) => setIgnored(prev => new Set([...prev, id]));

  if (isLoading) return <SectionLoader label="Analisando oportunidades..." />;

  if (isError || !data) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <i className="ti ti-alert-circle" style={{ fontSize: 32, color: '#DC2626' }} />
      <div style={{ fontSize: 14, color: '#71717A' }}>Erro ao carregar oportunidades</div>
      <button onClick={() => refetch()} style={{ height: 34, padding: '0 16px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
        Tentar novamente
      </button>
    </div>
  );

  const c = data.cards;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'transparent', fontFamily: "'Inter', system-ui, sans-serif", padding: '10px 14px', gap: 10 }}>

      {/* ── AI Hero Block ── */}
      <div style={{
        flexShrink: 0,
        margin: 0,
        padding: '18px 24px',
        borderRadius: 18,
        background: 'linear-gradient(135deg, #FAFBFF 0%, #F3F4FF 45%, #FAF5FF 100%)',
        border: '1px solid rgba(99,102,241,0.14)',
        boxShadow: '0 2px 12px rgba(99,102,241,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Dot mesh */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.30,
          backgroundImage: 'radial-gradient(circle, rgba(99,102,241,0.09) 1px, transparent 1px)',
          backgroundSize: '28px 28px' }} />
        {/* Aurora orbs */}
        <div style={{ position: 'absolute', top: -40, right: 120, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 60%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -40, right: 30, width: 130, height: 130, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.07) 0%, transparent 60%)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative' }}>
          <div style={{ width: 50, height: 50, borderRadius: 14, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className="ti ti-sparkles" style={{ fontSize: 24, color: '#6366F1' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6366F1', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 3 }}>Assistente Estratégico</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#09090B', letterSpacing: '-0.3px' }}>
              Identifiquei {fmt(data.aiInsight.estimatedTotal)} em oportunidades
            </div>
            <div style={{ fontSize: 12, color: '#71717A', marginTop: 3, lineHeight: 1.4 }}>{data.aiInsight.topRecommendation}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0, position: 'relative' }}>
          <button
            onClick={() => setActiveTab('alta')}
            style={{ height: 36, padding: '0 16px', background: '#6366F1', border: 'none', borderRadius: 20, fontSize: 12, fontWeight: 600, color: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}>
            Ver prioridades
          </button>
          <button
            onClick={() => { setActiveTab('todas'); setFilterType(''); setFilterPriority(''); }}
            style={{ height: 36, padding: '0 16px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 20, fontSize: 12, fontWeight: 500, color: '#6366F1', cursor: 'pointer', fontFamily: 'inherit' }}>
            Ver todas
          </button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
        <SummaryCard icon="ti-refresh" iconBg="#F5F3FF" iconColor="#7C3AED"
          label="Sessões Acabando" value={c.sessoesAcabando} sub="vendas com ≤3 sessões"
          active={activeTab === 'sessoes'} onClick={() => setActiveTab('sessoes')} />
        <SummaryCard icon="ti-user-heart" iconBg="#EFF6FF" iconColor="#2563EB"
          label="Sem Retorno" value={c.pacientesSemRetorno} sub="+30 dias sem agendamento"
          active={activeTab === 'reativacao'} onClick={() => setActiveTab('reativacao')} />
        <SummaryCard icon="ti-layout-kanban" iconBg="#F5F3FF" iconColor="#7C3AED"
          label="Leads Parados" value={c.leadsParados} sub="+14 dias sem atividade"
          active={activeTab === 'leads'} onClick={() => setActiveTab('leads')} />
        <SummaryCard icon="ti-calendar-x" iconBg="#FEF2F2" iconColor="#DC2626"
          label="Faltas/Cancel." value={c.faltasSemReagendamento} sub="sem reagendamento"
          active={activeTab === 'faltas'} onClick={() => setActiveTab('faltas')} />
        <SummaryCard icon="ti-cash" iconBg="#F0FDF4" iconColor="#16A34A"
          label="Fin. Recuperável" value={c.financeiroRecuperavel} sub="cobranças vencidas"
          active={activeTab === 'financeiro'} onClick={() => setActiveTab('financeiro')} />
        <SummaryCard icon="ti-trending-up" iconBg="#FFFBEB" iconColor="#D97706"
          label="Upsell" value={data.opportunities.filter(o => o.type === 'upsell').length} sub="oportunidades de venda"
          active={activeTab === 'upsell'} onClick={() => setActiveTab('upsell')} />
      </div>

      {/* ── Opportunity List ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 0 8px' }}>
        {filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: 12 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="ti ti-circle-check" style={{ fontSize: 28, color: '#16A34A' }} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#09090B' }}>Nenhuma oportunidade encontrada</div>
            <div style={{ fontSize: 13, color: '#71717A', textAlign: 'center' }}>
              Os filtros selecionados não retornaram oportunidades no momento.
            </div>
          </div>
        ) : (
          filtered.map(opp => (
            <OpportunityCard key={opp.id} opp={opp} onIgnore={handleIgnore} />
          ))
        )}
      </div>
    </div>
  );
}
