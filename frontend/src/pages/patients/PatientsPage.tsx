import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { patientsApi, contactTypesApi } from '../../services/api';
import { usePermissions } from '../../contexts/PermissionsContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TableActions } from '../../components/ui/TableActions';
import { useToast } from '../../components/ui/Toast';
import { Portal } from '../../components/ui/Portal';
import { SectionLoader } from '../../components/ui/Loader';
import { calcPatientScore, scoreBadge } from '../../utils/patientScore';
import { PatientImportModal } from '../../components/patients/PatientImportModal';

const STATUS_BADGE: Record<string, { bg: string; color: string; dot: string; label: string }> = {
  ATIVO:         { bg: '#DCFCE7', color: '#16A34A', dot: '#22C55E', label: 'Ativo' },
  INATIVO:       { bg: '#F4F4F5', color: '#71717A', dot: '#A1A1AA', label: 'Inativo' },
  EM_TRATAMENTO: { bg: '#EFF6FF', color: '#2563EB', dot: '#3B82F6', label: 'Em tratamento' },
  SEM_RETORNO:   { bg: '#EFF6FF', color: '#2563EB', dot: '#3B82F6', label: 'Sem retorno' },
  EM_RISCO:      { bg: '#FEF2F2', color: '#DC2626', dot: '#EF4444', label: 'Em risco' },
  NOVO:          { bg: '#DCFCE7', color: '#16A34A', dot: '#22C55E', label: 'Novo' },
};

const EMPTY_FORM = { name: '', contactTypeIds: [] as string[], email: '', phone: '', cpf: '', birthDate: '', gender: '', source: '', status: 'NOVO', notes: '' };

type FormErrors = { name?: string; contactTypeIds?: string; phone?: string; cpf?: string; birthDate?: string };

