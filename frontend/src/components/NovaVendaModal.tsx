import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { patientsApi, plansApi, financialApi, salesApi } from '../services/api';
import { Portal } from './ui/Portal';

// ─── Types ────────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 9);
const todayIso = () => new Date().toISOString().slice(0, 10);
const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const inp: React.CSSProperties = {
  width: '100%', height: 36, padding: '0 10px',
  border: '1px solid #E4E4E7', borderRadius: 8,
  fontSize: 13, color: '#09090B', background: '#FFFFFF',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 500,
  color: '#374151', marginBottom: 5,
};

type ItemRow = {
  key: string; planId: string; name: string;
  quantity: number; unitPrice: number; discount: number;
  total: number; sessionsTotal: number;
};

type NegType = 'none' | 'partial' | 'full';

type PmtRow = {
  key: string; amount: string; paymentMethodId: string; paymentDate: string;
};

type InstGroup = {
  key: string;
  paymentMethodId: string;
  amount: string;
  count: number;
  firstDueDate: string;
  frequency: string;
  receivedNow: boolean;
};

type ComputedInstallment = {
  amount: number;
  paymentMethodId: string | null;
  dueDate: string;
  receivedNow: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeItem(): ItemRow {
  return { key: uid(), planId: '', name: '', quantity: 1, unitPrice: 0, discount: 0, total: 0, sessionsTotal: 0 };
}
function makePmtRow(): PmtRow {
  return { key: uid(), amount: '', paymentMethodId: '', paymentDate: todayIso() };
}
function makeInstGroup(): InstGroup {
  return { key: uid(), paymentMethodId: '', amount: '', count: 1, firstDueDate: todayIso(), frequency: 'MENSAL', receivedNow: false };
}

const FREQ_OPTS = [
  { value: 'SEMANAL',    label: 'Semanal (7 dias)' },
  { value: 'QUINZENAL',  label: 'Quinzenal (15 dias)' },
  { value: 'MENSAL',     label: 'Mensal' },
  { value: 'BIMESTRAL',  label: 'Bimestral' },
  { value: 'TRIMESTRAL', label: 'Trimestral' },
];

function addFreqDate(date: Date, freq: string): Date {
  const d = new Date(date);
  switch (freq) {
    case 'SEMANAL':    d.setDate(d.getDate() + 7);   break;
    case 'QUINZENAL':  d.setDate(d.getDate() + 15);  break;
    case 'BIMESTRAL':  d.setMonth(d.getMonth() + 2); break;
    case 'TRIMESTRAL': d.setMonth(d.getMonth() + 3); break;
    default:           d.setMonth(d.getMonth() + 1); break; // MENSAL
  }
  return d;
}

function buildInstallments(groups: InstGroup[]): ComputedInstallment[] {
  const result: ComputedInstallment[] = [];
  for (const g of groups) {
    const total = parseFloat(g.amount) || 0;
    if (total <= 0) continue;
    const count   = Math.max(1, g.count);
    const perInst = Math.round((total / count) * 100) / 100;
    let date = g.firstDueDate
      ? new Date(g.firstDueDate + 'T12:00:00')
      : new Date();

    for (let i = 0; i < count; i++) {
      const isLast = i === count - 1;
      const amt    = isLast
        ? Math.round((total - perInst * (count - 1)) * 100) / 100
        : perInst;
      result.push({
        amount: amt,
        paymentMethodId: g.paymentMethodId || null,
        dueDate: date.toISOString().slice(0, 10),
        receivedNow: g.receivedNow,
      });
      date = addFreqDate(date, g.frequency);
    }
  }
  return result;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  prefilledPatientId?: string;
  prefilledPatientName?: string;
}

export function NovaVendaModal({ onClose, onSuccess, prefilledPatientId, prefilledPatientName }: Props) {
  // ── Patient ──────────────────────────────────────────────────────────────────
  const [patientSearch,      setPatientSearch]      = useState('');
  const [patientResults,     setPatientResults]     = useState<any[]>([]);
  const [showPatientDrop,    setShowPatientDrop]    = useState(false);
  const [selectedPatientId,  setSelectedPatientId]  = useState(prefilledPatientId || '');
  const [selectedPatientName, setSelectedPatientName] = useState(prefilledPatientName || '');

  // ── Items ────────────────────────────────────────────────────────────────────
  const [items,       setItems]       = useState<ItemRow[]>([makeItem()]);
  const [notes,       setNotes]       = useState('');
  const [genSessions, setGenSessions] = useState(true);
  const [error,       setError]       = useState('');

  // ── Negociação ───────────────────────────────────────────────────────────────
  const [negType,     setNegType]     = useState<NegType>('none');
  const [paymentsNow, setPaymentsNow] = useState<PmtRow[]>([makePmtRow()]);
  const [instGroups,  setInstGroups]  = useState<InstGroup[]>([makeInstGroup()]);

  const { data: plans = [] }          = useQuery({ queryKey: ['plans'],           queryFn: () => plansApi.list() });
  const { data: paymentMethods = [] } = useQuery({ queryKey: ['payment-methods'], queryFn: () => financialApi.paymentMethods() });

  // ── Computed ─────────────────────────────────────────────────────────────────
  const subtotal      = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const totalDiscount = items.reduce((s, i) => s + i.discount, 0);
  const total         = items.reduce((s, i) => s + i.total, 0);
  const hasSessionItems = items.some(i => i.sessionsTotal > 0 && i.planId);

  const computedInstallments = useMemo(() => buildInstallments(instGroups), [instGroups]);

  const totalPaidNow = negType === 'partial'
    ? paymentsNow.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
    : negType === 'full'
    ? computedInstallments.filter(i => i.receivedNow).reduce((s, i) => s + i.amount, 0)
    : 0;

  const totalInstGroups = instGroups.reduce((s, g) => s + (parseFloat(g.amount) || 0), 0);
  const fullSumDiff     = Math.abs(totalInstGroups - total);
  const fullSumOk       = negType === 'full' && fullSumDiff < 0.02;
  const partialBalance  = Math.max(0, total - totalPaidNow);

  // ── Patient search ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (prefilledPatientId || patientSearch.length < 2) {
      setPatientResults([]); setShowPatientDrop(false); return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await patientsApi.list({ search: patientSearch });
        setPatientResults(Array.isArray(res) ? res : res.data || []);
        setShowPatientDrop(true);
      } catch { setPatientResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [patientSearch, prefilledPatientId]);

  // ── Auto-fill first group amount on mode select ───────────────────────────
  useEffect(() => {
    if (negType === 'full' && total > 0) {
      setInstGroups(prev => [{ ...prev[0], amount: String(total), receivedNow: true }, ...prev.slice(1)]);
    }
    if (negType === 'partial' && total > 0) {
      setPaymentsNow(prev => [{ ...prev[0], amount: '' }, ...prev.slice(1)]);
    }
  }, [negType, total]);

  // ── Item helpers ─────────────────────────────────────────────────────────────
  const updateItem = (key: string, changes: Partial<ItemRow>) =>
    setItems(prev => prev.map(item => {
      if (item.key !== key) return item;
      const next = { ...item, ...changes };
      next.total = Math.max(0, next.unitPrice * next.quantity - next.discount);
      return next;
    }));

  const selectPlan = (key: string, plan: any) =>
    updateItem(key, { planId: plan.id, name: plan.name, unitPrice: plan.price, sessionsTotal: plan.sessionsTotal || 0, discount: 0, total: plan.price });

  // ── InstGroup helpers ────────────────────────────────────────────────────────
  const updateGroup = (key: string, changes: Partial<InstGroup>) =>
    setInstGroups(prev => prev.map(g => g.key === key ? { ...g, ...changes } : g));

  const removeGroup = (key: string) =>
    setInstGroups(prev => prev.filter(g => g.key !== key));

  // ── Mutation ─────────────────────────────────────────────────────────────────
  const mut = useMutation({
    mutationFn: (data: any) => salesApi.create(data),
    onSuccess: () => { onSuccess(); onClose(); },
    onError: (err: any) => {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(' · ') : (msg || 'Erro ao criar venda.'));
    },
  });

  const handleSubmit = () => {
    setError('');
    if (!selectedPatientId)                        { setError('Selecione um paciente.'); return; }
    if (items.some(i => !i.planId))                { setError('Selecione o procedimento em todos os itens.'); return; }
    if (items.length === 0)                        { setError('Adicione pelo menos um item.'); return; }

    if (negType === 'partial') {
      const paid = paymentsNow.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      if (paid <= 0)           { setError('Informe o valor recebido agora.'); return; }
      if (paid > total + 0.01) { setError('Valor recebido não pode ser maior que o total.'); return; }
      if (paymentsNow.some(p => parseFloat(p.amount) > 0 && !p.paymentMethodId)) {
        setError('Informe a forma de pagamento em todos os recebimentos.'); return;
      }
    }

    if (negType === 'full') {
      if (!fullSumOk)                           { setError(`A soma da negociação (${fmt(totalInstGroups)}) precisa fechar o total da venda (${fmt(total)}).`); return; }
      if (computedInstallments.length === 0)    { setError('Configure pelo menos uma parcela.'); return; }
      if (computedInstallments.some(i => !i.dueDate)) { setError('Todas as parcelas precisam ter vencimento.'); return; }
      if (computedInstallments.some(i => i.receivedNow && !i.paymentMethodId)) {
        setError('Informe a forma de pagamento em todos os recebimentos marcados como "Recebido agora".'); return;
      }
    }

    const pnow = negType === 'partial'
      ? paymentsNow.filter(p => parseFloat(p.amount) > 0).map(p => ({
          amount: parseFloat(p.amount),
          paymentMethodId: p.paymentMethodId || null,
          paymentDate: p.paymentDate || null,
        }))
      : [];

    mut.mutate({
      patientId: selectedPatientId,
      items: items.map(i => ({ planId: i.planId || null, name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, discount: i.discount, total: i.total })),
      notes: notes || null,
      generateSessions: negType !== 'none' && genSessions,
      negotiation: {
        type: negType,
        paymentsNow: pnow,
        installments: negType === 'full' ? computedInstallments : [],
      },
    });
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <Portal>
      <style>{`@keyframes nvmSlide { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 620, background: '#FFFFFF', zIndex: 1001, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,.12)', fontFamily: "'Inter', system-ui, sans-serif", animation: 'nvmSlide .22s ease' }}>

        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#09090B' }}>Nova venda / orçamento</div>
            <div style={{ fontSize: 12, color: '#71717A', marginTop: 2 }}>
              {selectedPatientName ? `Paciente: ${selectedPatientName}` : 'Selecione o paciente, itens e negociação'}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, border: 'none', background: '#F4F4F5', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A' }}>
            <i className="ti ti-x" style={{ fontSize: 14 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {error && (
            <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 12, color: '#DC2626' }}>
              {error}
            </div>
          )}

          {/* ── Bloco 1: Paciente ── */}
          {!prefilledPatientId && (
            <div>
              <label style={lbl}>Paciente <span style={{ color: '#DC2626' }}>*</span></label>
              <div style={{ position: 'relative' }}>
                <i className="ti ti-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#A1A1AA', pointerEvents: 'none' }} />
                <input
                  value={selectedPatientId ? selectedPatientName : patientSearch}
                  onChange={e => {
                    if (selectedPatientId) { setSelectedPatientId(''); setSelectedPatientName(''); }
                    setPatientSearch(e.target.value);
                  }}
                  placeholder="Buscar paciente pelo nome, telefone ou CPF..."
                  style={{ ...inp, paddingLeft: 32, paddingRight: selectedPatientId ? 32 : 10, borderColor: selectedPatientId ? '#16A34A' : '#E4E4E7' }}
                />
                {selectedPatientId && (
                  <button onClick={() => { setSelectedPatientId(''); setSelectedPatientName(''); setPatientSearch(''); }}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#A1A1AA', fontSize: 13 }}>
                    ✕
                  </button>
                )}
                {showPatientDrop && patientResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.12)', zIndex: 10, maxHeight: 200, overflowY: 'auto', marginTop: 4 }}>
                    {patientResults.map((p: any) => (
                      <button key={p.id}
                        onClick={() => { setSelectedPatientId(p.id); setSelectedPatientName(p.name); setPatientSearch(''); setShowPatientDrop(false); }}
                        style={{ width: '100%', padding: '10px 14px', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', borderBottom: '1px solid #F4F4F5' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F9F9F9'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#09090B' }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: '#A1A1AA' }}>{p.phone || p.email || '—'}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Bloco 2: Itens ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <label style={{ ...lbl, marginBottom: 0 }}>Procedimentos / Serviços <span style={{ color: '#DC2626' }}>*</span></label>
              <button onClick={() => setItems(prev => [...prev, makeItem()])}
                style={{ height: 28, padding: '0 10px', background: '#F4F4F5', border: '1px solid #E4E4E7', borderRadius: 6, fontSize: 12, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                <i className="ti ti-plus" style={{ fontSize: 12 }} /> Adicionar item
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map((item, idx) => (
                <div key={item.key} style={{ background: '#F8FAFC', border: '1px solid #E4E4E7', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#71717A', textTransform: 'uppercase', letterSpacing: '.04em' }}>Item {idx + 1}</span>
                    {items.length > 1 && (
                      <button onClick={() => setItems(prev => prev.filter(i => i.key !== item.key))}
                        style={{ width: 22, height: 22, border: 'none', background: 'transparent', cursor: 'pointer', color: '#A1A1AA', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4 }}>
                        <i className="ti ti-x" style={{ fontSize: 12 }} />
                      </button>
                    )}
                  </div>
                  <select value={item.planId} onChange={e => {
                    const plan = (plans as any[]).find(p => p.id === e.target.value);
                    if (plan) selectPlan(item.key, plan);
                    else updateItem(item.key, { planId: '', name: '', unitPrice: 0, total: 0, sessionsTotal: 0 });
                  }} style={{ ...inp, cursor: 'pointer', marginBottom: item.planId ? 10 : 0 }}>
                    <option value="">Selecione um procedimento ou serviço...</option>
                    {(plans as any[]).filter((p: any) => p.active !== false).map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name} — {fmt(p.price)}</option>
                    ))}
                  </select>
                  {item.planId && (
                    <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr 1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={{ ...lbl, fontSize: 11 }}>Qtd</label>
                        <input type="number" min="1" value={item.quantity}
                          onChange={e => updateItem(item.key, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                          style={{ ...inp, textAlign: 'center' }} />
                      </div>
                      <div>
                        <label style={{ ...lbl, fontSize: 11 }}>Preço unit. (R$)</label>
                        <input type="number" min="0" value={item.unitPrice}
                          onChange={e => updateItem(item.key, { unitPrice: parseFloat(e.target.value) || 0 })}
                          style={inp} />
                      </div>
                      <div>
                        <label style={{ ...lbl, fontSize: 11 }}>Desconto (R$)</label>
                        <input type="number" min="0" value={item.discount || ''}
                          onChange={e => updateItem(item.key, { discount: parseFloat(e.target.value) || 0 })}
                          placeholder="0" style={inp} />
                      </div>
                      <div>
                        <label style={{ ...lbl, fontSize: 11 }}>Subtotal</label>
                        <div style={{ height: 36, padding: '0 10px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#09090B', display: 'flex', alignItems: 'center' }}>
                          {fmt(item.total)}
                        </div>
                      </div>
                    </div>
                  )}
                  {item.sessionsTotal > 0 && (
                    <div style={{ marginTop: 8, fontSize: 11, color: '#2563EB', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <i className="ti ti-activity" style={{ fontSize: 12 }} />
                      Gera {item.sessionsTotal} sessão{item.sessionsTotal !== 1 ? 'ões' : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {items.some(i => i.planId) && (
              <div style={{ marginTop: 10, padding: '12px 14px', background: '#F4F4F5', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#71717A', marginBottom: 4 }}>
                  <span>Subtotal</span><span>{fmt(subtotal)}</span>
                </div>
                {totalDiscount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#D97706', marginBottom: 4 }}>
                    <span>Descontos</span><span>−{fmt(totalDiscount)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, color: '#09090B', paddingTop: 6, borderTop: '1px solid #E4E4E7', marginTop: 2 }}>
                  <span>Total da venda</span><span>{fmt(total)}</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Observação ── */}
          <div>
            <label style={lbl}>Observação (opcional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Observações internas..."
              style={{ ...inp, height: 58, padding: '8px 10px', resize: 'vertical', lineHeight: 1.5 } as React.CSSProperties} />
          </div>

          {/* ── Bloco 3: Negociação ── */}
          <div style={{ borderTop: '2px solid #F4F4F5', paddingTop: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#09090B', marginBottom: 3 }}>Como será a negociação?</div>
            <div style={{ fontSize: 12, color: '#71717A', marginBottom: 14 }}>A negociação define o que entra no financeiro.</div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
              {([
                { key: 'none'    as NegType, icon: 'ti-clock',          label: 'Sem pagamento',  desc: 'Salvar como orçamento',     color: '#64748B', bg: '#F8FAFC', border: '#CBD5E1' },
                { key: 'partial' as NegType, icon: 'ti-circle-half-2',  label: 'Receber parcial', desc: 'Registrar entrada parcial',  color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
                { key: 'full'    as NegType, icon: 'ti-circle-check',   label: 'Receber total',   desc: 'Negociar valor completo',    color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
              ]).map(opt => {
                const sel = negType === opt.key;
                return (
                  <button key={opt.key} type="button"
                    onClick={() => setNegType(opt.key)}
                    style={{ padding: '10px 8px', borderRadius: 10, border: `2px solid ${sel ? opt.color : opt.border}`, background: sel ? opt.bg : '#FFFFFF', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'all .12s' }}>
                    <i className={`ti ${opt.icon}`} style={{ fontSize: 16, color: opt.color, display: 'block', marginBottom: 4 }} />
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#09090B', marginBottom: 1 }}>{opt.label}</div>
                    <div style={{ fontSize: 10, color: '#71717A' }}>{opt.desc}</div>
                  </button>
                );
              })}
            </div>

            {/* ── Sem pagamento ── */}
            {negType === 'none' && (
              <div style={{ padding: '14px 16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <i className="ti ti-info-circle" style={{ fontSize: 16, color: '#64748B', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#09090B' }}>Será salvo como orçamento</div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 3, lineHeight: 1.5 }}>
                    Nenhum lançamento será criado no financeiro. O orçamento pode ser convertido em venda depois.
                  </div>
                </div>
              </div>
            )}

            {/* ── Receber parcial ── */}
            {negType === 'partial' && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#A16207', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>
                  Valor recebido agora
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {paymentsNow.map((p, idx) => (
                    <div key={p.key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px 32px', gap: 8, alignItems: 'flex-end' }}>
                      <div>
                        {idx === 0 && <div style={{ fontSize: 11, color: '#71717A', fontWeight: 500, marginBottom: 5 }}>Valor (R$) *</div>}
                        <input type="number" min="0" step="0.01" value={p.amount} placeholder="0,00"
                          onChange={e => setPaymentsNow(prev => prev.map((r, i) => i === idx ? { ...r, amount: e.target.value } : r))}
                          style={inp} />
                      </div>
                      <div>
                        {idx === 0 && <div style={{ fontSize: 11, color: '#71717A', fontWeight: 500, marginBottom: 5 }}>Forma de pagamento <span style={{ color: '#DC2626' }}>*</span></div>}
                        <select value={p.paymentMethodId}
                          onChange={e => setPaymentsNow(prev => prev.map((r, i) => i === idx ? { ...r, paymentMethodId: e.target.value } : r))}
                          style={{ ...inp, cursor: 'pointer', borderColor: !p.paymentMethodId ? '#FECACA' : '#E4E4E7' }}>
                          <option value="">Selecione...</option>
                          {(paymentMethods as any[]).map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </div>
                      <div>
                        {idx === 0 && <div style={{ fontSize: 11, color: '#71717A', fontWeight: 500, marginBottom: 5 }}>Data</div>}
                        <input type="date" value={p.paymentDate}
                          onChange={e => setPaymentsNow(prev => prev.map((r, i) => i === idx ? { ...r, paymentDate: e.target.value } : r))}
                          style={inp} />
                      </div>
                      <button onClick={() => setPaymentsNow(prev => prev.filter((_, i) => i !== idx))}
                        disabled={paymentsNow.length === 1}
                        style={{ width: 32, height: 36, border: '1px solid #E4E4E7', background: '#FFFFFF', borderRadius: 8, cursor: paymentsNow.length === 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A1A1AA' }}>
                        <i className="ti ti-trash" style={{ fontSize: 12 }} />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => setPaymentsNow(prev => [...prev, makePmtRow()])}
                    style={{ height: 32, padding: '0 12px', background: 'transparent', border: '1px dashed #FDE68A', borderRadius: 8, fontSize: 12, fontWeight: 500, color: '#A16207', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start' }}>
                    <i className="ti ti-plus" style={{ fontSize: 12 }} /> + Forma de pagamento
                  </button>
                </div>

                {/* Resumo parcial */}
                <div style={{ marginTop: 12, padding: '10px 12px', background: '#FFFFFF', borderRadius: 8, border: '1px solid #FDE68A' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#71717A', marginBottom: 4 }}>
                    <span>Total da venda</span><span style={{ fontWeight: 600, color: '#09090B' }}>{fmt(total)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#71717A', marginBottom: 4 }}>
                    <span>Recebido agora</span><span style={{ fontWeight: 600, color: '#16A34A' }}>{fmt(totalPaidNow)}</span>
                  </div>
                  {partialBalance > 0.01 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, paddingTop: 6, borderTop: '1px solid #FDE68A', marginTop: 3 }}>
                      <span style={{ color: '#71717A' }}>Saldo não negociado</span>
                      <span style={{ fontWeight: 700, color: '#D97706' }}>{fmt(partialBalance)}</span>
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: '#92400E', background: '#FEF3C7', padding: '8px 10px', borderRadius: 6 }}>
                  O saldo restante de <b>{fmt(partialBalance)}</b> ficará na venda como saldo não negociado, sem criar lançamentos no financeiro.
                </div>
              </div>
            )}

            {/* ── Receber total ── */}
            {negType === 'full' && (
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#15803D', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 14 }}>
                  Negociação completa — {fmt(total)}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {instGroups.map((g, gi) => (
                    <div key={g.key} style={{ background: '#FFFFFF', borderRadius: 10, border: '1px solid #BBF7D0', padding: '14px 14px 12px' }}>
                      {/* Group header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#15803D', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                          Forma {gi + 1}
                        </span>
                        {instGroups.length > 1 && (
                          <button onClick={() => removeGroup(g.key)}
                            style={{ width: 22, height: 22, border: 'none', background: 'transparent', cursor: 'pointer', color: '#A1A1AA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="ti ti-x" style={{ fontSize: 12 }} />
                          </button>
                        )}
                      </div>

                      {/* Method + Amount */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                        <div>
                          <label style={{ ...lbl, fontSize: 11 }}>Forma de pagamento *</label>
                          <select value={g.paymentMethodId} onChange={e => updateGroup(g.key, { paymentMethodId: e.target.value })}
                            style={{ ...inp, cursor: 'pointer' }}>
                            <option value="">Selecione...</option>
                            {(paymentMethods as any[]).map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ ...lbl, fontSize: 11 }}>Valor (R$) *</label>
                          <input type="number" min="0" step="0.01" value={g.amount} placeholder="0,00"
                            onChange={e => updateGroup(g.key, { amount: e.target.value })}
                            style={inp} />
                        </div>
                      </div>

                      {/* Parcelas + Data + Frequência */}
                      <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: 8, marginBottom: 10 }}>
                        <div>
                          <label style={{ ...lbl, fontSize: 11 }}>Parcelas</label>
                          <input type="number" min="1" max="120" value={g.count}
                            onChange={e => updateGroup(g.key, { count: Math.max(1, parseInt(e.target.value) || 1) })}
                            style={{ ...inp, textAlign: 'center' }} />
                        </div>
                        <div>
                          <label style={{ ...lbl, fontSize: 11 }}>{g.count > 1 ? '1º vencimento' : 'Vencimento'} *</label>
                          <input type="date" value={g.firstDueDate}
                            onChange={e => updateGroup(g.key, { firstDueDate: e.target.value })}
                            style={inp} />
                        </div>
                        {g.count > 1 && (
                          <div>
                            <label style={{ ...lbl, fontSize: 11 }}>Frequência</label>
                            <select value={g.frequency} onChange={e => updateGroup(g.key, { frequency: e.target.value })}
                              style={{ ...inp, cursor: 'pointer' }}>
                              {FREQ_OPTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                            </select>
                          </div>
                        )}
                      </div>

                      {/* Recebido agora toggle */}
                      <button onClick={() => updateGroup(g.key, { receivedNow: !g.receivedNow })}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0', fontFamily: 'inherit' }}>
                        <div style={{ width: 36, height: 20, borderRadius: 99, background: g.receivedNow ? '#16A34A' : '#E4E4E7', position: 'relative', transition: 'background .15s', flexShrink: 0 }}>
                          <div style={{ position: 'absolute', top: 2, left: g.receivedNow ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#FFFFFF', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 500, color: g.receivedNow ? '#16A34A' : '#71717A' }}>
                          {g.receivedNow ? 'Recebido agora' : 'Agendar para receber'}
                        </span>
                      </button>

                      {/* Parcelas preview */}
                      {(parseFloat(g.amount) || 0) > 0 && g.count > 1 && g.firstDueDate && (
                        <div style={{ marginTop: 10, background: '#F0FDF4', borderRadius: 8, padding: '10px 12px', border: '1px solid #BBF7D0' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#15803D', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                            Parcelas geradas
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {buildInstallments([g]).map((inst, ii) => (
                              <div key={ii} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#374151' }}>
                                <span style={{ color: '#71717A' }}>{ii + 1}/{g.count} — {new Date(inst.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                <span style={{ fontWeight: 600, color: '#09090B' }}>{fmt(inst.amount)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Adicionar forma */}
                  <button onClick={() => setInstGroups(prev => [...prev, makeInstGroup()])}
                    style={{ height: 36, padding: '0 14px', background: 'transparent', border: '1px dashed #BBF7D0', borderRadius: 8, fontSize: 12, fontWeight: 500, color: '#15803D', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start' }}>
                    <i className="ti ti-plus" style={{ fontSize: 12 }} /> Adicionar forma de pagamento
                  </button>
                </div>

                {/* Resumo full */}
                <div style={{ marginTop: 14, padding: '12px 14px', background: '#FFFFFF', borderRadius: 8, border: `1px solid ${fullSumOk ? '#BBF7D0' : '#FECACA'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#71717A', marginBottom: 4 }}>
                    <span>Total da venda</span><span style={{ fontWeight: 600, color: '#09090B' }}>{fmt(total)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#71717A', marginBottom: 4 }}>
                    <span>Soma da negociação</span>
                    <span style={{ fontWeight: 600, color: fullSumOk ? '#16A34A' : '#DC2626' }}>{fmt(totalInstGroups)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#71717A', marginBottom: 4 }}>
                    <span>Recebido agora</span>
                    <span style={{ fontWeight: 600, color: totalPaidNow > 0 ? '#16A34A' : '#A1A1AA' }}>{fmt(totalPaidNow)}</span>
                  </div>
                  {computedInstallments.length > 0 && (
                    <div style={{ paddingTop: 6, borderTop: `1px solid ${fullSumOk ? '#BBF7D0' : '#FECACA'}`, marginTop: 3, fontSize: 12, color: '#71717A' }}>
                      <span>{computedInstallments.length} lançamento{computedInstallments.length !== 1 ? 's' : ''} serão criados no financeiro</span>
                    </div>
                  )}
                  {!fullSumOk && totalInstGroups > 0 && (
                    <div style={{ fontSize: 11, color: '#DC2626', marginTop: 6 }}>
                      Diferença de {fmt(Math.abs(totalInstGroups - total))} — ajuste os valores para fechar o total.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Geração de sessões ── */}
          {negType !== 'none' && hasSessionItems && (
            <div style={{ padding: '12px 14px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#1D4ED8', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                <i className="ti ti-activity" style={{ fontSize: 13 }} />
                {items.filter(i => i.sessionsTotal > 0 && i.planId).map(i => `${i.name} (${i.sessionsTotal} sessão${i.sessionsTotal !== 1 ? 'ões' : ''})`).join(', ')}
              </div>
              <div style={{ fontSize: 12, color: '#374151', marginBottom: 8 }}>Gerar as sessões automaticamente?</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[{ v: true, label: 'Gerar sessões agora' }, { v: false, label: 'Gerar depois' }].map(opt => (
                  <button key={String(opt.v)} onClick={() => setGenSessions(opt.v)}
                    style={{ flex: 1, height: 34, background: genSessions === opt.v ? '#2563EB' : '#FFFFFF', border: `1px solid ${genSessions === opt.v ? '#2563EB' : '#BFDBFE'}`, borderRadius: 8, fontSize: 12, fontWeight: genSessions === opt.v ? 600 : 400, color: genSessions === opt.v ? '#FFFFFF' : '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #E4E4E7', display: 'flex', gap: 10, flexShrink: 0, background: '#FAFAFA' }}>
          <button onClick={onClose}
            style={{ flex: 1, height: 40, border: '1px solid #E4E4E7', background: '#FFFFFF', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={mut.isPending}
            style={{ flex: 2, height: 40, background: mut.isPending ? '#A1A1AA' : '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#FFFFFF', cursor: mut.isPending ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {mut.isPending ? (
              <><div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Salvando...</>
            ) : (
              <><i className="ti ti-check" style={{ fontSize: 14 }} />
                {negType === 'none' ? 'Salvar orçamento' : negType === 'partial' ? 'Salvar venda parcial' : 'Salvar e gerar lançamentos'}</>
            )}
          </button>
        </div>
      </div>
    </Portal>
  );
}
