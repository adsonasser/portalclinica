import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionsApi, agendaApi } from '../../services/api';
import { useToast } from '../../components/ui/Toast';

// ─── Types ────────────────────────────────────────────────────────────────────
type SessionStatus =
  | 'a_agendar' | 'agendada' | 'confirmada' | 'em_atendimento'
  | 'realizada' | 'faltou' | 'cancelada' | 'reagendada' | 'vencida' | 'suspensa';

type PackageStatus = 'ativo' | 'concluido' | 'vencido' | 'suspenso' | 'cancelado' | 'atencao';

interface Session {
  id: string;
  patientId: string;
  planId: string | null;
  saleId: string | null;
  paciente: string;
  phone: string;
  procedimento: string;
  sessao: string;
  sessionNumber: number;
  totalSessoes: number;
  status: SessionStatus;
  rawStatus: string;
  data: string;           // formatted, '—' when not scheduled
  isoDate: string | null; // actual ISO date, null when A_AGENDAR
  profissional: string;
  professionalId: string | null;
  profissionalDefault: string | null;
  salaDefault: string | null;
  duracaoDefault: number | null;
  validade: string;
}

interface PackageSessao {
  nome: string;
  status: SessionStatus;
  data: string;
  profissional: string;
}

interface Pacote {
  id: string;       // saleId
  paciente: string;
  patientId: string;
  procedimento: string;
  contratadas: number;
  realizadas: number;
  restantes: number;
  validade: string;
  status: PackageStatus;
  venda: string;
  dataContratacao: string;
  sessoes: PackageSessao[];
}

// ─── Status maps ──────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, SessionStatus> = {
  A_AGENDAR:      'a_agendar',
  AGENDADA:       'agendada',
  CONFIRMADA:     'confirmada',
  EM_ATENDIMENTO: 'em_atendimento',
  REALIZADA:      'realizada',
  FALTOU:         'faltou',
  CANCELADA:      'cancelada',
  REAGENDADA:     'reagendada',
  VENCIDA:        'vencida',
  SUSPENSA:       'suspensa',
};

const STATUS_TO_API: Record<SessionStatus, string> = {
  a_agendar:      'A_AGENDAR',
  agendada:       'AGENDADA',
  confirmada:     'CONFIRMADA',
  em_atendimento: 'EM_ATENDIMENTO',
  realizada:      'REALIZADA',
  faltou:         'FALTOU',
  cancelada:      'CANCELADA',
  reagendada:     'REAGENDADA',
  vencida:        'VENCIDA',
  suspensa:       'SUSPENSA',
};

function mapApiSession(raw: any, sessoesPorVenda: Map<string, number>): Session {
  const status = STATUS_MAP[raw.sessionStatus] ?? 'a_agendar';
  const isScheduled = status !== 'a_agendar';
  const totalSessoes = raw.plan?.sessionsTotal ?? sessoesPorVenda.get(raw.saleId) ?? 1;

  return {
    id:               raw.id,
    patientId:        raw.patientId,
    planId:           raw.planId ?? null,
    saleId:           raw.saleId ?? null,
    paciente:         raw.patient?.name ?? '—',
    phone:            raw.patient?.phone ?? '',
    procedimento:     raw.plan?.name ?? '—',
    sessao:           `Aplicação ${raw.sessionNumber}/${totalSessoes}`,
    sessionNumber:    raw.sessionNumber,
    totalSessoes,
    status,
    rawStatus:        raw.sessionStatus,
    data:             isScheduled && raw.date
                        ? new Date(raw.date).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' })
                        : '—',
    isoDate:          isScheduled ? raw.date : null,
    profissional:     raw.professional?.user?.name ?? '—',
    professionalId:   raw.professionalId ?? null,
    profissionalDefault: raw.plan?.profissionalPadrao ?? null,
    salaDefault:      raw.plan?.salaPadrao ?? null,
    duracaoDefault:   raw.plan?.duracaoPadrao ?? null,
    validade:         '—',
  };
}

// ─── Config ───────────────────────────────────────────────────────────────────
const STATUS_CFG: Record<SessionStatus, { bg: string; color: string; label: string }> = {
  a_agendar:      { bg:'#EFF6FF', color:'#2563EB', label:'Aguardando agendamento' },
  agendada:       { bg:'#F5F3FF', color:'#7C3AED', label:'Agendada' },
  confirmada:     { bg:'#DCFCE7', color:'#15803D', label:'Confirmada' },
  em_atendimento: { bg:'#DBEAFE', color:'#1D4ED8', label:'Em atendimento' },
  realizada:      { bg:'#DCFCE7', color:'#16A34A', label:'Realizada' },
  faltou:         { bg:'#FEF2F2', color:'#B91C1C', label:'Faltou' },
  cancelada:      { bg:'#F4F4F5', color:'#71717A', label:'Cancelada' },
  reagendada:     { bg:'#FFF7ED', color:'#C2410C', label:'Reagendada' },
  vencida:        { bg:'#FEF2F2', color:'#DC2626', label:'Vencida' },
  suspensa:       { bg:'#FEFCE8', color:'#A16207', label:'Suspensa' },
};

