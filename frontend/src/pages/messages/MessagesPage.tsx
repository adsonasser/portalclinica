import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { conversationsApi, whatsAppApi } from '../../services/api';
import { useToast } from '../../components/ui/Toast';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Contact { id: string; name: string; phone: string | null; avatarUrl: string | null }
interface Conversation {
  id: string; clinicId: string; contactId: string; channel: string; provider: string;
  status: string; lastMessageAt: string | null; lastMessagePreview: string | null;
  unreadCount: number; contact: Contact;
}
interface ChatMessage {
  id: string; conversationId: string; direction: 'inbound' | 'outbound'; content: string;
  status: string; sentAt: string | null; receivedAt: string | null;
  createdAt: string; sentBy: { id: string; name: string } | null;
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export function MessagesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'archived'>('all');
  const [compose, setCompose] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedId = searchParams.get('conversation');
  const setSelectedId = (id: string | null) => {
    if (id) setSearchParams({ conversation: id }, { replace: true });
    else setSearchParams({}, { replace: true });
  };

  // Load conversations (poll every 5s)
  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ['conversations'],
    queryFn: () => conversationsApi.list(),
    refetchInterval: 5000,
  });

  // Load messages for selected conversation (poll every 5s)
  const { data: messages = [] } = useQuery<ChatMessage[]>({
    queryKey: ['chat-messages', selectedId],
    queryFn: () => conversationsApi.messages(selectedId!),
    enabled: !!selectedId,
    refetchInterval: 5000,
  });

  // WhatsApp connection status
  const { data: wpStatus } = useQuery({
    queryKey: ['wp-status'],
    queryFn: () => whatsAppApi.getStatus(),
    refetchInterval: 15000,
    retry: false,
  });

  const sendMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      conversationsApi.send(id, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-messages', selectedId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
      setCompose('');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'Não foi possível enviar a mensagem. Verifique a conexão do WhatsApp.';
      toast(msg, 'error');
    },
  });

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-select first conversation if none selected
  useEffect(() => {
    if (!selectedId && conversations.length > 0) {
      setSelectedId(conversations[0].id);
    }
  }, [conversations]);

  const sendMessage = useCallback(() => {
    const text = compose.trim();
    if (!text || !selectedId || sendMutation.isPending) return;
    sendMutation.mutate({ id: selectedId, content: text });
  }, [compose, selectedId, sendMutation]);

  const selected = conversations.find(c => c.id === selectedId) || null;

  const filteredConvs = conversations
    .filter(c => statusFilter === 'all' || c.status === statusFilter)
    .filter(c => !search ||
      c.contact.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.lastMessagePreview || '').toLowerCase().includes(search.toLowerCase())
    );

  const wpConnected = wpStatus?.connected === true;
  const wpConfigured = wpStatus?.status !== 'not_configured';

  return (
    <>
      <style>{`
        @keyframes fadeInUp { from { opacity:0; transform:translateY(4px) } to { opacity:1; transform:translateY(0) } }
        .msg-bubble { animation: fadeInUp .15s ease; }
        .conv-item:hover { background: #F4F4F5 !important; }
        .send-btn:hover { background: #18181B !important; }
        .send-btn:active { transform: scale(.97); }
      `}</style>

      <div style={{ height:'100%', display:'flex', flexDirection:'column', overflow:'hidden', fontFamily:"'Inter', system-ui, sans-serif" }}>

        {/* WhatsApp disconnect alert */}
        {wpConfigured && !wpConnected && (
          <div style={{ flexShrink:0, background:'#FEF2F2', borderBottom:'1px solid #FECACA', padding:'10px 20px', display:'flex', alignItems:'center', gap:10 }}>
            <i className="ti ti-alert-triangle" style={{ fontSize:15, color:'#DC2626', flexShrink:0 }} />
            <span style={{ fontSize:13, color:'#DC2626', fontWeight:500, flex:1 }}>
              WhatsApp desconectado — envio de mensagens bloqueado.
            </span>
            <button
              onClick={() => navigate('/settings?section=integrations')}
              style={{ height:28, padding:'0 12px', background:'#DC2626', border:'none', borderRadius:8, fontSize:12, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>
              Reconectar
            </button>
          </div>
        )}

        {!wpConfigured && (
          <div style={{ flexShrink:0, background:'#FFFBEB', borderBottom:'1px solid #FDE68A', padding:'10px 20px', display:'flex', alignItems:'center', gap:10 }}>
            <i className="ti ti-brand-whatsapp" style={{ fontSize:15, color:'#D97706', flexShrink:0 }} />
            <span style={{ fontSize:13, color:'#92400E', fontWeight:500, flex:1 }}>
              WhatsApp não configurado. Configure a integração para enviar e receber mensagens.
            </span>
            <button
              onClick={() => navigate('/settings?section=integrations')}
              style={{ height:28, padding:'0 12px', background:'#D97706', border:'none', borderRadius:8, fontSize:12, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>
              Configurar
            </button>
          </div>
        )}

        {/* Body: two-panel split */}
        <div style={{ flex:1, minHeight:0, display:'flex', overflow:'hidden' }}>

          {/* Left: conversation list */}
          <div style={{ width:320, flexShrink:0, borderRight:'1px solid #E5E7EB', background:'#FFFFFF', display:'flex', flexDirection:'column', overflow:'hidden' }}>

            {/* Search + filter */}
            <div style={{ padding:'14px 16px 10px', borderBottom:'1px solid #F1F5F9' }}>
              <div style={{ display:'flex', alignItems:'center', gap:7, height:34, padding:'0 10px', border:'1px solid #E4E4E7', borderRadius:9, background:'#F8F9FA', marginBottom:10 }}>
                <i className="ti ti-search" style={{ fontSize:13, color:'#9CA3AF', flexShrink:0 }} />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar conversa..."
                  style={{ border:'none', background:'transparent', fontSize:12, outline:'none', width:'100%', fontFamily:'inherit', color:'#191C1D' }} />
              </div>
              <div style={{ display:'flex', gap:4 }}>
                {([['all','Todos'],['open','Abertas'],['archived','Arquivadas']] as ['all'|'open'|'archived', string][]).map(([key, label]) => {
                  const active = statusFilter === key;
                  return (
                    <button key={key} onClick={() => setStatusFilter(key)}
                      style={{ flex:1, height:24, border:'none', borderRadius:6, fontSize:11, fontWeight:active?600:400, color:active?'#191C1D':'#71717A', background:active?'#F4F4F5':'transparent', cursor:'pointer', fontFamily:'inherit' }}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Conversation list */}
            <div style={{ flex:1, overflowY:'auto' }}>
              {filteredConvs.length === 0 && (
                <div style={{ padding:'48px 20px', textAlign:'center' }}>
                  <i className="ti ti-message-off" style={{ fontSize:32, color:'#D1D5DB', display:'block', marginBottom:10 }} />
                  <div style={{ fontSize:13, color:'#6B7280', fontWeight:500 }}>Nenhuma conversa encontrada</div>
                  <div style={{ fontSize:12, color:'#9CA3AF', marginTop:4 }}>As conversas aparecem quando alguém envia uma mensagem ou você inicia um contato</div>
                </div>
              )}
              {filteredConvs.map(c => {
                const active = c.id === selectedId;
                const color = avatarColor(c.contact.name);
                return (
                  <div key={c.id} className="conv-item"
                    onClick={() => setSelectedId(c.id)}
                    style={{ padding:'12px 16px', borderBottom:'1px solid #F1F5F9', cursor:'pointer', background:active?'#F4F4F5':'#FFFFFF', display:'flex', gap:10, alignItems:'flex-start' }}>
                    <div style={{ width:40, height:40, borderRadius:'50%', background:color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#fff', flexShrink:0, position:'relative' }}>
                      {initials(c.contact.name)}
                      <div style={{ position:'absolute', bottom:-1, right:-1, width:14, height:14, borderRadius:'50%', background:'#FFFFFF', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <i className="ti ti-brand-whatsapp" style={{ fontSize:9, color:'#16A34A' }} />
                      </div>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:2 }}>
                        <span style={{ fontSize:13, fontWeight:c.unreadCount>0?700:500, color:'#191C1D', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:140 }}>
                          {c.contact.name}
                        </span>
                        <span style={{ fontSize:11, color:'#9CA3AF', flexShrink:0, marginLeft:6 }}>
                          {fmtTime(c.lastMessageAt)}
                        </span>
                      </div>
                      <div style={{ fontSize:12, color:c.unreadCount>0?'#374151':'#9CA3AF', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight:c.unreadCount>0?500:400 }}>
                        {c.lastMessagePreview || 'Sem mensagens'}
                      </div>
                    </div>
                    {c.unreadCount > 0 && (
                      <div style={{ width:18, height:18, borderRadius:'50%', background:'#000', color:'#fff', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, alignSelf:'center' }}>
                        {c.unreadCount > 9 ? '9+' : c.unreadCount}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: message thread */}
          {selected ? (
            <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

              {/* Thread header */}
              <div style={{ flexShrink:0, background:'#FFFFFF', borderBottom:'1px solid #E5E7EB', padding:'12px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:38, height:38, borderRadius:'50%', background:avatarColor(selected.contact.name), display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#fff', flexShrink:0 }}>
                    {initials(selected.contact.name)}
                  </div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color:'#191C1D' }}>{selected.contact.name}</div>
                    <div style={{ fontSize:11, color:'#71717A', display:'flex', alignItems:'center', gap:5, marginTop:1 }}>
                      <i className="ti ti-brand-whatsapp" style={{ fontSize:11, color:'#16A34A' }} />
                      <span>WhatsApp</span>
                      {selected.contact.phone && (
                        <>
                          <span style={{ color:'#D1D5DB' }}>·</span>
                          <span>{selected.contact.phone}</span>
                        </>
                      )}
                      <span style={{ color:'#D1D5DB' }}>·</span>
                      <span style={{ fontSize:10, fontWeight:600, padding:'1px 6px', borderRadius:99,
                        background: selected.status === 'open' ? '#DCFCE7' : '#F4F4F5',
                        color: selected.status === 'open' ? '#16A34A' : '#71717A' }}>
                        {selected.status === 'open' ? 'Aberta' : 'Arquivada'}
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  {wpConnected && (
                    <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'#16A34A', fontWeight:500 }}>
                      <div style={{ width:7, height:7, borderRadius:'50%', background:'#16A34A' }} />
                      Conectado
                    </div>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex:1, overflowY:'auto', padding:'20px', display:'flex', flexDirection:'column', gap:12, background:'#F8F9FA' }}>
                {messages.length === 0 && (
                  <div style={{ textAlign:'center', color:'#9CA3AF', fontSize:13, marginTop:40 }}>
                    <i className="ti ti-message" style={{ fontSize:28, display:'block', marginBottom:8, color:'#D1D5DB' }} />
                    Nenhuma mensagem ainda. Seja o primeiro a enviar!
                  </div>
                )}
                {messages.map(m => {
                  const isOut = m.direction === 'outbound';
                  const time = fmtMsgTime(isOut ? m.sentAt : m.receivedAt) || fmtMsgTime(m.createdAt);
                  return (
                    <div key={m.id} className="msg-bubble" style={{ display:'flex', justifyContent:isOut?'flex-end':'flex-start' }}>
                      {!isOut && (
                        <div style={{ width:30, height:30, borderRadius:'50%', background:avatarColor(selected.contact.name), display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff', flexShrink:0, marginRight:8, alignSelf:'flex-end' }}>
                          {initials(selected.contact.name)}
                        </div>
                      )}
                      <div style={{ maxWidth:'62%' }}>
                        {isOut && m.sentBy && (
                          <div style={{ fontSize:10, color:'#9CA3AF', textAlign:'right', marginBottom:2 }}>
                            {m.sentBy.name}
                          </div>
                        )}
                        <div style={{
                          padding:'10px 14px',
                          borderRadius: isOut ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                          background: m.status === 'failed' ? '#FEF2F2' : isOut ? '#000000' : '#FFFFFF',
                          color: m.status === 'failed' ? '#DC2626' : isOut ? '#FFFFFF' : '#191C1D',
                          fontSize:13, lineHeight:1.5,
                          border: isOut ? 'none' : '1px solid #E5E7EB',
                          boxShadow:'0 1px 2px rgba(0,0,0,.06)',
                        }}>
                          {m.content}
                          {m.status === 'failed' && (
                            <div style={{ fontSize:11, marginTop:4, color:'#DC2626' }}>
                              <i className="ti ti-alert-circle" style={{ fontSize:11 }} /> Falha no envio
                            </div>
                          )}
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:3, justifyContent:isOut?'flex-end':'flex-start' }}>
                          <span style={{ fontSize:11, color:'#9CA3AF' }}>{time}</span>
                          {isOut && m.status === 'sent' && <i className="ti ti-check" style={{ fontSize:11, color:'#9CA3AF' }} />}
                          {isOut && m.status === 'failed' && <i className="ti ti-alert-circle" style={{ fontSize:11, color:'#DC2626' }} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Compose box */}
              <div style={{ flexShrink:0, background:'#FFFFFF', borderTop:'1px solid #E5E7EB', padding:'12px 20px' }}>
                {!wpConnected && (
                  <div style={{ marginBottom:8, padding:'8px 12px', background:'#FEF2F2', borderRadius:8, fontSize:12, color:'#DC2626', display:'flex', alignItems:'center', gap:6 }}>
                    <i className="ti ti-lock" style={{ fontSize:13 }} />
                    WhatsApp desconectado — envio bloqueado.
                  </div>
                )}
                <div style={{ display:'flex', gap:10, alignItems:'flex-end' }}>
                  <div style={{ flex:1, border:'1px solid #E4E4E7', borderRadius:12, padding:'10px 14px', background:'#F8F9FA' }}>
                    <textarea
                      ref={textareaRef}
                      value={compose}
                      onChange={e => setCompose(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                      placeholder={`Mensagem para ${selected.contact.name}… (Enter para enviar, Shift+Enter nova linha)`}
                      rows={2}
                      disabled={!wpConnected}
                      style={{ border:'none', background:'transparent', fontSize:13, outline:'none', width:'100%', fontFamily:'inherit', color:'#191C1D', resize:'none', lineHeight:1.5, opacity: wpConnected ? 1 : 0.5 }}
                    />
                  </div>
                  <button
                    className="send-btn"
                    onClick={sendMessage}
                    disabled={!compose.trim() || !wpConnected || sendMutation.isPending}
                    style={{ width:44, height:44, background: (compose.trim() && wpConnected) ? '#000000' : '#D1D5DB', border:'none', borderRadius:12, cursor:(compose.trim() && wpConnected)?'pointer':'not-allowed', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', flexShrink:0, transition:'background .15s' }}>
                    {sendMutation.isPending
                      ? <i className="ti ti-loader-2" style={{ fontSize:18, animation:'spin 1s linear infinite' }} />
                      : <i className="ti ti-send" style={{ fontSize:18 }} />}
                  </button>
                </div>
                <div style={{ marginTop:6, fontSize:11, color:'#9CA3AF', textAlign:'center' }}>
                  <i className="ti ti-brand-whatsapp" style={{ fontSize:11, color:'#16A34A', marginRight:4 }} />
                  Via WhatsApp · {selected.contact.phone || 'sem telefone'}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#9CA3AF' }}>
              <i className="ti ti-message-circle" style={{ fontSize:48, marginBottom:16, color:'#E4E4E7' }} />
              <div style={{ fontSize:14, fontWeight:500, color:'#6B7280' }}>Selecione uma conversa</div>
              <div style={{ fontSize:12, marginTop:4 }}>Ou abra o WhatsApp de um contato para iniciar</div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
