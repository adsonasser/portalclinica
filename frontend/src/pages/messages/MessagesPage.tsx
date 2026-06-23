import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { conversationsApi, quickRepliesApi, patientsApi, whatsAppApi } from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { Portal } from '../../components/ui/Portal';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Contact { id: string; name: string; phone: string | null; avatarUrl: string | null }
interface Conversation {
  id: string; clinicId: string; contactId: string | null; channel: string; provider: string;
  status: string; lastMessageAt: string | null; lastMessagePreview: string | null;
  unreadCount: number; closedAt: string | null; closeReason: string | null;
  contact: Contact | null;
  guestPhone: string | null; guestName: string | null;
}
interface ChatMessage {
  id: string; conversationId: string; direction: 'inbound' | 'outbound'; content: string;
  status: string; sentAt: string | null; receivedAt: string | null;
  createdAt: string; sentBy: { id: string; name: string } | null;
}
interface QuickReply {
  id: string; title: string; shortcut: string | null; content: string;
  category: string | null; isActive: boolean;
}
interface Patient { id: string; name: string; phone: string | null; cpf?: string | null; status?: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────
function convName(c: Conversation) {
  return c.contact?.name || c.guestName || c.guestPhone || 'Desconhecido';
}
function looksLikeLid(p: string) {
  // LIDs são 14-15 dígitos que não começam com código de país real
  // Nros brasileiros: 12-13 dígitos começando com 55
  return /^\d{14,}$/.test(p) && !p.startsWith('55');
}
function convPhone(c: Conversation) {
  const p = c.contact?.phone || c.guestPhone || '';
  return looksLikeLid(p) ? '' : p;
}
function convIsGuest(c: Conversation) {
  return !c.contactId;
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}
function avatarColor(name: string) {
  const colors = ['#2563EB','#7C3AED','#D97706','#16A34A','#DC2626','#0D9488','#C2410C','#4F46E5'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length;
  return colors[Math.abs(h)];
}
function fmtTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'ontem';
  if (diffDays < 7) return d.toLocaleDateString('pt-BR', { weekday: 'short' });
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
function fmtMsgTime(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (!digits || digits.length < 8) return '';
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}
function isValidPhone(phone: string | null) {
  if (!phone) return false;
  const n = normalizePhone(phone);
  return n.length >= 10;
}

// ─── Nova Conversa Drawer ─────────────────────────────────────────────────────
function NewConvDrawer({ open, onClose, onOpen }: {
  open: boolean;
  onClose: () => void;
  onOpen: (conv: Conversation) => void;
}) {
  const [search, setSearch] = useState('');
  const [opening, setOpening] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ['patients-for-conv'],
    queryFn: () => patientsApi.list({ limit: '300' }),
    enabled: open,
    select: (data: any) => {
      const list = Array.isArray(data) ? data : (data?.data ?? data?.patients ?? []);
      return list.filter((p: Patient) => isValidPhone(p.phone));
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return patients;
    const q = search.toLowerCase();
    return patients.filter((p: Patient) =>
      p.name.toLowerCase().includes(q) ||
      (p.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, '')) ||
      (p.cpf || '').replace(/\D/g, '').includes(q.replace(/\D/g, ''))
    );
  }, [patients, search]);

  async function handleSelect(patient: Patient) {
    setOpening(patient.id);
    try {
      const conv = await conversationsApi.open(patient.id);
      onOpen(conv);
      onClose();
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Erro ao abrir conversa', 'error');
    } finally {
      setOpening(null);
    }
  }

