import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../../services/gerencialApi';
import { Spinner } from '../../../components/ui/Loader';

const STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  ATIVA:        { bg: 'rgba(22,163,74,.15)',  color: '#4ADE80', label: 'Ativa' },
  TESTE:        { bg: 'rgba(96,165,250,.15)', color: '#60A5FA', label: 'Teste' },
  IMPLANTACAO:  { bg: 'rgba(251,191,36,.15)', color: '#FCD34D', label: 'Implantação' },
  SUSPENSA:     { bg: 'rgba(251,146,60,.15)', color: '#FB923C', label: 'Suspensa' },
  BLOQUEADA:    { bg: 'rgba(239,68,68,.15)',  color: '#F87171', label: 'Bloqueada' },
  INADIMPLENTE: { bg: 'rgba(239,68,68,.15)',  color: '#F87171', label: 'Inadimplente' },
  CANCELADA:    { bg: 'rgba(82,82,91,.2)',    color: '#71717A', label: 'Cancelada' },
};

const dark = { h1: '#F4F4F5', h2: '#E4E4E7', muted: '#71717A', border: 'rgba(255,255,255,.07)', surface: 'rgba(255,255,255,.04)' };

const STATUS_OPTIONS = ['ATIVA','TESTE','IMPLANTACAO','SUSPENSA','BLOQUEADA','INADIMPLENTE','CANCELADA'];

function NovaEmpresaPanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name:'', email:'', phone:'', cnpj:'', responsavel:'', cidade:'', estado:'', status:'TESTE', observacoes:'' });
  const [error, setError] = useState('');

  const inp: React.CSSProperties = { width:'100%', height:38, padding:'0 10px', border:'1px solid #27272A', borderRadius:8, fontSize:13, color:'#E4E4E7', background:'#111118', boxSizing:'border-box', fontFamily:'inherit', outline:'none' };
  const lbl: React.CSSProperties = { fontSize:12, fontWeight:500, color:'#71717A', display:'block', marginBottom:4 };

  const mut = useMutation({
    mutationFn: adminApi.createClinic,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gerencial-clinics'] }); qc.invalidateQueries({ queryKey: ['gerencial-dashboard'] }); onSaved(); onClose(); },
    onError: () => setError('Erro ao criar empresa. Verifique os dados.'),
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  function handleSave() {
    if (!form.name) { setError('Nome é obrigatório.'); return; }
    setError('');
    mut.mutate(form);
  }

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:9000, backdropFilter:'blur(4px)' }} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:500, background:'#111118', zIndex:9001, boxShadow:'-4px 0 40px rgba(0,0,0,.6)', display:'flex', flexDirection:'column', fontFamily:"'Inter', system-ui, sans-serif", borderLeft:'1px solid rgba(99,102,241,.2)', animation:'slideIn .22s cubic-bezier(0.32,0.72,0,1)', overflow:'hidden' }}>
        <style>{`@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
        <div style={{ flexShrink:0, padding:'20px 24px', borderBottom:'1px solid rgba(255,255,255,.07)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:'#E4E4E7' }}>Nova empresa</div>
            <div style={{ fontSize:11, color:'#71717A', marginTop:1 }}>Cadastrar nova empresa no SaaS</div>
          </div>
          <button onClick={onClose} style={{ width:28, height:28, border:'none', background:'rgba(255,255,255,.06)', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#71717A' }}>
            <i className="ti ti-x" style={{ fontSize:13 }} />
          </button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>
          <div><label style={lbl}>Nome da empresa <span style={{ color:'#F87171' }}>*</span></label><input value={form.name} onChange={set('name')} placeholder="Clínica Exemplo Ltda" style={inp} /></div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div><label style={lbl}>E-mail</label><input value={form.email} onChange={set('email')} placeholder="contato@empresa.com" type="email" style={inp} /></div>
            <div><label style={lbl}>Telefone</label><input value={form.phone} onChange={set('phone')} placeholder="(62) 9 9999-9999" style={inp} /></div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div><label style={lbl}>CNPJ</label><input value={form.cnpj} onChange={set('cnpj')} placeholder="00.000.000/0001-00" style={inp} /></div>
            <div><label style={lbl}>Status inicial</label>
              <select value={form.status} onChange={set('status')} style={{ ...inp, cursor:'pointer' }}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_CFG[s]?.label ?? s}</option>)}
              </select>
            </div>
          </div>
          <div><label style={lbl}>Responsável</label><input value={form.responsavel} onChange={set('responsavel')} placeholder="Nome do responsável" style={inp} /></div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div><label style={lbl}>Cidade</label><input value={form.cidade} onChange={set('cidade')} placeholder="Goiânia" style={inp} /></div>
            <div><label style={lbl}>Estado</label><input value={form.estado} onChange={set('estado')} placeholder="GO" style={inp} /></div>
          </div>
          <div><label style={lbl}>Observações internas</label>
            <textarea value={form.observacoes} onChange={set('observacoes')} rows={3} placeholder="Notas para o time interno..." style={{ ...inp, height:'auto', padding:'8px 10px', resize:'vertical' }} />
          </div>
          {error && <div style={{ padding:'10px 12px', background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.25)', borderRadius:8, fontSize:12, color:'#F87171' }}>{error}</div>}
        </div>

        <div style={{ flexShrink:0, padding:'14px 24px', borderTop:'1px solid rgba(255,255,255,.07)', display:'flex', gap:10, background:'rgba(255,255,255,.02)' }}>
          <button onClick={onClose} style={{ flex:1, height:40, border:'1px solid rgba(255,255,255,.1)', background:'transparent', borderRadius:8, fontSize:13, fontWeight:500, color:'#71717A', cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
          <button onClick={handleSave} disabled={mut.isPending} style={{ flex:2, height:40, background:mut.isPending ? '#3730A3' : 'linear-gradient(135deg, #6366F1, #818CF8)', border:'none', borderRadius:8, fontSize:13, fontWeight:600, color:'#FFFFFF', cursor:mut.isPending?'not-allowed':'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
            <i className="ti ti-building-plus" style={{ fontSize:14 }} />
            {mut.isPending ? 'Criando...' : 'Criar empresa'}
          </button>
        </div>
      </div>
    </>
  );
}

export function EmpresasPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search,    setSearch]    = useState('');
  const [stFilter,  setStFilter]  = useState('');
  const [showPanel, setShowPanel] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ id: string; name: string; action: string } | null>(null);

  const { data: clinics = [], isLoading } = useQuery({
    queryKey: ['gerencial-clinics', stFilter, search],
    queryFn: () => adminApi.listClinics({ ...(stFilter ? { status: stFilter } : {}), ...(search ? { search } : {}) }),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => adminApi.updateStatus(id, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gerencial-clinics'] }); qc.invalidateQueries({ queryKey: ['gerencial-dashboard'] }); setConfirmAction(null); },
  });

  const impersonateMut = useMutation({
    mutationFn: (id: string) => adminApi.impersonate(id),
    onSuccess: (data: any) => {
      localStorage.setItem('gerencial_token_backup', localStorage.getItem('gerencial_token') ?? '');
      localStorage.setItem('impersonate_session', JSON.stringify({ clinicId: data.clinicId, clinicName: data.clinicName }));
      localStorage.setItem('token', data.token);
      window.location.href = '/dashboard';
    },
  });

  const COLS = ['Empresa','Status','Usuários','Cidade','Cadastro','Ações'];

  return (
    <>
      {showPanel && <NovaEmpresaPanel onClose={() => setShowPanel(false)} onSaved={() => {}} />}

      {/* Confirm dialog */}
      {confirmAction && (
        <>
          <div onClick={() => setConfirmAction(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:9500, backdropFilter:'blur(4px)' }} />
          <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:9501, background:'#111118', border:'1px solid rgba(255,255,255,.1)', borderRadius:16, padding:28, width:380, fontFamily:"'Inter',system-ui,sans-serif" }}>
            <div style={{ fontSize:15, fontWeight:700, color:'#E4E4E7', marginBottom:8 }}>Confirmar ação</div>
            <div style={{ fontSize:13, color:'#71717A', marginBottom:20 }}>
              Tem certeza que deseja <strong style={{ color:'#E4E4E7' }}>{confirmAction.action}</strong> a empresa <strong style={{ color:'#E4E4E7' }}>{confirmAction.name}</strong>?
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setConfirmAction(null)} style={{ flex:1, height:38, border:'1px solid rgba(255,255,255,.1)', background:'transparent', borderRadius:8, fontSize:13, color:'#71717A', cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
              <button onClick={() => statusMut.mutate({ id: confirmAction.id, status: confirmAction.action === 'suspender' ? 'SUSPENSA' : confirmAction.action === 'bloquear' ? 'BLOQUEADA' : 'ATIVA' })} style={{ flex:1, height:38, background:'#DC2626', border:'none', borderRadius:8, fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>
                Confirmar
              </button>
            </div>
          </div>
        </>
      )}

      <div style={{ height:'100%', display:'flex', flexDirection:'column', overflow:'hidden', fontFamily:"'Inter', system-ui, sans-serif" }}>

        {/* Header */}
        <div style={{ flexShrink:0, padding:'22px 28px 18px', borderBottom:`1px solid ${dark.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <h1 style={{ fontSize:20, fontWeight:700, color:dark.h1, margin:0, letterSpacing:'-0.3px' }}>Empresas</h1>
            <p style={{ fontSize:12, color:dark.muted, margin:'3px 0 0' }}>{(clinics as any[]).length} empresa(s) no sistema</p>
          </div>
          <button onClick={() => setShowPanel(true)} style={{ height:38, padding:'0 16px', background:'linear-gradient(135deg, #6366F1, #818CF8)', border:'none', borderRadius:10, fontSize:13, fontWeight:600, color:'#FFFFFF', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit', boxShadow:'0 4px 12px rgba(99,102,241,.3)' }}>
            <i className="ti ti-building-plus" style={{ fontSize:14 }} /> Nova empresa
          </button>
        </div>

        {/* Filters */}
        <div style={{ flexShrink:0, padding:'14px 28px', borderBottom:`1px solid ${dark.border}`, display:'flex', gap:10, alignItems:'center' }}>
          <select value={stFilter} onChange={e => setStFilter(e.target.value)} style={{ height:34, padding:'0 12px', border:'1px solid #27272A', borderRadius:8, fontSize:12, color: stFilter ? '#E4E4E7' : '#52525B', background:'#111118', cursor:'pointer', fontFamily:'inherit' }}>
            <option value="">Todos os status</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_CFG[s]?.label}</option>)}
          </select>
          <div style={{ display:'flex', alignItems:'center', gap:6, height:34, padding:'0 12px', border:'1px solid #27272A', borderRadius:8, background:'#111118', flex:1, maxWidth:280 }}>
            <i className="ti ti-search" style={{ fontSize:13, color:'#52525B' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar empresa, responsável..." style={{ border:'none', background:'transparent', fontSize:12, outline:'none', width:'100%', fontFamily:'inherit', color:'#E4E4E7' }} />
          </div>
        </div>

        {/* Table */}
        <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:'0 28px 28px' }}>
          <div style={{ background:dark.surface, border:`1px solid ${dark.border}`, borderRadius:14, overflow:'hidden', marginTop:18, boxShadow:'0 4px 24px rgba(0,0,0,.2)' }}>
            {isLoading ? (
              <div style={{ padding:'48px 0', display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                <Spinner size={22} color="#818CF8" />
                <span style={{ fontSize:12, color:dark.muted }}>Carregando empresas...</span>
              </div>
            ) : (
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'rgba(255,255,255,.03)', borderBottom:`1px solid ${dark.border}` }}>
                    {COLS.map((h, i) => (
                      <th key={h} style={{ padding:'10px 16px', textAlign: i === 5 ? 'center' : 'left', fontSize:11, fontWeight:600, color:dark.muted, textTransform:'uppercase', letterSpacing:'.05em', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(clinics as any[]).map(c => {
                    const st = STATUS_CFG[c.status] ?? STATUS_CFG['ATIVA'];
                    return (
                      <tr key={c.id} style={{ borderBottom:`1px solid ${dark.border}`, cursor:'pointer' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.03)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                        <td style={{ padding:'12px 16px' }} onClick={() => navigate(`/gerencial/empresas/${c.id}`)}>
                          <div style={{ fontSize:13, fontWeight:600, color:dark.h2 }}>{c.name}</div>
                          {c.email && <div style={{ fontSize:11, color:dark.muted, marginTop:1 }}>{c.email}</div>}
                        </td>
                        <td style={{ padding:'12px 16px' }}>
                          <span style={{ fontSize:10, fontWeight:600, padding:'2px 9px', borderRadius:99, background:st.bg, color:st.color, whiteSpace:'nowrap' }}>{st.label}</span>
                        </td>
                        <td style={{ padding:'12px 16px', fontSize:12, color:dark.muted }}>{c._count?.users ?? 0} usuários</td>
                        <td style={{ padding:'12px 16px', fontSize:12, color:dark.muted, whiteSpace:'nowrap' }}>{[c.cidade, c.estado].filter(Boolean).join(', ') || '—'}</td>
                        <td style={{ padding:'12px 16px', fontSize:12, color:dark.muted, whiteSpace:'nowrap' }}>{new Date(c.createdAt).toLocaleDateString('pt-BR')}</td>
                        <td style={{ padding:'12px 16px' }}>
                          <div style={{ display:'flex', gap:6, justifyContent:'center', alignItems:'center' }}>
                            <button onClick={() => navigate(`/gerencial/empresas/${c.id}`)} title="Ver detalhes"
                              style={{ height:28, padding:'0 10px', border:'1px solid rgba(99,102,241,.3)', background:'rgba(99,102,241,.1)', borderRadius:7, fontSize:11, fontWeight:600, color:'#818CF8', cursor:'pointer', fontFamily:'inherit' }}>
                              <i className="ti ti-eye" style={{ fontSize:12 }} />
                            </button>
                            <button onClick={() => impersonateMut.mutate(c.id)} disabled={impersonateMut.isPending} title="Acessar sistema"
                              style={{ height:28, padding:'0 10px', border:'none', background:'rgba(22,163,74,.15)', borderRadius:7, fontSize:11, fontWeight:600, color:'#4ADE80', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:4 }}>
                              <i className="ti ti-login" style={{ fontSize:12 }} /> Acessar
                            </button>
                            {c.status === 'ATIVA' && (
                              <button onClick={() => setConfirmAction({ id: c.id, name: c.name, action: 'suspender' })} title="Suspender"
                                style={{ height:28, width:28, border:'none', background:'rgba(251,146,60,.1)', borderRadius:7, fontSize:11, color:'#FB923C', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                <i className="ti ti-player-pause" style={{ fontSize:13 }} />
                              </button>
                            )}
                            {(c.status === 'SUSPENSA' || c.status === 'BLOQUEADA') && (
                              <button onClick={() => statusMut.mutate({ id: c.id, status: 'ATIVA' })} title="Reativar"
                                style={{ height:28, width:28, border:'none', background:'rgba(22,163,74,.1)', borderRadius:7, fontSize:11, color:'#4ADE80', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                <i className="ti ti-player-play" style={{ fontSize:13 }} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {(clinics as any[]).length === 0 && !isLoading && (
                    <tr><td colSpan={6} style={{ padding:'48px 0', textAlign:'center' }}>
                      <i className="ti ti-building-off" style={{ fontSize:32, color:'#27272A', display:'block', marginBottom:10 }} />
                      <div style={{ fontSize:13, fontWeight:600, color:'#52525B', marginBottom:4 }}>Nenhuma empresa encontrada</div>
                      <div style={{ fontSize:12, color:'#3F3F46' }}>Crie a primeira empresa clicando em "Nova empresa"</div>
                    </td></tr>
                  )}
                </tbody>
              </table>
            )}
            <div style={{ padding:'10px 18px', borderTop:`1px solid ${dark.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontSize:11, color:dark.muted }}><b style={{ color:dark.h2 }}>{(clinics as any[]).length}</b> empresa(s)</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
