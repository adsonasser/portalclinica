import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { prontuarioApi, financialApi, usersApi, accessProfilesApi } from '../../services/api';
import { ProceduresPage } from './ProceduresPage';
import { useToast } from '../../components/ui/Toast';

// ─── Nav Items ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { key: 'overview',        label: 'Visão geral',              icon: 'ti-layout-grid' },
  { key: 'clinic',          label: 'Clínica',                  icon: 'ti-building' },
  { key: 'users',           label: 'Usuários e permissões',    icon: 'ti-users' },
  { key: 'agenda',          label: 'Agenda',                   icon: 'ti-calendar' },
  { key: 'contatos',        label: 'Contatos',                 icon: 'ti-heart-handshake' },
  { key: 'prontuario',      label: 'Prontuário',               icon: 'ti-clipboard-list' },
  { key: 'procedures',      label: 'Procedimentos e Serviços', icon: 'ti-clipboard-text' },
  { key: 'sessions',        label: 'Sessões',                  icon: 'ti-activity' },
  { key: 'financial',       label: 'Financeiro',               icon: 'ti-cash' },
  { key: 'personalization', label: 'Personalização',           icon: 'ti-palette' },
];

// ─── Module Status ────────────────────────────────────────────────────────────
type ModStatus = 'configurado' | 'parcial' | 'pendente' | 'nao_configurado';
type ModInfo = { key: string; label: string; icon: string; color: string; bg: string; status: ModStatus; detail: string; pending: string[]; lastUpdate: string };

const MODULE_STATUS: ModInfo[] = [
  { key: 'clinic',          label: 'Clínica',                  icon: 'ti-building-hospital', color: '#2563EB', bg: '#EFF6FF', status: 'configurado',     detail: 'Informações cadastrais configuradas',    pending: [],                                     lastUpdate: '05/06/2026' },
  { key: 'users',           label: 'Usuários e permissões',    icon: 'ti-users',             color: '#7C3AED', bg: '#F5F3FF', status: 'configurado',     detail: 'Usuários cadastrados',                  pending: [],                                     lastUpdate: '01/06/2026' },
  { key: 'agenda',          label: 'Agenda',                   icon: 'ti-calendar',          color: '#4F46E5', bg: '#EEF2FF', status: 'pendente',        detail: 'Configuração parcial',                  pending: ['Status da agenda', 'Feriados'],        lastUpdate: '—' },
  { key: 'contatos',        label: 'Contatos',                 icon: 'ti-heart-handshake',   color: '#16A34A', bg: '#DCFCE7', status: 'configurado',     detail: 'Tipos configurados',                    pending: [],                                     lastUpdate: '02/06/2026' },
  { key: 'prontuario',      label: 'Prontuário',               icon: 'ti-clipboard-list',    color: '#0D9488', bg: '#F0FDFA', status: 'parcial',         detail: 'Modelos de evolução criados',           pending: ['Receituário'],                         lastUpdate: '03/06/2026' },
  { key: 'procedures',      label: 'Procedimentos e Serviços', icon: 'ti-clipboard-text',    color: '#C2410C', bg: '#FFF7ED', status: 'pendente',        detail: '0 procedimentos cadastrados',           pending: ['Procedimentos', 'Categorias'],         lastUpdate: '—' },
  { key: 'sessions',        label: 'Sessões',                  icon: 'ti-activity',          color: '#0284C7', bg: '#F0F9FF', status: 'nao_configurado', detail: 'Módulo não configurado',                pending: [],                                     lastUpdate: '—' },
  { key: 'financial',       label: 'Financeiro',               icon: 'ti-cash',              color: '#A16207', bg: '#FEFCE8', status: 'parcial',         detail: 'Contas DRE configuradas',               pending: ['Formas de pagamento'],                 lastUpdate: '05/06/2026' },
  { key: 'personalization', label: 'Personalização',           icon: 'ti-palette',           color: '#BE185D', bg: '#FDF2F8', status: 'pendente',        detail: 'Configuração não iniciada',             pending: ['Logo', 'Cores'],                      lastUpdate: '—' },
];

const STATUS_CFG: Record<ModStatus, { bg: string; color: string; label: string; icon: string }> = {
  configurado:     { bg: '#DCFCE7', color: '#16A34A', label: 'Configurado',    icon: 'ti-circle-check' },
  parcial:         { bg: '#EFF6FF', color: '#2563EB', label: 'Parcial',         icon: 'ti-adjustments' },
  pendente:        { bg: '#FFFBEB', color: '#D97706', label: 'Pendente',        icon: 'ti-alert-triangle' },
  nao_configurado: { bg: '#F4F4F5', color: '#71717A', label: 'Não configurado', icon: 'ti-circle-dashed' },
};

// ─── Module Sub-items ─────────────────────────────────────────────────────────
const MODULE_DETAIL: Record<string, { icon: string; label: string; desc: string; subKey: string }[]> = {
  clinic: [
    { icon: 'ti-info-circle',  label: 'Informações cadastrais',     desc: 'Razão social, CNPJ, endereço e contato da clínica',   subKey: 'clinic-info' },
    { icon: 'ti-clock',        label: 'Horário de funcionamento',   desc: 'Dias da semana e horários de abertura e fechamento',  subKey: 'clinic-schedule' },
    { icon: 'ti-file-text',    label: 'Cabeçalho e rodapé',        desc: 'Texto padrão em documentos gerados pelo sistema',     subKey: 'clinic-header' },
    { icon: 'ti-door',         label: 'Salas',                     desc: 'Salas e locais de atendimento da clínica',            subKey: 'clinic-rooms' },
  ],
  users: [
    { icon: 'ti-users',        label: 'Usuários',                  desc: 'Cadastro e gerenciamento de usuários do sistema',     subKey: 'users-list' },
    { icon: 'ti-shield',       label: 'Perfis de acesso',          desc: 'Permissões e níveis de acesso por perfil',            subKey: 'users-profiles' },
  ],
  agenda: [
    { icon: 'ti-circle-dot',   label: 'Status da agenda',          desc: 'Configure e personalize os status de agendamentos',   subKey: 'agenda-status' },
    { icon: 'ti-calendar-event', label: 'Feriados nacionais',      desc: 'Calendário de feriados e pontos facultativos',        subKey: 'agenda-holidays' },
  ],
  contatos: [
    { icon: 'ti-tags',         label: 'Tipos de contatos',         desc: 'Categorias para classificar e organizar contatos',    subKey: 'contatos-types' },
  ],
  prontuario: [
    { icon: 'ti-file-text',    label: 'Modelos de evolução',       desc: 'Templates de evolução clínica para o prontuário',     subKey: 'modelos-documentos' },
    { icon: 'ti-pill',         label: 'Modelos de receituário',    desc: 'Templates para receitas e prescrições médicas',       subKey: 'modelos-receituario' },
    { icon: 'ti-list',         label: 'Tipos de registros',        desc: 'Categorias de registros do prontuário',               subKey: 'prontuario-types' },
  ],
  financial: [
    { icon: 'ti-building-bank', label: 'Contas financeiras / DRE', desc: 'Plano de contas para receitas e despesas no DRE',    subKey: 'dre-contas' },
    { icon: 'ti-credit-card',  label: 'Formas de pagamento',       desc: 'Dinheiro, cartão, PIX, convênio e outros',           subKey: 'payment-methods' },
    { icon: 'ti-receipt',      label: 'Modelos de recibo',         desc: 'Templates de recibo para transações financeiras',    subKey: 'receipt-models' },
  ],
};

