import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi, leadsApi, usersApi } from '../../services/api';
import { Portal } from '../../components/ui/Portal';
import { SectionLoader } from '../../components/ui/Loader';
import { useToast } from '../../components/ui/Toast';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  title: string;
  type: string;
  description?: string;
  dueDate?: string;
  assignedUserName?: string;
  status: string;
  priority: string;
  notes?: string;
  lead?: { id: string; name: string };
  assignedUser?: { id: string; name: string };
  createdAt: string;
}

interface PostIt {
  id: string;
  title?: string;
  content: string;
  color: string;
  pinned: boolean;
  createdAt: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TASK_TYPE_ICONS: Record<string, string> = {
  LIGACAO: 'ti-phone',
  WHATSAPP: 'ti-brand-whatsapp',
  REUNIAO: 'ti-users',
  CONSULTA: 'ti-stethoscope',
  RETORNO: 'ti-arrow-back',
  ADMINISTRATIVO: 'ti-briefcase',
  INTERNA: 'ti-clipboard',
  OUTRO: 'ti-dots',
};

const TASK_TYPE_LABELS: Record<string, string> = {
  LIGACAO: 'Ligação',
  WHATSAPP: 'WhatsApp',
  REUNIAO: 'Reunião',
  CONSULTA: 'Consulta',
  RETORNO: 'Retorno',
  ADMINISTRATIVO: 'Administrativo',
  INTERNA: 'Interna',
  OUTRO: 'Outro',
};

const TASK_STATUS_MAP: Record<string, { bg: string; color: string; label: string }> = {
  PENDENTE:     { bg: '#F4F4F5', color: '#71717A',  label: 'Pendente' },
  EM_ANDAMENTO: { bg: '#EFF6FF', color: '#2563EB',  label: 'Em andamento' },
  CONCLUIDA:    { bg: '#DCFCE7', color: '#16A34A',  label: 'Concluída' },
  CANCELADA:    { bg: '#FEF2F2', color: '#DC2626',  label: 'Cancelada' },
};

const PRIORITY_MAP: Record<string, { color: string; label: string }> = {
  BAIXA:   { color: '#71717A', label: 'Baixa' },
  MEDIA:   { color: '#2563EB', label: 'Média' },
  ALTA:    { color: '#D97706', label: 'Alta' },
  URGENTE: { color: '#DC2626', label: 'Urgente' },
};

const POST_IT_COLORS = [
  { value: '#FFFBEB', label: 'Amarelo' },
  { value: '#F0FDF4', label: 'Verde' },
  { value: '#EFF6FF', label: 'Azul' },
  { value: '#FEF2F2', label: 'Vermelho' },
];

const inputStyle: React.CSSProperties = {
  width: '100%', height: 36, padding: '0 12px',
  border: '1px solid #E4E4E7', borderRadius: 8,
  fontSize: 13, color: '#09090B', background: '#FFFFFF',
  fontFamily: "'Inter', system-ui, sans-serif",
  boxSizing: 'border-box', outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4, display: 'block',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const todayStart = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const tomorrowStart = () => { const d = todayStart(); d.setDate(d.getDate()+1); return d; };

function isOverdue(t: Task) {
  if (!t.dueDate) return false;
  return new Date(t.dueDate) < todayStart() && t.status !== 'CONCLUIDA' && t.status !== 'CANCELADA';
}
function isToday(t: Task) {
  if (!t.dueDate) return false;
  const d = new Date(t.dueDate);
  return d >= todayStart() && d < tomorrowStart() && t.status !== 'CONCLUIDA' && t.status !== 'CANCELADA';
}
function isUpcoming(t: Task) {
  if (!t.dueDate) return false;
  return new Date(t.dueDate) >= tomorrowStart() && t.status !== 'CONCLUIDA' && t.status !== 'CANCELADA';
}
function noDate(t: Task) {
  return !t.dueDate && t.status !== 'CONCLUIDA' && t.status !== 'CANCELADA';
}
function isCompleted(t: Task) {
  return t.status === 'CONCLUIDA';
}

// ─── NovaTaskDrawer ───────────────────────────────────────────────────────────

function NovaTaskDrawer({
  editTask,
  onClose,
}: {
  editTask?: Task | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState({
    title: editTask?.title ?? '',
    type: editTask?.type ?? 'LIGACAO',
    description: editTask?.description ?? '',
    dueDate: editTask?.dueDate ? editTask.dueDate.slice(0, 16) : '',
    assignedUserId: (editTask as any)?.assigneeId ?? (editTask as any)?.assignee?.id ?? '',
    status: editTask?.status ?? 'PENDENTE',
    priority: editTask?.priority ?? 'MEDIA',
    notes: editTask?.notes ?? '',
    leadId: editTask?.lead?.id ?? '',
  });

  const { data: leads = [] } = useQuery<any[]>({
    queryKey: ['leads-for-task'],
    queryFn: () => leadsApi.list({}),
  });
  const { data: users = [] } = useQuery<any[]>({ queryKey: ['users'], queryFn: usersApi.list });

  const set = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const saveMut = useMutation({
    mutationFn: (data: any) => editTask ? tasksApi.update(editTask.id, data) : tasksApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks-list'] });
      qc.invalidateQueries({ queryKey: ['tasks-stats'] });
      toast(editTask ? 'Tarefa atualizada!' : 'Tarefa criada!', 'success');
      onClose();
    },
    onError: () => toast('Erro ao salvar tarefa.', 'error'),
  });

  const handleSave = () => {
    if (!form.title.trim()) { toast('Título é obrigatório.', 'error'); return; }
    const payload: any = { ...form };
    if (!payload.dueDate) delete payload.dueDate;
    if (!payload.assignedUserId) delete payload.assignedUserId;
    if (!payload.leadId) delete payload.leadId;
    if (!payload.notes) delete payload.notes;
    if (!payload.description) delete payload.description;
    saveMut.mutate(payload);
  };

  return (
    <Portal>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 1000 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 480, zIndex: 1001,
        background: '#FFFFFF', boxShadow: '-4px 0 40px rgba(0,0,0,0.14)',
        display: 'flex', flexDirection: 'column', animation: 'slideIn .22s ease',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}>
        {/* Header */}
        <div style={{ flexShrink: 0, padding: '20px 24px', borderBottom: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#09090B', margin: 0 }}>{editTask ? 'Editar tarefa' : 'Nova tarefa'}</h2>
            <p style={{ fontSize: 12, color: '#71717A', margin: '2px 0 0' }}>Atividade da equipe</p>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, border: 'none', background: '#F4F4F5', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A' }}>
            <i className="ti ti-x" style={{ fontSize: 15 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={labelStyle}>Título *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Título da tarefa" style={inputStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={labelStyle}>Tipo</label>
              <select value={form.type} onChange={e => set('type', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {Object.entries(TASK_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={labelStyle}>Prioridade</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {Object.entries(PRIORITY_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={labelStyle}>Data/hora</label>
              <input value={form.dueDate} onChange={e => set('dueDate', e.target.value)} style={inputStyle} type="datetime-local" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={labelStyle}>Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {Object.entries(TASK_STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={labelStyle}>Responsável</label>
              <select value={form.assignedUserId} onChange={e => set('assignedUserId', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">Sem responsável</option>
                {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={labelStyle}>Lead <span style={{ color: '#A1A1AA', fontWeight: 400 }}>(opcional)</span></label>
              <select value={form.leadId} onChange={e => set('leadId', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">Sem vínculo</option>
                {leads.map((l: any) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={labelStyle}>Descrição</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Descreva a tarefa..." rows={3} style={{ ...inputStyle, height: 'auto', padding: '8px 12px', resize: 'vertical' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={labelStyle}>Observações</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Notas adicionais..." rows={2} style={{ ...inputStyle, height: 'auto', padding: '8px 12px', resize: 'vertical' }} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0, padding: '16px 24px', borderTop: '1px solid #E4E4E7', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ height: 36, padding: '0 14px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saveMut.isPending} style={{ height: 36, padding: '0 16px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', opacity: saveMut.isPending ? 0.6 : 1 }}>
            {saveMut.isPending ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </Portal>
  );
}

// ─── TaskRow ──────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  onEdit,
  onComplete,
  onDelete,
}: {
  task: Task;
  onEdit: () => void;
  onComplete: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const icon = TASK_TYPE_ICONS[task.type] ?? 'ti-dots';
  const st = TASK_STATUS_MAP[task.status] ?? TASK_STATUS_MAP.PENDENTE;
  const pr = PRIORITY_MAP[task.priority];

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid #F4F4F5', position: 'relative' }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = '#F9F9F9'}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
    >
      {/* Done checkbox */}
      <button
        onClick={onComplete}
        style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${task.status === 'CONCLUIDA' ? '#16A34A' : '#D4D4D8'}`, background: task.status === 'CONCLUIDA' ? '#16A34A' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
      >
        {task.status === 'CONCLUIDA' && <i className="ti ti-check" style={{ fontSize: 10, color: '#fff' }} />}
      </button>

      {/* Type icon */}
      <div style={{ width: 28, height: 28, borderRadius: 7, background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <i className={`ti ${icon}`} style={{ fontSize: 13, color: '#71717A' }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: task.status === 'CONCLUIDA' ? '#A1A1AA' : '#09090B', textDecoration: task.status === 'CONCLUIDA' ? 'line-through' : 'none' }}>
            {task.title}
          </span>
          {pr && pr.label !== 'Média' && (
            <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: pr.color + '18', color: pr.color }}>{pr.label}</span>
          )}
          {task.lead && (
            <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 99, background: '#F5F3FF', color: '#7C3AED', display: 'flex', alignItems: 'center', gap: 3 }}>
              <i className="ti ti-layout-kanban" style={{ fontSize: 9 }} /> {task.lead.name}
            </span>
          )}
        </div>
      </div>

      {/* Due date */}
      {task.dueDate && (
        <div style={{ fontSize: 11, color: isOverdue(task) ? '#DC2626' : '#71717A', whiteSpace: 'nowrap', flexShrink: 0 }}>
          <i className="ti ti-calendar" style={{ fontSize: 11, marginRight: 3 }} />
          {new Date(task.dueDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </div>
      )}

      {/* Status badge */}
      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: st.bg, color: st.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
        {st.label}
      </span>

      {/* Actions menu */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={() => setMenuOpen(o => !o)}
          style={{ width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A1A1AA' }}
        >
          <i className="ti ti-dots-vertical" style={{ fontSize: 14 }} />
        </button>
        {menuOpen && (
          <>
            <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
            <div style={{ position: 'absolute', right: 0, top: '100%', width: 150, background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 100, padding: 4, fontFamily: "'Inter', system-ui, sans-serif" }}>
              <button onClick={() => { setMenuOpen(false); onEdit(); }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', border: 'none', background: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, color: '#374151', fontFamily: 'inherit' }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#F4F4F5'}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}>
                <i className="ti ti-edit" style={{ fontSize: 13, color: '#71717A' }} /> Editar
              </button>
              {task.status !== 'CONCLUIDA' && (
                <button onClick={() => { setMenuOpen(false); onComplete(); }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', border: 'none', background: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, color: '#16A34A', fontFamily: 'inherit' }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#F0FDF4'}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}>
                  <i className="ti ti-check" style={{ fontSize: 13 }} /> Concluir
                </button>
              )}
              <button onClick={() => { setMenuOpen(false); onDelete(); }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', border: 'none', background: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, color: '#DC2626', fontFamily: 'inherit' }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2'}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}>
                <i className="ti ti-trash" style={{ fontSize: 13 }} /> Excluir
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── TaskGroup ────────────────────────────────────────────────────────────────

function TaskGroup({
  label,
  tasks,
  color,
  onEdit,
  onComplete,
  onDelete,
}: {
  label: string;
  tasks: Task[];
  color?: string;
  onEdit: (t: Task) => void;
  onComplete: (t: Task) => void;
  onDelete: (t: Task) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (tasks.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <button
        onClick={() => setCollapsed(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', marginBottom: 8, padding: '4px 0', fontFamily: "'Inter', system-ui, sans-serif" }}
      >
        <i className={`ti ti-chevron-${collapsed ? 'right' : 'down'}`} style={{ fontSize: 12, color: '#A1A1AA' }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: color ?? '#374151', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 99, background: '#F4F4F5', color: '#71717A' }}>{tasks.length}</span>
      </button>
      {!collapsed && (
        <div style={{ background: '#FFFFFF', borderRadius: 10, border: '1px solid #E4E4E7' }}>
          {tasks.map(t => (
            <TaskRow
              key={t.id}
              task={t}
              onEdit={() => onEdit(t)}
              onComplete={() => onComplete(t)}
              onDelete={() => onDelete(t)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PostItPanel ──────────────────────────────────────────────────────────────

function PostItPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [newColor, setNewColor] = useState('#FFFBEB');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

  const { data: postIts = [] } = useQuery<PostIt[]>({
    queryKey: ['post-its'],
    queryFn: () => tasksApi.postIts(),
  });

  const createMut = useMutation({
    mutationFn: (data: any) => tasksApi.createPostIt(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['post-its'] });
      setShowForm(false);
      setNewTitle(''); setNewContent(''); setNewColor('#FFFBEB');
      toast('Anotação criada!', 'success');
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => tasksApi.updatePostIt(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['post-its'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => tasksApi.deletePostIt(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['post-its'] }),
  });

  const handleCreate = () => {
    if (!newContent.trim()) { toast('Conteúdo é obrigatório.', 'error'); return; }
    createMut.mutate({ title: newTitle || undefined, content: newContent, color: newColor, pinned: false });
  };

  return (
    <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Panel header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#09090B' }}>Anotações</span>
        <button
          onClick={() => setShowForm(o => !o)}
          style={{ width: 28, height: 28, border: 'none', background: '#F4F4F5', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A' }}
        >
          <i className={`ti ti-${showForm ? 'x' : 'plus'}`} style={{ fontSize: 13 }} />
        </button>
      </div>

      {/* New post-it form */}
      {showForm && (
        <div style={{ background: '#FFFFFF', borderRadius: 10, border: '1px solid #E4E4E7', padding: '14px' }}>
          {/* Color picker */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {POST_IT_COLORS.map(c => (
              <button
                key={c.value}
                onClick={() => setNewColor(c.value)}
                title={c.label}
                style={{
                  width: 22, height: 22, borderRadius: '50%', background: c.value,
                  border: newColor === c.value ? '2px solid #09090B' : '2px solid #E4E4E7',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
          <input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Título (opcional)"
            style={{ ...inputStyle, marginBottom: 8 }}
          />
          <textarea
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            placeholder="Escreva sua anotação..."
            rows={3}
            style={{ ...inputStyle, height: 'auto', padding: '8px 12px', resize: 'none', marginBottom: 10 }}
          />
          <button
            onClick={handleCreate}
            disabled={createMut.isPending}
            style={{ width: '100%', height: 32, background: '#000', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {createMut.isPending ? 'Salvando...' : 'Salvar anotação'}
          </button>
        </div>
      )}

      {/* Post-it list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Pinned first */}
        {[...postIts].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)).map(pit => (
          <div
            key={pit.id}
            style={{ background: pit.color || '#FFFBEB', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(0,0,0,0.06)' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: pit.title ? 6 : 0 }}>
              {pit.title && (
                <span style={{ fontSize: 12, fontWeight: 700, color: '#09090B', flex: 1, marginRight: 4 }}>{pit.title}</span>
              )}
              {!pit.title && <span style={{ flex: 1 }} />}
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button
                  onClick={() => updateMut.mutate({ id: pit.id, data: { pinned: !pit.pinned } })}
                  style={{ width: 22, height: 22, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: pit.pinned ? '#D97706' : '#A1A1AA' }}
                  title={pit.pinned ? 'Desafixar' : 'Fixar'}
                >
                  <i className="ti ti-pin" style={{ fontSize: 12 }} />
                </button>
                <button
                  onClick={() => { if (window.confirm('Excluir anotação?')) deleteMut.mutate(pit.id); }}
                  style={{ width: 22, height: 22, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A1A1AA' }}
                  title="Excluir"
                >
                  <i className="ti ti-trash" style={{ fontSize: 12 }} />
                </button>
              </div>
            </div>
            <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{pit.content}</p>
            <div style={{ fontSize: 10, color: '#A1A1AA', marginTop: 8 }}>
              {pit.createdAt ? new Date(pit.createdAt).toLocaleDateString('pt-BR') : ''}
              {pit.pinned && <span style={{ marginLeft: 6, fontWeight: 600, color: '#D97706' }}>Fixado</span>}
            </div>
          </div>
        ))}
        {postIts.length === 0 && !showForm && (
          <div style={{ textAlign: 'center', color: '#A1A1AA', fontSize: 12, padding: '16px 0' }}>
            <i className="ti ti-note" style={{ fontSize: 24, display: 'block', marginBottom: 6 }} />
            Nenhuma anotação
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TasksPage ────────────────────────────────────────────────────────────────

export function TasksPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showNovaTask, setShowNovaTask] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['tasks-list', statusFilter, typeFilter],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.type = typeFilter;
      return tasksApi.list(params);
    },
  });

  const { data: taskStats } = useQuery<any>({
    queryKey: ['tasks-stats'],
    queryFn: () => tasksApi.stats(),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => tasksApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks-list'] });
      qc.invalidateQueries({ queryKey: ['tasks-stats'] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => tasksApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks-list'] });
      qc.invalidateQueries({ queryKey: ['tasks-stats'] });
      toast('Tarefa excluída.', 'success');
    },
    onError: () => toast('Erro ao excluir tarefa.', 'error'),
  });

  const handleComplete = (task: Task) => {
    const nextStatus = task.status === 'CONCLUIDA' ? 'PENDENTE' : 'CONCLUIDA';
    updateMut.mutate({ id: task.id, data: { status: nextStatus } });
  };

  const handleDelete = (task: Task) => {
    if (window.confirm(`Excluir "${task.title}"?`)) {
      deleteMut.mutate(task.id);
    }
  };

  const handleEdit = (task: Task) => {
    setEditTask(task);
    setShowNovaTask(true);
  };

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter && t.status !== statusFilter) return false;
      if (typeFilter && t.type !== typeFilter) return false;
      return true;
    });
  }, [tasks, search, statusFilter, typeFilter]);

  // Group
  const overdueTasks  = filteredTasks.filter(isOverdue);
  const todayTasks    = filteredTasks.filter(isToday);
  const upcomingTasks = filteredTasks.filter(isUpcoming);
  const noDateTasks   = filteredTasks.filter(noDate);
  const completedTasks = filteredTasks.filter(isCompleted);

  // KPI cards
  const kpiCards = [
    { label: 'Hoje',           value: taskStats?.today ?? todayTasks.length,         icon: 'ti-calendar-today', bg: '#EFF6FF', color: '#2563EB' },
    { label: 'Atrasadas',      value: taskStats?.overdue ?? overdueTasks.length,      icon: 'ti-clock-exclamation', bg: '#FEF2F2', color: '#DC2626' },
    { label: 'Próximas',       value: taskStats?.upcoming ?? upcomingTasks.length,    icon: 'ti-calendar-event', bg: '#FFFBEB', color: '#D97706' },
    { label: 'Concluídas hoje',value: taskStats?.completedToday ?? 0,                icon: 'ti-checkbox',       bg: '#F0FDF4', color: '#16A34A' },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* KPI Cards */}
      <div style={{ flexShrink: 0, padding: '24px 40px 0', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {kpiCards.map(k => (
          <div key={k.label} style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E4E4E7', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: k.bg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className={`ti ${k.icon}`} style={{ fontSize: 18, color: k.color }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#71717A', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#09090B' }}>{k.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', gap: 20, minHeight: 0, overflow: 'hidden', padding: '20px 40px' }}>

        {/* Left: Task list */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, overflowY: 'auto' }}>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flexShrink: 0, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 20, padding: '0 14px', height: 36, width: 240 }}>
                <i className="ti ti-search" style={{ fontSize: 14, color: '#A1A1AA', flexShrink: 0 }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar tarefa..."
                  style={{ border: 'none', background: 'transparent', fontSize: 13, outline: 'none', width: '100%', color: '#09090B', fontFamily: 'inherit' }}
                />
              </div>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{ height: 36, padding: '0 14px', border: '1px solid #E4E4E7', borderRadius: 20, fontSize: 13, color: '#09090B', background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <option value="">Todos os status</option>
                {Object.entries(TASK_STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                style={{ height: 36, padding: '0 14px', border: '1px solid #E4E4E7', borderRadius: 20, fontSize: 13, color: '#09090B', background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <option value="">Todos os tipos</option>
                {Object.entries(TASK_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              {(search || statusFilter || typeFilter) && (
                <button
                  onClick={() => { setSearch(''); setStatusFilter(''); setTypeFilter(''); }}
                  style={{ height: 36, padding: '0 14px', background: 'transparent', border: '1px solid #E4E4E7', borderRadius: 20, fontSize: 13, fontWeight: 500, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <i className="ti ti-x" style={{ fontSize: 12 }} /> Limpar
                </button>
              )}
            </div>
            <button
              onClick={() => { setEditTask(null); setShowNovaTask(true); }}
              style={{ height: 36, padding: '0 16px', background: '#000', border: 'none', borderRadius: 20, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
            >
              <i className="ti ti-plus" style={{ fontSize: 14 }} /> Nova tarefa
            </button>
          </div>

          {/* Task groups */}
          {isLoading ? (
            <SectionLoader label="Carregando tarefas..." />
          ) : filteredTasks.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 200 }}>
              <div style={{ textAlign: 'center', color: '#71717A' }}>
                <i className="ti ti-checkbox" style={{ fontSize: 40, color: '#D1D5DB', display: 'block', marginBottom: 12 }} />
                <div style={{ fontSize: 15, fontWeight: 600, color: '#09090B', marginBottom: 4 }}>Nenhuma tarefa encontrada</div>
                <div style={{ fontSize: 13, color: '#A1A1AA' }}>Crie uma nova tarefa para começar</div>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1 }}>
              <TaskGroup label="Atrasadas" tasks={overdueTasks} color="#DC2626" onEdit={handleEdit} onComplete={handleComplete} onDelete={handleDelete} />
              <TaskGroup label="Hoje" tasks={todayTasks} color="#2563EB" onEdit={handleEdit} onComplete={handleComplete} onDelete={handleDelete} />
              <TaskGroup label="Próximas" tasks={upcomingTasks} color="#D97706" onEdit={handleEdit} onComplete={handleComplete} onDelete={handleDelete} />
              <TaskGroup label="Sem data" tasks={noDateTasks} color="#71717A" onEdit={handleEdit} onComplete={handleComplete} onDelete={handleDelete} />
              <TaskGroup label="Concluídas" tasks={completedTasks} color="#16A34A" onEdit={handleEdit} onComplete={handleComplete} onDelete={handleDelete} />
            </div>
          )}
        </div>

        {/* Right: Post-its */}
        <PostItPanel />
      </div>

      {/* Drawer */}
      {showNovaTask && (
        <NovaTaskDrawer
          editTask={editTask}
          onClose={() => { setShowNovaTask(false); setEditTask(null); }}
        />
      )}
    </div>
  );
}