  if (!open) return null;
  return (
    <Portal>
      <div style={{ position:'fixed', inset:0, zIndex:1000 }} onClick={onClose} />
      <div style={{
        position:'fixed', top:0, right:0, bottom:0, width:420, zIndex:1001,
        background:'#FFFFFF', boxShadow:'-4px 0 24px rgba(0,0,0,.12)',
        display:'flex', flexDirection:'column', fontFamily:"'Inter', system-ui, sans-serif",
      }}>
        {/* Header */}
        <div style={{ padding:'20px 24px', borderBottom:'1px solid #E4E4E7', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:'#09090B' }}>Nova conversa</div>
              <div style={{ fontSize:12, color:'#71717A', marginTop:2 }}>Selecione um contato com telefone</div>
            </div>
            <button onClick={onClose} style={{ width:32, height:32, border:'none', background:'#F4F4F5', borderRadius:8, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className="ti ti-x" style={{ fontSize:15, color:'#71717A' }} />
            </button>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, height:36, padding:'0 12px', border:'1px solid #E4E4E7', borderRadius:8, background:'#F8F9FA' }}>
            <i className="ti ti-search" style={{ fontSize:14, color:'#A1A1AA', flexShrink:0 }} />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome, telefone ou CPF..."
              style={{ border:'none', background:'transparent', fontSize:13, outline:'none', width:'100%', fontFamily:'inherit', color:'#09090B' }}
            />
          </div>
        </div>

        {/* List */}
        <div style={{ flex:1, overflowY:'auto' }}>
          {filtered.length === 0 && (
            <div style={{ padding:'48px 24px', textAlign:'center' }}>
              <i className="ti ti-users-off" style={{ fontSize:32, color:'#D1D5DB', display:'block', marginBottom:10 }} />
              <div style={{ fontSize:13, color:'#6B7280', fontWeight:500 }}>
                {search ? 'Nenhum contato encontrado' : 'Nenhum contato com telefone cadastrado'}
              </div>
            </div>
          )}
          {filtered.map((p: Patient) => (
            <div
              key={p.id}
              onClick={() => !opening && handleSelect(p)}
              style={{ padding:'12px 24px', borderBottom:'1px solid #F4F4F5', cursor: opening ? 'wait' : 'pointer', display:'flex', alignItems:'center', gap:12, transition:'background .1s' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F9F9F9')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ width:38, height:38, borderRadius:'50%', background:avatarColor(p.name), display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#fff', flexShrink:0 }}>
                {initials(p.name)}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600, color:'#09090B', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</div>
                <div style={{ fontSize:12, color:'#71717A', display:'flex', alignItems:'center', gap:6, marginTop:2 }}>
                  <i className="ti ti-brand-whatsapp" style={{ fontSize:11, color:'#16A34A' }} />
                  {p.phone}
                </div>
              </div>
              {opening === p.id
                ? <i className="ti ti-loader-2" style={{ fontSize:16, color:'#A1A1AA', animation:'spin 1s linear infinite', flexShrink:0 }} />
                : <i className="ti ti-chevron-right" style={{ fontSize:14, color:'#D1D5DB', flexShrink:0 }} />
              }
            </div>
          ))}
        </div>
      </div>
    </Portal>
  );
}

