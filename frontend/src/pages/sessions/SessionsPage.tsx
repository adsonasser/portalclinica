import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionsApi, agendaApi, prontuarioApi } from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { TableActions } from '../../components/ui/TableActions';

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
  data: string;
  isoDate: string | null;
  profissional: string;
  professionalId: string | null;
  profissionalDefault: string | null;
  salaDefault: string | null;
  duracaoDefault: number | null;
  validade: string;
  saleCreatedAt: string | null;
}

interface PackageSessao {
  id: string;
  nome: string;
  status: SessionStatus;
  data: string;
  profissional: string;
}

interface Pacote {
  id: string;
  paciente: string;
  phone: string;
  patientId: string;
  procedimento: string;
  contratadas: number;
  agendadas: number;
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
    saleCreatedAt:    raw.sale?.createdAt ?? null,
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

const PKG_STATUS_CFG: Record<PackageStatus, { bg: string; color: string; dot: string; label: string }> = {
  ativo:     { bg:'#DCFCE7', color:'#16A34A', dot:'#22C55E', label:'Ativo' },
  concluido: { bg:'#EFF6FF', color:'#2563EB', dot:'#3B82F6', label:'Concluído' },
  vencido:   { bg:'#FEF2F2', color:'#DC2626', dot:'#EF4444', label:'Vencido' },
  suspenso:  { bg:'#FEFCE8', color:'#A16207', dot:'#F59E0B', label:'Suspenso' },
  cancelado: { bg:'#F4F4F5', color:'#71717A', dot:'#A1A1AA', label:'Cancelado' },
  atencao:   { bg:'#FFFBEB', color:'#D97706', dot:'#F59E0B', label:'Atenção' },
};

const ROOMS = ['Sala 01', 'Sala 02', 'Enfermagem', 'Online'];


// ─── Mini Calendar ────────────────────────────────────────────────────────────
function MiniCalendar({ value, onChange, busyDates }: {
  value: string;
  onChange: (date: string) => void;
  busyDates: Set<string>;
}) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [viewYear,  setViewYear]  = useState(() => value ? parseInt(value.slice(0,4))     : new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => value ? parseInt(value.slice(5,7)) - 1 : new Date().getMonth());

