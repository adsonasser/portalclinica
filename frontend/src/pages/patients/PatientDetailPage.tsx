import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { patientsApi, salesApi, financialApi, sessionsApi, agendaApi, prontuarioApi, conversationsApi } from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { NovaVendaModal } from '../../components/NovaVendaModal';

const STATUS_BADGE: Record<string, { bg: string; color: string; dot: string; label: string }> = {
  ATIVO:         { bg: '#DCFCE7', color: '#16A34A', dot: '#22C55E', label: 'Ativo' },
  INATIVO:       { bg: '#F4F4F5', color: '#71717A', dot: '#A1A1AA', label: 'Inativo' },
  EM_TRATAMENTO: { bg: '#EFF6FF', color: '#2563EB', dot: '#3B82F6', label: 'Em tratamento' },
  SEM_RETORNO:   { bg: '#FEF2F2', color: '#DC2626', dot: '#EF4444', label: 'Sem retorno' },
  EM_RISCO:      { bg: '#FEF2F2', color: '#DC2626', dot: '#EF4444', label: 'Em risco' },
  NOVO:          { bg: '#F4F4F5', color: '#71717A', dot: '#A1A1AA', label: 'Novo' },
};

const CONTACT_TYPE: Record<string, { label: string; bg: string; color: string }> = {
  PACIENTE:    { label: 'Paciente',    bg: '#EFF6FF', color: '#2563EB' },
  RESPONSAVEL: { label: 'Responsável', bg: '#F0FDF4', color: '#16A34A' },
  ACOMPANHANTE:{ label: 'Acompanhante',bg: '#FEF9C3', color: '#A16207' },
  LEAD:        { label: 'Lead',        bg: '#F5F3FF', color: '#7C3AED' },
  OUTROS:      { label: 'Outros',      bg: '#F4F4F5', color: '#71717A' },
};

const TABS = ['Resumo', 'Sessões', 'Financeiro', 'Agendamentos', 'Documentos', 'Histórico'];

const SOURCE_LABEL: Record<string, string> = {
  instagram: 'Instagram', indicacao: 'Indicação',
  google: 'Google', site: 'Site', outro: 'Outro',
};

function InfoRow({ icon, label, value }: { icon: string; label: string; value?: string | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid #F4F4F5' }}>
      <i className={`ti ${icon}`} style={{ fontSize: 14, color: '#A1A1AA', marginTop: 1, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: '#A1A1AA', marginBottom: 1 }}>{label}</div>
        <div style={{ fontSize: 13, color: value ? '#191C1D' : '#C4C4C4', fontStyle: value ? 'normal' : 'italic' }}>
          {value || 'Não informado'}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4, marginTop: 16 }}>
      {title}
    </div>
  );
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}




// ─── PatientDetailPage ────────────────────────────────────────────────────────

const EDIT_TABS = ['Dados pessoais', 'Contato', 'Endereço', 'Cadastro e origem', 'Informações importantes', 'Observações'];

const inp: React.CSSProperties = { width: '100%', height: 38, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 9, fontSize: 13, color: '#191C1D', background: '#FFFFFF', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: '#71717A', marginBottom: 5 };
const sel: React.CSSProperties = { ...inp, height: 38, cursor: 'pointer' };
const ta: React.CSSProperties  = { ...inp, height: 'auto', padding: '8px 12px', resize: 'vertical', lineHeight: 1.5 };

