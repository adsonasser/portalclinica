import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { salesApi, financialApi, patientsApi } from '../../services/api';
import { NovaVendaModal } from '../../components/NovaVendaModal';
import { TableActions } from '../../components/ui/TableActions';
import { useToast } from '../../components/ui/Toast';
import { Portal } from '../../components/ui/Portal';

// ─── Types ────────────────────────────────────────────────────────────────────
type SaleStatus       = 'pago' | 'parcial' | 'nao_recebido' | 'vencido' | 'cancelado';
type SaleType         = 'venda' | 'orcamento';
type ContaItemType    = 'entrada' | 'saida' | 'receber' | 'pagar';
type ContaStatus      = 'a_vencer' | 'vence_hoje' | 'vencido' | 'pago' | 'recebido' | 'cancelado' | 'em_aberto';
type ContaConferencia = 'PENDENTE' | 'CONFERIDO' | 'DIVERGENTE';
type MainTab          = 'vendas' | 'contas' | 'relatorios';

interface Sale {
  id: string; date: string; patient: string; patientId?: string; phone: string;
  item: string; desc: string;
  total: number; received: number; open: number;
  type: SaleType; status: SaleStatus;
  hasFinancialIssue: boolean;
  createdAt: Date;
  raw: any;
}

interface Conta {
  id: string;
  vencimento: string;
  tipo: ContaItemType;
  pessoa: string;
  phone: string;
  descricao: string;
  referencia: string;
  formaPagamento: string;
  valor: number;
  status: ContaStatus;
  saleId: string | null;
  rawType: string;
  rawStatus: string;
  // Conferência
  statusConferencia: ContaConferencia;
  dataConferencia: string | null;
  usuarioConferencia: string | null;
  motivoDivergencia: string | null;
  // Datas originais para ordenação e exibição
  effectiveDate: number;
  dueDateStr: string | null;
  paidAtStr: string | null;
  notes: string | null;
  raw: any;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────
function mapApiSale(s: any): Sale {
  return {
    id:                s.id,
    date:              new Date(s.createdAt).toLocaleDateString('pt-BR'),
    patient:           s.patient?.name || 'Desconhecido',
    patientId:         s.patientId || s.patient?.id,
    phone:             s.patient?.phone || '—',
    item:              s.items?.[0]?.name || 'Procedimento',
    desc:              s.notes || '',
    total:             s.total,
    received:          s.paidAmount ?? 0,
    open:              Math.max(0, s.total - (s.paidAmount ?? 0)),
    type:              s.saleType === 'ORCAMENTO' ? 'orcamento' : 'venda',
    status:            s.status === 'PAID' ? 'pago' : s.status === 'PARTIAL' ? 'parcial' : s.status === 'CANCELLED' ? 'cancelado' : 'nao_recebido',
    hasFinancialIssue: s.hasFinancialIssue ?? false,
    createdAt:         new Date(s.createdAt),
    raw:               s,
  };
}

function mapApiTransaction(t: any): Conta {
  const isPaid   = t.status === 'PAID';
  const isIncome = t.type   === 'INCOME';

  let tipo: ContaItemType;
  if (isPaid && isIncome)  tipo = 'entrada';
  else if (isPaid)         tipo = 'saida';
  else if (isIncome)       tipo = 'receber';
  else                     tipo = 'pagar';

  let status: ContaStatus;
  if (t.status === 'PAID')           status = isIncome ? 'recebido' : 'pago';
  else if (t.status === 'CANCELLED') status = 'cancelado';
  else if (!t.dueDate)               status = 'em_aberto';
  else {
    const due = new Date(t.dueDate);
    const now = new Date(); now.setHours(0,0,0,0);
    const tom = new Date(now); tom.setDate(tom.getDate() + 1);
    if (due < now)      status = 'vencido';
    else if (due < tom) status = 'vence_hoje';
    else                status = 'a_vencer';
  }

  const effectiveDateRaw = isPaid
    ? (t.paidAt   ? new Date(t.paidAt).getTime()   : new Date(t.createdAt).getTime())
    : (t.dueDate  ? new Date(t.dueDate).getTime()  : new Date(t.createdAt).getTime());

  const vencimento = isPaid
    ? (t.paidAt  ? new Date(t.paidAt).toLocaleDateString('pt-BR')  : '—')
    : (t.dueDate ? new Date(t.dueDate).toLocaleDateString('pt-BR') : new Date(t.createdAt).toLocaleDateString('pt-BR'));

  return {
    id:                t.id,
    vencimento,
    tipo,
    pessoa:            t.sale?.patient?.name || t.contactName || '—',
    phone:             t.sale?.patient?.phone || '—',
    descricao:         t.description,
    referencia:        t.saleId ? `Venda #${String(t.saleId).slice(-6).toUpperCase()}` : (t.notes || '—'),
    formaPagamento:    t.paymentMethod?.name || '—',
    valor:             t.amount,
    status,
    saleId:            t.saleId || null,
    rawType:           t.type,
    rawStatus:         t.status,
    statusConferencia: (t.statusConferencia as ContaConferencia) || 'PENDENTE',
    dataConferencia:   t.dataConferencia ? new Date(t.dataConferencia).toLocaleString('pt-BR') : null,
    usuarioConferencia:t.usuarioConferencia || null,
    motivoDivergencia: t.motivoDivergencia || null,
    effectiveDate:     effectiveDateRaw,
    dueDateStr:        t.dueDate ? new Date(t.dueDate).toLocaleDateString('pt-BR') : null,
    paidAtStr:         t.paidAt  ? new Date(t.paidAt).toLocaleString('pt-BR') : null,
    notes:             t.notes || null,
    raw:               t,
  };
}

// ─── Config ───────────────────────────────────────────────────────────────────
const SALE_STATUS: Record<SaleStatus, { bg:string; color:string; label:string }> = {
  pago:         { bg:'#DCFCE7', color:'#16A34A', label:'Pago' },
  parcial:      { bg:'#FEF9C3', color:'#A16207', label:'Parcial' },
  nao_recebido: { bg:'#EFF6FF', color:'#2563EB', label:'Não recebido' },
  vencido:      { bg:'#FEF2F2', color:'#DC2626', label:'Vencido' },
  cancelado:    { bg:'#F4F4F5', color:'#71717A', label:'Cancelado' },
};
const SALE_TYPE: Record<SaleType, { bg:string; color:string; label:string }> = {
  venda:     { bg:'#DCFCE7', color:'#16A34A', label:'Venda' },
  orcamento: { bg:'#EFF6FF', color:'#1D4ED8', label:'Orçamento' },
};
const CONTA_TIPO: Record<ContaItemType, { bg:string; color:string; label:string; icon:string }> = {
  entrada: { bg:'#DCFCE7', color:'#16A34A', label:'Entrada',   icon:'ti-circle-arrow-down' },
  saida:   { bg:'#FEE2E2', color:'#B91C1C', label:'Saída',     icon:'ti-circle-arrow-up' },
  receber: { bg:'#EFF6FF', color:'#2563EB', label:'A receber', icon:'ti-clock' },
  pagar:   { bg:'#FEF3C7', color:'#D97706', label:'A pagar',   icon:'ti-clock' },
};
const CONTA_STATUS: Record<ContaStatus, { bg:string; color:string; label:string }> = {
  a_vencer:   { bg:'#EFF6FF', color:'#2563EB', label:'A vencer' },
  vence_hoje: { bg:'#FFF7ED', color:'#C2410C', label:'Vence hoje' },
  vencido:    { bg:'#FEF2F2', color:'#DC2626', label:'Vencido' },
  pago:       { bg:'#DCFCE7', color:'#16A34A', label:'Pago' },
  recebido:   { bg:'#DCFCE7', color:'#16A34A', label:'Recebido' },
  cancelado:  { bg:'#F4F4F5', color:'#71717A', label:'Cancelado' },
  em_aberto:  { bg:'#F4F4F5', color:'#71717A', label:'Em aberto' },
};
const CONF_STATUS: Record<ContaConferencia, { bg:string; color:string; label:string; icon:string }> = {
  PENDENTE:   { bg:'#F4F4F5', color:'#71717A', label:'Pendente',   icon:'ti-clock' },
  CONFERIDO:  { bg:'#DCFCE7', color:'#16A34A', label:'Conferido',  icon:'ti-circle-check' },
  DIVERGENTE: { bg:'#FEF2F2', color:'#DC2626', label:'Divergente', icon:'ti-alert-triangle' },
};

const fmt = (v: number) => v.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
const inp: React.CSSProperties = { width:'100%', height:38, padding:'0 12px', border:'1px solid #E4E4E7', borderRadius:8, fontSize:13, color:'#09090B', background:'#FFFFFF', outline:'none', boxSizing:'border-box', fontFamily:'inherit' };
const lbl: React.CSSProperties = { display:'block', fontSize:12, fontWeight:500, color:'#71717A', marginBottom:5 };

// ─── Period helpers ───────────────────────────────────────────────────────────
type PeriodKey = 'all_time' | 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_30' | 'last_month' | 'custom';

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'all_time',   label: 'Todos os períodos' },
  { key: 'today',      label: 'Hoje' },
  { key: 'yesterday',  label: 'Ontem' },
  { key: 'this_week',  label: 'Esta semana' },
  { key: 'this_month', label: 'Este mês' },
  { key: 'last_30',    label: 'Últimos 30 dias' },
  { key: 'last_month', label: 'Mês passado' },
  { key: 'custom',     label: 'Personalizado' },
];

function computePeriodRange(period: PeriodKey, customStart?: string, customEnd?: string): { start: Date; end: Date } {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eod   = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  if (period === 'all_time')  return { start: new Date(0), end: new Date(9999, 11, 31) };
  if (period === 'today')     return { start: today, end: eod(today) };
  if (period === 'yesterday') {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    return { start: y, end: eod(y) };
  }
  if (period === 'this_week') {
    const dow  = today.getDay();
    const mon  = new Date(today); mon.setDate(today.getDate() - dow + (dow === 0 ? -6 : 1));
    return { start: mon, end: eod(today) };
  }
  if (period === 'this_month') {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: eod(today) };
  }
  if (period === 'last_30') {
    const s = new Date(today); s.setDate(s.getDate() - 29);
    return { start: s, end: eod(today) };
  }
  if (period === 'last_month') {
    const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const e = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: s, end: eod(e) };
  }
  // custom
  const s = customStart ? new Date(customStart + 'T00:00:00') : today;
  const e = customEnd   ? new Date(customEnd   + 'T23:59:59') : eod(today);
  return { start: s, end: e };
}