  const firstDow   = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMon  = new Date(viewYear, viewMonth + 1, 0).getDate();
  const monthLabel = new Date(viewYear, viewMonth, 1)
    .toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMon; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }
  function ds(day: number) {
    return `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  const DOW = ['D','S','T','Q','Q','S','S'];

  return (
    <div style={{ background:'#FFFFFF', border:'1px solid #E4E4E7', borderRadius:12, padding:'10px 12px', userSelect:'none' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
        <button onClick={prevMonth} style={{ width:26, height:26, border:'none', background:'#F4F4F5', borderRadius:6, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <i className="ti ti-chevron-left" style={{ fontSize:12, color:'#374151' }} />
        </button>
        <span style={{ fontSize:13, fontWeight:600, color:'#09090B', textTransform:'capitalize' }}>{monthLabel}</span>
        <button onClick={nextMonth} style={{ width:26, height:26, border:'none', background:'#F4F4F5', borderRadius:6, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <i className="ti ti-chevron-right" style={{ fontSize:12, color:'#374151' }} />
        </button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2, marginBottom:2 }}>
        {DOW.map((d, i) => (
          <div key={i} style={{ textAlign:'center', fontSize:10, fontWeight:600, color:'#A1A1AA', padding:'2px 0' }}>{d}</div>
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const d   = ds(day);
          const sel = d === value;
          const isT = d === todayStr;
          const bsy = busyDates.has(d);
          const pst = d < todayStr;
          return (
            <button key={i} onClick={() => !pst && onChange(d)}
              style={{ width:'100%', height:32, border:'none', borderRadius:7, cursor:pst?'default':'pointer', background:sel?'#000000':isT?'#F4F4F5':'transparent', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:1, padding:0, opacity:pst?0.35:1 }}>
              <span style={{ fontSize:12, fontWeight: sel||isT ? 600 : 400, color:sel?'#FFFFFF':'#09090B', lineHeight:1 }}>{day}</span>
              {bsy && !sel && <span style={{ width:4, height:4, borderRadius:'50%', background:'#2563EB', display:'block' }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Agendar Panel ────────────────────────────────────────────────────────────
const HOUR_H    = 44;
const DAY_START = 7 * 60;
const HOURS_LIST = Array.from({ length: 14 }, (_, i) => 7 + i);

function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minsToTimeStr(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;
}

function blockTop(startMins: number): number {
  return Math.max(0, (startMins - DAY_START) / 60 * HOUR_H);
}

function blockHeight(startMins: number, endMins: number): number {
  const dur = Math.min(endMins, DAY_START + 13 * 60) - Math.max(startMins, DAY_START);
  return Math.max(20, (dur / 60) * HOUR_H);
}

function AgendarPanel({ session, allSessions, onClose, onSaved }: {
  session: Session;
  allSessions: Session[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const defaultStart = (() => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setHours(now.getHours() + 1);
    return `${String(now.getHours()).padStart(2,'0')}:00`;
  })();

  const defaultEnd = (() => {
    const dur = session.duracaoDefault ?? 60;
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setHours(now.getHours() + 1);
    const em = now.getHours() * 60 + dur;
    return minsToTimeStr(Math.min(em, 20 * 60));
  })();

  const [date,      setDate]      = useState('');
  const [startTime, setStartTime] = useState(defaultStart);
  const [endTime,   setEndTime]   = useState(defaultEnd);
  const [room,      setRoom]      = useState(session.salaDefault ?? ROOMS[0]);
  const [notes,     setNotes]     = useState('');
  const [profId,    setProfId]    = useState(session.professionalId ?? '');
  const [error,     setError]     = useState('');

  const busyDates = useMemo(() => {
    const s = new Set<string>();
    for (const ss of allSessions) {
      if (ss.isoDate) s.add(ss.isoDate.slice(0, 10));
    }
    return s;
  }, [allSessions]);

  const qc = useQueryClient();

  const { data: profissionais = [] } = useQuery({
    queryKey: ['professionals'],
    queryFn: () => agendaApi.professionals(),
  });

  const { data: agendaItems = [] } = useQuery({
    queryKey: ['agenda-day', date],
    queryFn: () => agendaApi.list({ start: `${date}T00:00:00`, end: `${date}T23:59:59` }),
    enabled: !!date,
  });

  const sessionsOnDay = useMemo(() => {
    if (!date) return [];
    return allSessions.filter(s =>
      s.isoDate && s.isoDate.startsWith(date) && s.id !== session.id
    );
  }, [allSessions, date, session.id]);

  const timelineBlocks = useMemo(() => {
    const blocks: { startMins: number; endMins: number; label: string; profId?: string; room?: string }[] = [];

    for (const a of agendaItems as any[]) {
      const sd = new Date(a.startTime);
      const ed = new Date(a.endTime);
      blocks.push({
        startMins: sd.getHours() * 60 + sd.getMinutes(),
        endMins:   ed.getHours() * 60 + ed.getMinutes(),
        label:     a.patient?.name ?? 'Agendamento',
        profId:    a.professionalId ?? undefined,
        room:      a.room ?? undefined,
      });
    }

    for (const s of sessionsOnDay) {
      if (!s.isoDate) continue;
      const sd = new Date(s.isoDate);
      const sm = sd.getHours() * 60 + sd.getMinutes();
      blocks.push({
        startMins: sm,
        endMins:   sm + (s.duracaoDefault ?? 60),
        label:     s.paciente,
        profId:    s.professionalId ?? undefined,
        room:      s.salaDefault ?? undefined,
      });
    }

    return blocks;
  }, [agendaItems, sessionsOnDay]);

  const selStart = date ? timeToMins(startTime) : null;
  const selEnd   = date ? timeToMins(endTime)   : null;

  function blockConflicts(b: { startMins: number; endMins: number; profId?: string; room?: string }): boolean {
    if (selStart === null || selEnd === null || selEnd <= selStart) return false;
    if (selStart >= b.endMins || selEnd <= b.startMins) return false;
    return (!!profId && b.profId === profId) || (!!room && b.room === room);
  }

  const hasConflict = useMemo(
    () => {
      if (selStart === null || selEnd === null || selEnd <= selStart) return false;
      return timelineBlocks.some(b => {
        if (selStart >= b.endMins || selEnd <= b.startMins) return false;
        return (!!profId && b.profId === profId) || (!!room && b.room === room);
      });
    },
    [timelineBlocks, selStart, selEnd, profId, room]
  );

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
    if (!profId) { setError('Selecione o profissional.'); return; }
    if (timeToMins(endTime) <= timeToMins(startTime)) { setError('Hora fim deve ser maior que hora início.'); return; }
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
  const showPreview = !!(date && selStart !== null && selEnd !== null && selEnd > selStart);
  const timelineHeight = 13 * HOUR_H;

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.3)', zIndex:9000, backdropFilter:'blur(3px)' }} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:'min(88vw, 1100px)', background:'#FFFFFF', zIndex:9001, boxShadow:'-8px 0 40px rgba(0,0,0,.18)', display:'flex', flexDirection:'column', fontFamily:"'Inter', system-ui, sans-serif", animation:'slideIn .22s cubic-bezier(0.32,0.72,0,1)', overflow:'hidden' }}>

        <div style={{ flexShrink:0, padding:'18px 28px', borderBottom:'1px solid #E4E4E7', display:'flex', alignItems:'center', justifyContent:'space-between', background:'#FFFFFF' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:'#EFF6FF', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className="ti ti-calendar-plus" style={{ fontSize:18, color:'#2563EB' }} />
            </div>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:'#09090B' }}>Agendar sessão</div>
              <div style={{ fontSize:12, color:'#71717A', marginTop:1 }}>{session.paciente} · {session.sessao} · {session.procedimento}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width:30, height:30, border:'none', background:'#F4F4F5', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <i className="ti ti-x" style={{ fontSize:13, color:'#71717A' }} />
          </button>
        </div>

        <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
          <div style={{ width:400, flexShrink:0, borderRight:'1px solid #E4E4E7', display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ background:'#F9F9F9', borderRadius:10, border:'1px solid #E4E4E7', padding:'12px 14px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 16px' }}>
                {[
                  { label:'Paciente',     value:session.paciente },
                  { label:'Procedimento', value:session.procedimento },
                  { label:'Sessão',       value:session.sessao },
                  { label:'Status atual', value:STATUS_CFG[session.status]?.label ?? session.status },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div style={{ fontSize:10, color:'#9CA3AF', fontWeight:500, textTransform:'uppercase', letterSpacing:'.04em', marginBottom:2 }}>{label}</div>
                    <div style={{ fontSize:13, fontWeight:500, color:'#191C1D' }}>{value}</div>
                  </div>
                ))}
              </div>
              <div>
                <label style={lbl}>Data <span style={{ color:'#DC2626' }}>*</span></label>
                <MiniCalendar value={date} onChange={setDate} busyDates={busyDates} />
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
              <div>
                <label style={lbl}>Profissional <span style={{ color:'#DC2626' }}>*</span></label>
                <select value={profId} onChange={e => setProfId(e.target.value)} style={{ ...inp, cursor:'pointer' }}>
                  <option value="">Selecione...</option>
                  {(profissionais as any[]).map((p: any) => (
                    <option key={p.id} value={p.id}>{p.user?.name ?? p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>Sala</label>
                <select value={room} onChange={e => setRoom(e.target.value)} style={{ ...inp, cursor:'pointer' }}>
                  {ROOMS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Observações</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  placeholder="Observações opcionais..."
                  style={{ ...inp, height:'auto', padding:'8px 10px', resize:'vertical' }} />
              </div>
              {hasConflict && (
                <div style={{ padding:'10px 12px', background:'#FFFBEB', border:'1px solid #FCD34D', borderRadius:8, display:'flex', gap:8, alignItems:'flex-start' }}>
                  <i className="ti ti-alert-triangle" style={{ fontSize:15, color:'#D97706', marginTop:1, flexShrink:0 }} />
                  <div>
                    <div style={{ fontSize:12, fontWeight:600, color:'#92400E' }}>Conflito de horário</div>
                    <div style={{ fontSize:11, color:'#92400E', marginTop:2 }}>Profissional ou sala já estão ocupados nesse horário.</div>
                  </div>
                </div>
              )}
              {error && (
                <div style={{ padding:'10px 12px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, fontSize:12, color:'#DC2626' }}>{error}</div>
              )}
            </div>
            <div style={{ flexShrink:0, padding:'14px 24px', borderTop:'1px solid #E4E4E7', display:'flex', gap:10, background:'#FAFAFA' }}>
              <button onClick={onClose} style={{ flex:1, height:40, border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:8, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit' }}>
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saveMut.isPending}
                style={{ flex:2, height:40, background:saveMut.isPending?'#A1A1AA':'#000000', border:'none', borderRadius:8, fontSize:13, fontWeight:600, color:'#FFFFFF', cursor:saveMut.isPending?'not-allowed':'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                <i className="ti ti-calendar-check" style={{ fontSize:14 }} />
                {saveMut.isPending ? 'Agendando...' : 'Confirmar agendamento'}
              </button>
            </div>
          </div>

          <div style={{ flex:1, display:'flex', flexDirection:'column', background:'#F9FAFB', overflow:'hidden' }}>
            <div style={{ flexShrink:0, padding:'14px 20px 12px', borderBottom:'1px solid #E4E4E7', background:'#FFFFFF' }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:600, color:'#09090B' }}>Agenda do dia</div>
                  <div style={{ fontSize:11, color:'#71717A', marginTop:2 }}>
                    {date
                      ? new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' })
                      : 'Selecione uma data para ver a agenda'
                    }
                  </div>
                </div>
                {date && (
                  <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', justifyContent:'flex-end' }}>
                    {[
                      { bg:'#EFF6FF', border:'#93C5FD', label:'Ocupado' },
                      { bg:'#DCFCE7', border:'#86EFAC', label:'Selecionado' },
                      { bg:'#FEF2F2', border:'#FCA5A5', label:'Conflito' },
                    ].map(l => (
                      <div key={l.label} style={{ display:'flex', alignItems:'center', gap:4 }}>
                        <div style={{ width:10, height:10, borderRadius:2, background:l.bg, border:`1.5px solid ${l.border}` }} />
                        <span style={{ fontSize:10, color:'#71717A' }}>{l.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {!date ? (
              <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, padding:24 }}>
                <i className="ti ti-calendar-event" style={{ fontSize:40, color:'#E4E4E7' }} />
                <div style={{ fontSize:13, fontWeight:500, color:'#A1A1AA' }}>Selecione uma data</div>
                <div style={{ fontSize:11, color:'#D4D4D8', textAlign:'center' }}>A agenda do dia aparecerá aqui para verificar conflitos</div>
              </div>
            ) : (
              <div style={{ flex:1, overflowY:'auto', padding:'12px 16px 24px' }}>
                <div style={{ position:'relative', height: timelineHeight + 24 }}>
                  {HOURS_LIST.map(h => (
                    <div key={h} style={{ position:'absolute', top:(h - 7) * HOUR_H, left:0, right:0, display:'flex', alignItems:'center', gap:6, pointerEvents:'none' }}>
                      <span style={{ fontSize:10, color:'#9CA3AF', width:36, textAlign:'right', flexShrink:0 }}>{String(h).padStart(2,'0')}:00</span>
                      <div style={{ flex:1, height:1, background: h % 2 === 0 ? '#E4E4E7' : '#F4F4F5' }} />
                    </div>
                  ))}
                  {timelineBlocks.map((b, i) => {
                    const isConflict = blockConflicts(b);
                    return (
                      <div key={i} style={{ position:'absolute', top:blockTop(b.startMins), height:blockHeight(b.startMins, b.endMins), left:44, right:4, background:isConflict?'#FEF2F2':'#EFF6FF', border:`1.5px solid ${isConflict?'#FCA5A5':'#93C5FD'}`, borderRadius:6, padding:'3px 8px', overflow:'hidden', boxSizing:'border-box' }}>
                        <div style={{ fontSize:11, fontWeight:600, color:isConflict?'#DC2626':'#1D4ED8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{b.label}</div>
                        <div style={{ fontSize:10, color:isConflict?'#EF4444':'#60A5FA' }}>{minsToTimeStr(b.startMins)} – {minsToTimeStr(b.endMins)}</div>
                      </div>
                    );
                  })}
                  {showPreview && selStart !== null && selEnd !== null && (
                    <div style={{ position:'absolute', top:blockTop(selStart), height:blockHeight(selStart, selEnd), left:44, right:4, background:hasConflict?'#FEF2F2':'#DCFCE7', border:`2px dashed ${hasConflict?'#DC2626':'#16A34A'}`, borderRadius:6, padding:'3px 8px', overflow:'hidden', boxSizing:'border-box', zIndex:2 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:hasConflict?'#DC2626':'#15803D', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {session.paciente}{hasConflict && <span style={{ marginLeft:4 }}>⚠</span>}
                      </div>
                      <div style={{ fontSize:10, color:hasConflict?'#EF4444':'#16A34A' }}>{startTime} – {endTime}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
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
    { icon:'ti-user', label:'Abrir contato', action: () => { onOpenPatient(); onClose(); } },
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

// ─── Finalizar Modal ──────────────────────────────────────────────────────────
function FinalizarModal({ sessao, patientId, onClose, onSaved }: {
  sessao: PackageSessao;
  patientId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [notes,     setNotes]     = useState('');
  const [materials, setMaterials] = useState('');
  const qc = useQueryClient();

  const saveMut = useMutation({
    mutationFn: async () => {
      const parts: string[] = [];
      parts.push(`**${sessao.nome}** — Sessão finalizada`);
      if (notes.trim())     parts.push(`\nO que foi feito: ${notes.trim()}`);
      if (materials.trim()) parts.push(`\nMateriais utilizados: ${materials.trim()}`);
      await prontuarioApi.createEvolution(patientId, { content: parts.join('') });
      await sessionsApi.update(sessao.id, { sessionStatus: 'REALIZADA' });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sessions'] }); onSaved(); onClose(); },
  });

  const inp2: React.CSSProperties = { width:'100%', padding:'8px 12px', border:'1px solid #E4E4E7', borderRadius:8, fontSize:13, color:'#09090B', fontFamily:'inherit', outline:'none', resize:'vertical', boxSizing:'border-box', background:'#FFFFFF' };

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:9800, backdropFilter:'blur(3px)' }} />
      <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'min(90vw,520px)', background:'#FFFFFF', borderRadius:20, zIndex:9801, boxShadow:'0 20px 60px rgba(0,0,0,.22)', padding:'24px', fontFamily:"'Inter',system-ui,sans-serif" }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:'#09090B' }}>Finalizar sessão</div>
            <div style={{ fontSize:12, color:'#71717A', marginTop:2 }}>{sessao.nome}</div>
          </div>
          <button onClick={onClose} style={{ width:30, height:30, border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <i className="ti ti-x" style={{ fontSize:13, color:'#71717A' }} />
          </button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <label style={{ fontSize:12, fontWeight:500, color:'#71717A', display:'block', marginBottom:4 }}>O que foi feito <span style={{ color:'#DC2626' }}>*</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="Descreva os procedimentos realizados..."
              style={inp2} />
          </div>
          <div>
            <label style={{ fontSize:12, fontWeight:500, color:'#71717A', display:'block', marginBottom:4 }}>Materiais utilizados</label>
            <textarea value={materials} onChange={e => setMaterials(e.target.value)} rows={2}
              placeholder="Ex: ácido hialurônico 1ml, fios de PDO..."
              style={inp2} />
          </div>
          {saveMut.isError && (
            <div style={{ padding:'10px 12px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, fontSize:12, color:'#DC2626' }}>
              Erro ao finalizar sessão. Tente novamente.
            </div>
          )}
          <div style={{ display:'flex', gap:10, marginTop:4 }}>
            <button onClick={onClose} style={{ flex:1, height:40, border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:8, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit' }}>
              Cancelar
            </button>
            <button onClick={() => saveMut.mutate()} disabled={!notes.trim() || saveMut.isPending}
              style={{ flex:2, height:40, background:!notes.trim()||saveMut.isPending?'#A1A1AA':'#000000', border:'none', borderRadius:8, fontSize:13, fontWeight:600, color:'#FFFFFF', cursor:!notes.trim()||saveMut.isPending?'not-allowed':'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <i className="ti ti-circle-check" style={{ fontSize:14 }} />
              {saveMut.isPending ? 'Finalizando...' : 'Finalizar sessão'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Package Detail Drawer ────────────────────────────────────────────────────
function PackageDetailDrawer({ pacote, onClose, onAgendar, onFinalizar }: {
  pacote: Pacote;
  onClose: () => void;
  onAgendar: (sessao: PackageSessao) => void;
  onFinalizar: (sessao: PackageSessao) => void;
}) {
  const navigate = useNavigate();
  const pkgSt = PKG_STATUS_CFG[pacote.status];
  const pct   = pacote.contratadas > 0 ? Math.round((pacote.realizadas / pacote.contratadas) * 100) : 0;
  const proximaAgendar = pacote.sessoes.find(s => s.status === 'a_agendar');

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.35)', zIndex:300, backdropFilter:'blur(2px)' }} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:'min(92vw,900px)', background:'#FFFFFF', zIndex:301, display:'flex', flexDirection:'column', fontFamily:"'Inter',system-ui,sans-serif", boxShadow:'-8px 0 40px rgba(0,0,0,.13)', animation:'slideIn .2s ease' }}>

        <div style={{ flexShrink:0, background:'#FFFFFF', borderBottom:'1px solid #F1F3F5', padding:'20px 24px', display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:'#191C1D', marginBottom:3 }}>Detalhes do pacote</div>
            <div style={{ fontSize:12, color:'#71717A' }}>{pacote.paciente} · {pacote.procedimento}</div>
          </div>
          <button onClick={onClose} style={{ width:30, height:30, border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#71717A', flexShrink:0 }}>
            <i className="ti ti-x" style={{ fontSize:13 }} />
          </button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
          {/* Progress card */}
          <div style={{ background:'#FFFFFF', borderRadius:16, border:'1px solid #EAECEF', padding:'16px 20px', marginBottom:16, boxShadow:'0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#191C1D' }}>Progresso do pacote</div>
              <span style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:99, background:pkgSt.bg, color:pkgSt.color, border:`1px solid ${pkgSt.color}20`, display:'inline-flex', alignItems:'center', gap:5 }}>
                <span style={{ width:5, height:5, borderRadius:'50%', background:pkgSt.dot, flexShrink:0 }} />
                {pkgSt.label}
              </span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:14 }}>
              {[
                { label:'Contratadas', value:pacote.contratadas, color:'#374151' },
                { label:'Agendadas',   value:pacote.agendadas,   color:'#2563EB' },
                { label:'Realizadas',  value:pacote.realizadas,  color:'#16A34A' },
                { label:'Restantes',   value:pacote.restantes,   color:'#7C3AED' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ textAlign:'center', padding:'12px 8px', borderRadius:12, background:'rgba(248,249,250,0.7)', border:'1px solid #F1F3F5' }}>
                  <div style={{ fontSize:22, fontWeight:700, color, lineHeight:1.1 }}>{value}</div>
                  <div style={{ fontSize:11, color:'#71717A', marginTop:3 }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
              <div style={{ fontSize:11, color:'#71717A' }}>Progresso</div>
              <div style={{ fontSize:11, fontWeight:600, color:'#191C1D' }}>{pct}%</div>
            </div>
            <div style={{ height:6, borderRadius:99, background:'#F1F3F5', overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${pct}%`, background: pct === 100 ? '#16A34A' : pct > 60 ? '#2563EB' : '#D97706', borderRadius:99, transition:'width .3s' }} />
            </div>
          </div>

          {/* Sessions list */}
          <div style={{ background:'#FFFFFF', borderRadius:16, border:'1px solid #EAECEF', overflow:'hidden', marginBottom:16, boxShadow:'0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid #F1F3F5', fontSize:13, fontWeight:700, color:'#191C1D' }}>Sessões do pacote</div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'rgba(248,249,250,0.7)' }}>
                  {['Sessão','Status','Data','Profissional','Ação'].map((h) => (
                    <th key={h} style={{ padding:'8px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'#747686', textTransform:'uppercase', letterSpacing:'.05em', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pacote.sessoes.map((s, i) => {
                  const st = STATUS_CFG[s.status];
                  return (
                    <tr key={i} style={{ borderTop:'1px solid #F1F3F5' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F8F9FA')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding:'9px 14px', fontSize:12, fontWeight:500, color:'#374151' }}>{s.nome}</td>
                      <td style={{ padding:'9px 14px' }}>
                        <span style={{ fontSize:10, fontWeight:600, padding:'2px 9px', borderRadius:99, background:st.bg, color:st.color, border:`1px solid ${st.color}20` }}>{st.label}</span>
                      </td>
                      <td style={{ padding:'9px 14px', fontSize:11, color: s.status === 'a_agendar' ? '#A1A1AA' : '#374151', whiteSpace:'nowrap', fontStyle: s.status === 'a_agendar' ? 'italic' : 'normal' }}>
                        {s.status === 'a_agendar'
                          ? 'A agendar'
                          : s.data && s.data !== '—'
                            ? `${['agendada','confirmada','em_atendimento','reagendada'].includes(s.status) ? 'Agendada para ' : ''}${s.data}`
                            : '—'}
                      </td>
                      <td style={{ padding:'9px 14px', fontSize:11, color:'#747686' }}>{s.profissional}</td>
                      <td style={{ padding:'9px 14px' }}>
                        {s.status === 'a_agendar' ? (
                          <button onClick={() => onAgendar(s)}
                            style={{ height:26, padding:'0 12px', background:'#000', border:'none', borderRadius:99, fontSize:11, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>
                            Agendar
                          </button>
                        ) : (s.status === 'agendada' || s.status === 'confirmada' || s.status === 'em_atendimento') ? (
                          <button onClick={() => onFinalizar(s)}
                            style={{ height:26, padding:'0 12px', background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:99, fontSize:11, fontWeight:600, color:'#16A34A', cursor:'pointer', fontFamily:'inherit' }}>
                            Finalizar
                          </button>
                        ) : (
                          <button onClick={() => { onClose(); navigate(`/patients/${pacote.patientId}`); }}
                            style={{ height:26, padding:'0 12px', background:'#F4F4F5', border:'1px solid #E4E4E7', borderRadius:99, fontSize:11, fontWeight:500, color:'#71717A', cursor:'pointer', fontFamily:'inherit' }}>
                            Ver paciente
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ flexShrink:0, background:'#FFFFFF', borderTop:'1px solid #F1F3F5', padding:'14px 24px', display:'flex', gap:8, flexWrap:'wrap' }}>
          {proximaAgendar && (
            <button onClick={() => onAgendar(proximaAgendar)}
              style={{ height:36, padding:'0 16px', background:'#000', border:'none', borderRadius:99, fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:6, boxShadow:'0 2px 8px rgba(0,0,0,0.15)' }}>
              <i className="ti ti-calendar-plus" style={{ fontSize:13 }} /> Agendar próxima
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Packages Table ───────────────────────────────────────────────────────────
function PackagesTable({ pacotes, onView }: { pacotes: Pacote[]; onView: (p: Pacote) => void }) {
  if (pacotes.length === 0) return (
    <div style={{ padding:'60px 0', textAlign:'center' }}>
      <i className="ti ti-package-off" style={{ fontSize:40, display:'block', margin:'0 auto 12px', color:'#D4D4D8' }} />
      <div style={{ fontSize:14, fontWeight:500, color:'#71717A', marginBottom:4 }}>Nenhum pacote com sessões pendentes</div>
      <div style={{ fontSize:12, color:'#A1A1AA' }}>Todos os pacotes estão concluídos ou não há sessões cadastradas</div>
    </div>
  );

  const COLS = ['Contato', 'Pacote / Procedimento', 'Contratação', 'Contratadas', 'Agendadas', 'Realizadas', 'Restantes', 'Status', 'Ações'];

  return (
    <table style={{ width:'100%', borderCollapse:'collapse' }}>
      <thead>
        <tr style={{ background:'rgba(248,249,250,0.7)', borderBottom:'1px solid #F1F3F5' }}>
          {COLS.map((h, i) => (
            <th key={h} style={{ padding:'10px 12px', textAlign: (i >= 3 && i <= 6) ? 'center' : i === 8 ? 'right' : 'left', fontSize:11, fontWeight:600, color:'#747686', textTransform:'uppercase', letterSpacing:'.06em', whiteSpace:'nowrap' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {pacotes.map(p => {
          const st  = PKG_STATUS_CFG[p.status];
          const pct = p.contratadas > 0 ? Math.round((p.realizadas / p.contratadas) * 100) : 0;
          return (
            <tr key={p.id} style={{ borderBottom:'1px solid #F1F3F5' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F8F9FA')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <td style={{ padding:'12px 12px' }}>
                <div style={{ fontSize:13, fontWeight:500, color:'#191C1D' }}>{p.paciente}</div>
                {p.phone && <div style={{ fontSize:11, color:'#747686', marginTop:2 }}>{p.phone}</div>}
              </td>
              <td style={{ padding:'12px 12px', fontSize:13, color:'#444654', maxWidth:180 }}>
                <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.procedimento}</div>
              </td>
              <td style={{ padding:'12px 12px', fontSize:12, color:'#747686', whiteSpace:'nowrap' }}>{p.dataContratacao}</td>
              <td style={{ padding:'12px 12px', textAlign:'center', fontSize:13, fontWeight:600, color:'#374151' }}>{p.contratadas}</td>
              <td style={{ padding:'12px 12px', textAlign:'center' }}>
                <span style={{ fontSize:13, fontWeight:700, color: p.agendadas > 0 ? '#2563EB' : '#A1A1AA' }}>{p.agendadas}</span>
              </td>
              <td style={{ padding:'12px 12px', textAlign:'center' }}>
                <span style={{ fontSize:13, fontWeight:700, color:'#16A34A' }}>{p.realizadas}</span>
              </td>
              <td style={{ padding:'12px 12px', textAlign:'center' }}>
                <span style={{ fontSize:13, fontWeight:700, color:'#7C3AED' }}>{p.restantes}</span>
              </td>
              <td style={{ padding:'12px 16px' }}>
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  <span style={{ fontSize:11, fontWeight:600, padding:'2px 10px', borderRadius:99, background:st.bg, color:st.color, border:`1px solid ${st.color}20`, display:'inline-flex', alignItems:'center', gap:5, width:'fit-content' }}>
                    <span style={{ width:5, height:5, borderRadius:'50%', background:st.dot, flexShrink:0 }} />
                    {st.label}
                  </span>
                  <div style={{ height:4, borderRadius:99, background:'#F1F3F5', width:72, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${pct}%`, background: pct === 100 ? '#16A34A' : pct > 60 ? '#2563EB' : '#D97706', borderRadius:99 }} />
                  </div>
                </div>
              </td>
              <td style={{ padding:'12px 16px', textAlign:'right' }}>
                <TableActions
                  primaryAction={{ label:'Ver sessões', icon:'ti-eye', variant:'default', onClick: () => onView(p) }}
                />
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

  const [search,         setSearch]         = useState('');
  const [statusFilter,   setStatusFilter]   = useState<PackageStatus | ''>('');
  const [showAll,        setShowAll]        = useState(false);
  const [filtersOpen,    setFiltersOpen]    = useState(false);
  const [ctxMenu,        setCtxMenu]        = useState<CtxMenu | null>(null);
  const [detailPkgId,    setDetailPkgId]    = useState<string | null>(null);
  const [agendarSession, setAgendarSession] = useState<Session | null>(null);
  const [finalizarData,  setFinalizarData]  = useState<{ sessao: PackageSessao; patientId: string } | null>(null);
  const filtersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filtersOpen) return;
    const handler = (e: MouseEvent) => {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) setFiltersOpen(false);
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [filtersOpen]);

  const { data: rawSessions = [], isLoading, isError } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => sessionsApi.list(),
    refetchOnWindowFocus: true,
  });

  const sessions: Session[] = useMemo(() => {
    const countBySale = new Map<string, number>();
    for (const s of rawSessions as any[]) {
      if (s.saleId) countBySale.set(s.saleId, (countBySale.get(s.saleId) ?? 0) + 1);
    }
    return (rawSessions as any[]).map(s => mapApiSession(s, countBySale));
  }, [rawSessions]);

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
      .filter(([, list]) => list.length >= 1)
      .map(([saleId, list]) => {
        const realizadas = list.filter(s => s.status === 'realizada').length;
        const canceladas = list.filter(s => s.status === 'cancelada').length;
        const agendadas  = list.filter(s => s.status === 'agendada' || s.status === 'confirmada' || s.status === 'em_atendimento' || s.status === 'reagendada').length;
        const todasRealizadas = realizadas === list.length;
        const algumVencida = list.some(s => s.status === 'vencida');
        let pkgStatus: PackageStatus = 'ativo';
        if (todasRealizadas) pkgStatus = 'concluido';
        else if (algumVencida) pkgStatus = 'atencao';
        else if (canceladas === list.length) pkgStatus = 'cancelado';

        const saleCreatedAt = list[0].saleCreatedAt;

        return {
          id:              saleId,
          paciente:        list[0].paciente,
          phone:           list[0].phone,
          patientId:       list[0].patientId,
          procedimento:    list[0].procedimento,
          contratadas:     list.length,
          agendadas,
          realizadas,
          restantes:       list.length - realizadas - canceladas,
          validade:        '—',
          status:          pkgStatus,
          venda:           `#${saleId.slice(-6).toUpperCase()}`,
          dataContratacao: saleCreatedAt
            ? new Date(saleCreatedAt).toLocaleDateString('pt-BR')
            : '—',
          sessoes: list
            .slice()
            .sort((a, b) => (a.sessionNumber ?? 0) - (b.sessionNumber ?? 0))
            .map(s => ({
              id:           s.id,
              nome:         s.sessao,
              status:       s.status,
              data:         s.data,
              profissional: s.profissional,
            })),
        } satisfies Pacote;
      });
  }, [sessions]);

  const detailPkg = useMemo(() => pacotes.find(p => p.id === detailPkgId) ?? null, [pacotes, detailPkgId]);

  const kpiAtivos     = pacotes.filter(p => p.status === 'ativo' || p.status === 'atencao').length;
  const kpiAgendar    = pacotes.reduce((sum, p) => sum + Math.max(0, p.restantes - p.agendadas), 0);
  const kpiVencidas   = sessions.filter(s => s.status === 'vencida').length;
  const kpiConcluidos = pacotes.filter(p => p.status === 'concluido').length;

  const cancelMut = useMutation({
    mutationFn: (id: string) => sessionsApi.update(id, { sessionStatus: 'CANCELADA' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sessions'] }); setCtxMenu(null); },
  });

  const navigate = useNavigate();
  const { toast } = useToast();
  const ni = () => toast('Funcionalidade ainda não implementada.', 'info');

  function handleAgendarFromDrawer(sessao: PackageSessao) {
    const fullSession = sessions.find(s => s.id === sessao.id);
    if (!fullSession) return;
    setDetailPkgId(null);
    setAgendarSession(fullSession);
  }

  function handleFinalizarFromDrawer(sessao: PackageSessao) {
    if (!detailPkg) return;
    setFinalizarData({ sessao, patientId: detailPkg.patientId });
  }

  const handleCtxMenu = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const session = sessions.find(s => s.id === id);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setCtxMenu({ x: rect.right - 190, y: rect.bottom + 4, sessionId: id, patientId: session?.patientId, saleId: session?.saleId ?? undefined });
  };
  // handleCtxMenu kept for context menu support — not shown in current table but used by ContextMenu component
  void handleCtxMenu;

  const filteredPacotes = useMemo(() => {
    let result = pacotes;
    if (!showAll) result = result.filter(p => p.restantes > 0);
    if (statusFilter) result = result.filter(p => p.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.paciente.toLowerCase().includes(q) ||
        p.phone.toLowerCase().includes(q) ||
        p.procedimento.toLowerCase().includes(q)
      );
    }
    return result;
  }, [pacotes, showAll, statusFilter, search]);

  const PKG_STATUS_OPTIONS: { value: PackageStatus | ''; label: string }[] = [
    { value: '',          label: 'Todos os status' },
    { value: 'ativo',     label: 'Ativo' },
    { value: 'atencao',   label: 'Atenção' },
    { value: 'vencido',   label: 'Vencido' },
    { value: 'concluido', label: 'Concluído' },
    { value: 'cancelado', label: 'Cancelado' },
  ];

  const kpis = [
    { label:'Pacotes ativos',     value: String(kpiAtivos),    sub:'tratamentos em andamento',  icon:'ti-package',        iconBg:'#F0FDF4', iconColor:'#16A34A' },
    { label:'Sessões a agendar',  value: String(kpiAgendar),   sub:'aguardando data marcada',   icon:'ti-calendar-x',     iconBg:'#EFF6FF', iconColor:'#2563EB' },
    { label:'Sessões vencidas',   value: String(kpiVencidas),  sub:'fora do prazo do pacote',   icon:'ti-alert-triangle', iconBg:'#FEF2F2', iconColor:'#DC2626' },
    { label:'Concluídos',         value: String(kpiConcluidos),sub:'pacotes finalizados',        icon:'ti-circle-check',   iconBg:'#F5F3FF', iconColor:'#7C3AED' },
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
          allSessions={sessions}
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
          onClose={() => setDetailPkgId(null)}
          onAgendar={handleAgendarFromDrawer}
          onFinalizar={handleFinalizarFromDrawer}
        />
      )}

      {finalizarData && (
        <FinalizarModal
          sessao={finalizarData.sessao}
          patientId={finalizarData.patientId}
          onClose={() => setFinalizarData(null)}
          onSaved={() => { setFinalizarData(null); toast('Sessão finalizada com sucesso!', 'success'); }}
        />
      )}

      <div style={{ padding:'24px 28px', fontFamily:"'Inter', system-ui, sans-serif" }}>

        {isLoading && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'80px 0', gap:10 }}>
            <i className="ti ti-loader-2" style={{ fontSize:20, color:'#A1A1AA', animation:'spin 1s linear infinite' }} />
            <span style={{ fontSize:13, color:'#71717A' }}>Carregando sessões...</span>
          </div>
        )}

        {isError && (
          <div style={{ padding:'16px 20px', background:'#FEF2F2', borderRadius:12, border:'1px solid #FECACA', marginBottom:16 }}>
            <div style={{ fontSize:13, color:'#DC2626', fontWeight:500 }}>Erro ao carregar sessões. Verifique a conexão e tente novamente.</div>
          </div>
        )}

        {!isLoading && !isError && (
          <>
            {/* KPI Cards */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
              {kpis.map(k => (
                <div key={k.label} style={{ display:'flex', alignItems:'center', gap:14, padding:'18px 20px', borderRadius:20, border:'1px solid #EAECEF', background:'#FFFFFF', boxShadow:'0 2px 8px rgba(0,0,0,0.03)' }}>
                  <div style={{ width:46, height:46, borderRadius:14, background:k.iconBg, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <i className={`ti ${k.icon}`} style={{ fontSize:21, color:k.iconColor }} />
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:'#71717A', fontWeight:500, marginBottom:3, textTransform:'uppercase', letterSpacing:'.05em' }}>{k.label}</div>
                    <div style={{ fontSize:22, fontWeight:700, color:'#09090B', lineHeight:1.1 }}>{k.value}</div>
                    <div style={{ fontSize:11, color:'#71717A', marginTop:2 }}>{k.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Toolbar */}
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, flexWrap:'wrap' }}>
              {/* Search */}
              <div style={{ display:'flex', alignItems:'center', gap:8, background:'#FFFFFF', border:'1px solid #E4E4E7', borderRadius:99, padding:'0 14px', height:38, width:300, boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
                <i className="ti ti-search" style={{ fontSize:14, color:'#A1A1AA', flexShrink:0 }} />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar contato, telefone ou pacote..."
                  style={{ border:'none', background:'transparent', fontSize:13, outline:'none', width:'100%', color:'#09090B', fontFamily:'inherit' }} />
                {search && (
                  <button onClick={() => setSearch('')}
                    style={{ border:'none', background:'none', cursor:'pointer', padding:0, color:'#A1A1AA', display:'flex', alignItems:'center', flexShrink:0 }}>
                    <i className="ti ti-x" style={{ fontSize:12 }} />
                  </button>
                )}
              </div>

              {/* Status filter */}
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as PackageStatus | '')}
                style={{ height:36, padding:'0 12px', border:'1px solid #E4E4E7', borderRadius:99, fontSize:12, color: statusFilter ? '#18181B' : '#A1A1AA', background:'#FFFFFF', cursor:'pointer', fontFamily:'inherit', outline:'none' }}>
                {PKG_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>

              {/* Filtros button */}
              <div ref={filtersRef} style={{ position:'relative' }}>
                <button onClick={() => setFiltersOpen(v => !v)}
                  style={{ height:36, padding:'0 14px', border:`1px solid ${filtersOpen || showAll ? '#000' : '#E4E4E7'}`, background: filtersOpen || showAll ? '#000' : '#FFFFFF', borderRadius:99, fontSize:12, fontWeight:500, color: filtersOpen || showAll ? '#FFFFFF' : '#18181B', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit', whiteSpace:'nowrap' }}
                  onMouseEnter={e => { if (!filtersOpen && !showAll) { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; } }}
                  onMouseLeave={e => { if (!filtersOpen && !showAll) { (e.currentTarget as HTMLElement).style.background = '#FFFFFF'; } }}>
                  <i className="ti ti-adjustments-horizontal" style={{ fontSize:14 }} />
                  Filtros
                  {showAll && <span style={{ fontSize:10, fontWeight:700, padding:'1px 5px', borderRadius:99, background:'rgba(255,255,255,.25)', color:'#fff' }}>1</span>}
                </button>

                {filtersOpen && (
                  <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:200, background:'#FFFFFF', border:'1px solid #E4E4E7', borderRadius:14, boxShadow:'0 8px 24px rgba(0,0,0,.12)', padding:'14px 16px', minWidth:230, animation:'fadeUp .12s ease' }}>
                    <div style={{ fontSize:11, fontWeight:600, color:'#A1A1AA', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Opções de exibição</div>
                    <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', padding:'4px 0' }}>
                      <div onClick={() => setShowAll(v => !v)}
                        style={{ width:38, height:22, borderRadius:99, background: showAll ? '#000' : '#E4E4E7', position:'relative', flexShrink:0, transition:'background .15s', cursor:'pointer' }}>
                        <div style={{ position:'absolute', top:3, left: showAll ? 19 : 3, width:16, height:16, borderRadius:'50%', background:'#FFFFFF', boxShadow:'0 1px 3px rgba(0,0,0,.2)', transition:'left .15s' }} />
                      </div>
                      <span style={{ fontSize:13, color:'#374151' }}>Incluir pacotes concluídos</span>
                    </label>
                  </div>
                )}
              </div>

              {(search || statusFilter) && (
                <button onClick={() => { setSearch(''); setStatusFilter(''); }}
                  style={{ fontSize:12, color:'#71717A', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit' }}>
                  Limpar
                </button>
              )}
            </div>

            {/* Table */}
            <div style={{ background:'#FFFFFF', borderRadius:20, border:'1px solid #EAECEF', overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.03)' }}>
              <PackagesTable pacotes={filteredPacotes} onView={p => setDetailPkgId(p.id)} />
              <div style={{ padding:'14px 20px', borderTop:'1px solid #F1F3F5', background:'rgba(248,249,250,0.4)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ fontSize:13, color:'#747686' }}>
                  Mostrando <b style={{ color:'#191C1D' }}>{filteredPacotes.length}</b> de <b style={{ color:'#191C1D' }}>{showAll ? pacotes.length : pacotes.filter(p => p.restantes > 0).length}</b> pacotes
                </div>
                <div style={{ fontSize:12, color:'#A1A1AA' }}>Página 1 de 1</div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
