import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../../services/gerencialApi';

const STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  ATIVA:        { bg: 'rgba(22,163,74,.15)',  color: '#4ADE80', label: 'Ativa' },
  TESTE:        { bg: 'rgba(96,165,250,.15)', color: '#60A5FA', label: 'Teste' },
  IMPLANTACAO:  { bg: 'rgba(251,191,36,.15)', color: '#FCD34D', label: 'Implantação' },
  SUSPENSA:     { bg: 'rgba(251,146,60,.15)', color: '#FB923C', label: 'Suspensa' },
  BLOQUEADA:    { bg: 'rgba(239,68,68,.15)',  color: '#F87171', label: 'Bloqueada' },
  INADIMPLENTE: { bg: 'rgba(239,68,68,.15)',  color: '#F87171', label: 'Inadimplente' },
  CANCELADA:    { bg: 'rgba(82,82,91,.2)',    color: '#71717A', label: 'Cancelada' },
};

const ROLE_CFG: Record<string, { label: string; color: string }> = {
  SUPER_ADMIN:  { label: 'Super Admin',   color: '#818CF8' },
  ADMIN:        { label: 'Admin',         color: '#4ADE80' },
  PROFESSIONAL: { label: 'Profissional',  color: '#60A5FA' },
  RECEPTIONIST: { label: 'Recepcionista', color: '#A78BFA' },
};

const dark = { h1: '#F4F4F5', h2: '#E4E4E7', muted: '#71717A', border: 'rgba(255,255,255,.07)', surface: 'rgba(255,255,255,.04)' };

const TABS = ['Resumo','Usuários','Métricas','Assinatura','Logs'];