// ─── Shared styles ────────────────────────────────────────────────────────────
const inpStyle: React.CSSProperties = { width: '100%', height: 36, padding: '0 10px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, color: '#09090B', background: '#FFFFFF', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' };
const lblStyle: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#71717A', display: 'block', marginBottom: 4 };

// ─── SubView wrapper ──────────────────────────────────────────────────────────
function SubView({ title, desc, icon, iconBg, iconColor, parentLabel, onBack, actions, children }: {
  title: string; desc: string; icon: string; iconBg: string; iconColor: string;
  parentLabel: string; onBack: () => void; actions?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div style={{ animation: 'fadeUp 0.2s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>
        <button onClick={onBack} style={{ fontSize: 13, color: '#71717A', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
          <i className="ti ti-chevron-left" style={{ fontSize: 13 }} /> {parentLabel}
        </button>
        <i className="ti ti-chevron-right" style={{ fontSize: 12, color: '#D1D5DB' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#191C1D' }}>{title}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className={`ti ${icon}`} style={{ fontSize: 20, color: iconColor }} />
          </div>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#191C1D', margin: 0 }}>{title}</h2>
            <p style={{ fontSize: 12, color: '#71717A', margin: '2px 0 0' }}>{desc}</p>
          </div>
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

function PlaceholderSubView({ onBack, parentLabel, title, mc }: { onBack: () => void; parentLabel: string; title: string; mc: ModInfo }) {
  return (
    <SubView title={title} desc="Em breve disponível para configuração" icon="ti-clock" iconBg="#FFFBEB" iconColor="#D97706" parentLabel={parentLabel} onBack={onBack}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 280 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: mc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <i className={`ti ${mc.icon}`} style={{ fontSize: 26, color: mc.color }} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#191C1D', marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 13, color: '#71717A', maxWidth: 340, textAlign: 'center', lineHeight: 1.6, marginBottom: 20 }}>Esta seção está sendo desenvolvida e estará disponível em breve.</div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 14px', borderRadius: 99, background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }}>Em breve</span>
      </div>
    </SubView>
  );
}

// ─── DRE Accounts ────────────────────────────────────────────────────────────
const DRE_LS_KEY = 'pcl_dre_accounts';
const DRE_DEFAULTS_SETTINGS = [
  { id: 'dre_1',  name: 'Consultas',               type: 'receita', category: 'operacional',    active: true },
  { id: 'dre_2',  name: 'Procedimentos estéticos', type: 'receita', category: 'operacional',    active: true },
  { id: 'dre_3',  name: 'Materiais vendidos',       type: 'receita', category: 'operacional',    active: true },
  { id: 'dre_4',  name: 'Planos e mensalidades',    type: 'receita', category: 'operacional',    active: true },
  { id: 'dre_5',  name: 'Outras receitas',          type: 'receita', category: 'outras',         active: true },
  { id: 'dre_6',  name: 'Aluguel',                  type: 'despesa', category: 'administrativo', active: true },
  { id: 'dre_7',  name: 'Material de consumo',      type: 'despesa', category: 'operacional',    active: true },
  { id: 'dre_8',  name: 'Folha de pagamento',       type: 'despesa', category: 'administrativo', active: true },
  { id: 'dre_9',  name: 'Equipamentos',             type: 'despesa', category: 'operacional',    active: true },
  { id: 'dre_10', name: 'Marketing e publicidade',  type: 'despesa', category: 'administrativo', active: true },
  { id: 'dre_11', name: 'Outras despesas',          type: 'despesa', category: 'outras',         active: true },
];
type DreAccount = { id: string; name: string; type: 'receita' | 'despesa'; category: string; active: boolean };
const DRE_CATEGORIES = ['operacional', 'administrativo', 'financeiro', 'outras'];

function loadDreAccounts(): DreAccount[] {
  try { const r = localStorage.getItem(DRE_LS_KEY); if (r) return JSON.parse(r); } catch {}
  return DRE_DEFAULTS_SETTINGS as DreAccount[];
}
function saveDreAccounts(data: DreAccount[]) {
  try { localStorage.setItem(DRE_LS_KEY, JSON.stringify(data)); } catch {}
}

function DreAccountsView({ onBack }: { onBack: () => void }) {
  const [accounts, setAccounts] = useState<DreAccount[]>(loadDreAccounts);
  const [editItem, setEditItem]  = useState<DreAccount | null>(null);
  const [showForm, setShowForm]  = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'receita' | 'despesa'>('all');
  const [fName, setFName] = useState('');
  const [fType, setFType] = useState<'receita' | 'despesa'>('receita');
  const [fCat,  setFCat]  = useState('operacional');
  const [fErr,  setFErr]  = useState('');

  function openNew()  { setEditItem(null); setFName(''); setFType('receita'); setFCat('operacional'); setFErr(''); setShowForm(true); }
  function openEdit(a: DreAccount) { setEditItem(a); setFName(a.name); setFType(a.type); setFCat(a.category); setFErr(''); setShowForm(true); }

  function handleSave() {
    if (!fName.trim()) { setFErr('Informe o nome da conta.'); return; }
    const updated = editItem
      ? accounts.map(a => a.id === editItem.id ? { ...a, name: fName.trim(), type: fType, category: fCat } : a)
      : [...accounts, { id: `dre_${Date.now()}`, name: fName.trim(), type: fType, category: fCat, active: true }];
    setAccounts(updated); saveDreAccounts(updated); setShowForm(false);
  }
  function handleDelete(id: string)  { const u = accounts.filter(a => a.id !== id);    setAccounts(u); saveDreAccounts(u); }
  function toggleActive(id: string)  { const u = accounts.map(a => a.id === id ? { ...a, active: !a.active } : a); setAccounts(u); saveDreAccounts(u); }

  const filtered = accounts.filter(a => filterType === 'all' || a.type === filterType);
  const mc = MODULE_STATUS.find(m => m.key === 'financial')!;

  return (
    <SubView title="Contas financeiras / DRE" desc="Plano de contas para classificar receitas e despesas no DRE." icon="ti-building-bank" iconBg="#FEFCE8" iconColor="#A16207" parentLabel="Financeiro" onBack={onBack}
      actions={<button onClick={openNew} style={{ height: 36, padding: '0 16px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}><i className="ti ti-plus" style={{ fontSize: 14 }} /> Nova conta</button>}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {(['all', 'receita', 'despesa'] as const).map(t => {
          const labels = { all: 'Todas', receita: 'Receitas', despesa: 'Despesas' };
          const colors = { all: '#71717A', receita: '#16A34A', despesa: '#DC2626' };
          const active = filterType === t;
          return (
            <button key={t} onClick={() => setFilterType(t)} style={{ height: 30, padding: '0 14px', border: `1px solid ${active ? colors[t] : '#E4E4E7'}`, borderRadius: 20, fontSize: 12, fontWeight: active ? 600 : 400, color: active ? colors[t] : '#71717A', background: active ? `${colors[t]}18` : '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
              {labels[t]}
            </button>
          );
        })}
      </div>
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F4F4F5', borderBottom: '1px solid #E4E4E7' }}>
              {['Conta DRE', 'Tipo', 'Categoria', 'Status', 'Ações'].map((h, i) => (
                <th key={h} style={{ padding: '9px 16px', textAlign: i === 4 ? 'right' : 'left', fontSize: 11, fontWeight: 600, color: '#71717A', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id} style={{ borderBottom: '1px solid #F4F4F5' }} onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '11px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: a.type === 'receita' ? '#DCFCE7' : '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <i className={`ti ${a.type === 'receita' ? 'ti-circle-arrow-down' : 'ti-circle-arrow-up'}`} style={{ fontSize: 14, color: a.type === 'receita' ? '#16A34A' : '#DC2626' }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 500, color: a.active ? '#09090B' : '#A1A1AA' }}>{a.name}</span>
                  </div>
                </td>
                <td style={{ padding: '11px 16px' }}><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: a.type === 'receita' ? '#DCFCE7' : '#FEF2F2', color: a.type === 'receita' ? '#16A34A' : '#DC2626' }}>{a.type === 'receita' ? 'Receita' : 'Despesa'}</span></td>
                <td style={{ padding: '11px 16px', fontSize: 12, color: '#71717A', textTransform: 'capitalize' }}>{a.category}</td>
                <td style={{ padding: '11px 16px' }}>
                  <button onClick={() => toggleActive(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: a.active ? '#DCFCE7' : '#F4F4F5', color: a.active ? '#16A34A' : '#71717A' }}>{a.active ? 'Ativo' : 'Inativo'}</span>
                  </button>
                </td>
                <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button onClick={() => openEdit(a)} style={{ width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => (e.currentTarget.style.background = '#F4F4F5')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}><i className="ti ti-pencil" style={{ fontSize: 13, color: '#71717A' }} /></button>
                    <button onClick={() => handleDelete(a.id)} style={{ width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => (e.currentTarget.style.background = '#FEF2F2')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}><i className="ti ti-trash" style={{ fontSize: 13, color: '#EF4444' }} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: '#A1A1AA' }}>Nenhuma conta encontrada.</td></tr>}
          </tbody>
        </table>
      </div>
      {showForm && (
        <>
          <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 9000, backdropFilter: 'blur(2px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 440, background: '#fff', borderRadius: 14, zIndex: 9001, boxShadow: '0 20px 60px rgba(0,0,0,.15)', fontFamily: "'Inter', system-ui, sans-serif" }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#09090B' }}>{editItem ? 'Editar conta' : 'Nova conta DRE'}</div>
              <button onClick={() => setShowForm(false)} style={{ width: 26, height: 26, border: 'none', background: '#F4F4F5', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="ti ti-x" style={{ fontSize: 12, color: '#71717A' }} /></button>
            </div>
            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={lblStyle}>Nome da conta <span style={{ color: '#DC2626' }}>*</span></label><input value={fName} onChange={e => setFName(e.target.value)} placeholder="Ex: Consultas, Aluguel..." style={inpStyle} /></div>
              <div>
                <label style={lblStyle}>Tipo <span style={{ color: '#DC2626' }}>*</span></label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {(['receita', 'despesa'] as const).map(t => { const sel = fType === t; const color = t === 'receita' ? '#16A34A' : '#DC2626'; return <button key={t} onClick={() => setFType(t)} style={{ height: 36, border: `2px solid ${sel ? color : '#E4E4E7'}`, borderRadius: 8, background: sel ? `${color}18` : '#fff', fontSize: 13, fontWeight: sel ? 600 : 400, color: sel ? color : '#71717A', cursor: 'pointer', fontFamily: 'inherit' }}>{t === 'receita' ? 'Receita' : 'Despesa'}</button>; })}
                </div>
              </div>
              <div><label style={lblStyle}>Categoria</label><select value={fCat} onChange={e => setFCat(e.target.value)} style={{ ...inpStyle, cursor: 'pointer' }}>{DRE_CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}</select></div>
              {fErr && <div style={{ fontSize: 12, color: '#DC2626', padding: '8px 10px', background: '#FEF2F2', borderRadius: 7 }}>{fErr}</div>}
            </div>
            <div style={{ padding: '12px 22px', borderTop: '1px solid #E4E4E7', display: 'flex', gap: 8, background: '#FAFAFA' }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, height: 38, border: '1px solid #E4E4E7', background: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={handleSave} style={{ flex: 2, height: 38, background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>{editItem ? 'Salvar alterações' : 'Criar conta'}</button>
            </div>
          </div>
        </>
      )}
    </SubView>
  );
}

// ─── Doc Templates (evolução + receituário) ────────────────────────────────────
const TEMPLATE_TYPES = ['Evolução', 'Anamnese', 'Prescrição', 'Receita', 'Atestado', 'Declaração', 'Orientações', 'Exames', 'Outros'];
const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  'Evolução':    { bg: '#F0FDFA', color: '#0D9488' }, 'Anamnese':    { bg: '#EFF6FF', color: '#2563EB' },
  'Prescrição':  { bg: '#F5F3FF', color: '#7C3AED' }, 'Receita':     { bg: '#ECFEFF', color: '#0E7490' },
  'Atestado':    { bg: '#F0FDF4', color: '#16A34A' }, 'Declaração':  { bg: '#F5F3FF', color: '#7C3AED' },
  'Orientações': { bg: '#FFFBEB', color: '#D97706' }, 'Exames':      { bg: '#ECFEFF', color: '#0E7490' },
  'Outros':      { bg: '#F4F4F5', color: '#71717A' },
};
const TEMPLATE_VARS = [
  '{{nome_paciente}}', '{{cpf_paciente}}', '{{data_nascimento}}', '{{idade_paciente}}',
  '{{telefone_paciente}}', '{{email_paciente}}', '{{data_atual}}',
  '{{nome_profissional}}', '{{crm_profissional}}', '{{nome_clinica}}',
  '{{procedimento}}', '{{observacoes}}',
];
function stripTags(html: string) { return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim(); }

function DocTemplatesView({ onBack, parentLabel, title, subtitle, mc, lockType }: {
  onBack: () => void; parentLabel: string; title: string; subtitle: string; mc: ModInfo; lockType?: string;
}) {
  const qc = useQueryClient();
  const [search,          setSearch]          = useState('');
  const [filterType,      setFilterType]      = useState(lockType || 'Todos');
  const [drawerOpen,      setDrawerOpen]      = useState(false);
  const [editingTpl,      setEditingTpl]      = useState<any>(null);
  const [form,            setForm]            = useState({ name: '', type: lockType || 'Evolução', description: '', active: true });
  const [deleteConfirm,   setDeleteConfirm]   = useState<string | null>(null);
  const [editorContent,   setEditorContent]   = useState('');
  const [drawerError,     setDrawerError]     = useState<string | null>(null);
  const [drawerSuccess,   setDrawerSuccess]   = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!drawerOpen) return;
    const initial = editingTpl?.content || '';
    setEditorContent(initial);
    if (editorRef.current) editorRef.current.innerHTML = initial;
  }, [drawerOpen]); // eslint-disable-line

  const { data: allTpls = [], isLoading } = useQuery({
    queryKey: ['doc-templates-all'],
    queryFn: () => prontuarioApi.listDocTemplates(false),
  });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['doc-templates-all'] }); qc.invalidateQueries({ queryKey: ['doc-templates'] }); };

  const createMut = useMutation({ mutationFn: (d: any) => prontuarioApi.createDocTemplate(d), onSuccess: () => { invalidate(); setDrawerSuccess(true); setTimeout(closeDrawer, 1200); }, onError: (e: any) => { const r = e?.response?.data?.message; setDrawerError(Array.isArray(r) ? r.join(' · ') : (r || e?.message || 'Erro ao criar modelo.')); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => prontuarioApi.updateDocTemplate(id, data), onSuccess: () => { invalidate(); setDrawerSuccess(true); setTimeout(closeDrawer, 1200); }, onError: (e: any) => { const r = e?.response?.data?.message; setDrawerError(Array.isArray(r) ? r.join(' · ') : (r || e?.message || 'Erro ao salvar.')); } });
  const deleteMut = useMutation({ mutationFn: (id: string) => prontuarioApi.deleteDocTemplate(id), onSuccess: () => { invalidate(); setDeleteConfirm(null); } });

  const openDrawer = (tpl?: any) => {
    setDrawerError(null); setDrawerSuccess(false);
    if (tpl) { setEditingTpl(tpl); setForm({ name: tpl.name, type: tpl.type, description: tpl.description || '', active: tpl.active }); setEditorContent(tpl.content || ''); }
    else      { setEditingTpl(null); setForm({ name: '', type: lockType || 'Evolução', description: '', active: true }); setEditorContent(''); }
    setDrawerOpen(true);
  };
  const closeDrawer = () => { setDrawerOpen(false); setEditingTpl(null); setForm({ name: '', type: lockType || 'Evolução', description: '', active: true }); setEditorContent(''); setDrawerError(null); setDrawerSuccess(false); };

  const handleSave = () => {
    setDrawerError(null);
    const rawHtml = editorContent || editorRef.current?.innerHTML || '';
    if (!form.name.trim()) { setDrawerError('O nome do modelo é obrigatório.'); return; }
    if (!stripTags(rawHtml)) { setDrawerError('O conteúdo do modelo é obrigatório.'); return; }
    const data = { name: form.name.trim(), type: form.type, description: form.description, content: rawHtml, active: form.active, showInProntuario: true, generatePdf: false, requiresSignature: false, behavior: 'prontuario' };
    if (editingTpl) updateMut.mutate({ id: editingTpl.id, data });
    else createMut.mutate(data);
  };
  const handleDuplicate    = (t: any) => { const { id, createdAt, updatedAt, clinicId, ...rest } = t; createMut.mutate({ ...rest, name: `${t.name} (cópia)` }); };
  const handleToggleActive = (t: any) => { updateMut.mutate({ id: t.id, data: { active: !t.active } }); };
  const execCmd            = (cmd: string) => { editorRef.current?.focus(); document.execCommand(cmd, false, undefined); };

  const filtered = (allTpls as any[]).filter(t =>
    (!lockType || t.type === lockType) &&
    (!search || t.name.toLowerCase().includes(search.toLowerCase())) &&
    (filterType === 'Todos' || t.type === filterType)
  );
  const isSaving = createMut.isPending || updateMut.isPending;
  const typeOptions = lockType ? [lockType] : TEMPLATE_TYPES;

  return (
    <SubView title={title} desc={subtitle} icon={lockType ? 'ti-pill' : 'ti-file-text'} iconBg={mc.bg} iconColor={mc.color} parentLabel={parentLabel} onBack={onBack}
      actions={<button onClick={() => openDrawer()} style={{ height: 36, padding: '0 16px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}><i className="ti ti-plus" style={{ fontSize: 14 }} /> Novo modelo</button>}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #E4E4E7', borderRadius: 8, padding: '0 12px', height: 36, flex: 1, maxWidth: 320 }}>
          <i className="ti ti-search" style={{ fontSize: 14, color: '#A1A1AA' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar modelos..." style={{ border: 'none', background: 'transparent', fontSize: 13, outline: 'none', width: '100%', color: '#09090B', fontFamily: 'inherit' }} />
        </div>
        {!lockType && (
          <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ height: 36, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, color: '#09090B', background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
            <option>Todos</option>
            {TEMPLATE_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        )}
      </div>
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E4E4E7', overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#71717A', fontSize: 13 }}>Carregando modelos...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '56px 40px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#09090B', marginBottom: 6 }}>Nenhum modelo encontrado</div>
            <div style={{ fontSize: 13, color: '#71717A', marginBottom: 20 }}>{search ? 'Ajuste os filtros ou' : 'Crie'} o primeiro modelo.</div>
            {!search && <button onClick={() => openDrawer()} style={{ height: 36, padding: '0 16px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Criar modelo</button>}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F4F4F5', borderBottom: '1px solid #E4E4E7' }}>
                {['NOME', 'TIPO', 'STATUS', 'AÇÕES'].map(h => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#71717A', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t: any) => {
                const tc = TYPE_COLORS[t.type] || TYPE_COLORS['Outros'];
                return (
                  <tr key={t.id} style={{ borderBottom: '1px solid #F4F4F5' }} onMouseEnter={e => (e.currentTarget.style.background = '#F9F9F9')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '13px 16px' }}><div style={{ fontSize: 13, fontWeight: 600, color: '#09090B' }}>{t.name}</div>{t.description && <div style={{ fontSize: 11, color: '#71717A', marginTop: 2 }}>{t.description}</div>}</td>
                    <td style={{ padding: '13px 16px' }}><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: tc.bg, color: tc.color }}>{t.type}</span></td>
                    <td style={{ padding: '13px 16px' }}><button onClick={() => handleToggleActive(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: t.active ? '#DCFCE7' : '#F4F4F5', color: t.active ? '#16A34A' : '#71717A' }}>{t.active ? 'Ativo' : 'Inativo'}</span></button></td>
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ display: 'flex', gap: 2 }}>
                        <button onClick={() => openDrawer(t)} title="Editar" style={{ width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A' }} onMouseEnter={e => (e.currentTarget.style.background = '#F4F4F5')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}><i className="ti ti-pencil" style={{ fontSize: 14 }} /></button>
                        <button onClick={() => handleDuplicate(t)} title="Duplicar" style={{ width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A' }} onMouseEnter={e => (e.currentTarget.style.background = '#F4F4F5')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}><i className="ti ti-copy" style={{ fontSize: 14 }} /></button>
                        <button onClick={() => setDeleteConfirm(t.id)} title="Excluir" style={{ width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: deleteConfirm === t.id ? '#DC2626' : '#71717A' }} onMouseEnter={e => (e.currentTarget.style.background = '#FEF2F2')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}><i className="ti ti-trash" style={{ fontSize: 14 }} /></button>
                        {deleteConfirm === t.id && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
                            <button onClick={() => deleteMut.mutate(t.id)} style={{ height: 26, padding: '0 10px', background: '#DC2626', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Confirmar</button>
                            <button onClick={() => setDeleteConfirm(null)} style={{ height: 26, padding: '0 8px', background: 'none', border: '1px solid #E4E4E7', borderRadius: 6, fontSize: 11, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <>
          <div onClick={closeDrawer} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', zIndex: 1000 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 560, background: '#fff', zIndex: 1001, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 32px rgba(0,0,0,.12)', animation: 'slideInRight 0.22s ease' }}>
            <div style={{ flexShrink: 0, padding: '20px 24px', borderBottom: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div><div style={{ fontSize: 16, fontWeight: 700, color: '#09090B' }}>{editingTpl ? `Editar modelo` : `Novo modelo`}</div><div style={{ fontSize: 12, color: '#71717A', marginTop: 2 }}>{editingTpl ? `Editando: ${editingTpl.name}` : 'Preencha os dados do novo modelo'}</div></div>
              <button onClick={closeDrawer} style={{ width: 32, height: 32, border: '1px solid #E4E4E7', borderRadius: 8, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A' }}><i className="ti ti-x" style={{ fontSize: 16 }} /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Nome do modelo *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Evolução sessão de fisioterapia" style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, color: '#09090B', background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} /></div>
              {!lockType && (
                <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Tipo *</label><select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, color: '#09090B', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'border-box' }}>{typeOptions.map(t => <option key={t}>{t}</option>)}</select></div>
              )}
              <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Descrição</label><input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Breve descrição (opcional)" style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, color: '#09090B', background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} /></div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Conteúdo *</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: '6px 8px', background: '#F9FAFB', borderRadius: '8px 8px 0 0', border: '1px solid #E4E4E7', borderBottom: 'none' }}>
                  {[{ cmd: 'bold', icon: 'ti-bold' }, { cmd: 'italic', icon: 'ti-italic' }, { cmd: 'underline', icon: 'ti-underline' }].map(b => <button key={b.cmd} className="rte-btn" onMouseDown={e => { e.preventDefault(); execCmd(b.cmd); }}><i className={`ti ${b.icon}`} style={{ fontSize: 13 }} /></button>)}
                  <div style={{ width: 1, height: 18, background: '#E4E4E7', margin: '5px 3px' }} />
                  {[{ cmd: 'insertUnorderedList', icon: 'ti-list' }, { cmd: 'insertOrderedList', icon: 'ti-list-numbers' }].map(b => <button key={b.cmd} className="rte-btn" onMouseDown={e => { e.preventDefault(); execCmd(b.cmd); }}><i className={`ti ${b.icon}`} style={{ fontSize: 13 }} /></button>)}
                </div>
                <div ref={editorRef} contentEditable suppressContentEditableWarning data-placeholder="Digite o conteúdo do modelo..." onInput={e => { setEditorContent((e.currentTarget as HTMLDivElement).innerHTML); setDrawerError(null); }} style={{ minHeight: 200, maxHeight: 300, overflowY: 'auto', padding: 12, border: '1px solid #E4E4E7', borderRadius: '0 0 8px 8px', fontSize: 13, color: '#09090B', outline: 'none', lineHeight: 1.7, background: '#fff', fontFamily: "'Inter', system-ui, sans-serif" }} />
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: '#71717A', marginBottom: 6, fontWeight: 500 }}>Variáveis disponíveis:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {TEMPLATE_VARS.map(v => <button key={v} onClick={() => { editorRef.current?.focus(); document.execCommand('insertText', false, v); setTimeout(() => { if (editorRef.current) setEditorContent(editorRef.current.innerHTML); }, 0); }} style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: '#F0F9FF', color: '#0284C7', border: '1px solid #BAE6FD', cursor: 'pointer', fontFamily: 'monospace' }}>{v}</button>)}
                  </div>
                </div>
              </div>
              <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div><div style={{ fontSize: 13, fontWeight: 500, color: '#09090B' }}>Ativo</div><div style={{ fontSize: 11, color: '#71717A' }}>Disponível para uso no prontuário</div></div>
                <button onClick={() => setForm(f => ({ ...f, active: !f.active }))} style={{ width: 36, height: 20, borderRadius: 99, cursor: 'pointer', background: form.active ? '#000' : '#E4E4E7', border: 'none', position: 'relative', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 3, left: form.active ? 19 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.18s' }} />
                </button>
              </div>
            </div>
            <div style={{ flexShrink: 0, padding: '12px 24px 16px', borderTop: '1px solid #E4E4E7', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {drawerError && <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8 }}><i className="ti ti-alert-circle" style={{ fontSize: 14, color: '#DC2626', flexShrink: 0, marginTop: 1 }} /><span style={{ fontSize: 12, color: '#DC2626' }}>{drawerError}</span></div>}
              {drawerSuccess && <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8 }}><i className="ti ti-circle-check" style={{ fontSize: 14, color: '#16A34A' }} /><span style={{ fontSize: 12, color: '#16A34A', fontWeight: 500 }}>{editingTpl ? 'Modelo atualizado.' : 'Modelo criado.'}</span></div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={closeDrawer} style={{ height: 38, padding: '0 18px', background: '#fff', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
                <button onClick={handleSave} disabled={isSaving || drawerSuccess} style={{ flex: 1, height: 38, background: (isSaving || drawerSuccess) ? '#A1A1AA' : '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: (isSaving || drawerSuccess) ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {isSaving ? <><div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Salvando...</> : editingTpl ? 'Salvar alterações' : 'Criar modelo'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </SubView>
  );
}

// ─── Clínica: Informações cadastrais ─────────────────────────────────────────
const CLINIC_LS = 'pcl_clinic_info';
type ClinicInfo = { name: string; cnpj: string; phone: string; email: string; address: string; city: string; state: string; zip: string; website: string };
const CLINIC_DEFAULTS: ClinicInfo = { name: '', cnpj: '', phone: '', email: '', address: '', city: '', state: '', zip: '', website: '' };
function loadClinicInfo(): ClinicInfo { try { const r = localStorage.getItem(CLINIC_LS); if (r) return JSON.parse(r); } catch {} return CLINIC_DEFAULTS; }

function ClinicInfoView({ onBack, mc }: { onBack: () => void; mc: ModInfo }) {
  const [info, setInfo] = useState<ClinicInfo>(loadClinicInfo);
  const [saved, setSaved] = useState(false);
  function handleSave() { localStorage.setItem(CLINIC_LS, JSON.stringify(info)); setSaved(true); setTimeout(() => setSaved(false), 2500); }
  return (
    <SubView title="Informações cadastrais" desc="Dados cadastrais da clínica exibidos em documentos e relatórios." icon="ti-info-circle" iconBg={mc.bg} iconColor={mc.color} parentLabel="Clínica" onBack={onBack}
      actions={<button onClick={handleSave} style={{ height: 36, padding: '0 16px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>{saved ? <><i className="ti ti-check" style={{ fontSize: 14 }} /> Salvo!</> : 'Salvar alterações'}</button>}>
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E4E4E7', padding: '24px 28px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ gridColumn: 'span 2' }}><label style={lblStyle}>Nome da clínica</label><input value={info.name} onChange={e => setInfo(v => ({ ...v, name: e.target.value }))} placeholder="Ex: Clínica São Paulo" style={inpStyle} /></div>
          <div><label style={lblStyle}>CNPJ</label><input value={info.cnpj} onChange={e => setInfo(v => ({ ...v, cnpj: e.target.value }))} placeholder="00.000.000/0001-00" style={inpStyle} /></div>
          <div><label style={lblStyle}>Telefone</label><input value={info.phone} onChange={e => setInfo(v => ({ ...v, phone: e.target.value }))} placeholder="(11) 99999-9999" style={inpStyle} /></div>
          <div style={{ gridColumn: 'span 2' }}><label style={lblStyle}>E-mail</label><input value={info.email} onChange={e => setInfo(v => ({ ...v, email: e.target.value }))} placeholder="contato@clinica.com.br" style={inpStyle} /></div>
          <div style={{ gridColumn: 'span 2' }}><label style={lblStyle}>Endereço</label><input value={info.address} onChange={e => setInfo(v => ({ ...v, address: e.target.value }))} placeholder="Rua, número, complemento" style={inpStyle} /></div>
          <div><label style={lblStyle}>Cidade</label><input value={info.city} onChange={e => setInfo(v => ({ ...v, city: e.target.value }))} placeholder="São Paulo" style={inpStyle} /></div>
          <div><label style={lblStyle}>Estado</label><input value={info.state} onChange={e => setInfo(v => ({ ...v, state: e.target.value }))} placeholder="SP" style={inpStyle} /></div>
          <div><label style={lblStyle}>CEP</label><input value={info.zip} onChange={e => setInfo(v => ({ ...v, zip: e.target.value }))} placeholder="00000-000" style={inpStyle} /></div>
          <div><label style={lblStyle}>Website</label><input value={info.website} onChange={e => setInfo(v => ({ ...v, website: e.target.value }))} placeholder="https://clinica.com.br" style={inpStyle} /></div>
        </div>
      </div>
    </SubView>
  );
}

// ─── Clínica: Horário de funcionamento ───────────────────────────────────────
const SCHEDULE_LS = 'pcl_clinic_schedule';
const DAYS_SCHED = [{ key: 'seg', label: 'Segunda-feira' }, { key: 'ter', label: 'Terça-feira' }, { key: 'qua', label: 'Quarta-feira' }, { key: 'qui', label: 'Quinta-feira' }, { key: 'sex', label: 'Sexta-feira' }, { key: 'sab', label: 'Sábado' }, { key: 'dom', label: 'Domingo' }];
type DaySched = { enabled: boolean; start: string; end: string };
const DEFAULT_SCHED: Record<string, DaySched> = { seg: { enabled: true, start: '08:00', end: '18:00' }, ter: { enabled: true, start: '08:00', end: '18:00' }, qua: { enabled: true, start: '08:00', end: '18:00' }, qui: { enabled: true, start: '08:00', end: '18:00' }, sex: { enabled: true, start: '08:00', end: '17:00' }, sab: { enabled: false, start: '08:00', end: '12:00' }, dom: { enabled: false, start: '08:00', end: '12:00' } };
function loadSched() { try { const r = localStorage.getItem(SCHEDULE_LS); if (r) return JSON.parse(r); } catch {} return DEFAULT_SCHED; }

function ClinicScheduleView({ onBack, mc }: { onBack: () => void; mc: ModInfo }) {
  const [sched, setSched] = useState<Record<string, DaySched>>(loadSched);
  const [saved, setSaved] = useState(false);
  function handleSave() { localStorage.setItem(SCHEDULE_LS, JSON.stringify(sched)); setSaved(true); setTimeout(() => setSaved(false), 2500); }
  const upd = (key: string, field: keyof DaySched, val: any) => setSched(s => ({ ...s, [key]: { ...s[key], [field]: val } }));
  return (
    <SubView title="Horário de funcionamento" desc="Defina os dias e horários de atendimento da clínica." icon="ti-clock" iconBg={mc.bg} iconColor={mc.color} parentLabel="Clínica" onBack={onBack}
      actions={<button onClick={handleSave} style={{ height: 36, padding: '0 16px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>{saved ? <><i className="ti ti-check" style={{ fontSize: 14 }} /> Salvo!</> : 'Salvar alterações'}</button>}>
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E4E4E7', overflow: 'hidden' }}>
        {DAYS_SCHED.map((d, i) => {
          const day = sched[d.key];
          return (
            <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', borderBottom: i < DAYS_SCHED.length - 1 ? '1px solid #F4F4F5' : 'none', background: day.enabled ? '#fff' : '#FAFAFA' }}>
              <button onClick={() => upd(d.key, 'enabled', !day.enabled)} style={{ width: 36, height: 20, borderRadius: 99, cursor: 'pointer', background: day.enabled ? '#000' : '#E4E4E7', border: 'none', position: 'relative', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 3, left: day.enabled ? 19 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.18s' }} />
              </button>
              <span style={{ fontSize: 13, fontWeight: 500, color: day.enabled ? '#09090B' : '#A1A1AA', width: 140, flexShrink: 0 }}>{d.label}</span>
              {day.enabled ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="time" value={day.start} onChange={e => upd(d.key, 'start', e.target.value)} style={{ height: 34, padding: '0 10px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, color: '#09090B', background: '#fff', fontFamily: 'inherit', outline: 'none' }} />
                  <span style={{ fontSize: 13, color: '#71717A' }}>até</span>
                  <input type="time" value={day.end} onChange={e => upd(d.key, 'end', e.target.value)} style={{ height: 34, padding: '0 10px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, color: '#09090B', background: '#fff', fontFamily: 'inherit', outline: 'none' }} />
                </div>
              ) : (
                <span style={{ fontSize: 12, color: '#A1A1AA' }}>Fechado</span>
              )}
            </div>
          );
        })}
      </div>
    </SubView>
  );
}

// ─── Clínica: Cabeçalho e rodapé ─────────────────────────────────────────────
const HEADER_LS = 'pcl_doc_header';
function ClinicHeaderView({ onBack, mc }: { onBack: () => void; mc: ModInfo }) {
  const [hdr, setHdr] = useState<{ header: string; footer: string }>(() => { try { return JSON.parse(localStorage.getItem(HEADER_LS) || '{"header":"","footer":""}'); } catch { return { header: '', footer: '' }; } });
  const [saved, setSaved] = useState(false);
  function handleSave() { localStorage.setItem(HEADER_LS, JSON.stringify(hdr)); setSaved(true); setTimeout(() => setSaved(false), 2500); }
  const taStyle: React.CSSProperties = { width: '100%', minHeight: 90, padding: '10px 12px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, color: '#09090B', background: '#fff', fontFamily: 'inherit', outline: 'none', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box' };
  return (
    <SubView title="Cabeçalho e rodapé" desc="Texto exibido no topo e na base dos documentos gerados pelo sistema." icon="ti-file-text" iconBg={mc.bg} iconColor={mc.color} parentLabel="Clínica" onBack={onBack}
      actions={<button onClick={handleSave} style={{ height: 36, padding: '0 16px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>{saved ? <><i className="ti ti-check" style={{ fontSize: 14 }} /> Salvo!</> : 'Salvar alterações'}</button>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E4E4E7', padding: '20px 24px' }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#09090B', display: 'block', marginBottom: 4 }}>Cabeçalho</label>
          <p style={{ fontSize: 12, color: '#71717A', marginBottom: 10 }}>Aparece no topo de receitas, atestados e outros documentos.</p>
          <textarea value={hdr.header} onChange={e => setHdr(v => ({ ...v, header: e.target.value }))} placeholder={'Ex: Clínica São Paulo · Dr. João Silva\nRua das Flores, 100 – São Paulo/SP · (11) 99999-9999'} style={taStyle} />
        </div>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E4E4E7', padding: '20px 24px' }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#09090B', display: 'block', marginBottom: 4 }}>Rodapé</label>
          <p style={{ fontSize: 12, color: '#71717A', marginBottom: 10 }}>Aparece na base dos documentos gerados.</p>
          <textarea value={hdr.footer} onChange={e => setHdr(v => ({ ...v, footer: e.target.value }))} placeholder="Ex: Documento válido sem assinatura · CNPJ 00.000.000/0001-00" style={taStyle} />
        </div>
      </div>
    </SubView>
  );
}

// ─── Clínica: Salas ──────────────────────────────────────────────────────────
const ROOMS_LS = 'pcl_rooms';
type Room = { id: string; name: string; capacity: number; description: string; active: boolean };
function loadRooms(): Room[] { try { const r = localStorage.getItem(ROOMS_LS); if (r) return JSON.parse(r); } catch {} return []; }
function saveRooms(d: Room[]) { try { localStorage.setItem(ROOMS_LS, JSON.stringify(d)); } catch {} }

function RoomsView({ onBack, mc }: { onBack: () => void; mc: ModInfo }) {
  const [rooms, setRooms] = useState<Room[]>(loadRooms);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Room | null>(null);
  const [fName, setFName] = useState(''); const [fCap, setFCap] = useState(1); const [fDesc, setFDesc] = useState(''); const [fErr, setFErr] = useState('');
  function openNew()  { setEditItem(null); setFName(''); setFCap(1); setFDesc(''); setFErr(''); setShowForm(true); }
  function openEdit(r: Room) { setEditItem(r); setFName(r.name); setFCap(r.capacity); setFDesc(r.description); setFErr(''); setShowForm(true); }
  function handleSave() {
    if (!fName.trim()) { setFErr('Informe o nome da sala.'); return; }
    const upd = editItem ? rooms.map(r => r.id === editItem.id ? { ...r, name: fName.trim(), capacity: fCap, description: fDesc } : r) : [...rooms, { id: `room_${Date.now()}`, name: fName.trim(), capacity: fCap, description: fDesc, active: true }];
    setRooms(upd); saveRooms(upd); setShowForm(false);
  }
  function handleDelete(id: string) { const u = rooms.filter(r => r.id !== id); setRooms(u); saveRooms(u); }
  function toggleActive(id: string) { const u = rooms.map(r => r.id === id ? { ...r, active: !r.active } : r); setRooms(u); saveRooms(u); }
  return (
    <SubView title="Salas" desc="Salas e locais de atendimento disponíveis na clínica." icon="ti-door" iconBg={mc.bg} iconColor={mc.color} parentLabel="Clínica" onBack={onBack}
      actions={<button onClick={openNew} style={{ height: 36, padding: '0 16px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}><i className="ti ti-plus" style={{ fontSize: 14 }} /> Nova sala</button>}>
      {rooms.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E4E4E7', padding: '48px 40px', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#09090B', marginBottom: 6 }}>Nenhuma sala cadastrada</div>
          <div style={{ fontSize: 13, color: '#71717A', marginBottom: 20 }}>Adicione as salas para organizar os atendimentos.</div>
          <button onClick={openNew} style={{ height: 36, padding: '0 16px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Adicionar sala</button>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E4E4E7', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#F4F4F5', borderBottom: '1px solid #E4E4E7' }}>{['Sala', 'Capacidade', 'Descrição', 'Status', 'Ações'].map((h, i) => <th key={h} style={{ padding: '9px 16px', textAlign: i === 4 ? 'right' : 'left', fontSize: 11, fontWeight: 600, color: '#71717A', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>)}</tr></thead>
            <tbody>
              {rooms.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #F4F4F5' }} onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#09090B' }}>{r.name}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#71717A' }}>{r.capacity} {r.capacity === 1 ? 'pessoa' : 'pessoas'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#71717A' }}>{r.description || '—'}</td>
                  <td style={{ padding: '12px 16px' }}><button onClick={() => toggleActive(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: r.active ? '#DCFCE7' : '#F4F4F5', color: r.active ? '#16A34A' : '#71717A' }}>{r.active ? 'Ativa' : 'Inativa'}</span></button></td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button onClick={() => openEdit(r)} style={{ width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => (e.currentTarget.style.background = '#F4F4F5')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}><i className="ti ti-pencil" style={{ fontSize: 13, color: '#71717A' }} /></button>
                      <button onClick={() => handleDelete(r.id)} style={{ width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => (e.currentTarget.style.background = '#FEF2F2')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}><i className="ti ti-trash" style={{ fontSize: 13, color: '#EF4444' }} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showForm && (
        <>
          <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 9000, backdropFilter: 'blur(2px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 420, background: '#fff', borderRadius: 14, zIndex: 9001, boxShadow: '0 20px 60px rgba(0,0,0,.15)', fontFamily: "'Inter', system-ui, sans-serif" }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><div style={{ fontSize: 15, fontWeight: 700 }}>{editItem ? 'Editar sala' : 'Nova sala'}</div><button onClick={() => setShowForm(false)} style={{ width: 26, height: 26, border: 'none', background: '#F4F4F5', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="ti ti-x" style={{ fontSize: 12, color: '#71717A' }} /></button></div>
            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={lblStyle}>Nome da sala *</label><input value={fName} onChange={e => setFName(e.target.value)} placeholder="Ex: Sala 1, Consultório A..." style={inpStyle} /></div>
              <div><label style={lblStyle}>Capacidade (pessoas)</label><input type="number" min={1} value={fCap} onChange={e => setFCap(Number(e.target.value))} style={inpStyle} /></div>
              <div><label style={lblStyle}>Descrição</label><input value={fDesc} onChange={e => setFDesc(e.target.value)} placeholder="Observações (opcional)" style={inpStyle} /></div>
              {fErr && <div style={{ fontSize: 12, color: '#DC2626', padding: '8px 10px', background: '#FEF2F2', borderRadius: 7 }}>{fErr}</div>}
            </div>
            <div style={{ padding: '12px 22px', borderTop: '1px solid #E4E4E7', display: 'flex', gap: 8, background: '#FAFAFA' }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, height: 38, border: '1px solid #E4E4E7', background: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={handleSave} style={{ flex: 2, height: 38, background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>{editItem ? 'Salvar' : 'Criar sala'}</button>
            </div>
          </div>
        </>
      )}
    </SubView>
  );
}

// ─── Access Profiles ──────────────────────────────────────────────────────────

type PermKey = 'view' | 'create' | 'edit' | 'delete';
interface ModuleDef { key: string; label: string; category: string; perms: PermKey[]; subPerms?: { key: string; label: string }[] }
type PermMap = Record<string, Record<string, boolean>>;

const PERM_MODULES: ModuleDef[] = [
  { key: 'dashboard',     label: 'Dashboard',      category: 'Geral',                 perms: ['view'] },
  { key: 'reports',       label: 'Relatórios',     category: 'Geral',                 perms: ['view'] },
  { key: 'contacts',      label: 'Contatos',       category: 'Atendimento',           perms: ['view','create','edit','delete'] },
  { key: 'agenda',        label: 'Agenda',         category: 'Atendimento',           perms: ['view','create','edit','delete'] },
  {
    key: 'medicalRecords', label: 'Prontuário',    category: 'Atendimento',           perms: ['view','create','edit'],
    subPerms: [{ key: 'finalizeEvolution', label: 'Finalizar evolução' }, { key: 'createPrescription', label: 'Criar receituário' }],
  },
  { key: 'sessions',      label: 'Sessões',        category: 'Atendimento',           perms: ['view','create','edit','delete'] },
  { key: 'documents',     label: 'Documentos',     category: 'Atendimento',           perms: ['view','create','edit','delete'] },
  { key: 'opportunities', label: 'Oportunidades',  category: 'Comercial / Financeiro',perms: ['view','create','edit','delete'] },
  {
    key: 'financial',     label: 'Financeiro',     category: 'Comercial / Financeiro',perms: ['view','create','edit','delete'],
    subPerms: [{ key: 'receivePayment', label: 'Registrar recebimento' }, { key: 'confirmEntry', label: 'Conferir lançamento' }, { key: 'viewDre', label: 'Visualizar DRE' }],
  },
  { key: 'contracts',     label: 'Contratos',      category: 'Comercial / Financeiro',perms: ['view','create','edit','delete'] },
  { key: 'inventory',     label: 'Estoque',        category: 'Operação',              perms: ['view','create','edit','delete'] },
  { key: 'messages',      label: 'Mensagens',      category: 'Operação',              perms: ['view','create'] },
  { key: 'settings',      label: 'Configurações',  category: 'Administração',         perms: ['view','edit'] },
];

const PERM_LABELS: Record<string, string> = { view: 'Visualizar', create: 'Cadastrar', edit: 'Editar', delete: 'Excluir' };

const ALL_PERMS: PermKey[] = ['view', 'create', 'edit', 'delete'];

function buildEmptyPerms(): PermMap {
  const p: PermMap = {};
  PERM_MODULES.forEach(m => {
    p[m.key] = {};
    m.perms.forEach(k => { p[m.key][k] = false; });
    m.subPerms?.forEach(sp => { p[m.key][sp.key] = false; });
  });
  return p;
}

function buildFullPerms(): PermMap {
  const p: PermMap = {};
  PERM_MODULES.forEach(m => {
    p[m.key] = {};
    m.perms.forEach(k => { p[m.key][k] = true; });
    m.subPerms?.forEach(sp => { p[m.key][sp.key] = true; });
  });
  return p;
}

function buildReadOnlyPerms(): PermMap {
  const p: PermMap = {};
  PERM_MODULES.forEach(m => {
    p[m.key] = {};
    m.perms.forEach(k => { p[m.key][k] = k === 'view'; });
    m.subPerms?.forEach(sp => { p[m.key][sp.key] = false; });
  });
  return p;
}

function mergePerms(base: PermMap, incoming: any): PermMap {
  const p = buildEmptyPerms();
  if (!incoming || typeof incoming !== 'object') return p;
  PERM_MODULES.forEach(m => {
    const src = incoming[m.key] || {};
    m.perms.forEach(k => { p[m.key][k] = !!src[k]; });
    m.subPerms?.forEach(sp => { p[m.key][sp.key] = !!src[sp.key]; });
  });
  return p;
}

function Checkbox({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <button
      onClick={!disabled ? onChange : undefined}
      style={{ width: 18, height: 18, border: `2px solid ${checked ? '#000' : '#D4D4D8'}`, borderRadius: 4, background: checked ? '#000' : '#fff', cursor: disabled ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: disabled ? 0.35 : 1, transition: 'all .1s' }}
    >
      {checked && <i className="ti ti-check" style={{ fontSize: 10, color: '#fff' }} />}
    </button>
  );
}

function ProfileDrawer({ profile, onClose, onSaved }: { profile: any | null; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName]   = useState(profile?.name || '');
  const [desc, setDesc]   = useState(profile?.description || '');
  const [active, setActive] = useState(profile?.active !== false);
  const [perms, setPerms] = useState<PermMap>(() => mergePerms({}, profile?.permissions));
  const [err,  setErr]    = useState('');

  const createMut = useMutation({
    mutationFn: (d: any) => accessProfilesApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['access-profiles'] }); toast('Perfil criado com sucesso.', 'success'); onSaved(); },
    onError: (e: any) => { const m = e?.response?.data?.message; setErr(m || 'Erro ao criar perfil.'); },
  });
  const updateMut = useMutation({
    mutationFn: (d: any) => accessProfilesApi.update(profile.id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['access-profiles'] }); toast('Perfil atualizado.', 'success'); onSaved(); },
    onError: (e: any) => { const m = e?.response?.data?.message; setErr(m || 'Erro ao salvar.'); },
  });

  function togglePerm(mod: string, key: string) {
    setPerms(prev => {
      const next = { ...prev, [mod]: { ...prev[mod], [key]: !prev[mod][key] } };
      // If view is being turned off, clear all other perms for this module
      if (key === 'view' && !prev[mod]['view'] === false) {
        const m = PERM_MODULES.find(x => x.key === mod);
        if (m) {
          m.perms.filter(p => p !== 'view').forEach(p => { next[mod][p] = false; });
          m.subPerms?.forEach(sp => { next[mod][sp.key] = false; });
        }
      }
      // If turning on a non-view perm, ensure view is on
      if (key !== 'view' && next[mod][key] && !prev[mod]['view']) {
        next[mod]['view'] = true;
      }
      return next;
    });
  }

  function markAllRow(modKey: string) {
    setPerms(prev => {
      const m = PERM_MODULES.find(x => x.key === modKey)!;
      const next = { ...prev, [modKey]: { ...prev[modKey] } };
      m.perms.forEach(k => { next[modKey][k] = true; });
      m.subPerms?.forEach(sp => { next[modKey][sp.key] = true; });
      return next;
    });
  }

  function clearRow(modKey: string) {
    setPerms(prev => {
      const m = PERM_MODULES.find(x => x.key === modKey)!;
      const next = { ...prev, [modKey]: { ...prev[modKey] } };
      m.perms.forEach(k => { next[modKey][k] = false; });
      m.subPerms?.forEach(sp => { next[modKey][sp.key] = false; });
      return next;
    });
  }

  function handleSave() {
    if (!name.trim()) { setErr('Informe o nome do perfil.'); return; }
    const data = { name: name.trim(), description: desc.trim() || undefined, active, permissions: perms };
    if (profile) updateMut.mutate(data); else createMut.mutate(data);
  }

  const isPending = createMut.isPending || updateMut.isPending;
  const categories = [...new Set(PERM_MODULES.map(m => m.category))];

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 9500, backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 700, background: '#F8F9FA', zIndex: 9501, display: 'flex', flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif", boxShadow: '-8px 0 40px rgba(0,0,0,.14)', animation: 'slideIn .2s ease' }}>

        {/* Header */}
        <div style={{ flexShrink: 0, background: '#FFFFFF', borderBottom: '1px solid #E4E4E7', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#09090B' }}>{profile ? 'Editar perfil' : 'Novo perfil de acesso'}</div>
            <div style={{ fontSize: 12, color: '#71717A', marginTop: 2 }}>Configure nome, descrição e permissões por módulo</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, border: 'none', background: '#F4F4F5', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="ti ti-x" style={{ fontSize: 13, color: '#71717A' }} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* Basic info */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 12, padding: '18px 20px', marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>Informações do perfil</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={lblStyle}>Nome do perfil *</label>
                <input value={name} onChange={e => { setName(e.target.value); setErr(''); }} placeholder="Ex: Recepção, Médico..." style={inpStyle} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={lblStyle}>Descrição</label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="Descreva brevemente as responsabilidades deste perfil..." style={{ ...inpStyle, height: 'auto', resize: 'vertical', padding: '8px 10px', lineHeight: 1.5 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gridColumn: '1/-1', background: '#F9F9F9', border: '1px solid #E4E4E7', borderRadius: 8, padding: '10px 14px' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#09090B' }}>Status do perfil</div>
                  <div style={{ fontSize: 12, color: '#71717A', marginTop: 2 }}>{active ? 'Ativo — usuários podem ser vinculados a este perfil' : 'Inativo — perfil não disponível para novos usuários'}</div>
                </div>
                <button onClick={() => setActive(v => !v)} style={{ width: 40, height: 22, borderRadius: 99, cursor: 'pointer', background: active ? '#16A34A' : '#E4E4E7', border: 'none', position: 'relative', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 3, left: active ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
                </button>
              </div>
            </div>
          </div>

          {/* Permissions matrix */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
            {/* Matrix header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#09090B' }}>Matriz de permissões</div>
                <div style={{ fontSize: 12, color: '#71717A', marginTop: 2 }}>Define o que cada perfil pode ver e executar em cada módulo</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setPerms(buildReadOnlyPerms())} style={{ height: 28, padding: '0 10px', border: '1px solid #E4E4E7', background: '#fff', borderRadius: 7, fontSize: 11, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <i className="ti ti-eye" style={{ fontSize: 11 }} /> Somente leitura
                </button>
                <button onClick={() => setPerms(buildFullPerms())} style={{ height: 28, padding: '0 10px', border: '1px solid #E4E4E7', background: '#fff', borderRadius: 7, fontSize: 11, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <i className="ti ti-checks" style={{ fontSize: 11 }} /> Marcar tudo
                </button>
                <button onClick={() => setPerms(buildEmptyPerms())} style={{ height: 28, padding: '0 10px', border: '1px solid #E4E4E7', background: '#fff', borderRadius: 7, fontSize: 11, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <i className="ti ti-x" style={{ fontSize: 11 }} /> Limpar tudo
                </button>
              </div>
            </div>

            {/* Legend */}
            <div style={{ padding: '8px 20px', background: '#F9F9F9', borderBottom: '1px solid #E4E4E7', display: 'flex', gap: 16 }}>
              {[['Visualizar','Acessa o menu e vê os dados'],['Cadastrar','Cria novos registros'],['Editar','Altera registros existentes'],['Excluir','Remove ou inativa registros']].map(([l,d]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#09090B' }}>{l}:</span>
                  <span style={{ fontSize: 11, color: '#71717A' }}>{d}</span>
                </div>
              ))}
            </div>

            {/* Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F4F4F5' }}>
                  <th style={{ padding: '9px 20px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#71717A', textTransform: 'uppercase', letterSpacing: '.05em' }}>Módulo</th>
                  {ALL_PERMS.map(k => (
                    <th key={k} style={{ padding: '9px 12px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#71717A', textTransform: 'uppercase', letterSpacing: '.05em', width: 90 }}>{PERM_LABELS[k]}</th>
                  ))}
                  <th style={{ padding: '9px 12px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#71717A', textTransform: 'uppercase', letterSpacing: '.05em', width: 80 }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(cat => {
                  const mods = PERM_MODULES.filter(m => m.category === cat);
                  return (
                    <>
                      <tr key={`cat-${cat}`}>
                        <td colSpan={6} style={{ padding: '8px 20px 4px', background: '#FAFAFA', borderTop: '1px solid #E4E4E7', borderBottom: '1px solid #F1F5F9' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.08em' }}>{cat}</span>
                        </td>
                      </tr>
                      {mods.map(mod => {
                        const hasView = !!perms[mod.key]?.['view'];
                        return (
                          <>
                            <tr key={mod.key} style={{ borderBottom: '1px solid #F4F4F5' }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                              <td style={{ padding: '10px 20px' }}>
                                <span style={{ fontSize: 13, fontWeight: 500, color: '#09090B' }}>{mod.label}</span>
                              </td>
                              {ALL_PERMS.map(pkey => {
                                const applicable = mod.perms.includes(pkey);
                                const checked = applicable && !!perms[mod.key]?.[pkey];
                                const disabled = !applicable || (pkey !== 'view' && !hasView);
                                return (
                                  <td key={pkey} style={{ padding: '10px 12px', textAlign: 'center' }}>
                                    {applicable
                                      ? <div style={{ display: 'flex', justifyContent: 'center' }}><Checkbox checked={checked} disabled={disabled} onChange={() => togglePerm(mod.key, pkey)} /></div>
                                      : <span style={{ color: '#D4D4D8', fontSize: 13 }}>—</span>
                                    }
                                  </td>
                                );
                              })}
                              <td style={{ padding: '10px 12px' }}>
                                <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                                  <button onClick={() => markAllRow(mod.key)} title="Marcar tudo" style={{ width: 22, height: 22, border: '1px solid #E4E4E7', background: '#fff', borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => (e.currentTarget.style.background = '#F4F4F5')} onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                                    <i className="ti ti-checks" style={{ fontSize: 10, color: '#71717A' }} />
                                  </button>
                                  <button onClick={() => clearRow(mod.key)} title="Limpar" style={{ width: 22, height: 22, border: '1px solid #E4E4E7', background: '#fff', borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => (e.currentTarget.style.background = '#F4F4F5')} onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                                    <i className="ti ti-x" style={{ fontSize: 10, color: '#71717A' }} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {mod.subPerms && mod.subPerms.map(sp => (
                              <tr key={`${mod.key}-${sp.key}`} style={{ borderBottom: '1px solid #F4F4F5', background: '#FAFCFF' }}>
                                <td style={{ padding: '7px 20px 7px 36px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <i className="ti ti-corner-down-right" style={{ fontSize: 11, color: '#A1A1AA' }} />
                                    <span style={{ fontSize: 12, color: '#71717A' }}>{sp.label}</span>
                                  </div>
                                </td>
                                <td colSpan={4} style={{ padding: '7px 12px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Checkbox checked={!!perms[mod.key]?.[sp.key] && hasView} disabled={!hasView} onChange={() => togglePerm(mod.key, sp.key)} />
                                    <span style={{ fontSize: 12, color: '#71717A' }}>Habilitado</span>
                                  </div>
                                </td>
                                <td />
                              </tr>
                            ))}
                          </>
                        );
                      })}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          {err && <div style={{ fontSize: 13, color: '#DC2626', padding: '10px 14px', background: '#FEF2F2', borderRadius: 8, border: '1px solid #FECACA' }}>{err}</div>}
        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0, background: '#FFFFFF', borderTop: '1px solid #E4E4E7', padding: '14px 24px', display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, height: 38, border: '1px solid #E4E4E7', background: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
          <button onClick={handleSave} disabled={isPending} style={{ flex: 2, height: 38, background: isPending ? '#A1A1AA' : '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: isPending ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {isPending ? 'Salvando...' : profile ? 'Salvar alterações' : 'Criar perfil'}
          </button>
        </div>
      </div>
    </>
  );
}

function AccessProfilesView({ onBack, mc }: { onBack: () => void; mc: ModInfo }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [drawerProfile, setDrawerProfile] = useState<any | null | 'new'>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: profiles = [], isLoading } = useQuery({ queryKey: ['access-profiles'], queryFn: accessProfilesApi.list });

  const seedMut = useMutation({
    mutationFn: accessProfilesApi.seedDefaults,
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['access-profiles'] });
      toast(r.seeded > 0 ? `${r.seeded} perfis padrão criados.` : 'Perfis padrão já existem.', 'info');
    },
  });

  const dupMut = useMutation({
    mutationFn: (id: string) => accessProfilesApi.duplicate(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['access-profiles'] }); toast('Perfil duplicado.', 'success'); },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => accessProfilesApi.update(id, { active }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['access-profiles'] }); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => accessProfilesApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['access-profiles'] }); setDeleteConfirm(null); toast('Perfil excluído.', 'success'); },
    onError: (e: any) => { const m = e?.response?.data?.message; toast(m || 'Erro ao excluir.', 'error'); setDeleteConfirm(null); },
  });

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');

  return (
    <SubView title="Perfis de acesso" desc="Gerencie os perfis de permissão dos usuários do sistema." icon="ti-shield" iconBg={mc.bg} iconColor={mc.color} parentLabel="Usuários e permissões" onBack={onBack}
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          {(profiles as any[]).length === 0 && (
            <button onClick={() => seedMut.mutate()} disabled={seedMut.isPending} style={{ height: 36, padding: '0 14px', border: '1px solid #E4E4E7', background: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
              <i className="ti ti-sparkles" style={{ fontSize: 14 }} /> Criar perfis padrão
            </button>
          )}
          <button onClick={() => setDrawerProfile('new')} style={{ height: 36, padding: '0 16px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
            <i className="ti ti-plus" style={{ fontSize: 14 }} /> Novo perfil
          </button>
        </div>
      }>

      <div style={{ background: '#fff', border: '1px solid #E4E4E7', borderRadius: 12, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#71717A', fontSize: 13 }}>Carregando perfis...</div>
        ) : (profiles as any[]).length === 0 ? (
          <div style={{ padding: '40px 32px', textAlign: 'center' }}>
            <i className="ti ti-shield-off" style={{ fontSize: 36, color: '#D1D5DB', display: 'block', marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Nenhum perfil cadastrado</div>
            <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 16 }}>Crie perfis personalizados ou use os perfis padrão do sistema</div>
            <button onClick={() => seedMut.mutate()} disabled={seedMut.isPending} style={{ height: 36, padding: '0 16px', border: '1px solid #000', background: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#000', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <i className="ti ti-sparkles" style={{ fontSize: 14 }} /> {seedMut.isPending ? 'Criando...' : 'Criar perfis padrão'}
            </button>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F4F4F5', borderBottom: '1px solid #E4E4E7' }}>
                {['Perfil', 'Descrição', 'Usuários', 'Status', 'Atualização', 'Ações'].map((h, i) => (
                  <th key={h} style={{ padding: '9px 16px', textAlign: i >= 5 ? 'right' : i >= 2 ? 'center' : 'left', fontSize: 11, fontWeight: 600, color: '#71717A', textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(profiles as any[]).map((p: any) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #F4F4F5' }} onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: p.isDefault ? '#F5F3FF' : '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <i className="ti ti-shield" style={{ fontSize: 13, color: p.isDefault ? '#7C3AED' : '#71717A' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#09090B', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {p.name}
                          {p.isDefault && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: '#F5F3FF', color: '#7C3AED' }}>Padrão</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#71717A', maxWidth: 220 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description || '—'}</div>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#09090B' }}>{p.userCount ?? 0}</span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: p.active ? '#DCFCE7' : '#F4F4F5', color: p.active ? '#16A34A' : '#71717A' }}>
                      {p.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: 12, color: '#71717A' }}>{fmtDate(p.updatedAt)}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
                      <button onClick={() => setDrawerProfile(p)} title="Editar" style={{ width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => (e.currentTarget.style.background = '#F4F4F5')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}><i className="ti ti-pencil" style={{ fontSize: 13, color: '#71717A' }} /></button>
                      <button onClick={() => dupMut.mutate(p.id)} title="Duplicar" style={{ width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => (e.currentTarget.style.background = '#F4F4F5')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}><i className="ti ti-copy" style={{ fontSize: 13, color: '#71717A' }} /></button>
                      <button onClick={() => toggleMut.mutate({ id: p.id, active: !p.active })} title={p.active ? 'Inativar' : 'Ativar'} style={{ width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => (e.currentTarget.style.background = '#F4F4F5')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <i className={`ti ${p.active ? 'ti-eye-off' : 'ti-eye'}`} style={{ fontSize: 13, color: '#71717A' }} />
                      </button>
                      {!p.isDefault && (
                        deleteConfirm === p.id ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => deleteMut.mutate(p.id)} style={{ height: 26, padding: '0 10px', background: '#DC2626', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Confirmar</button>
                            <button onClick={() => setDeleteConfirm(null)} style={{ height: 26, padding: '0 8px', background: 'none', border: '1px solid #E4E4E7', borderRadius: 6, fontSize: 11, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirm(p.id)} title="Excluir" style={{ width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => (e.currentTarget.style.background = '#FEF2F2')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}><i className="ti ti-trash" style={{ fontSize: 13, color: '#EF4444' }} /></button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {drawerProfile !== null && (
        <ProfileDrawer
          profile={drawerProfile === 'new' ? null : drawerProfile}
          onClose={() => setDrawerProfile(null)}
          onSaved={() => setDrawerProfile(null)}
        />
      )}
    </SubView>
  );
}

// ─── Usuários ────────────────────────────────────────────────────────────────
const USER_ROLES = [{ value: 'ADMIN', label: 'Administrador' }, { value: 'PROFESSIONAL', label: 'Profissional' }, { value: 'RECEPTIONIST', label: 'Recepcionista' }, { value: 'FINANCIAL', label: 'Financeiro' }];
const ROLE_COLORS: Record<string, { bg: string; color: string }> = { ADMIN: { bg: '#F5F3FF', color: '#7C3AED' }, PROFESSIONAL: { bg: '#EFF6FF', color: '#2563EB' }, RECEPTIONIST: { bg: '#F0FDF4', color: '#16A34A' }, FINANCIAL: { bg: '#FFFBEB', color: '#D97706' } };

function UsersView({ onBack, mc }: { onBack: () => void; mc: ModInfo }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [fName, setFName] = useState('');
  const [fEmail, setFEmail] = useState('');
  const [fPass, setFPass] = useState('');
  const [fRole, setFRole] = useState('PROFESSIONAL');
  const [fProfileId, setFProfileId] = useState('');
  const [fIsProfessional, setFIsProfessional] = useState(false);
  const [fShowInAgenda, setFShowInAgenda] = useState(true);
  const [fErr, setFErr] = useState('');
  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: usersApi.list });
  const { data: profiles = [] } = useQuery({ queryKey: ['access-profiles'], queryFn: accessProfilesApi.list });
  const createMut = useMutation({ mutationFn: (d: any) => usersApi.create(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setShowForm(false); }, onError: (e: any) => { const r = e?.response?.data?.message; setFErr(Array.isArray(r) ? r.join(' · ') : (r || 'Erro.')); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => usersApi.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setShowForm(false); }, onError: (e: any) => { const r = e?.response?.data?.message; setFErr(Array.isArray(r) ? r.join(' · ') : (r || 'Erro.')); } });
  const removeMut = useMutation({ mutationFn: (id: string) => usersApi.remove(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setDeleteConfirm(null); } });

  function openNew() { setEditItem(null); setFName(''); setFEmail(''); setFPass(''); setFRole('PROFESSIONAL'); setFProfileId(''); setFIsProfessional(false); setFShowInAgenda(true); setFErr(''); setShowForm(true); }
  function openEdit(u: any) {
    setEditItem(u);
    setFName(u.name || '');
    setFEmail(u.email || '');
    setFPass('');
    setFRole(u.role || 'PROFESSIONAL');
    setFProfileId(u.accessProfileId || '');
    setFIsProfessional(!!(u.professional?.active));
    setFShowInAgenda(u.professional?.showInAgenda ?? true);
    setFErr('');
    setShowForm(true);
  }
  function handleSave() {
    if (!fName.trim()) { setFErr('Informe o nome.'); return; }
    if (!editItem && !fEmail.trim()) { setFErr('Informe o e-mail.'); return; }
    if (!editItem && fPass.length < 6) { setFErr('Senha mínima: 6 caracteres.'); return; }
    if (editItem) {
      updateMut.mutate({ id: editItem.id, data: { name: fName.trim(), role: fRole, accessProfileId: fProfileId || null, isProfessional: fIsProfessional, showInAgenda: fIsProfessional ? fShowInAgenda : undefined } });
    } else {
      createMut.mutate({ name: fName.trim(), email: fEmail.trim(), password: fPass, role: fRole, accessProfileId: fProfileId || null });
    }
  }
  const roleLabel = (r: string) => USER_ROLES.find(x => x.value === r)?.label || r;
  const roleCfg   = (r: string) => ROLE_COLORS[r] || { bg: '#F4F4F5', color: '#71717A' };
  const initials  = (name: string) => (name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  const Toggle = ({ on, onChange }: { on: boolean; onChange: () => void }) => (
    <button onClick={onChange} style={{ width: 36, height: 20, borderRadius: 99, cursor: 'pointer', background: on ? '#16A34A' : '#E4E4E7', border: 'none', position: 'relative', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: on ? 19 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
    </button>
  );

  return (
    <SubView title="Usuários" desc="Gerencie os usuários com acesso ao sistema." icon="ti-users" iconBg={mc.bg} iconColor={mc.color} parentLabel="Usuários e permissões" onBack={onBack}
      actions={<button onClick={openNew} style={{ height: 36, padding: '0 16px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}><i className="ti ti-plus" style={{ fontSize: 14 }} /> Novo usuário</button>}>
      <div style={{ background: '#fff', border: '1px solid #E4E4E7', borderRadius: 12, overflow: 'hidden' }}>
        {isLoading ? <div style={{ padding: 32, textAlign: 'center', color: '#71717A', fontSize: 13 }}>Carregando...</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#F4F4F5', borderBottom: '1px solid #E4E4E7' }}>
              {['Usuário', 'E-mail', 'Perfil', 'Profissional', 'Agenda', 'Ações'].map((h, i) => (
                <th key={h} style={{ padding: '9px 16px', textAlign: i >= 5 ? 'right' : i >= 3 ? 'center' : 'left', fontSize: 11, fontWeight: 600, color: '#71717A', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {(users as any[]).map((u: any) => {
                const isPro = !!(u.professional?.active);
                const inAgenda = isPro && (u.professional?.showInAgenda ?? true);
                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid #F4F4F5' }} onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '12px 16px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 32, height: 32, borderRadius: '50%', background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#18181B', flexShrink: 0 }}>{initials(u.name)}</div><span style={{ fontSize: 13, fontWeight: 500, color: '#09090B' }}>{u.name}</span></div></td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#71717A' }}>{u.email}</td>
                    <td style={{ padding: '12px 16px' }}>
                      {u.accessProfile
                        ? <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: '#F5F3FF', color: '#7C3AED' }}>{u.accessProfile.name}</span>
                        : <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: roleCfg(u.role).bg, color: roleCfg(u.role).color }}>{roleLabel(u.role)}</span>
                      }
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {isPro ? <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#DCFCE7', color: '#16A34A' }}>Sim</span>
                             : <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#F4F4F5', color: '#A1A1AA' }}>Não</span>}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {!isPro ? <span style={{ fontSize: 11, color: '#A1A1AA' }}>—</span>
                        : inAgenda ? <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#DCFCE7', color: '#16A34A' }}>Sim</span>
                                   : <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#FEF2F2', color: '#DC2626' }}>Oculto</span>}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button onClick={() => openEdit(u)} style={{ width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => (e.currentTarget.style.background = '#F4F4F5')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}><i className="ti ti-pencil" style={{ fontSize: 13, color: '#71717A' }} /></button>
                        <button onClick={() => setDeleteConfirm(u.id)} style={{ width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => (e.currentTarget.style.background = '#FEF2F2')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}><i className="ti ti-trash" style={{ fontSize: 13, color: '#EF4444' }} /></button>
                        {deleteConfirm === u.id && <div style={{ display: 'flex', gap: 4 }}><button onClick={() => removeMut.mutate(u.id)} style={{ height: 26, padding: '0 10px', background: '#DC2626', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Confirmar</button><button onClick={() => setDeleteConfirm(null)} style={{ height: 26, padding: '0 8px', background: 'none', border: '1px solid #E4E4E7', borderRadius: 6, fontSize: 11, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button></div>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(users as any[]).length === 0 && <tr><td colSpan={6} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: '#A1A1AA' }}>Nenhum usuário.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {showForm && (
        <>
          <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 9000, backdropFilter: 'blur(2px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 440, background: '#fff', borderRadius: 14, zIndex: 9001, boxShadow: '0 20px 60px rgba(0,0,0,.15)', fontFamily: "'Inter', system-ui, sans-serif" }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{editItem ? 'Editar usuário' : 'Novo usuário'}</div>
              <button onClick={() => setShowForm(false)} style={{ width: 26, height: 26, border: 'none', background: '#F4F4F5', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="ti ti-x" style={{ fontSize: 12, color: '#71717A' }} /></button>
            </div>
            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={lblStyle}>Nome *</label><input value={fName} onChange={e => setFName(e.target.value)} placeholder="Nome completo" style={inpStyle} /></div>
              {!editItem && <div><label style={lblStyle}>E-mail *</label><input type="email" value={fEmail} onChange={e => setFEmail(e.target.value)} placeholder="email@clinica.com.br" style={inpStyle} /></div>}
              {!editItem && <div><label style={lblStyle}>Senha *</label><input type="password" value={fPass} onChange={e => setFPass(e.target.value)} placeholder="Mínimo 6 caracteres" style={inpStyle} /></div>}
              <div><label style={lblStyle}>Função (sistema)</label><select value={fRole} onChange={e => setFRole(e.target.value)} style={{ ...inpStyle, cursor: 'pointer' }}>{USER_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
              <div>
                <label style={lblStyle}>Perfil de acesso</label>
                <select value={fProfileId} onChange={e => setFProfileId(e.target.value)} style={{ ...inpStyle, cursor: 'pointer' }}>
                  <option value="">— Sem perfil vinculado —</option>
                  {(profiles as any[]).filter((p: any) => p.active).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {!fProfileId && <div style={{ fontSize: 11, color: '#D97706', marginTop: 4 }}>Sem perfil: o usuário não terá acesso ao sistema.</div>}
              </div>
              {editItem && (
                <div style={{ background: '#F9F9F9', border: '1px solid #E4E4E7', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.06em' }}>Configurações de agenda</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#09090B' }}>É profissional de atendimento?</div>
                      <div style={{ fontSize: 12, color: '#71717A', marginTop: 1 }}>Aparece como opção de profissional na agenda</div>
                    </div>
                    <Toggle on={fIsProfessional} onChange={() => setFIsProfessional(v => !v)} />
                  </div>
                  {fIsProfessional && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#09090B' }}>Aparece na agenda?</div>
                        <div style={{ fontSize: 12, color: '#71717A', marginTop: 1 }}>Exibir coluna deste profissional na agenda</div>
                      </div>
                      <Toggle on={fShowInAgenda} onChange={() => setFShowInAgenda(v => !v)} />
                    </div>
                  )}
                </div>
              )}
              {fErr && <div style={{ fontSize: 12, color: '#DC2626', padding: '8px 10px', background: '#FEF2F2', borderRadius: 7 }}>{fErr}</div>}
            </div>
            <div style={{ padding: '12px 22px', borderTop: '1px solid #E4E4E7', display: 'flex', gap: 8, background: '#FAFAFA' }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, height: 38, border: '1px solid #E4E4E7', background: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending} style={{ flex: 2, height: 38, background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>{editItem ? 'Salvar' : 'Criar usuário'}</button>
            </div>
          </div>
        </>
      )}
    </SubView>
  );
}

// ─── Agenda: Status ──────────────────────────────────────────────────────────
const AGENDA_STATUS_LS = 'pcl_agenda_status_config';
const DEFAULT_STATUSES = [
  { key: 'agendado',    label: 'Agendado',       color: '#71717A', bg: '#F4F4F5', active: true },
  { key: 'confirmado',  label: 'Confirmado',      color: '#16A34A', bg: '#DCFCE7', active: true },
  { key: 'aguardando',  label: 'Aguardando',      color: '#D97706', bg: '#FFFBEB', active: true },
  { key: 'chegou',      label: 'Chegou',          color: '#2563EB', bg: '#EFF6FF', active: true },
  { key: 'atendimento', label: 'Em atendimento',  color: '#7C3AED', bg: '#F5F3FF', active: true },
  { key: 'finalizado',  label: 'Finalizado',      color: '#0D9488', bg: '#F0FDFA', active: true },
  { key: 'faltou',      label: 'Faltou',          color: '#DC2626', bg: '#FEF2F2', active: true },
  { key: 'cancelado',   label: 'Cancelado',       color: '#991B1B', bg: '#FEF2F2', active: true },
  { key: 'reagendado',  label: 'Reagendado',      color: '#C2410C', bg: '#FFF7ED', active: true },
  { key: 'bloqueado',   label: 'Bloqueado',       color: '#374151', bg: '#F1F5F9', active: true },
];
type AStatus = typeof DEFAULT_STATUSES[0];
function loadStatuses(): AStatus[] { try { const r = localStorage.getItem(AGENDA_STATUS_LS); if (r) return JSON.parse(r); } catch {} return DEFAULT_STATUSES; }

function AgendaStatusView({ onBack, mc }: { onBack: () => void; mc: ModInfo }) {
  const [statuses, setStatuses] = useState<AStatus[]>(loadStatuses);
  const [saved, setSaved] = useState(false);
  function handleSave() { localStorage.setItem(AGENDA_STATUS_LS, JSON.stringify(statuses)); setSaved(true); setTimeout(() => setSaved(false), 2500); }
  const toggle = (key: string) => setStatuses(s => s.map(x => x.key === key ? { ...x, active: !x.active } : x));
  const rename = (key: string, label: string) => setStatuses(s => s.map(x => x.key === key ? { ...x, label } : x));
  return (
    <SubView title="Status da agenda" desc="Configure os status disponíveis para agendamentos." icon="ti-circle-dot" iconBg={mc.bg} iconColor={mc.color} parentLabel="Agenda" onBack={onBack}
      actions={<button onClick={handleSave} style={{ height: 36, padding: '0 16px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>{saved ? <><i className="ti ti-check" style={{ fontSize: 14 }} /> Salvo!</> : 'Salvar alterações'}</button>}>
      <div style={{ background: '#fff', border: '1px solid #E4E4E7', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#F4F4F5', borderBottom: '1px solid #E4E4E7' }}>{['Chave', 'Prévia', 'Nome exibido', 'Ativo'].map((h, i) => <th key={h} style={{ padding: '9px 16px', textAlign: i === 3 ? 'center' : 'left', fontSize: 11, fontWeight: 600, color: '#71717A', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>)}</tr></thead>
          <tbody>
            {statuses.map(s => (
              <tr key={s.key} style={{ borderBottom: '1px solid #F4F4F5' }} onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '12px 16px', fontSize: 12, color: '#71717A', fontFamily: 'monospace' }}>{s.key}</td>
                <td style={{ padding: '12px 16px' }}><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: s.bg, color: s.color }}>{s.label}</span></td>
                <td style={{ padding: '12px 16px' }}><input value={s.label} onChange={e => rename(s.key, e.target.value)} style={{ height: 32, padding: '0 10px', border: '1px solid #E4E4E7', borderRadius: 6, fontSize: 13, color: '#09090B', background: '#fff', fontFamily: 'inherit', outline: 'none', width: 180 }} /></td>
                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <button onClick={() => toggle(s.key)} style={{ width: 36, height: 20, borderRadius: 99, cursor: 'pointer', background: s.active ? '#000' : '#E4E4E7', border: 'none', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 3, left: s.active ? 19 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.18s' }} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SubView>
  );
}

// ─── Agenda: Feriados ────────────────────────────────────────────────────────
const HOLIDAYS_2026 = [
  { date: '01/01', name: 'Confraternização Universal',        type: 'Nacional' },
  { date: '16/02', name: 'Carnaval (segunda-feira)',          type: 'Nacional' },
  { date: '17/02', name: 'Carnaval (terça-feira)',            type: 'Nacional' },
  { date: '18/02', name: 'Quarta de cinzas (facultativo)',    type: 'Facultativo' },
  { date: '03/04', name: 'Paixão de Cristo',                  type: 'Nacional' },
  { date: '05/04', name: 'Páscoa',                            type: 'Nacional' },
  { date: '21/04', name: 'Tiradentes',                        type: 'Nacional' },
  { date: '01/05', name: 'Dia do Trabalho',                   type: 'Nacional' },
  { date: '04/06', name: 'Corpus Christi (facultativo)',      type: 'Facultativo' },
  { date: '07/09', name: 'Independência do Brasil',           type: 'Nacional' },
  { date: '12/10', name: 'Nossa Sra. Aparecida',              type: 'Nacional' },
  { date: '02/11', name: 'Finados',                           type: 'Nacional' },
  { date: '15/11', name: 'Proclamação da República',          type: 'Nacional' },
  { date: '20/11', name: 'Dia da Consciência Negra',          type: 'Nacional' },
  { date: '24/12', name: 'Véspera de Natal (facultativo)',    type: 'Facultativo' },
  { date: '25/12', name: 'Natal',                             type: 'Nacional' },
  { date: '31/12', name: 'Véspera de Ano Novo (facultativo)', type: 'Facultativo' },
];
function HolidaysView({ onBack, mc }: { onBack: () => void; mc: ModInfo }) {
  return (
    <SubView title="Feriados nacionais" desc="Calendário de feriados e pontos facultativos para 2026." icon="ti-calendar-event" iconBg={mc.bg} iconColor={mc.color} parentLabel="Agenda" onBack={onBack}>
      <div style={{ background: '#fff', border: '1px solid #E4E4E7', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#F4F4F5', borderBottom: '1px solid #E4E4E7' }}>{['Data', 'Feriado', 'Tipo'].map(h => <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#71717A', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>)}</tr></thead>
          <tbody>
            {HOLIDAYS_2026.map((h, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #F4F4F5' }} onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#09090B', whiteSpace: 'nowrap' }}>{h.date}/2026</td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: '#09090B' }}>{h.name}</td>
                <td style={{ padding: '12px 16px' }}><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: h.type === 'Nacional' ? '#DCFCE7' : '#FFFBEB', color: h.type === 'Nacional' ? '#16A34A' : '#D97706' }}>{h.type}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SubView>
  );
}

// ─── Contatos: Tipos ─────────────────────────────────────────────────────────
const CTYPES_LS = 'pcl_contact_types';
const DEFAULT_CTYPES = [
  { id: 'ct_1', name: 'Paciente',    icon: 'ti-user-heart',    color: '#16A34A', active: true },
  { id: 'ct_2', name: 'Prospect',   icon: 'ti-user-question', color: '#2563EB', active: true },
  { id: 'ct_3', name: 'Fornecedor', icon: 'ti-truck',         color: '#D97706', active: true },
  { id: 'ct_4', name: 'Parceiro',   icon: 'ti-handshake',     color: '#7C3AED', active: true },
];
type CType = typeof DEFAULT_CTYPES[0];
function loadCTypes(): CType[] { try { const r = localStorage.getItem(CTYPES_LS); if (r) return JSON.parse(r); } catch {} return DEFAULT_CTYPES; }
function saveCTypes(d: CType[]) { try { localStorage.setItem(CTYPES_LS, JSON.stringify(d)); } catch {} }

function ContactTypesView({ onBack, mc }: { onBack: () => void; mc: ModInfo }) {
  const [types, setTypes] = useState<CType[]>(loadCTypes);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<CType | null>(null);
  const [fName, setFName] = useState(''); const [fErr, setFErr] = useState('');
  function openNew()  { setEditItem(null); setFName(''); setFErr(''); setShowForm(true); }
  function openEdit(c: CType) { setEditItem(c); setFName(c.name); setFErr(''); setShowForm(true); }
  function handleSave() {
    if (!fName.trim()) { setFErr('Informe o nome.'); return; }
    const upd = editItem ? types.map(t => t.id === editItem.id ? { ...t, name: fName.trim() } : t) : [...types, { id: `ct_${Date.now()}`, name: fName.trim(), icon: 'ti-user', color: '#71717A', active: true }];
    setTypes(upd); saveCTypes(upd); setShowForm(false);
  }
  function handleDelete(id: string) { const u = types.filter(t => t.id !== id); setTypes(u); saveCTypes(u); }
  function toggleActive(id: string) { const u = types.map(t => t.id === id ? { ...t, active: !t.active } : t); setTypes(u); saveCTypes(u); }
  return (
    <SubView title="Tipos de contatos" desc="Categorias para classificar e organizar contatos no sistema." icon="ti-tags" iconBg={mc.bg} iconColor={mc.color} parentLabel="Contatos" onBack={onBack}
      actions={<button onClick={openNew} style={{ height: 36, padding: '0 16px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}><i className="ti ti-plus" style={{ fontSize: 14 }} /> Novo tipo</button>}>
      <div style={{ background: '#fff', border: '1px solid #E4E4E7', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#F4F4F5', borderBottom: '1px solid #E4E4E7' }}>{['Tipo', 'Status', 'Ações'].map((h, i) => <th key={h} style={{ padding: '9px 16px', textAlign: i === 2 ? 'right' : 'left', fontSize: 11, fontWeight: 600, color: '#71717A', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>)}</tr></thead>
          <tbody>
            {types.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid #F4F4F5' }} onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '12px 16px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 32, height: 32, borderRadius: 8, background: `${t.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className={`ti ${t.icon}`} style={{ fontSize: 15, color: t.color }} /></div><span style={{ fontSize: 13, fontWeight: 500, color: '#09090B' }}>{t.name}</span></div></td>
                <td style={{ padding: '12px 16px' }}><button onClick={() => toggleActive(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: t.active ? '#DCFCE7' : '#F4F4F5', color: t.active ? '#16A34A' : '#71717A' }}>{t.active ? 'Ativo' : 'Inativo'}</span></button></td>
                <td style={{ padding: '12px 16px', textAlign: 'right' }}><div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}><button onClick={() => openEdit(t)} style={{ width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => (e.currentTarget.style.background = '#F4F4F5')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}><i className="ti ti-pencil" style={{ fontSize: 13, color: '#71717A' }} /></button><button onClick={() => handleDelete(t.id)} style={{ width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => (e.currentTarget.style.background = '#FEF2F2')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}><i className="ti ti-trash" style={{ fontSize: 13, color: '#EF4444' }} /></button></div></td>
              </tr>
            ))}
            {types.length === 0 && <tr><td colSpan={3} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: '#A1A1AA' }}>Nenhum tipo.</td></tr>}
          </tbody>
        </table>
      </div>
      {showForm && (
        <>
          <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 9000, backdropFilter: 'blur(2px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 380, background: '#fff', borderRadius: 14, zIndex: 9001, boxShadow: '0 20px 60px rgba(0,0,0,.15)', fontFamily: "'Inter', system-ui, sans-serif" }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><div style={{ fontSize: 15, fontWeight: 700 }}>{editItem ? 'Editar tipo' : 'Novo tipo'}</div><button onClick={() => setShowForm(false)} style={{ width: 26, height: 26, border: 'none', background: '#F4F4F5', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="ti ti-x" style={{ fontSize: 12, color: '#71717A' }} /></button></div>
            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={lblStyle}>Nome *</label><input value={fName} onChange={e => setFName(e.target.value)} placeholder="Ex: Paciente, Prospect..." style={inpStyle} /></div>
              {fErr && <div style={{ fontSize: 12, color: '#DC2626', padding: '8px 10px', background: '#FEF2F2', borderRadius: 7 }}>{fErr}</div>}
            </div>
            <div style={{ padding: '12px 22px', borderTop: '1px solid #E4E4E7', display: 'flex', gap: 8, background: '#FAFAFA' }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, height: 38, border: '1px solid #E4E4E7', background: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={handleSave} style={{ flex: 2, height: 38, background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>{editItem ? 'Salvar' : 'Criar'}</button>
            </div>
          </div>
        </>
      )}
    </SubView>
  );
}

// ─── Financeiro: Formas de pagamento ─────────────────────────────────────────
const PAYMENT_TYPES = [
  { value: 'dinheiro',          label: 'Dinheiro',             icon: 'ti-cash' },
  { value: 'cartao_credito',    label: 'Cartão de crédito',    icon: 'ti-credit-card' },
  { value: 'cartao_debito',     label: 'Cartão de débito',     icon: 'ti-credit-card' },
  { value: 'pix',               label: 'PIX',                  icon: 'ti-qrcode' },
  { value: 'transferencia',     label: 'Transferência',        icon: 'ti-building-bank' },
  { value: 'convenio',          label: 'Convênio',             icon: 'ti-heart-handshake' },
  { value: 'outro',             label: 'Outro',                icon: 'ti-dots' },
];

function PaymentMethodsView({ onBack, mc }: { onBack: () => void; mc: ModInfo }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [fName, setFName] = useState(''); const [fType, setFType] = useState('dinheiro'); const [fErr, setFErr] = useState('');
  const { data: methods = [], isLoading } = useQuery({ queryKey: ['payment-methods'], queryFn: financialApi.paymentMethods });
  const createMut = useMutation({ mutationFn: (d: any) => financialApi.createPaymentMethod(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['payment-methods'] }); setShowForm(false); }, onError: (e: any) => { const r = e?.response?.data?.message; setFErr(Array.isArray(r) ? r.join(' · ') : (r || 'Erro.')); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => financialApi.updatePaymentMethod(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['payment-methods'] }); setShowForm(false); }, onError: (e: any) => { const r = e?.response?.data?.message; setFErr(Array.isArray(r) ? r.join(' · ') : (r || 'Erro.')); } });
  const deleteMut = useMutation({ mutationFn: (id: string) => financialApi.deletePaymentMethod(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['payment-methods'] }); setDeleteConfirm(null); } });
  function openNew()  { setEditItem(null); setFName(''); setFType('dinheiro'); setFErr(''); setShowForm(true); }
  function openEdit(m: any) { setEditItem(m); setFName(m.name || ''); setFType(m.type || 'dinheiro'); setFErr(''); setShowForm(true); }
  function handleSave() {
    if (!fName.trim()) { setFErr('Informe o nome.'); return; }
    if (editItem) updateMut.mutate({ id: editItem.id, data: { name: fName.trim(), type: fType } });
    else createMut.mutate({ name: fName.trim(), type: fType, active: true });
  }
  const typeLabel = (v: string) => PAYMENT_TYPES.find(p => p.value === v)?.label || v;
  return (
    <SubView title="Formas de pagamento" desc="Configure os meios de pagamento aceitos pela clínica." icon="ti-credit-card" iconBg={mc.bg} iconColor={mc.color} parentLabel="Financeiro" onBack={onBack}
      actions={<button onClick={openNew} style={{ height: 36, padding: '0 16px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}><i className="ti ti-plus" style={{ fontSize: 14 }} /> Nova forma</button>}>
      <div style={{ background: '#fff', border: '1px solid #E4E4E7', borderRadius: 12, overflow: 'hidden' }}>
        {isLoading ? <div style={{ padding: 32, textAlign: 'center', color: '#71717A', fontSize: 13 }}>Carregando...</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#F4F4F5', borderBottom: '1px solid #E4E4E7' }}>{['Forma de pagamento', 'Tipo', 'Ações'].map((h, i) => <th key={h} style={{ padding: '9px 16px', textAlign: i === 2 ? 'right' : 'left', fontSize: 11, fontWeight: 600, color: '#71717A', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>)}</tr></thead>
            <tbody>
              {(methods as any[]).map((m: any) => (
                <tr key={m.id} style={{ borderBottom: '1px solid #F4F4F5' }} onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: '#09090B' }}>{m.name}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#71717A' }}>{typeLabel(m.type)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                      <button onClick={() => openEdit(m)} style={{ width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => (e.currentTarget.style.background = '#F4F4F5')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}><i className="ti ti-pencil" style={{ fontSize: 13, color: '#71717A' }} /></button>
                      <button onClick={() => setDeleteConfirm(m.id)} style={{ width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => (e.currentTarget.style.background = '#FEF2F2')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}><i className="ti ti-trash" style={{ fontSize: 13, color: '#EF4444' }} /></button>
                      {deleteConfirm === m.id && <div style={{ display: 'flex', gap: 4 }}><button onClick={() => deleteMut.mutate(m.id)} style={{ height: 26, padding: '0 10px', background: '#DC2626', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Confirmar</button><button onClick={() => setDeleteConfirm(null)} style={{ height: 26, padding: '0 8px', background: 'none', border: '1px solid #E4E4E7', borderRadius: 6, fontSize: 11, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button></div>}
                    </div>
                  </td>
                </tr>
              ))}
              {(methods as any[]).length === 0 && <tr><td colSpan={3} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: '#A1A1AA' }}>Nenhuma forma de pagamento cadastrada.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {showForm && (
        <>
          <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 9000, backdropFilter: 'blur(2px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 420, background: '#fff', borderRadius: 14, zIndex: 9001, boxShadow: '0 20px 60px rgba(0,0,0,.15)', fontFamily: "'Inter', system-ui, sans-serif" }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><div style={{ fontSize: 15, fontWeight: 700 }}>{editItem ? 'Editar forma' : 'Nova forma de pagamento'}</div><button onClick={() => setShowForm(false)} style={{ width: 26, height: 26, border: 'none', background: '#F4F4F5', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="ti ti-x" style={{ fontSize: 12, color: '#71717A' }} /></button></div>
            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={lblStyle}>Nome *</label><input value={fName} onChange={e => setFName(e.target.value)} placeholder="Ex: PIX, Cartão Visa..." style={inpStyle} /></div>
              <div><label style={lblStyle}>Tipo</label><select value={fType} onChange={e => setFType(e.target.value)} style={{ ...inpStyle, cursor: 'pointer' }}>{PAYMENT_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
              {fErr && <div style={{ fontSize: 12, color: '#DC2626', padding: '8px 10px', background: '#FEF2F2', borderRadius: 7 }}>{fErr}</div>}
            </div>
            <div style={{ padding: '12px 22px', borderTop: '1px solid #E4E4E7', display: 'flex', gap: 8, background: '#FAFAFA' }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, height: 38, border: '1px solid #E4E4E7', background: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending} style={{ flex: 2, height: 38, background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>{editItem ? 'Salvar' : 'Criar'}</button>
            </div>
          </div>
        </>
      )}
    </SubView>
  );
}

// ─── Main SettingsPage ────────────────────────────────────────────────────────
export function SettingsPage() {
  const [activeNav,   setActiveNav]   = useState('overview');
  const [openSubItem, setOpenSubItem] = useState<string | null>(null);

  const goTo = (key: string) => { setActiveNav(key); setOpenSubItem(null); };

  const mc = MODULE_STATUS.find(m => m.key === activeNav) || MODULE_STATUS[0];
  const parentLabel = NAV_ITEMS.find(n => n.key === activeNav)?.label || '';

  const renderContent = () => {
    if (activeNav === 'overview') return <OverviewSection goTo={goTo} />;
    if (activeNav === 'procedures') return <ProceduresPage />;
    if (activeNav === 'sessions') return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 360, animation: 'fadeUp 0.2s ease' }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: mc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}><i className={`ti ${mc.icon}`} style={{ fontSize: 28, color: mc.color }} /></div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#191C1D', marginBottom: 6 }}>Sessões</div>
        <div style={{ fontSize: 13, color: '#71717A', maxWidth: 340, textAlign: 'center', lineHeight: 1.6, marginBottom: 20 }}>Este módulo está em desenvolvimento. As configurações de sessões estarão disponíveis em breve.</div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 14px', borderRadius: 99, background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }}>Em breve</span>
      </div>
    );
    if (activeNav === 'personalization' && !openSubItem) return <PersonalizationView />;

    if (openSubItem) {
      switch (openSubItem) {
        case 'clinic-info':         return <ClinicInfoView onBack={() => setOpenSubItem(null)} mc={mc} />;
        case 'clinic-schedule':     return <ClinicScheduleView onBack={() => setOpenSubItem(null)} mc={mc} />;
        case 'clinic-header':       return <ClinicHeaderView onBack={() => setOpenSubItem(null)} mc={mc} />;
        case 'clinic-rooms':        return <RoomsView onBack={() => setOpenSubItem(null)} mc={mc} />;
        case 'users-list':          return <UsersView onBack={() => setOpenSubItem(null)} mc={mc} />;
        case 'users-profiles':      return <AccessProfilesView onBack={() => setOpenSubItem(null)} mc={mc} />;
        case 'agenda-status':       return <AgendaStatusView onBack={() => setOpenSubItem(null)} mc={mc} />;
        case 'agenda-holidays':     return <HolidaysView onBack={() => setOpenSubItem(null)} mc={mc} />;
        case 'contatos-types':      return <ContactTypesView onBack={() => setOpenSubItem(null)} mc={mc} />;
        case 'modelos-documentos':  return <DocTemplatesView onBack={() => setOpenSubItem(null)} parentLabel={parentLabel} title="Modelos de evolução" subtitle="Templates de evolução clínica para inserção no prontuário." mc={mc} />;
        case 'modelos-receituario': return <DocTemplatesView onBack={() => setOpenSubItem(null)} parentLabel={parentLabel} title="Modelos de receituário" subtitle="Templates para receitas e prescrições médicas." mc={mc} lockType="Prescrição" />;
        case 'prontuario-types':    return <PlaceholderSubView onBack={() => setOpenSubItem(null)} parentLabel={parentLabel} title="Tipos de registros" mc={mc} />;
        case 'dre-contas':          return <DreAccountsView onBack={() => setOpenSubItem(null)} />;
        case 'payment-methods':     return <PaymentMethodsView onBack={() => setOpenSubItem(null)} mc={mc} />;
        case 'receipt-models':      return <PlaceholderSubView onBack={() => setOpenSubItem(null)} parentLabel={parentLabel} title="Modelos de recibo" mc={mc} />;
        default: return null;
      }
    }

    // Module card grid
    const items = MODULE_DETAIL[activeNav] || [];
    return (
      <div style={{ animation: 'fadeUp 0.2s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: mc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className={`ti ${mc.icon}`} style={{ fontSize: 24, color: mc.color }} />
          </div>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#191C1D', margin: 0 }}>{mc.label}</h2>
            <p style={{ fontSize: 13, color: '#71717A', margin: '2px 0 0' }}>{mc.detail}</p>
          </div>
        </div>
        {items.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {items.map((item, i) => (
              <div key={i} onClick={() => setOpenSubItem(item.subKey)}
                style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: '18px 20px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,.04)', display: 'flex', flexDirection: 'column', gap: 10, position: 'relative', overflow: 'hidden', transition: 'box-shadow .15s, border-color .15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,.08)'; (e.currentTarget as HTMLElement).style.borderColor = '#D4D4D8'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,.04)'; (e.currentTarget as HTMLElement).style.borderColor = '#E5E7EB'; }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: mc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className={`ti ${item.icon}`} style={{ fontSize: 18, color: mc.color }} /></div>
                  <i className="ti ti-arrow-right" style={{ fontSize: 14, color: '#D1D5DB' }} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#191C1D', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: '#71717A', lineHeight: 1.5 }}>{item.desc}</div>
                </div>
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: mc.color, opacity: 0.2, borderRadius: '0 0 12px 12px' }} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 280 }}>
            <div style={{ fontSize: 13, color: '#71717A' }}>Sem sub-seções disponíveis.</div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes slideInRight { from { opacity:0; transform:translateX(32px); } to { opacity:1; transform:translateX(0); } }
        @keyframes slideIn { from { opacity:0; transform:translateX(30px); } to { opacity:1; transform:translateX(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .s-nav-item:hover { background: #F4F4F5 !important; }
        .rte-btn { width: 28px; height: 28px; border: none; background: transparent; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #374151; }
        .rte-btn:hover { background: #E4E4E7; }
        [contenteditable]:empty:before { content: attr(data-placeholder); color: #A1A1AA; pointer-events: none; }
      `}</style>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F8F9FA', fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ flexShrink: 0, background: '#fff', borderBottom: '1px solid #E5E7EB', padding: '18px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#191C1D', margin: 0 }}>Configurações</h1>
            <p style={{ fontSize: 12, color: '#71717A', margin: '2px 0 0' }}>Gerencie todas as configurações do sistema e personalize sua clínica.</p>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
          {/* Left nav */}
          <div style={{ width: 228, flexShrink: 0, background: '#fff', borderRight: '1px solid #E5E7EB', overflowY: 'auto', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
            {NAV_ITEMS.map(item => {
              const active = activeNav === item.key;
              return (
                <button key={item.key} onClick={() => goTo(item.key)} className="s-nav-item"
                  style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%', background: active ? '#F0F0FF' : 'transparent', transition: 'background 0.12s' }}>
                  <i className={`ti ${item.icon}`} style={{ fontSize: 15, color: active ? '#4F46E5' : '#71717A', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? '#191C1D' : '#374151', lineHeight: 1.3 }}>{item.label}</span>
                  {active && <div style={{ marginLeft: 'auto', width: 4, height: 4, borderRadius: '50%', background: '#4F46E5', flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
          {/* Content */}
          <div style={{ flex: 1, minWidth: 0, overflowY: activeNav === 'procedures' ? 'hidden' : 'auto', display: activeNav === 'procedures' ? 'flex' : 'block', flexDirection: activeNav === 'procedures' ? 'column' : undefined, padding: activeNav === 'procedures' ? 0 : '28px 32px' }}>
            {renderContent()}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Overview Section ─────────────────────────────────────────────────────────
function OverviewSection({ goTo }: { goTo: (key: string) => void }) {
  const configured    = MODULE_STATUS.filter(m => m.status === 'configurado').length;
  const partial       = MODULE_STATUS.filter(m => m.status === 'parcial').length;
  const pending       = MODULE_STATUS.filter(m => m.status === 'pendente').length;
  const notConfigured = MODULE_STATUS.filter(m => m.status === 'nao_configurado').length;
  const total         = MODULE_STATUS.length;
  const pctOk         = Math.round((configured    / total) * 100);
  const pctPartial    = Math.round((partial        / total) * 100);
  const pctPending    = Math.round((pending        / total) * 100);
  const pctNone       = Math.round((notConfigured  / total) * 100);
  return (
    <div style={{ animation: 'fadeUp 0.2s ease' }}>
      <div style={{ background: 'linear-gradient(135deg, #F8F7FF 0%, #EEF2FF 50%, #F0F9FF 100%)', border: '1px solid #E0E7FF', borderRadius: 16, padding: '22px 28px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(79,70,229,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid rgba(79,70,229,.15)' }}>
          <i className="ti ti-adjustments-horizontal" style={{ fontSize: 24, color: '#4F46E5' }} />
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#191C1D', marginBottom: 2 }}>Central de configurações</div>
          <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5 }}>Organize usuários, agenda, atendimentos, financeiro e regras gerais do sistema.</div>
        </div>
      </div>
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#191C1D', marginBottom: 14 }}>Resumo das configurações</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}><span style={{ fontSize: 12, color: '#71717A' }}>{configured} de {total} módulos configurados</span><span style={{ fontSize: 13, fontWeight: 700, color: '#191C1D' }}>{pctOk}%</span></div>
        <div style={{ display: 'flex', borderRadius: 99, overflow: 'hidden', height: 8, background: '#F4F4F5', gap: 1, marginBottom: 14 }}>
          <div style={{ flex: pctOk, background: '#22C55E' }} /><div style={{ flex: pctPartial, background: '#60A5FA' }} /><div style={{ flex: pctPending, background: '#F59E0B' }} /><div style={{ flex: pctNone, background: '#E5E7EB' }} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {[{ color: '#16A34A', bg: '#F0FDF4', label: 'Configurado', count: configured, icon: 'ti-circle-check' }, { color: '#2563EB', bg: '#EFF6FF', label: 'Parcial', count: partial, icon: 'ti-adjustments' }, { color: '#D97706', bg: '#FFFBEB', label: 'Pendente', count: pending, icon: 'ti-alert-triangle' }, { color: '#71717A', bg: '#F4F4F5', label: 'Não configurado', count: notConfigured, icon: 'ti-circle-dashed' }].map(s => (
            <div key={s.label} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, background: s.bg }}>
              <i className={`ti ${s.icon}`} style={{ fontSize: 18, color: s.color, flexShrink: 0 }} />
              <div><div style={{ fontSize: 18, fontWeight: 700, color: '#191C1D', lineHeight: 1 }}>{s.count}</div><div style={{ fontSize: 11, color: s.color, fontWeight: 600, marginTop: 1 }}>{s.label}</div></div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#191C1D' }}>Status dos módulos</div>
          <span style={{ fontSize: 11, color: '#71717A' }}>{total} módulos</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>{['Módulo', 'Status', 'Pendências', 'Atualização', 'Ação'].map((h, i) => <th key={h} style={{ padding: '9px 16px', textAlign: i === 4 ? 'center' : 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>)}</tr></thead>
          <tbody>
            {MODULE_STATUS.map(mod => {
              const sc = STATUS_CFG[mod.status];
              return (
                <tr key={mod.key} style={{ borderBottom: '1px solid #F1F5F9' }} onMouseEnter={e => { Array.from(e.currentTarget.cells).forEach(c => (c.style.background = '#F9FAFB')); }} onMouseLeave={e => { Array.from(e.currentTarget.cells).forEach(c => (c.style.background = 'transparent')); }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: mod.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><i className={`ti ${mod.icon}`} style={{ fontSize: 15, color: mod.color }} /></div>
                      <div><div style={{ fontSize: 13, fontWeight: 600, color: '#191C1D' }}>{mod.label}</div><div style={{ fontSize: 11, color: '#71717A', marginTop: 1 }}>{mod.detail}</div></div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}><span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: sc.bg, color: sc.color, display: 'inline-flex', alignItems: 'center', gap: 5 }}><i className={`ti ${sc.icon}`} style={{ fontSize: 11 }} />{sc.label}</span></td>
                  <td style={{ padding: '12px 16px' }}>{mod.pending.length > 0 ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{mod.pending.map(p => <span key={p} style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 6, background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }}>{p}</span>)}</div> : <span style={{ fontSize: 12, color: '#9CA3AF' }}>—</span>}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#71717A', whiteSpace: 'nowrap' }}>{mod.lastUpdate}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}><button onClick={() => goTo(mod.key)} style={{ height: 28, padding: '0 12px', background: '#F4F4F5', border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 500, color: '#374151', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }} onMouseEnter={e => (e.currentTarget.style.background = '#E4E4E7')} onMouseLeave={e => (e.currentTarget.style.background = '#F4F4F5')}>Configurar <i className="ti ti-arrow-right" style={{ fontSize: 10 }} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Personalização ───────────────────────────────────────────────────────────
function PersonalizationView() {
  const [logo,  setLogo]  = useState(() => localStorage.getItem('pcl_logo') || '');
  const [color, setColor] = useState(() => localStorage.getItem('pcl_primary_color') || '#000000');
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogo(reader.result as string);
    reader.readAsDataURL(file);
  }
  function handleSave() {
    if (logo) localStorage.setItem('pcl_logo', logo);
    else localStorage.removeItem('pcl_logo');
    localStorage.setItem('pcl_primary_color', color);
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div style={{ animation: 'fadeUp 0.2s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#FDF2F8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className="ti ti-palette" style={{ fontSize: 20, color: '#BE185D' }} />
        </div>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#191C1D', margin: 0 }}>Personalização</h2>
          <p style={{ fontSize: 12, color: '#71717A', margin: '2px 0 0' }}>Customize a identidade visual do sistema.</p>
        </div>
        <button onClick={handleSave} style={{ marginLeft: 'auto', height: 36, padding: '0 16px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
          {saved ? <><i className="ti ti-check" style={{ fontSize: 14 }} /> Salvo!</> : 'Salvar alterações'}
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E4E4E7', padding: '20px 24px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#09090B', marginBottom: 4 }}>Logotipo</div>
          <p style={{ fontSize: 12, color: '#71717A', marginBottom: 16 }}>Exibido no topo de documentos gerados pelo sistema.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ width: 80, height: 80, borderRadius: 12, border: '2px dashed #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#FAFAFA', flexShrink: 0 }}>
              {logo ? <img src={logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <i className="ti ti-photo" style={{ fontSize: 28, color: '#D1D5DB' }} />}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
              <button onClick={() => fileRef.current?.click()} style={{ height: 34, padding: '0 14px', background: '#fff', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}><i className="ti ti-upload" style={{ fontSize: 13 }} /> Carregar imagem</button>
              {logo && <button onClick={() => setLogo('')} style={{ height: 34, padding: '0 14px', background: 'transparent', border: 'none', fontSize: 13, color: '#EF4444', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>Remover logotipo</button>}
              <span style={{ fontSize: 11, color: '#A1A1AA' }}>PNG, JPG ou SVG · max 2MB</span>
            </div>
          </div>
        </div>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E4E4E7', padding: '20px 24px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#09090B', marginBottom: 4 }}>Cor principal</div>
          <p style={{ fontSize: 12, color: '#71717A', marginBottom: 16 }}>Cor utilizada em botões e destaques do sistema.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: 48, height: 48, borderRadius: 10, border: '1px solid #E4E4E7', cursor: 'pointer', padding: 2, background: '#fff' }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#09090B' }}>{color}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                {['#000000', '#1d4ed8', '#16a34a', '#dc2626', '#7c3aed', '#d97706'].map(c => (
                  <button key={c} onClick={() => setColor(c)} style={{ width: 22, height: 22, borderRadius: 6, background: c, border: color === c ? '2px solid #09090B' : '1px solid #E4E4E7', cursor: 'pointer', padding: 0 }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