function periodLabel(period: PeriodKey, customStart?: string, customEnd?: string): string {
  if (period === 'custom') {
    const fmtD = (d?: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '?';
    return `${fmtD(customStart)} - ${fmtD(customEnd)}`;
  }
  return PERIOD_OPTIONS.find(p => p.key === period)?.label || '';
}

function isPendingFinancialEntry(c: Conta): boolean {
  if (c.rawStatus === 'CANCELLED') return false;
  if (c.rawStatus === 'PENDING')   return true;
  if (c.rawStatus === 'PAID') return c.statusConferencia === 'PENDENTE' || c.statusConferencia === 'DIVERGENTE';
  return false;
}

// ─── Period Dropdown ──────────────────────────────────────────────────────────
function PeriodDropdown({ period, customStart, customEnd, onChange }: {
  period: PeriodKey;
  customStart: string;
  customEnd: string;
  onChange: (period: PeriodKey, customStart?: string, customEnd?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref             = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const label = periodLabel(period, customStart, customEnd);

  return (
    <div ref={ref} style={{ position:'relative', flexShrink:0 }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ height:36, padding:'0 14px', border:'1px solid #E4E4E7', borderRadius:99, fontSize:12, fontWeight:500, color:'#09090B', background:'#FFFFFF', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit', whiteSpace:'nowrap' }}>
        <i className="ti ti-calendar" style={{ fontSize:13, color:'#71717A' }} />
        {label}
        <i className="ti ti-chevron-down" style={{ fontSize:11, color:'#A1A1AA', transform:open?'rotate(180deg)':'none', transition:'transform .15s' }} />
      </button>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, zIndex:200, background:'#FFFFFF', borderRadius:12, border:'1px solid #E4E4E7', boxShadow:'0 8px 24px rgba(0,0,0,0.10)', padding:'6px', minWidth:190, animation:'fadeUp .12s ease' }}>
          {PERIOD_OPTIONS.map(opt => (
            <button key={opt.key} onClick={() => { onChange(opt.key, customStart, customEnd); if (opt.key !== 'custom') setOpen(false); }}
              style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', padding:'8px 12px', borderRadius:8, border:'none', fontSize:12, fontWeight:period===opt.key?600:400, color:period===opt.key?'#09090B':'#374151', background:period===opt.key?'#F4F4F5':'transparent', cursor:'pointer', fontFamily:'inherit', textAlign:'left' }}>
              {opt.label}
              {period === opt.key && <i className="ti ti-check" style={{ fontSize:12, color:'#09090B' }} />}
            </button>
          ))}
          {period === 'custom' && (
            <div style={{ padding:'8px 8px 4px', borderTop:'1px solid #F4F4F5', marginTop:4, display:'flex', flexDirection:'column', gap:6 }}>
              <div style={{ fontSize:10, fontWeight:600, color:'#A1A1AA', textTransform:'uppercase', letterSpacing:'.05em' }}>Intervalo personalizado</div>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <input type="date" value={customStart} onChange={e => onChange('custom', e.target.value, customEnd)}
                  style={{ flex:1, height:30, padding:'0 8px', border:'1px solid #E4E4E7', borderRadius:6, fontSize:11, color:'#09090B', background:'#FFFFFF', outline:'none', fontFamily:'inherit' }} />
                <span style={{ fontSize:11, color:'#A1A1AA' }}>—</span>
                <input type="date" value={customEnd} onChange={e => onChange('custom', customStart, e.target.value)}
                  style={{ flex:1, height:30, padding:'0 8px', border:'1px solid #E4E4E7', borderRadius:6, fontSize:11, color:'#09090B', background:'#FFFFFF', outline:'none', fontFamily:'inherit' }} />
              </div>
              <button onClick={() => setOpen(false)}
                style={{ height:28, background:'#000', border:'none', borderRadius:6, fontSize:11, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>Aplicar</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function currentUserName(): string {
  try { return JSON.parse(localStorage.getItem('user') || '{}').name || 'Usuário'; } catch { return 'Usuário'; }
}

// ─── Painel: Registrar Recebimento (venda) ───────────────────────────────────
interface PaymentRow { id: number; amount: string; pmId: string; date: string; }
type SaldoAction = 'manter' | 'unica' | 'parcelar';

function ReceberPanel({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const qc = useQueryClient();

  const [rows, setRows] = useState<PaymentRow[]>([
    { id: 1, amount: String(sale.open), pmId: '', date: new Date().toISOString().slice(0, 10) },
  ]);
  const [saldoAction, setSaldoAction] = useState<SaldoAction>('manter');
  const [parcelasQtd, setParcelasQtd] = useState('2');
  const [parcelasDue, setParcelasDue] = useState('');
  const [error,       setError]       = useState('');
  const [saving,      setSaving]      = useState(false);

  const { data: paymentMethods = [] } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => financialApi.paymentMethods(),
  });

  const { data: rawTxs = [] } = useQuery<any[]>({
    queryKey: ['transactions'],
    queryFn: () => financialApi.transactions(),
  });

  const saleHistory = useMemo(() =>
    (rawTxs as any[])
      .filter(t => t.saleId === sale.id && t.status === 'PAID')
      .map(t => ({
        id:    t.id,
        data:  new Date(t.paidAt || t.createdAt).toLocaleDateString('pt-BR'),
        valor: t.amount as number,
        forma: t.paymentMethod?.name || '—',
      })),
    [rawTxs, sale.id],
  );

  const totalPaying   = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const saldoRestante = Math.max(0, sale.open - totalPaying);

  const addRow = () => {
    setRows(prev => [
      ...prev,
      { id: Date.now(), amount: String(Math.max(0, saldoRestante).toFixed(2)), pmId: '', date: new Date().toISOString().slice(0, 10) },
    ]);
  };

  const updateRow = (id: number, key: keyof PaymentRow, val: string) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, [key]: val } : r));

  const removeRow = (id: number) =>
    setRows(prev => prev.filter(r => r.id !== id));

  const handleConfirm = async () => {
    if (rows.length === 0) { setError('Adicione ao menos uma linha de recebimento.'); return; }
    if (rows.some(r => !r.amount || parseFloat(r.amount) <= 0)) { setError('Informe um valor válido em todas as linhas.'); return; }
    setError('');
    setSaving(true);
    try {
      for (const row of rows) {
        await salesApi.receive(sale.id, {
          amount: parseFloat(row.amount),
          paymentMethodId: row.pmId || null,
          paymentDate:     row.date || null,
        });
      }

      if (saldoRestante > 0.01) {
        if (saldoAction === 'unica') {
          await financialApi.createTransaction({
            type:        'INCOME',
            status:      'PENDING',
            description: sale.item,
            contactName: sale.patient,
            amount:      saldoRestante,
            dueDate:     parcelasDue || undefined,
          });
        } else if (saldoAction === 'parcelar') {
          const n = Math.max(2, parseInt(parcelasQtd) || 2);
          const installValue = saldoRestante / n;
          for (let i = 0; i < n; i++) {
            let due: string | undefined;
            if (parcelasDue) {
              const d = new Date(parcelasDue);
              d.setMonth(d.getMonth() + i);
              due = d.toISOString().slice(0, 10);
            }
            await financialApi.createTransaction({
              type:        'INCOME',
              status:      'PENDING',
              description: `${sale.item} — Parcela ${i + 1}/${n}`,
              contactName: sale.patient,
              amount:      installValue,
              dueDate:     due,
            });
          }
        }
      }

      qc.invalidateQueries({ queryKey: ['all-sales'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['financial-summary'] });
      onClose();
    } catch {
      setError('Erro ao registrar recebimento. Tente novamente.');
      setSaving(false);
    }
  };

  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.3)', zIndex:350 }} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:640, background:'#FFFFFF', zIndex:351, boxShadow:'-4px 0 40px rgba(0,0,0,.14)', display:'flex', flexDirection:'column', fontFamily:"'Inter', system-ui, sans-serif", animation:'slideIn .22s ease' }}>

        {/* Header */}
        <div style={{ padding:'20px 28px', borderBottom:'1px solid #E4E4E7', display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:17, fontWeight:700, color:'#09090B' }}>Registrar recebimento</div>
            <div style={{ fontSize:12, color:'#71717A', marginTop:3 }}>{sale.patient} · {sale.item}</div>
          </div>
          <button onClick={onClose} style={{ width:30, height:30, border:'none', background:'#F4F4F5', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#71717A', flexShrink:0 }}>
            <i className="ti ti-x" style={{ fontSize:13 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column' }}>

          {/* Resumo da venda */}
          <div style={{ padding:'20px 28px', borderBottom:'1px solid #F4F4F5' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#A1A1AA', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:12 }}>Resumo da venda</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
              {[
                { label:'Valor total',     value: fmt(sale.total),    color:'#09090B' },
                { label:'Já recebido',     value: fmt(sale.received), color:'#16A34A' },
                { label:'Saldo em aberto', value: fmt(sale.open),     color:'#DC2626' },
              ].map(s => (
                <div key={s.label} style={{ background:'#F8FAFC', borderRadius:10, padding:'12px 14px', border:'1px solid #E4E4E7' }}>
                  <div style={{ fontSize:10, color:'#A1A1AA', fontWeight:500, marginBottom:4, textTransform:'uppercase', letterSpacing:'.05em' }}>{s.label}</div>
                  <div style={{ fontSize:16, fontWeight:700, color:s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Histórico de pagamentos */}
          {saleHistory.length > 0 && (
            <div style={{ padding:'20px 28px', borderBottom:'1px solid #F4F4F5' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#A1A1AA', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:12 }}>Histórico de pagamentos</div>
              <div style={{ background:'#FAFAFA', borderRadius:10, border:'1px solid #E4E4E7', overflow:'hidden' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr style={{ background:'#F4F4F5' }}>
                      {['Data','Valor','Forma de pagamento'].map(h => (
                        <th key={h} style={{ padding:'8px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'#71717A', textTransform:'uppercase', letterSpacing:'.06em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {saleHistory.map(h => (
                      <tr key={h.id} style={{ borderTop:'1px solid #F4F4F5' }}>
                        <td style={{ padding:'9px 14px', fontSize:12, color:'#71717A' }}>{h.data}</td>
                        <td style={{ padding:'9px 14px', fontSize:13, fontWeight:600, color:'#16A34A' }}>{fmt(h.valor)}</td>
                        <td style={{ padding:'9px 14px', fontSize:12, color:'#374151' }}>{h.forma}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Novo recebimento */}
          <div style={{ padding:'20px 28px', borderBottom:'1px solid #F4F4F5' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#A1A1AA', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:12 }}>Novo recebimento</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {rows.map((row, idx) => (
                <div key={row.id} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 140px 36px', gap:8, alignItems:'flex-end' }}>
                  <div>
                    {idx === 0 && <div style={{ fontSize:11, fontWeight:500, color:'#71717A', marginBottom:5 }}>Valor (R$)</div>}
                    <input type="number" min="0" step="0.01" value={row.amount} onChange={e => updateRow(row.id, 'amount', e.target.value)}
                      style={{ ...inp, height:36 }} placeholder="0,00" />
                  </div>
                  <div>
                    {idx === 0 && <div style={{ fontSize:11, fontWeight:500, color:'#71717A', marginBottom:5 }}>Forma de pagamento</div>}
                    <select value={row.pmId} onChange={e => updateRow(row.id, 'pmId', e.target.value)}
                      style={{ ...inp, height:36, cursor:'pointer' }}>
                      <option value="">Não informado</option>
                      {(paymentMethods as any[]).map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                  <div>
                    {idx === 0 && <div style={{ fontSize:11, fontWeight:500, color:'#71717A', marginBottom:5 }}>Data</div>}
                    <input type="date" value={row.date} onChange={e => updateRow(row.id, 'date', e.target.value)}
                      style={{ ...inp, height:36 }} />
                  </div>
                  <button onClick={() => removeRow(row.id)} disabled={rows.length === 1}
                    style={{ width:36, height:36, border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:8, cursor:rows.length===1?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:rows.length===1?'#D1D5DB':'#71717A', flexShrink:0 }}>
                    <i className="ti ti-trash" style={{ fontSize:13 }} />
                  </button>
                </div>
              ))}
              <button onClick={addRow} style={{ height:34, padding:'0 12px', background:'transparent', border:'1px dashed #D4D4D8', borderRadius:8, fontSize:12, fontWeight:500, color:'#71717A', cursor:'pointer', display:'flex', alignItems:'center', gap:5, fontFamily:'inherit', alignSelf:'flex-start', marginTop:4 }}>
                <i className="ti ti-plus" style={{ fontSize:12 }} /> Adicionar outra forma de pagamento
              </button>
            </div>
          </div>

          {/* Saldo restante */}
          <div style={{ padding:'20px 28px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#A1A1AA', textTransform:'uppercase', letterSpacing:'.07em' }}>Saldo restante</div>
              <div style={{ fontSize:16, fontWeight:700, color:saldoRestante > 0.01 ? '#DC2626' : '#16A34A' }}>
                {saldoRestante > 0.01 ? `${fmt(saldoRestante)} em aberto` : 'Quitado'}
              </div>
            </div>

            {saldoRestante > 0.01 ? (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {([
                  { key:'manter',   label:'Manter em aberto',      desc:'O saldo fica pendente para recebimento futuro' },
                  { key:'unica',    label:'Registrar parcela única', desc:'Cria uma conta a receber pelo valor restante' },
                  { key:'parcelar', label:'Parcelar saldo',         desc:'Divide o saldo em parcelas mensais' },
                ] as { key: SaldoAction; label: string; desc: string }[]).map(opt => (
                  <label key={opt.key} onClick={() => setSaldoAction(opt.key)}
                    style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 14px', border:`1px solid ${saldoAction===opt.key?'#000000':'#E4E4E7'}`, borderRadius:10, cursor:'pointer', background:saldoAction===opt.key?'#FAFAFA':'#FFFFFF' }}>
                    <div style={{ width:16, height:16, borderRadius:'50%', border:`2px solid ${saldoAction===opt.key?'#000000':'#D4D4D8'}`, background:saldoAction===opt.key?'#000000':'#FFFFFF', flexShrink:0, marginTop:2, display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {saldoAction === opt.key && <div style={{ width:6, height:6, borderRadius:'50%', background:'#FFFFFF' }} />}
                    </div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:'#09090B' }}>{opt.label}</div>
                      <div style={{ fontSize:11, color:'#71717A', marginTop:2 }}>{opt.desc}</div>
                    </div>
                  </label>
                ))}

                {(saldoAction === 'unica' || saldoAction === 'parcelar') && (
                  <div style={{ padding:'14px', background:'#F8FAFC', borderRadius:10, border:'1px solid #E4E4E7', display:'flex', flexWrap:'wrap', gap:14, marginTop:4 }}>
                    {saldoAction === 'parcelar' && (
                      <div>
                        <div style={{ fontSize:11, fontWeight:500, color:'#71717A', marginBottom:5 }}>Número de parcelas</div>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <input type="number" min="2" max="60" value={parcelasQtd} onChange={e => setParcelasQtd(e.target.value)}
                            style={{ ...inp, width:72, height:34 }} />
                          {parseInt(parcelasQtd) >= 2 && (
                            <span style={{ fontSize:12, color:'#374151' }}>
                              {parcelasQtd}× de <b style={{ color:'#09090B' }}>{fmt(saldoRestante / (parseInt(parcelasQtd) || 2))}</b>
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize:11, fontWeight:500, color:'#71717A', marginBottom:5 }}>
                        {saldoAction === 'parcelar' ? 'Vencimento da 1ª parcela' : 'Data de vencimento'}
                      </div>
                      <input type="date" value={parcelasDue} onChange={e => setParcelasDue(e.target.value)}
                        style={{ ...inp, height:34 }} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px', background:'#F0FDF4', borderRadius:10, border:'1px solid #BBF7D0' }}>
                <i className="ti ti-circle-check" style={{ fontSize:20, color:'#16A34A' }} />
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#16A34A' }}>Venda totalmente quitada</div>
                  <div style={{ fontSize:11, color:'#71717A', marginTop:2 }}>O status da venda será atualizado para "Pago".</div>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div style={{ margin:'0 28px 20px', fontSize:12, color:'#DC2626', padding:'9px 12px', background:'#FEF2F2', borderRadius:8, border:'1px solid #FECACA' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'14px 28px', borderTop:'1px solid #E4E4E7', background:'#FAFAFA', flexShrink:0, display:'flex', gap:10 }}>
          <button onClick={onClose} style={{ flex:1, height:40, border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:8, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit' }}>
            Cancelar
          </button>
          <button onClick={handleConfirm} disabled={saving}
            style={{ flex:2, height:40, background:saving?'#A1A1AA':'#16A34A', border:'none', borderRadius:8, fontSize:13, fontWeight:600, color:'#FFFFFF', cursor:saving?'not-allowed':'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
            {saving
              ? <><div style={{ width:13, height:13, border:'2px solid rgba(255,255,255,.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} /> Registrando...</>
              : <><i className="ti ti-circle-check" style={{ fontSize:14 }} /> Registrar recebimento</>}
          </button>
        </div>
      </div>
    </Portal>
  );
}

// ─── Modal: Nova Conta ────────────────────────────────────────────────────────
// ─── DRE Accounts helpers ────────────────────────────────────────────────────
const DRE_DEFAULTS = [
  { id:'dre_1',  name:'Consultas',                type:'receita' },
  { id:'dre_2',  name:'Procedimentos estéticos',  type:'receita' },
  { id:'dre_3',  name:'Materiais vendidos',        type:'receita' },
  { id:'dre_4',  name:'Planos e mensalidades',     type:'receita' },
  { id:'dre_5',  name:'Outras receitas',           type:'receita' },
  { id:'dre_6',  name:'Aluguel',                   type:'despesa' },
  { id:'dre_7',  name:'Material de consumo',       type:'despesa' },
  { id:'dre_8',  name:'Folha de pagamento',        type:'despesa' },
  { id:'dre_9',  name:'Equipamentos',              type:'despesa' },
  { id:'dre_10', name:'Marketing e publicidade',   type:'despesa' },
  { id:'dre_11', name:'Outras despesas',           type:'despesa' },
];

function getDreAccounts() {
  try {
    const raw = localStorage.getItem('pcl_dre_accounts');
    if (raw) return JSON.parse(raw) as typeof DRE_DEFAULTS;
  } catch {}
  return DRE_DEFAULTS;
}

// ─── Painel: Nova Receita / Nova Despesa ──────────────────────────────────────
function NovaLancamentoPanel({ mode, onClose }: { mode: 'receita' | 'despesa'; onClose: () => void }) {
  const qc = useQueryClient();
  const isReceita = mode === 'receita';
  const accentColor = isReceita ? '#16A34A' : '#DC2626';
  const accentBg    = isReceita ? '#DCFCE7' : '#FEF2F2';

  const [contactName, setContactName]   = useState('');
  const [suggestions, setSuggestions]   = useState<any[]>([]);
  const [showSugg,    setShowSugg]      = useState(false);
  const [descricao,   setDescricao]     = useState('');
  const [valor,       setValor]         = useState('');
  const [dueDate,     setDueDate]       = useState('');
  const [dreId,       setDreId]         = useState('');
  const [pmId,        setPmId]          = useState('');
  const [referencia,  setReferencia]    = useState('');
  const [error,       setError]         = useState('');
  const suggRef = useRef<HTMLDivElement>(null);

  const dreAccounts = getDreAccounts().filter(d => d.type === mode);

  const { data: paymentMethods = [] } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => financialApi.paymentMethods(),
  });

  // Debounced patient search
  useEffect(() => {
    if (contactName.length < 2) { setSuggestions([]); setShowSugg(false); return; }
    const t = setTimeout(async () => {
      try {
        const res = await patientsApi.list({ search: contactName });
        const list = (res as any[]).slice(0, 6);
        setSuggestions(list);
        setShowSugg(list.length > 0);
      } catch { setSuggestions([]); }
    }, 280);
    return () => clearTimeout(t);
  }, [contactName]);

  // Close suggestions on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => { if (suggRef.current && !suggRef.current.contains(e.target as Node)) setShowSugg(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const saveMut = useMutation({
    mutationFn: (data: any) => financialApi.createTransaction(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['financial-summary'] });
      onClose();
    },
    onError: (err: any) => {
      console.error('[NovaLancamento] erro ao salvar:', err?.response?.data ?? err?.message ?? err);
      const msg = err?.response?.data?.message;
      setError(msg ? `Erro: ${Array.isArray(msg) ? msg.join(', ') : msg}` : 'Erro ao salvar. Tente novamente.');
    },
  });

  const handleSave = () => {
    if (!descricao.trim()) { setError('Informe a descrição.'); return; }
    const parsedAmount = parseFloat(String(valor).replace(',', '.'));
    if (!valor.trim() || !isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Informe um valor válido.'); return;
    }
    setError('');
    const selectedDre = dreAccounts.find(d => d.id === dreId);
    saveMut.mutate({
      type: isReceita ? 'INCOME' : 'EXPENSE',
      status: 'PENDING',
      description: descricao.trim(),
      contactName: contactName.trim() || undefined,
      amount: parsedAmount,
      dueDate: dueDate || undefined,
      paymentMethodId: pmId || undefined,
      notes: [referencia, selectedDre ? `DRE: ${selectedDre.name}` : ''].filter(Boolean).join(' | ') || undefined,
    });
  };

  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.25)', zIndex:350, backdropFilter:'blur(2px)' }} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:540, background:'#FFFFFF', zIndex:351, boxShadow:'-4px 0 32px rgba(0,0,0,.12)', display:'flex', flexDirection:'column', fontFamily:"'Inter', system-ui, sans-serif", animation:'slideIn .22s cubic-bezier(0.32,0.72,0,1)' }}>

        {/* Header */}
        <div style={{ flexShrink:0, padding:'20px 24px', borderBottom:'1px solid #E4E4E7', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:accentBg, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className={`ti ${isReceita ? 'ti-circle-arrow-down' : 'ti-circle-arrow-up'}`} style={{ fontSize:18, color:accentColor }} />
            </div>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:'#09090B' }}>{isReceita ? 'Nova receita' : 'Nova despesa'}</div>
              <div style={{ fontSize:12, color:'#71717A', marginTop:1 }}>{isReceita ? 'Lançamento de entrada financeira' : 'Lançamento de saída financeira'}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width:28, height:28, border:'none', background:'#F4F4F5', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <i className="ti ti-x" style={{ fontSize:13, color:'#71717A' }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>

          {/* Conta DRE */}
          <div>
            <label style={lbl}>Conta financeira / DRE <span style={{ color:'#DC2626' }}>*</span></label>
            <select value={dreId} onChange={e => setDreId(e.target.value)}
              style={{ ...inp, cursor:'pointer' }}>
              <option value="">Selecione a conta DRE...</option>
              {dreAccounts.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Pessoa (opcional, com autocomplete) */}
          <div ref={suggRef} style={{ position:'relative' }}>
            <label style={lbl}>{isReceita ? 'Paciente / Origem' : 'Fornecedor / Destino'}</label>
            <input value={contactName}
              onChange={e => setContactName(e.target.value)}
              onFocus={() => { if (suggestions.length > 0) setShowSugg(true); }}
              placeholder={isReceita ? 'Buscar contato ou informar origem...' : 'Buscar contato, fornecedor ou informar destino...'}
              style={inp} />
            {showSugg && suggestions.length > 0 && (
              <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:500, background:'#FFFFFF', border:'1px solid #E4E4E7', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,.10)', overflow:'hidden', marginTop:4 }}>
                {suggestions.map((p: any) => (
                  <div key={p.id}
                    onClick={() => { setContactName(p.name); setShowSugg(false); setSuggestions([]); }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background='#F9F9F9'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background='transparent'}
                    style={{ padding:'9px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid #F4F4F5' }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', background:'#F4F4F5', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:'#71717A', flexShrink:0 }}>
                      {(p.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:500, color:'#09090B' }}>{p.name}</div>
                      {p.phone && <div style={{ fontSize:11, color:'#71717A' }}>{p.phone}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Descrição */}
          <div>
            <label style={lbl}>Descrição <span style={{ color:'#DC2626' }}>*</span></label>
            <input value={descricao} onChange={e => setDescricao(e.target.value)}
              placeholder={isReceita ? 'Ex: Consulta médica, Procedimento...' : 'Ex: Aluguel sala, Material descartável...'}
              style={inp} />
          </div>

          {/* Valor + Vencimento */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={lbl}>Valor <span style={{ color:'#DC2626' }}>*</span></label>
              <input type="text" inputMode="decimal" value={valor}
                onChange={e => setValor(e.target.value.replace(/[^0-9.,]/g, ''))}
                placeholder="0,00" style={inp} />
            </div>
            <div>
              <label style={lbl}>Vencimento</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inp} />
            </div>
          </div>

          {/* Forma de pagamento */}
          <div>
            <label style={lbl}>Forma de pagamento</label>
            <select value={pmId} onChange={e => setPmId(e.target.value)}
              style={{ ...inp, cursor:'pointer' }}>
              <option value="">Selecione...</option>
              {(paymentMethods as any[]).map((pm: any) => (
                <option key={pm.id} value={pm.id}>{pm.name}</option>
              ))}
            </select>
          </div>

          {/* Referência */}
          <div>
            <label style={lbl}>Referência / Nota fiscal</label>
            <input value={referencia} onChange={e => setReferencia(e.target.value)}
              placeholder="Ex: NF 4589, Fatura #321..." style={inp} />
          </div>

          {error && (
            <div style={{ padding:'10px 12px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, fontSize:12, color:'#DC2626' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ flexShrink:0, padding:'14px 24px', borderTop:'1px solid #E4E4E7', display:'flex', gap:10, background:'#FAFAFA' }}>
          <button onClick={onClose}
            style={{ flex:1, height:40, border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:8, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit' }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saveMut.isPending}
            style={{ flex:2, height:40, background:saveMut.isPending?'#A1A1AA':accentColor, border:'none', borderRadius:8, fontSize:13, fontWeight:600, color:'#FFFFFF', cursor:saveMut.isPending?'not-allowed':'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
            <i className={`ti ${isReceita ? 'ti-circle-arrow-down' : 'ti-circle-arrow-up'}`} style={{ fontSize:14 }} />
            {saveMut.isPending ? 'Salvando...' : isReceita ? 'Lançar receita' : 'Lançar despesa'}
          </button>
        </div>
      </div>
    </Portal>
  );
}

// ─── Painel: Pagar / Receber conta ────────────────────────────────────────────
function PagarReceberModal({ conta, onClose }: { conta: Conta; onClose: () => void }) {
  const qc          = useQueryClient();
  const isPagar     = conta.tipo === 'pagar';
  const accentColor = isPagar ? '#DC2626' : '#16A34A';
  const accentBg    = isPagar ? '#FEF2F2' : '#DCFCE7';

  const [amount, setAmount] = useState(String(conta.valor));
  const [pmId,   setPmId]   = useState('');
  const [date,   setDate]   = useState(new Date().toISOString().slice(0, 10));
  const [error,  setError]  = useState('');

  const { data: paymentMethods = [] } = useQuery({ queryKey: ['payment-methods'], queryFn: () => financialApi.paymentMethods() });

  const saveMut = useMutation({
    mutationFn: () => {
      const data = { amount: Number(amount), paymentMethodId: pmId || null, paidAt: date };
      if (conta.rawType === 'INCOME') {
        return financialApi.receiveTransaction(conta.id, data);
      } else {
        return financialApi.updateTransaction(conta.id, { status:'PAID', paidAt:date, paymentMethodId:pmId||null, amount:Number(amount) });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['all-sales'] });
      qc.invalidateQueries({ queryKey: ['financial-summary'] });
      onClose();
    },
    onError: () => setError('Erro ao registrar. Tente novamente.'),
  });

  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.25)', zIndex:400 }} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:520, background:'#FFFFFF', zIndex:401, boxShadow:'-4px 0 32px rgba(0,0,0,.12)', display:'flex', flexDirection:'column', fontFamily:"'Inter', system-ui, sans-serif", animation:'slideIn .22s ease' }}>
        {/* Header */}
        <div style={{ padding:'20px 24px', borderBottom:'1px solid #E4E4E7', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:'#09090B' }}>{isPagar ? 'Pagar lançamento' : 'Registrar recebimento'}</div>
            <div style={{ fontSize:12, color:'#71717A', marginTop:2 }}>{conta.pessoa} — {conta.descricao}</div>
          </div>
          <button onClick={onClose} style={{ width:30, height:30, border:'none', background:'#F4F4F5', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#71717A' }}>
            <i className="ti ti-x" style={{ fontSize:13 }} />
          </button>
        </div>
        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>
          {/* Resumo */}
          <div style={{ background:accentBg, borderRadius:10, padding:'14px 16px', border:`1px solid ${isPagar?'#FECACA':'#BBF7D0'}` }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#A1A1AA', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Resumo do lançamento</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {[
                { label:'Pessoa / contato', value: conta.pessoa },
                { label:'Descrição',        value: conta.descricao },
                { label:'Valor em aberto',  value: fmt(conta.valor) },
                { label:'Vencimento',       value: conta.dueDateStr || '—' },
                { label:'Status atual',     value: CONTA_STATUS[conta.status]?.label || conta.status },
              ].map(r => (
                <div key={r.label}>
                  <div style={{ fontSize:10, color:'#A1A1AA', fontWeight:500, marginBottom:2, textTransform:'uppercase', letterSpacing:'.05em' }}>{r.label}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:accentColor }}>{r.value}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Campos */}
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#A1A1AA', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:12 }}>Dados do {isPagar ? 'pagamento' : 'recebimento'}</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div>
                <label style={lbl}>Valor {isPagar ? 'pago' : 'recebido'} <span style={{color:'#DC2626'}}>*</span></label>
                <input type="number" min={0} step={0.01} value={amount} onChange={e => setAmount(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lbl}>Data {isPagar ? 'do pagamento' : 'do recebimento'}</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Forma de pagamento</label>
                <select value={pmId} onChange={e => setPmId(e.target.value)} style={{ ...inp, height:38, cursor:'pointer' }}>
                  <option value="">Não informado</option>
                  {(paymentMethods as any[]).map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            </div>
          </div>
          {error && <div style={{ fontSize:12, color:'#DC2626', padding:'8px 12px', background:'#FEF2F2', borderRadius:8, border:'1px solid #FECACA' }}>{error}</div>}
        </div>
        {/* Footer */}
        <div style={{ padding:'14px 24px', borderTop:'1px solid #E4E4E7', display:'flex', gap:10, background:'#FAFAFA', flexShrink:0 }}>
          <button onClick={onClose} style={{ flex:1, height:40, border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:8, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
          <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
            style={{ flex:2, height:40, background:saveMut.isPending?'#A1A1AA':accentColor, border:'none', borderRadius:8, fontSize:13, fontWeight:600, color:'#FFFFFF', cursor:saveMut.isPending?'not-allowed':'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
            <i className={`ti ${isPagar?'ti-check':'ti-circle-check'}`} style={{ fontSize:14 }} />
            {saveMut.isPending ? 'Registrando...' : isPagar ? 'Confirmar pagamento' : 'Confirmar recebimento'}
          </button>
        </div>
      </div>
    </Portal>
  );
}

// ─── Painel lateral: Detalhes do lançamento ───────────────────────────────────
function DetalhePanel({
  conta,
  onClose,
  onConferir,
  onDivergente,
  onPagarReceber,
  onCancelar,
}: {
  conta: Conta;
  onClose: () => void;
  onConferir: () => void;
  onDivergente: () => void;
  onPagarReceber: () => void;
  onCancelar: () => void;
}) {
  const tp = CONTA_TIPO[conta.tipo];
  const st = CONTA_STATUS[conta.status];
  const cs = CONF_STATUS[conta.statusConferencia];
  const isPaid    = conta.rawStatus === 'PAID';
  const isPending = conta.rawStatus === 'PENDING';

  const Row = ({ label, value, valueStyle }: { label: string; value: React.ReactNode; valueStyle?: React.CSSProperties }) => (
    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid #F4F4F5' }}>
      <span style={{ fontSize:12, color:'#71717A', fontWeight:500, minWidth:130, flexShrink:0 }}>{label}</span>
      <span style={{ fontSize:13, color:'#09090B', fontWeight:500, textAlign:'right', ...valueStyle }}>{value}</span>
    </div>
  );

  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.2)', zIndex:300 }} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:480, background:'#FFFFFF', zIndex:301, boxShadow:'-4px 0 32px rgba(0,0,0,.12)', display:'flex', flexDirection:'column', fontFamily:"'Inter', system-ui, sans-serif", animation:'slideIn .22s ease' }}>

        {/* Header */}
        <div style={{ padding:'20px 24px', borderBottom:'1px solid #E4E4E7', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:tp.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className={`ti ${tp.icon}`} style={{ fontSize:16, color:tp.color }} />
            </div>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:'#09090B' }}>Detalhes do lançamento</div>
              <div style={{ fontSize:12, color:'#71717A', marginTop:1 }}>{conta.pessoa}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width:30, height:30, border:'none', background:'#F4F4F5', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#71717A' }}>
            <i className="ti ti-x" style={{ fontSize:13 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:20 }}>

          {/* Informações */}
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#A1A1AA', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:4 }}>Informações</div>
            <Row label="Tipo" value={
              <span style={{ fontSize:11, fontWeight:600, padding:'2px 9px', borderRadius:99, background:tp.bg, color:tp.color, display:'inline-flex', alignItems:'center', gap:4 }}>
                <i className={`ti ${tp.icon}`} style={{ fontSize:10 }} /> {tp.label}
              </span>
            } />
            <Row label="Pessoa / Empresa" value={conta.pessoa} />
            <Row label="Descrição" value={conta.descricao} />
            <Row label="Referência" value={conta.referencia} />
            <Row label="Valor" value={
              <span style={{ fontSize:15, fontWeight:700, color: conta.rawType === 'INCOME' ? '#16A34A' : '#DC2626' }}>
                {conta.rawType === 'INCOME' ? '+' : '−'}{fmt(conta.valor)}
              </span>
            } />
            <Row label="Forma de pagamento" value={conta.formaPagamento} />
            <Row label="Vencimento" value={conta.dueDateStr || '—'} />
            <Row label="Data de pagamento" value={conta.paidAtStr || '—'} />
            {conta.notes && <Row label="Observações" value={conta.notes} />}
            <Row label="Status" value={
              <span style={{ fontSize:11, fontWeight:600, padding:'2px 9px', borderRadius:99, background:st.bg, color:st.color }}>{st.label}</span>
            } />
          </div>

          {/* Venda vinculada */}
          {conta.saleId && (
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:'#A1A1AA', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:4 }}>Venda vinculada</div>
              <div style={{ background:'#F8FAFC', borderRadius:10, padding:'12px 14px', border:'1px solid #E4E4E7', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <i className="ti ti-receipt" style={{ fontSize:14, color:'#71717A' }} />
                  <span style={{ fontSize:13, fontWeight:500, color:'#09090B' }}>Venda #{String(conta.saleId).slice(-6).toUpperCase()}</span>
                </div>
                <i className="ti ti-external-link" style={{ fontSize:13, color:'#A1A1AA' }} />
              </div>
            </div>
          )}

          {/* Conferência */}
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#A1A1AA', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:4 }}>Conferência</div>
            <div style={{ background:'#FAFAFA', borderRadius:10, padding:'14px 16px', border:'1px solid #E4E4E7' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: conta.statusConferencia !== 'PENDENTE' ? 10 : 0 }}>
                <span style={{ fontSize:12, color:'#71717A' }}>Status de conferência</span>
                <span style={{ fontSize:11, fontWeight:600, padding:'2px 9px', borderRadius:99, background:cs.bg, color:cs.color, display:'inline-flex', alignItems:'center', gap:4 }}>
                  <i className={`ti ${cs.icon}`} style={{ fontSize:10 }} /> {cs.label}
                </span>
              </div>
              {conta.statusConferencia === 'CONFERIDO' && (
                <div style={{ fontSize:12, color:'#71717A', marginTop:4 }}>
                  Conferido por <b style={{color:'#09090B'}}>{conta.usuarioConferencia || '—'}</b> em {conta.dataConferencia || '—'}
                </div>
              )}
              {conta.statusConferencia === 'DIVERGENTE' && (
                <div style={{ fontSize:12, color:'#DC2626', marginTop:4, padding:'8px 10px', background:'#FEF2F2', borderRadius:8 }}>
                  <b>Motivo:</b> {conta.motivoDivergencia || '—'}
                  {conta.dataConferencia && (
                    <div style={{ marginTop:4, color:'#71717A' }}>Registrado por {conta.usuarioConferencia} em {conta.dataConferencia}</div>
                  )}
                </div>
              )}
              {isPaid && conta.statusConferencia === 'PENDENTE' && (
                <div style={{ display:'flex', gap:8, marginTop:12 }}>
                  <button onClick={onConferir} style={{ flex:1, height:34, background:'#16A34A', border:'none', borderRadius:8, fontSize:12, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}>
                    <i className="ti ti-circle-check" style={{ fontSize:13 }} /> Marcar como conferido
                  </button>
                  <button onClick={onDivergente} style={{ height:34, padding:'0 12px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, fontSize:12, fontWeight:600, color:'#DC2626', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}>
                    <i className="ti ti-alert-triangle" style={{ fontSize:13 }} /> Divergente
                  </button>
                </div>
              )}
              {isPaid && conta.statusConferencia === 'CONFERIDO' && (
                <button onClick={onDivergente} style={{ marginTop:10, height:30, padding:'0 12px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, fontSize:11, fontWeight:600, color:'#DC2626', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:4 }}>
                  <i className="ti ti-alert-triangle" style={{ fontSize:12 }} /> Marcar como divergente
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:'14px 24px', borderTop:'1px solid #E4E4E7', background:'#FAFAFA', flexShrink:0, display:'flex', gap:8 }}>
          {isPending && (
            <button onClick={onPagarReceber}
              style={{ flex:1, height:38, background: conta.rawType === 'INCOME' ? '#16A34A' : '#2563EB', border:'none', borderRadius:8, fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}>
              <i className={`ti ${conta.rawType === 'INCOME' ? 'ti-circle-arrow-down' : 'ti-circle-arrow-up'}`} style={{ fontSize:14 }} />
              {conta.rawType === 'INCOME' ? 'Receber' : 'Pagar'}
            </button>
          )}
          {conta.rawStatus !== 'CANCELLED' && (
            <button onClick={onCancelar}
              style={{ height:38, padding:'0 14px', background:'#FFFFFF', border:'1px solid #FECACA', borderRadius:8, fontSize:13, fontWeight:500, color:'#DC2626', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:5 }}>
              <i className="ti ti-ban" style={{ fontSize:13 }} /> Cancelar
            </button>
          )}
          <button onClick={onClose} style={{ height:38, padding:'0 16px', background:'#F4F4F5', border:'none', borderRadius:8, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit' }}>Fechar</button>
        </div>
      </div>
    </Portal>
  );
}

// ─── Painel: Conferir lançamento ──────────────────────────────────────────────
function ConfirmarConferenciaModal({ conta, onClose }: { conta: Conta; onClose: () => void }) {
  const qc           = useQueryClient();
  const [obs, setObs] = useState('');
  const [ok,  setOk]  = useState(false);
  const st = CONTA_STATUS[conta.status];
  const cs = CONF_STATUS[conta.statusConferencia];

  const mut = useMutation({
    mutationFn: () => financialApi.updateTransaction(conta.id, {
      statusConferencia:  'CONFERIDO',
      dataConferencia:    new Date().toISOString(),
      usuarioConferencia: currentUserName(),
      motivoDivergencia:  null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      setOk(true);
      setTimeout(onClose, 1200);
    },
  });

  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.25)', zIndex:500 }} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:480, background:'#FFFFFF', zIndex:501, boxShadow:'-4px 0 32px rgba(0,0,0,.12)', display:'flex', flexDirection:'column', fontFamily:"'Inter', system-ui, sans-serif", animation:'slideIn .22s ease' }}>
        {/* Header */}
        <div style={{ padding:'20px 24px', borderBottom:'1px solid #E4E4E7', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:'#09090B' }}>Conferir lançamento</div>
            <div style={{ fontSize:12, color:'#71717A', marginTop:2 }}>{conta.pessoa}</div>
          </div>
          <button onClick={onClose} style={{ width:30, height:30, border:'none', background:'#F4F4F5', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#71717A' }}>
            <i className="ti ti-x" style={{ fontSize:13 }} />
          </button>
        </div>
        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>
          {ok ? (
            <div style={{ textAlign:'center', padding:'48px 0' }}>
              <div style={{ width:56, height:56, borderRadius:'50%', background:'#DCFCE7', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
                <i className="ti ti-circle-check" style={{ fontSize:28, color:'#16A34A' }} />
              </div>
              <div style={{ fontSize:15, fontWeight:700, color:'#09090B' }}>Lançamento conferido!</div>
              <div style={{ fontSize:12, color:'#71717A', marginTop:4 }}>O registro foi atualizado com sucesso.</div>
            </div>
          ) : (
            <>
              {/* Resumo */}
              <div style={{ background:'#DCFCE7', borderRadius:10, padding:'14px 16px', border:'1px solid #BBF7D0' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#A1A1AA', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Dados do lançamento</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  {[
                    { label:'Data',              value: conta.paidAtStr || conta.vencimento },
                    { label:'Pessoa / contato',  value: conta.pessoa },
                    { label:'Descrição',         value: conta.descricao },
                    { label:'Forma de pagamento',value: conta.formaPagamento },
                    { label:'Valor',             value: fmt(conta.valor) },
                    { label:'Status financeiro', value: st?.label || '—' },
                    { label:'Conf. atual',       value: cs?.label || '—' },
                  ].map(r => (
                    <div key={r.label}>
                      <div style={{ fontSize:10, color:'#A1A1AA', fontWeight:500, marginBottom:2, textTransform:'uppercase', letterSpacing:'.05em' }}>{r.label}</div>
                      <div style={{ fontSize:13, fontWeight:600, color:'#15803D' }}>{r.value}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Info */}
              <div style={{ background:'#F8FAFC', borderRadius:8, padding:'12px 14px', border:'1px solid #E4E4E7', fontSize:12, color:'#71717A', lineHeight:1.6 }}>
                <i className="ti ti-info-circle" style={{ fontSize:13, marginRight:6, color:'#2563EB' }} />
                Será registrado como conferido por <b style={{color:'#09090B'}}>{currentUserName()}</b> em {new Date().toLocaleString('pt-BR')}.
              </div>
              {/* Observação */}
              <div>
                <label style={lbl}>Observação da conferência (opcional)</label>
                <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3}
                  placeholder="Notas sobre a conferência..."
                  style={{ ...inp, height:'auto', padding:'8px 12px', resize:'vertical' as const }} />
              </div>
            </>
          )}
        </div>
        {/* Footer */}
        {!ok && (
          <div style={{ padding:'14px 24px', borderTop:'1px solid #E4E4E7', display:'flex', gap:10, background:'#FAFAFA', flexShrink:0 }}>
            <button onClick={onClose} style={{ flex:1, height:40, border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:8, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
            <button onClick={() => mut.mutate()} disabled={mut.isPending}
              style={{ flex:2, height:40, background:mut.isPending?'#A1A1AA':'#16A34A', border:'none', borderRadius:8, fontSize:13, fontWeight:600, color:'#FFFFFF', cursor:mut.isPending?'not-allowed':'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <i className="ti ti-circle-check" style={{ fontSize:14 }} />
              {mut.isPending ? 'Conferindo...' : 'Confirmar conferência'}
            </button>
          </div>
        )}
      </div>
    </Portal>
  );
}

// ─── Painel: Marcar divergente ────────────────────────────────────────────────
function DivergentModal({ conta, onClose }: { conta: Conta; onClose: () => void }) {
  const qc      = useQueryClient();
  const [motivo, setMotivo] = useState('');
  const [custom, setCustom] = useState('');
  const [obsInt, setObsInt] = useState('');
  const [error,  setError]  = useState('');

  const MOTIVOS = [
    'Valor não bate com extrato',
    'Valor não caiu na conta',
    'Forma de pagamento incorreta',
    'Data incorreta',
    'Lançamento duplicado',
    'Comprovante ausente',
    'Outro',
  ];

  const mut = useMutation({
    mutationFn: () => {
      const texto = motivo === 'Outro' ? (custom.trim() || 'Outro') : motivo;
      return financialApi.updateTransaction(conta.id, {
        statusConferencia:  'DIVERGENTE',
        dataConferencia:    new Date().toISOString(),
        usuarioConferencia: currentUserName(),
        motivoDivergencia:  texto,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      onClose();
    },
    onError: () => setError('Erro ao salvar. Tente novamente.'),
  });

  const handleSave = () => {
    if (!motivo) { setError('Selecione o motivo da divergência.'); return; }
    if (motivo === 'Outro' && !custom.trim()) { setError('Descreva o motivo.'); return; }
    setError('');
    mut.mutate();
  };

  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.25)', zIndex:500 }} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:520, background:'#FFFFFF', zIndex:501, boxShadow:'-4px 0 32px rgba(0,0,0,.12)', display:'flex', flexDirection:'column', fontFamily:"'Inter', system-ui, sans-serif", animation:'slideIn .22s ease' }}>
        {/* Header */}
        <div style={{ padding:'20px 24px', borderBottom:'1px solid #E4E4E7', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:'#09090B' }}>Marcar como divergente</div>
            <div style={{ fontSize:12, color:'#71717A', marginTop:2 }}>{conta.descricao} — {fmt(conta.valor)}</div>
          </div>
          <button onClick={onClose} style={{ width:30, height:30, border:'none', background:'#F4F4F5', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#71717A' }}>
            <i className="ti ti-x" style={{ fontSize:13 }} />
          </button>
        </div>
        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>
          {/* Resumo */}
          <div style={{ background:'#FEF2F2', borderRadius:10, padding:'14px 16px', border:'1px solid #FECACA' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#A1A1AA', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Dados do lançamento</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {[
                { label:'Data',         value: conta.paidAtStr || conta.vencimento },
                { label:'Contato',      value: conta.pessoa },
                { label:'Descrição',    value: conta.descricao },
                { label:'Valor',        value: fmt(conta.valor) },
                { label:'Forma',        value: conta.formaPagamento },
                { label:'Status conf.', value: CONF_STATUS[conta.statusConferencia]?.label || '—' },
              ].map(r => (
                <div key={r.label}>
                  <div style={{ fontSize:10, color:'#A1A1AA', fontWeight:500, marginBottom:2, textTransform:'uppercase', letterSpacing:'.05em' }}>{r.label}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#DC2626' }}>{r.value}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Motivos */}
          <div>
            <label style={lbl}>Motivo da divergência <span style={{color:'#DC2626'}}>*</span></label>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {MOTIVOS.map(m => (
                <label key={m} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color: motivo === m ? '#09090B' : '#374151', cursor:'pointer', padding:'10px 12px', borderRadius:8, border:`1px solid ${motivo===m?'#DC2626':'#E4E4E7'}`, background:motivo===m?'#FEF2F2':'#FFFFFF' }}>
                  <input type="radio" name="motivo" value={m} checked={motivo === m} onChange={() => setMotivo(m)} style={{ accentColor:'#DC2626', cursor:'pointer' }} />
                  {m}
                </label>
              ))}
            </div>
          </div>
          {motivo === 'Outro' && (
            <div>
              <label style={lbl}>Descreva o motivo <span style={{color:'#DC2626'}}>*</span></label>
              <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="Descreva o motivo da divergência..." style={inp} />
            </div>
          )}
          <div>
            <label style={lbl}>Observações internas (opcional)</label>
            <textarea value={obsInt} onChange={e => setObsInt(e.target.value)} rows={2}
              placeholder="Anotações para uso interno..."
              style={{ ...inp, height:'auto', padding:'8px 12px', resize:'vertical' as const }} />
          </div>
          {error && <div style={{ fontSize:12, color:'#DC2626', padding:'8px 12px', background:'#FEF2F2', borderRadius:8, border:'1px solid #FECACA' }}>{error}</div>}
        </div>
        {/* Footer */}
        <div style={{ padding:'14px 24px', borderTop:'1px solid #E4E4E7', display:'flex', gap:10, background:'#FAFAFA', flexShrink:0 }}>
          <button onClick={onClose} style={{ flex:1, height:40, border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:8, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
          <button onClick={handleSave} disabled={mut.isPending}
            style={{ flex:2, height:40, background:mut.isPending?'#A1A1AA':'#DC2626', border:'none', borderRadius:8, fontSize:13, fontWeight:600, color:'#FFFFFF', cursor:mut.isPending?'not-allowed':'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
            <i className="ti ti-alert-triangle" style={{ fontSize:14 }} />
            {mut.isPending ? 'Salvando...' : 'Marcar como divergente'}
          </button>
        </div>
      </div>
    </Portal>
  );
}

// ─── Painel: Cancelar lançamento ──────────────────────────────────────────────
function CancelarModal({ conta, onClose }: { conta: Conta; onClose: () => void }) {
  const qc              = useQueryClient();
  const [motivo, setMotivo] = useState('');
  const [error,  setError]  = useState('');
  const isPaidIncome        = conta.rawStatus === 'PAID' && conta.rawType === 'INCOME';

  const mut = useMutation({
    mutationFn: () => financialApi.cancelTransaction(conta.id, motivo.trim() || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['financial-summary'] });
      qc.invalidateQueries({ queryKey: ['all-sales'] });
      onClose();
    },
    onError: () => setError('Erro ao cancelar. Tente novamente.'),
  });

  const handleConfirm = () => {
    if (!motivo.trim()) { setError('Informe o motivo do cancelamento.'); return; }
    setError('');
    mut.mutate();
  };

  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.25)', zIndex:500 }} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:480, background:'#FFFFFF', zIndex:501, boxShadow:'-4px 0 32px rgba(0,0,0,.12)', display:'flex', flexDirection:'column', fontFamily:"'Inter', system-ui, sans-serif", animation:'slideIn .22s ease' }}>
        {/* Header */}
        <div style={{ padding:'20px 24px', borderBottom:'1px solid #E4E4E7', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:'#09090B' }}>Cancelar lançamento financeiro</div>
            <div style={{ fontSize:12, color:'#71717A', marginTop:2 }}>{conta.descricao}</div>
          </div>
          <button onClick={onClose} style={{ width:30, height:30, border:'none', background:'#F4F4F5', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#71717A' }}>
            <i className="ti ti-x" style={{ fontSize:13 }} />
          </button>
        </div>
        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>
          {/* Resumo do lançamento */}
          <div style={{ background:'#FEF2F2', borderRadius:10, padding:'14px 16px', border:'1px solid #FECACA' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#A1A1AA', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Lançamento</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {[
                { label:'Pessoa',    value: conta.pessoa },
                { label:'Descrição', value: conta.descricao },
                { label:'Valor',     value: fmt(conta.valor) },
                { label:'Status',    value: CONTA_STATUS[conta.status]?.label || '—' },
              ].map(r => (
                <div key={r.label}>
                  <div style={{ fontSize:10, color:'#A1A1AA', fontWeight:500, marginBottom:2, textTransform:'uppercase', letterSpacing:'.05em' }}>{r.label}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#DC2626' }}>{r.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Aviso de impacto na venda */}
          {conta.saleId && isPaidIncome && (
            <div style={{ background:'#FFFBEB', borderRadius:10, padding:'12px 14px', border:'1px solid #FDE68A', display:'flex', gap:10 }}>
              <i className="ti ti-alert-triangle" style={{ fontSize:16, color:'#D97706', flexShrink:0, marginTop:1 }} />
              <div style={{ fontSize:12, color:'#92400E', lineHeight:1.6 }}>
                <b>Atenção:</b> Este lançamento está vinculado à venda <b>#{String(conta.saleId).slice(-6).toUpperCase()}</b>.
                Ao cancelar, o valor de <b>{fmt(conta.valor)}</b> deixará de contar como recebido e a venda será recalculada automaticamente.
                A venda ficará sinalizada com pendência financeira.
              </div>
            </div>
          )}

          {conta.saleId && !isPaidIncome && (
            <div style={{ background:'#EFF6FF', borderRadius:10, padding:'12px 14px', border:'1px solid #BFDBFE', display:'flex', gap:10 }}>
              <i className="ti ti-info-circle" style={{ fontSize:16, color:'#2563EB', flexShrink:0, marginTop:1 }} />
              <div style={{ fontSize:12, color:'#1E40AF', lineHeight:1.6 }}>
                Este lançamento está vinculado à venda <b>#{String(conta.saleId).slice(-6).toUpperCase()}</b>.
                Por não estar pago, o cancelamento não afeta os valores da venda.
              </div>
            </div>
          )}

          {/* Motivo */}
          <div>
            <label style={lbl}>Motivo do cancelamento <span style={{color:'#DC2626'}}>*</span></label>
            <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3}
              placeholder="Ex.: pagamento cancelado pelo paciente, lançamento duplicado..."
              style={{ ...inp, height:'auto', padding:'8px 12px', resize:'vertical' as const }} />
          </div>

          <div style={{ fontSize:12, color:'#71717A', lineHeight:1.6 }}>
            O lançamento será marcado como <b style={{color:'#09090B'}}>cancelado</b>. Esta ação não pode ser desfeita.
          </div>

          {error && <div style={{ fontSize:12, color:'#DC2626', padding:'8px 12px', background:'#FEF2F2', borderRadius:8, border:'1px solid #FECACA' }}>{error}</div>}
        </div>
        {/* Footer */}
        <div style={{ padding:'14px 24px', borderTop:'1px solid #E4E4E7', display:'flex', gap:10, background:'#FAFAFA', flexShrink:0 }}>
          <button onClick={onClose} style={{ flex:1, height:40, border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:8, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit' }}>Cancelar ação</button>
          <button onClick={handleConfirm} disabled={mut.isPending}
            style={{ flex:2, height:40, background:mut.isPending?'#A1A1AA':'#DC2626', border:'none', borderRadius:8, fontSize:13, fontWeight:600, color:'#FFFFFF', cursor:mut.isPending?'not-allowed':'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
            <i className="ti ti-ban" style={{ fontSize:14 }} />
            {mut.isPending ? 'Cancelando...' : 'Confirmar cancelamento'}
          </button>
        </div>
      </div>
    </Portal>
  );
}

// ─── Painel: Alterar vencimento ───────────────────────────────────────────────
function AlterarVencimentoModal({ conta, onClose }: { conta: Conta; onClose: () => void }) {
  const qc          = useQueryClient();
  const [date, setDate] = useState(conta.raw?.dueDate ? new Date(conta.raw.dueDate).toISOString().slice(0,10) : new Date().toISOString().slice(0,10));
  const [obs,  setObs]  = useState('');

  const mut = useMutation({
    mutationFn: () => financialApi.updateTransaction(conta.id, { dueDate: date }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      onClose();
    },
  });

  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.25)', zIndex:500 }} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:480, background:'#FFFFFF', zIndex:501, boxShadow:'-4px 0 32px rgba(0,0,0,.12)', display:'flex', flexDirection:'column', fontFamily:"'Inter', system-ui, sans-serif", animation:'slideIn .22s ease' }}>
        {/* Header */}
        <div style={{ padding:'20px 24px', borderBottom:'1px solid #E4E4E7', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:'#09090B' }}>Alterar vencimento</div>
            <div style={{ fontSize:12, color:'#71717A', marginTop:2 }}>{conta.pessoa} — {conta.descricao}</div>
          </div>
          <button onClick={onClose} style={{ width:30, height:30, border:'none', background:'#F4F4F5', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#71717A' }}>
            <i className="ti ti-x" style={{ fontSize:13 }} />
          </button>
        </div>
        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>
          {/* Resumo */}
          <div style={{ background:'#F8FAFC', borderRadius:10, padding:'14px 16px', border:'1px solid #E4E4E7' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#A1A1AA', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Dados do lançamento</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {[
                { label:'Pessoa',              value: conta.pessoa },
                { label:'Descrição',           value: conta.descricao },
                { label:'Valor',               value: fmt(conta.valor) },
                { label:'Status atual',        value: CONTA_STATUS[conta.status]?.label || '—' },
                { label:'Vencimento atual',    value: conta.dueDateStr || '—' },
              ].map(r => (
                <div key={r.label}>
                  <div style={{ fontSize:10, color:'#A1A1AA', fontWeight:500, marginBottom:2, textTransform:'uppercase', letterSpacing:'.05em' }}>{r.label}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#09090B' }}>{r.value}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Novo vencimento */}
          <div>
            <label style={lbl}>Novo vencimento <span style={{color:'#DC2626'}}>*</span></label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
          </div>
          {/* Observação */}
          <div>
            <label style={lbl}>Motivo / observação (opcional)</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3}
              placeholder="Ex.: negociação com fornecedor, prazo estendido..."
              style={{ ...inp, height:'auto', padding:'8px 12px', resize:'vertical' as const }} />
          </div>
        </div>
        {/* Footer */}
        <div style={{ padding:'14px 24px', borderTop:'1px solid #E4E4E7', display:'flex', gap:10, background:'#FAFAFA', flexShrink:0 }}>
          <button onClick={onClose} style={{ flex:1, height:40, border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:8, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending}
            style={{ flex:2, height:40, background:mut.isPending?'#A1A1AA':'#000000', border:'none', borderRadius:8, fontSize:13, fontWeight:600, color:'#FFFFFF', cursor:mut.isPending?'not-allowed':'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
            <i className="ti ti-calendar-check" style={{ fontSize:14 }} />
            {mut.isPending ? 'Salvando...' : 'Salvar alteração'}
          </button>
        </div>
      </div>
    </Portal>
  );
}

// ─── Context Menu ─────────────────────────────────────────────────────────────
function ContaContextMenu({ conta, onAction, onClose }: {
  conta: Conta;
  onAction: (a: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const isPaid    = conta.rawStatus === 'PAID';
  const isPending = conta.rawStatus === 'PENDING';
  const isIncome  = conta.rawType   === 'INCOME';
  const conf      = conta.statusConferencia;

  type Item = { action: string; label: string; icon: string; color?: string; sep?: boolean };
  const items: Item[] = [];

  items.push({ action:'ver', label:'Ver detalhes', icon:'ti-eye' });

  if (isPaid) {
    if (conf !== 'CONFERIDO') {
      items.push({ action:'conferir',   label:'Marcar como conferido',                              icon:'ti-circle-check' });
    }
    items.push({ action:'divergente', label: conf === 'DIVERGENTE' ? 'Atualizar motivo' : 'Marcar como divergente', icon:'ti-alert-triangle' });
  }

  if (isPending && !isIncome) {
    items.push({ action:'pagar_receber', label:'Pagar',               icon:'ti-circle-arrow-up' });
  }
  if (isPending && isIncome && !conta.saleId) {
    items.push({ action:'pagar_receber', label:'Registrar recebimento', icon:'ti-circle-arrow-down' });
  }
  if (isPending) {
    items.push({ action:'alterar_vencimento', label:'Alterar vencimento', icon:'ti-calendar' });
  }

  if (conta.saleId) {
    items.push({ action:'ver_venda', label:'Abrir venda vinculada', icon:'ti-receipt', sep: true });
  }

  if (conta.rawStatus !== 'CANCELLED') {
    items.push({ action:'cancelar', label: isPaid ? 'Cancelar / estornar' : 'Cancelar', icon:'ti-ban', color:'#DC2626', sep: true });
  }

  return (
    <div ref={ref} style={{ position:'absolute', right:0, top:'calc(100% + 4px)', zIndex:450, background:'#FFFFFF', border:'1px solid #E4E4E7', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,.12)', minWidth:230, padding:'4px 0', fontFamily:"'Inter', system-ui, sans-serif" }}>
      {items.map((item, idx) => (
        <div key={item.action + idx}>
          {item.sep && idx > 0 && <div style={{ height:1, background:'#F4F4F5', margin:'4px 0' }} />}
          <button onClick={(e) => { e.stopPropagation(); onAction(item.action); onClose(); }}
            style={{ width:'100%', height:36, padding:'0 14px', border:'none', background:'transparent', textAlign:'left', fontSize:13, color: item.color || '#374151', cursor:'pointer', display:'flex', alignItems:'center', gap:8, fontFamily:'inherit' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F9F9F9'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
            <i className={`ti ${item.icon}`} style={{ fontSize:14, color: item.color || '#71717A', width:16 }} />
            {item.label}
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Painel: Ver Detalhes da Venda/Orçamento ──────────────────────────────────

function VendaDetailPanel({
  sale, onClose, onReceber, onCancel,
}: {
  sale: Sale;
  onClose: () => void;
  onReceber: () => void;
  onCancel: () => void;
}) {
  const navigate = useNavigate();
  const raw = sale.raw;

  const { data: rawTxs = [] } = useQuery<any[]>({
    queryKey: ['transactions'],
    queryFn: () => financialApi.transactions(),
  });

  const saleHistory = useMemo(() =>
    (rawTxs as any[])
      .filter(t => t.saleId === sale.id && t.status === 'PAID')
      .map(t => ({
        id:    t.id,
        data:  new Date(t.paidAt || t.createdAt).toLocaleDateString('pt-BR'),
        valor: t.amount as number,
        forma: t.paymentMethod?.name || '—',
      })),
    [rawTxs, sale.id],
  );

  const items: any[] = raw?.items || [];
  const sessions: any[] = raw?.sessions || [];
  const saleCode = `#${String(sale.id).slice(-6).toUpperCase()}`;
  const st = SALE_STATUS[sale.status];
  const ty = SALE_TYPE[sale.type];

  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.3)', zIndex:350 }} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:620, background:'#FFFFFF', zIndex:351, boxShadow:'-4px 0 40px rgba(0,0,0,.14)', display:'flex', flexDirection:'column', fontFamily:"'Inter', system-ui, sans-serif", animation:'slideIn .22s ease' }}>

        {/* Header */}
        <div style={{ padding:'22px 28px', borderBottom:'1px solid #E4E4E7', display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
              <div style={{ fontSize:18, fontWeight:700, color:'#09090B' }}>
                {sale.type === 'orcamento' ? 'Orçamento' : 'Venda'} {saleCode}
              </div>
              <span style={{ fontSize:11, fontWeight:600, padding:'2px 9px', borderRadius:99, background:ty.bg, color:ty.color }}>{ty.label}</span>
              <span style={{ fontSize:11, fontWeight:600, padding:'2px 9px', borderRadius:99, background:st.bg, color:st.color }}>{st.label}</span>
            </div>
            <div style={{ fontSize:12, color:'#71717A' }}>Emitido em {sale.date}</div>
          </div>
          <button onClick={onClose} style={{ width:32, height:32, border:'none', background:'#F4F4F5', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#71717A', flexShrink:0 }}>
            <i className="ti ti-x" style={{ fontSize:14 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:'0 28px 28px' }}>

          {/* Contato */}
          <div style={{ marginTop:22, marginBottom:18 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#A1A1AA', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:10 }}>Contato</div>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:38, height:38, borderRadius:'50%', background:'#F4F4F5', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:600, color:'#374151', flexShrink:0 }}>
                {sale.patient.split(' ').slice(0,2).map((n:string) => n[0]).join('')}
              </div>
              <div>
                <div style={{ fontSize:14, fontWeight:600, color:'#09090B' }}>{sale.patient}</div>
                <div style={{ fontSize:12, color:'#71717A', marginTop:2 }}>{sale.phone}</div>
              </div>
              {sale.patientId && (
                <button
                  onClick={() => { navigate(`/patients/${sale.patientId}`); onClose(); }}
                  style={{ marginLeft:'auto', height:30, padding:'0 12px', background:'#F4F4F5', border:'1px solid #E4E4E7', borderRadius:8, fontSize:12, fontWeight:500, color:'#374151', cursor:'pointer', display:'flex', alignItems:'center', gap:5, fontFamily:'inherit' }}
                >
                  <i className="ti ti-user" style={{ fontSize:12 }} /> Abrir contato
                </button>
              )}
            </div>
          </div>

          {/* Itens */}
          {items.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#A1A1AA', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:10 }}>Itens</div>
              <div style={{ background:'#FAFAFA', borderRadius:10, border:'1px solid #E4E4E7', overflow:'hidden' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr style={{ background:'#F4F4F5' }}>
                      {['Procedimento/Serviço','Qtd','Valor unit.','Desconto','Total'].map((h,i) => (
                        <th key={h} style={{ padding:'8px 12px', textAlign:i>0?'right':'left', fontSize:10, fontWeight:600, color:'#71717A', textTransform:'uppercase', letterSpacing:'.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it: any, i: number) => {
                      const qty      = it.quantity || 1;
                      const price    = it.unitPrice ?? it.price ?? 0;
                      const discount = it.discount ?? 0;
                      const total    = qty * price - discount;
                      return (
                        <tr key={i} style={{ borderTop:'1px solid #F4F4F5' }}>
                          <td style={{ padding:'10px 12px', fontSize:13, color:'#09090B' }}>{it.name || it.plan?.name || 'Procedimento'}</td>
                          <td style={{ padding:'10px 12px', fontSize:12, color:'#71717A', textAlign:'right' }}>{qty}</td>
                          <td style={{ padding:'10px 12px', fontSize:12, color:'#71717A', textAlign:'right' }}>{fmt(price)}</td>
                          <td style={{ padding:'10px 12px', fontSize:12, color:discount>0?'#DC2626':'#A1A1AA', textAlign:'right' }}>{discount > 0 ? `-${fmt(discount)}` : '—'}</td>
                          <td style={{ padding:'10px 12px', fontSize:13, fontWeight:600, color:'#09090B', textAlign:'right' }}>{fmt(total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Financeiro */}
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#A1A1AA', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:10 }}>Financeiro</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
              {[
                { label:'Valor total',     value: fmt(sale.total),    color:'#09090B' },
                { label:'Já recebido',     value: fmt(sale.received), color:'#16A34A' },
                { label:'Saldo em aberto', value: fmt(sale.open),     color: sale.open > 0 ? '#DC2626' : '#A1A1AA' },
              ].map(s => (
                <div key={s.label} style={{ background:'#F8FAFC', borderRadius:10, padding:'12px 14px', border:'1px solid #E4E4E7' }}>
                  <div style={{ fontSize:10, color:'#A1A1AA', fontWeight:500, marginBottom:4, textTransform:'uppercase', letterSpacing:'.05em' }}>{s.label}</div>
                  <div style={{ fontSize:16, fontWeight:700, color:s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Histórico de pagamentos */}
          {saleHistory.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#A1A1AA', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:10 }}>Histórico de recebimentos</div>
              <div style={{ background:'#FAFAFA', borderRadius:10, border:'1px solid #E4E4E7', overflow:'hidden' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr style={{ background:'#F4F4F5' }}>
                      {['Data','Valor','Forma'].map(h => (
                        <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'#71717A', textTransform:'uppercase', letterSpacing:'.06em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {saleHistory.map(h => (
                      <tr key={h.id} style={{ borderTop:'1px solid #F4F4F5' }}>
                        <td style={{ padding:'9px 12px', fontSize:12, color:'#71717A' }}>{h.data}</td>
                        <td style={{ padding:'9px 12px', fontSize:13, fontWeight:600, color:'#16A34A' }}>{fmt(h.valor)}</td>
                        <td style={{ padding:'9px 12px', fontSize:12, color:'#374151' }}>{h.forma}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sessões vinculadas */}
          {sessions.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#A1A1AA', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:10 }}>Sessões</div>
              <div style={{ background:'#FAFAFA', borderRadius:10, border:'1px solid #E4E4E7', padding:'12px 16px', display:'flex', alignItems:'center', gap:10 }}>
                <i className="ti ti-activity" style={{ fontSize:16, color:'#7C3AED' }} />
                <span style={{ fontSize:13, color:'#374151' }}>{sessions.length} sessão(ões) gerada(s)</span>
                <span style={{ fontSize:12, color:'#A1A1AA', marginLeft:'auto' }}>
                  {sessions.filter((s:any) => s.sessionStatus === 'REALIZADA' || s.attended).length}/{sessions.length} realizadas
                </span>
              </div>
            </div>
          )}

          {/* Observações */}
          {sale.desc && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#A1A1AA', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:8 }}>Observações</div>
              <div style={{ background:'#FAFAFA', borderRadius:10, border:'1px solid #E4E4E7', padding:'12px 14px', fontSize:13, color:'#374151', lineHeight:1.5 }}>{sale.desc}</div>
            </div>
          )}
        </div>

        {/* Footer — ações */}
        <div style={{ padding:'16px 28px', borderTop:'1px solid #E4E4E7', display:'flex', gap:8, flexShrink:0, background:'#FAFAFA' }}>
          {sale.open > 0 && sale.status !== 'cancelado' && (
            <button
              onClick={() => { onClose(); onReceber(); }}
              style={{ height:38, padding:'0 16px', background:'#16A34A', border:'none', borderRadius:8, fontSize:13, fontWeight:600, color:'#FFFFFF', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}
            >
              <i className="ti ti-cash" style={{ fontSize:14 }} /> Receber
            </button>
          )}
          {sale.patientId && (
            <button
              onClick={() => { navigate(`/patients/${sale.patientId}?tab=Financeiro`); onClose(); }}
              style={{ height:38, padding:'0 14px', background:'#FFFFFF', border:'1px solid #E4E4E7', borderRadius:8, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}
            >
              <i className="ti ti-receipt" style={{ fontSize:13 }} /> Financeiro do contato
            </button>
          )}
          {sale.status !== 'cancelado' && (
            <button
              onClick={() => { onClose(); onCancel(); }}
              style={{ marginLeft:'auto', height:38, padding:'0 14px', background:'#FFFFFF', border:'1px solid #FECACA', borderRadius:8, fontSize:13, fontWeight:500, color:'#DC2626', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}
            >
              <i className="ti ti-x" style={{ fontSize:13 }} /> Cancelar
            </button>
          )}
        </div>
      </div>
    </Portal>
  );
}

// ─── Modal: Cancelar Venda/Orçamento ──────────────────────────────────────────

function CancelSaleModal({ sale, onClose, onConfirm, loading }: {
  sale: Sale;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState('');
  const hasPayments = sale.received > 0;

  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', zIndex:400, backdropFilter:'blur(2px)' }} />
      <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:401, width:'min(90vw,460px)', background:'#FFFFFF', borderRadius:16, boxShadow:'0 20px 60px rgba(0,0,0,.18)', padding:'28px', fontFamily:"'Inter', system-ui, sans-serif" }}>
        <div style={{ width:44, height:44, borderRadius:'50%', background:'#FEF2F2', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}>
          <i className="ti ti-x" style={{ fontSize:20, color:'#DC2626' }} />
        </div>
        <div style={{ fontSize:16, fontWeight:700, color:'#09090B', marginBottom:6 }}>
          Cancelar {sale.type === 'orcamento' ? 'orçamento' : 'venda'}?
        </div>
        {hasPayments && (
          <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:12, color:'#92400E', lineHeight:1.5 }}>
            <i className="ti ti-alert-triangle" style={{ fontSize:13, marginRight:6 }} />
            Esta venda possui pagamento registrado. O cancelamento não remove automaticamente os lançamentos financeiros. Verifique se será necessário estorno ou ajuste financeiro.
          </div>
        )}
        <div style={{ fontSize:13, color:'#71717A', lineHeight:1.5, marginBottom:18 }}>
          O registro será marcado como cancelado e não poderá ser usado para recebimentos. Esta ação não apaga os dados.
        </div>
        <div style={{ marginBottom:20 }}>
          <label style={{ display:'block', fontSize:12, fontWeight:500, color:'#71717A', marginBottom:5 }}>Motivo (opcional)</label>
          <textarea
            value={reason} onChange={e => setReason(e.target.value)}
            rows={3} placeholder="Ex.: paciente desistiu, duplicidade..."
            style={{ width:'100%', padding:'8px 12px', border:'1px solid #E4E4E7', borderRadius:8, fontSize:13, color:'#09090B', fontFamily:'inherit', outline:'none', resize:'vertical', boxSizing:'border-box', background:'#FFFFFF' }}
          />
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onClose} style={{ flex:1, height:40, border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:8, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit' }}>
            Voltar
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={loading}
            style={{ flex:1, height:40, background:loading?'#A1A1AA':'#DC2626', border:'none', borderRadius:8, fontSize:13, fontWeight:600, color:'#FFF', cursor:loading?'not-allowed':'pointer', fontFamily:'inherit' }}
          >
            {loading ? 'Cancelando...' : 'Confirmar cancelamento'}
          </button>
        </div>
      </div>
    </Portal>
  );
}

// ─── Tab: Vendas / Orçamentos ─────────────────────────────────────────────────
const STATUS_SELECT_ICON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717A' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;

function VendasTab({ sales }: { sales: Sale[] }) {
  const qc        = useQueryClient();
  const { toast } = useToast();
  const navigate  = useNavigate();

  const [statusFilter,  setStatusFilter]  = useState('todos');
  const [search,        setSearch]        = useState('');
  const [showNova,      setShowNova]      = useState(false);
  const [receberSale,   setReceberSale]   = useState<Sale | null>(null);
  const [detailSale,    setDetailSale]    = useState<Sale | null>(null);
  const [cancelSale,    setCancelSale]    = useState<Sale | null>(null);
  const [period,        setPeriod]        = useState<PeriodKey>('this_month');
  const [customStart,   setCustomStart]   = useState('');
  const [customEnd,     setCustomEnd]     = useState('');

  const cancelMut = useMutation({
    mutationFn: (id: string) => salesApi.updateStatus(id, 'CANCELLED'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-sales'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['financial-summary'] });
      setCancelSale(null);
      toast('Venda/orçamento cancelado com sucesso.', 'success');
    },
    onError: () => toast('Erro ao cancelar. Tente novamente.', 'error'),
  });

  const { start: pStart, end: pEnd } = useMemo(() => computePeriodRange(period, customStart, customEnd), [period, customStart, customEnd]);

  const periodSales = useMemo(() => sales.filter(s => s.createdAt >= pStart && s.createdAt <= pEnd), [sales, pStart, pEnd]);

  const filtered = periodSales.filter(s => {
    if (statusFilter === 'orcamentos')    return s.type === 'orcamento';
    if (statusFilter === 'vendas')        return s.type === 'venda';
    if (statusFilter === 'nao_recebidos') return s.status === 'nao_recebido';
    if (statusFilter === 'parcial')       return s.status === 'parcial';
    if (statusFilter === 'pagos')         return s.status === 'pago';
    if (statusFilter === 'cancelados')    return s.status === 'cancelado';
    return true;
  }).filter(s => !search || s.patient.toLowerCase().includes(search.toLowerCase()) || s.item.toLowerCase().includes(search.toLowerCase()));

  const totalMes   = periodSales.reduce((s, v) => s + v.total,    0);
  const recebido   = periodSales.reduce((s, v) => s + v.received, 0);
  const emAberto   = periodSales.reduce((s, v) => s + v.open,     0);
  const vendasHoje = periodSales.filter(s => s.date === new Date().toLocaleDateString('pt-BR'));

  const kpis = [
    { label:'Total registrado', value: fmt(totalMes),    sub:`${periodSales.length} registros`,              icon:'ti-chart-bar',    iconBg:'#EFF6FF', iconColor:'#2563EB' },
    { label:'Recebido',         value: fmt(recebido),    sub:'Total recebido no período',                    icon:'ti-circle-check', iconBg:'#DCFCE7', iconColor:'#16A34A' },
    { label:'Em aberto',        value: fmt(emAberto),    sub:'A receber no período',                         icon:'ti-clock',        iconBg:'#FFFBEB', iconColor:'#D97706' },
    { label:'Vendas hoje',      value: fmt(vendasHoje.reduce((s,v) => s + v.total, 0)), sub:`${vendasHoje.length} vendas`, icon:'ti-trending-up', iconBg:'#F5F3FF', iconColor:'#7C3AED' },
  ];

  return (
    <div style={{ padding:'16px 28px', display:'flex', flexDirection:'column', gap:14 }}>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background:'#FFFFFF', borderRadius:12, border:'1px solid #E4E4E7', padding:'14px 16px', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:40, height:40, borderRadius:10, background:k.iconBg, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className={`ti ${k.icon}`} style={{ fontSize:18, color:k.iconColor }} />
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:11, color:'#71717A', fontWeight:500, marginBottom:2, textTransform:'uppercase', letterSpacing:'.04em', whiteSpace:'nowrap' }}>{k.label}</div>
              <div style={{ fontSize:18, fontWeight:700, color:'#09090B', lineHeight:1.15 }}>{k.value}</div>
              <div style={{ fontSize:11, color:'#A1A1AA', marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{k.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros + busca + Nova venda */}
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, height:36, padding:'0 12px', border:'1px solid #E4E4E7', borderRadius:99, background:'#FFFFFF', flex:'1 1 220px', maxWidth:300 }}>
          <i className="ti ti-search" style={{ fontSize:13, color:'#A1A1AA', flexShrink:0 }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar contato, telefone ou venda..."
            style={{ border:'none', background:'transparent', fontSize:12, outline:'none', width:'100%', fontFamily:'inherit', color:'#09090B' }} />
        </div>
        <PeriodDropdown period={period} customStart={customStart} customEnd={customEnd}
          onChange={(p, cs, ce) => { setPeriod(p); if (cs) setCustomStart(cs); if (ce) setCustomEnd(ce); }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ height:36, padding:'0 32px 0 14px', border:'1px solid #E4E4E7', borderRadius:99, fontSize:12, fontWeight:500, color:'#18181B', background:'#FFFFFF', cursor:'pointer', outline:'none', fontFamily:'inherit', flexShrink:0, appearance:'none', backgroundImage:STATUS_SELECT_ICON, backgroundRepeat:'no-repeat', backgroundPosition:'right 10px center' }}>
          <option value="todos">Todos os status</option>
          <option value="orcamentos">Orçamentos</option>
          <option value="vendas">Vendas</option>
          <option value="nao_recebidos">Não recebidos</option>
          <option value="parcial">Parcial</option>
          <option value="pagos">Pagos</option>
          <option value="cancelados">Cancelados</option>
        </select>
        <div style={{ flex:1 }} />
        <button onClick={() => setShowNova(true)}
          style={{ height:36, padding:'0 16px', background:'#000000', border:'none', borderRadius:99, fontSize:13, fontWeight:600, color:'#FFFFFF', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit', flexShrink:0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background='#18181B'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background='#000000'; }}>
          <i className="ti ti-plus" style={{ fontSize:14 }} /> Nova venda
        </button>
      </div>

      {/* Tabela */}
      <div style={{ background:'#FFFFFF', borderRadius:12, border:'1px solid #E4E4E7', overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#F4F4F5', borderBottom:'1px solid #E4E4E7' }}>
              {['Data','Contato','Procedimento','Total','Recebido','Saldo','Tipo','Status','Ações'].map((h, i) => (
                <th key={h} style={{ padding:'10px 16px', textAlign:(i>=3&&i<=5)?'right':i===8?'right':'left', fontSize:11, fontWeight:600, color:'#71717A', textTransform:'uppercase', letterSpacing:'.06em', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => {
              const st = SALE_STATUS[s.status];
              const ty = SALE_TYPE[s.type];
              return (
                <tr key={s.id} style={{ borderBottom:'1px solid #F4F4F5', cursor:'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background='#F9F9F9'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                  <td style={{ padding:'12px 16px', fontSize:12, color:'#71717A', whiteSpace:'nowrap' }}>{s.date}</td>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ fontSize:13, fontWeight:500, color:'#09090B' }}>{s.patient}</div>
                      {s.hasFinancialIssue && (
                        <span title="Ajuste financeiro: lançamento cancelado" style={{ fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:99, background:'#FFFBEB', color:'#D97706', border:'1px solid #FDE68A', whiteSpace:'nowrap' }}>Ajuste fin.</span>
                      )}
                    </div>
                    <div style={{ fontSize:11, color:'#A1A1AA' }}>{s.phone}</div>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ fontSize:13, color:'#09090B' }}>{s.item}</div>
                    {s.desc && <div style={{ fontSize:11, color:'#A1A1AA' }}>{s.desc}</div>}
                  </td>
                  <td style={{ padding:'12px 16px', textAlign:'right', fontSize:13, fontWeight:600, color:'#09090B', whiteSpace:'nowrap' }}>{fmt(s.total)}</td>
                  <td style={{ padding:'12px 16px', textAlign:'right', fontSize:13, fontWeight:600, color:'#16A34A', whiteSpace:'nowrap' }}>{fmt(s.received)}</td>
                  <td style={{ padding:'12px 16px', textAlign:'right', fontSize:13, fontWeight:600, color:s.open>0?'#DC2626':'#A1A1AA', whiteSpace:'nowrap' }}>{fmt(s.open)}</td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ fontSize:11, fontWeight:600, padding:'2px 9px', borderRadius:99, background:ty.bg, color:ty.color }}>{ty.label}</span>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ fontSize:11, fontWeight:600, padding:'2px 9px', borderRadius:99, background:st.bg, color:st.color }}>{st.label}</span>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <TableActions
                      primaryAction={s.open > 0 && s.status !== 'cancelado'
                        ? { label: 'Receber', icon: 'ti-cash', variant: 'success', onClick: () => setReceberSale(s) }
                        : { label: 'Ver', icon: 'ti-eye', variant: 'default', onClick: () => setDetailSale(s) }
                      }
                      secondaryActions={[
                        { label: 'Ver detalhes', icon: 'ti-eye', onClick: () => setDetailSale(s) },
                        ...(s.status !== 'pago' && s.status !== 'cancelado'
                          ? [{ label: 'Editar', icon: 'ti-pencil', onClick: () => { setDetailSale(s); toast('Edição disponível no painel de detalhes.', 'info'); } }]
                          : []
                        ),
                        ...(s.open > 0 && s.status !== 'cancelado'
                          ? [{ label: 'Receber', icon: 'ti-cash', onClick: () => setReceberSale(s) }]
                          : []
                        ),
                        ...(s.patientId
                          ? [{ label: 'Abrir contato', icon: 'ti-user', onClick: () => navigate(`/patients/${s.patientId}`) }]
                          : []
                        ),
                        ...(s.patientId
                          ? [{ label: 'Financeiro do contato', icon: 'ti-receipt', onClick: () => navigate(`/patients/${s.patientId}?tab=Financeiro`) }]
                          : []
                        ),
                        ...(s.status !== 'cancelado'
                          ? [{ label: `Cancelar ${s.type === 'orcamento' ? 'orçamento' : 'venda'}`, icon: 'ti-x', variant: 'danger' as const, onClick: () => setCancelSale(s), separator: true }]
                          : []
                        ),
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ padding:'48px 16px', textAlign:'center', color:'#A1A1AA', fontSize:13 }}>Nenhum resultado encontrado</td></tr>
            )}
          </tbody>
        </table>
        <div style={{ padding:'12px 20px', borderTop:'1px solid #E4E4E7', background:'#FAFAFA', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:12, color:'#71717A' }}>Mostrando <b style={{color:'#09090B'}}>{filtered.length}</b> de <b style={{color:'#09090B'}}>{sales.length}</b> registros</div>
          <div style={{ fontSize:12, color:'#71717A' }}>Página 1 de 1</div>
        </div>
      </div>

      {showNova && (
        <NovaVendaModal
          onClose={() => setShowNova(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['all-sales'] });
            qc.invalidateQueries({ queryKey: ['transactions'] });
            qc.invalidateQueries({ queryKey: ['financial-summary'] });
            setShowNova(false);
          }}
        />
      )}
      {receberSale && <ReceberPanel sale={receberSale} onClose={() => setReceberSale(null)} />}
      {detailSale && (
        <VendaDetailPanel
          sale={detailSale}
          onClose={() => setDetailSale(null)}
          onReceber={() => { setDetailSale(null); setReceberSale(detailSale); }}
          onCancel={() => { setDetailSale(null); setCancelSale(detailSale); }}
        />
      )}
      {cancelSale && (
        <CancelSaleModal
          sale={cancelSale}
          onClose={() => setCancelSale(null)}
          onConfirm={() => cancelMut.mutate(cancelSale.id)}
          loading={cancelMut.isPending}
        />
      )}
    </div>
  );
}

// ─── Tab: Contas — Conferência / Fluxo de caixa ───────────────────────────────
const CONTA_FILTER_TABS = [
  { key:'pendencias',  label:'Pendências' },
  { key:'todas',       label:'Todos' },
  { key:'receber',     label:'A receber' },
  { key:'pagar',       label:'A pagar' },
  { key:'entradas',    label:'Recebidos' },
  { key:'saidas',      label:'Pagos' },
  { key:'vencidas',    label:'Vencidos' },
  { key:'pend_conf',   label:'Pend. conferência' },
  { key:'conferidas',  label:'Conferidos' },
  { key:'divergentes', label:'Divergentes' },
  { key:'canceladas',  label:'Cancelados' },
];

// ─── Modal: Confirmar conferência em massa ────────────────────────────────────
function BulkConferirModal({ contas, onClose }: { contas: Conta[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [ok, setOk] = useState(false);

  const total = contas.reduce((s, c) => s + c.valor, 0);
  const formas = [...new Set(contas.map(c => c.formaPagamento).filter(f => f && f !== '—'))].join(', ') || '—';

  const mut = useMutation({
    mutationFn: async () => {
      const now  = new Date().toISOString();
      const user = currentUserName();
      for (const c of contas) {
        await financialApi.updateTransaction(c.id, {
          statusConferencia: 'CONFERIDO', dataConferencia: now, usuarioConferencia: user, motivoDivergencia: null,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      setOk(true);
      setTimeout(onClose, 1400);
    },
  });

  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', zIndex:500, backdropFilter:'blur(2px)' }} />
      <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:440, background:'#FFFFFF', borderRadius:14, zIndex:501, boxShadow:'0 20px 60px rgba(0,0,0,.15)', display:'flex', flexDirection:'column', fontFamily:'inherit', animation:'fadeUp .2s ease', padding:'28px 28px 20px' }}>
        {ok ? (
          <div style={{ textAlign:'center', padding:'8px 0 16px' }}>
            <div style={{ width:52, height:52, borderRadius:'50%', background:'#DCFCE7', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px' }}>
              <i className="ti ti-circle-check" style={{ fontSize:26, color:'#16A34A' }} />
            </div>
            <div style={{ fontSize:15, fontWeight:700, color:'#09090B' }}>
              {contas.length} lançamento{contas.length > 1 ? 's' : ''} conferido{contas.length > 1 ? 's' : ''} com sucesso!
            </div>
          </div>
        ) : (
          <>
            <div style={{ width:48, height:48, borderRadius:'50%', background:'#DCFCE7', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:14 }}>
              <i className="ti ti-circle-check" style={{ fontSize:22, color:'#16A34A' }} />
            </div>
            <div style={{ fontSize:16, fontWeight:700, color:'#09090B', marginBottom:6 }}>Confirmar conferência em massa</div>
            <div style={{ fontSize:13, color:'#71717A', marginBottom:16, lineHeight:1.6 }}>
              Deseja marcar os lançamentos selecionados como conferidos?
            </div>
            <div style={{ background:'#F8FAFC', borderRadius:10, border:'1px solid #E4E4E7', padding:'14px 16px', marginBottom:20, display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
                <span style={{ color:'#71717A' }}>Lançamentos</span>
                <span style={{ fontWeight:600, color:'#09090B' }}>{contas.length}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
                <span style={{ color:'#71717A' }}>Valor total</span>
                <span style={{ fontWeight:700, color:'#16A34A' }}>{fmt(total)}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
                <span style={{ color:'#71717A' }}>Formas de pagamento</span>
                <span style={{ fontWeight:500, color:'#374151', textAlign:'right', maxWidth:200 }}>{formas}</span>
              </div>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={onClose} style={{ flex:1, height:40, border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:8, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
              <button onClick={() => mut.mutate()} disabled={mut.isPending}
                style={{ flex:2, height:40, background:mut.isPending?'#A1A1AA':'#16A34A', border:'none', borderRadius:8, fontSize:13, fontWeight:600, color:'#FFFFFF', cursor:mut.isPending?'not-allowed':'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                <i className="ti ti-circle-check" style={{ fontSize:14 }} />
                {mut.isPending ? 'Conferindo...' : `Confirmar ${contas.length} conferência${contas.length > 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </Portal>
  );
}

// ─── Modal: Divergência em massa ──────────────────────────────────────────────
function BulkDivergenteModal({ contas, onClose }: { contas: Conta[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState('');
  const [custom, setCustom] = useState('');
  const [error,  setError]  = useState('');

  const MOTIVOS = [
    'Valor não bate com extrato',
    'Valor não caiu na conta',
    'Forma de pagamento incorreta',
    'Data incorreta',
    'Lançamento duplicado',
    'Comprovante ausente',
    'Outro',
  ];

  const mut = useMutation({
    mutationFn: async () => {
      const texto = motivo === 'Outro' ? (custom.trim() || 'Outro') : motivo;
      const now   = new Date().toISOString();
      const user  = currentUserName();
      for (const c of contas) {
        await financialApi.updateTransaction(c.id, {
          statusConferencia: 'DIVERGENTE', dataConferencia: now, usuarioConferencia: user, motivoDivergencia: texto,
        });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transactions'] }); onClose(); },
    onError:   () => setError('Erro ao salvar. Tente novamente.'),
  });

  const handleSave = () => {
    if (!motivo) { setError('Selecione o motivo da divergência.'); return; }
    if (motivo === 'Outro' && !custom.trim()) { setError('Descreva o motivo.'); return; }
    setError('');
    mut.mutate();
  };

  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', zIndex:500, backdropFilter:'blur(2px)' }} />
      <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:440, background:'#FFFFFF', borderRadius:14, zIndex:501, boxShadow:'0 20px 60px rgba(0,0,0,.15)', display:'flex', flexDirection:'column', fontFamily:'inherit', animation:'fadeUp .2s ease' }}>
        <div style={{ padding:'20px 24px', borderBottom:'1px solid #E4E4E7', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:'#09090B' }}>Marcar como divergentes</div>
            <div style={{ fontSize:12, color:'#71717A', marginTop:2 }}>{contas.length} lançamento{contas.length > 1 ? 's' : ''} selecionado{contas.length > 1 ? 's' : ''}</div>
          </div>
          <button onClick={onClose} style={{ width:28, height:28, border:'none', background:'#F4F4F5', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#71717A' }}>
            <i className="ti ti-x" style={{ fontSize:13 }} />
          </button>
        </div>
        <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <label style={lbl}>Motivo da divergência <span style={{color:'#DC2626'}}>*</span></label>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {MOTIVOS.map(m => (
                <label key={m} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color: motivo===m?'#09090B':'#374151', cursor:'pointer', padding:'8px 12px', borderRadius:8, border:`1px solid ${motivo===m?'#DC2626':'#E4E4E7'}`, background:motivo===m?'#FEF2F2':'#FFFFFF' }}>
                  <input type="radio" name="motivo_bulk" value={m} checked={motivo===m} onChange={() => setMotivo(m)} style={{ accentColor:'#DC2626', cursor:'pointer' }} />
                  {m}
                </label>
              ))}
            </div>
          </div>
          {motivo === 'Outro' && (
            <div>
              <label style={lbl}>Descreva o motivo <span style={{color:'#DC2626'}}>*</span></label>
              <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="Descreva o motivo..." style={inp} />
            </div>
          )}
          {error && <div style={{ fontSize:12, color:'#DC2626', padding:'8px 12px', background:'#FEF2F2', borderRadius:8, border:'1px solid #FECACA' }}>{error}</div>}
        </div>
        <div style={{ padding:'14px 24px', borderTop:'1px solid #E4E4E7', display:'flex', gap:10, background:'#FAFAFA' }}>
          <button onClick={onClose} style={{ flex:1, height:40, border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:8, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
          <button onClick={handleSave} disabled={mut.isPending}
            style={{ flex:2, height:40, background:mut.isPending?'#A1A1AA':'#DC2626', border:'none', borderRadius:8, fontSize:13, fontWeight:600, color:'#FFFFFF', cursor:mut.isPending?'not-allowed':'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
            <i className="ti ti-alert-triangle" style={{ fontSize:14 }} />
            {mut.isPending ? 'Salvando...' : `Marcar ${contas.length} como divergente${contas.length > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </Portal>
  );
}

function ContasTab() {
  const [tab,              setTab]              = useState('pendencias');
  const [search,           setSearch]           = useState('');
  const [saldoInicial,     setSaldoInicial]     = useState('0');
  const [novaPanel,        setNovaPanel]        = useState<'receita' | 'despesa' | null>(null);
  const [selected,         setSelected]         = useState<Set<string>>(new Set());
  const [bulkConferirOpen, setBulkConferirOpen] = useState(false);
  const [bulkDivOpen,      setBulkDivOpen]      = useState(false);
  const [filterOpen,       setFilterOpen]       = useState(false);
  const filterWrapRef                           = useRef<HTMLDivElement>(null);
  const [period,           setPeriod]           = useState<PeriodKey>('this_month');
  const [customStart,      setCustomStart]      = useState('');
  const [customEnd,        setCustomEnd]        = useState('');

  useEffect(() => {
    if (!filterOpen) return;
    const handler = (e: MouseEvent) => {
      if (filterWrapRef.current && !filterWrapRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [filterOpen]);

  const [detalhe,           setDetalhe]           = useState<Conta | null>(null);
  const [pagarReceberConta, setPagarReceberConta] = useState<Conta | null>(null);
  const [confirmarConf,     setConfirmarConf]     = useState<Conta | null>(null);
  const [divergenteConta,   setDivergenteConta]   = useState<Conta | null>(null);
  const [cancelarConta,     setCancelarConta]     = useState<Conta | null>(null);
  const [vencimentoConta,   setVencimentoConta]   = useState<Conta | null>(null);
  const [openMenuId,        setOpenMenuId]        = useState<string | null>(null);

  const { data: rawTxs = [], isLoading } = useQuery<any[]>({
    queryKey: ['transactions'],
    queryFn:  () => financialApi.transactions(),
  });
  const { data: summary } = useQuery<any>({
    queryKey: ['financial-summary'],
    queryFn:  () => financialApi.summary(),
  });

  const contas = useMemo<Conta[]>(() => rawTxs.map(mapApiTransaction), [rawTxs]);

  const saldoMap = useMemo(() => {
    const base   = parseFloat(saldoInicial) || 0;
    const sorted = [...contas].filter(c => c.rawStatus === 'PAID').sort((a, b) => a.effectiveDate - b.effectiveDate);
    let running  = base;
    const map: Record<string, number> = {};
    for (const c of sorted) {
      running += c.rawType === 'INCOME' ? c.valor : -c.valor;
      map[c.id] = running;
    }
    contas.filter(c => c.rawStatus !== 'PAID').forEach(c => { map[c.id] = running; });
    return { map, total: running };
  }, [contas, saldoInicial]);

  const { start: pStart, end: pEnd } = useMemo(() => computePeriodRange(period, customStart, customEnd), [period, customStart, customEnd]);

  const filtered = useMemo(() => {
    return contas
      .filter(c => {
        // period filter (applied to all tabs except 'todas' for display flexibility, but keep it always on)
        if (c.effectiveDate < pStart.getTime() || c.effectiveDate > pEnd.getTime()) return false;
        if (tab === 'pendencias')  return isPendingFinancialEntry(c);
        if (tab === 'entradas')    return c.rawType === 'INCOME'  && c.rawStatus === 'PAID';
        if (tab === 'saidas')      return c.rawType === 'EXPENSE' && c.rawStatus === 'PAID';
        if (tab === 'receber')     return c.rawType === 'INCOME'  && c.rawStatus === 'PENDING';
        if (tab === 'pagar')       return c.rawType === 'EXPENSE' && c.rawStatus === 'PENDING';
        if (tab === 'pend_conf')   return c.rawStatus === 'PAID'  && c.statusConferencia === 'PENDENTE';
        if (tab === 'conferidas')  return c.statusConferencia === 'CONFERIDO';
        if (tab === 'divergentes') return c.statusConferencia === 'DIVERGENTE';
        if (tab === 'vencidas')    return c.status === 'vencido';
        if (tab === 'canceladas')  return c.rawStatus === 'CANCELLED';
        return true; // todas
      })
      .filter(c => !search ||
        c.pessoa.toLowerCase().includes(search.toLowerCase()) ||
        c.descricao.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => b.effectiveDate - a.effectiveDate);
  }, [contas, tab, search, pStart, pEnd]);

  useEffect(() => { setSelected(new Set()); }, [tab, search]);

  const kpis = useMemo(() => [
    { label:'A receber',   value: fmt(summary?.aReceber ?? 0),                                                              sub:'Pendente de recebimento', icon:'ti-circle-arrow-down', iconBg:'#DCFCE7', iconColor:'#16A34A' },
    { label:'Pend. conf.', value: String(contas.filter(c => c.rawStatus === 'PAID' && c.statusConferencia === 'PENDENTE').length), sub:'aguardam conferência', icon:'ti-eye',             iconBg:'#FFFBEB', iconColor:'#D97706' },
    { label:'A pagar',     value: fmt(summary?.aPagar ?? 0),                                                                sub:'Pendente de pagamento',   icon:'ti-circle-arrow-up',   iconBg:'#FEF2F2', iconColor:'#DC2626' },
    { label:'Divergentes', value: String(contas.filter(c => c.statusConferencia === 'DIVERGENTE').length),                  sub:'divergências pendentes',  icon:'ti-alert-triangle',    iconBg:'#FEF2F2', iconColor:'#DC2626' },
  ], [summary, contas]);

  const selectedContas = useMemo(() => filtered.filter(c => selected.has(c.id)), [filtered, selected]);
  const allChecked     = filtered.length > 0 && filtered.every(c => selected.has(c.id));
  const someChecked    = filtered.some(c => selected.has(c.id)) && !allChecked;

  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(filtered.map(c => c.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const handleAction = (conta: Conta, action: string) => {
    if (action === 'ver')                      setDetalhe(conta);
    else if (action === 'pagar_receber')       setPagarReceberConta(conta);
    else if (action === 'conferir')            setConfirmarConf(conta);
    else if (action === 'resolver')            setConfirmarConf(conta);
    else if (action === 'divergente')          setDivergenteConta(conta);
    else if (action === 'cancelar')            setCancelarConta(conta);
    else if (action === 'alterar_vencimento')  setVencimentoConta(conta);
    else if (action === 'ver_venda')           setDetalhe(conta);
  };

  const activeFilterLabel = CONTA_FILTER_TABS.find(t => t.key === tab)?.label || 'Todos';
  const isDefaultFilter   = tab === 'pendencias';

  return (
    <div style={{ padding:'16px 28px', display:'flex', flexDirection:'column', gap:14 }}>

      {/* KPIs + Saldo na mesma linha */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:12 }}>
        {/* Card saldo inicial (editável) */}
        <div style={{ background:'#FFFFFF', borderRadius:12, border:'1px solid #E4E4E7', padding:'14px 16px', display:'flex', flexDirection:'column', gap:4 }}>
          <div style={{ fontSize:11, color:'#71717A', fontWeight:500, textTransform:'uppercase', letterSpacing:'.04em' }}>Saldo inicial</div>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ fontSize:13, color:'#A1A1AA', fontWeight:500 }}>R$</span>
            <input type="number" value={saldoInicial} onChange={e => setSaldoInicial(e.target.value)} step={0.01}
              style={{ border:'none', background:'transparent', fontSize:18, fontWeight:700, color:'#09090B', outline:'none', width:'100%', fontFamily:'inherit', padding:0, minWidth:0 }} />
          </div>
          <div style={{ fontSize:11, color:'#A1A1AA' }}>base para o saldo</div>
        </div>

        {/* KPI cards normais */}
        {kpis.map(k => (
          <div key={k.label} style={{ background:'#FFFFFF', borderRadius:12, border:'1px solid #E4E4E7', padding:'14px 16px', display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:9, background:k.iconBg, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className={`ti ${k.icon}`} style={{ fontSize:16, color:k.iconColor }} />
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:11, color:'#71717A', fontWeight:500, marginBottom:2, textTransform:'uppercase', letterSpacing:'.04em', whiteSpace:'nowrap' }}>{k.label}</div>
              <div style={{ fontSize:16, fontWeight:700, color:'#09090B', lineHeight:1.2 }}>{k.value}</div>
              <div style={{ fontSize:11, color:'#A1A1AA', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{k.sub}</div>
            </div>
          </div>
        ))}

        {/* Card saldo atual */}
        <div style={{ background:'#F0FDF4', borderRadius:12, border:'1px solid #BBF7D0', padding:'14px 16px', display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:9, background:'#DCFCE7', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <i className="ti ti-wallet" style={{ fontSize:16, color:'#16A34A' }} />
          </div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:11, color:'#15803D', fontWeight:500, marginBottom:2, textTransform:'uppercase', letterSpacing:'.04em', whiteSpace:'nowrap' }}>Saldo atual</div>
            <div style={{ fontSize:16, fontWeight:700, color:'#15803D', lineHeight:1.2 }}>{fmt(saldoMap.total)}</div>
            <div style={{ fontSize:11, color:'#86EFAC', whiteSpace:'nowrap' }}>calculado</div>
          </div>
        </div>
      </div>

      {/* Filtros — linha compacta */}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        {/* Busca */}
        <div style={{ display:'flex', alignItems:'center', gap:6, height:36, padding:'0 12px', border:'1px solid #E4E4E7', borderRadius:99, background:'#FFFFFF', flex:'1 1 220px', maxWidth:300 }}>
          <i className="ti ti-search" style={{ fontSize:13, color:'#A1A1AA', flexShrink:0 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar lançamento, contato ou descrição..." style={{ border:'none', background:'transparent', fontSize:12, outline:'none', width:'100%', fontFamily:'inherit', color:'#09090B' }} />
        </div>

        {/* Período */}
        <PeriodDropdown period={period} customStart={customStart} customEnd={customEnd}
          onChange={(p, cs, ce) => { setPeriod(p); if (cs) setCustomStart(cs); if (ce) setCustomEnd(ce); }} />

        {/* Filtros popover */}
        <div ref={filterWrapRef} style={{ position:'relative', flexShrink:0 }}>
          <button onClick={() => setFilterOpen(v => !v)}
            style={{ height:36, padding:'0 14px', border:`1px solid ${!isDefaultFilter ? '#000' : '#E4E4E7'}`, borderRadius:99, fontSize:12, fontWeight:500, color:'#09090B', background:!isDefaultFilter ? '#F4F4F5' : '#FFFFFF', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}>
            <i className="ti ti-filter" style={{ fontSize:12, color:'#71717A' }} />
            {activeFilterLabel}
            {!isDefaultFilter && (
              <span onClick={e => { e.stopPropagation(); setTab('pendencias'); }} style={{ marginLeft:2, color:'#71717A', fontSize:11, fontWeight:700 }}>×</span>
            )}
            <i className="ti ti-chevron-down" style={{ fontSize:11, marginLeft:2, transform:filterOpen?'rotate(180deg)':'none', transition:'transform .15s' }} />
          </button>
          {filterOpen && (
            <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, zIndex:200, background:'#FFFFFF', borderRadius:12, border:'1px solid #E4E4E7', boxShadow:'0 8px 24px rgba(0,0,0,0.10)', padding:'6px', minWidth:200, animation:'fadeUp .12s ease' }}>
              {CONTA_FILTER_TABS.map(t => {
                const active = tab === t.key;
                return (
                  <button key={t.key} onClick={() => { setTab(t.key); setFilterOpen(false); }}
                    style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', padding:'8px 12px', borderRadius:8, border:'none', fontSize:12, fontWeight:active?600:400, color:active?'#09090B':'#374151', background:active?'#F4F4F5':'transparent', cursor:'pointer', fontFamily:'inherit', textAlign:'left' }}>
                    {t.label}
                    {active && <i className="ti ti-check" style={{ fontSize:12, color:'#09090B' }} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ flex:1 }} />

        {/* Ações */}
        <button onClick={() => setNovaPanel('receita')}
          style={{ height:36, padding:'0 14px', background:'#FFFFFF', border:'1px solid #16A34A', borderRadius:99, fontSize:13, fontWeight:600, color:'#16A34A', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit', flexShrink:0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background='#F0FDF4'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background='#FFFFFF'; }}>
          <i className="ti ti-circle-arrow-down" style={{ fontSize:13 }} /> Lançar receita
        </button>
        <button onClick={() => setNovaPanel('despesa')}
          style={{ height:36, padding:'0 14px', background:'#FFFFFF', border:'1px solid #DC2626', borderRadius:99, fontSize:13, fontWeight:600, color:'#DC2626', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit', flexShrink:0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background='#FEF2F2'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background='#FFFFFF'; }}>
          <i className="ti ti-circle-arrow-up" style={{ fontSize:13 }} /> Lançar despesa
        </button>
      </div>

      {/* Barra de ações em massa */}
      {selected.size > 0 && (
        <div style={{ background:'#18181B', borderRadius:10, padding:'10px 16px', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <span style={{ fontSize:13, fontWeight:600, color:'#FFFFFF', whiteSpace:'nowrap' }}>
            {selected.size} lançamento{selected.size > 1 ? 's' : ''} selecionado{selected.size > 1 ? 's' : ''}
          </span>
          <div style={{ flex:1 }} />
          <button onClick={() => setBulkConferirOpen(true)}
            style={{ height:32, padding:'0 12px', background:'#16A34A', border:'none', borderRadius:8, fontSize:12, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap' }}>
            <i className="ti ti-circle-check" style={{ fontSize:13 }} /> Marcar como conferidos
          </button>
          <button onClick={() => setBulkDivOpen(true)}
            style={{ height:32, padding:'0 12px', background:'#DC2626', border:'none', borderRadius:8, fontSize:12, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap' }}>
            <i className="ti ti-alert-triangle" style={{ fontSize:13 }} /> Marcar como divergentes
          </button>
          <button onClick={() => setSelected(new Set())}
            style={{ height:32, padding:'0 12px', background:'transparent', border:'1px solid rgba(255,255,255,.2)', borderRadius:8, fontSize:12, fontWeight:500, color:'rgba(255,255,255,.8)', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
            Limpar seleção
          </button>
        </div>
      )}

      {/* Tabela */}
      {isLoading ? (
        <div style={{ textAlign:'center', padding:48, color:'#71717A', fontSize:14 }}>
          <i className="ti ti-loader-2" style={{ fontSize:28, display:'block', marginBottom:10, color:'#A1A1AA' }} />
          Carregando movimentações...
        </div>
      ) : (
        <div style={{ background:'#FFFFFF', borderRadius:12, border:'1px solid #E4E4E7', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#F4F4F5', borderBottom:'1px solid #E4E4E7' }}>
                <th style={{ padding:'10px 12px', width:36 }}>
                  <input type="checkbox" checked={allChecked}
                    ref={el => { if (el) el.indeterminate = someChecked; }}
                    onChange={toggleAll}
                    style={{ cursor:'pointer', accentColor:'#000000', width:14, height:14 }} />
                </th>
                {[
                  { h:'Data',        align:'left'   },
                  { h:'Tipo',        align:'left'   },
                  { h:'Pessoa',      align:'left'   },
                  { h:'Descrição',   align:'left'   },
                  { h:'Referência',  align:'left'   },
                  { h:'Forma',       align:'left'   },
                  { h:'Valor',       align:'right'  },
                  { h:'Saldo',       align:'right'  },
                  { h:'Status',      align:'left'   },
                  { h:'Conferência', align:'left'   },
                  { h:'Ações',       align:'right'  },
                ].map(col => (
                  <th key={col.h} style={{ padding:'10px 14px', textAlign:col.align as any, fontSize:11, fontWeight:600, color:'#71717A', textTransform:'uppercase', letterSpacing:'.06em', whiteSpace:'nowrap' }}>{col.h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const st         = CONTA_STATUS[c.status];
                const tp         = CONTA_TIPO[c.tipo];
                const cs         = CONF_STATUS[c.statusConferencia];
                const saldo      = saldoMap.map[c.id];
                const isPaid     = c.rawStatus === 'PAID';
                const isPending  = c.rawStatus === 'PENDING';
                const isSelected = selected.has(c.id);

                let actionBtn;
                if (isPaid && c.statusConferencia === 'PENDENTE') {
                  actionBtn = (
                    <button onClick={() => setConfirmarConf(c)}
                      style={{ height:28, padding:'0 10px', background:'#16A34A', border:'none', borderRadius:7, fontSize:11, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:4, whiteSpace:'nowrap' }}>
                      <i className="ti ti-circle-check" style={{ fontSize:11 }} /> Conferir
                    </button>
                  );
                } else if (isPaid && c.statusConferencia === 'DIVERGENTE') {
                  actionBtn = (
                    <button onClick={() => setConfirmarConf(c)}
                      style={{ height:28, padding:'0 10px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:7, fontSize:11, fontWeight:600, color:'#DC2626', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:4, whiteSpace:'nowrap' }}>
                      <i className="ti ti-alert-triangle" style={{ fontSize:11 }} /> Resolver
                    </button>
                  );
                } else if (isPending && c.rawType === 'EXPENSE') {
                  actionBtn = (
                    <button onClick={() => setPagarReceberConta(c)}
                      style={{ height:28, padding:'0 10px', background:'#2563EB', border:'none', borderRadius:7, fontSize:11, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                      Pagar
                    </button>
                  );
                } else {
                  actionBtn = (
                    <button onClick={() => setDetalhe(c)}
                      style={{ height:28, padding:'0 10px', border:'1px solid #E4E4E7', borderRadius:7, fontSize:11, fontWeight:500, color:'#374151', background:'#FFFFFF', cursor:'pointer', fontFamily:'inherit' }}>
                      Ver
                    </button>
                  );
                }

                return (
                  <tr key={c.id}
                    style={{ borderBottom:'1px solid #F4F4F5', background: isSelected ? '#EFF6FF' : 'transparent' }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#F9F9F9'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = isSelected ? '#EFF6FF' : 'transparent'; }}>

                    <td style={{ padding:'11px 12px' }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleOne(c.id)}
                        style={{ cursor:'pointer', accentColor:'#000000', width:14, height:14 }} />
                    </td>

                    <td style={{ padding:'11px 14px', fontSize:12, color:'#71717A', whiteSpace:'nowrap' }}>{c.vencimento}</td>

                    <td style={{ padding:'11px 14px' }}>
                      <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:99, background:tp.bg, color:tp.color, display:'inline-flex', alignItems:'center', gap:3, whiteSpace:'nowrap' }}>
                        <i className={`ti ${tp.icon}`} style={{ fontSize:10 }} /> {tp.label}
                      </span>
                    </td>

                    <td style={{ padding:'11px 14px' }}>
                      <div style={{ fontSize:13, fontWeight:500, color:'#09090B', maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.pessoa}</div>
                      {c.phone !== '—' && <div style={{ fontSize:11, color:'#A1A1AA' }}>{c.phone}</div>}
                    </td>

                    <td style={{ padding:'11px 14px', fontSize:12, color:'#374151', maxWidth:160 }}>
                      <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.descricao}</div>
                    </td>

                    <td style={{ padding:'11px 14px', fontSize:11, color:'#A1A1AA', whiteSpace:'nowrap' }}>{c.referencia}</td>

                    <td style={{ padding:'11px 14px', fontSize:12, color:'#71717A', whiteSpace:'nowrap' }}>{c.formaPagamento}</td>

                    <td style={{ padding:'11px 14px', textAlign:'right', fontSize:13, fontWeight:700, whiteSpace:'nowrap', color: c.rawType === 'EXPENSE' ? '#DC2626' : '#16A34A' }}>
                      {c.rawType === 'EXPENSE' ? '−' : '+'}{fmt(c.valor)}
                    </td>

                    <td style={{ padding:'11px 14px', textAlign:'right', whiteSpace:'nowrap' }}>
                      {isPaid ? (
                        <span style={{ fontSize:13, fontWeight:600, color:'#09090B' }}>{fmt(saldo ?? 0)}</span>
                      ) : (
                        <span style={{ fontSize:12, color:'#A1A1AA' }}>—</span>
                      )}
                    </td>

                    <td style={{ padding:'11px 14px' }}>
                      <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:99, background:st.bg, color:st.color, whiteSpace:'nowrap' }}>{st.label}</span>
                    </td>

                    <td style={{ padding:'11px 14px' }}>
                      <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:99, background:cs.bg, color:cs.color, display:'inline-flex', alignItems:'center', gap:3, whiteSpace:'nowrap' }}>
                        <i className={`ti ${cs.icon}`} style={{ fontSize:10 }} /> {cs.label}
                      </span>
                    </td>

                    <td style={{ padding:'11px 14px' }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:4, position:'relative' }}>
                        {actionBtn}
                        <div style={{ position:'relative' }}>
                          <button onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === c.id ? null : c.id); }}
                            style={{ width:26, height:26, border:'none', background:'transparent', borderRadius:6, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#A1A1AA' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background='#F4F4F5'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background='transparent'; }}>
                            <i className="ti ti-dots-vertical" style={{ fontSize:13 }} />
                          </button>
                          {openMenuId === c.id && (
                            <ContaContextMenu conta={c} onAction={action => handleAction(c, action)} onClose={() => setOpenMenuId(null)} />
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} style={{ padding:'48px 16px', textAlign:'center' }}>
                    <i className="ti ti-receipt-off" style={{ fontSize:36, color:'#D1D5DB', display:'block', marginBottom:10 }} />
                    <div style={{ fontSize:14, fontWeight:600, color:'#6B7280', marginBottom:4 }}>Nenhuma movimentação encontrada</div>
                    <div style={{ fontSize:12, color:'#9CA3AF' }}>As movimentações aparecem automaticamente quando pagamentos são registrados</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div style={{ padding:'12px 20px', borderTop:'1px solid #E4E4E7', background:'#FAFAFA', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontSize:12, color:'#71717A' }}>Mostrando <b style={{color:'#09090B'}}>{filtered.length}</b> de <b style={{color:'#09090B'}}>{contas.length}</b> movimentações</div>
            <div style={{ fontSize:12, color:'#71717A', display:'flex', alignItems:'center', gap:6 }}>
              <i className="ti ti-circle-check" style={{ fontSize:12, color:'#16A34A' }} />
              {contas.filter(c => c.statusConferencia === 'CONFERIDO').length} conferidas de {contas.filter(c => c.rawStatus === 'PAID').length} pagas/recebidas
            </div>
          </div>
        </div>
      )}

      {/* Modais e painéis */}
      {pagarReceberConta && <PagarReceberModal conta={pagarReceberConta} onClose={() => setPagarReceberConta(null)} />}
      {confirmarConf     && <ConfirmarConferenciaModal conta={confirmarConf} onClose={() => setConfirmarConf(null)} />}
      {divergenteConta   && <DivergentModal conta={divergenteConta} onClose={() => setDivergenteConta(null)} />}
      {cancelarConta     && <CancelarModal conta={cancelarConta} onClose={() => setCancelarConta(null)} />}
      {vencimentoConta   && <AlterarVencimentoModal conta={vencimentoConta} onClose={() => setVencimentoConta(null)} />}
      {bulkConferirOpen  && <BulkConferirModal contas={selectedContas} onClose={() => { setBulkConferirOpen(false); setSelected(new Set()); }} />}
      {bulkDivOpen       && <BulkDivergenteModal contas={selectedContas} onClose={() => { setBulkDivOpen(false); setSelected(new Set()); }} />}

      {detalhe && (
        <DetalhePanel
          conta={detalhe}
          onClose={() => setDetalhe(null)}
          onConferir={() => { setDetalhe(null); setConfirmarConf(detalhe); }}
          onDivergente={() => { setDetalhe(null); setDivergenteConta(detalhe); }}
          onPagarReceber={() => { setDetalhe(null); setPagarReceberConta(detalhe); }}
          onCancelar={() => { setDetalhe(null); setCancelarConta(detalhe); }}
        />
      )}

      {novaPanel && <NovaLancamentoPanel mode={novaPanel} onClose={() => setNovaPanel(null)} />}
    </div>
  );
}

// ─── Tab: Relatórios ──────────────────────────────────────────────────────────
const RELATORIOS = [
  { icon:'ti-calendar-stats',    title:'Vendas por período',      desc:'Total vendido, orçamentos e taxa de conversão',    soon:false },
  { icon:'ti-cash',              title:'Recebimentos por período', desc:'Entradas, formas de pagamento e saldos recebidos', soon:false },
  { icon:'ti-circle-arrow-up',   title:'Contas a pagar',          desc:'Despesas, vencimentos e fluxo de saída',           soon:false },
  { icon:'ti-circle-arrow-down', title:'Contas a receber',        desc:'Parcelas, cobranças e inadimplência',              soon:false },
  { icon:'ti-alert-triangle',    title:'Inadimplência',           desc:'Clientes em atraso e análise de risco',            soon:true },
  { icon:'ti-stethoscope',       title:'Vendas por serviço',      desc:'Serviços mais vendidos e receita por item',        soon:true },
  { icon:'ti-user-heart',        title:'Vendas por profissional', desc:'Produtividade e receita por profissional',         soon:true },
];

function RelatoriosTab() {
  return (
    <div style={{ padding:'24px 40px' }}>
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:15, fontWeight:600, color:'#09090B' }}>Relatórios financeiros</div>
        <div style={{ fontSize:13, color:'#71717A', marginTop:4 }}>Selecione um relatório para visualizar os dados detalhados.</div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
        {RELATORIOS.map((r, i) => (
          <div key={i}
            style={{ background:'#FFFFFF', borderRadius:12, border:'1px solid #E4E4E7', padding:'24px', cursor:r.soon?'default':'pointer', opacity:r.soon?.6:1, transition:'all .15s' }}
            onMouseEnter={e => { if(!r.soon) { (e.currentTarget as HTMLElement).style.boxShadow='0 4px 16px rgba(0,0,0,.08)'; (e.currentTarget as HTMLElement).style.borderColor='#D4D4D8'; } }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow='none'; (e.currentTarget as HTMLElement).style.borderColor='#E4E4E7'; }}>
            <div style={{ width:44, height:44, borderRadius:12, background:'#F4F4F5', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:14 }}>
              <i className={`ti ${r.icon}`} style={{ fontSize:20, color:'#71717A' }} />
            </div>
            <div style={{ fontSize:14, fontWeight:600, color:'#09090B', marginBottom:4 }}>{r.title}</div>
            <div style={{ fontSize:12, color:'#71717A', lineHeight:1.6 }}>{r.desc}</div>
            {r.soon && (
              <div style={{ marginTop:12, fontSize:11, fontWeight:600, color:'#A1A1AA', display:'flex', alignItems:'center', gap:5 }}>
                <i className="ti ti-clock" style={{ fontSize:12 }} /> Em breve
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function FinancialPage() {
  const [searchParams] = useSearchParams();

  const mainTab    = (searchParams.get('tab') as MainTab) || 'vendas';

  const { data: apiSales = [] } = useQuery({
    queryKey: ['all-sales'],
    queryFn: () => salesApi.list(),
  });

  const sales: Sale[] = useMemo(() => (apiSales as any[]).map(mapApiSale), [apiSales]);

  return (
    <>
      <style>{`
        @keyframes slideIn { from { transform:translateX(100%); } to { transform:translateX(0); } }
        @keyframes fadeUp  { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin    { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ height:'100%', display:'flex', flexDirection:'column', overflow:'hidden', background:'transparent', fontFamily:"'Inter', system-ui, sans-serif" }}>
        <div style={{ flex:1, overflowY:'auto', minHeight:0 }}>
          {mainTab === 'vendas'     && <VendasTab sales={sales} />}
          {mainTab === 'contas'     && <ContasTab />}
          {mainTab === 'relatorios' && <RelatoriosTab />}
        </div>
      </div>
    </>
  );
}
