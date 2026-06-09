import { useState, useRef, useEffect } from 'react';
import { useToast } from '../../components/ui/Toast';

// ─── Types ────────────────────────────────────────────────────────────────────
type ContratoStatus =
  | 'a_gerar' | 'gerado' | 'impresso'
  | 'aguardando_assinatura' | 'assinado'
  | 'vencendo' | 'vencido' | 'cancelado';

interface Contrato {
  id: number;
  paciente: string;
  contrato: string;
  venda: string;
  valor: number;
  status: ContratoStatus;
  data: string;
  validade: string;
  local: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const INIT_CONTRATOS: Contrato[] = [
  { id:  1, paciente: 'Ana Beatriz Santos',    contrato: 'Protocolo JR 60 dias',           venda: 'V-2025-001', valor: 3200,  status: 'assinado',              data: '10/01/2025', validade: '10/03/2025', local: 'Pasta 2025/Contratos' },
  { id:  2, paciente: 'Carlos Eduardo Lima',   contrato: 'Plano acompanhamento 6 meses',   venda: 'V-2025-002', valor: 5400,  status: 'assinado',              data: '15/01/2025', validade: '15/07/2025', local: 'Pasta 2025/Contratos' },
  { id:  3, paciente: 'Fernanda Oliveira',     contrato: 'Soroterapia Performance',        venda: 'V-2025-003', valor: 1800,  status: 'assinado',              data: '22/01/2025', validade: '22/04/2025', local: 'Pasta 2025/Contratos' },
  { id:  4, paciente: 'Rodrigo Nascimento',    contrato: 'Protocolo JR 30 dias',           venda: 'V-2025-004', valor: 1900,  status: 'assinado',              data: '28/01/2025', validade: '28/02/2025', local: 'Pasta 2025/Contratos' },
  { id:  5, paciente: 'Juliana Ferreira',      contrato: 'Aplicação Vitamina D',           venda: 'V-2025-005', valor:  480,  status: 'assinado',              data: '03/02/2025', validade: '03/03/2025', local: 'Pasta 2025/Contratos' },
  { id:  6, paciente: 'Marcelo Almeida',       contrato: 'Bioimpedância',                  venda: 'V-2025-006', valor:  320,  status: 'assinado',              data: '07/02/2025', validade: '07/03/2025', local: 'Pasta 2025/Contratos' },
  { id:  7, paciente: 'Patricia Costa',        contrato: 'Protocolo JR 60 dias',           venda: 'V-2025-007', valor: 3200,  status: 'assinado',              data: '14/02/2025', validade: '14/04/2025', local: 'Pasta 2025/Contratos' },
  { id:  8, paciente: 'Rafael Souza',          contrato: 'Plano acompanhamento 6 meses',   venda: 'V-2025-008', valor: 5400,  status: 'assinado',              data: '20/02/2025', validade: '20/08/2025', local: 'Pasta 2025/Contratos' },
  { id:  9, paciente: 'Camila Torres',         contrato: 'Soroterapia Performance',        venda: 'V-2025-009', valor: 1800,  status: 'assinado',              data: '27/02/2025', validade: '27/05/2025', local: 'Pasta 2025/Contratos' },
  { id: 10, paciente: 'Lucas Barbosa',         contrato: 'Protocolo JR 60 dias',           venda: 'V-2025-010', valor: 3200,  status: 'assinado',              data: '05/03/2025', validade: '05/05/2025', local: 'Pasta 2025/Contratos' },
  { id: 11, paciente: 'Beatriz Rocha',         contrato: 'Aplicação Vitamina D',           venda: 'V-2025-011', valor:  480,  status: 'aguardando_assinatura', data: '—',          validade: '—',           local: '—' },
  { id: 12, paciente: 'Diego Carvalho',        contrato: 'Protocolo JR 30 dias',           venda: 'V-2025-012', valor: 1900,  status: 'aguardando_assinatura', data: '—',          validade: '—',           local: '—' },
  { id: 13, paciente: 'Larissa Mendonça',      contrato: 'Plano acompanhamento 6 meses',   venda: 'V-2025-013', valor: 5400,  status: 'aguardando_assinatura', data: '—',          validade: '—',           local: '—' },
  { id: 14, paciente: 'Bruno Martins',         contrato: 'Soroterapia Performance',        venda: 'V-2025-014', valor: 1800,  status: 'aguardando_assinatura', data: '—',          validade: '—',           local: '—' },
  { id: 15, paciente: 'Vanessa Pires',         contrato: 'Bioimpedância',                  venda: 'V-2025-015', valor:  320,  status: 'aguardando_assinatura', data: '—',          validade: '—',           local: '—' },
  { id: 16, paciente: 'Eduardo Ribeiro',       contrato: 'Protocolo JR 60 dias',           venda: 'V-2025-016', valor: 3200,  status: 'vencendo',              data: '01/09/2024', validade: '01/03/2025', local: 'Pasta 2024/Contratos' },
  { id: 17, paciente: 'Isabela Gonçalves',     contrato: 'Plano acompanhamento 6 meses',   venda: 'V-2025-017', valor: 5400,  status: 'vencendo',              data: '15/09/2024', validade: '15/03/2025', local: 'Pasta 2024/Contratos' },
  { id: 18, paciente: 'Thiago Moreira',        contrato: 'Soroterapia Performance',        venda: 'V-2025-018', valor: 1800,  status: 'vencendo',              data: '20/09/2024', validade: '20/03/2025', local: 'Pasta 2024/Contratos' },
  { id: 19, paciente: 'Amanda Freitas',        contrato: 'Protocolo JR 30 dias',           venda: 'V-2025-019', valor: 1900,  status: 'vencendo',              data: '25/09/2024', validade: '25/03/2025', local: 'Pasta 2024/Contratos' },
  { id: 20, paciente: 'Renata Campos',         contrato: 'Protocolo JR 60 dias',           venda: 'V-2025-020', valor: 3200,  status: 'a_gerar',               data: '—',          validade: '—',           local: '—' },
  { id: 21, paciente: 'Gustavo Teixeira',      contrato: 'Aplicação Vitamina D',           venda: 'V-2025-021', valor:  480,  status: 'a_gerar',               data: '—',          validade: '—',           local: '—' },
  { id: 22, paciente: 'Natalia Ramos',         contrato: 'Plano acompanhamento 6 meses',   venda: 'V-2025-022', valor: 5400,  status: 'a_gerar',               data: '—',          validade: '—',           local: '—' },
  { id: 23, paciente: 'Felipe Correia',        contrato: 'Bioimpedância',                  venda: 'V-2025-023', valor:  320,  status: 'a_gerar',               data: '—',          validade: '—',           local: '—' },
  { id: 24, paciente: 'Aline Vieira',          contrato: 'Soroterapia Performance',        venda: 'V-2025-024', valor: 1800,  status: 'a_gerar',               data: '—',          validade: '—',           local: '—' },
  { id: 25, paciente: 'Henrique Fonseca',      contrato: 'Protocolo JR 30 dias',           venda: 'V-2025-025', valor: 1900,  status: 'a_gerar',               data: '—',          validade: '—',           local: '—' },
];

// ─── Status Config ────────────────────────────────────────────────────────────
const STATUS_CFG: Record<ContratoStatus, { bg: string; color: string; label: string }> = {
  a_gerar:               { bg:'#EFF6FF', color:'#2563EB', label:'A gerar' },
  gerado:                { bg:'#F5F3FF', color:'#7C3AED', label:'Gerado' },
  impresso:              { bg:'#F0FDFA', color:'#0D9488', label:'Impresso' },
  aguardando_assinatura: { bg:'#FFFBEB', color:'#D97706', label:'Aguardando assinatura' },
  assinado:              { bg:'#DCFCE7', color:'#16A34A', label:'Assinado' },
  vencendo:              { bg:'#FFF7ED', color:'#C2410C', label:'Vencendo' },
  vencido:               { bg:'#FEF2F2', color:'#DC2626', label:'Vencido' },
  cancelado:             { bg:'#F4F4F5', color:'#71717A', label:'Cancelado' },
};

const fmt = (v: number) => v.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });

