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

const INIT_CONTRATOS: Contrato[] = [];

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
  const base: React.CSSProperties = { height:30, padding:'0 13px', border:'none', borderRadius:99, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' };

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
  const [search,     setSearch]     = useState('');
  const [procFilter, setProcFilter] = useState('');
  const [stFilter,   setStFilter]   = useState<ContratoStatus | ''>('');
  const [ctxMenu,    setCtxMenu]    = useState<CtxPos | null>(null);
  const [contratos,  setContratos]  = useState<Contrato[]>(INIT_CONTRATOS);
  const procedimentos = [...new Set(contratos.map(c => c.contrato))];

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

  const filtered = contratos
    .filter(c => !procFilter || c.contrato === procFilter)
    .filter(c => !stFilter   || c.status === stFilter)
    .filter(c => !search     ||
      c.paciente.toLowerCase().includes(search.toLowerCase()) ||
      c.contrato.toLowerCase().includes(search.toLowerCase()) ||
      c.venda.toLowerCase().includes(search.toLowerCase())
    );

  const kpis = [
    { label:'A gerar',               value: String(contratos.filter(c => c.status === 'a_gerar').length),               sub:'contratos pendentes',       icon:'ti-file-plus',      iconBg:'#EFF6FF', iconColor:'#2563EB' },
    { label:'Aguardando assinatura', value: String(contratos.filter(c => c.status === 'aguardando_assinatura').length),  sub:'contratos aguardando',      icon:'ti-writing',        iconBg:'#FFFBEB', iconColor:'#D97706' },
    { label:'Assinados',             value: String(contratos.filter(c => c.status === 'assinado').length),               sub:'contratos regularizados',   icon:'ti-circle-check',   iconBg:'#DCFCE7', iconColor:'#16A34A' },
    { label:'Vencendo',              value: String(contratos.filter(c => c.status === 'vencendo').length),               sub:'contratos próximos do fim', icon:'ti-alert-triangle', iconBg:'#FFF7ED', iconColor:'#C2410C' },
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

      <div style={{ height:'100%', display:'flex', flexDirection:'column', overflow:'hidden', background:'transparent', fontFamily:"'Inter', system-ui, sans-serif" }}>

        {/* ── Scrollable body ───────────────────────────────────────────────── */}
        <div style={{ flex:1, minHeight:0, overflowY:'auto' }}>
          <div style={{ padding:'16px 28px 0' }}>

            {/* KPI Cards */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
              {kpis.map(k => (
                <div key={k.label}
                  style={{ background:'#FFFFFF', borderRadius:20, border:'1px solid #EAECEF', padding:'18px 20px', display:'flex', alignItems:'center', gap:14, boxShadow:'0 2px 8px rgba(0,0,0,0.03)', cursor:'pointer' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,.08)'; (e.currentTarget as HTMLElement).style.borderColor = '#D4D4D8'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.03)'; (e.currentTarget as HTMLElement).style.borderColor = '#EAECEF'; }}>
                  <div style={{ width:46, height:46, borderRadius:14, background:k.iconBg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
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

            {/* Filters row — busca primeiro, botões na direita */}
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, flexWrap:'wrap' }}>
              <div style={{ display:'flex', alignItems:'center', gap:7, background:'#FFFFFF', border:'1px solid #E4E4E7', borderRadius:99, padding:'0 14px', height:38, width:280, boxShadow:'0 1px 4px rgba(0,0,0,0.04)', flexShrink:0 }}>
                <i className="ti ti-search" style={{ fontSize:14, color:'#A1A1AA' }} />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar paciente ou contrato..."
                  style={{ border:'none', background:'transparent', fontSize:13, outline:'none', width:'100%', fontFamily:'inherit', color:'#09090B' }} />
                {search && (
                  <button onClick={() => setSearch('')} style={{ border:'none', background:'rgba(0,0,0,0.06)', cursor:'pointer', padding:0, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', width:16, height:16, flexShrink:0 }}>
                    <i className="ti ti-x" style={{ fontSize:9, color:'#71717A' }} />
                  </button>
                )}
              </div>
              <select value={procFilter} onChange={e => setProcFilter(e.target.value)}
                style={{ height:36, padding:'0 12px', border:'1px solid #E4E4E7', borderRadius:99, fontSize:13, color: procFilter?'#09090B':'#A1A1AA', background:'#FFFFFF', cursor:'pointer', fontFamily:'inherit' }}>
                <option value="">Procedimento / Plano</option>
                {procedimentos.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={stFilter} onChange={e => setStFilter(e.target.value as ContratoStatus | '')}
                style={{ height:36, padding:'0 12px', border:'1px solid #E4E4E7', borderRadius:99, fontSize:13, color: stFilter?'#09090B':'#A1A1AA', background:'#FFFFFF', cursor:'pointer', fontFamily:'inherit' }}>
                {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {(search || procFilter || stFilter) && (
                <button onClick={() => { setSearch(''); setProcFilter(''); setStFilter(''); }}
                  style={{ height:36, padding:'0 12px', border:'none', background:'transparent', fontSize:12, color:'#71717A', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:4 }}>
                  <i className="ti ti-x" style={{ fontSize:12 }} /> Limpar
                </button>
              )}
              <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
                <button onClick={ni}
                  style={{ height:36, padding:'0 14px', border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:99, fontSize:13, fontWeight:500, color:'#18181B', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#FFFFFF'; }}>
                  <i className="ti ti-paperclip" style={{ fontSize:14 }} /> Anexar assinado
                </button>
                <button onClick={ni}
                  style={{ height:38, padding:'0 18px', background:'#000000', border:'none', borderRadius:99, fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', gap:7, fontFamily:'inherit', boxShadow:'0 2px 8px rgba(0,0,0,0.15)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#18181B'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#000000'; }}>
                  <i className="ti ti-file-plus" style={{ fontSize:15 }} /> Gerar contrato
                </button>
              </div>
            </div>
          </div>

          {/* ── Table ────────────────────────────────────────────────────────── */}
          <div style={{ padding:'0 28px 28px' }}>
            <div style={{ background:'#FFFFFF', borderRadius:20, border:'1px solid #EAECEF', overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.03)' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'rgba(248,249,250,0.7)', borderBottom:'1px solid #F1F3F5' }}>
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
                      <tr key={c.id} style={{ borderBottom:'1px solid #F1F3F5' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#F8F9FA')}
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
                              style={{ width:28, height:28, border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:99, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#71717A' }}
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
              <div style={{ padding:'14px 20px', borderTop:'1px solid #F1F3F5', background:'rgba(248,249,250,0.4)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
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
