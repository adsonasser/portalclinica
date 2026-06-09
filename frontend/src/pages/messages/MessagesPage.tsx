import { useState, useRef, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
type MsgStatus = 'sent' | 'delivered' | 'read';
type ConvStatus = 'open' | 'closed' | 'pending';

interface Message {
  id: number; convId: number; author: 'clinic' | 'patient';
  text: string; time: string; status?: MsgStatus;
}

interface Conversation {
  id: number; patient: string; initials: string; avatarColor: string;
  lastMsg: string; lastTime: string; unread: number; status: ConvStatus;
  phone: string; channel: 'whatsapp' | 'email' | 'sms';
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const CONVERSATIONS: Conversation[] = [];

const MESSAGES: Message[] = [];

const CHANNEL_ICON: Record<string, string> = {
  whatsapp: 'ti-brand-whatsapp',
  email:    'ti-mail',
  sms:      'ti-message',
};

const CHANNEL_COLOR: Record<string, string> = {
  whatsapp: '#16A34A',
  email:    '#2563EB',
  sms:      '#D97706',
};

const STATUS_CONFIG: Record<ConvStatus, { bg: string; color: string; label: string }> = {
  open:    { bg:'#DCFCE7', color:'#16A34A', label:'Aberto'    },
  pending: { bg:'#FFFBEB', color:'#D97706', label:'Aguardando' },
  closed:  { bg:'#F4F4F5', color:'#71717A', label:'Encerrado'  },
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export function MessagesPage() {
  const [convs, setConvs]         = useState<Conversation[]>(CONVERSATIONS);
  const [msgs, setMsgs]           = useState<Message[]>(MESSAGES);
  const [selectedId, setSelectedId] = useState<number>(1);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState<ConvStatus | 'all'>('all');
  const [compose, setCompose]     = useState('');
  const messagesEndRef            = useRef<HTMLDivElement>(null);

  const selected = convs.find(c => c.id === selectedId)!;
  const threadMsgs = msgs.filter(m => m.convId === selectedId);

  const filteredConvs = convs
    .filter(c => statusFilter === 'all' || c.status === statusFilter)
    .filter(c => !search || c.patient.toLowerCase().includes(search.toLowerCase()) || c.lastMsg.toLowerCase().includes(search.toLowerCase()));

  const totalUnread = convs.reduce((sum, c) => sum + c.unread, 0);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedId, msgs]);

  const selectConv = (id: number) => {
    setSelectedId(id);
    setConvs(prev => prev.map(c => c.id === id ? { ...c, unread: 0 } : c));
  };

  const sendMessage = () => {
    const text = compose.trim();
    if (!text) return;
    const newMsg: Message = { id: Date.now(), convId: selectedId, author: 'clinic', text, time: new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }), status: 'sent' };
    setMsgs(prev => [...prev, newMsg]);
    setConvs(prev => prev.map(c => c.id === selectedId ? { ...c, lastMsg: text, lastTime: newMsg.time } : c));
    setCompose('');
  };

  return (
    <>
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(4px) } to { opacity:1; transform:translateY(0) } }
        .msg-row { animation: fadeIn .15s ease; }
        .conv-item:hover { background: #F4F4F5 !important; }
        .send-btn:hover { background: #18181B !important; }
        .send-btn:active { transform: scale(.97); }
      `}</style>

      <div style={{ height:'100%', display:'flex', flexDirection:'column', overflow:'hidden', background:'#F8F9FA', fontFamily:"'Inter', system-ui, sans-serif" }}>

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div style={{ flexShrink:0, background:'#FFFFFF', borderBottom:'1px solid #E5E7EB', padding:'18px 28px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <h1 style={{ fontSize:20, fontWeight:700, color:'#191C1D', margin:0 }}>Mensagens</h1>
            <p style={{ fontSize:12, color:'#71717A', margin:'2px 0 0' }}>
              Atendimento via WhatsApp, e-mail e SMS com seus pacientes.
              {totalUnread > 0 && <span style={{ marginLeft:8, fontSize:11, fontWeight:700, color:'#DC2626' }}>{totalUnread} não lida{totalUnread > 1 ? 's' : ''}</span>}
            </p>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button style={{ height:36, padding:'0 14px', border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:10, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#FFFFFF'; }}>
              <i className="ti ti-template" style={{ fontSize:14 }} /> Templates
            </button>
            <button style={{ height:36, padding:'0 16px', background:'#000000', border:'none', borderRadius:10, fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#18181B'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#000000'; }}>
              <i className="ti ti-edit" style={{ fontSize:14 }} /> Nova mensagem
            </button>
          </div>
        </div>

        {/* ── Body: two-panel split ─────────────────────────────────────────── */}
        <div style={{ flex:1, minHeight:0, display:'flex', overflow:'hidden' }}>

          {/* ── Left: conversation list ──────────────────────────────────────── */}
          <div style={{ width:320, flexShrink:0, borderRight:'1px solid #E5E7EB', background:'#FFFFFF', display:'flex', flexDirection:'column', overflow:'hidden' }}>

            {/* Search + filter */}
            <div style={{ padding:'14px 16px 10px', borderBottom:'1px solid #F1F5F9' }}>
              <div style={{ display:'flex', alignItems:'center', gap:7, height:34, padding:'0 10px', border:'1px solid #E4E4E7', borderRadius:9, background:'#F8F9FA', marginBottom:10 }}>
                <i className="ti ti-search" style={{ fontSize:13, color:'#9CA3AF', flexShrink:0 }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar conversa..."
                  style={{ border:'none', background:'transparent', fontSize:12, outline:'none', width:'100%', fontFamily:'inherit', color:'#191C1D' }} />
              </div>
              <div style={{ display:'flex', gap:4 }}>
                {([['all','Todos'],['open','Abertos'],['pending','Aguardando'],['closed','Encerrados']] as [ConvStatus|'all', string][]).map(([key, label]) => {
                  const active = statusFilter === key;
                  return (
                    <button key={key} onClick={() => setStatusFilter(key)}
                      style={{ flex:1, height:24, border:'none', borderRadius:6, fontSize:11, fontWeight: active?600:400, color: active?'#191C1D':'#71717A', background: active?'#F4F4F5':'transparent', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap', padding:'0 4px' }}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* List */}
            <div style={{ flex:1, overflowY:'auto' }}>
              {filteredConvs.length === 0 && (
                <div style={{ padding:'40px 16px', textAlign:'center', color:'#9CA3AF', fontSize:13 }}>Nenhuma conversa encontrada</div>
              )}
              {filteredConvs.map(c => {
                const active = c.id === selectedId;
                return (
                  <div key={c.id} className="conv-item" onClick={() => selectConv(c.id)}
                    style={{ padding:'12px 16px', borderBottom:'1px solid #F1F5F9', cursor:'pointer', background: active ? '#F4F4F5' : '#FFFFFF', display:'flex', gap:10, alignItems:'flex-start' }}>
                    <div style={{ width:40, height:40, borderRadius:'50%', background:c.avatarColor, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#fff', flexShrink:0, position:'relative' }}>
                      {c.initials}
                      <div style={{ position:'absolute', bottom:-1, right:-1, width:14, height:14, borderRadius:'50%', background:'#FFFFFF', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <i className={`ti ${CHANNEL_ICON[c.channel]}`} style={{ fontSize:9, color:CHANNEL_COLOR[c.channel] }} />
                      </div>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:2 }}>
                        <span style={{ fontSize:13, fontWeight: c.unread > 0 ? 700 : 500, color:'#191C1D', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:140 }}>{c.patient}</span>
                        <span style={{ fontSize:11, color:'#9CA3AF', flexShrink:0, marginLeft:6 }}>{c.lastTime}</span>
                      </div>
                      <div style={{ fontSize:12, color: c.unread > 0 ? '#374151' : '#9CA3AF', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight: c.unread > 0 ? 500 : 400 }}>{c.lastMsg}</div>
                    </div>
                    {c.unread > 0 && (
                      <div style={{ width:18, height:18, borderRadius:'50%', background:'#000', color:'#fff', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, alignSelf:'center' }}>{c.unread}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Right: message thread ──────────────────────────────────────────── */}
          {selected ? (
            <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

              {/* Thread header */}
              <div style={{ flexShrink:0, background:'#FFFFFF', borderBottom:'1px solid #E5E7EB', padding:'12px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:38, height:38, borderRadius:'50%', background:selected.avatarColor, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#fff', flexShrink:0 }}>
                    {selected.initials}
                  </div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color:'#191C1D' }}>{selected.patient}</div>
                    <div style={{ fontSize:11, color:'#71717A', display:'flex', alignItems:'center', gap:5, marginTop:1 }}>
                      <i className={`ti ${CHANNEL_ICON[selected.channel]}`} style={{ fontSize:11, color:CHANNEL_COLOR[selected.channel] }} />
                      <span style={{ textTransform:'capitalize' }}>{selected.channel}</span>
                      <span style={{ color:'#D1D5DB' }}>·</span>
                      <span>{selected.phone}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:11, fontWeight:600, padding:'2px 9px', borderRadius:99, background:STATUS_CONFIG[selected.status].bg, color:STATUS_CONFIG[selected.status].color }}>
                    {STATUS_CONFIG[selected.status].label}
                  </span>
                  {selected.status === 'open' && (
                    <button onClick={() => setConvs(prev => prev.map(c => c.id === selectedId ? { ...c, status:'closed' } : c))}
                      style={{ height:30, padding:'0 12px', border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:8, fontSize:12, fontWeight:500, color:'#71717A', cursor:'pointer', fontFamily:'inherit' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#FFFFFF'; }}>
                      Encerrar
                    </button>
                  )}
                  {selected.status === 'closed' && (
                    <button onClick={() => setConvs(prev => prev.map(c => c.id === selectedId ? { ...c, status:'open' } : c))}
                      style={{ height:30, padding:'0 12px', border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:8, fontSize:12, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#FFFFFF'; }}>
                      Reabrir
                    </button>
                  )}
                  <button style={{ width:30, height:30, border:'none', background:'transparent', borderRadius:8, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#9CA3AF' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                    <i className="ti ti-dots-vertical" style={{ fontSize:15 }} />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex:1, overflowY:'auto', padding:'20px', display:'flex', flexDirection:'column', gap:12, background:'#F8F9FA' }}>
                {threadMsgs.length === 0 && (
                  <div style={{ textAlign:'center', color:'#9CA3AF', fontSize:13, marginTop:40 }}>Nenhuma mensagem ainda.</div>
                )}
                {threadMsgs.map(m => {
                  const isClinic = m.author === 'clinic';
                  return (
                    <div key={m.id} className="msg-row" style={{ display:'flex', justifyContent: isClinic ? 'flex-end' : 'flex-start' }}>
                      {!isClinic && (
                        <div style={{ width:30, height:30, borderRadius:'50%', background:selected.avatarColor, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff', flexShrink:0, marginRight:8, alignSelf:'flex-end' }}>
                          {selected.initials}
                        </div>
                      )}
                      <div style={{ maxWidth:'60%' }}>
                        <div style={{ padding:'10px 14px', borderRadius: isClinic ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: isClinic ? '#000000' : '#FFFFFF', color: isClinic ? '#FFFFFF' : '#191C1D', fontSize:13, lineHeight:1.5, border: isClinic ? 'none' : '1px solid #E5E7EB', boxShadow:'0 1px 2px rgba(0,0,0,.06)' }}>
                          {m.text}
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:3, justifyContent: isClinic ? 'flex-end' : 'flex-start' }}>
                          <span style={{ fontSize:11, color:'#9CA3AF' }}>{m.time}</span>
                          {isClinic && m.status === 'read'      && <i className="ti ti-checks"       style={{ fontSize:11, color:'#2563EB' }} />}
                          {isClinic && m.status === 'delivered' && <i className="ti ti-checks"       style={{ fontSize:11, color:'#9CA3AF' }} />}
                          {isClinic && m.status === 'sent'      && <i className="ti ti-check"        style={{ fontSize:11, color:'#9CA3AF' }} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Compose box */}
              <div style={{ flexShrink:0, background:'#FFFFFF', borderTop:'1px solid #E5E7EB', padding:'12px 20px' }}>
                <div style={{ display:'flex', gap:10, alignItems:'flex-end' }}>
                  <div style={{ flex:1, border:'1px solid #E4E4E7', borderRadius:12, padding:'10px 14px', background:'#F8F9FA', display:'flex', flexDirection:'column', gap:8 }}>
                    <textarea
                      value={compose}
                      onChange={e => setCompose(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                      placeholder={`Mensagem para ${selected.patient}… (Enter para enviar)`}
                      rows={2}
                      style={{ border:'none', background:'transparent', fontSize:13, outline:'none', width:'100%', fontFamily:'inherit', color:'#191C1D', resize:'none', lineHeight:1.5 }}
                    />
                    <div style={{ display:'flex', gap:6 }}>
                      {['ti-paperclip','ti-photo','ti-mood-smile'].map(icon => (
                        <button key={icon} style={{ width:28, height:28, border:'none', background:'transparent', borderRadius:6, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#9CA3AF' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#E4E4E7'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                          <i className={`ti ${icon}`} style={{ fontSize:15 }} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <button className="send-btn" onClick={sendMessage}
                    style={{ width:44, height:44, background: compose.trim() ? '#000000' : '#D1D5DB', border:'none', borderRadius:12, cursor: compose.trim() ? 'pointer' : 'not-allowed', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', flexShrink:0, transition:'background .15s' }}>
                    <i className="ti ti-send" style={{ fontSize:18 }} />
                  </button>
                </div>
                <div style={{ marginTop:8, fontSize:11, color:'#9CA3AF', textAlign:'center' }}>
                  <i className={`ti ${CHANNEL_ICON[selected.channel]}`} style={{ fontSize:11, color:CHANNEL_COLOR[selected.channel], marginRight:4 }} />
                  Enviando via <b style={{ textTransform:'capitalize' }}>{selected.channel}</b> · {selected.phone}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#9CA3AF', fontSize:14 }}>
              Selecione uma conversa
            </div>
          )}
        </div>
      </div>
    </>
  );
}