const PROCEDIMENTOS = ['Protocolo JR 60 dias','Plano acompanhamento 6 meses','Soroterapia Performance','Protocolo JR 30 dias','Aplicação Vitamina D','Bioimpedância'];

// ─── Context Menu ─────────────────────────────────────────────────────────────
interface CtxPos { x: number; y: number; id: number; }

function ContextMenu({ pos, onClose, onNi }: { pos: CtxPos; onClose: () => void; onNi: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    setTimeout(() => document.addEventListener('mousedown', h), 0);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const items = [
    { icon:'ti-file-download', label:'Baixar PDF',        action: () => { onNi(); onClose(); } },
    { icon:'ti-user',          label:'Abrir paciente',    action: () => { onNi(); onClose(); } },
    { icon:'ti-receipt',       label:'Abrir venda',       action: () => { onNi(); onClose(); } },
    null,
    { icon:'ti-x',             label:'Cancelar contrato', danger:true, action: () => { onNi(); onClose(); } },
  ];

  return (
    <div ref={ref} style={{ position:'fixed', top:pos.y, left:pos.x, zIndex:500, background:'#FFFFFF', border:'1px solid #E4E4E7', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,.12)', padding:'4px', minWidth:188, animation:'fadeUp .1s ease' }}>
      {items.map((item, i) =>
        item === null ? (
          <div key={i} style={{ height:1, background:'#F1F5F9', margin:'3px 0' }} />
        ) : (
          <button key={item.label} onClick={item.action}
            style={{ display:'flex', alignItems:'center', gap:9, width:'100%', padding:'7px 12px', border:'none', background:'none', borderRadius:7, cursor:'pointer', fontSize:13, color: item.danger ? '#DC2626' : '#374151', fontFamily:'inherit', textAlign:'left' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = item.danger ? '#FEF2F2' : '#F4F4F5'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}>
            <i className={`ti ${item.icon}`} style={{ fontSize:14, color: item.danger ? '#DC2626' : '#71717A' }} />
            {item.label}
          </button>
        )
      )}
    </div>
  );
}

const NEXT_STATUS: Partial<Record<ContratoStatus, ContratoStatus>> = {
  a_gerar:               'gerado',
  gerado:                'impresso',
  impresso:              'aguardando_assinatura',
  aguardando_assinatura: 'assinado',
};

// ─── Action Button ────────────────────────────────────────────────────────────
function ActionBtn({ status, onAction }: { status: ContratoStatus; onAction: () => void }) {
  const base: React.CSSProperties = { height:30, padding:'0 13px', border:'none', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' };

  if (status === 'a_gerar') return (
    <button onClick={onAction} style={{ ...base, background:'#000', color:'#fff' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#18181B'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#000'; }}>
      Gerar
    </button>
  );
  if (status === 'gerado') return (
    <button onClick={onAction} style={{ ...base, background:'#F5F3FF', color:'#7C3AED' }}>Imprimir</button>
  );
  if (status === 'impresso') return (
    <button onClick={onAction} style={{ ...base, background:'#FFFBEB', color:'#D97706' }}>Anexar</button>
  );
  if (status === 'aguardando_assinatura') return (
    <button onClick={onAction} style={{ ...base, background:'#FFFBEB', color:'#D97706' }}>Anexar</button>
  );
  if (status === 'vencendo') return (
    <button style={{ ...base, background:'#FFF7ED', color:'#C2410C', fontWeight:500 }}>Ver</button>
  );
  return (
    <button style={{ ...base, background:'#F4F4F5', color:'#71717A', fontWeight:500 }}>Ver</button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function ContratosPage() {
  const { toast } = useToast();
  const ni = () => toast('Funcionalidade ainda não implementada.', 'info');
  const [tab,        setTab]        = useState('todos');
  const [search,     setSearch]     = useState('');
  const [procFilter, setProcFilter] = useState('');
  const [stFilter,   setStFilter]   = useState<ContratoStatus | ''>('');
  const [ctxMenu,    setCtxMenu]    = useState<CtxPos | null>(null);
  const [contratos,  setContratos]  = useState<Contrato[]>(INIT_CONTRATOS);

  const handleCtx = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setCtxMenu({ x: r.right - 188, y: r.bottom + 4, id });
  };

  const handleAction = (id: number, status: ContratoStatus) => {
    const next = NEXT_STATUS[status];
    if (!next) return;
    setContratos(prev => prev.map(c => c.id === id ? { ...c, status: next, data: c.data === '—' ? new Date().toLocaleDateString('pt-BR') : c.data } : c));
  };

  const filtered = contratos.filter(c => {
    if (tab === 'a_gerar')               return c.status === 'a_gerar';
    if (tab === 'gerados')               return c.status === 'gerado' || c.status === 'impresso';
    if (tab === 'aguardando_assinatura') return c.status === 'aguardando_assinatura';
    if (tab === 'assinados')             return c.status === 'assinado';
    if (tab === 'vencidos')              return c.status === 'vencido';
    if (tab === 'cancelados')            return c.status === 'cancelado';
    return true;
  }).filter(c => !procFilter || c.contrato === procFilter)
    .filter(c => !stFilter   || c.status === stFilter)
    .filter(c => !search     ||
      c.paciente.toLowerCase().includes(search.toLowerCase()) ||
      c.contrato.toLowerCase().includes(search.toLowerCase()) ||
      c.venda.toLowerCase().includes(search.toLowerCase())
    );

  const kpis = [
    { label:'A gerar',                value:'6',  sub:'contratos pendentes',        icon:'ti-file-plus',    iconBg:'#EFF6FF', iconColor:'#2563EB' },
    { label:'Aguardando assinatura',  value:'9',  sub:'contratos aguardando',       icon:'ti-writing',      iconBg:'#FFFBEB', iconColor:'#D97706' },
    { label:'Assinados',              value:'32', sub:'contratos regularizados',    icon:'ti-circle-check', iconBg:'#DCFCE7', iconColor:'#16A34A' },
    { label:'Vencendo',               value:'4',  sub:'contratos próximos do fim',  icon:'ti-alert-triangle', iconBg:'#FFF7ED', iconColor:'#C2410C' },
  ];

  const TABS = [
    { key:'todos',                label:'Todos' },
    { key:'a_gerar',              label:'A gerar' },
    { key:'gerados',              label:'Gerados' },
    { key:'aguardando_assinatura', label:'Aguardando assinatura' },
    { key:'assinados',            label:'Assinados' },
    { key:'vencidos',             label:'Vencidos' },
    { key:'cancelados',           label:'Cancelados' },
  ];

  const STATUS_OPTS: { value: ContratoStatus | ''; label: string }[] = [
    { value:'', label:'Todos status' },
    { value:'a_gerar',               label:'A gerar' },
    { value:'gerado',                label:'Gerado' },
    { value:'impresso',              label:'Impresso' },
    { value:'aguardando_assinatura', label:'Aguardando assinatura' },
    { value:'assinado',              label:'Assinado' },
    { value:'vencendo',              label:'Vencendo' },
    { value:'vencido',               label:'Vencido' },
    { value:'cancelado',             label:'Cancelado' },
  ];

  return (
    <>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      <div style={{ height:'100%', display:'flex', flexDirection:'column', overflow:'hidden', background:'#F8F9FA', fontFamily:"'Inter', system-ui, sans-serif" }}>

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div style={{ flexShrink:0, background:'#FFFFFF', borderBottom:'1px solid #E5E7EB', padding:'18px 28px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <h1 style={{ fontSize:20, fontWeight:700, color:'#191C1D', margin:0 }}>Contratos</h1>
            <p style={{ fontSize:12, color:'#71717A', margin:'2px 0 0' }}>Gere, imprima, acompanhe assinaturas e organize os contratos dos pacientes.</p>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button
              style={{ height:36, padding:'0 14px', border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:10, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#FFFFFF'; }}>
              <i className="ti ti-download" style={{ fontSize:14 }} /> Exportar
            </button>
            <button
              style={{ height:36, padding:'0 14px', border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:10, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#FFFFFF'; }}>
              <i className="ti ti-paperclip" style={{ fontSize:14 }} /> Anexar contrato assinado
            </button>
            <button
              style={{ height:36, padding:'0 16px', background:'#000000', border:'none', borderRadius:10, fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#18181B'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#000000'; }}>
              <i className="ti ti-file-plus" style={{ fontSize:14 }} /> Gerar contrato
            </button>
          </div>
        </div>

        {/* ── Scrollable body ───────────────────────────────────────────────── */}
        <div style={{ flex:1, minHeight:0, overflowY:'auto' }}>
          <div style={{ padding:'20px 28px 0' }}>

            {/* KPI Cards */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
              {kpis.map(k => (
                <div key={k.label}
                  style={{ background:'#FFFFFF', borderRadius:14, border:'1px solid #E5E7EB', padding:'16px 20px', display:'flex', alignItems:'center', gap:14, boxShadow:'0 1px 3px rgba(0,0,0,.04)', cursor:'pointer' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,.08)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,.04)'; }}>
                  <div style={{ width:44, height:44, borderRadius:12, background:k.iconBg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <i className={`ti ${k.icon}`} style={{ fontSize:20, color:k.iconColor }} />
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:'#9CA3AF', fontWeight:500, marginBottom:2, textTransform:'uppercase', letterSpacing:'.04em' }}>{k.label}</div>
                    <div style={{ fontSize:22, fontWeight:700, color:'#191C1D', lineHeight:1.1 }}>{k.value}</div>
                    <div style={{ fontSize:11, color:'#71717A', marginTop:2 }}>{k.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Tabs + filters */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:14, flexWrap:'wrap' }}>
              <div style={{ display:'flex', background:'#F4F4F5', borderRadius:10, padding:3 }}>
                {TABS.map(t => {
                  const active = tab === t.key;
                  return (
                    <button key={t.key} onClick={() => setTab(t.key)}
                      style={{ height:30, padding:'0 12px', borderRadius:8, border:'none', fontSize:12, fontWeight: active?600:400, color: active?'#191C1D':'#71717A', background: active?'#FFFFFF':'transparent', cursor:'pointer', fontFamily:'inherit', boxShadow: active?'0 1px 3px rgba(0,0,0,.08)':'none', whiteSpace:'nowrap' }}>
                      {t.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <select value={procFilter} onChange={e => setProcFilter(e.target.value)}
                  style={{ height:34, padding:'0 12px', border:'1px solid #E4E4E7', borderRadius:9, fontSize:12, color: procFilter?'#191C1D':'#9CA3AF', background:'#FFFFFF', cursor:'pointer' }}>
                  <option value="">Procedimento / Plano</option>
                  {PROCEDIMENTOS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select value={stFilter} onChange={e => setStFilter(e.target.value as ContratoStatus | '')}
                  style={{ height:34, padding:'0 12px', border:'1px solid #E4E4E7', borderRadius:9, fontSize:12, color: stFilter?'#191C1D':'#9CA3AF', background:'#FFFFFF', cursor:'pointer' }}>
                  {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <div style={{ display:'flex', alignItems:'center', gap:6, height:34, padding:'0 10px', border:'1px solid #E4E4E7', borderRadius:9, background:'#FFFFFF', width:230 }}>
                  <i className="ti ti-search" style={{ fontSize:13, color:'#9CA3AF' }} />
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar paciente ou contrato..."
                    style={{ border:'none', background:'transparent', fontSize:12, outline:'none', width:'100%', fontFamily:'inherit', color:'#191C1D' }} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Table ────────────────────────────────────────────────────────── */}
          <div style={{ padding:'0 28px 28px' }}>
            <div style={{ background:'#FFFFFF', borderRadius:14, border:'1px solid #E5E7EB', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,.04)' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'#F9FAFB', borderBottom:'1px solid #E5E7EB' }}>
                    {['Paciente','Contrato','Venda vinculada','Valor','Status','Data','Validade','Local físico','Ações'].map((h, i) => (
                      <th key={h} style={{ padding:'10px 16px', textAlign: i===3?'right':i===8?'right':'left', fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'.05em', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ padding:'56px 16px', textAlign:'center' }}>
                        <i className="ti ti-file-off" style={{ fontSize:36, color:'#D1D5DB', display:'block', marginBottom:10 }} />
                        <div style={{ fontSize:14, fontWeight:600, color:'#6B7280', marginBottom:4 }}>Nenhum contrato encontrado</div>
                        <div style={{ fontSize:12, color:'#9CA3AF' }}>Ajuste os filtros ou a busca</div>
                      </td>
                    </tr>
                  ) : filtered.map(c => {
                    const st = STATUS_CFG[c.status];
                    const vencendo = c.status === 'vencendo' || c.status === 'vencido';
                    return (
                      <tr key={c.id} style={{ borderBottom:'1px solid #F1F5F9' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                        {/* Paciente */}
                        <td style={{ padding:'13px 16px' }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'#191C1D' }}>{c.paciente}</div>
                        </td>

                        {/* Contrato */}
                        <td style={{ padding:'13px 16px', fontSize:12, color:'#71717A', maxWidth:180 }}>
                          <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.contrato}</div>
                        </td>

                        {/* Venda */}
                        <td style={{ padding:'13px 16px' }}>
                          <span style={{ fontSize:12, color:'#2563EB', fontWeight:500, cursor:'pointer', textDecoration:'none' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'none'; }}>
                            {c.venda}
                          </span>
                        </td>

                        {/* Valor */}
                        <td style={{ padding:'13px 16px', textAlign:'right', fontSize:13, fontWeight:700, color:'#191C1D', whiteSpace:'nowrap' }}>
                          {fmt(c.valor)}
                        </td>

                        {/* Status */}
                        <td style={{ padding:'13px 16px' }}>
                          <span style={{ fontSize:11, fontWeight:600, padding:'2px 9px', borderRadius:99, background:st.bg, color:st.color, whiteSpace:'nowrap' }}>
                            {st.label}
                          </span>
                        </td>

                        {/* Data */}
                        <td style={{ padding:'13px 16px', fontSize:12, color: c.data === '—' ? '#D1D5DB' : '#374151', whiteSpace:'nowrap' }}>
                          {c.data}
                        </td>

                        {/* Validade */}
                        <td style={{ padding:'13px 16px', fontSize:12, whiteSpace:'nowrap', color: vencendo ? '#DC2626' : c.validade === '—' ? '#D1D5DB' : '#374151', fontWeight: vencendo ? 600 : 400 }}>
                          {vencendo && c.validade !== '—' && <i className="ti ti-alert-triangle" style={{ fontSize:11, marginRight:4, verticalAlign:'middle' }} />}
                          {c.validade}
                        </td>

                        {/* Local físico */}
                        <td style={{ padding:'13px 16px' }}>
                          {c.local !== '—' ? (
                            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                              <i className="ti ti-folder" style={{ fontSize:12, color:'#D97706', flexShrink:0 }} />
                              <span style={{ fontSize:12, color:'#374151' }}>{c.local}</span>
                            </div>
                          ) : (
                            <span style={{ fontSize:12, color:'#D1D5DB' }}>—</span>
                          )}
                        </td>

                        {/* Ações */}
                        <td style={{ padding:'13px 16px' }}>
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:6 }}>
                            <ActionBtn status={c.status} onAction={() => handleAction(c.id, c.status)} />
                            <button onClick={e => handleCtx(e, c.id)}
                              style={{ width:28, height:28, border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:7, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#71717A' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#FFFFFF'; }}>
                              <i className="ti ti-dots-vertical" style={{ fontSize:14 }} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Footer */}
              <div style={{ padding:'11px 20px', borderTop:'1px solid #F1F5F9', background:'#FAFAFA', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ fontSize:12, color:'#71717A' }}>
                  Mostrando <b style={{color:'#191C1D'}}>{filtered.length}</b> de <b style={{color:'#191C1D'}}>{contratos.length}</b> contratos
                </div>
                <div style={{ fontSize:12, color:'#71717A' }}>Página 1 de 1</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {ctxMenu && <ContextMenu pos={ctxMenu} onClose={() => setCtxMenu(null)} onNi={ni} />}
    </>
  );
}