const PKG_STATUS_CFG: Record<PackageStatus, { bg: string; color: string; label: string }> = {
  ativo:     { bg:'#DCFCE7', color:'#16A34A', label:'Ativo' },
  concluido: { bg:'#EFF6FF', color:'#2563EB', label:'Concluído' },
  vencido:   { bg:'#FEF2F2', color:'#DC2626', label:'Vencido' },
  suspenso:  { bg:'#FEFCE8', color:'#A16207', label:'Suspenso' },
  cancelado: { bg:'#F4F4F5', color:'#71717A', label:'Cancelado' },
  atencao:   { bg:'#FFFBEB', color:'#D97706', label:'Atenção' },
};

const ROOMS = ['Sala 01', 'Sala 02', 'Enfermagem', 'Online'];

const SESSION_NEXT: Partial<Record<SessionStatus, SessionStatus>> = {
  agendada: 'confirmada',
  confirmada: 'em_atendimento',
  em_atendimento: 'realizada',
  faltou: 'a_agendar',
};

// ─── Agendar Panel ────────────────────────────────────────────────────────────
function AgendarPanel({ session, onClose, onSaved }: {
  session: Session; onClose: () => void; onSaved: () => void;
}) {
  const [date,     setDate]     = useState('');
  const [startTime,setStartTime]= useState('09:00');
  const [endTime,  setEndTime]  = useState('10:00');
  const [room,     setRoom]     = useState(session.salaDefault ?? ROOMS[0]);
  const [notes,    setNotes]    = useState('');
  const [profId,   setProfId]   = useState('');
  const [error,    setError]    = useState('');

  const { data: profissionais = [] } = useQuery({
    queryKey: ['professionals'],
    queryFn: () => agendaApi.professionals(),
  });

  const qc = useQueryClient();

  const saveMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => sessionsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] });
      onSaved();
      onClose();
    },
    onError: () => setError('Erro ao agendar. Tente novamente.'),
  });

  function handleSave() {
    if (!date) { setError('Selecione a data.'); return; }
    setError('');
    const [sh, sm] = startTime.split(':').map(Number);
    const dateObj = new Date(`${date}T${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}:00`);
    saveMut.mutate({
      id: session.id,
      data: {
        sessionStatus: 'AGENDADA',
        date: dateObj.toISOString(),
        professionalId: profId || undefined,
        observations: notes || undefined,
      },
    });
  }

  const inp: React.CSSProperties = { width:'100%', height:36, padding:'0 10px', border:'1px solid #E4E4E7', borderRadius:8, fontSize:13, color:'#09090B', background:'#FFFFFF', boxSizing:'border-box', fontFamily:'inherit', outline:'none' };
  const lbl: React.CSSProperties = { fontSize:12, fontWeight:500, color:'#71717A', display:'block', marginBottom:4 };

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.25)', zIndex:9000, backdropFilter:'blur(2px)' }} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:520, background:'#FFFFFF', zIndex:9001, boxShadow:'-4px 0 32px rgba(0,0,0,.14)', display:'flex', flexDirection:'column', fontFamily:"'Inter', system-ui, sans-serif", animation:'slideIn .22s cubic-bezier(0.32,0.72,0,1)', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ flexShrink:0, padding:'20px 24px', borderBottom:'1px solid #E4E4E7', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'#F0F9FF', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className="ti ti-calendar-plus" style={{ fontSize:18, color:'#2563EB' }} />
            </div>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:'#09090B' }}>Agendar sessão</div>
              <div style={{ fontSize:11, color:'#71717A', marginTop:1 }}>{session.paciente} · {session.sessao}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width:28, height:28, border:'none', background:'#F4F4F5', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <i className="ti ti-x" style={{ fontSize:13, color:'#71717A' }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>

          {/* Info read-only */}
          <div style={{ background:'#F9F9F9', borderRadius:10, border:'1px solid #E4E4E7', padding:'12px 14px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 16px' }}>
            {[
              { label:'Paciente',      value:session.paciente },
              { label:'Procedimento',  value:session.procedimento },
              { label:'Sessão',        value:session.sessao },
              { label:'Status atual',  value:STATUS_CFG[session.status]?.label ?? session.status },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize:10, color:'#9CA3AF', fontWeight:500, textTransform:'uppercase', letterSpacing:'.04em', marginBottom:2 }}>{label}</div>
                <div style={{ fontSize:13, fontWeight:500, color:'#191C1D' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Date + Times */}
          <div>
            <label style={lbl}>Data <span style={{ color:'#DC2626' }}>*</span></label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={lbl}>Hora início</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Hora fim</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={inp} />
            </div>
          </div>

          {/* Profissional */}
          <div>
            <label style={lbl}>Profissional</label>
            <select value={profId} onChange={e => setProfId(e.target.value)} style={{ ...inp, cursor:'pointer' }}>
              <option value="">Selecione...</option>
              {(profissionais as any[]).map((p: any) => (
                <option key={p.id} value={p.id}>{p.user?.name ?? p.name}</option>
              ))}
            </select>
          </div>

          {/* Sala */}
          <div>
            <label style={lbl}>Sala</label>
            <select value={room} onChange={e => setRoom(e.target.value)} style={{ ...inp, cursor:'pointer' }}>
              {ROOMS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Observação */}
          <div>
            <label style={lbl}>Observações</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Observações opcionais..."
              style={{ ...inp, height:'auto', padding:'8px 10px', resize:'vertical' }} />
          </div>

          {error && (
            <div style={{ padding:'10px 12px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, fontSize:12, color:'#DC2626' }}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ flexShrink:0, padding:'14px 24px', borderTop:'1px solid #E4E4E7', display:'flex', gap:10, background:'#FAFAFA' }}>
          <button onClick={onClose}
            style={{ flex:1, height:40, border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:8, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit' }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saveMut.isPending}
            style={{ flex:2, height:40, background:saveMut.isPending?'#A1A1AA':'#000000', border:'none', borderRadius:8, fontSize:13, fontWeight:600, color:'#FFFFFF', cursor:saveMut.isPending?'not-allowed':'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
            <i className="ti ti-calendar-check" style={{ fontSize:14 }} />
            {saveMut.isPending ? 'Agendando...' : 'Confirmar agendamento'}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Context Menu ─────────────────────────────────────────────────────────────
interface CtxMenu { x: number; y: number; sessionId: string; patientId?: string; saleId?: string; }

function ContextMenu({ pos, onClose, onCancel, onOpenPatient, onOpenSale, onNi }: {
  pos: CtxMenu;
  onClose: () => void;
  onCancel: () => void;
  onOpenPatient: () => void;
  onOpenSale: () => void;
  onNi: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const items = [
    { icon:'ti-user', label:'Abrir paciente', action: () => { onOpenPatient(); onClose(); } },
    { icon:'ti-receipt', label:'Abrir venda', action: () => { onOpenSale(); onClose(); } },
    null,
    { icon:'ti-x', label:'Cancelar sessão', danger:true, action: () => { onCancel(); onClose(); } },
    { icon:'ti-player-pause', label:'Suspender sessão', danger:true, action: () => { onNi(); onClose(); } },
    null,
    { icon:'ti-history', label:'Ver histórico', action: () => { onNi(); onClose(); } },
  ];

  return (
    <div ref={ref} style={{ position:'fixed', top:pos.y, left:pos.x, zIndex:9500, background:'#FFFFFF', border:'1px solid #E4E4E7', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,.12)', padding:'4px', minWidth:190, animation:'fadeUp .12s ease' }}>
      {items.map((item, i) =>
        item === null ? (
          <div key={i} style={{ height:1, background:'#F1F5F9', margin:'3px 0' }} />
        ) : (
          <button key={item.label} onClick={item.action}
            style={{ display:'flex', alignItems:'center', gap:9, width:'100%', padding:'7px 12px', border:'none', background:'none', borderRadius:7, cursor:'pointer', fontSize:13, color: item.danger ? '#DC2626' : '#374151', fontFamily:'inherit', textAlign:'left' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = item.danger ? '#FEF2F2' : '#F4F4F5'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}>
            <i className={`ti ${item.icon}`} style={{ fontSize:14, color: item.danger ? '#DC2626' : '#71717A' }} />
            {item.label}
          </button>
        )
      )}
    </div>
  );
}

// ─── Package Detail Drawer ────────────────────────────────────────────────────
function PackageDetailDrawer({ pacote, onClose, onAgendar }: { pacote: Pacote; onClose: () => void; onAgendar: (sessao: PackageSessao & { saleId: string }) => void }) {
  const pkgSt = PKG_STATUS_CFG[pacote.status];
  const pct   = pacote.contratadas > 0 ? Math.round((pacote.realizadas / pacote.contratadas) * 100) : 0;

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.35)', zIndex:300, backdropFilter:'blur(2px)' }} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:580, background:'#F8F9FA', zIndex:301, display:'flex', flexDirection:'column', fontFamily:"'Inter',system-ui,sans-serif", boxShadow:'-8px 0 40px rgba(0,0,0,.13)', animation:'slideIn .2s ease' }}>

        <div style={{ flexShrink:0, background:'#FFFFFF', borderBottom:'1px solid #E5E7EB', padding:'18px 24px', display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:'#191C1D', marginBottom:3 }}>Detalhes do pacote</div>
            <div style={{ fontSize:12, color:'#71717A' }}>{pacote.paciente} · {pacote.procedimento}</div>
          </div>
          <button onClick={onClose} style={{ width:30, height:30, border:'none', background:'#F4F4F5', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#71717A', flexShrink:0 }}>
            <i className="ti ti-x" style={{ fontSize:13 }} />
          </button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
          <div style={{ background:'#FFFFFF', borderRadius:14, border:'1px solid #E5E7EB', padding:'18px 20px', marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#191C1D', marginBottom:14, paddingBottom:12, borderBottom:'1px solid #F1F5F9' }}>Resumo do pacote</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
              {[
                { label:'Paciente',            value:pacote.paciente },
                { label:'Venda vinculada',      value:pacote.venda },
                { label:'Data de contratação', value:pacote.dataContratacao },
                { label:'Validade',             value:pacote.validade },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize:11, color:'#9CA3AF', fontWeight:500, marginBottom:3, textTransform:'uppercase', letterSpacing:'.04em' }}>{label}</div>
                  <div style={{ fontSize:13, fontWeight:500, color:'#191C1D' }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:14 }}>
              {[
                { label:'Contratadas', value:pacote.contratadas, color:'#374151' },
                { label:'Realizadas',  value:pacote.realizadas,  color:'#16A34A' },
                { label:'Restantes',   value:pacote.restantes,   color:'#2563EB' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ textAlign:'center', padding:'12px 8px', borderRadius:10, background:'#F8F9FA', border:'1px solid #F1F5F9' }}>
                  <div style={{ fontSize:22, fontWeight:700, color, lineHeight:1.1 }}>{value}</div>
                  <div style={{ fontSize:11, color:'#71717A', marginTop:3 }}>{label}</div>
                </div>
              ))}
            </div>
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                <div style={{ fontSize:11, color:'#71717A' }}>Progresso</div>
                <div style={{ fontSize:11, fontWeight:600, color:'#191C1D' }}>{pct}%</div>
              </div>
              <div style={{ height:8, borderRadius:99, background:'#F1F5F9', overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${pct}%`, background: pct === 100 ? '#16A34A' : pct > 60 ? '#2563EB' : '#D97706', borderRadius:99, transition:'width .3s' }} />
              </div>
            </div>
            <div style={{ marginTop:12 }}>
              <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:99, background:pkgSt.bg, color:pkgSt.color }}>{pkgSt.label}</span>
            </div>
          </div>

          <div style={{ background:'#FFFFFF', borderRadius:14, border:'1px solid #E5E7EB', overflow:'hidden', marginBottom:16 }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid #F1F5F9', fontSize:13, fontWeight:700, color:'#191C1D' }}>Sessões do pacote</div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'#F9FAFB' }}>
                  {['Sessão','Status','Data','Profissional','Ação'].map((h) => (
                    <th key={h} style={{ padding:'8px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'.05em', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pacote.sessoes.map((s, i) => {
                  const st = STATUS_CFG[s.status];
                  return (
                    <tr key={i} style={{ borderTop:'1px solid #F1F5F9' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding:'9px 14px', fontSize:12, fontWeight:500, color:'#374151' }}>{s.nome}</td>
                      <td style={{ padding:'9px 14px' }}>
                        <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:99, background:st.bg, color:st.color }}>{st.label}</span>
                      </td>
                      <td style={{ padding:'9px 14px', fontSize:11, color:'#71717A', whiteSpace:'nowrap' }}>{s.data}</td>
                      <td style={{ padding:'9px 14px', fontSize:11, color:'#71717A' }}>{s.profissional}</td>
                      <td style={{ padding:'9px 14px' }}>
                        {s.status === 'a_agendar' ? (
                          <button style={{ height:26, padding:'0 10px', background:'#000', border:'none', borderRadius:6, fontSize:11, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>Agendar</button>
                        ) : s.status === 'agendada' ? (
                          <button style={{ height:26, padding:'0 10px', background:'#F5F3FF', border:'none', borderRadius:6, fontSize:11, fontWeight:600, color:'#7C3AED', cursor:'pointer', fontFamily:'inherit' }}>Confirmar</button>
                        ) : (
                          <button style={{ height:26, padding:'0 10px', background:'#F4F4F5', border:'none', borderRadius:6, fontSize:11, fontWeight:500, color:'#71717A', cursor:'pointer', fontFamily:'inherit' }}>Ver</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ flexShrink:0, background:'#FFFFFF', borderTop:'1px solid #E5E7EB', padding:'14px 24px', display:'flex', gap:8, flexWrap:'wrap' }}>
          <button style={{ height:36, padding:'0 16px', background:'#000', border:'none', borderRadius:9, fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:6 }}>
            <i className="ti ti-calendar-plus" style={{ fontSize:13 }} /> Agendar próxima
          </button>
          <button style={{ height:36, padding:'0 14px', border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:9, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:6 }}>
            <i className="ti ti-list-check" style={{ fontSize:13 }} /> Agendar todas
          </button>
          <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
            <button style={{ height:36, padding:'0 12px', border:'1px solid #FEF2F2', background:'#FEF2F2', borderRadius:9, fontSize:13, fontWeight:500, color:'#DC2626', cursor:'pointer', fontFamily:'inherit' }}>Encerrar</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Action Button ────────────────────────────────────────────────────────────
function ActionButton({ s, onAction }: { s: Session; onAction: () => void }) {
  if (s.status === 'a_agendar') return (
    <button onClick={onAction} style={{ height:30, padding:'0 13px', background:'#000', border:'none', borderRadius:8, fontSize:12, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>Agendar</button>
  );
  if (s.status === 'agendada') return (
    <button onClick={onAction} style={{ height:30, padding:'0 12px', background:'#F5F3FF', border:'none', borderRadius:8, fontSize:12, fontWeight:600, color:'#7C3AED', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>Confirmar</button>
  );
  if (s.status === 'confirmada') return (
    <button onClick={onAction} style={{ height:30, padding:'0 12px', background:'#F0FDF4', border:'none', borderRadius:8, fontSize:12, fontWeight:600, color:'#16A34A', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>Iniciar</button>
  );
  if (s.status === 'em_atendimento') return (
    <button onClick={onAction} style={{ height:30, padding:'0 12px', background:'#DBEAFE', border:'none', borderRadius:8, fontSize:12, fontWeight:600, color:'#1D4ED8', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>Finalizar</button>
  );
  if (s.status === 'faltou') return (
    <button onClick={onAction} style={{ height:30, padding:'0 12px', background:'#FFF7ED', border:'none', borderRadius:8, fontSize:12, fontWeight:600, color:'#C2410C', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>Reagendar</button>
  );
  if (s.status === 'vencida') return (
    <button onClick={onAction} style={{ height:30, padding:'0 12px', background:'#FEF2F2', border:'none', borderRadius:8, fontSize:12, fontWeight:600, color:'#DC2626', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>Encerrar</button>
  );
  return (
    <button style={{ height:30, padding:'0 12px', background:'#F4F4F5', border:'none', borderRadius:8, fontSize:12, fontWeight:500, color:'#71717A', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>Ver</button>
  );
}

// ─── Sessions Table ───────────────────────────────────────────────────────────
function SessionsTable({ sessions, onCtxMenu, onAction }: {
  sessions: Session[];
  onCtxMenu: (e: React.MouseEvent, id: string) => void;
  onAction: (s: Session) => void;
}) {
  const COLS = ['Paciente','Procedimento','Sessão','Status','Data agendada','Profissional','Validade','Ações'];

  if (sessions.length === 0) return (
    <div style={{ padding:'60px 0', textAlign:'center' }}>
      <i className="ti ti-search-off" style={{ fontSize:36, color:'#D1D5DB', display:'block', marginBottom:10 }} />
      <div style={{ fontSize:14, fontWeight:600, color:'#6B7280', marginBottom:4 }}>Nenhuma sessão encontrada</div>
      <div style={{ fontSize:12, color:'#9CA3AF' }}>Ajuste os filtros para ver outras sessões</div>
    </div>
  );

  return (
    <table style={{ width:'100%', borderCollapse:'collapse' }}>
      <thead>
        <tr style={{ background:'#F9FAFB', borderBottom:'1px solid #E5E7EB' }}>
          {COLS.map((h, i) => (
            <th key={h} style={{ padding:'10px 16px', textAlign: i === 7 ? 'right' : 'left', fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'.05em', whiteSpace:'nowrap' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sessions.map(s => {
          const st = STATUS_CFG[s.status];
          return (
            <tr key={s.id} style={{ borderBottom:'1px solid #F1F5F9' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <td style={{ padding:'12px 16px' }}>
                <div style={{ fontSize:13, fontWeight:600, color:'#191C1D' }}>{s.paciente}</div>
              </td>
              <td style={{ padding:'12px 16px', fontSize:12, color:'#71717A', maxWidth:180 }}>
                <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.procedimento}</div>
              </td>
              <td style={{ padding:'12px 16px', fontSize:12, color:'#374151', whiteSpace:'nowrap' }}>{s.sessao}</td>
              <td style={{ padding:'12px 16px' }}>
                <span style={{ fontSize:11, fontWeight:600, padding:'2px 9px', borderRadius:99, background:st.bg, color:st.color, whiteSpace:'nowrap' }}>{st.label}</span>
              </td>
              <td style={{ padding:'12px 16px', fontSize:12, color: s.data === '—' ? '#D1D5DB' : '#374151', whiteSpace:'nowrap' }}>{s.data}</td>
              <td style={{ padding:'12px 16px', fontSize:12, color:'#71717A', whiteSpace:'nowrap' }}>{s.profissional}</td>
              <td style={{ padding:'12px 16px', fontSize:12, color: s.validade === '—' ? '#D1D5DB' : (s.status === 'vencida' ? '#DC2626' : '#374151'), whiteSpace:'nowrap' }}>
                {s.validade !== '—' && s.status === 'vencida' && <i className="ti ti-alert-triangle" style={{ fontSize:11, marginRight:4, verticalAlign:'middle' }} />}
                {s.validade}
              </td>
              <td style={{ padding:'12px 16px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:6 }}>
                  <ActionButton s={s} onAction={() => onAction(s)} />
                  <button onClick={e => onCtxMenu(e, s.id)}
                    style={{ width:28, height:28, border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:7, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#71717A' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#FFFFFF'; }}>
                    <i className="ti ti-dots-vertical" style={{ fontSize:14 }} />
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Packages Table ───────────────────────────────────────────────────────────
function PackagesTable({ pacotes, onView }: { pacotes: Pacote[]; onView: (p: Pacote) => void }) {
  if (pacotes.length === 0) return (
    <div style={{ padding:'60px 0', textAlign:'center' }}>
      <i className="ti ti-package-off" style={{ fontSize:36, color:'#D1D5DB', display:'block', marginBottom:10 }} />
      <div style={{ fontSize:14, fontWeight:600, color:'#6B7280', marginBottom:4 }}>Nenhum pacote encontrado</div>
      <div style={{ fontSize:12, color:'#9CA3AF' }}>Pacotes são criados automaticamente quando uma venda gera sessões</div>
    </div>
  );

  return (
    <table style={{ width:'100%', borderCollapse:'collapse' }}>
      <thead>
        <tr style={{ background:'#F9FAFB', borderBottom:'1px solid #E5E7EB' }}>
          {['Paciente','Pacote / Procedimento','Contratadas','Realizadas','Restantes','Status','Ações'].map((h, i) => (
            <th key={h} style={{ padding:'10px 16px', textAlign: i >= 2 && i <= 4 ? 'center' : i === 6 ? 'center' : 'left', fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'.05em', whiteSpace:'nowrap' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {pacotes.map(p => {
          const st  = PKG_STATUS_CFG[p.status];
          const pct = p.contratadas > 0 ? Math.round((p.realizadas / p.contratadas) * 100) : 0;
          return (
            <tr key={p.id} style={{ borderBottom:'1px solid #F1F5F9' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <td style={{ padding:'13px 16px' }}>
                <div style={{ fontSize:13, fontWeight:600, color:'#191C1D' }}>{p.paciente}</div>
              </td>
              <td style={{ padding:'13px 16px', fontSize:12, color:'#71717A' }}>{p.procedimento}</td>
              <td style={{ padding:'13px 16px', textAlign:'center', fontSize:13, fontWeight:600, color:'#374151' }}>{p.contratadas}</td>
              <td style={{ padding:'13px 16px', textAlign:'center' }}>
                <span style={{ fontSize:13, fontWeight:700, color:'#16A34A' }}>{p.realizadas}</span>
              </td>
              <td style={{ padding:'13px 16px', textAlign:'center' }}>
                <span style={{ fontSize:13, fontWeight:700, color:'#2563EB' }}>{p.restantes}</span>
              </td>
              <td style={{ padding:'13px 16px' }}>
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  <span style={{ fontSize:11, fontWeight:600, padding:'2px 9px', borderRadius:99, background:st.bg, color:st.color, display:'inline-block', width:'fit-content' }}>{st.label}</span>
                  <div style={{ height:4, borderRadius:99, background:'#F1F5F9', width:80, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${pct}%`, background: pct === 100 ? '#16A34A' : pct > 60 ? '#2563EB' : '#D97706', borderRadius:99 }} />
                  </div>
                </div>
              </td>
              <td style={{ padding:'13px 16px', textAlign:'center' }}>
                <button onClick={() => onView(p)}
                  style={{ height:30, padding:'0 14px', background:'#F4F4F5', border:'none', borderRadius:8, fontSize:12, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#E4E4E7'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; }}>
                  Ver sessões
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function SessionsPage() {
  const qc = useQueryClient();

  const [tab,           setTab]           = useState('todas');
  const [search,        setSearch]        = useState('');
  const [profFilter,    setProfFilter]    = useState('');
  const [stFilter,      setStFilter]      = useState('');
  const [ctxMenu,       setCtxMenu]       = useState<CtxMenu | null>(null);
  const [detailPkg,     setDetailPkg]     = useState<Pacote | null>(null);
  const [agendarSession,setAgendarSession]= useState<Session | null>(null);

  // ── Fetch all sessions ─────────────────────────────────────────────────────
  const { data: rawSessions = [], isLoading, isError } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => sessionsApi.list(),
    refetchOnWindowFocus: true,
  });

  // ── Map API → Session ──────────────────────────────────────────────────────
  const sessions: Session[] = useMemo(() => {
    // Build a map: saleId → count of sessions, to compute total per package
    const countBySale = new Map<string, number>();
    for (const s of rawSessions as any[]) {
      if (s.saleId) countBySale.set(s.saleId, (countBySale.get(s.saleId) ?? 0) + 1);
    }
    return (rawSessions as any[]).map(s => mapApiSession(s, countBySale));
  }, [rawSessions]);

  // ── Build packages from sessions ──────────────────────────────────────────
  const pacotes: Pacote[] = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of sessions) {
      if (s.saleId) {
        const list = map.get(s.saleId) ?? [];
        list.push(s);
        map.set(s.saleId, list);
      }
    }
    return Array.from(map.entries())
      .filter(([, list]) => list.length > 1)  // only show as package if > 1 session
      .map(([saleId, list]) => {
        const realizadas = list.filter(s => s.status === 'realizada').length;
        const canceladas = list.filter(s => s.status === 'cancelada').length;
        const todasRealizadas = realizadas === list.length;
        const algumVencida = list.some(s => s.status === 'vencida');
        let pkgStatus: PackageStatus = 'ativo';
        if (todasRealizadas) pkgStatus = 'concluido';
        else if (algumVencida) pkgStatus = 'atencao';
        else if (canceladas === list.length) pkgStatus = 'cancelado';

        return {
          id:              saleId,
          paciente:        list[0].paciente,
          patientId:       list[0].patientId,
          procedimento:    list[0].procedimento,
          contratadas:     list.length,
          realizadas,
          restantes:       list.length - realizadas - canceladas,
          validade:        '—',
          status:          pkgStatus,
          venda:           `#${saleId.slice(-6).toUpperCase()}`,
          dataContratacao: new Date().toLocaleDateString('pt-BR'),
          sessoes:         list.map(s => ({
            nome:        s.sessao,
            status:      s.status,
            data:        s.data,
            profissional:s.profissional,
          })),
        } satisfies Pacote;
      });
  }, [sessions]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpiAgendar  = sessions.filter(s => s.status === 'a_agendar').length;
  const kpiAgendada = sessions.filter(s => s.status === 'agendada' || s.status === 'confirmada').length;
  const kpiVencidas = sessions.filter(s => s.status === 'vencida').length;
  const kpiPacotes  = pacotes.filter(p => p.status === 'ativo').length;

  // ── Status mutation ────────────────────────────────────────────────────────
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => sessionsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => sessionsApi.update(id, { sessionStatus: 'CANCELADA' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] });
      setCtxMenu(null);
    },
  });

  // ── Handle action (non-agendar flows) ─────────────────────────────────────
  function handleSessionAction(s: Session) {
    if (s.status === 'a_agendar') {
      setAgendarSession(s);
      return;
    }
    const next = SESSION_NEXT[s.status];
    if (!next) return;
    updateMut.mutate({
      id: s.id,
      data: { sessionStatus: STATUS_TO_API[next] },
    });
  }

  const navigate = useNavigate();
  const { toast } = useToast();
  const ni = () => toast('Funcionalidade ainda não implementada.', 'info');

  const handleCtxMenu = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const session = sessions.find(s => s.id === id);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setCtxMenu({ x: rect.right - 190, y: rect.bottom + 4, sessionId: id, patientId: session?.patientId, saleId: session?.saleId ?? undefined });
  };

  // ── Filter sessions ────────────────────────────────────────────────────────
  const filteredSessions = useMemo(() => sessions.filter(s => {
    if (tab === 'a_agendar')  return s.status === 'a_agendar';
    if (tab === 'agendadas')  return s.status === 'agendada' || s.status === 'confirmada';
    if (tab === 'realizadas') return s.status === 'realizada';
    if (tab === 'faltou')     return s.status === 'faltou';
    if (tab === 'vencidas')   return s.status === 'vencida';
    if (tab === 'canceladas') return s.status === 'cancelada';
    return true; // 'todas'
  }).filter(s =>
    !profFilter || s.profissional === profFilter
  ).filter(s =>
    !stFilter || s.status === stFilter
  ).filter(s =>
    !search ||
    s.paciente.toLowerCase().includes(search.toLowerCase()) ||
    s.procedimento.toLowerCase().includes(search.toLowerCase())
  ), [sessions, tab, profFilter, stFilter, search]);

  const TABS = [
    { key:'todas',        label:'Todas' },
    { key:'a_agendar',    label:'Aguardando agendamento' },
    { key:'agendadas',    label:'Agendadas' },
    { key:'realizadas',   label:'Realizadas' },
    { key:'faltou',       label:'Faltou' },
    { key:'vencidas',     label:'Vencidas' },
    { key:'canceladas',   label:'Canceladas' },
    { key:'pacotes',      label:'Pacotes ativos' },
  ];

  const STATUS_OPTIONS: { value: SessionStatus | ''; label: string }[] = [
    { value:'', label:'Todos status' },
    { value:'a_agendar',  label:'Aguardando agendamento' },
    { value:'agendada',   label:'Agendada' },
    { value:'confirmada', label:'Confirmada' },
    { value:'realizada',  label:'Realizada' },
    { value:'faltou',     label:'Faltou' },
    { value:'vencida',    label:'Vencida' },
    { value:'suspensa',   label:'Suspensa' },
    { value:'cancelada',  label:'Cancelada' },
  ];

  const kpis = [
    { label:'Aguardando agendamento',    value: String(kpiAgendar),  sub:'sessões sem data marcada',   icon:'ti-calendar-x',    iconBg:'#EFF6FF', iconColor:'#2563EB' },
    { label:'Agendadas',    value: String(kpiAgendada), sub:'próximas sessões',           icon:'ti-calendar-check', iconBg:'#F5F3FF', iconColor:'#7C3AED' },
    { label:'Pacotes ativos',value: String(kpiPacotes), sub:'tratamentos em andamento',  icon:'ti-package',        iconBg:'#F0FDF4', iconColor:'#16A34A' },
    { label:'Vencidas',     value: String(kpiVencidas), sub:'sessões fora do prazo',      icon:'ti-alert-triangle', iconBg:'#FEF2F2', iconColor:'#DC2626' },
  ];

  return (
    <>
      <style>{`
        @keyframes fadeUp  { from { opacity:0; transform:translateY(6px);  } to { opacity:1; transform:translateY(0);  } }
        @keyframes slideIn { from { opacity:0; transform:translateX(30px); } to { opacity:1; transform:translateX(0); } }
        @keyframes spin    { to { transform:rotate(360deg); } }
      `}</style>

      {agendarSession && (
        <AgendarPanel
          session={agendarSession}
          onClose={() => setAgendarSession(null)}
          onSaved={() => setAgendarSession(null)}
        />
      )}

      {ctxMenu && (
        <ContextMenu
          pos={ctxMenu}
          onClose={() => setCtxMenu(null)}
          onCancel={() => cancelMut.mutate(ctxMenu.sessionId)}
          onOpenPatient={() => ctxMenu.patientId && navigate(`/patients/${ctxMenu.patientId}`)}
          onOpenSale={() => ni()}
          onNi={ni}
        />
      )}

      {detailPkg && (
        <PackageDetailDrawer
          pacote={detailPkg}
          onClose={() => setDetailPkg(null)}
          onAgendar={() => {}}
        />
      )}

      <div style={{ height:'100%', display:'flex', flexDirection:'column', overflow:'hidden', background:'#F8F9FA', fontFamily:"'Inter', system-ui, sans-serif" }}>

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div style={{ flexShrink:0, background:'#FFFFFF', borderBottom:'1px solid #E5E7EB', padding:'18px 28px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <h1 style={{ fontSize:20, fontWeight:700, color:'#191C1D', margin:0 }}>Sessões</h1>
            <p style={{ fontSize:12, color:'#71717A', margin:'2px 0 0' }}>Controle sessões contratadas, pendentes, agendadas, realizadas e vencidas dos pacientes.</p>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button
              style={{ height:36, padding:'0 14px', border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:10, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#FFFFFF'; }}>
              <i className="ti ti-download" style={{ fontSize:14 }} /> Exportar
            </button>
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ['sessions'] })}
              style={{ height:36, padding:'0 14px', border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:10, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#FFFFFF'; }}>
              <i className="ti ti-refresh" style={{ fontSize:14 }} /> Atualizar
            </button>
          </div>
        </div>

        {/* ── Scrollable body ───────────────────────────────────────────────── */}
        <div style={{ flex:1, minHeight:0, overflowY:'auto' }}>
          <div style={{ padding:'20px 28px 0' }}>

            {/* Loading / Error states */}
            {isLoading && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'60px 0', gap:10 }}>
                <i className="ti ti-loader-2" style={{ fontSize:20, color:'#A1A1AA', animation:'spin 1s linear infinite' }} />
                <span style={{ fontSize:13, color:'#71717A' }}>Carregando sessões...</span>
              </div>
            )}

            {isError && (
              <div style={{ padding:'20px', background:'#FEF2F2', borderRadius:10, border:'1px solid #FECACA', marginBottom:16 }}>
                <div style={{ fontSize:13, color:'#DC2626', fontWeight:500 }}>Erro ao carregar sessões. Verifique a conexão e tente novamente.</div>
              </div>
            )}

            {!isLoading && !isError && (
              <>
                {/* KPI Cards */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
                  {kpis.map(k => (
                    <div key={k.label}
                      style={{ background:'#FFFFFF', borderRadius:14, border:'1px solid #E5E7EB', padding:'16px 20px', display:'flex', alignItems:'center', gap:14, boxShadow:'0 1px 3px rgba(0,0,0,.04)', cursor:'pointer' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,.08)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,.04)'; }}>
                      <div style={{ width:44, height:44, borderRadius:12, background:k.iconBg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <i className={`ti ${k.icon}`} style={{ fontSize:20, color:k.iconColor }} />
                      </div>
                      <div>
                        <div style={{ fontSize:11, color:'#9CA3AF', fontWeight:500, marginBottom:2, textTransform:'uppercase', letterSpacing:'.04em' }}>{k.label}</div>
                        <div style={{ fontSize:22, fontWeight:700, color:'#191C1D', lineHeight:1.1 }}>{k.value}</div>
                        <div style={{ fontSize:11, color:'#71717A', marginTop:2 }}>{k.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Tabs + Filters */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, marginBottom:14, flexWrap:'wrap' }}>
                  <div style={{ display:'flex', background:'#F4F4F5', borderRadius:10, padding:3 }}>
                    {TABS.map(t => {
                      const active = tab === t.key;
                      return (
                        <button key={t.key} onClick={() => setTab(t.key)}
                          style={{ height:30, padding:'0 12px', borderRadius:8, border:'none', fontSize:12, fontWeight: active?600:400, color: active?'#191C1D':'#71717A', background: active?'#FFFFFF':'transparent', cursor:'pointer', fontFamily:'inherit', boxShadow: active?'0 1px 3px rgba(0,0,0,.08)':'none', whiteSpace:'nowrap' }}>
                          {t.label}
                          {t.key === 'pacotes' && (
                            <span style={{ marginLeft:5, fontSize:10, fontWeight:700, padding:'1px 5px', borderRadius:99, background: active ? '#000' : '#E4E4E7', color: active ? '#fff' : '#71717A' }}>
                              {pacotes.length}
                            </span>
                          )}
                          {t.key === 'a_agendar' && kpiAgendar > 0 && (
                            <span style={{ marginLeft:5, fontSize:10, fontWeight:700, padding:'1px 5px', borderRadius:99, background: active ? '#2563EB' : '#DBEAFE', color: active ? '#fff' : '#2563EB' }}>
                              {kpiAgendar}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {tab !== 'pacotes' && (
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <select value={stFilter} onChange={e => setStFilter(e.target.value as SessionStatus | '')}
                        style={{ height:34, padding:'0 12px', border:'1px solid #E4E4E7', borderRadius:9, fontSize:12, color: stFilter?'#191C1D':'#9CA3AF', background:'#FFFFFF', cursor:'pointer', fontFamily:'inherit' }}>
                        {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <div style={{ display:'flex', alignItems:'center', gap:6, height:34, padding:'0 10px', border:'1px solid #E4E4E7', borderRadius:9, background:'#FFFFFF', width:220 }}>
                        <i className="ti ti-search" style={{ fontSize:13, color:'#9CA3AF' }} />
                        <input value={search} onChange={e => setSearch(e.target.value)}
                          placeholder="Buscar paciente ou procedimento..."
                          style={{ border:'none', background:'transparent', fontSize:12, outline:'none', width:'100%', fontFamily:'inherit', color:'#191C1D' }} />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── Table area ─────────────────────────────────────────────────── */}
          {!isLoading && !isError && (
            <div style={{ padding:'0 28px 28px' }}>
              <div style={{ background:'#FFFFFF', borderRadius:14, border:'1px solid #E5E7EB', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,.04)' }}>
                {tab === 'pacotes' ? (
                  <PackagesTable pacotes={pacotes} onView={p => setDetailPkg(p)} />
                ) : (
                  <SessionsTable sessions={filteredSessions} onCtxMenu={handleCtxMenu} onAction={handleSessionAction} />
                )}
                <div style={{ padding:'11px 20px', borderTop:'1px solid #F1F5F9', background:'#FAFAFA', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div style={{ fontSize:12, color:'#71717A' }}>
                    {tab === 'pacotes'
                      ? <><b style={{color:'#191C1D'}}>{pacotes.length}</b> pacotes</>
                      : <>Mostrando <b style={{color:'#191C1D'}}>{filteredSessions.length}</b> de <b style={{color:'#191C1D'}}>{sessions.length}</b> sessões</>
                    }
                  </div>
                  <div style={{ fontSize:12, color:'#71717A' }}>Página 1 de 1</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
