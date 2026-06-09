import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// ─── Types & Data ─────────────────────────────────────────────────────────────
type ContaType   = 'receber' | 'pagar';
type ContaStatus = 'a_vencer' | 'vence_hoje' | 'vencido' | 'pago' | 'recebido' | 'cancelado';

interface Conta {
  id: number; vencimento: string; tipo: ContaType;
  pessoa: string; phone: string;
  descricao: string; referencia: string;
  valor: number; status: ContaStatus;
}

const CONTAS: Conta[] = [
  { id:1, vencimento:'26/05/2026', tipo:'receber', pessoa:'Carla Lima',        phone:'(43) 99988-1122', descricao:'Parcela 2/4 — Protocolo JR',        referencia:'Venda #1245',  valor:1500, status:'vence_hoje' },
  { id:2, vencimento:'26/05/2026', tipo:'pagar',   pessoa:'Laboratório X',     phone:'(43) 3333-4444',  descricao:'Exames laboratoriais',               referencia:'NF 4589',      valor:650,  status:'vence_hoje' },
  { id:3, vencimento:'27/05/2026', tipo:'receber', pessoa:'Fernanda Costa',    phone:'(43) 99821-3344', descricao:'Consulta médica',                    referencia:'Venda #1247',  valor:800,  status:'a_vencer' },
  { id:4, vencimento:'28/05/2026', tipo:'pagar',   pessoa:'Aluguel Clínica',   phone:'(43) 3333-0000',  descricao:'Aluguel mensal',                     referencia:'Recibo #156',  valor:4500, status:'a_vencer' },
  { id:5, vencimento:'30/05/2026', tipo:'receber', pessoa:'Ana Paula Santos',  phone:'(43) 99876-5432', descricao:'Consulta retorno',                   referencia:'Venda #1250',  valor:500,  status:'vencido' },
  { id:6, vencimento:'31/05/2026', tipo:'pagar',   pessoa:'Fornecedor Y',      phone:'(43) 3222-7777',  descricao:'Materiais de escritório',            referencia:'NF 7890',      valor:230,  status:'vencido' },
  { id:7, vencimento:'02/06/2026', tipo:'receber', pessoa:'Renato Mendes',     phone:'(43) 99856-6677', descricao:'Parcela 3/6 — Emagrecimento',        referencia:'Venda #1238',  valor:1200, status:'a_vencer' },
  { id:8, vencimento:'03/06/2026', tipo:'pagar',   pessoa:'Marketing Digital', phone:'(43) 5555-8888',  descricao:'Gestão de redes sociais',            referencia:'Fatura #321',  valor:1800, status:'a_vencer' },
  { id:9, vencimento:'05/06/2026', tipo:'pagar',   pessoa:'Sistema SaaS',      phone:'(43) 1111-2222',  descricao:'Assinatura mensal',                  referencia:'Fatura #654',  valor:299,  status:'a_vencer' },
];

const STATUS_CFG: Record<ContaStatus, { bg:string; color:string; label:string }> = {
  a_vencer:   { bg:'#EFF6FF', color:'#2563EB', label:'A vencer' },
  vence_hoje: { bg:'#FFF7ED', color:'#C2410C', label:'Vence hoje' },
  vencido:    { bg:'#FEF2F2', color:'#DC2626', label:'Vencido' },
  pago:       { bg:'#DCFCE7', color:'#16A34A', label:'Pago' },
  recebido:   { bg:'#DCFCE7', color:'#16A34A', label:'Recebido' },
  cancelado:  { bg:'#F4F4F5', color:'#71717A', label:'Cancelado' },
};

const fmt = (v: number) => v.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });

function FinancialNav() {
  const navigate     = useNavigate();
  const { pathname } = useLocation();
  const items = [
    { label:'Vendas / Orçamentos', icon:'ti-receipt',     path:'/financial' },
    { label:'Contas',              icon:'ti-credit-card', path:'/financial/contas' },
    { label:'Relatórios',          icon:'ti-chart-bar',   path:'/financial/relatorios' },
  ];
  return (
    <div style={{ width:220, flexShrink:0, background:'#FFFFFF', borderRight:'1px solid #E5E7EB', padding:'12px 8px', display:'flex', flexDirection:'column', gap:1 }}>
      <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.07em', padding:'4px 10px 8px' }}>Financeiro</div>
      {items.map(item => {
        const isActive = item.path === '/financial' ? pathname === '/financial' : pathname.startsWith(item.path);
        return (
          <button key={item.path} onClick={() => navigate(item.path)}
            style={{ display:'flex', alignItems:'center', gap:9, padding:'8px 10px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:'inherit', textAlign:'left', width:'100%', background: isActive ? '#EFF6FF' : 'transparent' }}
            onMouseEnter={e => { if(!isActive)(e.currentTarget as HTMLElement).style.background='#F4F4F5'; }}
            onMouseLeave={e => { if(!isActive)(e.currentTarget as HTMLElement).style.background='transparent'; }}>
            <i className={`ti ${item.icon}`} style={{ fontSize:15, color: isActive ? '#2563EB' : '#71717A' }} />
            <span style={{ fontSize:13, fontWeight: isActive ? 600 : 400, color: isActive ? '#191C1D' : '#374151' }}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function PagarReceberModal({ conta, onClose }: { conta: Conta; onClose: () => void }) {
  const isPagar     = conta.tipo === 'pagar';
  const accentColor = isPagar ? '#DC2626' : '#16A34A';
  const accentBg    = isPagar ? '#FEF2F2' : '#DCFCE7';
  const inp: React.CSSProperties = { width:'100%', height:38, padding:'0 12px', border:'1px solid #E4E4E7', borderRadius:9, fontSize:13, color:'#191C1D', background:'#FFFFFF', outline:'none', boxSizing:'border-box', fontFamily:'inherit' };
  const lbl: React.CSSProperties = { display:'block', fontSize:12, fontWeight:500, color:'#71717A', marginBottom:5 };
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.35)', zIndex:200, backdropFilter:'blur(2px)' }} />
      <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:460, background:'#FFFFFF', borderRadius:16, zIndex:201, boxShadow:'0 20px 60px rgba(0,0,0,.15)', display:'flex', flexDirection:'column', fontFamily:"'Inter',system-ui,sans-serif", animation:'fadeUp .2s ease' }}>
        <div style={{ padding:'18px 22px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:'#191C1D' }}>{isPagar ? 'Registrar pagamento' : 'Registrar recebimento'}</div>
            <div style={{ fontSize:12, color:'#71717A', marginTop:2 }}>{conta.pessoa} — {conta.descricao}</div>
          </div>
          <button onClick={onClose} style={{ width:28, height:28, border:'none', background:'#F4F4F5', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#71717A' }}>
            <i className="ti ti-x" style={{ fontSize:13 }} />
          </button>
        </div>
        <div style={{ padding:'18px 22px', display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ background:accentBg, borderRadius:10, padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontSize:12, color:'#374151' }}>{conta.descricao} · {conta.referencia}</div>
            <div style={{ fontSize:20, fontWeight:700, color:accentColor }}>{fmt(conta.valor)}</div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={lbl}>Valor {isPagar ? 'pago' : 'recebido'} <span style={{color:'#DC2626'}}>*</span></label>
              <input defaultValue={conta.valor.toFixed(2).replace('.',',')} style={inp} />
            </div>
            <div>
              <label style={lbl}>Forma de pagamento <span style={{color:'#DC2626'}}>*</span></label>
              <select style={{ ...inp, height:38, cursor:'pointer' }}>
                <option value="">Selecionar</option>
                <option>Dinheiro</option><option>Cartão de débito</option><option>Cartão de crédito</option><option>PIX</option><option>Transferência</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Data {isPagar ? 'do pagamento' : 'do recebimento'}</label>
              <input type="date" defaultValue="2026-05-26" style={inp} />
            </div>
            <div>
              <label style={lbl}>Observação</label>
              <input placeholder="Opcional..." style={inp} />
            </div>
            <div style={{ gridColumn:'1/-1', display:'flex', gap:16 }}>
              {!isPagar && (
                <label style={{ display:'flex', alignItems:'center', gap:7, cursor:'pointer', fontSize:12, color:'#374151' }}>
                  <input type="checkbox" style={{ width:14, height:14 }} /> Gerar recibo
                </label>
              )}
              <label style={{ display:'flex', alignItems:'center', gap:7, cursor:'pointer', fontSize:12, color:'#374151' }}>
                <input type="checkbox" style={{ width:14, height:14 }} /> {isPagar ? 'Anexar comprovante' : 'Enviar recibo por WhatsApp'}
              </label>
            </div>
          </div>
        </div>
        <div style={{ padding:'14px 22px', borderTop:'1px solid #F1F5F9', display:'flex', gap:10, background:'#FAFAFA' }}>
          <button onClick={onClose} style={{ flex:1, height:40, border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:10, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
          <button style={{ flex:2, height:40, background:accentColor, border:'none', borderRadius:10, fontSize:13, fontWeight:600, color:'#FFFFFF', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
            <i className={`ti ${isPagar ? 'ti-check' : 'ti-circle-check'}`} style={{ fontSize:14 }} />
            {isPagar ? 'Registrar pagamento' : 'Registrar recebimento'}
          </button>
        </div>
      </div>
    </>
  );
}

const TABS = [
  { key:'todas',      label:'Todas' },
  { key:'receber',    label:'A receber' },
  { key:'pagar',      label:'A pagar' },
  { key:'vencidas',   label:'Vencidas' },
  { key:'vence_hoje', label:'Vencem hoje' },
  { key:'proximos',   label:'Próximos 7 dias' },
];

export function FinancialAccountsPage() {
  const [tab, setTab]         = useState('todas');
  const [search, setSearch]   = useState('');
  const [actionConta, setActionConta] = useState<Conta | null>(null);

  const filtered = CONTAS.filter(c => {
    if (tab === 'receber')    return c.tipo === 'receber';
    if (tab === 'pagar')      return c.tipo === 'pagar';
    if (tab === 'vencidas')   return c.status === 'vencido';
    if (tab === 'vence_hoje') return c.status === 'vence_hoje';
    if (tab === 'proximos')   return c.status === 'a_vencer' || c.status === 'vence_hoje';
    return true;
  }).filter(c => !search || c.pessoa.toLowerCase().includes(search.toLowerCase()) || c.descricao.toLowerCase().includes(search.toLowerCase()));

  const kpis = [
    { label:'A receber',      value:'R$ 28.130', sub:'Total a receber',  icon:'ti-circle-arrow-down', iconBg:'#DCFCE7', iconColor:'#16A34A' },
    { label:'Vencendo hoje',  value:'R$ 3.850',  sub:'5 contas',         icon:'ti-alarm',             iconBg:'#FFF7ED', iconColor:'#C2410C' },
    { label:'A pagar',        value:'R$ 14.680', sub:'Total a pagar',    icon:'ti-circle-arrow-up',   iconBg:'#FEF2F2', iconColor:'#DC2626' },
    { label:'Vencidas',       value:'R$ 6.190',  sub:'7 contas',         icon:'ti-alert-triangle',    iconBg:'#FEF9C3', iconColor:'#A16207' },
  ];

  const getAction      = (c: Conta) => c.tipo === 'receber' ? (c.status === 'vencido' ? 'Cobrar' : 'Receber') : 'Pagar';
  const getActionColor = (c: Conta) => c.status === 'vencido' && c.tipo === 'receber' ? '#DC2626' : c.tipo === 'receber' ? '#16A34A' : '#2563EB';

  return (
    <>
      <style>{`@keyframes fadeUp { from { opacity:0;transform:translateY(8px); } to { opacity:1;transform:translateY(0); } }`}</style>

      <div style={{ height:'100%', display:'flex', flexDirection:'column', overflow:'hidden', background:'#F8F9FA', fontFamily:"'Inter', system-ui, sans-serif" }}>

        <div style={{ flexShrink:0, background:'#FFFFFF', borderBottom:'1px solid #E5E7EB', padding:'18px 28px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <h1 style={{ fontSize:20, fontWeight:700, color:'#191C1D', margin:0 }}>Contas</h1>
            <p style={{ fontSize:12, color:'#71717A', margin:'2px 0 0' }}>Controle valores a pagar, a receber, vencimentos e pendências financeiras.</p>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setActionConta(CONTAS.find(c=>c.tipo==='pagar')!)} style={{ height:36, padding:'0 14px', border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:10, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}>
              <i className="ti ti-cash" style={{ fontSize:14 }} /> Registrar pagamento
            </button>
            <button onClick={() => setActionConta(CONTAS.find(c=>c.tipo==='receber')!)} style={{ height:36, padding:'0 14px', border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:10, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}>
              <i className="ti ti-circle-check" style={{ fontSize:14 }} /> Registrar recebimento
            </button>
            <button style={{ height:36, padding:'0 14px', border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:10, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}>
              <i className="ti ti-adjustments" style={{ fontSize:14 }} /> Filtros
            </button>
            <button style={{ height:36, padding:'0 16px', background:'#2563EB', border:'none', borderRadius:10, fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit', boxShadow:'0 2px 8px rgba(37,99,235,.28)' }}>
              <i className="ti ti-plus" style={{ fontSize:14 }} /> Nova conta
            </button>
          </div>
        </div>

        <div style={{ flex:1, minHeight:0, display:'flex', overflow:'hidden' }}>
          <FinancialNav />

          <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', overflow:'hidden' }}>

            <div style={{ flexShrink:0, padding:'20px 28px 0', display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
              {kpis.map(k => (
                <div key={k.label} style={{ background:'#FFFFFF', borderRadius:14, border:'1px solid #E5E7EB', padding:'16px 20px', display:'flex', alignItems:'center', gap:14, boxShadow:'0 1px 3px rgba(0,0,0,.04)' }}>
                  <div style={{ width:44, height:44, borderRadius:12, background:k.iconBg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <i className={`ti ${k.icon}`} style={{ fontSize:20, color:k.iconColor }} />
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:'#9CA3AF', fontWeight:500, marginBottom:2 }}>{k.label}</div>
                    <div style={{ fontSize:20, fontWeight:700, color:'#191C1D', lineHeight:1.1 }}>{k.value}</div>
                    <div style={{ fontSize:11, color:'#71717A', marginTop:2 }}>{k.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ flexShrink:0, padding:'16px 28px 0', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
              <div style={{ display:'flex', background:'#F4F4F5', borderRadius:10, padding:3, gap:0 }}>
                {TABS.map(t => {
                  const active = tab === t.key;
                  return (
                    <button key={t.key} onClick={() => setTab(t.key)} style={{ height:30, padding:'0 12px', borderRadius:8, border:'none', fontSize:12, fontWeight: active?600:400, color: active?'#191C1D':'#71717A', background: active?'#FFFFFF':'transparent', cursor:'pointer', fontFamily:'inherit', boxShadow: active?'0 1px 3px rgba(0,0,0,.08)':'none', whiteSpace:'nowrap', transition:'all .12s' }}>
                      {t.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, height:34, padding:'0 12px', border:'1px solid #E4E4E7', borderRadius:9, background:'#FFFFFF', fontSize:12, color:'#374151' }}>
                  <i className="ti ti-calendar" style={{ fontSize:13, color:'#9CA3AF' }} />
                  01/05/2026 — 26/05/2026
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6, height:34, padding:'0 10px', border:'1px solid #E4E4E7', borderRadius:9, background:'#FFFFFF', width:210 }}>
                  <i className="ti ti-search" style={{ fontSize:13, color:'#9CA3AF' }} />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar pessoa ou descrição..." style={{ border:'none', background:'transparent', fontSize:12, outline:'none', width:'100%', fontFamily:'inherit', color:'#191C1D' }} />
                </div>
              </div>
            </div>

            <div style={{ flex:1, overflowY:'auto', padding:'14px 28px 28px' }}>
              <div style={{ background:'#FFFFFF', borderRadius:14, border:'1px solid #E5E7EB', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,.04)' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr style={{ background:'#F9FAFB', borderBottom:'1px solid #E5E7EB' }}>
                      {['Vencimento','Tipo','Pessoa / Empresa','Descrição','Referência','Valor','Status','Ações'].map((h,i) => (
                        <th key={h} style={{ padding:'10px 14px', textAlign: i===5?'right':i===7?'center':'left', fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'.05em', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(c => {
                      const st = STATUS_CFG[c.status];
                      const isPagar = c.tipo === 'pagar';
                      return (
                        <tr key={c.id} style={{ borderBottom:'1px solid #F1F5F9' }}
                          onMouseEnter={e => (e.currentTarget.style.background='#F8F9FA')}
                          onMouseLeave={e => (e.currentTarget.style.background='transparent')}>
                          <td style={{ padding:'11px 14px', fontSize:12, color:'#71717A', whiteSpace:'nowrap' }}>{c.vencimento}</td>
                          <td style={{ padding:'11px 14px' }}>
                            <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:99, background: isPagar?'#FEE2E2':'#DCFCE7', color: isPagar?'#B91C1C':'#16A34A' }}>
                              {isPagar ? 'A pagar' : 'A receber'}
                            </span>
                          </td>
                          <td style={{ padding:'11px 14px' }}>
                            <div style={{ fontSize:13, fontWeight:500, color:'#191C1D' }}>{c.pessoa}</div>
                            <div style={{ fontSize:11, color:'#9CA3AF' }}>{c.phone}</div>
                          </td>
                          <td style={{ padding:'11px 14px', fontSize:13, color:'#374151', maxWidth:200 }}>{c.descricao}</td>
                          <td style={{ padding:'11px 14px', fontSize:12, color:'#9CA3AF', whiteSpace:'nowrap' }}>{c.referencia}</td>
                          <td style={{ padding:'11px 14px', textAlign:'right', fontSize:13, fontWeight:700, color: isPagar?'#DC2626':'#16A34A', whiteSpace:'nowrap' }}>
                            {isPagar?'-':'+'}{fmt(c.valor)}
                          </td>
                          <td style={{ padding:'11px 14px' }}>
                            <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:99, background:st.bg, color:st.color }}>{st.label}</span>
                          </td>
                          <td style={{ padding:'11px 14px' }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                              <button onClick={() => setActionConta(c)}
                                style={{ height:30, padding:'0 12px', background:getActionColor(c), border:'none', borderRadius:8, fontSize:12, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                                {getAction(c)}
                              </button>
                              <button style={{ width:28, height:28, border:'none', background:'transparent', borderRadius:6, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#9CA3AF' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background='#F4F4F5'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background='transparent'; }}>
                                <i className="ti ti-dots-vertical" style={{ fontSize:14 }} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div style={{ padding:'12px 20px', borderTop:'1px solid #F1F5F9', background:'#FAFAFA', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div style={{ fontSize:12, color:'#71717A' }}>Mostrando <b style={{color:'#191C1D'}}>{filtered.length}</b> de <b style={{color:'#191C1D'}}>{CONTAS.length}</b> contas</div>
                  <div style={{ fontSize:12, color:'#71717A' }}>Página 1 de 1</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {actionConta && <PagarReceberModal conta={actionConta} onClose={() => setActionConta(null)} />}
    </>
  );
}
