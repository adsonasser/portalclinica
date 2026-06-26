import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { leadsApi, usersApi } from '../../services/api';
import { Portal } from '../../components/ui/Portal';
import { SectionLoader } from '../../components/ui/Loader';
import { useToast } from '../../components/ui/Toast';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Lead {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  source?: string;
  status: string;
  value?: number;
  notes?: string;
  nextActivity?: string;
  nextActivityAt?: string;
  funnelId?: string;
  stageId?: string;
  stageOrder: number;
  patientId?: string;
  wonAt?: string;
  lostAt?: string;
  lostReason?: string;
  assignedUser?: { id: string; name: string };
  leadSource?: { id: string; name: string };
  stage?: { id: string; name: string; color: string; isWon: boolean; isLost: boolean };
  funnel?: { id: string; name: string; stages?: Stage[] };
  history?: HistoryItem[];
  createdAt: string;
}

export interface Stage {
  id: string;
  name: string;
  color: string;
  order: number;
  isInitial: boolean;
  isWon: boolean;
  isLost: boolean;
}

export interface Funnel {
  id: string;
  name: string;
  stages: Stage[];
}

export interface HistoryItem {
  id: string;
  event: string;
  content?: string;
  userId?: string;
  createdAt: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const LEAD_STATUS_MAP: Record<string, { bg: string; color: string; label: string }> = {
  NOVO:        { bg: '#F4F4F5', color: '#71717A', label: 'Novo' },
  CONTATADO:   { bg: '#EFF6FF', color: '#2563EB', label: 'Contatado' },
  QUALIFICADO: { bg: '#F5F3FF', color: '#7C3AED', label: 'Qualificado' },
  PROPOSTA:    { bg: '#FFFBEB', color: '#D97706', label: 'Proposta' },
  NEGOCIACAO:  { bg: '#FFF7ED', color: '#EA580C', label: 'Negociação' },
  GANHO:       { bg: '#DCFCE7', color: '#16A34A', label: 'Ganho' },
  PERDIDO:     { bg: '#FEF2F2', color: '#DC2626', label: 'Perdido' },
};

export const ACTIVITY_TYPES = ['Ligação', 'WhatsApp', 'Reunião', 'Consulta', 'Retorno', 'Email', 'Outro'];

const EVENT_MAP: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  CREATED:        { icon: 'ti-plus',            color: '#7C3AED', bg: '#F5F3FF', label: 'Criado'              },
  STAGE_CHANGED:  { icon: 'ti-arrows-exchange', color: '#2563EB', bg: '#EFF6FF', label: 'Etapa alterada'      },
  FUNNEL_CHANGED: { icon: 'ti-layout-kanban',   color: '#2563EB', bg: '#EFF6FF', label: 'Funil alterado'      },
  STATUS_CHANGED: { icon: 'ti-refresh',         color: '#D97706', bg: '#FFFBEB', label: 'Status alterado'     },
  ASSIGNED:       { icon: 'ti-user',            color: '#71717A', bg: '#F4F4F5', label: 'Responsável'         },
  NOTE_ADDED:     { icon: 'ti-note',            color: '#71717A', bg: '#F4F4F5', label: 'Observação'          },
  ACTIVITY_ADDED: { icon: 'ti-activity',        color: '#2563EB', bg: '#EFF6FF', label: 'Atividade'           },
  LOST:           { icon: 'ti-x-circle',        color: '#DC2626', bg: '#FEF2F2', label: 'Perdido'             },
  CONVERTED:      { icon: 'ti-user-check',      color: '#16A34A', bg: '#F0FDF4', label: 'Convertido'          },
};

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtDateShort = (d: string) => new Date(d).toLocaleDateString('pt-BR');

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', height: 36, padding: '0 12px',
  border: '1px solid #E4E4E7', borderRadius: 8,
  fontSize: 13, color: '#09090B', background: '#FFFFFF',
  fontFamily: "'Inter', system-ui, sans-serif",
  boxSizing: 'border-box', outline: 'none',
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#71717A', marginBottom: 4, display: 'block',
  textTransform: 'uppercase', letterSpacing: '.04em',
};
const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column' };

// ─── LeadCard ─────────────────────────────────────────────────────────────────

