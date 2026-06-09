import { useNavigate, useLocation } from 'react-router-dom';

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

export function FinancialDREPage() {
  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', overflow:'hidden', background:'#F8F9FA', fontFamily:"'Inter', system-ui, sans-serif" }}>
      <div style={{ flexShrink:0, background:'#FFFFFF', borderBottom:'1px solid #E5E7EB', padding:'18px 28px' }}>
        <h1 style={{ fontSize:20, fontWeight:700, color:'#191C1D', margin:0 }}>Relatórios</h1>
        <p style={{ fontSize:12, color:'#71717A', margin:'2px 0 0' }}>Relatórios financeiros, DRE e análises do período.</p>
      </div>
      <div style={{ flex:1, minHeight:0, display:'flex', overflow:'hidden' }}>
        <FinancialNav />
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12 }}>
          <i className="ti ti-chart-bar" style={{ fontSize:48, color:'#D1D5DB' }} />
          <div style={{ fontSize:15, fontWeight:600, color:'#6B7280' }}>Relatórios em breve</div>
          <div style={{ fontSize:13, color:'#9CA3AF' }}>Esta seção será desenvolvida em uma próxima etapa.</div>
        </div>
      </div>
    </div>
  );
}