export function EmpresaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState('Resumo');
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);

  const { data: clinic, isLoading } = useQuery({
    queryKey: ['gerencial-clinic', id],
    queryFn: () => adminApi.getClinic(id!),
    enabled: !!id,
    onSuccess: (d: any) => { if (!editForm) setEditForm({ name: d.name, email: d.email, phone: d.phone, cnpj: d.cnpj, responsavel: d.responsavel, cidade: d.cidade, estado: d.estado, observacoes: d.observacoes }); },
  });

  const { data: users = [] } = useQuery({
    queryKey: ['gerencial-clinic-users', id],
    queryFn: () => adminApi.getClinicUsers(id!),
    enabled: !!id && tab === 'Usuários',
  });

  const { data: metrics } = useQuery({
    queryKey: ['gerencial-clinic-metrics', id],
    queryFn: () => adminApi.getClinicMetrics(id!),
    enabled: !!id && tab === 'Métricas',
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['gerencial-audit-logs', id],
    queryFn: () => adminApi.getAuditLogs(id!),
    enabled: !!id && tab === 'Logs',
  });

  const updateMut = useMutation({
    mutationFn: (data: any) => adminApi.updateClinic(id!, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gerencial-clinic', id] }); setEditMode(false); },
  });

  const statusMut = useMutation({
    mutationFn: (status: string) => adminApi.updateStatus(id!, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gerencial-clinic', id] }); qc.invalidateQueries({ queryKey: ['gerencial-clinics'] }); },
  });

  const impersonateMut = useMutation({
    mutationFn: () => adminApi.impersonate(id!),
    onSuccess: (data: any) => {
      localStorage.setItem('gerencial_token_backup', localStorage.getItem('gerencial_token') ?? '');
      localStorage.setItem('impersonate_session', JSON.stringify({ clinicId: data.clinicId, clinicName: data.clinicName }));
      localStorage.setItem('token', data.token);
      window.location.href = '/dashboard';
    },
  });

  const inp: React.CSSProperties = { width:'100%', height:36, padding:'0 10px', border:'1px solid #27272A', borderRadius:8, fontSize:13, color:'#E4E4E7', background:'#111118', boxSizing:'border-box', fontFamily:'inherit', outline:'none' };
  const lbl: React.CSSProperties = { fontSize:11, color:dark.muted, fontWeight:500, display:'block', marginBottom:3, textTransform:'uppercase', letterSpacing:'.04em' };

  if (isLoading) return (
    <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:24, height:24, border:'2px solid rgba(99,102,241,.2)', borderTopColor:'#818CF8', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  const c = clinic as any;
  if (!c) return <div style={{ padding:40, color:dark.muted }}>Empresa não encontrada.</div>;

  const st = STATUS_CFG[c.status] ?? STATUS_CFG['ATIVA'];

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ height:'100%', display:'flex', flexDirection:'column', overflow:'hidden', fontFamily:"'Inter', system-ui, sans-serif" }}>

        {/* Header */}
        <div style={{ flexShrink:0, padding:'18px 28px', borderBottom:`1px solid ${dark.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <button onClick={() => navigate('/gerencial/empresas')} style={{ width:32, height:32, border:`1px solid ${dark.border}`, background:'transparent', borderRadius:8, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:dark.muted, flexShrink:0 }}>
              <i className="ti ti-arrow-left" style={{ fontSize:14 }} />
            </button>
            <div style={{ width:42, height:42, borderRadius:12, background:'rgba(99,102,241,.15)', border:'1px solid rgba(99,102,241,.25)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <i className="ti ti-building" style={{ fontSize:20, color:'#818CF8' }} />
            </div>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <h1 style={{ fontSize:18, fontWeight:700, color:dark.h1, margin:0 }}>{c.name}</h1>
                <span style={{ fontSize:10, fontWeight:600, padding:'2px 9px', borderRadius:99, background:st.bg, color:st.color }}>{st.label}</span>
              </div>
              <div style={{ fontSize:11, color:dark.muted, marginTop:1 }}>{c.email ?? 'Sem e-mail cadastrado'}</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => impersonateMut.mutate()} disabled={impersonateMut.isPending}
              style={{ height:36, padding:'0 16px', background:'rgba(22,163,74,.15)', border:'1px solid rgba(22,163,74,.25)', borderRadius:9, fontSize:13, fontWeight:600, color:'#4ADE80', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}>
              <i className="ti ti-login" style={{ fontSize:14 }} /> {impersonateMut.isPending ? 'Acessando...' : 'Acessar sistema'}
            </button>
            {editMode ? (
              <>
                <button onClick={() => setEditMode(false)} style={{ height:36, padding:'0 14px', border:`1px solid ${dark.border}`, background:'transparent', borderRadius:9, fontSize:13, color:dark.muted, cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
                <button onClick={() => updateMut.mutate(editForm)} disabled={updateMut.isPending} style={{ height:36, padding:'0 14px', background:'linear-gradient(135deg, #6366F1, #818CF8)', border:'none', borderRadius:9, fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>
                  {updateMut.isPending ? 'Salvando...' : 'Salvar'}
                </button>
              </>
            ) : (
              <button onClick={() => { setEditForm({ name:c.name, email:c.email, phone:c.phone, cnpj:c.cnpj, responsavel:c.responsavel, cidade:c.cidade, estado:c.estado, observacoes:c.observacoes }); setEditMode(true); }} style={{ height:36, padding:'0 14px', border:`1px solid ${dark.border}`, background:'transparent', borderRadius:9, fontSize:13, color:dark.muted, cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}>
                <i className="ti ti-pencil" style={{ fontSize:13 }} /> Editar
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ flexShrink:0, display:'flex', padding:'0 28px', borderBottom:`1px solid ${dark.border}`, gap:2 }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding:'10px 14px', fontSize:13, fontWeight:500, color: tab===t ? '#818CF8' : dark.muted, background:'none', border:'none', borderBottom: tab===t ? '2px solid #6366F1' : '2px solid transparent', cursor:'pointer', marginBottom:-1, fontFamily:'inherit', whiteSpace:'nowrap' }}>
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:'22px 28px' }}>

          {/* ── Resumo ── */}
          {tab === 'Resumo' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>
              {/* Dados */}
              <div style={{ background:dark.surface, border:`1px solid ${dark.border}`, borderRadius:14, padding:'18px 20px' }}>
                <div style={{ fontSize:13, fontWeight:600, color:dark.h2, marginBottom:16, paddingBottom:12, borderBottom:`1px solid ${dark.border}` }}>Dados da empresa</div>
                {editMode ? (
                  <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                    {[['Nome','name'],['E-mail','email'],['Telefone','phone'],['CNPJ','cnpj'],['Responsável','responsavel'],['Cidade','cidade'],['Estado','estado']].map(([label, key]) => (
                      <div key={key}><label style={lbl}>{label}</label><input value={editForm?.[key] ?? ''} onChange={e => setEditForm((f: any) => ({ ...f, [key]: e.target.value }))} style={inp} /></div>
                    ))}
                    <div><label style={lbl}>Observações</label><textarea value={editForm?.observacoes ?? ''} onChange={e => setEditForm((f: any) => ({ ...f, observacoes: e.target.value }))} rows={3} style={{ ...inp, height:'auto', padding:'8px 10px', resize:'vertical' }} /></div>
                  </div>
                ) : (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 16px' }}>
                    {[
                      { label:'Nome',        value: c.name },
                      { label:'E-mail',      value: c.email ?? '—' },
                      { label:'Telefone',    value: c.phone ?? '—' },
                      { label:'CNPJ',        value: c.cnpj ?? '—' },
                      { label:'Responsável', value: c.responsavel ?? '—' },
                      { label:'Cidade/UF',   value: [c.cidade, c.estado].filter(Boolean).join(', ') || '—' },
                      { label:'Cadastro',    value: new Date(c.createdAt).toLocaleDateString('pt-BR') },
                      { label:'Slug',        value: c.slug },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div style={{ fontSize:10, color:'#52525B', fontWeight:600, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:2 }}>{label}</div>
                        <div style={{ fontSize:13, color:dark.h2, fontWeight:500, wordBreak:'break-all' }}>{value}</div>
                      </div>
                    ))}
                  </div>
                )}
                {c.observacoes && !editMode && (
                  <div style={{ marginTop:14, padding:'10px 12px', background:'rgba(255,255,255,.03)', borderRadius:8, border:`1px solid ${dark.border}` }}>
                    <div style={{ fontSize:10, color:'#52525B', fontWeight:600, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>Observações internas</div>
                    <div style={{ fontSize:12, color:dark.muted, lineHeight:1.6 }}>{c.observacoes}</div>
                  </div>
                )}
              </div>

              {/* Status + Ações rápidas */}
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                {/* Contagens */}
                <div style={{ background:dark.surface, border:`1px solid ${dark.border}`, borderRadius:14, padding:'18px 20px' }}>
                  <div style={{ fontSize:13, fontWeight:600, color:dark.h2, marginBottom:14, paddingBottom:10, borderBottom:`1px solid ${dark.border}` }}>Volumes de dados</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                    {[
                      { label:'Usuários',     value: c._count?.users,        icon:'ti-users',          color:'#818CF8' },
                      { label:'Pacientes',    value: c._count?.patients,     icon:'ti-heart-plus',     color:'#60A5FA' },
                      { label:'Sessões',      value: c._count?.sessions,     icon:'ti-activity',       color:'#4ADE80' },
                      { label:'Agendamentos', value: c._count?.appointments, icon:'ti-calendar',       color:'#FCD34D' },
                      { label:'Vendas',       value: c._count?.sales,        icon:'ti-cash',           color:'#34D399' },
                      { label:'Leads',        value: c._count?.leads,        icon:'ti-target',         color:'#FB923C' },
                    ].map(({ label, value, icon, color }) => (
                      <div key={label} style={{ textAlign:'center', padding:'12px 8px', borderRadius:10, background:'rgba(255,255,255,.03)', border:`1px solid ${dark.border}` }}>
                        <i className={`ti ${icon}`} style={{ fontSize:16, color, display:'block', marginBottom:5 }} />
                        <div style={{ fontSize:18, fontWeight:700, color:dark.h1, lineHeight:1.1 }}>{value ?? 0}</div>
                        <div style={{ fontSize:10, color:dark.muted, marginTop:2 }}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Status control */}
                <div style={{ background:dark.surface, border:`1px solid ${dark.border}`, borderRadius:14, padding:'16px 20px' }}>
                  <div style={{ fontSize:13, fontWeight:600, color:dark.h2, marginBottom:12 }}>Controle de status</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {[
                      { status:'ATIVA', label:'Reativar empresa', icon:'ti-player-play', color:'#4ADE80', bg:'rgba(22,163,74,.1)' },
                      { status:'SUSPENSA', label:'Suspender empresa', icon:'ti-player-pause', color:'#FB923C', bg:'rgba(251,146,60,.1)' },
                      { status:'BLOQUEADA', label:'Bloquear empresa', icon:'ti-ban', color:'#F87171', bg:'rgba(239,68,68,.1)' },
                      { status:'INADIMPLENTE', label:'Marcar inadimplente', icon:'ti-alert-triangle', color:'#F87171', bg:'rgba(239,68,68,.1)' },
                      { status:'CANCELADA', label:'Cancelar empresa', icon:'ti-x', color:'#71717A', bg:'rgba(82,82,91,.15)' },
                    ].filter(item => item.status !== c.status).map(item => (
                      <button key={item.status} onClick={() => statusMut.mutate(item.status)} disabled={statusMut.isPending}
                        style={{ height:34, padding:'0 14px', border:`1px solid ${item.bg}`, background:item.bg, borderRadius:8, fontSize:12, fontWeight:600, color:item.color, cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}>
                        <i className={`ti ${item.icon}`} style={{ fontSize:13 }} />{item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Usuários ── */}
          {tab === 'Usuários' && (
            <div style={{ background:dark.surface, border:`1px solid ${dark.border}`, borderRadius:14, overflow:'hidden' }}>
              <div style={{ padding:'14px 18px', borderBottom:`1px solid ${dark.border}` }}>
                <div style={{ fontSize:13, fontWeight:600, color:dark.h2 }}>Usuários da empresa</div>
              </div>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'rgba(255,255,255,.03)' }}>
                    {['Nome','E-mail','Perfil','Status','Último acesso','Criado em'].map(h => (
                      <th key={h} style={{ padding:'9px 16px', textAlign:'left', fontSize:10, fontWeight:600, color:dark.muted, textTransform:'uppercase', letterSpacing:'.05em', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(users as any[]).map(u => {
                    const rc = ROLE_CFG[u.role] ?? { label: u.role, color: dark.muted };
                    return (
                      <tr key={u.id} style={{ borderTop:`1px solid ${dark.border}` }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.03)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                        <td style={{ padding:'11px 16px', fontSize:13, fontWeight:600, color:dark.h2 }}>{u.name}</td>
                        <td style={{ padding:'11px 16px', fontSize:12, color:dark.muted }}>{u.email}</td>
                        <td style={{ padding:'11px 16px' }}>
                          <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:99, background:`${rc.color}20`, color:rc.color }}>{rc.label}</span>
                        </td>
                        <td style={{ padding:'11px 16px' }}>
                          <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:99, background: u.active ? 'rgba(22,163,74,.15)' : 'rgba(82,82,91,.2)', color: u.active ? '#4ADE80' : '#71717A' }}>{u.active ? 'Ativo' : 'Inativo'}</span>
                        </td>
                        <td style={{ padding:'11px 16px', fontSize:11, color:dark.muted, whiteSpace:'nowrap' }}>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('pt-BR') : '—'}</td>
                        <td style={{ padding:'11px 16px', fontSize:11, color:dark.muted, whiteSpace:'nowrap' }}>{new Date(u.createdAt).toLocaleDateString('pt-BR')}</td>
                      </tr>
                    );
                  })}
                  {(users as any[]).length === 0 && (
                    <tr><td colSpan={6} style={{ padding:'32px 0', textAlign:'center', fontSize:12, color:dark.muted }}>Nenhum usuário encontrado</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Métricas ── */}
          {tab === 'Métricas' && (
            <div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
                {metrics && [
                  { label:'Usuários ativos', value:(metrics as any).users, icon:'ti-users', color:'#818CF8', bg:'rgba(129,140,248,.15)' },
                  { label:'Pacientes', value:(metrics as any).patients, icon:'ti-heart-plus', color:'#60A5FA', bg:'rgba(96,165,250,.15)' },
                  { label:'Sessões', value:(metrics as any).sessions, icon:'ti-activity', color:'#4ADE80', bg:'rgba(22,163,74,.15)' },
                  { label:'Agendamentos', value:(metrics as any).appointments, icon:'ti-calendar', color:'#FCD34D', bg:'rgba(251,191,36,.15)' },
                  { label:'Vendas', value:(metrics as any).sales, icon:'ti-cash', color:'#34D399', bg:'rgba(52,211,153,.15)' },
                  { label:'Leads/CRM', value:(metrics as any).leads, icon:'ti-target', color:'#FB923C', bg:'rgba(251,146,60,.15)' },
                ].map(k => (
                  <div key={k.label} style={{ background:dark.surface, border:`1px solid ${dark.border}`, borderRadius:14, padding:'20px', display:'flex', alignItems:'center', gap:14 }}>
                    <div style={{ width:44, height:44, borderRadius:12, background:k.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <i className={`ti ${k.icon}`} style={{ fontSize:20, color:k.color }} />
                    </div>
                    <div>
                      <div style={{ fontSize:10, color:dark.muted, fontWeight:600, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:2 }}>{k.label}</div>
                      <div style={{ fontSize:24, fontWeight:700, color:dark.h1 }}>{k.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Assinatura ── */}
          {tab === 'Assinatura' && (
            <div style={{ background:dark.surface, border:`1px solid ${dark.border}`, borderRadius:14, padding:'24px', maxWidth:520 }}>
              <div style={{ fontSize:13, fontWeight:600, color:dark.h2, marginBottom:16 }}>Assinatura / Plano</div>
              {c.subscription ? (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {[
                    { label:'Status',     value: c.subscription.status },
                    { label:'Plano',      value: c.subscription.plan?.name ?? '—' },
                    { label:'Início',     value: new Date(c.subscription.startDate).toLocaleDateString('pt-BR') },
                    { label:'Vencimento', value: c.subscription.endDate ? new Date(c.subscription.endDate).toLocaleDateString('pt-BR') : '—' },
                    { label:'Valor',      value: c.subscription.price ? `R$ ${c.subscription.price.toFixed(2)}` : '—' },
                    { label:'Ciclo',      value: c.subscription.billingCycle === 'MONTHLY' ? 'Mensal' : 'Anual' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:`1px solid ${dark.border}` }}>
                      <div style={{ fontSize:12, color:dark.muted }}>{label}</div>
                      <div style={{ fontSize:13, fontWeight:500, color:dark.h2 }}>{value}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding:'32px 0', textAlign:'center' }}>
                  <i className="ti ti-package-off" style={{ fontSize:28, color:'#27272A', display:'block', marginBottom:10 }} />
                  <div style={{ fontSize:13, color:dark.muted }}>Nenhuma assinatura vinculada</div>
                </div>
              )}
            </div>
          )}

          {/* ── Logs ── */}
          {tab === 'Logs' && (
            <div style={{ background:dark.surface, border:`1px solid ${dark.border}`, borderRadius:14, overflow:'hidden' }}>
              <div style={{ padding:'14px 18px', borderBottom:`1px solid ${dark.border}` }}>
                <div style={{ fontSize:13, fontWeight:600, color:dark.h2 }}>Logs de auditoria</div>
              </div>
              <div style={{ display:'flex', flexDirection:'column' }}>
                {(logs as any[]).map(log => (
                  <div key={log.id} style={{ padding:'12px 18px', borderBottom:`1px solid ${dark.border}`, display:'flex', gap:12, alignItems:'flex-start' }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:'#818CF8', flexShrink:0, marginTop:5 }} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:dark.h2 }}>{log.action} · {log.entity}</div>
                      <div style={{ fontSize:11, color:dark.muted, marginTop:1 }}>{new Date(log.createdAt).toLocaleString('pt-BR')}</div>
                      {log.details && <div style={{ fontSize:11, color:'#52525B', marginTop:3, fontFamily:'monospace' }}>{JSON.stringify(log.details)}</div>}
                    </div>
                  </div>
                ))}
                {(logs as any[]).length === 0 && (
                  <div style={{ padding:'32px 0', textAlign:'center', fontSize:12, color:dark.muted }}>Nenhum log registrado</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