export function PatientsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { canView } = usePermissions();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: patients = [], isLoading } = useQuery({
    queryKey: ['patients', search, statusFilter],
    queryFn: () => patientsApi.list({ search, ...(statusFilter && { status: statusFilter }) }),
  });

  const { data: stats } = useQuery({ queryKey: ['patients-stats'], queryFn: patientsApi.stats });

  const onMutationSuccess = () => {
    qc.invalidateQueries({ queryKey: ['patients'] });
    qc.invalidateQueries({ queryKey: ['patients-stats'] });
    setDrawerOpen(false);
    setForm(EMPTY_FORM);
    setEditingId(null);
    setSaveError(null);
  };
  const onMutationError = (err: any) => {
    const msg = err?.response?.data?.message || 'Erro ao salvar contato. Tente novamente.';
    setSaveError(Array.isArray(msg) ? msg.join(', ') : msg);
  };

  const createMut = useMutation({
    mutationFn: (data: any) => patientsApi.create(data),
    onSuccess: onMutationSuccess,
    onError: onMutationError,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => patientsApi.update(id, data),
    onSuccess: onMutationSuccess,
    onError: onMutationError,
  });

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [inactivateConfirmId, setInactivateConfirmId] = useState<string | null>(null);

  const deleteMut = useMutation({
    mutationFn: (id: string) => patientsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.invalidateQueries({ queryKey: ['patients-stats'] });
      setDeleteConfirmId(null);
    },
  });

  const inactivateMut = useMutation({
    mutationFn: (id: string) => patientsApi.update(id, { status: 'INATIVO' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.invalidateQueries({ queryKey: ['patients-stats'] });
      setInactivateConfirmId(null);
      toast('Contato inativado com sucesso.', 'success');
    },
  });

  const isPending = createMut.isPending || updateMut.isPending;

  const { data: contactTypes = [] } = useQuery({
    queryKey: ['contact-types'],
    queryFn: () => contactTypesApi.list(),
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const toggleContactType = (id: string) => {
    setForm(f => ({
      ...f,
      contactTypeIds: f.contactTypeIds.includes(id)
        ? f.contactTypeIds.filter(x => x !== id)
        : [...f.contactTypeIds, id],
    }));
    setFormErrors(e => ({ ...e, contactTypeIds: undefined }));
  };

  const openDrawer = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setSaveError(null);
    setFormErrors({});
    setDrawerOpen(true);
  };

  const closeDrawer = () => { setDrawerOpen(false); setSaveError(null); setFormErrors({}); setEditingId(null); };

  const validate = (): boolean => {
    const errs: FormErrors = {};
    if (!form.name.trim())              errs.name           = 'Nome é obrigatório';
    if (form.contactTypeIds.length === 0) errs.contactTypeIds = 'Selecione ao menos um tipo';
    if (!form.phone.trim())             errs.phone          = 'Telefone é obrigatório';
    if (!form.cpf.trim())               errs.cpf            = 'CPF é obrigatório';
    if (!form.birthDate)                errs.birthDate      = 'Data de nascimento é obrigatória';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const buildPayload = () => {
    const { contactTypeIds, ...rest } = form;
    const payload: any = { contactTypeIds };
    for (const [k, v] of Object.entries(rest)) {
      if (v === '') continue;
      payload[k] = k === 'birthDate' ? new Date(v + 'T12:00:00').toISOString() : v;
    }
    return payload;
  };

  const handleSave = () => {
    if (!validate()) return;
    const payload = buildPayload();
    if (editingId) {
      updateMut.mutate({ id: editingId, data: payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const totalPages = Math.max(1, Math.ceil(patients.length / PAGE_SIZE));
  const pagedPatients = patients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const kpiCards = [
    { label: 'Total', value: stats?.total || 0, sub: 'cadastrados', icon: 'ti-users', iconBg: '#EFF6FF', iconColor: '#2563EB' },
    { label: 'Em tratamento', value: stats?.ativos || 0, sub: 'sessões ativas', icon: 'ti-activity', iconBg: '#F0FDF4', iconColor: '#16A34A' },
    { label: 'Novos (30d)', value: stats?.novos || 0, sub: 'este mês', icon: 'ti-user-plus', iconBg: '#F5F3FF', iconColor: '#7C3AED' },
    { label: 'Em risco', value: stats?.emRisco || 0, sub: 'precisam atenção', icon: 'ti-alert-triangle', iconBg: '#FEF2F2', iconColor: '#DC2626' },
  ];

  return (
    <>
      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
        .drawer-panel { animation: slideIn 0.28s cubic-bezier(0.32,0.72,0,1); }
        .drawer-overlay { animation: fadeIn 0.2s ease; }
        .inp {
          width: 100%; height: 38px; padding: 0 12px;
          border: 1px solid #E4E4E7; border-radius: 10px;
          font-size: 13px; color: #191C1D; background: #FFFFFF;
          outline: none; box-sizing: border-box; font-family: inherit;
          transition: border-color 0.15s;
        }
        .inp:focus { border-color: #000; }
        .lbl { display: block; font-size: 12px; font-weight: 500; color: #71717A; margin-bottom: 6px; }
      `}</style>

      <div style={{ padding: '24px 28px', fontFamily: "'Inter', system-ui, sans-serif" }}>
        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
          {kpiCards.map((k, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px', borderRadius: 20, border: '1px solid #EAECEF', background: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: k.iconBg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className={`ti ${k.icon}`} style={{ fontSize: 21, color: k.iconColor }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#71717A', fontWeight: 500, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.05em' }}>{k.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#09090B', lineHeight: 1.1 }}>{k.value}</div>
                <div style={{ fontSize: 11, color: '#71717A', marginTop: 2 }}>{k.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 99, padding: '0 14px', height: 38, width: 260, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <i className="ti ti-search" style={{ fontSize: 14, color: '#A1A1AA' }} />
              <input
                placeholder="Buscar contatos..."
                value={search} onChange={e => setSearch(e.target.value)}
                style={{ border: 'none', background: 'transparent', fontSize: 13, outline: 'none', width: '100%', color: '#09090B', fontFamily: 'inherit' }}
              />
            </div>

            {/* Chips */}
            <div style={{ height: 34, padding: '0 14px', background: '#F4F4F5', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 99, fontSize: 12, fontWeight: 500, color: '#18181B', display: 'flex', alignItems: 'center', gap: 6 }}>
              Todos
              <span style={{ background: 'rgba(0,0,0,0.1)', padding: '1px 7px', borderRadius: 99, fontSize: 11 }}>{stats?.total || 0}</span>
            </div>

            <select
              value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              style={{ height: 34, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 99, fontSize: 12, color: '#18181B', background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <option value="">Status</option>
              {Object.entries(STATUS_BADGE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>

            {(search || statusFilter) && (
              <button onClick={() => { setSearch(''); setStatusFilter(''); }} style={{ fontSize: 12, color: '#71717A', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                Limpar
              </button>
            )}
          </div>

          <button onClick={() => setShowImport(true)} style={{ height: 38, padding: '0 16px', background: '#FFFFFF', border: '1px solid #000', borderRadius: 99, fontSize: 13, fontWeight: 600, color: '#000', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
            <i className="ti ti-file-import" style={{ fontSize: 15 }} /> Importar CSV
          </button>
          <button onClick={openDrawer} style={{ height: 38, padding: '0 18px', background: '#000', border: 'none', borderRadius: 99, fontSize: 13, fontWeight: 600, color: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', fontFamily: 'inherit' }}>
            <i className="ti ti-plus" style={{ fontSize: 15 }} /> Adicionar Novo Contato
          </button>
        </div>

        {/* Tabela */}
        {isLoading && <SectionLoader />}
        <div style={{ background: '#FFFFFF', borderRadius: 20, border: '1px solid #EAECEF', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(248,249,250,0.7)', borderBottom: '1px solid #F1F3F5' }}>
                {['Nome', 'Tipo de Contato', 'Telefone/WhatsApp', 'Score', 'Status', 'Cadastro', 'Ações'].map((h, i) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: i === 6 ? 'right' : 'left', fontSize: 11, fontWeight: 600, color: '#747686', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {patients.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 48, textAlign: 'center' }}>
                  <i className="ti ti-users" style={{ fontSize: 36, display: 'block', margin: '0 auto 10px', color: '#D4D4D8' }} />
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#71717A' }}>Nenhum contato encontrado</div>
                  <div style={{ fontSize: 12, color: '#A1A1AA', marginTop: 4 }}>Adicione o primeiro contato clicando no botão acima</div>
                </td></tr>
              ) : pagedPatients.map((p: any) => {
                const badge = STATUS_BADGE[p.status] || STATUS_BADGE.NOVO;
                const initials = p.name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
                const { score } = calcPatientScore(p);
                const sb = scoreBadge(score);
                return (
                  <tr
                    key={p.id}
                    onClick={() => navigate(`/patients/${p.id}`)}
                    style={{ borderBottom: '1px solid #F1F3F5', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#F8F9FA')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#EDEEEF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 600, color: '#444654', border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                          {p.avatarUrl ? <img src={p.avatarUrl} alt={p.name} style={{ width: 32, height: 32, objectFit: 'cover' }} /> : initials}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#191C1D' }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: '#747686' }}>{p.email || ''}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {(p.contactTypes ?? []).length > 0
                          ? (p.contactTypes as any[]).map((ct: any) => (
                              <span key={ct.id} style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 500, padding: '2px 10px', borderRadius: 99, background: ct.contactType?.color ? `${ct.contactType.color}20` : '#F4F4F5', color: ct.contactType?.color ?? '#71717A', border: `1px solid ${ct.contactType?.color ?? '#E4E4E7'}30` }}>
                                {ct.contactType?.name ?? '—'}
                              </span>
                            ))
                          : <span style={{ fontSize: 11, color: '#A1A1AA' }}>Não definido</span>
                        }
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 13, color: '#444654' }}>{p.phone || '—'}</td>
                    {/* Score */}
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: sb.color, lineHeight: 1 }}>{score}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: sb.bg, color: sb.color }}>{sb.label}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 500, padding: '2px 10px', borderRadius: 99, background: badge.bg, color: badge.color, border: `1px solid ${badge.color}20` }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: badge.dot, flexShrink: 0 }} />
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#747686' }}>
                        <i className="ti ti-calendar-event" style={{ fontSize: 13, color: '#A1A1AA' }} />
                        {p.createdAt ? format(new Date(p.createdAt), "dd MMM',' yyyy", { locale: ptBR }) : '—'}
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      {(() => {
                        const isPaciente = (p.contactTypes ?? []).some(
                          (ct: any) => ct.contactType?.name?.toLowerCase() === 'paciente'
                        );
                        const isInativo = p.status === 'INATIVO';
                        return (
                          <TableActions
                            primaryAction={
                              isPaciente && canView('medicalRecords')
                                ? { label: 'Prontuário', icon: 'ti-clipboard-heart', variant: 'blue', onClick: () => navigate(`/prontuario/${p.id}`) }
                                : { label: 'Ver detalhes', icon: 'ti-eye', variant: 'default', onClick: () => navigate(`/patients/${p.id}`) }
                            }
                            secondaryActions={[
                              { label: 'Ver detalhes', icon: 'ti-eye', onClick: () => navigate(`/patients/${p.id}`) },
                              { label: 'Editar', icon: 'ti-pencil', onClick: () => navigate(`/patients/${p.id}?edit=true`) },
                              { label: 'Agendar', icon: 'ti-calendar-plus', onClick: () => navigate(`/agenda?newAppointment=true&patientId=${p.id}&patientName=${encodeURIComponent(p.name)}&patientPhone=${encodeURIComponent(p.phone || '')}`) },
                              { label: 'Financeiro', icon: 'ti-receipt', onClick: () => navigate(`/patients/${p.id}?tab=Financeiro`) },
                              { label: 'Histórico', icon: 'ti-history', onClick: () => navigate(`/patients/${p.id}?tab=Histórico`) },
                              { label: isInativo ? 'Ativar contato' : 'Inativar contato', icon: isInativo ? 'ti-user-check' : 'ti-user-off', onClick: () => isInativo ? inactivateMut.mutate(p.id) : setInactivateConfirmId(p.id), separator: true },
                              { label: 'Excluir contato', icon: 'ti-trash', variant: 'danger', onClick: () => setDeleteConfirmId(p.id) },
                            ]}
                          />
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {patients.length > 0 && (
            <div style={{ padding: '14px 20px', borderTop: '1px solid #F1F3F5', background: 'rgba(248,249,250,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 13, color: '#747686' }}>
                Mostrando <b style={{ color: '#191C1D' }}>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, patients.length)}</b> de <b style={{ color: '#191C1D' }}>{patients.length}</b> contatos
              </div>
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                    style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid #E4E4E7', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: page === 1 ? 'default' : 'pointer', color: page === 1 ? '#D4D4D8' : '#A1A1AA' }}
                  ><i className="ti ti-chevron-left" style={{ fontSize: 13 }} /></button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                    <button key={p} onClick={() => setPage(p)} style={{ width: 30, height: 30, borderRadius: '50%', border: p === page ? 'none' : '1px solid #E4E4E7', background: p === page ? '#000' : 'transparent', color: p === page ? '#fff' : '#747686', fontSize: 12, fontWeight: p === page ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {p}
                    </button>
                  ))}
                  <button
                    disabled={page === totalPages}
                    onClick={() => setPage(p => p + 1)}
                    style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid #E4E4E7', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: page === totalPages ? 'default' : 'pointer', color: page === totalPages ? '#D4D4D8' : '#A1A1AA' }}
                  ><i className="ti ti-chevron-right" style={{ fontSize: 13 }} /></button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Drawer overlay + painel ── */}
      {drawerOpen && (
        <Portal>
          <>
          {/* Backdrop */}
          <div
            className="drawer-overlay"
            onClick={closeDrawer}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200, backdropFilter: 'blur(2px)' }}
          />

          {/* Painel deslizante */}
          <div
            className="drawer-panel"
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0,
              width: 480, background: '#FFFFFF',
              boxShadow: '-8px 0 40px rgba(0,0,0,0.12)',
              zIndex: 201,
              display: 'flex', flexDirection: 'column',
              fontFamily: "'Inter', system-ui, sans-serif",
            }}
          >
            {/* Cabeçalho do painel */}
            <div style={{ padding: '24px 28px', borderBottom: '1px solid #F1F3F5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#191C1D', margin: 0 }}>{editingId ? 'Editar Contato' : 'Novo Contato'}</h2>
                <p style={{ fontSize: 13, color: '#71717A', marginTop: 3, marginBottom: 0 }}>{editingId ? 'Atualize os dados do contato' : 'Preencha os dados do contato'}</p>
              </div>
              <button
                onClick={closeDrawer}
                style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: '#F4F4F5', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#E4E4E7'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; }}
              >
                <i className="ti ti-x" style={{ fontSize: 16 }} />
              </button>
            </div>

            {/* Corpo do formulário (rolável) */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Seção: Dados básicos */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 14 }}>Dados básicos</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Tipo de Contato */}
                  <div>
                    <label className="lbl">Tipo de contato <span style={{ color: '#DC2626' }}>*</span></label>
                    {(contactTypes as any[]).length === 0 ? (
                      <div style={{ padding: '10px 14px', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, fontSize: 12, color: '#92400E' }}>
                        Nenhum tipo cadastrado. Configure em <b>Configurações → Agenda → Tipos de Contato</b>.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {(contactTypes as any[]).map((ct: any) => {
                          const selected = form.contactTypeIds.includes(ct.id);
                          const color = ct.color ?? '#71717A';
                          return (
                            <button
                              key={ct.id}
                              type="button"
                              onClick={() => toggleContactType(ct.id)}
                              style={{
                                padding: '6px 14px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
                                fontSize: 12, fontWeight: 500,
                                border: selected ? `2px solid ${color}` : '1.5px solid #E4E4E7',
                                background: selected ? `${color}18` : '#FAFAFA',
                                color: selected ? color : '#71717A',
                                transition: 'all 0.12s',
                                display: 'flex', alignItems: 'center', gap: 5,
                              }}
                            >
                              {selected && <i className="ti ti-check" style={{ fontSize: 11 }} />}
                              {ct.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {formErrors.contactTypeIds && <p style={{ fontSize: 11, color: '#DC2626', marginTop: 5, marginBottom: 0 }}>{formErrors.contactTypeIds}</p>}
                  </div>

                  {/* Nome */}
                  <div>
                    <label className="lbl">Nome completo <span style={{ color: '#DC2626' }}>*</span></label>
                    <input
                      className="inp"
                      placeholder="ex: Maria Silva"
                      value={form.name}
                      onChange={e => { set('name', e.target.value); setFormErrors(er => ({ ...er, name: undefined })); }}
                      style={{ borderColor: formErrors.name ? '#DC2626' : undefined }}
                    />
                    {formErrors.name && <p style={{ fontSize: 11, color: '#DC2626', marginTop: 5, marginBottom: 0 }}>{formErrors.name}</p>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label className="lbl">E-mail</label>
                      <input className="inp" type="email" placeholder="email@exemplo.com" value={form.email} onChange={e => set('email', e.target.value)} />
                    </div>
                    <div>
                      <label className="lbl">Telefone/WhatsApp <span style={{ color: '#DC2626' }}>*</span></label>
                      <input
                        className="inp"
                        placeholder="(00) 00000-0000"
                        value={form.phone}
                        onChange={e => { set('phone', e.target.value); setFormErrors(er => ({ ...er, phone: undefined })); }}
                        style={{ borderColor: formErrors.phone ? '#DC2626' : undefined }}
                      />
                      {formErrors.phone && <p style={{ fontSize: 11, color: '#DC2626', marginTop: 5, marginBottom: 0 }}>{formErrors.phone}</p>}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label className="lbl">CPF <span style={{ color: '#DC2626' }}>*</span></label>
                      <input
                        className="inp"
                        placeholder="000.000.000-00"
                        value={form.cpf}
                        onChange={e => { set('cpf', e.target.value); setFormErrors(er => ({ ...er, cpf: undefined })); }}
                        style={{ borderColor: formErrors.cpf ? '#DC2626' : undefined }}
                      />
                      {formErrors.cpf && <p style={{ fontSize: 11, color: '#DC2626', marginTop: 5, marginBottom: 0 }}>{formErrors.cpf}</p>}
                    </div>
                    <div>
                      <label className="lbl">Data de nascimento <span style={{ color: '#DC2626' }}>*</span></label>
                      <input
                        className="inp"
                        type="date"
                        value={form.birthDate}
                        onChange={e => { set('birthDate', e.target.value); setFormErrors(er => ({ ...er, birthDate: undefined })); }}
                        style={{ borderColor: formErrors.birthDate ? '#DC2626' : undefined }}
                      />
                      {formErrors.birthDate && <p style={{ fontSize: 11, color: '#DC2626', marginTop: 5, marginBottom: 0 }}>{formErrors.birthDate}</p>}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ height: 1, background: '#F1F3F5' }} />

              {/* Seção: Classificação */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 14 }}>Classificação</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="lbl">Gênero</label>
                    <select className="inp" style={{ height: 38, cursor: 'pointer' }} value={form.gender} onChange={e => set('gender', e.target.value)}>
                      <option value="">Selecionar</option>
                      <option value="F">Feminino</option>
                      <option value="M">Masculino</option>
                      <option value="O">Outro</option>
                    </select>
                  </div>
                  <div>
                    <label className="lbl">Status inicial</label>
                    <select className="inp" style={{ height: 38, cursor: 'pointer' }} value={form.status} onChange={e => set('status', e.target.value)}>
                      {Object.entries(STATUS_BADGE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="lbl">Como conheceu a clínica?</label>
                    <select className="inp" style={{ height: 38, cursor: 'pointer' }} value={form.source} onChange={e => set('source', e.target.value)}>
                      <option value="">Selecionar</option>
                      <option value="instagram">Instagram</option>
                      <option value="indicacao">Indicação</option>
                      <option value="google">Google</option>
                      <option value="site">Site</option>
                      <option value="outro">Outro</option>
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ height: 1, background: '#F1F3F5' }} />

              {/* Seção: Observações */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 14 }}>Observações</p>
                <textarea
                  className="inp"
                  placeholder="Anotações iniciais sobre o contato..."
                  value={form.notes}
                  onChange={e => set('notes', e.target.value)}
                  style={{ height: 100, resize: 'vertical', padding: '10px 12px', lineHeight: 1.5 }}
                />
              </div>
            </div>

            {/* Rodapé do painel */}
            <div style={{ padding: '16px 28px', borderTop: '1px solid #F1F3F5', flexShrink: 0, background: '#FAFAFA' }}>
              {saveError && (
                <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', fontSize: 12, color: '#DC2626' }}>
                  <i className="ti ti-alert-circle" style={{ fontSize: 13, marginRight: 6 }} />{saveError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={closeDrawer}
                  style={{ flex: 1, height: 40, border: '1px solid #E4E4E7', background: '#FFFFFF', borderRadius: 10, fontSize: 13, fontWeight: 500, color: '#191C1D', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={isPending}
                  style={{ flex: 2, height: 40, background: isPending ? '#A1A1AA' : '#000', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#FFF', cursor: isPending ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  {isPending
                    ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />Salvando...</>
                    : <><i className={`ti ${editingId ? 'ti-device-floppy' : 'ti-user-plus'}`} style={{ fontSize: 15 }} />{editingId ? 'Salvar alterações' : 'Salvar contato'}</>
                  }
                </button>
              </div>
            </div>
          </div>
          </>
        </Portal>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {deleteConfirmId && (
        <Portal>
          <>
          <div onClick={() => setDeleteConfirmId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, backdropFilter: 'blur(2px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1001, width: 400, background: '#FFFFFF', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,.15)', padding: '28px 28px 22px', fontFamily: "'Inter', system-ui, sans-serif" }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <i className="ti ti-trash" style={{ fontSize: 20, color: '#DC2626' }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#191C1D', marginBottom: 6 }}>Excluir contato?</div>
            <div style={{ fontSize: 13, color: '#71717A', lineHeight: 1.5, marginBottom: 22 }}>
              Esta ação é irreversível. O contato e todos os seus dados serão permanentemente removidos.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setDeleteConfirmId(null)}
                style={{ flex: 1, height: 40, border: '1px solid #E4E4E7', background: '#FFFFFF', borderRadius: 10, fontSize: 13, fontWeight: 500, color: '#191C1D', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteMut.mutate(deleteConfirmId)}
                disabled={deleteMut.isPending}
                style={{ flex: 1, height: 40, background: deleteMut.isPending ? '#A1A1AA' : '#DC2626', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#FFF', cursor: deleteMut.isPending ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
              >
                {deleteMut.isPending ? 'Excluindo...' : 'Excluir contato'}
              </button>
            </div>
          </div>
          </>
        </Portal>
      )}

      {inactivateConfirmId && (
        <Portal>
          <>
          <div onClick={() => setInactivateConfirmId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, backdropFilter: 'blur(2px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1001, width: 400, background: '#FFFFFF', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,.15)', padding: '28px 28px 22px', fontFamily: "'Inter', system-ui, sans-serif" }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <i className="ti ti-user-off" style={{ fontSize: 20, color: '#D97706' }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#191C1D', marginBottom: 6 }}>Inativar contato?</div>
            <div style={{ fontSize: 13, color: '#71717A', lineHeight: 1.5, marginBottom: 22 }}>
              O contato ficará inativo e não aparecerá nas buscas padrão. Você poderá reativar a qualquer momento.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setInactivateConfirmId(null)}
                style={{ flex: 1, height: 40, border: '1px solid #E4E4E7', background: '#FFFFFF', borderRadius: 10, fontSize: 13, fontWeight: 500, color: '#191C1D', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Cancelar
              </button>
              <button
                onClick={() => inactivateMut.mutate(inactivateConfirmId)}
                disabled={inactivateMut.isPending}
                style={{ flex: 1, height: 40, background: inactivateMut.isPending ? '#A1A1AA' : '#D97706', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#FFF', cursor: inactivateMut.isPending ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
              >
                {inactivateMut.isPending ? 'Inativando...' : 'Inativar contato'}
              </button>
            </div>
          </div>
          </>
        </Portal>
      )}

      {showImport && <PatientImportModal onClose={() => setShowImport(false)} />}
    </>
  );
}