// ─── Fechar Conversa Modal ────────────────────────────────────────────────────
function CloseConvModal({ open, onClose, onConfirm, loading }: {
  open: boolean; onClose: () => void;
  onConfirm: (reason: string) => void; loading: boolean;
}) {
  const [reason, setReason] = useState('');
  if (!open) return null;
  return (
    <Portal>
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onClose}>
        <div style={{ background:'#fff', borderRadius:16, padding:'28px 32px', width:420, boxShadow:'0 8px 32px rgba(0,0,0,.16)', fontFamily:"'Inter', system-ui, sans-serif" }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize:16, fontWeight:700, color:'#09090B', marginBottom:4 }}>Fechar conversa</div>
          <div style={{ fontSize:13, color:'#71717A', marginBottom:20 }}>A conversa será movida para "Fechadas". Você pode reabri-la a qualquer momento.</div>
          <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:6 }}>Motivo (opcional)</label>
          <textarea
            autoFocus
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Ex: Atendimento concluído, aguardando retorno..."
            rows={3}
            style={{ width:'100%', border:'1px solid #E4E4E7', borderRadius:8, padding:'10px 12px', fontSize:13, fontFamily:'inherit', outline:'none', resize:'none', color:'#09090B', boxSizing:'border-box' }}
          />
          <div style={{ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' }}>
            <button onClick={onClose} style={{ height:36, padding:'0 16px', background:'#F4F4F5', border:'none', borderRadius:8, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit' }}>
              Cancelar
            </button>
            <button onClick={() => onConfirm(reason)} disabled={loading} style={{ height:36, padding:'0 16px', background:'#000', border:'none', borderRadius:8, fontSize:13, fontWeight:600, color:'#fff', cursor:loading?'wait':'pointer', fontFamily:'inherit', opacity:loading?.6:1 }}>
              {loading ? 'Fechando...' : 'Fechar conversa'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ─── Quick Replies Popover ────────────────────────────────────────────────────
function QuickRepliesPopover({ replies, filter, onSelect, anchorRef }: {
  replies: QuickReply[];
  filter: string;
  onSelect: (content: string) => void;
  anchorRef: React.RefObject<HTMLDivElement | null>;
}) {
  const visible = replies.filter(r => {
    if (!filter) return true;
    const q = filter.replace(/^\//, '').toLowerCase();
    return (
      r.title.toLowerCase().includes(q) ||
      (r.shortcut || '').toLowerCase().includes(q) ||
      r.content.toLowerCase().includes(q)
    );
  });

  if (visible.length === 0) return null;

  return (
    <div style={{
      position:'absolute', bottom:'calc(100% + 8px)', left:0, right:0,
      background:'#fff', border:'1px solid #E4E4E7', borderRadius:12,
      boxShadow:'0 8px 24px rgba(0,0,0,.12)', maxHeight:280, overflowY:'auto', zIndex:200,
    }}>
      <div style={{ padding:'8px 14px 6px', fontSize:11, fontWeight:600, color:'#71717A', textTransform:'uppercase', letterSpacing:'.06em', borderBottom:'1px solid #F4F4F5' }}>
        Respostas rápidas
      </div>
      {visible.map(r => (
        <div key={r.id} onClick={() => onSelect(r.content)}
          style={{ padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid #F9F9F9' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#F9F9F9')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
            <span style={{ fontSize:12, fontWeight:600, color:'#09090B' }}>{r.title}</span>
            {r.shortcut && (
              <span style={{ fontSize:10, fontWeight:600, padding:'1px 6px', borderRadius:4, background:'#F4F4F5', color:'#71717A' }}>{r.shortcut}</span>
            )}
            {r.category && (
              <span style={{ fontSize:10, padding:'1px 6px', borderRadius:99, background:'#EFF6FF', color:'#2563EB' }}>{r.category}</span>
            )}
          </div>
          <div style={{ fontSize:12, color:'#71717A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.content}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Gerenciar Respostas Rápidas ──────────────────────────────────────────────
function QuickRepliesManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<QuickReply | null>(null);
  const [form, setForm] = useState({ title:'', shortcut:'', content:'', category:'', isActive:true });

  const { data: replies = [] } = useQuery<QuickReply[]>({
    queryKey: ['quick-replies'],
    queryFn: () => quickRepliesApi.list(),
    enabled: open,
  });

  const createMut = useMutation({
    mutationFn: (data: any) => quickRepliesApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quick-replies'] }); resetForm(); toast('Resposta criada', 'success'); },
    onError: () => toast('Erro ao criar resposta', 'error'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => quickRepliesApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quick-replies'] }); resetForm(); toast('Resposta atualizada', 'success'); },
    onError: () => toast('Erro ao atualizar', 'error'),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => quickRepliesApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quick-replies'] }); toast('Removida', 'success'); },
    onError: () => toast('Erro ao remover', 'error'),
  });

  function resetForm() { setEditing(null); setForm({ title:'', shortcut:'', content:'', category:'', isActive:true }); }
  function startEdit(r: QuickReply) { setEditing(r); setForm({ title:r.title, shortcut:r.shortcut||'', content:r.content, category:r.category||'', isActive:r.isActive }); }
  function submit() {
    if (!form.title.trim() || !form.content.trim()) { toast('Título e conteúdo são obrigatórios', 'error'); return; }
    if (editing) updateMut.mutate({ id: editing.id, data: form });
    else createMut.mutate(form);
  }

  if (!open) return null;
  return (
    <Portal>
      <div style={{ position:'fixed', inset:0, zIndex:1000 }} onClick={onClose} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:520, zIndex:1001, background:'#fff', boxShadow:'-4px 0 24px rgba(0,0,0,.12)', display:'flex', flexDirection:'column', fontFamily:"'Inter', system-ui, sans-serif" }}>
        <div style={{ padding:'20px 24px', borderBottom:'1px solid #E4E4E7', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:'#09090B' }}>Respostas rápidas</div>
            <div style={{ fontSize:12, color:'#71717A', marginTop:2 }}>Cadastre mensagens prontas para usar</div>
          </div>
          <button onClick={onClose} style={{ width:32, height:32, border:'none', background:'#F4F4F5', borderRadius:8, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <i className="ti ti-x" style={{ fontSize:15, color:'#71717A' }} />
          </button>
        </div>

        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          {/* Form */}
          <div style={{ padding:'20px 24px', borderBottom:'1px solid #E4E4E7', flexShrink:0, background:'#FAFAFA' }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#09090B', marginBottom:14 }}>{editing ? 'Editar resposta' : 'Nova resposta'}</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
              <div>
                <label style={{ fontSize:12, fontWeight:500, color:'#374151', display:'block', marginBottom:4 }}>Título *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Ex: Confirmação de consulta"
                  style={{ width:'100%', height:34, border:'1px solid #E4E4E7', borderRadius:7, padding:'0 10px', fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize:12, fontWeight:500, color:'#374151', display:'block', marginBottom:4 }}>Atalho</label>
                <input value={form.shortcut} onChange={e => setForm(f => ({ ...f, shortcut: e.target.value }))}
                  placeholder="Ex: /confirmar"
                  style={{ width:'100%', height:34, border:'1px solid #E4E4E7', borderRadius:7, padding:'0 10px', fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }} />
              </div>
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:12, fontWeight:500, color:'#374151', display:'block', marginBottom:4 }}>Conteúdo *</label>
              <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="Olá, {{nome}}! Passando para confirmar..."
                rows={3}
                style={{ width:'100%', border:'1px solid #E4E4E7', borderRadius:7, padding:'8px 10px', fontSize:13, fontFamily:'inherit', outline:'none', resize:'none', boxSizing:'border-box' }} />
              <div style={{ fontSize:11, color:'#A1A1AA', marginTop:3 }}>Variáveis: {'{{nome}}'}, {'{{primeiro_nome}}'}, {'{{telefone}}'}, {'{{nome_clinica}}'}</div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:12, alignItems:'flex-end' }}>
              <div>
                <label style={{ fontSize:12, fontWeight:500, color:'#374151', display:'block', marginBottom:4 }}>Categoria</label>
                <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  placeholder="Ex: Agendamento, Financeiro..."
                  style={{ width:'100%', height:34, border:'1px solid #E4E4E7', borderRadius:7, padding:'0 10px', fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }} />
              </div>
              <div style={{ display:'flex', gap:8 }}>
                {editing && (
                  <button onClick={resetForm} style={{ height:34, padding:'0 14px', background:'#F4F4F5', border:'none', borderRadius:7, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
                    Cancelar
                  </button>
                )}
                <button onClick={submit} style={{ height:34, padding:'0 16px', background:'#000', border:'none', borderRadius:7, fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>
                  {editing ? 'Salvar' : 'Adicionar'}
                </button>
              </div>
            </div>
          </div>

          {/* List */}
          <div style={{ flex:1, overflowY:'auto' }}>
            {replies.length === 0 && (
              <div style={{ padding:'40px 24px', textAlign:'center', color:'#A1A1AA', fontSize:13 }}>
                Nenhuma resposta rápida cadastrada ainda.
              </div>
            )}
            {replies.map(r => (
              <div key={r.id} style={{ padding:'12px 24px', borderBottom:'1px solid #F4F4F5', display:'flex', gap:12, alignItems:'flex-start' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                    <span style={{ fontSize:13, fontWeight:600, color:'#09090B' }}>{r.title}</span>
                    {r.shortcut && <span style={{ fontSize:10, fontWeight:600, padding:'1px 6px', borderRadius:4, background:'#F4F4F5', color:'#71717A' }}>{r.shortcut}</span>}
                    {r.category && <span style={{ fontSize:10, padding:'1px 6px', borderRadius:99, background:'#EFF6FF', color:'#2563EB' }}>{r.category}</span>}
                    {!r.isActive && <span style={{ fontSize:10, padding:'1px 6px', borderRadius:99, background:'#FEF2F2', color:'#DC2626' }}>Inativo</span>}
                  </div>
                  <div style={{ fontSize:12, color:'#71717A', lineHeight:1.5, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' as any }}>{r.content}</div>
                </div>
                <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                  <button onClick={() => startEdit(r)} style={{ width:30, height:30, border:'1px solid #E4E4E7', background:'#fff', borderRadius:6, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <i className="ti ti-pencil" style={{ fontSize:13, color:'#71717A' }} />
                  </button>
                  <button onClick={() => removeMut.mutate(r.id)} style={{ width:30, height:30, border:'1px solid #FECACA', background:'#FEF2F2', borderRadius:6, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <i className="ti ti-trash" style={{ fontSize:13, color:'#DC2626' }} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function MessagesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'open' | 'closed' | 'unread' | 'all'>('open');
  const [compose, setCompose] = useState('');
  const [showNewConv, setShowNewConv] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showQRManager, setShowQRManager] = useState(false);
  const [showQRPopover, setShowQRPopover] = useState(false);
  const [qrFilter, setQrFilter] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composeBoxRef = useRef<HTMLDivElement>(null);

  const selectedId = searchParams.get('conversation');
  const setSelectedId = (id: string | null) => {
    if (id) setSearchParams({ conversation: id }, { replace: true });
    else setSearchParams({}, { replace: true });
  };

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ['conversations', statusFilter],
    queryFn: () => conversationsApi.list(statusFilter === 'all' ? undefined : statusFilter),
    refetchInterval: 5000,
  });

  const { data: messages = [] } = useQuery<ChatMessage[]>({
    queryKey: ['chat-messages', selectedId],
    queryFn: () => conversationsApi.messages(selectedId!),
    enabled: !!selectedId,
    refetchInterval: 5000,
  });

  const { data: quickReplies = [] } = useQuery<QuickReply[]>({
    queryKey: ['quick-replies'],
    queryFn: () => quickRepliesApi.list(true),
  });

  const { data: wpStatus } = useQuery({
    queryKey: ['wp-status'],
    queryFn: () => whatsAppApi.getStatus(),
    refetchInterval: 15000,
    retry: false,
  });

  const sendMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => conversationsApi.send(id, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-messages', selectedId] });
      qc.invalidateQueries({ queryKey: ['conversations', statusFilter] });
      setCompose('');
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || 'Não foi possível enviar. Verifique a conexão do WhatsApp.', 'error');
    },
  });

  const closeMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => conversationsApi.close(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversations', statusFilter] });
      setShowCloseModal(false);
      setSelectedId(null);
      toast('Conversa fechada', 'success');
    },
    onError: () => toast('Erro ao fechar conversa', 'error'),
  });

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    if (!selectedId && conversations.length > 0) setSelectedId(conversations[0].id);
  }, [conversations]);

  // Handle "/" to open quick replies
  useEffect(() => {
    if (compose.startsWith('/')) {
      setQrFilter(compose);
      setShowQRPopover(true);
    } else {
      setShowQRPopover(false);
      setQrFilter('');
    }
  }, [compose]);

  const sendMessage = useCallback(() => {
    const text = compose.trim();
    if (!text || !selectedId || sendMutation.isPending) return;
    sendMutation.mutate({ id: selectedId, content: text });
  }, [compose, selectedId, sendMutation]);

  function applyQuickReply(content: string, conv?: Conversation | null) {
    // Replace variables
    let text = content;
    if (conv) {
      const name = convName(conv);
      text = text
        .replace(/\{\{nome\}\}/g, name)
        .replace(/\{\{primeiro_nome\}\}/g, name.split(' ')[0])
        .replace(/\{\{telefone\}\}/g, convPhone(conv));
    }
    // Clear remaining unfilled variables
    text = text.replace(/\{\{[^}]+\}\}/g, '');
    setCompose(text);
    setShowQRPopover(false);
    textareaRef.current?.focus();
  }

  const selected = conversations.find(c => c.id === selectedId) || null;

  const filteredConvs = conversations.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      convName(c).toLowerCase().includes(q) ||
      convPhone(c).replace(/\D/g, '').includes(q.replace(/\D/g, '')) ||
      (c.lastMessagePreview || '').toLowerCase().includes(q)
    );
  });

  const wpConnected = wpStatus?.connected === true;
  const wpConfigured = wpStatus?.status !== 'not_configured';

  const filterTabs: [typeof statusFilter, string, string][] = [
    ['open', 'Abertas', 'ti-message-circle'],
    ['unread', 'Não lidas', 'ti-message-dots'],
    ['closed', 'Fechadas', 'ti-message-off'],
    ['all', 'Todas', 'ti-messages'],
  ];

  return (
    <>
      <style>{`
        @keyframes fadeInUp { from { opacity:0; transform:translateY(4px) } to { opacity:1; transform:translateY(0) } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .msg-bubble { animation: fadeInUp .15s ease; }
        .conv-item:hover { background: #F4F4F5 !important; }
        .send-btn:hover:not(:disabled) { background: #18181B !important; }
        .send-btn:active:not(:disabled) { transform: scale(.97); }
        .qr-item:hover { background: #F9F9F9; }
      `}</style>

      <div style={{ height:'100%', display:'flex', flexDirection:'column', overflow:'hidden', fontFamily:"'Inter', system-ui, sans-serif" }}>

        {/* WA status banners */}
        {wpConfigured && !wpConnected && (
          <div style={{ flexShrink:0, background:'#FEF2F2', borderBottom:'1px solid #FECACA', padding:'8px 20px', display:'flex', alignItems:'center', gap:10 }}>
            <i className="ti ti-alert-triangle" style={{ fontSize:14, color:'#DC2626', flexShrink:0 }} />
            <span style={{ fontSize:12, color:'#DC2626', fontWeight:500, flex:1 }}>WhatsApp desconectado — envio de mensagens bloqueado.</span>
            <button onClick={() => navigate('/settings?section=integrations')} style={{ height:26, padding:'0 12px', background:'#DC2626', border:'none', borderRadius:7, fontSize:11, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>Reconectar</button>
          </div>
        )}
        {!wpConfigured && (
          <div style={{ flexShrink:0, background:'#FFFBEB', borderBottom:'1px solid #FDE68A', padding:'8px 20px', display:'flex', alignItems:'center', gap:10 }}>
            <i className="ti ti-brand-whatsapp" style={{ fontSize:14, color:'#D97706', flexShrink:0 }} />
            <span style={{ fontSize:12, color:'#92400E', fontWeight:500, flex:1 }}>WhatsApp não configurado.</span>
            <button onClick={() => navigate('/settings?section=integrations')} style={{ height:26, padding:'0 12px', background:'#D97706', border:'none', borderRadius:7, fontSize:11, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>Configurar</button>
          </div>
        )}

        {/* Body */}
        <div style={{ flex:1, minHeight:0, display:'flex', overflow:'hidden' }}>

          {/* ── Left panel ── */}
          <div style={{ width:300, flexShrink:0, borderRight:'1px solid #E4E4E7', background:'#FFFFFF', display:'flex', flexDirection:'column', overflow:'hidden' }}>

            {/* Top: search + new */}
            <div style={{ padding:'12px 14px 8px', borderBottom:'1px solid #F1F5F9', flexShrink:0 }}>
              <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                <div style={{ flex:1, display:'flex', alignItems:'center', gap:7, height:32, padding:'0 10px', border:'1px solid #E4E4E7', borderRadius:8, background:'#F8F9FA' }}>
                  <i className="ti ti-search" style={{ fontSize:12, color:'#A1A1AA', flexShrink:0 }} />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
                    style={{ border:'none', background:'transparent', fontSize:12, outline:'none', width:'100%', fontFamily:'inherit', color:'#191C1D' }} />
                </div>
                <button
                  onClick={() => setShowNewConv(true)}
                  title="Nova conversa"
                  style={{ width:32, height:32, background:'#000', border:'none', borderRadius:8, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <i className="ti ti-edit" style={{ fontSize:15, color:'#fff' }} />
                </button>
              </div>

              {/* Status filter tabs */}
              <div style={{ display:'flex', gap:2 }}>
                {filterTabs.map(([key, label]) => {
                  const active = statusFilter === key;
                  return (
                    <button key={key} onClick={() => { setStatusFilter(key); setSelectedId(null); }}
                      style={{ flex:1, height:24, border:'none', borderRadius:6, fontSize:10, fontWeight:active?600:400, color:active?'#09090B':'#71717A', background:active?'#F4F4F5':'transparent', cursor:'pointer', fontFamily:'inherit' }}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Conversation list */}
            <div style={{ flex:1, overflowY:'auto' }}>
              {filteredConvs.length === 0 && (
                <div style={{ padding:'40px 16px', textAlign:'center' }}>
                  <i className="ti ti-message-off" style={{ fontSize:28, color:'#D1D5DB', display:'block', marginBottom:8 }} />
                  <div style={{ fontSize:12, color:'#6B7280', fontWeight:500, marginBottom:4 }}>Nenhuma conversa</div>
                  {statusFilter === 'open' && (
                    <button onClick={() => setShowNewConv(true)} style={{ marginTop:8, height:30, padding:'0 14px', background:'#000', border:'none', borderRadius:8, fontSize:12, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>
                      Nova conversa
                    </button>
                  )}
                </div>
              )}
              {filteredConvs.map(c => {
                const active = c.id === selectedId;
                const name = convName(c);
                const color = avatarColor(name);
                const isClosed = c.status === 'closed';
                const isGuest = convIsGuest(c);
                return (
                  <div key={c.id} className="conv-item" onClick={() => setSelectedId(c.id)}
                    style={{ padding:'10px 14px', borderBottom:'1px solid #F1F5F9', cursor:'pointer', background:active?'#F4F4F5':'#FFF', display:'flex', gap:10, alignItems:'flex-start' }}>
                    <div style={{ width:38, height:38, borderRadius:'50%', background:isClosed?'#E4E4E7':color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:isClosed?'#A1A1AA':'#fff', flexShrink:0, position:'relative' }}>
                      {initials(name)}
                      <div style={{ position:'absolute', bottom:-1, right:-1, width:13, height:13, borderRadius:'50%', background:'#FFF', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <i className="ti ti-brand-whatsapp" style={{ fontSize:8, color: isClosed ? '#A1A1AA' : '#16A34A' }} />
                      </div>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:1 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:4, overflow:'hidden', maxWidth:130 }}>
                          <span style={{ fontSize:12, fontWeight:c.unreadCount>0?700:500, color:isClosed?'#71717A':'#191C1D', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {name}
                          </span>
                          {isGuest && <i className="ti ti-user-question" title="Sem cadastro" style={{ fontSize:10, color:'#A1A1AA', flexShrink:0 }} />}
                        </div>
                        <span style={{ fontSize:10, color:'#A1A1AA', flexShrink:0, marginLeft:4 }}>{fmtTime(c.lastMessageAt)}</span>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                        {isClosed && <span style={{ fontSize:9, fontWeight:600, padding:'1px 5px', borderRadius:99, background:'#F4F4F5', color:'#71717A', flexShrink:0 }}>Fechada</span>}
                        <div style={{ fontSize:11, color:c.unreadCount>0?'#374151':'#A1A1AA', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight:c.unreadCount>0?500:400 }}>
                          {c.lastMessagePreview || 'Sem mensagens'}
                        </div>
                      </div>
                    </div>
                    {c.unreadCount > 0 && (
                      <div style={{ width:17, height:17, borderRadius:'50%', background:'#000', color:'#fff', fontSize:9, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, alignSelf:'center' }}>
                        {c.unreadCount > 9 ? '9+' : c.unreadCount}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Right panel ── */}
          {selected ? (
            <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

              {/* Thread header */}
              <div style={{ flexShrink:0, background:'#FFF', borderBottom:'1px solid #E4E4E7', padding:'10px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
                  <div style={{ width:36, height:36, borderRadius:'50%', background:selected.status==='closed'?'#E4E4E7':avatarColor(convName(selected)), display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:selected.status==='closed'?'#A1A1AA':'#fff', flexShrink:0 }}>
                    {initials(convName(selected))}
                  </div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:'#09090B', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:6 }}>
                      {convName(selected)}
                      {convIsGuest(selected) && <span style={{ fontSize:10, fontWeight:600, padding:'1px 7px', borderRadius:99, background:'#FFFBEB', color:'#D97706' }}>Sem cadastro</span>}
                    </div>
                    <div style={{ fontSize:11, color:'#71717A', display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
                      <i className="ti ti-brand-whatsapp" style={{ fontSize:11, color:'#16A34A' }} />
                      {convPhone(selected)
                        ? <span>{convPhone(selected)}</span>
                        : looksLikeLid(selected.contact?.phone || selected.guestPhone || '')
                          ? <span style={{ color:'#D97706' }}>Número não identificado</span>
                          : null}
                      <span style={{ color:'#E4E4E7' }}>·</span>
                      <span style={{ fontSize:10, fontWeight:600, padding:'1px 6px', borderRadius:99,
                        background: selected.status === 'open' ? '#DCFCE7' : '#F4F4F5',
                        color: selected.status === 'open' ? '#16A34A' : '#71717A' }}>
                        {selected.status === 'open' ? 'Aberta' : 'Fechada'}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                  {wpConnected && (
                    <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'#16A34A', fontWeight:500 }}>
                      <div style={{ width:6, height:6, borderRadius:'50%', background:'#16A34A' }} />
                      Conectado
                    </div>
                  )}
                  {convIsGuest(selected) ? (
                    <button
                      onClick={() => navigate(`/patients/new?phone=${encodeURIComponent(convPhone(selected))}&name=${encodeURIComponent(convName(selected))}`)}
                      style={{ height:30, padding:'0 12px', border:'1px solid #000', background:'#000', borderRadius:7, fontSize:12, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:5 }}>
                      <i className="ti ti-user-plus" style={{ fontSize:12 }} /> Cadastrar
                    </button>
                  ) : (
                    <button
                      onClick={() => navigate(`/patients/${selected.contactId}`)}
                      style={{ height:30, padding:'0 12px', border:'1px solid #E4E4E7', background:'#fff', borderRadius:7, fontSize:12, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:5 }}>
                      <i className="ti ti-user" style={{ fontSize:12 }} /> Ver contato
                    </button>
                  )}
                  {selected.status === 'open' && (
                    <button
                      onClick={() => setShowCloseModal(true)}
                      style={{ height:30, padding:'0 12px', border:'1px solid #E4E4E7', background:'#fff', borderRadius:7, fontSize:12, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:5 }}>
                      <i className="ti ti-circle-check" style={{ fontSize:12 }} /> Fechar
                    </button>
                  )}
                  {selected.status === 'closed' && (
                    <button
                      onClick={() => selected.contactId && conversationsApi.open(selected.contactId).then(() => {
                        qc.invalidateQueries({ queryKey: ['conversations', statusFilter] });
                        toast('Conversa reaberta', 'success');
                      })}
                      style={{ height:30, padding:'0 12px', border:'1px solid #000', background:'#000', borderRadius:7, fontSize:12, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:5 }}>
                      <i className="ti ti-refresh" style={{ fontSize:12 }} /> Reabrir
                    </button>
                  )}
                </div>
              </div>

              {/* Closed notice */}
              {selected.status === 'closed' && (
                <div style={{ flexShrink:0, background:'#FFFBEB', borderBottom:'1px solid #FDE68A', padding:'8px 20px', display:'flex', alignItems:'center', gap:8 }}>
                  <i className="ti ti-info-circle" style={{ fontSize:14, color:'#D97706' }} />
                  <span style={{ fontSize:12, color:'#92400E' }}>
                    Conversa fechada{selected.closeReason ? ` — ${selected.closeReason}` : ''}. Reabra para enviar mensagens.
                  </span>
                </div>
              )}

              {/* Messages */}
              <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:10, background:'#F8F9FA' }}>
                {messages.length === 0 && (
                  <div style={{ textAlign:'center', color:'#A1A1AA', fontSize:13, marginTop:40 }}>
                    <i className="ti ti-message" style={{ fontSize:28, display:'block', marginBottom:8, color:'#D1D5DB' }} />
                    Nenhuma mensagem ainda.
                  </div>
                )}
                {messages.map(m => {
                  const isOut = m.direction === 'outbound';
                  const time = fmtMsgTime(isOut ? m.sentAt : m.receivedAt) || fmtMsgTime(m.createdAt);
                  return (
                    <div key={m.id} className="msg-bubble" style={{ display:'flex', justifyContent:isOut?'flex-end':'flex-start' }}>
                      {!isOut && (
                        <div style={{ width:28, height:28, borderRadius:'50%', background:avatarColor(convName(selected)), display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#fff', flexShrink:0, marginRight:8, alignSelf:'flex-end' }}>
                          {initials(convName(selected))}
                        </div>
                      )}
                      <div style={{ maxWidth:'62%' }}>
                        {isOut && m.sentBy && (
                          <div style={{ fontSize:10, color:'#A1A1AA', textAlign:'right', marginBottom:2 }}>{m.sentBy.name}</div>
                        )}
                        <div style={{
                          padding:'9px 13px',
                          borderRadius: isOut ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                          background: m.status==='failed' ? '#FEF2F2' : isOut ? '#000' : '#FFF',
                          color: m.status==='failed' ? '#DC2626' : isOut ? '#FFF' : '#191C1D',
                          fontSize:13, lineHeight:1.5,
                          border: isOut ? 'none' : '1px solid #E5E7EB',
                          boxShadow:'0 1px 2px rgba(0,0,0,.05)',
                          whiteSpace:'pre-wrap', wordBreak:'break-word',
                        }}>
                          {m.content}
                          {m.status === 'failed' && <div style={{ fontSize:11, marginTop:3, color:'#DC2626' }}><i className="ti ti-alert-circle" style={{ fontSize:11 }} /> Falha no envio</div>}
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:3, marginTop:2, justifyContent:isOut?'flex-end':'flex-start' }}>
                          <span style={{ fontSize:10, color:'#A1A1AA' }}>{time}</span>
                          {isOut && m.status === 'sent' && <i className="ti ti-check" style={{ fontSize:10, color:'#A1A1AA' }} />}
                          {isOut && m.status === 'failed' && <i className="ti ti-alert-circle" style={{ fontSize:10, color:'#DC2626' }} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Compose */}
              <div ref={composeBoxRef} style={{ flexShrink:0, background:'#FFF', borderTop:'1px solid #E4E4E7', padding:'10px 16px', position:'relative' }}>
                {/* Quick replies popover */}
                {showQRPopover && (
                  <QuickRepliesPopover
                    replies={quickReplies}
                    filter={qrFilter}
                    anchorRef={composeBoxRef}
                    onSelect={content => applyQuickReply(content, selected)}
                  />
                )}

                {!wpConnected && selected.status === 'open' && (
                  <div style={{ marginBottom:8, padding:'7px 12px', background:'#FEF2F2', borderRadius:7, fontSize:12, color:'#DC2626', display:'flex', alignItems:'center', gap:6 }}>
                    <i className="ti ti-lock" style={{ fontSize:12 }} /> WhatsApp desconectado.
                  </div>
                )}

                <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
                  {/* Quick reply button */}
                  <button
                    onClick={() => setShowQRManager(true)}
                    title="Respostas rápidas"
                    style={{ width:34, height:34, border:'1px solid #E4E4E7', background:'#F8F9FA', borderRadius:8, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <i className="ti ti-bolt" style={{ fontSize:15, color:'#71717A' }} />
                  </button>

                  <div style={{ flex:1, border:'1px solid #E4E4E7', borderRadius:10, padding:'8px 12px', background:'#F8F9FA' }}>
                    <textarea
                      ref={textareaRef}
                      value={compose}
                      onChange={e => setCompose(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                        if (e.key === 'Escape') { setShowQRPopover(false); setCompose(''); }
                      }}
                      placeholder={selected.status === 'closed' ? 'Reabra a conversa para enviar mensagens' : 'Mensagem… (/ para respostas rápidas)'}
                      rows={2}
                      disabled={!wpConnected || selected.status === 'closed'}
                      style={{ border:'none', background:'transparent', fontSize:13, outline:'none', width:'100%', fontFamily:'inherit', color:'#191C1D', resize:'none', lineHeight:1.5, opacity:(!wpConnected || selected.status==='closed')?0.5:1 }}
                    />
                  </div>

                  <button className="send-btn" onClick={sendMessage}
                    disabled={!compose.trim() || !wpConnected || sendMutation.isPending || selected.status === 'closed'}
                    style={{ width:40, height:40, background:(!compose.trim() || !wpConnected || selected.status==='closed') ? '#E4E4E7' : '#000', border:'none', borderRadius:10, cursor:(!compose.trim() || !wpConnected || selected.status==='closed')?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', flexShrink:0, transition:'background .15s' }}>
                    {sendMutation.isPending
                      ? <i className="ti ti-loader-2" style={{ fontSize:17, animation:'spin 1s linear infinite' }} />
                      : <i className="ti ti-send" style={{ fontSize:17 }} />}
                  </button>
                </div>

                <div style={{ marginTop:5, fontSize:10, color:'#A1A1AA', textAlign:'center' }}>
                  <i className="ti ti-brand-whatsapp" style={{ fontSize:10, color:'#16A34A', marginRight:3 }} />
                  Via WhatsApp · {convPhone(selected) || 'sem telefone'} · Enter para enviar
                </div>
              </div>
            </div>
          ) : (
            <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, color:'#A1A1AA', background:'#F8F9FA' }}>
              <div style={{ width:64, height:64, borderRadius:'50%', background:'#F4F4F5', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <i className="ti ti-message-circle" style={{ fontSize:28, color:'#D1D5DB' }} />
              </div>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:14, fontWeight:600, color:'#374151', marginBottom:4 }}>Selecione uma conversa</div>
                <div style={{ fontSize:12, color:'#9CA3AF' }}>ou inicie uma nova conversa com um contato</div>
              </div>
              <button onClick={() => setShowNewConv(true)} style={{ height:34, padding:'0 16px', background:'#000', border:'none', borderRadius:8, fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:6 }}>
                <i className="ti ti-edit" style={{ fontSize:14 }} /> Nova conversa
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modals / Drawers */}
      <NewConvDrawer
        open={showNewConv}
        onClose={() => setShowNewConv(false)}
        onOpen={conv => { setSelectedId(conv.id); setStatusFilter('open'); qc.invalidateQueries({ queryKey: ['conversations', 'open'] }); }}
      />
      <CloseConvModal
        open={showCloseModal}
        onClose={() => setShowCloseModal(false)}
        loading={closeMutation.isPending}
        onConfirm={reason => selectedId && closeMutation.mutate({ id: selectedId, reason })}
      />
      <QuickRepliesManager
        open={showQRManager}
        onClose={() => { setShowQRManager(false); qc.invalidateQueries({ queryKey: ['quick-replies'] }); }}
      />
    </>
  );
}