function ELabel({ children }: { children: React.ReactNode }) {
  return <label style={lbl}>{children}</label>;
}
function EGrid({ cols, children }: { cols?: number; children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols ?? 2}, 1fr)`, gap: 14 }}>{children}</div>;
}
function ESection({ title }: { title: string }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid #F4F4F5', marginTop: 4 }}>{title}</div>;
}

// ─── Financeiro Tab ───────────────────────────────────────────────────────────

function FinanceiroTab({ patient }: { patient: any }) {
  const qc = useQueryClient();

  const [filter, setFilter] = useState('Todos');
  const [showNovaVenda, setShowNovaVenda] = useState(false);

  const [receiveDrawerOpen, setReceiveDrawerOpen] = useState(false);
  const [receivingSale, setReceivingSale] = useState<any>(null);
  const [receiveAmount, setReceiveAmount] = useState('');
  const [receiveMethodId, setReceiveMethodId] = useState('');
  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [receiveGenerateSessions, setReceiveGenerateSessions] = useState(true);

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ['patient-sales', patient.id],
    queryFn: () => salesApi.list({ patientId: patient.id }),
  });
  const { data: paymentMethods = [] } = useQuery({ queryKey: ['payment-methods'], queryFn: () => financialApi.paymentMethods() });

  const receiveMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => salesApi.receive(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patient-sales', patient.id] });
      qc.invalidateQueries({ queryKey: ['patient', patient.id] });
      setReceiveDrawerOpen(false);
      setReceivingSale(null);
    },
  });

  const genMut = useMutation({
    mutationFn: (id: string) => salesApi.generateSessions(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patient-sales', patient.id] });
      qc.invalidateQueries({ queryKey: ['patient', patient.id] });
    },
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => salesApi.updateStatus(id, 'CANCELLED'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patient-sales', patient.id] }),
  });

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const SALE_STATUS: Record<string, { label: string; bg: string; color: string }> = {
    PENDING:   { label: 'Não recebido', bg: '#F4F4F5', color: '#71717A' },
    PARTIAL:   { label: 'Parcial',      bg: '#FFFBEB', color: '#D97706' },
    PAID:      { label: 'Pago',         bg: '#DCFCE7', color: '#16A34A' },
    CANCELLED: { label: 'Cancelado',    bg: '#FEF2F2', color: '#DC2626' },
  };
  const TYPE_COLORS: Record<string, { label: string; bg: string; color: string }> = {
    ORCAMENTO: { label: 'Orçamento', bg: '#EFF6FF', color: '#2563EB' },
    VENDA:     { label: 'Venda',     bg: '#F0FDF4', color: '#16A34A' },
  };

  const getSessionsLabel = (sale: any) => {
    const plan = sale.items?.[0]?.plan;
    if (!plan || plan.sessionsTotal === 0) return { label: 'Não gera', bg: '#F4F4F5', color: '#A1A1AA' };
    const ss = sale.sessions || [];
    if (ss.length === 0) return { label: 'Não geradas', bg: '#FEF2F2', color: '#DC2626' };
    const done = ss.filter((s: any) => s.sessionStatus === 'REALIZADO' || s.attended).length;
    if (done === ss.length) return { label: 'Concluído', bg: '#DCFCE7', color: '#16A34A' };
    if (done > 0) return { label: `${done}/${ss.length} realizadas`, bg: '#FFFBEB', color: '#D97706' };
    return { label: `${ss.length} geradas`, bg: '#F0FDFA', color: '#0D9488' };
  };

  const filteredSales = (sales as any[]).filter(s => {
    if (filter === 'Orçamentos') return s.saleType === 'ORCAMENTO';
    if (filter === 'Vendas') return s.saleType === 'VENDA';
    if (filter === 'Em aberto') return s.status === 'PENDING';
    if (filter === 'Parcial') return s.status === 'PARTIAL';
    if (filter === 'Pago') return s.status === 'PAID';
    if (filter === 'Cancelado') return s.status === 'CANCELLED';
    return true;
  });

  const handleReceive = () => {
    if (!receivingSale || !receiveAmount) return;
    const plan = receivingSale.items?.[0]?.plan;
    receiveMut.mutate({
      id: receivingSale.id,
      data: {
        amount: parseFloat(receiveAmount),
        paymentMethodId: receiveMethodId || null,
        paymentDate: receiveDate || null,
        generateSessions: receiveGenerateSessions && (plan?.sessionsTotal ?? 0) > 0 && (receivingSale.sessions?.length ?? 0) === 0,
      },
    });
  };

  const FILTERS = ['Todos', 'Orçamentos', 'Vendas', 'Em aberto', 'Parcial', 'Pago', 'Cancelado'];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#191C1D' }}>Financeiro do paciente</div>
          <div style={{ fontSize: 12, color: '#71717A', marginTop: 2 }}>Controle orçamentos, vendas, recebimentos e saldos em aberto deste paciente.</div>
        </div>
        <button onClick={() => setShowNovaVenda(true)}
          style={{ height: 34, padding: '0 14px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#FFF', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <i className="ti ti-plus" style={{ fontSize: 13 }} /> Novo atendimento / orçamento
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 14 }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ height: 28, padding: '0 12px', borderRadius: 99, fontSize: 12, fontWeight: filter === f ? 600 : 400, background: filter === f ? '#000' : '#FFFFFF', color: filter === f ? '#FFF' : '#71717A', border: filter === f ? 'none' : '1px solid #E4E4E7', cursor: 'pointer', fontFamily: 'inherit' }}>
            {f}
          </button>
        ))}
      </div>

      {/* Tabela */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ width: 20, height: 20, border: '2.5px solid #000', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 8px' }} />
          <div style={{ fontSize: 12, color: '#71717A' }}>Carregando...</div>
        </div>
      ) : filteredSales.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 0' }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <i className="ti ti-cash-off" style={{ fontSize: 24, color: '#A1A1AA' }} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#09090B', marginBottom: 4 }}>
            {filter === 'Todos' ? 'Nenhuma venda ou orçamento' : `Nenhum item — filtro "${filter}"`}
          </div>
          <div style={{ fontSize: 13, color: '#71717A', marginBottom: 16 }}>
            {filter === 'Todos' ? 'Clique em "Novo atendimento / orçamento" para começar.' : 'Tente outro filtro.'}
          </div>
          {filter === 'Todos' && (
            <button onClick={() => setShowNovaVenda(true)}
              style={{ height: 36, padding: '0 16px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#FFF', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <i className="ti ti-plus" style={{ fontSize: 13 }} /> Novo atendimento / orçamento
            </button>
          )}
        </div>
      ) : (
        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E4E4E7', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead>
              <tr style={{ background: '#F4F4F5', borderBottom: '1px solid #E4E4E7' }}>
                {['DATA', 'PROCEDIMENTO', 'VALOR', 'RECEBIDO', 'EM ABERTO', 'TIPO', 'STATUS', 'SESSÕES', 'AÇÕES'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#71717A', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredSales.map((sale: any) => {
                const st = SALE_STATUS[sale.status] || SALE_STATUS.PENDING;
                const tp = TYPE_COLORS[sale.saleType] || TYPE_COLORS.VENDA;
                const sesLabel = getSessionsLabel(sale);
                const paidAmt = sale.paidAmount ?? 0;
                const openAmt = Math.max(0, sale.total - paidAmt);
                const hasPendingSessions = (sale.items?.[0]?.plan?.sessionsTotal ?? 0) > 0 && (sale.sessions?.length ?? 0) === 0 && sale.saleType === 'VENDA';
                return (
                  <tr key={sale.id} style={{ borderBottom: '1px solid #F4F4F5' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F9F9F9'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: '#71717A', whiteSpace: 'nowrap' }}>
                      {format(new Date(sale.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#09090B', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sale.items?.[0]?.name || 'Procedimento'}
                      </div>
                      {sale.notes && <div style={{ fontSize: 11, color: '#A1A1AA', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sale.notes}</div>}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: '#09090B', whiteSpace: 'nowrap' }}>{fmt(sale.total)}</td>
                    <td style={{ padding: '12px 14px', fontSize: 13, color: paidAmt > 0 ? '#16A34A' : '#A1A1AA', whiteSpace: 'nowrap' }}>{fmt(paidAmt)}</td>
                    <td style={{ padding: '12px 14px', fontSize: 13, color: openAmt > 0 ? '#D97706' : '#A1A1AA', whiteSpace: 'nowrap' }}>{fmt(openAmt)}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: tp.bg, color: tp.color }}>{tp.label}</span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: st.bg, color: st.color }}>{st.label}</span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 99, background: sesLabel.bg, color: sesLabel.color }}>{sesLabel.label}</span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {sale.status !== 'PAID' && sale.status !== 'CANCELLED' && (
                          <button onClick={() => { setReceivingSale(sale); setReceiveAmount(String(openAmt)); setReceiveDrawerOpen(true); }}
                            style={{ height: 26, padding: '0 10px', background: '#000', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#FFF', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                            Receber
                          </button>
                        )}
                        {hasPendingSessions && (
                          <button onClick={() => genMut.mutate(sale.id)} disabled={genMut.isPending}
                            style={{ height: 26, padding: '0 10px', background: '#F0FDFA', border: '1px solid #CCFBF1', borderRadius: 6, fontSize: 11, fontWeight: 500, color: '#0D9488', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                            Gerar sessões
                          </button>
                        )}
                        {sale.status !== 'CANCELLED' && (
                          <button onClick={() => { if (window.confirm('Cancelar esta venda? Esta ação não pode ser desfeita.')) cancelMut.mutate(sale.id); }}
                            style={{ height: 26, padding: '0 10px', background: 'transparent', border: '1px solid #E4E4E7', borderRadius: 6, fontSize: 11, color: '#DC2626', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
                            <i className="ti ti-x" style={{ fontSize: 11 }} /> Cancelar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal: Nova venda / Orçamento ── */}
      {showNovaVenda && (
        <NovaVendaModal
          prefilledPatientId={patient.id}
          prefilledPatientName={patient.name}
          onClose={() => setShowNovaVenda(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['patient-sales', patient.id] });
            qc.invalidateQueries({ queryKey: ['patient', patient.id] });
          }}
        />
      )}

      {/* ── Drawer: Registrar Recebimento ── */}
      {receiveDrawerOpen && receivingSale && (
        <>
          <div onClick={() => { setReceiveDrawerOpen(false); setReceivingSale(null); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 700, backdropFilter: 'blur(3px)' }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 460, background: '#F8F9FA', zIndex: 701, display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 60px rgba(0,0,0,.16)', fontFamily: "'Inter', system-ui, sans-serif", animation: 'slideInFin .25s cubic-bezier(0.32,0.72,0,1)' }}>
            <div style={{ flexShrink: 0, background: '#FFFFFF', borderBottom: '1px solid #E5E7EB', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#191C1D' }}>Registrar recebimento</div>
                <div style={{ fontSize: 12, color: '#71717A', marginTop: 2 }}>{receivingSale.items?.[0]?.name} — {fmt(receivingSale.total)}</div>
              </div>
              <button onClick={() => { setReceiveDrawerOpen(false); setReceivingSale(null); }} style={{ width: 32, height: 32, border: 'none', background: '#F4F4F5', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A' }}>
                <i className="ti ti-x" style={{ fontSize: 14 }} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              <div style={{ marginBottom: 16, padding: '12px 16px', background: '#F4F4F5', borderRadius: 8 }}>
                {[
                  { label: 'Valor total', val: fmt(receivingSale.total), color: '#09090B' },
                  { label: 'Já recebido', val: fmt(receivingSale.paidAmount ?? 0), color: '#16A34A' },
                  { label: 'Em aberto', val: fmt(Math.max(0, receivingSale.total - (receivingSale.paidAmount ?? 0))), color: '#D97706' },
                ].map((row, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#71717A', marginBottom: i < 2 ? 4 : 0, paddingTop: i === 2 ? 6 : 0, borderTop: i === 2 ? '1px solid #E4E4E7' : 'none', marginTop: i === 2 ? 4 : 0 }}>
                    <span>{row.label}</span><span style={{ fontWeight: 600, color: row.color }}>{row.val}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Valor a receber agora *</label>
                <input type="number" min="0" value={receiveAmount} onChange={e => setReceiveAmount(e.target.value)}
                  style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, color: '#09090B', background: '#FFFFFF', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Forma de pagamento</label>
                <select value={receiveMethodId} onChange={e => setReceiveMethodId(e.target.value)}
                  style={{ width: '100%', height: 38, padding: '0 10px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, color: '#09090B', background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <option value="">Não informado</option>
                  {(paymentMethods as any[]).map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Data do recebimento</label>
                <input type="date" value={receiveDate} onChange={e => setReceiveDate(e.target.value)}
                  style={{ height: 38, padding: '0 10px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, color: '#09090B', background: '#FFFFFF', fontFamily: 'inherit' }} />
              </div>
              {(receivingSale.items?.[0]?.plan?.sessionsTotal ?? 0) > 0 && (receivingSale.sessions?.length ?? 0) === 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                    Criar as {receivingSale.items[0].plan.sessionsTotal} sessões agora?
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[{ v: true, label: 'Gerar sessões' }, { v: false, label: 'Gerar depois' }].map(opt => (
                      <button key={String(opt.v)} onClick={() => setReceiveGenerateSessions(opt.v)}
                        style={{ flex: 1, height: 34, background: receiveGenerateSessions === opt.v ? (opt.v ? '#000' : '#F4F4F5') : '#FFFFFF', border: `1px solid ${receiveGenerateSessions === opt.v ? '#000' : '#E4E4E7'}`, borderRadius: 8, fontSize: 12, fontWeight: receiveGenerateSessions === opt.v ? 600 : 400, color: receiveGenerateSessions === opt.v ? (opt.v ? '#FFF' : '#191C1D') : '#71717A', cursor: 'pointer', fontFamily: 'inherit' }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div style={{ flexShrink: 0, padding: '14px 24px', borderTop: '1px solid #E4E4E7', background: '#FFFFFF', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setReceiveDrawerOpen(false); setReceivingSale(null); }} style={{ height: 38, padding: '0 16px', background: '#F4F4F5', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancelar
              </button>
              <button onClick={handleReceive} disabled={receiveMut.isPending || !receiveAmount}
                style={{ height: 38, padding: '0 20px', background: receiveMut.isPending || !receiveAmount ? '#A1A1AA' : '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#FFF', cursor: receiveMut.isPending || !receiveAmount ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                {receiveMut.isPending ? <><div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Registrando...</> : 'Registrar recebimento'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sessões Tab — tipos, helpers e componentes ───────────────────────────────

type PtSessStatus = 'a_agendar'|'agendada'|'confirmada'|'em_atendimento'|'realizada'|'faltou'|'cancelada'|'reagendada'|'vencida'|'suspensa';
type PtPkgStatus  = 'ativo'|'concluido'|'vencido'|'suspenso'|'cancelado'|'atencao';

interface PtSess {
  id:string; saleId:string|null; procedimento:string; nome:string; status:PtSessStatus;
  data:string; isoDate:string|null; profissional:string; professionalId:string|null;
  duracaoDefault:number|null; salaDefault:string|null; sessionNumber:number; totalSessoes:number;
  saleCreatedAt:string|null;
}
interface PtPkgItem { id:string; nome:string; status:PtSessStatus; data:string; profissional:string; }
interface PtPkg {
  id:string; procedimento:string; contratadas:number; realizadas:number; restantes:number;
  status:PtPkgStatus; venda:string; dataContratacao:string; sessoes:PtPkgItem[];
}

const PT_S: Record<PtSessStatus,{bg:string;color:string;label:string}> = {
  a_agendar:     {bg:'#EFF6FF',color:'#2563EB',label:'Aguardando agendamento'},
  agendada:      {bg:'#F5F3FF',color:'#7C3AED',label:'Agendada'},
  confirmada:    {bg:'#DCFCE7',color:'#15803D',label:'Confirmada'},
  em_atendimento:{bg:'#DBEAFE',color:'#1D4ED8',label:'Em atendimento'},
  realizada:     {bg:'#DCFCE7',color:'#16A34A',label:'Realizada'},
  faltou:        {bg:'#FEF2F2',color:'#B91C1C',label:'Faltou'},
  cancelada:     {bg:'#F4F4F5',color:'#71717A',label:'Cancelada'},
  reagendada:    {bg:'#FFF7ED',color:'#C2410C',label:'Reagendada'},
  vencida:       {bg:'#FEF2F2',color:'#DC2626',label:'Vencida'},
  suspensa:      {bg:'#FEFCE8',color:'#A16207',label:'Suspensa'},
};
const PT_P: Record<PtPkgStatus,{bg:string;color:string;dot:string;label:string}> = {
  ativo:    {bg:'#DCFCE7',color:'#16A34A',dot:'#22C55E',label:'Ativo'},
  concluido:{bg:'#EFF6FF',color:'#2563EB',dot:'#3B82F6',label:'Concluído'},
  vencido:  {bg:'#FEF2F2',color:'#DC2626',dot:'#EF4444',label:'Vencido'},
  suspenso: {bg:'#FEFCE8',color:'#A16207',dot:'#F59E0B',label:'Suspenso'},
  cancelado:{bg:'#F4F4F5',color:'#71717A',dot:'#A1A1AA',label:'Cancelado'},
  atencao:  {bg:'#FFFBEB',color:'#D97706',dot:'#F59E0B',label:'Atenção'},
};
const PT_SMAP:Record<string,PtSessStatus> = {
  A_AGENDAR:'a_agendar',AGENDADA:'agendada',CONFIRMADA:'confirmada',EM_ATENDIMENTO:'em_atendimento',
  REALIZADA:'realizada',FALTOU:'faltou',CANCELADA:'cancelada',REAGENDADA:'reagendada',VENCIDA:'vencida',SUSPENSA:'suspensa',
};
const PT_ROOMS=['Sala 01','Sala 02','Enfermagem','Online'];
const PT_HH=44, PT_DS=7*60;
const PT_HL=Array.from({length:14},(_,i)=>7+i);
function ptTM(t:string){const[h,m]=t.split(':').map(Number);return h*60+m;}
function ptMS(m:number){return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;}
function ptBT(s:number){return Math.max(0,(s-PT_DS)/60*PT_HH);}
function ptBH(s:number,e:number){return Math.max(20,(Math.min(e,PT_DS+13*60)-Math.max(s,PT_DS))/60*PT_HH);}

function mapPtSess(raw:any,countBySale:Map<string,number>):PtSess{
  const status=PT_SMAP[raw.sessionStatus]??'a_agendar';
  const isS=status!=='a_agendar';
  const total=raw.plan?.sessionsTotal??countBySale.get(raw.saleId)??1;
  return {
    id:raw.id,saleId:raw.saleId??null,procedimento:raw.plan?.name??'—',
    nome:`Aplicação ${raw.sessionNumber}/${total}`,status,
    data:isS&&raw.date?new Date(raw.date).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—',
    isoDate:isS?raw.date:null,profissional:raw.professional?.user?.name??'—',
    professionalId:raw.professionalId??null,duracaoDefault:raw.plan?.duracaoPadrao??null,
    salaDefault:raw.plan?.salaPadrao??null,sessionNumber:raw.sessionNumber,totalSessoes:total,
    saleCreatedAt:raw.sale?.createdAt??null,
  };
}

function PtMiniCal({value,onChange,busyDates}:{value:string;onChange:(d:string)=>void;busyDates:Set<string>}){
  const todayStr=new Date().toISOString().slice(0,10);
  const[vy,setVy]=useState(()=>value?parseInt(value.slice(0,4)):new Date().getFullYear());
  const[vm,setVm]=useState(()=>value?parseInt(value.slice(5,7))-1:new Date().getMonth());
  const fd=new Date(vy,vm,1).getDay(),dim=new Date(vy,vm+1,0).getDate();
  const mlbl=new Date(vy,vm,1).toLocaleString('pt-BR',{month:'long',year:'numeric'});
  const cells:(number|null)[]=[];
  for(let i=0;i<fd;i++)cells.push(null);
  for(let d=1;d<=dim;d++)cells.push(d);
  while(cells.length%7!==0)cells.push(null);
  function prev(){if(vm===0){setVy(y=>y-1);setVm(11);}else setVm(m=>m-1);}
  function next(){if(vm===11){setVy(y=>y+1);setVm(0);}else setVm(m=>m+1);}
  function ds(d:number){return `${vy}-${String(vm+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
  return(
    <div style={{background:'#FFFFFF',border:'1px solid #E4E4E7',borderRadius:12,padding:'10px 12px',userSelect:'none'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
        <button onClick={prev} style={{width:26,height:26,border:'none',background:'#F4F4F5',borderRadius:6,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><i className="ti ti-chevron-left" style={{fontSize:12,color:'#374151'}}/></button>
        <span style={{fontSize:13,fontWeight:600,color:'#09090B',textTransform:'capitalize'}}>{mlbl}</span>
        <button onClick={next} style={{width:26,height:26,border:'none',background:'#F4F4F5',borderRadius:6,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><i className="ti ti-chevron-right" style={{fontSize:12,color:'#374151'}}/></button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:2}}>
        {['D','S','T','Q','Q','S','S'].map((d,i)=><div key={i} style={{textAlign:'center',fontSize:10,fontWeight:600,color:'#A1A1AA',padding:'2px 0'}}>{d}</div>)}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2}}>
        {cells.map((day,i)=>{
          if(day===null)return<div key={i}/>;
          const d=ds(day),sel=d===value,isT=d===todayStr,bsy=busyDates.has(d),pst=d<todayStr;
          return(
            <button key={i} onClick={()=>!pst&&onChange(d)}
              style={{width:'100%',height:32,border:'none',borderRadius:7,cursor:pst?'default':'pointer',background:sel?'#000000':isT?'#F4F4F5':'transparent',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:1,padding:0,opacity:pst?0.35:1}}>
              <span style={{fontSize:12,fontWeight:sel||isT?600:400,color:sel?'#FFFFFF':'#09090B',lineHeight:1}}>{day}</span>
              {bsy&&!sel&&<span style={{width:4,height:4,borderRadius:'50%',background:'#2563EB',display:'block'}}/>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PtAgendarPanel({sess,allSess,patientId,onClose,onSaved}:{sess:PtSess;allSess:PtSess[];patientId:string;onClose:()=>void;onSaved:()=>void;}){
  const now=new Date();now.setMinutes(0,0,0);now.setHours(now.getHours()+1);
  const defS=`${String(now.getHours()).padStart(2,'0')}:00`;
  const defE=ptMS(now.getHours()*60+(sess.duracaoDefault??60));
  const[date,setDate]=useState('');
  const[st,setSt]=useState(defS);
  const[et,setEt]=useState(defE);
  const[room,setRoom]=useState(sess.salaDefault??PT_ROOMS[0]);
  const[notes,setNotes]=useState('');
  const[profId,setProfId]=useState(sess.professionalId??'');
  const[error,setError]=useState('');
  const qc=useQueryClient();
  const busyDates=useMemo(()=>{const s=new Set<string>();for(const ss of allSess){if(ss.isoDate)s.add(ss.isoDate.slice(0,10));}return s;},[allSess]);
  const{data:profs=[]}=useQuery({queryKey:['professionals'],queryFn:()=>agendaApi.professionals()});
  const{data:dayItems=[]}=useQuery({queryKey:['agenda-day',date],queryFn:()=>agendaApi.list({start:`${date}T00:00:00`,end:`${date}T23:59:59`}),enabled:!!date});
  const sessOnDay=useMemo(()=>allSess.filter(s=>s.isoDate&&s.isoDate.startsWith(date)&&s.id!==sess.id),[allSess,date,sess.id]);
  const tBlocks=useMemo(()=>{
    const b:{startMins:number;endMins:number;label:string;profId?:string;room?:string}[]=[];
    for(const a of dayItems as any[]){const sd=new Date(a.startTime),ed=new Date(a.endTime);b.push({startMins:sd.getHours()*60+sd.getMinutes(),endMins:ed.getHours()*60+ed.getMinutes(),label:a.patient?.name??'Agendamento',profId:a.professionalId??undefined,room:a.room??undefined});}
    for(const s of sessOnDay){if(!s.isoDate)continue;const sd=new Date(s.isoDate),sm=sd.getHours()*60+sd.getMinutes();b.push({startMins:sm,endMins:sm+(s.duracaoDefault??60),label:s.procedimento,profId:s.professionalId??undefined,room:s.salaDefault??undefined});}
    return b;
  },[dayItems,sessOnDay]);
  const selS=date?ptTM(st):null,selE=date?ptTM(et):null;
  const conflict=useMemo(()=>{if(!selS||!selE||selE<=selS)return false;return tBlocks.some(b=>!(selS>=b.endMins||selE<=b.startMins)&&((!!profId&&b.profId===profId)||(!!room&&b.room===room)));},[tBlocks,selS,selE,profId,room]);
  const saveMut=useMutation({
    mutationFn:({id,data}:{id:string;data:any})=>sessionsApi.update(id,data),
    onSuccess:()=>{qc.invalidateQueries({queryKey:['patient',patientId]});onSaved();onClose();},
    onError:()=>setError('Erro ao agendar. Tente novamente.'),
  });
  function save(){
    if(!date){setError('Selecione a data.');return;}
    if(!profId){setError('Selecione o profissional.');return;}
    if(ptTM(et)<=ptTM(st)){setError('Hora fim deve ser maior que início.');return;}
    setError('');
    const[sh,sm]=st.split(':').map(Number);
    saveMut.mutate({id:sess.id,data:{sessionStatus:'AGENDADA',date:new Date(`${date}T${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}:00`).toISOString(),professionalId:profId||undefined,observations:notes||undefined}});
  }
  const inp={width:'100%',height:36,padding:'0 10px',border:'1px solid #E4E4E7',borderRadius:8,fontSize:13,color:'#09090B',background:'#FFFFFF',boxSizing:'border-box' as const,fontFamily:'inherit',outline:'none'};
  const lbl={fontSize:12,fontWeight:500,color:'#71717A',display:'block',marginBottom:4};
  const showP=!!(date&&selS!==null&&selE!==null&&selE>selS);
  return(
    <>
      <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.3)',zIndex:9000,backdropFilter:'blur(3px)'}}/>
      <div style={{position:'fixed',top:0,right:0,bottom:0,width:'min(88vw,1100px)',background:'#FFFFFF',zIndex:9001,boxShadow:'-8px 0 40px rgba(0,0,0,.18)',display:'flex',flexDirection:'column',fontFamily:"'Inter',system-ui,sans-serif",overflow:'hidden'}}>
        <div style={{flexShrink:0,padding:'18px 28px',borderBottom:'1px solid #E4E4E7',display:'flex',alignItems:'center',justifyContent:'space-between',background:'#FFFFFF'}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:38,height:38,borderRadius:10,background:'#EFF6FF',display:'flex',alignItems:'center',justifyContent:'center'}}><i className="ti ti-calendar-plus" style={{fontSize:18,color:'#2563EB'}}/></div>
            <div><div style={{fontSize:16,fontWeight:700,color:'#09090B'}}>Agendar sessão</div><div style={{fontSize:12,color:'#71717A',marginTop:1}}>{sess.nome} · {sess.procedimento}</div></div>
          </div>
          <button onClick={onClose} style={{width:30,height:30,border:'none',background:'#F4F4F5',borderRadius:'50%',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><i className="ti ti-x" style={{fontSize:13,color:'#71717A'}}/></button>
        </div>
        <div style={{flex:1,display:'flex',overflow:'hidden'}}>
          <div style={{width:400,flexShrink:0,borderRight:'1px solid #E4E4E7',display:'flex',flexDirection:'column',overflow:'hidden'}}>
            <div style={{flex:1,overflowY:'auto',padding:'20px 24px',display:'flex',flexDirection:'column',gap:14}}>
              <div><label style={lbl}>Data <span style={{color:'#DC2626'}}>*</span></label><PtMiniCal value={date} onChange={setDate} busyDates={busyDates}/></div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div><label style={lbl}>Hora início</label><input type="time" value={st} onChange={e=>setSt(e.target.value)} style={inp}/></div>
                <div><label style={lbl}>Hora fim</label><input type="time" value={et} onChange={e=>setEt(e.target.value)} style={inp}/></div>
              </div>
              <div><label style={lbl}>Profissional <span style={{color:'#DC2626'}}>*</span></label>
                <select value={profId} onChange={e=>setProfId(e.target.value)} style={{...inp,cursor:'pointer'}}>
                  <option value="">Selecione...</option>
                  {(profs as any[]).map((p:any)=><option key={p.id} value={p.id}>{p.user?.name??p.name}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Sala</label>
                <select value={room} onChange={e=>setRoom(e.target.value)} style={{...inp,cursor:'pointer'}}>
                  {PT_ROOMS.map(r=><option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Observações</label><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="Observações opcionais..." style={{...inp,height:'auto',padding:'8px 10px',resize:'vertical'}}/></div>
              {conflict&&<div style={{padding:'10px 12px',background:'#FFFBEB',border:'1px solid #FCD34D',borderRadius:8,display:'flex',gap:8,alignItems:'flex-start'}}><i className="ti ti-alert-triangle" style={{fontSize:15,color:'#D97706',flexShrink:0}}/><div><div style={{fontSize:12,fontWeight:600,color:'#92400E'}}>Conflito de horário</div><div style={{fontSize:11,color:'#92400E',marginTop:2}}>Profissional ou sala já estão ocupados nesse horário.</div></div></div>}
              {error&&<div style={{padding:'10px 12px',background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:8,fontSize:12,color:'#DC2626'}}>{error}</div>}
            </div>
            <div style={{flexShrink:0,padding:'14px 24px',borderTop:'1px solid #E4E4E7',display:'flex',gap:10,background:'#FAFAFA'}}>
              <button onClick={onClose} style={{flex:1,height:40,border:'1px solid #E4E4E7',background:'#FFFFFF',borderRadius:8,fontSize:13,fontWeight:500,color:'#374151',cursor:'pointer',fontFamily:'inherit'}}>Cancelar</button>
              <button onClick={save} disabled={saveMut.isPending} style={{flex:2,height:40,background:saveMut.isPending?'#A1A1AA':'#000000',border:'none',borderRadius:8,fontSize:13,fontWeight:600,color:'#FFFFFF',cursor:saveMut.isPending?'not-allowed':'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                <i className="ti ti-calendar-check" style={{fontSize:14}}/>{saveMut.isPending?'Agendando...':'Confirmar agendamento'}
              </button>
            </div>
          </div>
          <div style={{flex:1,display:'flex',flexDirection:'column',background:'#F9FAFB',overflow:'hidden'}}>
            <div style={{flexShrink:0,padding:'14px 20px 12px',borderBottom:'1px solid #E4E4E7',background:'#FFFFFF'}}>
              <div style={{fontSize:14,fontWeight:600,color:'#09090B'}}>Agenda do dia</div>
              <div style={{fontSize:11,color:'#71717A',marginTop:2}}>{date?new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'}):'Selecione uma data para ver a agenda'}</div>
            </div>
            {!date?(
              <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,padding:24}}><i className="ti ti-calendar-event" style={{fontSize:40,color:'#E4E4E7'}}/><div style={{fontSize:13,fontWeight:500,color:'#A1A1AA'}}>Selecione uma data</div></div>
            ):(
              <div style={{flex:1,overflowY:'auto',padding:'12px 16px 24px'}}>
                <div style={{position:'relative',height:13*PT_HH+24}}>
                  {PT_HL.map(h=>(
                    <div key={h} style={{position:'absolute',top:(h-7)*PT_HH,left:0,right:0,display:'flex',alignItems:'center',gap:6,pointerEvents:'none'}}>
                      <span style={{fontSize:10,color:'#9CA3AF',width:36,textAlign:'right',flexShrink:0}}>{String(h).padStart(2,'0')}:00</span>
                      <div style={{flex:1,height:1,background:h%2===0?'#E4E4E7':'#F4F4F5'}}/>
                    </div>
                  ))}
                  {tBlocks.map((b,i)=>{const ic=!(selS===null||selE===null||selE<=selS||selS>=b.endMins||selE<=b.startMins)&&((!!profId&&b.profId===profId)||(!!room&&b.room===room));return(
                    <div key={i} style={{position:'absolute',top:ptBT(b.startMins),height:ptBH(b.startMins,b.endMins),left:44,right:4,background:ic?'#FEF2F2':'#EFF6FF',border:`1.5px solid ${ic?'#FCA5A5':'#93C5FD'}`,borderRadius:6,padding:'3px 8px',overflow:'hidden',boxSizing:'border-box'}}>
                      <div style={{fontSize:11,fontWeight:600,color:ic?'#DC2626':'#1D4ED8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{b.label}</div>
                      <div style={{fontSize:10,color:ic?'#EF4444':'#60A5FA'}}>{ptMS(b.startMins)} – {ptMS(b.endMins)}</div>
                    </div>);})}
                  {showP&&selS!==null&&selE!==null&&(
                    <div style={{position:'absolute',top:ptBT(selS),height:ptBH(selS,selE),left:44,right:4,background:conflict?'#FEF2F2':'#DCFCE7',border:`2px dashed ${conflict?'#DC2626':'#16A34A'}`,borderRadius:6,padding:'3px 8px',overflow:'hidden',boxSizing:'border-box',zIndex:2}}>
                      <div style={{fontSize:11,fontWeight:700,color:conflict?'#DC2626':'#15803D'}}>{sess.procedimento}{conflict&&' ⚠'}</div>
                      <div style={{fontSize:10,color:conflict?'#EF4444':'#16A34A'}}>{st} – {et}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function PtFinalizarModal({sessao,patientId,onClose,onSaved}:{sessao:PtPkgItem;patientId:string;onClose:()=>void;onSaved:()=>void;}){
  const[notes,setNotes]=useState('');
  const[materials,setMaterials]=useState('');
  const qc=useQueryClient();
  const saveMut=useMutation({
    mutationFn:async()=>{
      const parts=[`**${sessao.nome}** — Sessão finalizada`];
      if(notes.trim())parts.push(`\nO que foi feito: ${notes.trim()}`);
      if(materials.trim())parts.push(`\nMateriais utilizados: ${materials.trim()}`);
      await prontuarioApi.createEvolution(patientId,{content:parts.join('')});
      await sessionsApi.update(sessao.id,{sessionStatus:'REALIZADA'});
    },
    onSuccess:()=>{qc.invalidateQueries({queryKey:['patient',patientId]});onSaved();onClose();},
  });
  const ta={width:'100%',padding:'8px 12px',border:'1px solid #E4E4E7',borderRadius:8,fontSize:13,color:'#09090B',fontFamily:'inherit',outline:'none',resize:'vertical' as const,boxSizing:'border-box' as const,background:'#FFFFFF'};
  return(
    <>
      <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:9800,backdropFilter:'blur(3px)'}}/>
      <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'min(90vw,520px)',background:'#FFFFFF',borderRadius:20,zIndex:9801,boxShadow:'0 20px 60px rgba(0,0,0,.22)',padding:'24px',fontFamily:"'Inter',system-ui,sans-serif"}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
          <div><div style={{fontSize:16,fontWeight:700,color:'#09090B'}}>Finalizar sessão</div><div style={{fontSize:12,color:'#71717A',marginTop:2}}>{sessao.nome}</div></div>
          <button onClick={onClose} style={{width:30,height:30,border:'1px solid #E4E4E7',background:'#FFFFFF',borderRadius:'50%',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><i className="ti ti-x" style={{fontSize:13,color:'#71717A'}}/></button>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div><label style={{fontSize:12,fontWeight:500,color:'#71717A',display:'block',marginBottom:4}}>O que foi feito <span style={{color:'#DC2626'}}>*</span></label><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} placeholder="Descreva os procedimentos realizados..." style={ta}/></div>
          <div><label style={{fontSize:12,fontWeight:500,color:'#71717A',display:'block',marginBottom:4}}>Materiais utilizados</label><textarea value={materials} onChange={e=>setMaterials(e.target.value)} rows={2} placeholder="Ex: ácido hialurônico 1ml, fios de PDO..." style={ta}/></div>
          {saveMut.isError&&<div style={{padding:'10px 12px',background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:8,fontSize:12,color:'#DC2626'}}>Erro ao finalizar. Tente novamente.</div>}
          <div style={{display:'flex',gap:10,marginTop:4}}>
            <button onClick={onClose} style={{flex:1,height:40,border:'1px solid #E4E4E7',background:'#FFFFFF',borderRadius:8,fontSize:13,fontWeight:500,color:'#374151',cursor:'pointer',fontFamily:'inherit'}}>Cancelar</button>
            <button onClick={()=>saveMut.mutate()} disabled={!notes.trim()||saveMut.isPending}
              style={{flex:2,height:40,background:!notes.trim()||saveMut.isPending?'#A1A1AA':'#000000',border:'none',borderRadius:8,fontSize:13,fontWeight:600,color:'#FFFFFF',cursor:!notes.trim()||saveMut.isPending?'not-allowed':'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
              <i className="ti ti-circle-check" style={{fontSize:14}}/>{saveMut.isPending?'Finalizando...':'Finalizar sessão'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function PtNotesModal({sessao,patientId,onClose}:{sessao:PtPkgItem;patientId:string;onClose:()=>void;}){
  const{data:prontuario}=useQuery({queryKey:['prontuario',patientId],queryFn:()=>prontuarioApi.get(patientId)});
  const notes=useMemo(()=>{
    if(!prontuario?.evolutionNotes)return[];
    return prontuario.evolutionNotes.filter((n:any)=>n.content?.includes(sessao.nome));
  },[prontuario,sessao.nome]);
  return(
    <>
      <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:9800,backdropFilter:'blur(3px)'}}/>
      <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'min(90vw,500px)',background:'#FFFFFF',borderRadius:20,zIndex:9801,boxShadow:'0 20px 60px rgba(0,0,0,.2)',padding:'24px',fontFamily:"'Inter',system-ui,sans-serif"}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
          <div><div style={{fontSize:16,fontWeight:700,color:'#09090B'}}>Anotações da sessão</div><div style={{fontSize:12,color:'#71717A',marginTop:2}}>{sessao.nome}</div></div>
          <button onClick={onClose} style={{width:30,height:30,border:'1px solid #E4E4E7',background:'#FFFFFF',borderRadius:'50%',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><i className="ti ti-x" style={{fontSize:13,color:'#71717A'}}/></button>
        </div>
        {notes.length===0?(
          <div style={{textAlign:'center',padding:'32px 0'}}>
            <i className="ti ti-notes-off" style={{fontSize:32,color:'#D4D4D8',display:'block',marginBottom:10}}/>
            <div style={{fontSize:13,fontWeight:500,color:'#71717A'}}>Nenhuma anotação registrada</div>
            <div style={{fontSize:12,color:'#A1A1AA',marginTop:4}}>Use "Finalizar sessão" para registrar o que foi feito.</div>
          </div>
        ):(
          <div style={{display:'flex',flexDirection:'column',gap:12,maxHeight:360,overflowY:'auto'}}>
            {notes.map((n:any)=>(
              <div key={n.id} style={{background:'#F9FAFB',borderRadius:12,border:'1px solid #F1F3F5',padding:'14px 16px'}}>
                <div style={{fontSize:11,color:'#A1A1AA',marginBottom:8}}>{new Date(n.date).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</div>
                <div style={{fontSize:13,color:'#191C1D',lineHeight:1.6,whiteSpace:'pre-wrap'}}>{n.content.replace(/\*\*/g,'').trim()}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{marginTop:20,display:'flex',justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{height:36,padding:'0 20px',border:'1px solid #E4E4E7',background:'#FFFFFF',borderRadius:8,fontSize:13,fontWeight:500,color:'#374151',cursor:'pointer',fontFamily:'inherit'}}>Fechar</button>
        </div>
      </div>
    </>
  );
}

function PtPkgDrawer({pkg,patientId,allSess,onClose}:{pkg:PtPkg;patientId:string;allSess:PtSess[];onClose:()=>void;}){
  const[agendarSess,setAgendarSess]=useState<PtSess|null>(null);
  const[finalizarItem,setFinalizarItem]=useState<PtPkgItem|null>(null);
  const[notesItem,setNotesItem]=useState<PtPkgItem|null>(null);
  const pkgSt=PT_P[pkg.status];
  const pct=pkg.contratadas>0?Math.round((pkg.realizadas/pkg.contratadas)*100):0;
  const proxima=pkg.sessoes.find(s=>s.status==='a_agendar');
  function handleAgendar(item:PtPkgItem){const full=allSess.find(s=>s.id===item.id);if(full)setAgendarSess(full);}
  return(
    <>
      {agendarSess&&<PtAgendarPanel sess={agendarSess} allSess={allSess} patientId={patientId} onClose={()=>setAgendarSess(null)} onSaved={()=>setAgendarSess(null)}/>}
      {finalizarItem&&<PtFinalizarModal sessao={finalizarItem} patientId={patientId} onClose={()=>setFinalizarItem(null)} onSaved={()=>setFinalizarItem(null)}/>}
      {notesItem&&<PtNotesModal sessao={notesItem} patientId={patientId} onClose={()=>setNotesItem(null)}/>}
      <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.35)',zIndex:300,backdropFilter:'blur(2px)'}}/>
      <div style={{position:'fixed',top:0,right:0,bottom:0,width:'min(92vw,900px)',background:'#FFFFFF',zIndex:301,display:'flex',flexDirection:'column',fontFamily:"'Inter',system-ui,sans-serif",boxShadow:'-8px 0 40px rgba(0,0,0,.13)',animation:'slideIn .2s ease'}}>
        <div style={{flexShrink:0,background:'#FFFFFF',borderBottom:'1px solid #F1F3F5',padding:'20px 24px',display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
          <div><div style={{fontSize:16,fontWeight:700,color:'#191C1D',marginBottom:3}}>Sessões do pacote</div><div style={{fontSize:12,color:'#71717A'}}>{pkg.procedimento}</div></div>
          <button onClick={onClose} style={{width:30,height:30,border:'1px solid #E4E4E7',background:'#FFFFFF',borderRadius:'50%',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#71717A'}}><i className="ti ti-x" style={{fontSize:13}}/></button>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'20px 24px'}}>
          <div style={{background:'#FFFFFF',borderRadius:16,border:'1px solid #EAECEF',padding:'16px 20px',marginBottom:16,boxShadow:'0 2px 8px rgba(0,0,0,0.03)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:700,color:'#191C1D'}}>Progresso do pacote</div>
              <span style={{fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:99,background:pkgSt.bg,color:pkgSt.color,border:`1px solid ${pkgSt.color}20`,display:'inline-flex',alignItems:'center',gap:5}}>
                <span style={{width:5,height:5,borderRadius:'50%',background:pkgSt.dot}}/>{pkgSt.label}
              </span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:14}}>
              {([{label:'Contratadas',value:pkg.contratadas,color:'#374151'},{label:'Realizadas',value:pkg.realizadas,color:'#16A34A'},{label:'Restantes',value:pkg.restantes,color:'#2563EB'}] as const).map(({label,value,color})=>(
                <div key={label} style={{textAlign:'center',padding:'12px 8px',borderRadius:12,background:'rgba(248,249,250,0.7)',border:'1px solid #F1F3F5'}}>
                  <div style={{fontSize:22,fontWeight:700,color,lineHeight:1.1}}>{value}</div>
                  <div style={{fontSize:11,color:'#71717A',marginTop:3}}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}><div style={{fontSize:11,color:'#71717A'}}>Progresso</div><div style={{fontSize:11,fontWeight:600,color:'#191C1D'}}>{pct}%</div></div>
            <div style={{height:6,borderRadius:99,background:'#F1F3F5',overflow:'hidden'}}><div style={{height:'100%',width:`${pct}%`,background:pct===100?'#16A34A':pct>60?'#2563EB':'#D97706',borderRadius:99,transition:'width .3s'}}/></div>
          </div>
          <div style={{background:'#FFFFFF',borderRadius:16,border:'1px solid #EAECEF',overflow:'hidden',boxShadow:'0 2px 8px rgba(0,0,0,0.03)'}}>
            <div style={{padding:'14px 18px',borderBottom:'1px solid #F1F3F5',fontSize:13,fontWeight:700,color:'#191C1D'}}>Sessões do pacote</div>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:'rgba(248,249,250,0.7)'}}>
                  {['Sessão','Status','Data','Profissional','Ação'].map(h=>(
                    <th key={h} style={{padding:'8px 14px',textAlign:'left',fontSize:10,fontWeight:600,color:'#747686',textTransform:'uppercase',letterSpacing:'.05em',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pkg.sessoes.map((s,i)=>{
                  const sst=PT_S[s.status];
                  return(
                    <tr key={i} style={{borderTop:'1px solid #F1F3F5'}}
                      onMouseEnter={e=>(e.currentTarget.style.background='#F8F9FA')}
                      onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                      <td style={{padding:'9px 14px',fontSize:12,fontWeight:500,color:'#374151'}}>{s.nome}</td>
                      <td style={{padding:'9px 14px'}}><span style={{fontSize:10,fontWeight:600,padding:'2px 9px',borderRadius:99,background:sst.bg,color:sst.color,border:`1px solid ${sst.color}20`}}>{sst.label}</span></td>
                      <td style={{padding:'9px 14px',fontSize:11,color:'#747686',whiteSpace:'nowrap'}}>{s.data}</td>
                      <td style={{padding:'9px 14px',fontSize:11,color:'#747686'}}>{s.profissional}</td>
                      <td style={{padding:'9px 14px'}}>
                        {s.status==='a_agendar'?(
                          <button onClick={()=>handleAgendar(s)} style={{height:26,padding:'0 12px',background:'#000',border:'none',borderRadius:99,fontSize:11,fontWeight:600,color:'#fff',cursor:'pointer',fontFamily:'inherit'}}>Agendar</button>
                        ):(s.status==='agendada'||s.status==='confirmada'||s.status==='em_atendimento')?(
                          <button onClick={()=>setFinalizarItem(s)} style={{height:26,padding:'0 12px',background:'#F0FDF4',border:'1px solid #BBF7D0',borderRadius:99,fontSize:11,fontWeight:600,color:'#16A34A',cursor:'pointer',fontFamily:'inherit'}}>Finalizar</button>
                        ):s.status==='realizada'?(
                          <button onClick={()=>setNotesItem(s)} style={{height:26,padding:'0 12px',background:'#F4F4F5',border:'1px solid #E4E4E7',borderRadius:99,fontSize:11,fontWeight:500,color:'#71717A',cursor:'pointer',fontFamily:'inherit'}}>Ver notas</button>
                        ):(
                          <span style={{fontSize:11,color:'#A1A1AA'}}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {proxima&&(
          <div style={{flexShrink:0,background:'#FFFFFF',borderTop:'1px solid #F1F3F5',padding:'14px 24px',display:'flex',gap:8}}>
            <button onClick={()=>handleAgendar(proxima)} style={{height:36,padding:'0 16px',background:'#000',border:'none',borderRadius:99,fontSize:13,fontWeight:600,color:'#fff',cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:6,boxShadow:'0 2px 8px rgba(0,0,0,0.15)'}}>
              <i className="ti ti-calendar-plus" style={{fontSize:13}}/> Agendar próxima
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Sessões Tab ──────────────────────────────────────────────────────────────

function SessoesTab({ patient }: { patient: any }) {
  const rawSessions: any[] = patient.sessions || [];

  const sessions = useMemo(() => {
    const countBySale = new Map<string, number>();
    for (const s of rawSessions) {
      if (s.saleId) countBySale.set(s.saleId, (countBySale.get(s.saleId) ?? 0) + 1);
    }
    return rawSessions.map(s => mapPtSess(s, countBySale));
  }, [rawSessions]);

  const pkgs = useMemo(() => {
    const map = new Map<string, PtSess[]>();
    for (const s of sessions) {
      if (s.saleId) {
        const list = map.get(s.saleId) ?? [];
        list.push(s);
        map.set(s.saleId, list);
      }
    }
    return Array.from(map.entries()).map(([saleId, list]) => {
      const realizadas = list.filter(s => s.status === 'realizada').length;
      const canceladas = list.filter(s => s.status === 'cancelada').length;
      const todasR = realizadas === list.length;
      const algumV = list.some(s => s.status === 'vencida');
      let st: PtPkgStatus = 'ativo';
      if (todasR) st = 'concluido';
      else if (algumV) st = 'atencao';
      else if (canceladas === list.length) st = 'cancelado';
      return {
        id: saleId,
        procedimento: list[0].procedimento,
        contratadas: list.length,
        realizadas,
        restantes: list.length - realizadas - canceladas,
        status: st,
        venda: `#${saleId.slice(-6).toUpperCase()}`,
        dataContratacao: list[0].saleCreatedAt
          ? new Date(list[0].saleCreatedAt).toLocaleDateString('pt-BR')
          : '—',
        sessoes: [...list].sort((a, b) => a.sessionNumber - b.sessionNumber).map(s => ({
          id: s.id, nome: s.nome, status: s.status, data: s.data, profissional: s.profissional,
        })),
      } satisfies PtPkg;
    });
  }, [sessions]);

  const [detailPkgId, setDetailPkgId] = useState<string | null>(null);
  const detailPkg = useMemo(() => pkgs.find(p => p.id === detailPkgId) ?? null, [pkgs, detailPkgId]);

  if (rawSessions.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '56px 0' }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
          <i className="ti ti-activity" style={{ fontSize: 24, color: '#A1A1AA' }} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#09090B', marginBottom: 4 }}>Nenhuma sessão encontrada</div>
        <div style={{ fontSize: 13, color: '#71717A' }}>
          As sessões são criadas automaticamente quando uma venda é registrada na aba <strong>Financeiro</strong>.
        </div>
      </div>
    );
  }

  const COLS = ['Procedimento', 'Contratação', 'Contratadas', 'Realizadas', 'Restantes', 'Status', 'Ações'];

  return (
    <div>
      <style>{`@keyframes slideIn { from { opacity:0; transform:translateX(30px); } to { opacity:1; transform:translateX(0); } }`}</style>

      {detailPkg && (
        <PtPkgDrawer
          pkg={detailPkg}
          patientId={patient.id}
          allSess={sessions}
          onClose={() => setDetailPkgId(null)}
        />
      )}

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#191C1D' }}>Pacotes de sessões</div>
        <div style={{ fontSize: 12, color: '#71717A', marginTop: 2 }}>Sessões geradas automaticamente pelas vendas de procedimentos com pacotes.</div>
      </div>

      <div style={{ background: '#FFFFFF', borderRadius: 20, border: '1px solid #EAECEF', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(248,249,250,0.7)', borderBottom: '1px solid #F1F3F5' }}>
              {COLS.map((h, i) => (
                <th key={h} style={{ padding: '10px 16px', textAlign: (i >= 2 && i <= 4) ? 'center' : i === 6 ? 'right' : 'left', fontSize: 11, fontWeight: 600, color: '#747686', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pkgs.map(p => {
              const st = PT_P[p.status];
              const pct = p.contratadas > 0 ? Math.round((p.realizadas / p.contratadas) * 100) : 0;
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid #F1F3F5' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F8F9FA')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#444654', maxWidth: 200 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.procedimento}</div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#747686', whiteSpace: 'nowrap' }}>{p.dataContratacao}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#374151' }}>{p.contratadas}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#16A34A' }}>{p.realizadas}</span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#2563EB' }}>{p.restantes}</span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 99, background: st.bg, color: st.color, border: `1px solid ${st.color}20`, display: 'inline-flex', alignItems: 'center', gap: 5, width: 'fit-content' }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: st.dot, flexShrink: 0 }} />{st.label}
                      </span>
                      <div style={{ height: 4, borderRadius: 99, background: '#F1F3F5', width: 72, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#16A34A' : pct > 60 ? '#2563EB' : '#D97706', borderRadius: 99 }} />
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button onClick={() => setDetailPkgId(p.id)}
                      style={{ height: 32, padding: '0 14px', background: '#000', border: 'none', borderRadius: 99, fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <i className="ti ti-eye" style={{ fontSize: 12 }} /> Ver sessões
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── PatientDetailPage ────────────────────────────────────────────────────────

export function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('Resumo');
  const [openingWa, setOpeningWa] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<any>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editTab, setEditTab] = useState('Dados pessoais');
  const [editForm, setEditForm] = useState({
    // Aba 1 — Dados pessoais
    name: '', contactType: '', status: '', cpf: '', rg: '',
    birthDate: '', gender: '', profession: '', responsavel: '',
    // Aba 2 — Contato
    phone: '', phoneSecondary: '', email: '', instagram: '',
    canalPreferencial: '', melhorHorario: '',
    // Aba 3 — Endereço
    cep: '', rua: '', numero: '', complemento: '',
    bairro: '', cidade: '', estado: '',
    // Aba 4 — Cadastro e origem
    dataCadastro: '', origem: '', comoConheceu: '', indicadoPor: '',
    obsOrigem: '', responsavelCadastro: '',
    // Aba 5 — Informações importantes
    alergias: '', medicamentos: '', comorbidades: '', objetivo: '',
    obsImportantes: '', atencaoEspecial: '', restricoes: '',
    pacienteVip: 'nao', alertaInterno: '',
    // Aba 6 — Observações
    queixaPrincipal: '', statusTratamento: '', obsGerais: '',
    obsInterna: '', anamnese: 'nao', documentoAnexado: 'nao',
    notes: '',
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Mapeia o formulário para os campos do banco
  const buildPayload = (f: typeof editForm) => {
    const p: Record<string, any> = {
      // Dados pessoais
      name:               f.name                  || undefined,
      status:             f.status                || undefined,
      contactType:        f.contactType           || undefined,
      cpf:                f.cpf                   || null,
      rg:                 f.rg                    || null,
      gender:             f.gender                || null,
      profession:         f.profession            || null,
      responsible:        f.responsavel           || null,
      // Contato
      phone:              f.phone                 || null,
      phoneSecondary:     f.phoneSecondary        || null,
      email:              f.email                 || null,
      instagram:          f.instagram             || null,
      canalPreferencial:  f.canalPreferencial      || null,
      melhorHorario:      f.melhorHorario          || null,
      // Endereço
      zipCode:            f.cep                   || null,
      addressStreet:      f.rua                   || null,
      addressNumber:      f.numero                || null,
      addressComplement:  f.complemento           || null,
      addressNeighborhood:f.bairro                || null,
      city:               f.cidade                || null,
      state:              f.estado                || null,
      address:            [f.rua, f.numero, f.complemento, f.bairro].filter(Boolean).join(', ') || null,
      // Cadastro e origem
      source:             f.origem                || null,
      comoConheceu:       f.comoConheceu          || null,
      indicadoPor:        f.indicadoPor           || null,
      obsOrigem:          f.obsOrigem             || null,
      responsavelCadastro:f.responsavelCadastro   || null,
      // Informações importantes
      alergias:           f.alergias              || null,
      medicamentos:       f.medicamentos          || null,
      comorbidades:       f.comorbidades          || null,
      objetivo:           f.objetivo              || null,
      obsImportantes:     f.obsImportantes        || null,
      atencaoEspecial:    f.atencaoEspecial       || null,
      restricoes:         f.restricoes            || null,
      pacienteVip:        f.pacienteVip === 'sim',
      alertaInterno:      f.alertaInterno         || null,
      // Observações
      queixaPrincipal:    f.queixaPrincipal       || null,
      statusTratamento:   f.statusTratamento      || null,
      obsGerais:          f.obsGerais             || null,
      obsInterna:         f.obsInterna            || null,
      notes:              f.notes                 || null,
    };
    // birthDate: converte string "YYYY-MM-DD" para ISO
    if (f.birthDate) {
      try {
        const d = new Date(f.birthDate + 'T12:00:00'); // hora fixa evita deslocamento de timezone
        if (!isNaN(d.getTime())) p.birthDate = d.toISOString();
      } catch {}
    } else {
      p.birthDate = null;
    }
    return p;
  };

  const updateMut = useMutation({
    mutationFn: (data: any) => patientsApi.update(id!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patient', id] });
      setEditOpen(false);
      setEditSaving(false);
      setEditError('');
      toast('Paciente atualizado com sucesso.', 'success');
    },
    onError: (err: any) => {
      setEditSaving(false);
      const msg = err?.response?.data?.message;
      setEditError(Array.isArray(msg) ? msg.join(', ') : (msg || 'Erro ao salvar. Verifique os dados e tente novamente.'));
    },
  });

  const openEdit = (p: any, tab = 'Dados pessoais') => {
    setEditTab(tab);
    setEditError('');
    // birthDate vem da API como ISO string; o input type=date precisa de YYYY-MM-DD
    let birthDateStr = '';
    if (p.birthDate) {
      try { birthDateStr = new Date(p.birthDate).toISOString().slice(0, 10); } catch {}
    }
    setEditForm({
      // Aba 1
      name:               p.name              || '',
      contactType:        p.contactType       || '',
      status:             p.status            || 'NOVO',
      cpf:                p.cpf               || '',
      rg:                 p.rg                || '',
      birthDate:          birthDateStr,
      gender:             p.gender            || '',
      profession:         p.profession        || '',
      responsavel:        p.responsible       || '',
      // Aba 2
      phone:              p.phone             || '',
      phoneSecondary:     p.phoneSecondary    || '',
      email:              p.email             || '',
      instagram:          p.instagram         || '',
      canalPreferencial:  p.canalPreferencial  || '',
      melhorHorario:      p.melhorHorario      || '',
      // Aba 3 — campos separados
      cep:                p.zipCode           || '',
      rua:                p.addressStreet     || '',
      numero:             p.addressNumber     || '',
      complemento:        p.addressComplement || '',
      bairro:             p.addressNeighborhood || '',
      cidade:             p.city              || '',
      estado:             p.state             || '',
      // Aba 4
      dataCadastro:       p.createdAt ? new Date(p.createdAt).toISOString().slice(0, 10) : '',
      origem:             p.source            || '',
      comoConheceu:       p.comoConheceu      || '',
      indicadoPor:        p.indicadoPor       || '',
      obsOrigem:          p.obsOrigem         || '',
      responsavelCadastro:p.responsavelCadastro || '',
      // Aba 5
      alergias:           p.alergias          || '',
      medicamentos:       p.medicamentos      || '',
      comorbidades:       p.comorbidades      || '',
      objetivo:           p.objetivo          || '',
      obsImportantes:     p.obsImportantes    || '',
      atencaoEspecial:    p.atencaoEspecial   || '',
      restricoes:         p.restricoes        || '',
      pacienteVip:        p.pacienteVip ? 'sim' : 'nao',
      alertaInterno:      p.alertaInterno     || '',
      // Aba 6
      queixaPrincipal:    p.queixaPrincipal   || '',
      statusTratamento:   p.statusTratamento  || '',
      obsGerais:          p.obsGerais         || '',
      obsInterna:         p.obsInterna        || '',
      anamnese:           (p.anamneses?.length > 0) ? 'sim' : 'nao',
      documentoAnexado:   (p.files?.length    > 0) ? 'sim' : 'nao',
      notes:              p.notes             || '',
    });
    setEditOpen(true);
  };

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setEditForm(f => ({ ...f, [field]: e.target.value }));

  const { data: patient, isLoading, isError } = useQuery({
    queryKey: ['patient', id],
    queryFn: () => patientsApi.get(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 28, height: 28, border: '2.5px solid #000', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 10px' }} />
          <div style={{ fontSize: 13, color: '#71717A' }}>Carregando...</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (isError || !patient) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 12 }}>
        <i className="ti ti-user-x" style={{ fontSize: 40, color: '#D4D4D8' }} />
        <div style={{ fontSize: 15, fontWeight: 500, color: '#71717A' }}>Paciente não encontrado</div>
        <button onClick={() => navigate('/patients')} style={{ marginTop: 4, fontSize: 13, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
          ← Voltar para Pacientes
        </button>
      </div>
    );
  }

  const badge  = STATUS_BADGE[patient.status]     || STATUS_BADGE.NOVO;
  const ct     = CONTACT_TYPE[patient.contactType] || CONTACT_TYPE.PACIENTE;
  const initials = patient.name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
  const appointmentCount = patient._count?.appointments ?? 0;
  const sessionCount     = patient._count?.sessions     ?? 0;
  const saleCount        = patient.sales?.length        ?? 0;

  // ── Agendamentos futuros / passados ───────────────────────────────────
  const now = new Date();
  const futureAppts = (patient.appointments || [])
    .filter((a: any) => new Date(a.startTime) > now)
    .sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const pastAppts = (patient.appointments || [])
    .filter((a: any) => new Date(a.startTime) <= now)
    .sort((a: any, b: any) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  const nextAppt = futureAppts[0];
  const lastAppt = pastAppts[0];

  // ── Linha do tempo unificada ───────────────────────────────────────────
  type TimelineEvent = { date: Date; icon: string; color: string; iconBg: string; title: string; sub?: string; responsible?: string };

  const timelineEvents: TimelineEvent[] = [
    {
      date: new Date(patient.createdAt),
      icon: 'ti-user-plus', color: '#2563EB', iconBg: '#EFF6FF',
      title: 'Contato cadastrado',
      sub: `Status inicial: ${badge.label}`,
      responsible: 'Admin',
    },
    // Evento de atualização cadastral (aparece toda vez que o cadastro é editado)
    ...(patient.updatedAt && new Date(patient.updatedAt).getTime() - new Date(patient.createdAt).getTime() > 60000 ? [{
      date: new Date(patient.updatedAt),
      icon: 'ti-edit', color: '#71717A', iconBg: '#F4F4F5',
      title: 'Cadastro atualizado',
      sub: 'Informações do paciente foram atualizadas.',
      responsible: 'Admin',
    }] : []),
    ...(patient.appointments || []).map((a: any) => ({
      date: new Date(a.startTime),
      icon: 'ti-calendar', color: '#7C3AED', iconBg: '#F5F3FF',
      title: `Agendamento — ${a.plan?.name || 'Consulta'}`,
      sub: a.status ? `Status: ${a.status}` : undefined,
      responsible: a.professional?.user?.name || 'Admin',
    })),
    ...(patient.sessions || []).map((s: any) => ({
      date: new Date(s.date),
      icon: 'ti-activity', color: '#16A34A', iconBg: '#F0FDF4',
      title: `Sessão — ${s.plan?.name || 'Procedimento'}`,
      sub: s.notes ? s.notes.slice(0, 80) + (s.notes.length > 80 ? '…' : '') : 'Sessão realizada.',
      responsible: s.professional?.user?.name || 'Admin',
    })),
    ...(patient.sales || []).map((s: any) => ({
      date: new Date(s.createdAt),
      icon: 'ti-cash', color: '#D97706', iconBg: '#FEF9C3',
      title: 'Venda realizada',
      sub: s.total != null ? `Valor: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(s.total)}` : 'Venda registrada.',
      responsible: 'Admin',
    })),
    ...(patient.evolutionNotes || []).map((n: any) => ({
      date: new Date(n.date),
      icon: 'ti-notes', color: '#16A34A', iconBg: '#F0FDF4',
      title: 'Evolução registrada',
      sub: stripHtml(n.content || '').slice(0, 100) || 'Evolução clínica registrada.',
      responsible: 'Dra. Jéssica Rezende',
    })),
    ...(patient.documents || []).map((d: any) => ({
      date: new Date(d.createdAt),
      icon: 'ti-file-text', color: '#0D9488', iconBg: '#F0FDFA',
      title: `Documento gerado — ${d.name}`,
      sub: d.type || 'Documento',
      responsible: d.professional || 'Dra. Jéssica Rezende',
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  // ── Alertas dinâmicos ──────────────────────────────────────────────────
  const alerts: string[] = [];
  if (!patient.phone)                              alerts.push('Sem telefone cadastrado');
  if ((patient.anamneses?.length ?? 0) === 0)      alerts.push('Sem anamnese preenchida');
  if (futureAppts.length === 0)                    alerts.push('Nenhum agendamento futuro');
  if ((patient.files?.length ?? 0) === 0)          alerts.push('Nenhum documento anexado');

  return (
    <>
    <div style={{ display: 'flex', gap: 20, padding: '24px 28px', fontFamily: "'Inter', system-ui, sans-serif", alignItems: 'flex-start', minHeight: '100%' }}>

      {/* ── Coluna esquerda ─────────────────────────────────────────── */}
      <div style={{ width: 268, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
        <div style={{ background: '#FFFFFF', borderRadius: 20, border: '1px solid #EAECEF', padding: '20px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>

          {/* Avatar + nome + badges */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingBottom: 16, borderBottom: '1px solid #F4F4F5' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#F4F4F5', border: '2px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#71717A', overflow: 'hidden', flexShrink: 0 }}>
              {patient.avatarUrl
                ? <img src={patient.avatarUrl} alt={patient.name} style={{ width: 64, height: 64, objectFit: 'cover' }} />
                : initials
              }
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#191C1D' }}>{patient.name}</div>
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 10px', borderRadius: 99, background: ct.bg, color: ct.color }}>{ct.label}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, padding: '2px 10px', borderRadius: 99, background: badge.bg, color: badge.color }}>
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: badge.dot, flexShrink: 0 }} />{badge.label}
              </span>
            </div>
          </div>

          {/* Contato */}
          <SectionTitle title="Contato" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <InfoRow icon="ti-brand-whatsapp" label="WhatsApp"   value={patient.phone} />
            <InfoRow icon="ti-mail"           label="E-mail"     value={patient.email} />
          </div>

          {/* Cadastro */}
          <SectionTitle title="Cadastro" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <InfoRow icon="ti-calendar-event" label="Data de cadastro" value={patient.createdAt ? format(new Date(patient.createdAt), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : null} />
            <InfoRow icon="ti-share"          label="Origem"            value={SOURCE_LABEL[patient.source] || patient.source} />
            <InfoRow icon="ti-user-check"     label="Responsável"       value="Admin" />
          </div>

          {/* Informações importantes */}
          <SectionTitle title="Informações importantes" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <InfoRow icon="ti-alert-triangle" label="Alergias"           value={patient.alergias} />
            <InfoRow icon="ti-pill"           label="Medicamentos em uso" value={patient.medicamentos} />
            <InfoRow icon="ti-heart-rate-monitor" label="Comorbidades"   value={patient.comorbidades} />
            <InfoRow icon="ti-target"         label="Objetivo"           value={patient.objetivo} />
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0' }}>
              <i className="ti ti-notes" style={{ fontSize: 14, color: '#A1A1AA', marginTop: 1, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: '#A1A1AA', marginBottom: 1 }}>Observações</div>
                <div style={{ fontSize: 13, color: patient.notes ? '#191C1D' : '#C4C4C4', fontStyle: patient.notes ? 'normal' : 'italic' }}>
                  {patient.notes || 'Sem observações'}
                </div>
              </div>
            </div>
          </div>

          {/* Link editar */}
          <button
            onClick={() => openEdit(patient)}
            style={{ marginTop: 12, width: '100%', height: 32, background: 'transparent', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 12, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; (e.currentTarget as HTMLElement).style.color = '#191C1D'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#71717A'; }}
          >
            <i className="ti ti-pencil" style={{ fontSize: 13 }} /> Editar informações
          </button>

        </div>
      </div>

      {/* ── Área principal ─────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Breadcrumb + ações */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <button
              onClick={() => navigate('/patients')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#71717A', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit', padding: 0 }}
              onMouseEnter={e => (e.currentTarget.style.color = '#000')}
              onMouseLeave={e => (e.currentTarget.style.color = '#71717A')}
            >
              <i className="ti ti-arrow-left" style={{ fontSize: 14 }} /> Pacientes
            </button>
            <span style={{ color: '#D4D4D8' }}>/</span>
            <span style={{ color: '#191C1D', fontWeight: 500 }}>{patient.name}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {patient.contactType === 'PACIENTE' && (
              <button
                onClick={() => navigate(`/prontuario/${patient.id}`)}
                title="Abrir tela clínica de evolução do paciente"
                style={{ height: 36, padding: '0 18px', background: '#2563EB', border: 'none', borderRadius: 20, fontSize: 13, fontWeight: 600, color: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(37,99,235,0.25)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#1D4ED8'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(37,99,235,0.35)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#2563EB'; (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(37,99,235,0.25)'; }}
              >
                <i className="ti ti-stethoscope" style={{ fontSize: 15 }} /> Prontuário
              </button>
            )}
            <button
              onClick={async () => {
                if (!patient.phone) { toast('Telefone inválido para WhatsApp', 'error'); return; }
                setOpeningWa(true);
                try {
                  const conv = await conversationsApi.open(patient.id);
                  navigate(`/messages?conversation=${conv.id}`);
                } catch (err: any) {
                  toast(err?.response?.data?.message || 'Erro ao abrir conversa', 'error');
                } finally { setOpeningWa(false); }
              }}
              disabled={openingWa || !patient.phone}
              style={{ height: 36, padding: '0 14px', background: '#FFFFFF', border: '1px solid #16A34A', borderRadius: 20, fontSize: 13, fontWeight: 600, color: '#16A34A', cursor: (patient.phone && !openingWa) ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', opacity: patient.phone ? 1 : 0.5 }}>
              {openingWa
                ? <i className="ti ti-loader-2" style={{ fontSize: 14, animation: 'spin 1s linear infinite' }} />
                : <i className="ti ti-brand-whatsapp" style={{ fontSize: 14 }} />}
              Enviar WhatsApp
            </button>
            <button onClick={() => openEdit(patient)} style={{ height: 36, padding: '0 14px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 20, fontSize: 13, fontWeight: 500, color: '#18181B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
              <i className="ti ti-pencil" style={{ fontSize: 14 }} /> Editar
            </button>
            <button style={{ height: 36, padding: '0 14px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 20, fontSize: 13, fontWeight: 500, color: '#18181B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
              <i className="ti ti-calendar-plus" style={{ fontSize: 14 }} /> Novo agendamento
            </button>
            <button style={{ height: 36, padding: '0 14px', background: '#000', border: 'none', borderRadius: 20, fontSize: 13, fontWeight: 600, color: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
              <i className="ti ti-receipt" style={{ fontSize: 14 }} /> Novo atendimento
            </button>
          </div>
        </div>

        {/* 4 KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { icon: 'ti-calendar',   label: 'Agendamentos', value: appointmentCount, sub: appointmentCount > 0 ? `${appointmentCount} no total` : 'Nenhum agendamento futuro',  iconBg: '#EFF6FF', iconColor: '#2563EB' },
            { icon: 'ti-activity',   label: 'Sessões',      value: sessionCount,     sub: sessionCount     > 0 ? `${sessionCount} realizadas`  : 'Nenhuma sessão realizada',    iconBg: '#F0FDF4', iconColor: '#16A34A' },
            { icon: 'ti-cash',       label: 'Vendas',       value: saleCount,        sub: saleCount        > 0 ? `${saleCount} realizadas`      : 'Nenhuma venda realizada',     iconBg: '#F5F3FF', iconColor: '#7C3AED' },
            { icon: 'ti-alert-circle',label:'Pendências',   value: alerts.length,    sub: alerts.length    > 0 ? `${alerts.length} itens`       : 'Nada pendente no momento',    iconBg: alerts.length > 0 ? '#FEF2F2' : '#F4F4F5', iconColor: alerts.length > 0 ? '#DC2626' : '#A1A1AA' },
          ].map((k, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 16, border: '1px solid #EAECEF', background: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: k.iconBg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className={`ti ${k.icon}`} style={{ fontSize: 18, color: k.iconColor }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: '#71717A', fontWeight: 500, marginBottom: 1, textTransform: 'uppercase', letterSpacing: '.04em' }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#09090B', lineHeight: 1 }}>{k.value}</div>
                <div style={{ fontSize: 11, color: '#A1A1AA', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Abas */}
        <div style={{ background: '#FFFFFF', borderRadius: 16, border: '1px solid #EAECEF', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid #F1F3F5', padding: '0 4px' }}>
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '12px 16px',
                  fontSize: 13,
                  fontWeight: activeTab === tab ? 600 : 400,
                  color: activeTab === tab ? '#191C1D' : '#71717A',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === tab ? '2px solid #000' : '2px solid transparent',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  marginBottom: -1,
                  whiteSpace: 'nowrap',
                  transition: 'color 0.15s',
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Conteúdo das abas */}
          <div style={{ padding: '20px' }}>

            {activeTab === 'Resumo' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Linha 1: 2 cards lado a lado */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

                  {/* Card Resumo do paciente */}
                  <div style={{ background: '#FAFAFA', borderRadius: 14, border: '1px solid #F1F3F5', padding: '16px 18px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#191C1D', marginBottom: 14 }}>Resumo do paciente</div>
                    {[
                      { label: 'Objetivo principal',   value: patient.objetivo },
                      { label: 'Queixa principal',     value: patient.queixaPrincipal },
                      { label: 'Status do tratamento', value: patient.statusTratamento },
                      { label: 'Última consulta',      value: lastAppt ? format(new Date(lastAppt.startTime), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : null },
                      { label: 'Próximo atendimento',  value: nextAppt ? format(new Date(nextAppt.startTime), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : null },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid #F1F3F5' }}>
                        <span style={{ fontSize: 12, color: '#71717A', flexShrink: 0, marginRight: 8 }}>{label}</span>
                        <span style={{ fontSize: 12, color: value ? '#191C1D' : '#C4C4C4', fontStyle: value ? 'normal' : 'italic', textAlign: 'right' }}>{value || 'Não informado'}</span>
                      </div>
                    ))}
                  </div>

                  {/* Card Alertas importantes */}
                  <div style={{ background: '#FAFAFA', borderRadius: 14, border: '1px solid #F1F3F5', padding: '16px 18px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#191C1D', marginBottom: 14 }}>Alertas importantes</div>
                    {alerts.length === 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0' }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <i className="ti ti-circle-check" style={{ fontSize: 14, color: '#16A34A' }} />
                        </div>
                        <span style={{ fontSize: 12, color: '#A1A1AA' }}>Nenhum alerta no momento</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {alerts.map((alert, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#FFFBEB', borderRadius: 8, border: '1px solid #FDE68A' }}>
                            <i className="ti ti-alert-triangle" style={{ fontSize: 13, color: '#D97706', flexShrink: 0 }} />
                            <span style={{ fontSize: 12, color: '#92400E', lineHeight: 1.4 }}>{alert}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Linha 2: Observações gerais (largura total) */}
                <div style={{ background: '#FAFAFA', borderRadius: 14, border: '1px solid #F1F3F5', padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#191C1D' }}>Observações gerais</div>
                    <button
                      onClick={() => openEdit(patient, 'Observações')}
                      style={{ fontSize: 12, color: '#71717A', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <i className="ti ti-pencil" style={{ fontSize: 13 }} /> Editar
                    </button>
                  </div>
                  {patient.obsGerais ? (
                    <p style={{ fontSize: 13, color: '#71717A', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{patient.obsGerais}</p>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                      <i className="ti ti-notes" style={{ fontSize: 28, color: '#E4E4E7', display: 'block', marginBottom: 8 }} />
                      <div style={{ fontSize: 13, color: '#A1A1AA' }}>Nenhuma observação registrada.</div>
                      <div style={{ fontSize: 12, color: '#C4C4C4', marginTop: 4 }}>Clique em Editar para adicionar observações sobre o paciente.</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'Histórico' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {/* Cabeçalho */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#191C1D' }}>Histórico do paciente</div>
                  <div style={{ fontSize: 12, color: '#71717A', marginTop: 2 }}>Acompanhe todas as movimentações, alterações, atendimentos e registros vinculados ao paciente.</div>
                </div>

                {timelineEvents.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 0' }}>
                    <i className="ti ti-clock" style={{ fontSize: 36, color: '#E4E4E7', display: 'block', marginBottom: 12 }} />
                    <div style={{ fontSize: 14, color: '#A1A1AA' }}>Nenhuma atividade registrada.</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {timelineEvents.map((ev, i) => (
                      <div key={i} style={{ display: 'flex', gap: 16, paddingBottom: i < timelineEvents.length - 1 ? 0 : 0 }}>
                        {/* Ícone + linha vertical */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 36 }}>
                          <div style={{ width: 36, height: 36, borderRadius: '50%', background: ev.iconBg, border: `1px solid ${ev.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <i className={`ti ${ev.icon}`} style={{ fontSize: 15, color: ev.color }} />
                          </div>
                          {i < timelineEvents.length - 1 && (
                            <div style={{ width: 1, flex: 1, minHeight: 20, background: '#E4E4E7', margin: '4px 0' }} />
                          )}
                        </div>

                        {/* Conteúdo */}
                        <div style={{ flex: 1, minWidth: 0, paddingTop: 4, paddingBottom: i < timelineEvents.length - 1 ? 20 : 0 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#191C1D' }}>{ev.title}</span>
                            <span style={{ fontSize: 11, color: '#A1A1AA', flexShrink: 0 }}>
                              {format(ev.date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                          {ev.responsible && (
                            <div style={{ fontSize: 11, color: '#A1A1AA', marginTop: 2 }}>
                              Responsável: <span style={{ color: '#71717A', fontWeight: 500 }}>{ev.responsible}</span>
                            </div>
                          )}
                          {ev.sub && (
                            <div style={{ fontSize: 12, color: '#71717A', marginTop: 4, lineHeight: 1.5 }}>{ev.sub}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'Financeiro' && <FinanceiroTab patient={patient} />}
            {activeTab === 'Sessões' && <SessoesTab patient={patient} />}

            {activeTab === 'Documentos' && (() => {
              const docs = patient.documents || [];
              const TYPE_DOC_COLORS: Record<string, { bg: string; color: string }> = {
                'Receita':     { bg: '#EFF6FF', color: '#2563EB' },
                'Atestado':    { bg: '#F0FDF4', color: '#16A34A' },
                'Declaração':  { bg: '#F5F3FF', color: '#7C3AED' },
                'Orientações': { bg: '#FFFBEB', color: '#D97706' },
                'Termos':      { bg: '#FEF2F2', color: '#DC2626' },
                'Exames':      { bg: '#ECFEFF', color: '#0E7490' },
                'Outros':      { bg: '#F4F4F5', color: '#71717A' },
              };
              return (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#191C1D' }}>Documentos do paciente</div>
                      <div style={{ fontSize: 12, color: '#71717A', marginTop: 2 }}>Documentos gerados durante os atendimentos — receitas, atestados, declarações e outros.</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: '#F4F4F5', color: '#71717A' }}>{docs.length} documento{docs.length !== 1 ? 's' : ''}</span>
                  </div>
                  {docs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '56px 0' }}>
                      <div style={{ width: 52, height: 52, borderRadius: 14, background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                        <i className="ti ti-files-off" style={{ fontSize: 24, color: '#A1A1AA' }} />
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#09090B', marginBottom: 4 }}>Nenhum documento gerado</div>
                      <div style={{ fontSize: 13, color: '#71717A' }}>
                        Documentos gerados via <strong>Prontuário → Modelos de documentos</strong> aparecem aqui.
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E4E4E7', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#F4F4F5', borderBottom: '1px solid #E4E4E7' }}>
                            {['DOCUMENTO', 'TIPO', 'DATA', 'PROFISSIONAL', 'ORIGEM', 'STATUS', 'AÇÕES'].map(h => (
                              <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#71717A', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {docs.map((d: any) => {
                            const tc = TYPE_DOC_COLORS[d.type] || TYPE_DOC_COLORS['Outros'];
                            return (
                              <tr key={d.id}
                                style={{ borderBottom: '1px solid #F4F4F5' }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F9F9F9'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                                <td style={{ padding: '13px 16px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{ width: 32, height: 32, borderRadius: 8, background: tc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                      <i className="ti ti-file-text" style={{ fontSize: 15, color: tc.color }} />
                                    </div>
                                    <span style={{ fontSize: 13, fontWeight: 500, color: '#09090B' }}>{d.name}</span>
                                  </div>
                                </td>
                                <td style={{ padding: '13px 16px' }}>
                                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: tc.bg, color: tc.color }}>{d.type}</span>
                                </td>
                                <td style={{ padding: '13px 16px', fontSize: 12, color: '#71717A', whiteSpace: 'nowrap' }}>
                                  {format(new Date(d.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                </td>
                                <td style={{ padding: '13px 16px', fontSize: 12, color: '#71717A' }}>{d.professional || 'Não informado'}</td>
                                <td style={{ padding: '13px 16px' }}>
                                  <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 99, background: '#F0FDFA', color: '#0D9488' }}>Prontuário</span>
                                </td>
                                <td style={{ padding: '13px 16px' }}>
                                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: '#DCFCE7', color: '#16A34A' }}>Salvo</span>
                                </td>
                                <td style={{ padding: '13px 16px' }}>
                                  <div style={{ display: 'flex', gap: 4 }}>
                                    <button
                                      onClick={() => setViewingDoc(d)}
                                      style={{ height: 28, padding: '0 10px', background: '#F4F4F5', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                                      <i className="ti ti-eye" style={{ fontSize: 12 }} /> Ver
                                    </button>
                                    <button
                                      onClick={() => {
                                        const win = window.open('', '_blank');
                                        if (!win) return;
                                        win.document.write(`<html><head><title>${d.name}</title><style>body{font-family:Inter,system-ui,sans-serif;max-width:700px;margin:40px auto;color:#191C1D;line-height:1.7}h1{font-size:18px;font-weight:700;margin-bottom:4px}.meta{font-size:12px;color:#71717A;margin-bottom:24px;padding-bottom:12px;border-bottom:1px solid #E4E4E7}@media print{body{margin:20px}}</style></head><body><h1>${d.name}</h1><div class="meta">${d.type || ''} · ${format(new Date(d.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} · ${d.professional || 'Profissional'}</div>${d.content || ''}</body></html>`);
                                        win.document.close();
                                        win.focus();
                                        setTimeout(() => win.print(), 400);
                                      }}
                                      style={{ height: 28, padding: '0 10px', background: 'transparent', border: '1px solid #E4E4E7', borderRadius: 6, fontSize: 11, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                                      <i className="ti ti-printer" style={{ fontSize: 12 }} /> Imprimir
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}

            {activeTab === 'Agendamentos' && (() => {
              const allAppts = [...futureAppts, ...pastAppts];
              const APPT_STATUS: Record<string, { bg: string; color: string; label: string }> = {
                CONFIRMADO: { bg: '#DCFCE7', color: '#16A34A', label: 'Confirmado' },
                AGUARDANDO: { bg: '#F4F4F5', color: '#71717A', label: 'Aguardando' },
                ATENCAO:    { bg: '#FEF2F2', color: '#DC2626', label: 'Atenção' },
                RETORNO:    { bg: '#F5F3FF', color: '#7C3AED', label: 'Retorno' },
                AVALIACAO:  { bg: '#EFF6FF', color: '#2563EB', label: 'Avaliação' },
                ENCAIXE:    { bg: '#F4F4F5', color: '#A1A1AA', label: 'Encaixe' },
              };
              const ApptTable = ({ appts }: { appts: any[] }) => (
                <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E4E4E7', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#F4F4F5', borderBottom: '1px solid #E4E4E7' }}>
                        {['DATA', 'HORÁRIO', 'PROCEDIMENTO', 'PROFISSIONAL', 'STATUS'].map(h => (
                          <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#71717A', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {appts.map((a: any) => {
                        const st = APPT_STATUS[a.status] || APPT_STATUS['AGUARDANDO'];
                        const dt = new Date(a.startTime);
                        return (
                          <tr key={a.id} style={{ borderBottom: '1px solid #F4F4F5' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F9F9F9'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                            <td style={{ padding: '12px 16px', fontSize: 13, color: '#09090B', fontWeight: 500 }}>{format(dt, 'dd/MM/yyyy', { locale: ptBR })}</td>
                            <td style={{ padding: '12px 16px', fontSize: 13, color: '#71717A' }}>{format(dt, 'HH:mm', { locale: ptBR })}</td>
                            <td style={{ padding: '12px 16px', fontSize: 13, color: '#09090B' }}>{a.plan?.name || 'Consulta'}</td>
                            <td style={{ padding: '12px 16px', fontSize: 12, color: '#71717A' }}>{a.professional?.user?.name || '—'}</td>
                            <td style={{ padding: '12px 16px' }}>
                              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: st.bg, color: st.color }}>{st.label}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
              return (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#191C1D' }}>Agendamentos do paciente</div>
                      <div style={{ fontSize: 12, color: '#71717A', marginTop: 2 }}>
                        {futureAppts.length} próximo{futureAppts.length !== 1 ? 's' : ''} · {pastAppts.length} realizado{pastAppts.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: '#F4F4F5', color: '#71717A' }}>{allAppts.length} total</span>
                  </div>
                  {allAppts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '56px 0' }}>
                      <div style={{ width: 52, height: 52, borderRadius: 14, background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                        <i className="ti ti-calendar-off" style={{ fontSize: 24, color: '#A1A1AA' }} />
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#09090B', marginBottom: 4 }}>Nenhum agendamento</div>
                      <div style={{ fontSize: 13, color: '#71717A' }}>Agende um atendimento pela <strong>Agenda</strong> para ver aqui.</div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {futureAppts.length > 0 && (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#71717A', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Próximos agendamentos</div>
                          <ApptTable appts={futureAppts} />
                        </div>
                      )}
                      {pastAppts.length > 0 && (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#71717A', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Histórico</div>
                          <ApptTable appts={pastAppts.slice(0, 20)} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {activeTab !== 'Resumo' && activeTab !== 'Prontuário' && activeTab !== 'Histórico' && activeTab !== 'Documentos' && activeTab !== 'Financeiro' && activeTab !== 'Sessões' && activeTab !== 'Agendamentos' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 0', gap: 10 }}>
                <i className="ti ti-tools" style={{ fontSize: 32, color: '#E4E4E7' }} />
                <div style={{ fontSize: 14, fontWeight: 500, color: '#A1A1AA' }}>Em implementação</div>
                <div style={{ fontSize: 12, color: '#C4C4C4' }}>A aba {activeTab} estará disponível em breve</div>
              </div>
            )}

          </div>
        </div>

      </div>
    </div>

    {viewingDoc && (
      <>
        <div onClick={() => setViewingDoc(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 600, backdropFilter: 'blur(4px)' }} />
        <div style={{ position: 'fixed', top: '5%', left: '50%', transform: 'translateX(-50%)', width: 640, maxHeight: '88vh', background: '#FFFFFF', borderRadius: 16, zIndex: 601, display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.2)', fontFamily: "'Inter', system-ui, sans-serif" }}>
          <div style={{ flexShrink: 0, padding: '18px 24px', borderBottom: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#09090B' }}>{viewingDoc.name}</div>
              <div style={{ fontSize: 12, color: '#71717A', marginTop: 2 }}>
                {viewingDoc.type} · {format(new Date(viewingDoc.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} · {viewingDoc.professional || 'Profissional'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => {
                const win = window.open('', '_blank');
                if (!win) return;
                win.document.write(`<html><head><title>${viewingDoc.name}</title><style>body{font-family:Inter,system-ui,sans-serif;max-width:700px;margin:40px auto;color:#191C1D;line-height:1.7}h1{font-size:18px;font-weight:700;margin-bottom:4px}.meta{font-size:12px;color:#71717A;margin-bottom:24px;padding-bottom:12px;border-bottom:1px solid #E4E4E7}@media print{body{margin:20px}}</style></head><body><h1>${viewingDoc.name}</h1><div class="meta">${viewingDoc.type} · ${format(new Date(viewingDoc.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} · ${viewingDoc.professional || 'Profissional'}</div>${viewingDoc.content}</body></html>`);
                win.document.close();
                win.focus();
                setTimeout(() => win.print(), 400);
              }} style={{ height: 32, padding: '0 12px', background: '#F4F4F5', border: 'none', borderRadius: 8, fontSize: 12, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                <i className="ti ti-printer" style={{ fontSize: 13 }} /> Imprimir
              </button>
              <button onClick={() => setViewingDoc(null)} style={{ width: 32, height: 32, border: 'none', background: '#F4F4F5', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A' }}>
                <i className="ti ti-x" style={{ fontSize: 14 }} />
              </button>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', minHeight: 0 }}>
            <div
              dangerouslySetInnerHTML={{ __html: viewingDoc.content || '' }}
              style={{ fontSize: 13, color: '#191C1D', lineHeight: 1.8 }}
            />
          </div>
        </div>
      </>
    )}

    {editOpen && (
      <>
        <style>{`@keyframes slideInEdit { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
        <div onClick={() => setEditOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 400, backdropFilter: 'blur(3px)' }} />
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 820, background: '#F8F9FA', zIndex: 401, display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 60px rgba(0,0,0,.16)', fontFamily: "'Inter', system-ui, sans-serif", animation: 'slideInEdit .28s cubic-bezier(0.32,0.72,0,1)' }}>

          {/* ── Header ── */}
          <div style={{ flexShrink: 0, background: '#FFFFFF', borderBottom: '1px solid #E5E7EB', padding: '18px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#F4F4F5', border: '2px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#71717A', flexShrink: 0 }}>
                {patient.name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#191C1D' }}>Editar contato</div>
                <div style={{ fontSize: 12, color: '#71717A', marginTop: 1 }}>{patient.name} · {EDIT_TABS.length} seções</div>
              </div>
            </div>
            <button onClick={() => setEditOpen(false)} style={{ width: 34, height: 34, border: 'none', background: '#F4F4F5', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A' }}>
              <i className="ti ti-x" style={{ fontSize: 15 }} />
            </button>
          </div>

          {/* ── Tab bar ── */}
          <div style={{ flexShrink: 0, background: '#FFFFFF', borderBottom: '1px solid #E5E7EB', padding: '0 28px', display: 'flex', gap: 0, overflowX: 'auto' }}>
            {EDIT_TABS.map(t => {
              const active = editTab === t;
              return (
                <button key={t} onClick={() => setEditTab(t)} style={{ height: 42, padding: '0 16px', border: 'none', background: 'none', fontSize: 13, fontWeight: active ? 600 : 400, color: active ? '#191C1D' : '#71717A', cursor: 'pointer', fontFamily: 'inherit', borderBottom: active ? '2px solid #000' : '2px solid transparent', whiteSpace: 'nowrap', marginBottom: -1, flexShrink: 0 }}>
                  {t}
                </button>
              );
            })}
          </div>

          {/* ── Body ── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* ABA 1 — Dados pessoais */}
            {editTab === 'Dados pessoais' && (
              <>
                <ESection title="Identificação" />
                <EGrid cols={1}>
                  <div><ELabel>Nome completo <span style={{ color: '#DC2626' }}>*</span></ELabel><input value={editForm.name} onChange={set('name')} style={inp} placeholder="Nome completo do contato" /></div>
                </EGrid>
                <EGrid>
                  <div>
                    <ELabel>Tipo de contato</ELabel>
                    <select value={editForm.contactType} onChange={set('contactType')} style={sel}>
                      <option value="">Selecionar</option>
                      <option value="PACIENTE">Paciente</option>
                      <option value="RESPONSAVEL">Responsável</option>
                      <option value="ACOMPANHANTE">Acompanhante</option>
                      <option value="LEAD">Lead</option>
                      <option value="OUTROS">Outros</option>
                    </select>
                  </div>
                  <div>
                    <ELabel>Status</ELabel>
                    <select value={editForm.status} onChange={set('status')} style={sel}>
                      <option value="NOVO">Novo</option>
                      <option value="ATIVO">Ativo</option>
                      <option value="INATIVO">Inativo</option>
                      <option value="EM_TRATAMENTO">Em tratamento</option>
                      <option value="SEM_RETORNO">Sem retorno</option>
                      <option value="EM_RISCO">Em risco</option>
                    </select>
                  </div>
                </EGrid>

                <ESection title="Documentos pessoais" />
                <EGrid>
                  <div><ELabel>CPF</ELabel><input value={editForm.cpf} onChange={set('cpf')} style={inp} placeholder="000.000.000-00" /></div>
                  <div><ELabel>RG</ELabel><input value={editForm.rg} onChange={set('rg')} style={inp} placeholder="00.000.000-0" /></div>
                  <div><ELabel>Data de nascimento</ELabel><input type="date" value={editForm.birthDate} onChange={set('birthDate')} style={inp} /></div>
                  <div>
                    <ELabel>Gênero</ELabel>
                    <select value={editForm.gender} onChange={set('gender')} style={sel}>
                      <option value="">Selecionar</option>
                      <option value="feminino">Feminino</option>
                      <option value="masculino">Masculino</option>
                      <option value="nao_binario">Não binário</option>
                      <option value="prefiro_nao_informar">Prefiro não informar</option>
                    </select>
                  </div>
                </EGrid>

                <ESection title="Informações profissionais" />
                <EGrid>
                  <div><ELabel>Profissão</ELabel><input value={editForm.profession} onChange={set('profession')} style={inp} placeholder="Ex: Professora" /></div>
                  <div><ELabel>Responsável pelo contato</ELabel><input value={editForm.responsavel} onChange={set('responsavel')} style={inp} placeholder="Nome do responsável interno" /></div>
                </EGrid>
              </>
            )}

            {/* ABA 2 — Contato */}
            {editTab === 'Contato' && (
              <>
                <ESection title="Telefones" />
                <EGrid>
                  <div><ELabel>WhatsApp <span style={{ color: '#DC2626' }}>*</span></ELabel><input value={editForm.phone} onChange={set('phone')} style={inp} placeholder="(00) 00000-0000" /></div>
                  <div><ELabel>Telefone secundário</ELabel><input value={editForm.phoneSecondary} onChange={set('phoneSecondary')} style={inp} placeholder="(00) 00000-0000" /></div>
                </EGrid>

                <ESection title="Digital" />
                <EGrid>
                  <div><ELabel>E-mail</ELabel><input type="email" value={editForm.email} onChange={set('email')} style={inp} placeholder="email@exemplo.com" /></div>
                  <div><ELabel>Instagram</ELabel><input value={editForm.instagram} onChange={set('instagram')} style={inp} placeholder="@usuario" /></div>
                </EGrid>

                <ESection title="Preferências de contato" />
                <EGrid>
                  <div>
                    <ELabel>Canal preferencial</ELabel>
                    <select value={editForm.canalPreferencial} onChange={set('canalPreferencial')} style={sel}>
                      <option value="">Selecionar</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="ligacao">Ligação</option>
                      <option value="email">E-mail</option>
                      <option value="instagram">Instagram</option>
                    </select>
                  </div>
                  <div><ELabel>Melhor horário para contato</ELabel><input value={editForm.melhorHorario} onChange={set('melhorHorario')} style={inp} placeholder="Ex: Manhã, das 9h às 12h" /></div>
                </EGrid>
              </>
            )}

            {/* ABA 3 — Endereço */}
            {editTab === 'Endereço' && (
              <>
                <ESection title="Localização" />
                <EGrid>
                  <div><ELabel>CEP</ELabel><input value={editForm.cep} onChange={set('cep')} style={inp} placeholder="00000-000" /></div>
                  <div><ELabel>Estado</ELabel><input value={editForm.estado} onChange={set('estado')} style={inp} placeholder="Ex: MG" /></div>
                </EGrid>
                <EGrid cols={1}>
                  <div><ELabel>Rua / Logradouro</ELabel><input value={editForm.rua} onChange={set('rua')} style={inp} placeholder="Nome da rua" /></div>
                </EGrid>
                <EGrid>
                  <div><ELabel>Número</ELabel><input value={editForm.numero} onChange={set('numero')} style={inp} placeholder="Ex: 123" /></div>
                  <div><ELabel>Complemento</ELabel><input value={editForm.complemento} onChange={set('complemento')} style={inp} placeholder="Ex: Apto 4B" /></div>
                  <div><ELabel>Bairro</ELabel><input value={editForm.bairro} onChange={set('bairro')} style={inp} placeholder="Bairro" /></div>
                  <div><ELabel>Cidade</ELabel><input value={editForm.cidade} onChange={set('cidade')} style={inp} placeholder="Cidade" /></div>
                </EGrid>
              </>
            )}

            {/* ABA 4 — Cadastro e origem */}
            {editTab === 'Cadastro e origem' && (
              <>
                <ESection title="Dados de cadastro" />
                <EGrid>
                  <div><ELabel>Data de cadastro</ELabel><input type="date" value={editForm.dataCadastro} onChange={set('dataCadastro')} style={inp} /></div>
                  <div><ELabel>Responsável pelo cadastro</ELabel><input value={editForm.responsavelCadastro} onChange={set('responsavelCadastro')} style={inp} placeholder="Nome do responsável" /></div>
                </EGrid>

                <ESection title="Origem do contato" />
                <EGrid>
                  <div>
                    <ELabel>Origem</ELabel>
                    <select value={editForm.origem} onChange={set('origem')} style={sel}>
                      <option value="">Selecionar</option>
                      <option value="instagram">Instagram</option>
                      <option value="google">Google</option>
                      <option value="indicacao">Indicação</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="evento">Evento</option>
                      <option value="trafego_pago">Tráfego pago</option>
                      <option value="site">Site</option>
                      <option value="outro">Outro</option>
                    </select>
                  </div>
                  <div><ELabel>Como conheceu</ELabel><input value={editForm.comoConheceu} onChange={set('comoConheceu')} style={inp} placeholder="Descreva brevemente" /></div>
                  <div><ELabel>Indicado por</ELabel><input value={editForm.indicadoPor} onChange={set('indicadoPor')} style={inp} placeholder="Nome de quem indicou" /></div>
                </EGrid>
                <div>
                  <ELabel>Observação de origem</ELabel>
                  <textarea value={editForm.obsOrigem} onChange={set('obsOrigem')} rows={3} style={{ ...ta, width: '100%' }} placeholder="Contexto adicional sobre como o contato chegou..." />
                </div>
              </>
            )}

            {/* ABA 5 — Informações importantes */}
            {editTab === 'Informações importantes' && (
              <>
                <ESection title="Saúde" />
                <EGrid cols={1}>
                  <div><ELabel>Alergias</ELabel><textarea value={editForm.alergias} onChange={set('alergias')} rows={2} style={{ ...ta, width: '100%' }} placeholder="Liste as alergias conhecidas ou 'Não informado'" /></div>
                  <div><ELabel>Medicamentos em uso</ELabel><textarea value={editForm.medicamentos} onChange={set('medicamentos')} rows={2} style={{ ...ta, width: '100%' }} placeholder="Liste os medicamentos em uso ou 'Nenhum'" /></div>
                  <div><ELabel>Comorbidades</ELabel><textarea value={editForm.comorbidades} onChange={set('comorbidades')} rows={2} style={{ ...ta, width: '100%' }} placeholder="Liste as comorbidades ou 'Não informado'" /></div>
                </EGrid>

                <ESection title="Objetivo e observações" />
                <EGrid cols={1}>
                  <div><ELabel>Objetivo principal</ELabel><input value={editForm.objetivo} onChange={set('objetivo')} style={inp} placeholder="Ex: Emagrecimento, melhora da disposição..." /></div>
                  <div><ELabel>Observações importantes</ELabel><textarea value={editForm.obsImportantes} onChange={set('obsImportantes')} rows={3} style={{ ...ta, width: '100%' }} placeholder="Informações relevantes para o atendimento..." /></div>
                  <div><ELabel>Atenção especial</ELabel><input value={editForm.atencaoEspecial} onChange={set('atencaoEspecial')} style={inp} placeholder="Ex: Fobia de agulha, ansiedade..." /></div>
                  <div><ELabel>Restrições</ELabel><input value={editForm.restricoes} onChange={set('restricoes')} style={inp} placeholder="Ex: Não pode fazer esforço físico intenso..." /></div>
                </EGrid>

                <ESection title="Classificação" />
                <EGrid>
                  <div>
                    <ELabel>Paciente VIP?</ELabel>
                    <select value={editForm.pacienteVip} onChange={set('pacienteVip')} style={sel}>
                      <option value="nao">Não</option>
                      <option value="sim">Sim</option>
                    </select>
                  </div>
                  <div><ELabel>Alerta interno</ELabel><input value={editForm.alertaInterno} onChange={set('alertaInterno')} style={inp} placeholder="Ex: Paciente sensível, não ligar após 18h..." /></div>
                </EGrid>
              </>
            )}

            {/* ABA 6 — Observações */}
            {editTab === 'Observações' && (
              <>
                <ESection title="Clínico" />
                <EGrid cols={1}>
                  <div><ELabel>Queixa principal</ELabel><textarea value={editForm.queixaPrincipal} onChange={set('queixaPrincipal')} rows={3} style={{ ...ta, width: '100%' }} placeholder="Descreva a queixa principal do paciente..." /></div>
                </EGrid>
                <EGrid>
                  <div>
                    <ELabel>Status do tratamento</ELabel>
                    <select value={editForm.statusTratamento} onChange={set('statusTratamento')} style={sel}>
                      <option value="">Selecionar</option>
                      <option value="avaliacao_inicial">Em avaliação inicial</option>
                      <option value="acompanhamento">Em acompanhamento</option>
                      <option value="protocolo">Em protocolo</option>
                      <option value="finalizado">Finalizado</option>
                      <option value="inativo">Inativo</option>
                    </select>
                  </div>
                </EGrid>

                <ESection title="Observações gerais" />
                <EGrid cols={1}>
                  <div><ELabel>Observações gerais</ELabel><textarea value={editForm.obsGerais} onChange={set('obsGerais')} rows={3} style={{ ...ta, width: '100%' }} placeholder="Observações visíveis para toda a equipe..." /></div>
                  <div><ELabel>Observação interna</ELabel><textarea value={editForm.obsInterna} onChange={set('obsInterna')} rows={3} style={{ ...ta, width: '100%' }} placeholder="Observação restrita à equipe administrativa..." /></div>
                  <div><ELabel>Observações (notas adicionais)</ELabel><textarea value={editForm.notes} onChange={set('notes')} rows={3} style={{ ...ta, width: '100%' }} placeholder="Notas extras sobre este contato..." /></div>
                </EGrid>

                <ESection title="Status de documentação" />
                <EGrid>
                  <div>
                    <ELabel>Anamnese preenchida?</ELabel>
                    <select value={editForm.anamnese} onChange={set('anamnese')} style={sel}>
                      <option value="nao">Não</option>
                      <option value="sim">Sim</option>
                    </select>
                  </div>
                  <div>
                    <ELabel>Documento anexado?</ELabel>
                    <select value={editForm.documentoAnexado} onChange={set('documentoAnexado')} style={sel}>
                      <option value="nao">Não</option>
                      <option value="sim">Sim</option>
                    </select>
                  </div>
                </EGrid>
              </>
            )}

          </div>

          {/* ── Footer fixo ── */}
          <div style={{ flexShrink: 0, background: '#FFFFFF', borderTop: '1px solid #E5E7EB' }}>
            {editError && (
              <div style={{ padding: '10px 28px', background: '#FEF2F2', borderBottom: '1px solid #FECACA', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="ti ti-alert-circle" style={{ fontSize: 15, color: '#DC2626', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#B91C1C', flex: 1 }}>{editError}</span>
                <button onClick={() => setEditError('')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#B91C1C', padding: 2 }}>
                  <i className="ti ti-x" style={{ fontSize: 12 }} />
                </button>
              </div>
            )}
            <div style={{ padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {EDIT_TABS.map(t => (
                  <button key={t} onClick={() => setEditTab(t)} style={{ width: 8, height: 8, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0, background: editTab === t ? '#000' : '#E4E4E7', transition: 'background .15s' }} title={t} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setEditOpen(false)} style={{ height: 40, padding: '0 20px', border: '1px solid #E4E4E7', background: '#FFFFFF', borderRadius: 10, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancelar
                </button>
                <button
                  disabled={editSaving || updateMut.isPending}
                  onClick={() => { setEditError(''); setEditSaving(true); updateMut.mutate(buildPayload(editForm)); }}
                  style={{ height: 40, padding: '0 24px', background: (editSaving || updateMut.isPending) ? '#A1A1AA' : '#000000', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#FFF', cursor: (editSaving || updateMut.isPending) ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 7 }}
                >
                  <i className="ti ti-device-floppy" style={{ fontSize: 14 }} />
                  {(editSaving || updateMut.isPending) ? 'Salvando...' : 'Salvar alterações'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    )}
    </>
  );
}