function LeadCard({ lead, onDragStart, onDragEnd, onClick }: {
  lead: Lead;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
}) {
  const st = LEAD_STATUS_MAP[lead.status] || LEAD_STATUS_MAP.NOVO;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      style={{
        background: '#FFFFFF', borderRadius: 10, border: '1px solid #E4E4E7',
        padding: '11px 13px', cursor: 'grab', transition: 'box-shadow .12s, border-color .12s',
        userSelect: 'none',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.08)';
        e.currentTarget.style.borderColor = '#D4D4D8';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.borderColor = '#E4E4E7';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 7 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#09090B', lineHeight: 1.3, flex: 1, marginRight: 6 }}>{lead.name}</span>
        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: st.bg, color: st.color, flexShrink: 0 }}>{st.label}</span>
      </div>
      {lead.phone && (
        <div style={{ fontSize: 11, color: '#71717A', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
          <i className="ti ti-phone" style={{ fontSize: 10 }} />{lead.phone}
        </div>
      )}
      {(lead.leadSource?.name || lead.source) && (
        <div style={{ fontSize: 10, color: '#A1A1AA', marginBottom: 4 }}>
          <i className="ti ti-map-pin" style={{ fontSize: 10, marginRight: 3 }} />{lead.leadSource?.name || lead.source}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        {lead.value ? (
          <span style={{ fontSize: 13, fontWeight: 700, color: '#09090B' }}>{fmt(lead.value)}</span>
        ) : <span />}
        {lead.assignedUser && (
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#71717A' }}>
            {lead.assignedUser.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      {lead.nextActivityAt && (
        <div style={{ marginTop: 6, fontSize: 10, color: '#D97706', display: 'flex', alignItems: 'center', gap: 3 }}>
          <i className="ti ti-calendar" style={{ fontSize: 10 }} />
          {lead.nextActivity} — {fmtDateShort(lead.nextActivityAt)}
        </div>
      )}
    </div>
  );
}

// ─── DragActionBar ────────────────────────────────────────────────────────────

function DragActionBar({ onGanhar, onPerder, onChangeFunnel }: {
  onGanhar: () => void;
  onPerder: () => void;
  onChangeFunnel: () => void;
}) {
  const [hover, setHover] = useState<string | null>(null);

  const zone = (
    key: string, label: string, icon: string,
    bg: string, bgHover: string, color: string, border: string,
    onDrop: () => void,
  ) => (
    <div
      onDragOver={e => { e.preventDefault(); setHover(key); }}
      onDragLeave={() => setHover(null)}
      onDrop={() => { setHover(null); onDrop(); }}
      style={{
        height: 52, padding: '0 32px', borderRadius: 12,
        display: 'flex', alignItems: 'center', gap: 10,
        background: hover === key ? bgHover : bg,
        border: `1.5px dashed ${border}`,
        color,
        cursor: 'copy', transition: 'all .15s',
        fontSize: 14, fontWeight: 700,
        transform: hover === key ? 'scale(1.03)' : 'scale(1)',
      }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: 20 }} /> {label}
    </div>
  );

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 72, right: 0, height: 76,
      background: '#FFFFFF',
      borderTop: '1px solid #E4E4E7',
      boxShadow: '0 -4px 20px rgba(0,0,0,0.06)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
      zIndex: 90,
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#A1A1AA', marginRight: 6, letterSpacing: '.05em', textTransform: 'uppercase' }}>
        Soltar em:
      </div>
      {zone('ganhar', 'Ganhar',     'ti-trophy',          '#F0FDF4', '#DCFCE7', '#16A34A', '#86EFAC', onGanhar)}
      {zone('perder', 'Perder',     'ti-x-circle',        '#FEF2F2', '#FECACA', '#DC2626', '#FCA5A5', onPerder)}
      {zone('mudar',  'Mudar funil','ti-layout-kanban',   '#FFF7ED', '#FED7AA', '#EA580C', '#FDBA74', onChangeFunnel)}
    </div>
  );
}

// ─── ChangeFunnelModal ────────────────────────────────────────────────────────

function ChangeFunnelModal({ lead, funnels, onConfirm, onCancel, loading }: {
  lead: Lead;
  funnels: Funnel[];
  onConfirm: (funnelId: string, stageId: string) => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  const otherFunnels = funnels.filter(f => f.id !== lead.funnelId);
  const [funnelId, setFunnelId] = useState(otherFunnels[0]?.id ?? '');
  const selectedFunnel = funnels.find(f => f.id === funnelId);
  const [stageId, setStageId] = useState(selectedFunnel?.stages[0]?.id ?? '');
  useEffect(() => setStageId(selectedFunnel?.stages[0]?.id ?? ''), [funnelId, funnels]);

  return (
    <Portal>
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1100 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 400, background: '#FFFFFF', borderRadius: 16, zIndex: 1101, padding: '28px', boxShadow: '0 24px 64px rgba(0,0,0,0.2)', fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <i className="ti ti-layout-kanban" style={{ fontSize: 20, color: '#2563EB' }} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#09090B', marginBottom: 4 }}>Mudar de funil</div>
        <div style={{ fontSize: 13, color: '#71717A', marginBottom: 20 }}>Lead: <strong>{lead.name}</strong></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Funil de destino</label>
            <select value={funnelId} onChange={e => setFunnelId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              {funnels.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Etapa de entrada</label>
            <select value={stageId} onChange={e => setStageId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }} disabled={!selectedFunnel}>
              {selectedFunnel?.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ height: 36, padding: '0 16px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
          <button onClick={() => onConfirm(funnelId, stageId)} disabled={!funnelId || !stageId || loading} style={{ height: 36, padding: '0 16px', background: '#2563EB', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit', opacity: (!funnelId || !stageId || loading) ? 0.6 : 1 }}>
            {loading ? 'Movendo...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </Portal>
  );
}

// ─── NovoLeadDrawer ───────────────────────────────────────────────────────────

export function NovoLeadDrawer({ funnels, defaultFunnelId, defaultStageId, onClose }: {
  funnels: Funnel[];
  defaultFunnelId?: string;
  defaultStageId?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: users = [] } = useQuery<any[]>({ queryKey: ['users'], queryFn: usersApi.list });
  const { data: sources = [] } = useQuery<any[]>({ queryKey: ['lead-sources'], queryFn: leadsApi.sources });

  const [form, setForm] = useState({
    name: '', phone: '', email: '', leadSourceId: '', assignedUserId: '',
    funnelId: defaultFunnelId || (funnels[0]?.id ?? ''),
    stageId: defaultStageId || '',
    value: '', nextActivity: '', nextActivityAt: '', notes: '',
  });

  const selectedFunnel = funnels.find(f => f.id === form.funnelId);
  const stageOptions = selectedFunnel?.stages ?? [];

  useEffect(() => {
    if (!defaultStageId) {
      const funnel = funnels.find(f => f.id === form.funnelId);
      const initial = funnel?.stages.find(s => s.isInitial) ?? funnel?.stages[0];
      setForm(prev => ({ ...prev, stageId: initial?.id ?? '' }));
    }
  }, [form.funnelId, funnels, defaultStageId]);

  const set = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const createMut = useMutation({
    mutationFn: (data: any) => leadsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      qc.invalidateQueries({ queryKey: ['crm-stats'] });
      toast('Lead criado com sucesso!', 'success');
      onClose();
    },
    onError: () => toast('Erro ao criar lead.', 'error'),
  });

  const handleSave = () => {
    if (!form.name.trim()) { toast('Nome é obrigatório.', 'error'); return; }
    const payload: any = { name: form.name };
    if (form.phone) payload.phone = form.phone;
    if (form.email) payload.email = form.email;
    if (form.leadSourceId) payload.leadSourceId = form.leadSourceId;
    if (form.assignedUserId) payload.assignedUserId = form.assignedUserId;
    if (form.funnelId) payload.funnelId = form.funnelId;
    if (form.stageId) payload.stageId = form.stageId;
    if (form.value) payload.value = parseFloat(form.value);
    if (form.nextActivity) payload.nextActivity = form.nextActivity;
    if (form.nextActivityAt) payload.nextActivityAt = form.nextActivityAt;
    if (form.notes) payload.notes = form.notes;
    createMut.mutate(payload);
  };

  return (
    <Portal>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 1000 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 500, zIndex: 1001, background: '#FFFFFF', boxShadow: '-4px 0 40px rgba(0,0,0,0.14)', display: 'flex', flexDirection: 'column', animation: 'slideIn .22s ease', fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ flexShrink: 0, padding: '20px 24px', borderBottom: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#09090B', margin: 0 }}>Novo lead</h2>
            <p style={{ fontSize: 12, color: '#71717A', margin: '2px 0 0' }}>Adicionar ao funil de vendas</p>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, border: 'none', background: '#F4F4F5', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A' }}>
            <i className="ti ti-x" style={{ fontSize: 15 }} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Nome *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nome completo" style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Telefone/WhatsApp</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(00) 00000-0000" style={inputStyle} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>E-mail</label>
              <input value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@exemplo.com" style={inputStyle} type="email" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Origem</label>
              <select value={form.leadSourceId} onChange={e => set('leadSourceId', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">Selecionar</option>
                {sources.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Responsável</label>
              <select value={form.assignedUserId} onChange={e => set('assignedUserId', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">Sem responsável</option>
                {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Funil</label>
              <select value={form.funnelId} onChange={e => set('funnelId', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">Selecionar</option>
                {funnels.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Etapa</label>
              <select value={form.stageId} onChange={e => set('stageId', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }} disabled={stageOptions.length === 0}>
                <option value="">Selecionar</option>
                {stageOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Valor estimado (R$)</label>
            <input value={form.value} onChange={e => set('value', e.target.value)} placeholder="0,00" style={inputStyle} type="number" min="0" step="0.01" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Próxima atividade</label>
              <select value={form.nextActivity} onChange={e => set('nextActivity', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">Nenhuma</option>
                {ACTIVITY_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Data/hora</label>
              <input value={form.nextActivityAt} onChange={e => set('nextActivityAt', e.target.value)} style={inputStyle} type="datetime-local" />
            </div>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Observações</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Notas sobre o lead..." rows={3} style={{ ...inputStyle, height: 'auto', padding: '8px 12px', resize: 'vertical' }} />
          </div>
        </div>

        <div style={{ flexShrink: 0, padding: '16px 24px', borderTop: '1px solid #E4E4E7', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ height: 36, padding: '0 14px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
          <button onClick={handleSave} disabled={createMut.isPending} style={{ height: 36, padding: '0 16px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', opacity: createMut.isPending ? 0.6 : 1 }}>
            {createMut.isPending ? 'Salvando...' : 'Salvar lead'}
          </button>
        </div>
      </div>
    </Portal>
  );
}

// ─── LeadDetailDrawer ─────────────────────────────────────────────────────────

export function LeadDetailDrawer({ lead, funnels, onClose, onChangeFunnel }: {
  lead: Lead;
  funnels: Funnel[];
  onClose: () => void;
  onChangeFunnel: (lead: Lead) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);
  const [showMarkLost, setShowMarkLost] = useState(false);

  const { data: fullLead, isLoading } = useQuery({
    queryKey: ['lead-detail', lead.id],
    queryFn: () => leadsApi.get(lead.id),
    refetchOnWindowFocus: false,
  });

  const data: Lead = fullLead ?? lead;
  const { data: users = [] } = useQuery<any[]>({ queryKey: ['users'], queryFn: usersApi.list });
  const { data: sources = [] } = useQuery<any[]>({ queryKey: ['lead-sources'], queryFn: leadsApi.sources });

  const [editForm, setEditForm] = useState({ name: '', phone: '', email: '', leadSourceId: '', assignedUserId: '', funnelId: '', stageId: '', value: '', notes: '', status: '' });
  useEffect(() => {
    if (data) {
      setEditForm({
        name: data.name ?? '',
        phone: data.phone ?? '',
        email: data.email ?? '',
        leadSourceId: (data as any).leadSourceId ?? data.leadSource?.id ?? '',
        assignedUserId: data.assignedUser?.id ?? '',
        funnelId: data.funnelId ?? '',
        stageId: data.stageId ?? '',
        value: data.value ? String(data.value) : '',
        notes: data.notes ?? '',
        status: data.status ?? 'NOVO',
      });
    }
  }, [fullLead, lead.id]);

  const editFunnel = funnels.find(f => f.id === editForm.funnelId);
  const setEf = (key: string, val: string) => setEditForm(prev => ({ ...prev, [key]: val }));

  const updateMut = useMutation({
    mutationFn: (payload: any) => leadsApi.update(data.id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-detail', data.id] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      toast('Lead atualizado!', 'success');
      setIsEditing(false);
    },
    onError: () => toast('Erro ao atualizar lead.', 'error'),
  });

  const markWonMut = useMutation({
    mutationFn: () => leadsApi.markWon(data.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-detail', data.id] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      qc.invalidateQueries({ queryKey: ['crm-stats'] });
      toast('Lead marcado como ganho!', 'success');
      setShowConvertConfirm(true);
    },
    onError: () => toast('Erro ao marcar como ganho.', 'error'),
  });

  const markLostMut = useMutation({
    mutationFn: (reason: string) => leadsApi.markLost(data.id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-detail', data.id] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      qc.invalidateQueries({ queryKey: ['crm-stats'] });
      toast('Lead marcado como perdido.', 'success');
      setShowMarkLost(false);
    },
    onError: () => toast('Erro ao marcar como perdido.', 'error'),
  });

  const convertMut = useMutation({
    mutationFn: () => leadsApi.convert(data.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      qc.invalidateQueries({ queryKey: ['crm-stats'] });
      qc.invalidateQueries({ queryKey: ['lead-detail', data.id] });
      toast('Lead convertido em contato/paciente!', 'success');
      setShowConvertConfirm(false);
      onClose();
    },
    onError: () => toast('Erro ao converter lead.', 'error'),
  });

  const [actType, setActType] = useState('');
  const [actContent, setActContent] = useState('');

  const addActMut = useMutation({
    mutationFn: () => leadsApi.addActivity(data.id, { type: actType, content: actContent }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-detail', data.id] });
      setActContent('');
      setActType('');
      toast('Atividade registrada!', 'success');
    },
    onError: () => toast('Erro ao registrar atividade.', 'error'),
  });

  const handleSaveEdit = () => {
    const payload: any = { name: editForm.name };
    if (editForm.phone) payload.phone = editForm.phone;
    if (editForm.email) payload.email = editForm.email;
    if (editForm.leadSourceId) payload.leadSourceId = editForm.leadSourceId;
    if (editForm.funnelId) payload.funnelId = editForm.funnelId;
    if (editForm.stageId) payload.stageId = editForm.stageId;
    if (editForm.value) payload.value = parseFloat(editForm.value);
    if (editForm.notes !== undefined) payload.notes = editForm.notes;
    if (editForm.status) payload.status = editForm.status;
    if (editForm.assignedUserId) payload.assignedUserId = editForm.assignedUserId;
    updateMut.mutate(payload);
  };

  const st = LEAD_STATUS_MAP[data.status] ?? LEAD_STATUS_MAP.NOVO;
  const history: HistoryItem[] = data.history ?? [];

  return (
    <Portal>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 1000 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 860, zIndex: 1001,
        background: '#FFFFFF', boxShadow: '-4px 0 40px rgba(0,0,0,0.14)',
        display: 'flex', flexDirection: 'column', animation: 'slideIn .22s ease',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}>
        {/* Header */}
        <div style={{ flexShrink: 0, padding: '16px 24px', borderBottom: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#18181B', flexShrink: 0 }}>
              {data.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#09090B' }}>{data.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 99, background: st.bg, color: st.color }}>{st.label}</span>
                {data.stage && <span style={{ fontSize: 11, color: '#71717A' }}>{data.stage.name}</span>}
                {data.funnel && <span style={{ fontSize: 11, color: '#A1A1AA' }}>· {data.funnel.name}</span>}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!isEditing && (
              <button onClick={() => setIsEditing(true)} style={{ height: 32, padding: '0 12px', background: '#F4F4F5', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500, color: '#09090B', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                <i className="ti ti-edit" style={{ fontSize: 13 }} /> Editar
              </button>
            )}
            <button onClick={onClose} style={{ width: 32, height: 32, border: 'none', background: '#F4F4F5', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A' }}>
              <i className="ti ti-x" style={{ fontSize: 15 }} />
            </button>
          </div>
        </div>

        {/* Body — 2 columns */}
        {isLoading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SectionLoader label="Carregando..." />
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>

            {/* LEFT: Data compacto + Registrar atividade no rodapé */}
            <div style={{ width: 400, flexShrink: 0, borderRight: '1px solid #E4E4E7', display: 'flex', flexDirection: 'column' }}>

              {/* Ações rápidas */}
              <div style={{ flexShrink: 0, padding: '12px 20px', borderBottom: '1px solid #F4F4F5', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {data.phone && (
                  <a href={`https://wa.me/55${data.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                    style={{ height: 28, padding: '0 10px', background: '#22C55E', border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 600, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                    <i className="ti ti-brand-whatsapp" style={{ fontSize: 13 }} /> WhatsApp
                  </a>
                )}
                {data.status !== 'GANHO' && (
                  <button onClick={() => markWonMut.mutate()} disabled={markWonMut.isPending}
                    style={{ height: 28, padding: '0 10px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, fontSize: 11, fontWeight: 600, color: '#15803D', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <i className="ti ti-trophy" style={{ fontSize: 12 }} /> Ganhar
                  </button>
                )}
                {data.status === 'GANHO' && !data.patientId && (
                  <button onClick={() => setShowConvertConfirm(true)}
                    style={{ height: 28, padding: '0 10px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, fontSize: 11, fontWeight: 600, color: '#15803D', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <i className="ti ti-user-check" style={{ fontSize: 12 }} /> Converter
                  </button>
                )}
                {data.status !== 'PERDIDO' && (
                  <button onClick={() => setShowMarkLost(true)}
                    style={{ height: 28, padding: '0 10px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 11, fontWeight: 600, color: '#DC2626', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <i className="ti ti-x-circle" style={{ fontSize: 12 }} /> Perder
                  </button>
                )}
                <button onClick={() => onChangeFunnel(data)}
                  style={{ height: 28, padding: '0 10px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 11, fontWeight: 500, color: '#09090B', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <i className="ti ti-layout-kanban" style={{ fontSize: 12 }} /> Mudar funil
                </button>
                {!isEditing && (
                  <button onClick={() => setIsEditing(true)}
                    style={{ height: 28, padding: '0 10px', background: '#F4F4F5', border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 500, color: '#09090B', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <i className="ti ti-edit" style={{ fontSize: 12 }} /> Editar
                  </button>
                )}
              </div>

              {/* Convert confirm inline */}
              {showConvertConfirm && (
                <div style={{ flexShrink: 0, margin: '8px 20px', padding: '10px 12px', background: '#F0FDF4', borderRadius: 8, border: '1px solid #BBF7D0' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#15803D', marginBottom: 6 }}>Converter em contato/paciente?</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setShowConvertConfirm(false)} style={{ height: 28, padding: '0 10px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Não</button>
                    <button onClick={() => convertMut.mutate()} disabled={convertMut.isPending} style={{ height: 28, padding: '0 10px', background: '#16A34A', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {convertMut.isPending ? '...' : 'Sim, converter'}
                    </button>
                  </div>
                </div>
              )}

              {/* Data fields — scrollable */}
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 20px' }}>
                {isEditing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={fieldStyle}>
                      <label style={labelStyle}>Nome</label>
                      <input value={editForm.name} onChange={e => setEf('name', e.target.value)} style={inputStyle} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div style={fieldStyle}><label style={labelStyle}>Telefone</label><input value={editForm.phone} onChange={e => setEf('phone', e.target.value)} style={inputStyle} /></div>
                      <div style={fieldStyle}><label style={labelStyle}>E-mail</label><input value={editForm.email} onChange={e => setEf('email', e.target.value)} style={inputStyle} type="email" /></div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div style={fieldStyle}><label style={labelStyle}>Origem</label>
                        <select value={editForm.leadSourceId} onChange={e => setEf('leadSourceId', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                          <option value="">Selecionar</option>
                          {sources.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                      <div style={fieldStyle}><label style={labelStyle}>Responsável</label>
                        <select value={editForm.assignedUserId} onChange={e => setEf('assignedUserId', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                          <option value="">Sem responsável</option>
                          {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div style={fieldStyle}><label style={labelStyle}>Funil</label>
                        <select value={editForm.funnelId} onChange={e => setEf('funnelId', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                          {funnels.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                      </div>
                      <div style={fieldStyle}><label style={labelStyle}>Etapa</label>
                        <select value={editForm.stageId} onChange={e => setEf('stageId', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                          {editFunnel?.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div style={fieldStyle}><label style={labelStyle}>Valor estimado</label><input value={editForm.value} onChange={e => setEf('value', e.target.value)} style={inputStyle} type="number" min="0" step="0.01" /></div>
                      <div style={fieldStyle}><label style={labelStyle}>Status</label>
                        <select value={editForm.status} onChange={e => setEf('status', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                          {Object.entries(LEAD_STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={fieldStyle}><label style={labelStyle}>Observações</label>
                      <textarea value={editForm.notes} onChange={e => setEf('notes', e.target.value)} rows={3} style={{ ...inputStyle, height: 'auto', padding: '8px 12px', resize: 'vertical' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, paddingBottom: 4 }}>
                      <button onClick={() => setIsEditing(false)} style={{ height: 32, padding: '0 12px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 12, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
                      <button onClick={handleSaveEdit} disabled={updateMut.isPending} style={{ height: 32, padding: '0 14px', background: '#000', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', opacity: updateMut.isPending ? 0.6 : 1 }}>
                        {updateMut.isPending ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                    {[
                      { label: 'Telefone',    value: data.phone,                                                                         icon: 'ti-phone'         },
                      { label: 'E-mail',      value: data.email,                                                                         icon: 'ti-mail'          },
                      { label: 'Origem',      value: data.leadSource?.name || data.source,                                               icon: 'ti-map-pin'       },
                      { label: 'Responsável', value: data.assignedUser?.name,                                                            icon: 'ti-user'          },
                      { label: 'Valor',       value: data.value ? fmt(data.value) : null,                                                icon: 'ti-currency-dollar'},
                      { label: 'Criado em',   value: fmtDate(data.createdAt),                                                           icon: 'ti-clock'         },
                      { label: 'Próx. ativ.', value: data.nextActivity && data.nextActivityAt ? `${data.nextActivity} · ${fmtDateShort(data.nextActivityAt)}` : null, icon: 'ti-calendar' },
                      { label: 'Paciente',    value: data.patientId ? 'Vinculado' : null,                                               icon: 'ti-user-check'    },
                      { label: 'Perdido por', value: data.lostReason || null,                                                           icon: 'ti-alert-circle'  },
                    ].map(row => row.value ? (
                      <div key={row.label} style={{ padding: '7px 8px 7px 0', borderBottom: '1px solid #F4F4F5' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <i className={`ti ${row.icon}`} style={{ fontSize: 12, color: '#A1A1AA', flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: 10, color: '#A1A1AA', fontWeight: 500 }}>{row.label}</div>
                            <div style={{ fontSize: 12, color: '#09090B', fontWeight: 500 }}>{row.value}</div>
                          </div>
                        </div>
                      </div>
                    ) : null)}
                    {data.notes && (
                      <div style={{ gridColumn: 'span 2', marginTop: 10, padding: '10px 12px', background: '#FAFAFA', borderRadius: 8, border: '1px solid #F4F4F5' }}>
                        <div style={{ fontSize: 10, color: '#A1A1AA', fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 4 }}>Observações</div>
                        <div style={{ fontSize: 12, color: '#18181B', lineHeight: 1.6 }}>{data.notes}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Registrar atividade — fixo no rodapé esquerdo */}
              <div style={{ flexShrink: 0, borderTop: '1px solid #E4E4E7', padding: '14px 20px', background: '#FAFAFA', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#09090B', textTransform: 'uppercase', letterSpacing: '.05em' }}>Registrar atividade</span>
                  <select value={actType} onChange={e => setActType(e.target.value)} style={{ height: 28, padding: '0 8px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 11, color: '#09090B', background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <option value="">Tipo</option>
                    {ACTIVITY_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <textarea
                  value={actContent}
                  onChange={e => setActContent(e.target.value)}
                  placeholder="Descreva o contato realizado, observação ou próximo passo..."
                  rows={4}
                  style={{ ...inputStyle, height: 'auto', padding: '10px 12px', resize: 'none', fontSize: 13, lineHeight: 1.5 }}
                />
                <button
                  onClick={() => { if (actContent.trim()) addActMut.mutate(); }}
                  disabled={addActMut.isPending || !actContent.trim()}
                  style={{ height: 36, background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', opacity: !actContent.trim() ? 0.4 : 1 }}>
                  {addActMut.isPending ? 'Registrando...' : 'Registrar'}
                </button>
              </div>
            </div>

            {/* RIGHT: History feed — pure */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ flexShrink: 0, padding: '12px 20px', borderBottom: '1px solid #E4E4E7' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#09090B', textTransform: 'uppercase', letterSpacing: '.05em' }}>Histórico</span>
                <span style={{ marginLeft: 8, fontSize: 11, color: '#A1A1AA' }}>{history.length} registro{history.length !== 1 ? 's' : ''}</span>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 0 }}>
                {history.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: '#A1A1AA' }}>
                    <i className="ti ti-history" style={{ fontSize: 32, display: 'block', marginBottom: 8 }} />
                    <div style={{ fontSize: 13 }}>Nenhum histórico registrado</div>
                  </div>
                ) : history.map((item, i) => {
                  const ev = EVENT_MAP[item.event] ?? { icon: 'ti-point', color: '#71717A', bg: '#F4F4F5', label: item.event };
                  return (
                    <div key={item.id} style={{ display: 'flex', gap: 12, paddingBottom: 14, position: 'relative' }}>
                      {i < history.length - 1 && (
                        <div style={{ position: 'absolute', left: 14, top: 28, bottom: 0, width: 1, background: '#F0F0F0' }} />
                      )}
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: ev.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                        <i className={`ti ${ev.icon}`} style={{ fontSize: 12, color: ev.color }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#09090B' }}>{ev.label}</span>
                          <span style={{ fontSize: 11, color: '#A1A1AA' }}>{fmtDate(item.createdAt)}</span>
                        </div>
                        {item.content && <div style={{ fontSize: 12, color: '#71717A', lineHeight: 1.5 }}>{item.content}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mark lost modal inline */}
      {showMarkLost && (
        <MarkLostModal
          lead={data}
          onConfirm={reason => markLostMut.mutate(reason)}
          onCancel={() => setShowMarkLost(false)}
          loading={markLostMut.isPending}
        />
      )}
    </Portal>
  );
}

// ─── MarkLostModal ────────────────────────────────────────────────────────────

export function MarkLostModal({ lead, onConfirm, onCancel, loading }: {
  lead: Lead;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  const { data: lossReasons = [] } = useQuery<any[]>({ queryKey: ['loss-reasons'], queryFn: leadsApi.lossReasons });
  const [selected, setSelected] = useState('');
  const [custom, setCustom] = useState('');
  const reason = selected === '__outro' ? custom : selected;

  return (
    <Portal>
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1200 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 420, background: '#FFFFFF', borderRadius: 16, zIndex: 1201, padding: '28px', boxShadow: '0 24px 64px rgba(0,0,0,0.2)', fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <i className="ti ti-x-circle" style={{ fontSize: 20, color: '#DC2626' }} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#09090B', marginBottom: 4 }}>Marcar como perdido</div>
        <div style={{ fontSize: 13, color: '#71717A', marginBottom: 20 }}>Lead: <strong>{lead.name}</strong></div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          {lossReasons.length > 0 ? (
            <>
              <div style={fieldStyle}>
                <label style={labelStyle}>Motivo da perda</label>
                <select value={selected} onChange={e => setSelected(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Selecionar motivo</option>
                  {lossReasons.map((r: any) => <option key={r.id} value={r.name}>{r.name}</option>)}
                  <option value="__outro">Outro (descrever)</option>
                </select>
              </div>
              {selected === '__outro' && (
                <div style={fieldStyle}>
                  <label style={labelStyle}>Descrever</label>
                  <textarea value={custom} onChange={e => setCustom(e.target.value)} placeholder="Descreva o motivo..." rows={3} style={{ ...inputStyle, height: 'auto', padding: '8px 12px', resize: 'vertical' }} />
                </div>
              )}
            </>
          ) : (
            <div style={fieldStyle}>
              <label style={labelStyle}>Motivo da perda</label>
              <textarea value={custom} onChange={e => setCustom(e.target.value)} placeholder="Descreva o motivo pelo qual este lead foi perdido..." rows={3} style={{ ...inputStyle, height: 'auto', padding: '8px 12px', resize: 'vertical' }} />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ height: 36, padding: '0 16px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
          <button onClick={() => onConfirm(reason || 'Não informado')} disabled={loading} style={{ height: 36, padding: '0 16px', background: '#DC2626', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Salvando...' : 'Confirmar perda'}
          </button>
        </div>
      </div>
    </Portal>
  );
}

// ─── CRMPage ──────────────────────────────────────────────────────────────────

export function CRMPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [selectedFunnelId, setSelectedFunnelId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [assignedFilter, setAssignedFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [showNovoLead, setShowNovoLead] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [confirmLost, setConfirmLost] = useState<Lead | null>(null);
  const [confirmChangeFunnel, setConfirmChangeFunnel] = useState<Lead | null>(null);
  const [quickAddStageId, setQuickAddStageId] = useState<string | null>(null);

  // Queries
  const { data: funnels = [], isLoading: funnelsLoading } = useQuery<Funnel[]>({ queryKey: ['crm-funnels'], queryFn: leadsApi.funnels });
  const { data: stats } = useQuery<any>({ queryKey: ['crm-stats'], queryFn: leadsApi.stats });
  const { data: users = [] } = useQuery<any[]>({ queryKey: ['users'], queryFn: usersApi.list });
  const { data: sources = [] } = useQuery<any[]>({ queryKey: ['lead-sources'], queryFn: leadsApi.sources });

  const activeFunnelId = selectedFunnelId || (funnels[0]?.id ?? '');
  const activeFunnel = funnels.find(f => f.id === activeFunnelId);

  const { data: leads = [], isLoading: leadsLoading } = useQuery<Lead[]>({
    queryKey: ['crm-leads', activeFunnelId, search, statusFilter, assignedFilter, sourceFilter],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (activeFunnelId) params.funnelId = activeFunnelId;
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (assignedFilter) params.assignedUserId = assignedFilter;
      if (sourceFilter) params.leadSourceId = sourceFilter;
      return leadsApi.list(params);
    },
    enabled: !!activeFunnelId,
  });

  // Mutations
  const moveMut = useMutation({
    mutationFn: ({ leadId, stageId, stageOrder }: { leadId: string; stageId: string; stageOrder: number }) =>
      leadsApi.moveStage(leadId, stageId, stageOrder),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-leads'] }),
  });

  const markWonMut = useMutation({
    mutationFn: (id: string) => leadsApi.markWon(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      qc.invalidateQueries({ queryKey: ['crm-stats'] });
      toast('Lead ganho! Abra o lead para converter em contato.', 'success');
      const lead = leads.find(l => l.id === id);
      if (lead) setSelectedLead({ ...lead, status: 'GANHO' });
    },
  });

  const markLostMut = useMutation({
    mutationFn: ({ id, lostReason }: { id: string; lostReason: string }) => leadsApi.markLost(id, lostReason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      qc.invalidateQueries({ queryKey: ['crm-stats'] });
      toast('Lead marcado como perdido.', 'success');
      setConfirmLost(null);
    },
  });

  const changeFunnelMut = useMutation({
    mutationFn: ({ id, funnelId, stageId }: { id: string; funnelId: string; stageId: string }) =>
      leadsApi.changeFunnel(id, funnelId, stageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      toast('Funil alterado com sucesso!', 'success');
      setConfirmChangeFunnel(null);
    },
    onError: () => toast('Erro ao mudar funil.', 'error'),
  });

  // Leads by stage
  const leadsByStage = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    if (activeFunnel) activeFunnel.stages.forEach(s => { map[s.id] = []; });
    (leads as Lead[]).forEach(l => { if (l.stageId && map[l.stageId]) map[l.stageId].push(l); });
    return map;
  }, [leads, activeFunnel]);

  // Drag handlers
  const handleDragStart = (leadId: string) => setDraggedLeadId(leadId);
  const handleDragEnd = () => setDraggedLeadId(null);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDropOnStage = (stageId: string) => {
    if (!draggedLeadId) return;
    const stage = activeFunnel?.stages.find(s => s.id === stageId);
    if (!stage) return;
    const stageLeads = leadsByStage[stageId] ?? [];
    moveMut.mutate({ leadId: draggedLeadId, stageId, stageOrder: stageLeads.length });
    if (stage.isWon) {
      const lead = leads.find(l => l.id === draggedLeadId);
      if (lead) setSelectedLead({ ...lead, status: 'GANHO' });
    }
    if (stage.isLost) {
      const lead = leads.find(l => l.id === draggedLeadId);
      if (lead) setConfirmLost(lead);
    }
    setDraggedLeadId(null);
  };

  const handleDropWin = () => {
    if (!draggedLeadId) return;
    markWonMut.mutate(draggedLeadId);
    setDraggedLeadId(null);
  };

  const handleDropLose = () => {
    if (!draggedLeadId) return;
    const lead = leads.find(l => l.id === draggedLeadId);
    if (lead) setConfirmLost(lead);
    setDraggedLeadId(null);
  };

  const handleDropChangeFunnel = () => {
    if (!draggedLeadId) return;
    const lead = leads.find(l => l.id === draggedLeadId);
    if (lead) setConfirmChangeFunnel(lead);
    setDraggedLeadId(null);
  };

  // KPI cards
  const kpiCards = [
    { label: 'Novos leads',        value: stats?.novo ?? 0,                   icon: 'ti-user-plus',       bg: '#F5F3FF', color: '#7C3AED' },
    { label: 'Em negociação',      value: stats?.emNegociacao ?? 0,           icon: 'ti-handshake',       bg: '#EFF6FF', color: '#2563EB' },
    { label: 'Agendados',          value: stats?.agendado ?? 0,               icon: 'ti-calendar-check',  bg: '#FFFBEB', color: '#D97706' },
    { label: 'Ganhos no mês',      value: stats?.ganhoMes ?? 0,               icon: 'ti-trophy',          bg: '#F0FDF4', color: '#16A34A' },
    { label: 'Perdidos no mês',    value: stats?.perdidoMes ?? 0,             icon: 'ti-x-circle',        bg: '#FEF2F2', color: '#DC2626' },
    { label: 'Em negociação (R$)', value: fmt(stats?.valorEmNegociacao ?? 0), icon: 'ti-currency-dollar', bg: '#F0FDF4', color: '#16A34A' },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: draggedLeadId ? 68 : 0 }}>

      {/* KPI + Filter bar */}
      <div style={{ flexShrink: 0, padding: '12px 24px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
          {kpiCards.map(k => (
            <div key={k.label} style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E4E4E7', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: k.bg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className={`ti ${k.icon}`} style={{ fontSize: 16, color: k.color }} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#71717A', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>{k.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#09090B', lineHeight: 1.1 }}>{k.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottom: '1px solid #E4E4E7' }}>
          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 20, padding: '0 12px', height: 34, minWidth: 240 }}>
            <i className="ti ti-search" style={{ fontSize: 13, color: '#A1A1AA', flexShrink: 0 }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, telefone, e-mail..." style={{ border: 'none', background: 'transparent', fontSize: 12, outline: 'none', width: '100%', color: '#09090B', fontFamily: 'inherit' }} />
          </div>
          {/* Funnel */}
          <select value={activeFunnelId} onChange={e => setSelectedFunnelId(e.target.value)} style={{ height: 34, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 20, fontSize: 12, color: '#09090B', background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}>
            {funnels.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          {/* Status */}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ height: 34, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 20, fontSize: 12, color: '#09090B', background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}>
            <option value="">Status</option>
            {Object.entries(LEAD_STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {/* Responsible */}
          <select value={assignedFilter} onChange={e => setAssignedFilter(e.target.value)} style={{ height: 34, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 20, fontSize: 12, color: '#09090B', background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}>
            <option value="">Responsável</option>
            {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          {/* Source */}
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} style={{ height: 34, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 20, fontSize: 12, color: '#09090B', background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}>
            <option value="">Origem</option>
            {sources.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {(search || statusFilter || assignedFilter || sourceFilter) && (
            <button onClick={() => { setSearch(''); setStatusFilter(''); setAssignedFilter(''); setSourceFilter(''); }} style={{ height: 34, padding: '0 12px', background: 'transparent', border: 'none', fontSize: 12, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="ti ti-x" style={{ fontSize: 11 }} /> Limpar
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={() => navigate('/settings?section=crm')} style={{ height: 34, padding: '0 12px', background: 'transparent', border: '1px solid #E4E4E7', borderRadius: 20, fontSize: 12, fontWeight: 500, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
            <i className="ti ti-file-import" style={{ fontSize: 13 }} /> Importar
          </button>
          <button style={{ height: 34, padding: '0 12px', background: 'transparent', border: '1px solid #E4E4E7', borderRadius: 20, fontSize: 12, fontWeight: 500, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
            <i className="ti ti-file-export" style={{ fontSize: 13 }} /> Exportar
          </button>
          <button onClick={() => setShowNovoLead(true)} style={{ height: 34, padding: '0 16px', background: '#000', border: 'none', borderRadius: 20, fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
            <i className="ti ti-plus" style={{ fontSize: 13 }} /> Novo lead
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      {leadsLoading || funnelsLoading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <SectionLoader label="Carregando leads..." />
        </div>
      ) : !activeFunnel || activeFunnel.stages.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: '#71717A' }}>
            <i className="ti ti-layout-kanban" style={{ fontSize: 40, color: '#D1D5DB', display: 'block', marginBottom: 12 }} />
            <div style={{ fontSize: 14, marginBottom: 4 }}>Nenhum funil configurado</div>
            <div style={{ fontSize: 12, color: '#A1A1AA' }}>Crie um funil em <b>Configurações &gt; CRM</b></div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 10, overflowX: 'auto', padding: '10px 24px 16px', alignItems: 'stretch' }}>
          {activeFunnel.stages.map(stage => {
            const stageLeads = leadsByStage[stage.id] ?? [];
            const stageValue = stageLeads.reduce((s, l) => s + (l.value ?? 0), 0);
            return (
              <div
                key={stage.id}
                onDragOver={handleDragOver}
                onDrop={() => handleDropOnStage(stage.id)}
                style={{ flex: '1 1 200px', minWidth: 200, maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                {/* Column header */}
                <div style={{ background: '#FFFFFF', borderRadius: 10, border: '1px solid #E4E4E7', padding: '10px 12px', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: stageValue > 0 ? 3 : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color || '#E5E7EB', flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#09090B' }}>{stage.name}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: '#F4F4F5', color: '#71717A' }}>{stageLeads.length}</span>
                    </div>
                    <button onClick={() => { setQuickAddStageId(stage.id); setShowNovoLead(true); }} style={{ width: 22, height: 22, border: 'none', background: '#F4F4F5', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A' }}>
                      <i className="ti ti-plus" style={{ fontSize: 11 }} />
                    </button>
                  </div>
                  {stageValue > 0 && <div style={{ fontSize: 11, color: '#71717A' }}>{fmt(stageValue)}</div>}
                </div>

                {/* Scrollable lead list */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 2 }}>
                  {stageLeads.map(lead => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      onDragStart={() => handleDragStart(lead.id)}
                      onDragEnd={handleDragEnd}
                      onClick={() => setSelectedLead(lead)}
                    />
                  ))}
                  {stageLeads.length === 0 && (
                    <div style={{ padding: '20px 12px', textAlign: 'center', color: '#D1D5DB', fontSize: 11 }}>
                      Solte um lead aqui
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Drag action bar */}
      {draggedLeadId && (
        <DragActionBar
          onGanhar={handleDropWin}
          onPerder={handleDropLose}
          onChangeFunnel={handleDropChangeFunnel}
        />
      )}

      {/* Overlays */}
      {showNovoLead && (
        <NovoLeadDrawer
          funnels={funnels}
          defaultFunnelId={activeFunnelId}
          defaultStageId={quickAddStageId ?? undefined}
          onClose={() => { setShowNovoLead(false); setQuickAddStageId(null); }}
        />
      )}
      {selectedLead && (
        <LeadDetailDrawer
          lead={selectedLead}
          funnels={funnels}
          onClose={() => setSelectedLead(null)}
          onChangeFunnel={lead => { setSelectedLead(null); setConfirmChangeFunnel(lead); }}
        />
      )}
      {confirmLost && (
        <MarkLostModal
          lead={confirmLost}
          onConfirm={reason => markLostMut.mutate({ id: confirmLost.id, lostReason: reason })}
          onCancel={() => setConfirmLost(null)}
          loading={markLostMut.isPending}
        />
      )}
      {confirmChangeFunnel && (
        <ChangeFunnelModal
          lead={confirmChangeFunnel}
          funnels={funnels}
          onConfirm={(funnelId, stageId) => changeFunnelMut.mutate({ id: confirmChangeFunnel.id, funnelId, stageId })}
          onCancel={() => setConfirmChangeFunnel(null)}
          loading={changeFunnelMut.isPending}
        />
      )}
    </div>
  );
}
