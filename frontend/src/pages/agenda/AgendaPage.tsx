import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Portal } from '../../components/ui/Portal';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { patientsApi, agendaApi, appointmentTypesApi, plansApi, financialApi } from '../../services/api';

const HOUR_HEIGHT = 64;
const HOUR_START = 8;
const HOUR_END = 19;
const TOTAL_H = (HOUR_END - HOUR_START) * HOUR_HEIGHT;

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DAYS_LONG_PT = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
const DAYS_SHORT_PT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

const STATUSES: Record<string, { bg:string; border:string; text:string; dot:string; label:string }> = {
  agendado:    { bg:'#EFF6FF', border:'#BFDBFE', text:'#1D4ED8', dot:'#3B82F6',  label:'Agendado' },
  confirmado:  { bg:'#DCFCE7', border:'#BBF7D0', text:'#15803D', dot:'#22C55E',  label:'Confirmado' },
  aguardando:  { bg:'#FEF9C3', border:'#FDE68A', text:'#A16207', dot:'#F59E0B',  label:'Aguardando' },
  chegou:      { bg:'#F3E8FF', border:'#DDD6FE', text:'#7C3AED', dot:'#A78BFA',  label:'Chegou' },
  atendimento: { bg:'#DBEAFE', border:'#93C5FD', text:'#1D4ED8', dot:'#2563EB',  label:'Em atendimento' },
  finalizado:  { bg:'#F0FDF4', border:'#BBF7D0', text:'#15803D', dot:'#4ADE80',  label:'Finalizado' },
  faltou:      { bg:'#FEF2F2', border:'#FECACA', text:'#DC2626', dot:'#EF4444',  label:'Faltou' },
  cancelado:   { bg:'#F4F4F5', border:'#E4E4E7', text:'#71717A', dot:'#A1A1AA',  label:'Cancelado' },
  reagendado:  { bg:'#FFF7ED', border:'#FED7AA', text:'#C2410C', dot:'#FB923C',  label:'Reagendado' },
  bloqueado:   { bg:'#F1F5F9', border:'#CBD5E1', text:'#64748B', dot:'#94A3B8',  label:'Bloqueado' },
};

interface Prof { id: string; name: string; short: string; color: string; bg: string; }
const DEFAULT_PROF: Prof = { id: '', name: '—', short: '—', color: '#71717A', bg: '#F4F4F5' };

// Rooms loaded from localStorage (set in Configurações > Clínica > Salas)
function loadSettingsRooms(): { id: string; name: string; active: boolean }[] {
  try { return JSON.parse(localStorage.getItem('pcl_rooms') || '[]'); } catch { return []; }
}

interface Appt {
  id: string; profId: string; patient: string; patientId?: string;
  type: string; typeColor?: string; planId?: string; appointmentTypeId?: string; status: string;
  sh: number; sm: number; eh: number; em: number;
  room: string; phone: string; email: string; notes: string;
  dateOffset?: number;
  saleId?: string; saleStatus?: string; saleTotal?: number; salePaidAmount?: number;
  isFromPackage?: boolean;
}

// ─── Status mapping ───────────────────────────────────────────────────────────
const BACKEND_TO_STATUS: Record<string, string> = {
  AGUARDANDO: 'agendado',   CONFIRMADO: 'confirmado', CANCELADO: 'cancelado',
  FALTOU:     'faltou',     ATENCAO:    'aguardando', RETORNO:   'agendado',
  AVALIACAO:  'agendado',   ENCAIXE:    'agendado',
};
const STATUS_TO_BACKEND: Record<string, string> = {
  agendado:   'AGUARDANDO', confirmado: 'CONFIRMADO', aguardando: 'AGUARDANDO',
  chegou:     'CONFIRMADO', atendimento:'CONFIRMADO', finalizado: 'CONFIRMADO',
  faltou:     'FALTOU',     cancelado:  'CANCELADO',  reagendado: 'AGUARDANDO',
  bloqueado:  'AGUARDANDO',
};

function mapApiAppt(a: any, todayStart: Date): Appt {
  const start   = new Date(a.startTime);
  const end     = new Date(a.endTime);
  const apptDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const diff    = Math.round((apptDay.getTime() - todayStart.getTime()) / 86400000);
  // appointmentType is the correct type; fall back to old notes-embedded format
  const hasType = !!a.appointmentType?.name;
  const noteLines = (a.notes || '').split('\n');
  const type  = hasType ? a.appointmentType.name : (noteLines[0] || 'Consulta');
  const notes = hasType ? (a.notes || '') : noteLines.slice(1).join('\n');
  const typeColor = a.appointmentType?.color || undefined;
  return {
    id: a.id, profId: a.professionalId || '',
    patient: a.patient?.name || '—', patientId: a.patientId,
    type, typeColor, planId: a.planId || undefined,
    appointmentTypeId: a.appointmentTypeId || undefined,
    status: BACKEND_TO_STATUS[a.status] || 'agendado',
    sh: start.getHours(), sm: start.getMinutes(),
    eh: end.getHours(),   em: end.getMinutes(),
    room: a.room || '', phone: a.patient?.phone || '', email: a.patient?.email || '',
    notes, dateOffset: diff,
    saleId: a.sale?.id || undefined,
    saleStatus: a.sale?.status || undefined,
    saleTotal: a.sale?.total,
    salePaidAmount: a.sale?.paidAmount,
    isFromPackage: a.isFromPackage ?? false,
  };
}

// Blocked slots stay local-only (patientId is required in DB)
const BLOCKED_LS_KEY = 'pcl_blocked_slots';
function loadBlocked(): Appt[] {
  try { return JSON.parse(localStorage.getItem(BLOCKED_LS_KEY) ?? '[]'); } catch { return []; }
}
function saveBlocked(a: Appt[]) {
  try { localStorage.setItem(BLOCKED_LS_KEY, JSON.stringify(a)); } catch {}
}

const TIME_SLOTS: { h:number; m:number }[] = [];
for (let h = HOUR_START; h <= HOUR_END; h++) {
  TIME_SLOTS.push({ h, m:0 });
  if (h < HOUR_END) TIME_SLOTS.push({ h, m:30 });
}

function fmtTime(h:number, m:number) {
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
function apptTop(sh:number, sm:number) { return (sh - HOUR_START + sm/60) * HOUR_HEIGHT; }
function apptHeight(sh:number, sm:number, eh:number, em:number) {
  return ((eh*60+em) - (sh*60+sm)) / 60 * HOUR_HEIGHT;
}
function addDays(d:Date, n:number):Date { const r=new Date(d); r.setDate(r.getDate()+n); return r; }
function sameDay(a:Date, b:Date):boolean {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function formatTitle(d:Date):string { return `${d.getDate()} de ${MONTHS_PT[d.getMonth()]} de ${d.getFullYear()}`; }
function formatDayLabel(d:Date):string { return DAYS_LONG_PT[d.getDay()]; }
function miniCalCells(year:number, month:number):(number|null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const cells:(number|null)[] = Array(firstDay).fill(null);
  for (let i=1; i<=daysInMonth; i++) cells.push(i);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
function getWeekDays(d:Date):Date[] {
  const dow = d.getDay();
  const monday = addDays(d, dow===0 ? -6 : 1-dow);
  return Array.from({length:7}, (_,i) => addDays(monday, i));
}

// ─── Modals ────────────────────────────────────────────────────────────────────

function ModalOverlay({ children, onClose, width = 520 }: { children:React.ReactNode; onClose:()=>void; width?:number }) {
  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div onClick={e=>e.stopPropagation()} style={{ background:'#FFFFFF', borderRadius:16, width, maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 24px 80px rgba(0,0,0,0.18)', padding:'28px 32px', fontFamily:"'Inter', system-ui, sans-serif" }}>
          {children}
        </div>
      </div>
    </Portal>
  );
}

// ─── Input masks ─────────────────────────────────────────────────────────────
function maskPhone(v:string) {
  v = v.replace(/\D/g,'').slice(0,11);
  if (!v.length) return '';
  if (v.length <= 2) return `(${v}`;
  if (v.length <= 7) return `(${v.slice(0,2)}) ${v.slice(2)}`;
  if (v.length <= 10) return `(${v.slice(0,2)}) ${v.slice(2,6)}-${v.slice(6)}`;
  return `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
}
function maskCpf(v:string) {
  v = v.replace(/\D/g,'').slice(0,11);
  if (v.length <= 3) return v;
  if (v.length <= 6) return `${v.slice(0,3)}.${v.slice(3)}`;
  if (v.length <= 9) return `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6)}`;
  return `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6,9)}-${v.slice(9)}`;
}
function maskBirthDate(v:string) {
  v = v.replace(/\D/g,'').slice(0,8);
  if (v.length <= 2) return v;
  if (v.length <= 4) return `${v.slice(0,2)}/${v.slice(2)}`;
  return `${v.slice(0,2)}/${v.slice(2,4)}/${v.slice(4)}`;
}

interface SelPatient { id:string; name:string; phone:string; cpf?:string; email?:string; }
interface NovoApptInitial { date?: Date; startTime?: string; profId?: string; roomName?: string; patientId?: string; patientName?: string; patientPhone?: string; }

function calcEndTime(startTime: string, durationMin: number): string {
  const [sh, sm] = startTime.split(':').map(Number);
  const total = sh * 60 + sm + durationMin;
  return `${String(Math.floor(total / 60) % 24).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
}

function NovoAgendamentoModal({ onClose, defaultDate, onSave, modalProfs, initialValues }: {
  onClose: () => void;
  defaultDate: Date;
  onSave: (payload: any) => Promise<void>;
  modalProfs: Prof[];
  initialValues?: NovoApptInitial;
}) {
  const initDate = initialValues?.date || defaultDate;

  // ── Patient state ──
  const [mode, setMode]       = useState<'existing'|'new'>('existing');
  const [searchQ, setSearchQ] = useState('');
  const [searchRes, setSearchRes] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDrop, setShowDrop]   = useState(false);
  const [selPat, setSelPat]       = useState<SelPatient|null>(
    initialValues?.patientId
      ? { id: initialValues.patientId, name: initialValues.patientName || '', phone: initialValues.patientPhone || '' }
      : null
  );
  const [savedMsg, setSavedMsg]   = useState('');
  const [dupWarn, setDupWarn]     = useState<{patient:any; field:string}|null>(null);
  const [savingPat, setSavingPat] = useState(false);
  const [npName, setNpName]   = useState('');
  const [npPhone, setNpPhone] = useState('');
  const [npCpf, setNpCpf]     = useState('');
  const [npBirth, setNpBirth] = useState('');
  const [npEmail, setNpEmail] = useState('');
  const [npSource, setNpSource] = useState('Agenda');
  const [npNotes, setNpNotes]   = useState('');
  const [npErr, setNpErr]       = useState('');

  // ── Appointment state ──
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState('');
  const [profId, setProfId]     = useState(initialValues?.profId || modalProfs[0]?.id || '');
  const [dateStr, setDateStr]   = useState(() => {
    const d = initDate;
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
  const [startTime, setStartTime] = useState(initialValues?.startTime || '09:00');
  const [endTime, setEndTime]     = useState('');
  const [endTimeManual, setEndTimeManual] = useState(false);
  const [planId, setPlanId]       = useState('');
  const [room, setRoom]           = useState(initialValues?.roomName || '');
  const [apptNotes, setApptNotes] = useState('');
  const [status, setStatus]       = useState('agendado');

  // ── Load appointment types ──
  const { data: apptTypesData } = useQuery({
    queryKey: ['appointment-types'],
    queryFn: () => appointmentTypesApi.list(),
    staleTime: 5 * 60_000,
  });
  const activePlans: any[] = useMemo(() =>
    ((apptTypesData as any[]) || []).filter((t: any) => t.isActive !== false),
    [apptTypesData]
  );

  // ── Reservation state ──
  const [reservaOpen, setReservaOpen]         = useState(false);
  const [resPlanId, setResPlanId]             = useState('');
  const [resTotalAmount, setResTotalAmount]   = useState('');
  const [resReservaAmount, setResReservaAmount] = useState('');
  const [resPayMethodId, setResPayMethodId]   = useState('');
  const [resPayDate, setResPayDate]           = useState(() => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; });
  const [resNotes, setResNotes]               = useState('');

  const { data: plansForRes } = useQuery({
    queryKey: ['plans'],
    queryFn: () => plansApi.list(),
    staleTime: 5 * 60_000,
    enabled: reservaOpen,
  });
  const { data: payMethodsForRes } = useQuery({
    queryKey: ['financial-payment-methods'],
    queryFn: () => financialApi.paymentMethods(),
    staleTime: 5 * 60_000,
    enabled: reservaOpen,
  });
  const activeProcPlans = useMemo(() =>
    ((plansForRes as any[]) || []).filter((p: any) => p.active !== false),
    [plansForRes]
  );

  // ── Load rooms from localStorage ──
  const activeRooms = useMemo(() =>
    loadSettingsRooms().filter(r => r.active !== false),
    []
  );

  // ── Set first plan when plans load ──
  useEffect(() => {
    if (activePlans.length > 0 && !planId) {
      setPlanId(activePlans[0].id);
    }
  }, [activePlans, planId]);

  // ── Auto-calc end time when plan or startTime changes ──
  useEffect(() => {
    if (endTimeManual || !planId) return;
    const plan = activePlans.find(p => p.id === planId);
    if (!plan) return;
    const duration = plan.defaultDurationMinutes ?? 60;
    setEndTime(calcEndTime(startTime, duration));
  }, [planId, startTime, activePlans, endTimeManual]);

  // ── Initialize endTime on first render if no plan yet ──
  useEffect(() => {
    if (!endTime && !planId) {
      const [sh, sm] = (initialValues?.startTime || '09:00').split(':').map(Number);
      const total = sh * 60 + sm + 60;
      setEndTime(`${String(Math.floor(total/60)%24).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Patient search debounce ──
  useEffect(() => {
    if (searchQ.length < 2) { setSearchRes([]); setShowDrop(false); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await patientsApi.list({ search: searchQ });
        setSearchRes(res); setShowDrop(true);
      } catch { setSearchRes([]); } finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [searchQ]);

  async function checkDuplicate(field: 'cpf'|'phone', raw: string) {
    if (raw.length < 10) return;
    try {
      const res = await patientsApi.list({ search: raw });
      if (res.length > 0) setDupWarn({ patient: res[0], field });
    } catch {}
  }

  async function saveNewPatient() {
    setNpErr('');
    if (npName.trim().length < 2) { setNpErr('Informe o nome completo.'); return; }
    if (npPhone.replace(/\D/g,'').length < 10) { setNpErr('Informe um telefone válido.'); return; }
    setSavingPat(true);
    try {
      const user = (() => { try { return JSON.parse(localStorage.getItem('user')||'{}'); } catch { return {}; } })();
      let birthDate: string|undefined;
      if (npBirth.length === 10) {
        const [d,m,y] = npBirth.split('/');
        birthDate = new Date(`${y}-${m}-${d}T00:00:00`).toISOString();
      }
      const created = await patientsApi.create({
        name: npName.trim(), phone: npPhone,
        cpf: npCpf || undefined, birthDate: birthDate || undefined,
        email: npEmail || undefined, source: npSource || 'Agenda',
        notes: npNotes || undefined, contactType: 'PACIENTE', status: 'NOVO',
        responsavelCadastro: user.name || undefined,
      });
      setSelPat({ id:created.id, name:created.name, phone:created.phone||'', cpf:created.cpf, email:created.email });
      setMode('existing');
      setSavedMsg('Paciente cadastrado e selecionado para o agendamento.');
      setSearchQ('');
    } catch {
      setNpErr('Erro ao cadastrar paciente. Verifique os dados e tente novamente.');
    } finally { setSavingPat(false); }
  }

  function selectPatient(p: any) {
    setSelPat({ id:p.id, name:p.name, phone:p.phone||'', cpf:p.cpf, email:p.email });
    setShowDrop(false); setSearchQ(''); setSavedMsg('');
  }

  async function saveAppt() {
    setErr('');
    if (!selPat) { setErr(mode==='existing' ? 'Selecione um paciente ou cadastre um novo.' : 'Salve o paciente antes de criar o agendamento.'); return; }
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    if (sh*60+sm >= eh*60+em) { setErr('Hora de início deve ser antes da hora de fim.'); return; }
    if (reservaOpen && !resTotalAmount) { setErr('Informe o valor total da reserva.'); return; }
    setSaving(true);
    try {
      const selResPlan = activeProcPlans.find((p: any) => p.id === resPlanId);
      const payload: any = {
        patientId:         selPat.id,
        professionalId:    profId || null,
        appointmentTypeId: planId || null,
        startTime:         new Date(`${dateStr}T${startTime}:00`).toISOString(),
        endTime:           new Date(`${dateStr}T${endTime}:00`).toISOString(),
        status:            STATUS_TO_BACKEND[status] || 'AGUARDANDO',
        notes:             apptNotes || null,
        room:              room || null,
      };
      if (reservaOpen && resTotalAmount) {
        payload.reservation = {
          planId:            resPlanId || null,
          planName:          selResPlan?.name || 'Reserva de horário',
          totalAmount:       parseFloat(resTotalAmount.replace(',', '.')),
          reservationAmount: parseFloat((resReservaAmount || '0').replace(',', '.')),
          paymentMethodId:   resPayMethodId || null,
          paymentDate:       resPayDate || null,
          notes:             resNotes || null,
        };
      }
      await onSave(payload);
      onClose();
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'Erro ao salvar agendamento. Tente novamente.';
      setErr(msg);
    } finally { setSaving(false); }
  }

  const inp: React.CSSProperties = { width:'100%', height:36, padding:'0 10px', border:'1px solid #E4E4E7', borderRadius:8, fontSize:13, color:'#09090B', background:'#FFFFFF', boxSizing:'border-box', fontFamily:'inherit', outline:'none' };
  const lbl: React.CSSProperties = { fontSize:12, fontWeight:500, color:'#71717A', display:'block', marginBottom:4 };
  const secHdr: React.CSSProperties = { fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:12 };

  const selPlan = activePlans.find(p => p.id === planId);

  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.25)', zIndex:1000, backdropFilter:'blur(2px)' }} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:640, background:'#FFFFFF', zIndex:1001, boxShadow:'-4px 0 32px rgba(0,0,0,.14)', display:'flex', flexDirection:'column', fontFamily:"'Inter', system-ui, sans-serif", animation:'slideRight .22s cubic-bezier(0.32,0.72,0,1)', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'20px 28px', borderBottom:'1px solid #E4E4E7', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'#F0FDF4', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className="ti ti-calendar-plus" style={{ fontSize:18, color:'#16A34A' }} />
            </div>
            <div>
              <h2 style={{ fontSize:16, fontWeight:700, color:'#09090B', margin:0 }}>Novo agendamento</h2>
              <p style={{ fontSize:12, color:'#71717A', margin:'2px 0 0' }}>
                {dateStr ? new Date(dateStr+'T00:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'}) : 'Preencha os dados do atendimento'}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ width:28, height:28, border:'none', background:'#F4F4F5', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <i className="ti ti-x" style={{ fontSize:13, color:'#71717A' }} />
          </button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'20px 28px', display:'flex', flexDirection:'column', gap:20 }}>

          {/* ── Paciente ── */}
          <div style={{ background:'#F9F9F9', borderRadius:12, border:'1px solid #E4E4E7', padding:'16px 18px' }}>
            <div style={secHdr}>Paciente</div>
            {savedMsg && (
              <div style={{ marginBottom:12, padding:'8px 12px', background:'#DCFCE7', borderRadius:8, border:'1px solid #BBF7D0', display:'flex', alignItems:'center', gap:8 }}>
                <i className="ti ti-circle-check" style={{ fontSize:14, color:'#16A34A', flexShrink:0 }} />
                <span style={{ fontSize:12, color:'#15803D', fontWeight:500 }}>{savedMsg}</span>
              </div>
            )}
            {selPat ? (
              <div style={{ padding:'10px 12px', background:'#FFFFFF', borderRadius:8, border:'1px solid #BBF7D0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:34, height:34, borderRadius:'50%', background:'#DCFCE7', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:'#16A34A' }}>
                      {selPat.name.split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:'#09090B' }}>{selPat.name}</div>
                    <div style={{ fontSize:11, color:'#71717A' }}>{selPat.phone}{selPat.cpf?` · CPF ${selPat.cpf}`:''}{selPat.email?` · ${selPat.email}`:''}</div>
                  </div>
                </div>
                <button onClick={()=>{ setSelPat(null); setSavedMsg(''); setSearchQ(''); }}
                  style={{ fontSize:11, color:'#71717A', background:'none', border:'1px solid #E4E4E7', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontFamily:'inherit' }}>
                  Trocar
                </button>
              </div>
            ) : (
              <>
                <div style={{ display:'flex', background:'#ECECEC', borderRadius:8, padding:2, marginBottom:14, gap:1, width:'fit-content' }}>
                  {(['existing','new'] as const).map(m => {
                    const act = mode === m;
                    return (
                      <button key={m} onClick={()=>{ setMode(m); setNpErr(''); setDupWarn(null); }}
                        style={{ height:28, padding:'0 16px', borderRadius:6, border:'none', fontSize:12, fontWeight:act?600:400, color:act?'#09090B':'#71717A', background:act?'#FFFFFF':'transparent', cursor:'pointer', fontFamily:'inherit', boxShadow:act?'0 1px 3px rgba(0,0,0,.1)':'none', whiteSpace:'nowrap' }}>
                        {m==='existing' ? 'Paciente existente' : 'Novo paciente'}
                      </button>
                    );
                  })}
                </div>
                {mode === 'existing' && (
                  <div>
                    <div style={{ position:'relative' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, background:'#FFFFFF', border:'1px solid #E4E4E7', borderRadius:8, padding:'0 12px', height:36 }}>
                        <i className="ti ti-search" style={{ fontSize:14, color:'#A1A1AA', flexShrink:0 }} />
                        <input value={searchQ} onChange={e=>setSearchQ(e.target.value)}
                          onFocus={()=>{ if (searchRes.length > 0) setShowDrop(true); }}
                          placeholder="Buscar por nome, CPF ou telefone..."
                          style={{ border:'none', background:'transparent', fontSize:13, outline:'none', width:'100%', color:'#09090B', fontFamily:'inherit' }} />
                        {searching && <i className="ti ti-loader-2" style={{ fontSize:13, color:'#A1A1AA', flexShrink:0, animation:'spin 1s linear infinite' }} />}
                      </div>
                      {showDrop && searchQ.length >= 2 && (
                        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'#FFFFFF', border:'1px solid #E4E4E7', borderRadius:8, boxShadow:'0 8px 24px rgba(0,0,0,.08)', zIndex:200, maxHeight:220, overflowY:'auto' }}>
                          {searchRes.length === 0 && !searching ? (
                            <div style={{ padding:'12px 14px' }}>
                              <div style={{ fontSize:13, color:'#71717A', marginBottom:8 }}>Nenhum paciente encontrado.</div>
                              <button onClick={()=>{ setMode('new'); setShowDrop(false); }}
                                style={{ fontSize:12, color:'#000000', fontWeight:600, background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', padding:0, display:'flex', alignItems:'center', gap:4 }}>
                                <i className="ti ti-plus" style={{ fontSize:12 }} /> Cadastrar novo paciente
                              </button>
                            </div>
                          ) : searchRes.map((p:any) => (
                            <div key={p.id} onClick={()=>selectPatient(p)}
                              onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='#F4F4F5'}
                              onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}
                              style={{ padding:'9px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid #F4F4F5' }}>
                              <div style={{ width:30, height:30, borderRadius:'50%', background:'#F4F4F5', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                                <span style={{ fontSize:10, fontWeight:700, color:'#71717A' }}>
                                  {p.name.split(' ').filter(Boolean).slice(0,2).map((w:string)=>w[0]).join('').toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <div style={{ fontSize:13, fontWeight:500, color:'#09090B' }}>{p.name}</div>
                                <div style={{ fontSize:11, color:'#71717A' }}>{p.phone||'Sem telefone'}{p.cpf?` · CPF ${p.cpf}`:''}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontSize:12, color:'#A1A1AA' }}>ou</span>
                      <button onClick={()=>setMode('new')}
                        style={{ fontSize:12, color:'#000000', fontWeight:600, background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', padding:0, display:'flex', alignItems:'center', gap:4 }}>
                        <i className="ti ti-plus" style={{ fontSize:12 }} /> Cadastrar novo paciente
                      </button>
                    </div>
                  </div>
                )}
                {mode === 'new' && (
                  <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                    {dupWarn && (
                      <div style={{ padding:'10px 12px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8 }}>
                        <div style={{ fontSize:12, color:'#A16207', fontWeight:500, marginBottom:8 }}>
                          <i className="ti ti-alert-triangle" style={{ fontSize:12, marginRight:5 }} />
                          Já existe um paciente com {dupWarn.field==='cpf'?'este CPF':'este telefone'}: <strong>{dupWarn.patient.name}</strong>
                        </div>
                        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                          <button onClick={()=>{ selectPatient(dupWarn.patient); setDupWarn(null); }}
                            style={{ fontSize:11, fontWeight:600, color:'#FFFFFF', background:'#000000', border:'none', borderRadius:6, padding:'4px 12px', cursor:'pointer', fontFamily:'inherit' }}>
                            Usar paciente existente
                          </button>
                          <button onClick={()=>setDupWarn(null)}
                            style={{ fontSize:11, color:'#71717A', background:'none', border:'1px solid #D4D4D8', borderRadius:6, padding:'4px 12px', cursor:'pointer', fontFamily:'inherit' }}>
                            Continuar assim mesmo
                          </button>
                        </div>
                      </div>
                    )}
                    <div><label style={lbl}>Nome completo *</label>
                      <input value={npName} onChange={e=>setNpName(e.target.value)} placeholder="Nome completo do paciente" style={inp} />
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                      <div><label style={lbl}>WhatsApp / Telefone *</label>
                        <input value={npPhone} onChange={e=>setNpPhone(maskPhone(e.target.value))}
                          onBlur={()=>checkDuplicate('phone', npPhone.replace(/\D/g,''))}
                          placeholder="(00) 00000-0000" style={inp} />
                      </div>
                      <div><label style={lbl}>CPF</label>
                        <input value={npCpf} onChange={e=>setNpCpf(maskCpf(e.target.value))}
                          onBlur={()=>checkDuplicate('cpf', npCpf.replace(/\D/g,''))}
                          placeholder="000.000.000-00" style={inp} />
                      </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                      <div><label style={lbl}>Data de nascimento</label>
                        <input value={npBirth} onChange={e=>setNpBirth(maskBirthDate(e.target.value))} placeholder="DD/MM/AAAA" style={inp} />
                      </div>
                      <div><label style={lbl}>E-mail</label>
                        <input value={npEmail} onChange={e=>setNpEmail(e.target.value)} placeholder="email@exemplo.com" type="email" style={inp} />
                      </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                      <div><label style={lbl}>Origem</label>
                        <select value={npSource} onChange={e=>setNpSource(e.target.value)} style={inp}>
                          {['Agenda','Indicação','Instagram','Google','Facebook','Outro'].map(s=><option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div><label style={lbl}>Observações</label>
                        <input value={npNotes} onChange={e=>setNpNotes(e.target.value)} placeholder="Opcional" style={inp} />
                      </div>
                    </div>
                    {npErr && <p style={{ fontSize:12, color:'#DC2626', margin:0 }}>{npErr}</p>}
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <button onClick={saveNewPatient} disabled={savingPat}
                        style={{ height:34, padding:'0 16px', border:'none', borderRadius:8, fontSize:13, fontWeight:600, color:'#FFFFFF', background:'#000000', cursor:savingPat?'wait':'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:6, opacity:savingPat?0.7:1 }}>
                        {savingPat ? <><i className="ti ti-loader-2" style={{ fontSize:13, animation:'spin 1s linear infinite' }} /> Salvando...</> : <><i className="ti ti-check" style={{ fontSize:13 }} /> Salvar paciente</>}
                      </button>
                      <button onClick={()=>{ setMode('existing'); setNpErr(''); setDupWarn(null); }}
                        style={{ fontSize:12, color:'#71717A', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit' }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Agendamento ── */}
          <div>
            <div style={secHdr}>Agendamento</div>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

              {/* Tipo de atendimento — full width, destaque */}
              <div>
                <label style={lbl}>Tipo de atendimento</label>
                {activePlans.length === 0 ? (
                  <div style={{ padding:'10px 12px', background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:8, fontSize:12, color:'#C2410C' }}>
                    <i className="ti ti-alert-triangle" style={{ fontSize:12, marginRight:6 }} />
                    Nenhum tipo configurado.{' '}
                    <a href="/settings" style={{ color:'#C2410C', fontWeight:600 }}>Configurar em Configurações &gt; Procedimentos</a>
                  </div>
                ) : (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {activePlans.map((p: any) => {
                      const sel = planId === p.id;
                      const color = p.color || '#2563EB';
                      return (
                        <button key={p.id} onClick={()=>{ setPlanId(p.id); setEndTimeManual(false); }}
                          style={{ height:32, padding:'0 12px', borderRadius:99, border:`1.5px solid ${sel ? color : '#E4E4E7'}`, background: sel ? color+'18' : '#FFFFFF', fontSize:12, fontWeight: sel ? 600 : 400, color: sel ? color : '#71717A', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:5 }}>
                          {sel && <i className="ti ti-check" style={{ fontSize:11 }} />}
                          {p.name}
                          {p.defaultDurationMinutes
                            ? <span style={{ fontSize:10, opacity:0.7, marginLeft:2 }}>·{p.defaultDurationMinutes}min</span>
                            : null}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={lbl}>Profissional</label>
                  <select value={profId} onChange={e=>setProfId(e.target.value)} style={inp}>
                    <option value="">— Sem profissional —</option>
                    {modalProfs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Sala</label>
                  {activeRooms.length > 0 ? (
                    <select value={room} onChange={e=>setRoom(e.target.value)} style={inp}>
                      <option value="">— Sem sala —</option>
                      {activeRooms.map(r=><option key={r.id} value={r.name}>{r.name}</option>)}
                    </select>
                  ) : (
                    <input value={room} onChange={e=>setRoom(e.target.value)}
                      placeholder="Nome da sala (opcional)"
                      style={inp} />
                  )}
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
                <div>
                  <label style={lbl}>Data</label>
                  <input type="date" value={dateStr} onChange={e=>setDateStr(e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Hora início</label>
                  <input type="time" value={startTime}
                    onChange={e=>{ setStartTime(e.target.value); setEndTimeManual(false); }}
                    style={inp} />
                </div>
                <div>
                  <label style={{ ...lbl, display:'flex', alignItems:'center', gap:4 }}>
                    Hora fim
                    {!endTimeManual && selPlan && (
                      <span style={{ fontSize:10, color:'#16A34A', fontWeight:600 }}>
                        · {selPlan.defaultDurationMinutes ?? 0}min auto
                      </span>
                    )}
                  </label>
                  <input type="time" value={endTime}
                    onChange={e=>{ setEndTime(e.target.value); setEndTimeManual(true); }}
                    style={inp} />
                </div>
              </div>

              <div>
                <label style={lbl}>Status</label>
                <select value={status} onChange={e=>setStatus(e.target.value)} style={inp}>
                  {Object.entries(STATUSES).filter(([k])=>!['bloqueado','finalizado','atendimento'].includes(k)).map(([k,v])=>
                    <option key={k} value={k}>{v.label}</option>
                  )}
                </select>
              </div>

              <div>
                <label style={lbl}>Observações</label>
                <textarea value={apptNotes} onChange={e=>setApptNotes(e.target.value)} rows={2} placeholder="Observações opcionais..."
                  style={{ ...inp, height:'auto', padding:'8px 10px', resize:'vertical' }} />
              </div>
            </div>
          </div>

          {/* ── Reserva financeira ── */}
          <div>
            <button onClick={() => setReservaOpen(o => !o)}
              style={{ width:'100%', height:38, padding:'0 14px', border:`1px solid ${reservaOpen ? '#000000' : '#E4E4E7'}`, borderRadius:8, fontSize:13, fontWeight:500, color: reservaOpen ? '#09090B' : '#71717A', background: reservaOpen ? '#FAFAFA' : '#FFFFFF', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:6 }}>
              <i className={`ti ${reservaOpen ? 'ti-chevron-down' : 'ti-chevron-right'}`} style={{ fontSize:12 }} />
              <i className="ti ti-coin" style={{ fontSize:13, color: reservaOpen ? '#16A34A' : '#A1A1AA' }} />
              Lançar reserva financeira
              <span style={{ marginLeft:'auto', fontSize:11, color:'#A1A1AA' }}>opcional</span>
            </button>

            {reservaOpen && (
              <div style={{ marginTop:8, padding:'16px 18px', background:'#F9F9F9', borderRadius:10, border:'1px solid #E4E4E7', display:'flex', flexDirection:'column', gap:12 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em' }}>Dados da reserva</div>

                <div>
                  <label style={lbl}>Procedimento / Plano</label>
                  <select value={resPlanId} onChange={e => {
                    setResPlanId(e.target.value);
                    const p = activeProcPlans.find((x: any) => x.id === e.target.value);
                    if (p?.price) setResTotalAmount(String(p.price));
                  }} style={inp}>
                    <option value="">— Selecionar procedimento —</option>
                    {activeProcPlans.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name}{p.price ? ` — R$ ${Number(p.price).toFixed(2)}` : ''}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div>
                    <label style={lbl}>Valor total (R$) *</label>
                    <input value={resTotalAmount} onChange={e=>setResTotalAmount(e.target.value)}
                      placeholder="0,00" style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Entrada / reserva (R$)</label>
                    <input value={resReservaAmount} onChange={e=>setResReservaAmount(e.target.value)}
                      placeholder="0,00" style={inp} />
                  </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div>
                    <label style={lbl}>Forma de pagamento</label>
                    <select value={resPayMethodId} onChange={e=>setResPayMethodId(e.target.value)} style={inp}>
                      <option value="">— Selecionar —</option>
                      {((payMethodsForRes as any[]) || []).filter((m: any) => m.active !== false).map((m: any) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Data do pagamento</label>
                    <input type="date" value={resPayDate} onChange={e=>setResPayDate(e.target.value)} style={inp} />
                  </div>
                </div>

                <div>
                  <label style={lbl}>Observações da reserva</label>
                  <input value={resNotes} onChange={e=>setResNotes(e.target.value)}
                    placeholder="Opcional" style={inp} />
                </div>

                {resReservaAmount && resTotalAmount && Number(resReservaAmount.replace(',','.')) < Number(resTotalAmount.replace(',','.')) && (
                  <div style={{ padding:'8px 10px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:7, fontSize:12, color:'#A16207', display:'flex', alignItems:'center', gap:6 }}>
                    <i className="ti ti-info-circle" style={{ fontSize:12, flexShrink:0 }} />
                    Saldo de R$ {(Number(resTotalAmount.replace(',','.'))-Number(resReservaAmount.replace(',','.'))).toFixed(2)} ficará como conta a receber.
                  </div>
                )}
              </div>
            )}
          </div>

          {err && (
            <div style={{ padding:'10px 12px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, display:'flex', alignItems:'center', gap:8 }}>
              <i className="ti ti-alert-circle" style={{ fontSize:14, color:'#DC2626', flexShrink:0 }} />
              <span style={{ fontSize:12, color:'#DC2626' }}>{err}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ flexShrink:0, padding:'14px 28px', borderTop:'1px solid #E4E4E7', display:'flex', gap:10, background:'#FAFAFA' }}>
          <button onClick={onClose} style={{ flex:1, height:40, border:'1px solid #E4E4E7', borderRadius:8, fontSize:13, fontWeight:500, color:'#71717A', background:'#FFFFFF', cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
          <button onClick={saveAppt} disabled={saving || !selPat}
            style={{ flex:2, height:40, border:'none', borderRadius:8, fontSize:13, fontWeight:600, color:'#FFFFFF', background:(selPat && !saving)?'#000000':'#A1A1AA', cursor:(selPat && !saving)?'pointer':'not-allowed', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
            {saving
              ? <><i className="ti ti-loader-2" style={{ fontSize:14, animation:'spin 1s linear infinite' }} /> Salvando...</>
              : <><i className="ti ti-calendar-plus" style={{ fontSize:14 }} /> Salvar agendamento</>}
          </button>
        </div>
      </div>
    </Portal>
  );
}

function BloquearHorarioModal({ onClose, defaultDate, todayStart, onSave, profs }: {
  onClose:()=>void; defaultDate:Date; todayStart:Date; onSave:(a:Appt)=>void; profs:Prof[];
}) {
  const [profId, setProfId]       = useState(() => profs[0]?.id || '');
  const [dateStr, setDateStr]     = useState(() => {
    const d = defaultDate;
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime]     = useState('09:00');
  const [reason, setReason]       = useState('');
  const [err, setErr]             = useState('');

  const inp: React.CSSProperties = { width:'100%', height:36, padding:'0 10px', border:'1px solid #E4E4E7', borderRadius:8, fontSize:13, color:'#09090B', background:'#FFFFFF', boxSizing:'border-box', fontFamily:'inherit', outline:'none' };
  const lbl: React.CSSProperties = { fontSize:12, fontWeight:500, color:'#71717A', display:'block', marginBottom:4 };

  function save() {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    if (sh*60+sm >= eh*60+em) { setErr('Hora início deve ser antes da hora fim.'); return; }
    const sel = new Date(dateStr+'T00:00:00');
    const diff = Math.round((sel.getTime()-todayStart.getTime())/(86400000));
    onSave({ id:`blk_${Date.now()}`, profId, patient:'Bloqueado', type:reason.trim()||'Horário bloqueado', status:'bloqueado', sh, sm, eh, em, room:'', phone:'', email:'', notes:'', dateOffset:diff });
    onClose();
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <h2 style={{ fontSize:17, fontWeight:700, color:'#09090B', margin:0 }}>Bloquear horário</h2>
        <button onClick={onClose} style={{ width:28, height:28, border:'none', background:'#F4F4F5', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <i className="ti ti-x" style={{ fontSize:13, color:'#71717A' }} />
        </button>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <div><label style={lbl}>Profissional</label>
          <select value={profId} onChange={e=>setProfId(e.target.value)} style={inp}>
            {profs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div><label style={lbl}>Data</label><input type="date" value={dateStr} onChange={e=>setDateStr(e.target.value)} style={inp} /></div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div><label style={lbl}>Hora início</label><input type="time" value={startTime} onChange={e=>setStartTime(e.target.value)} style={inp} /></div>
          <div><label style={lbl}>Hora fim</label><input type="time" value={endTime} onChange={e=>setEndTime(e.target.value)} style={inp} /></div>
        </div>
        <div><label style={lbl}>Motivo (opcional)</label><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ex: Reunião, Feriado..." style={inp} /></div>
        {err && <p style={{ fontSize:12, color:'#DC2626', margin:0 }}>{err}</p>}
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:4 }}>
          <button onClick={onClose} style={{ height:36, padding:'0 16px', border:'1px solid #E4E4E7', borderRadius:8, fontSize:13, fontWeight:500, color:'#71717A', background:'#FFFFFF', cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
          <button onClick={save}    style={{ height:36, padding:'0 16px', border:'none', borderRadius:8, fontSize:13, fontWeight:600, color:'#FFFFFF', background:'#000000', cursor:'pointer', fontFamily:'inherit' }}>Bloquear</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

const VIEW_LABELS: Record<string, string> = { day: 'Dia', week: 'Semana', month: 'Mês', list: 'Lista' };

// ─── ActionBtn ────────────────────────────────────────────────────────────────
function ActionBtn({ icon, label, color, bg, onClick, active }: {
  icon: string; label: string; color: string; bg: string;
  onClick: () => void; active?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={onClick}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{ width: 40, height: 40, borderRadius: 10, border: `1.5px solid ${active ? color + '50' : '#E4E4E7'}`, background: active ? bg : '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.12s, border-color 0.12s', fontFamily: 'inherit' }}>
        <i className={`ti ${icon}`} style={{ fontSize: 17, color }} />
      </button>
      {hov && (
        <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)', background: '#18181B', color: '#FFFFFF', fontSize: 11, fontWeight: 500, padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 200 }}>
          {label}
          <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', borderTop: '4px solid #18181B', borderLeft: '4px solid transparent', borderRight: '4px solid transparent' }} />
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export function AgendaPage() {
  const navigate     = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient  = useQueryClient();

  const todayStart = useRef((() => {
    const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  })()).current;

  const [view, setView]               = useState<'day'|'week'|'month'|'list'>('day');
  const [groupBy, setGroupBy]         = useState<'professional'|'room'>('professional');
  const [selectedId, setSelectedId]   = useState<string|null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(todayStart);
  const [calYear, setCalYear]         = useState(todayStart.getFullYear());
  const [calMonth, setCalMonth]       = useState(todayStart.getMonth());
  const [blockedSlots, setBlockedSlots] = useState<Appt[]>(loadBlocked);
  const [ctxMenu, setCtxMenu]         = useState<{ x:number; y:number; apptId:string|null; slotTime?:string; slotProfId?:string; slotDate?:Date }|null>(null);
  const [ctxStatusOpen, setCtxStatusOpen] = useState(false);
  const [profChecked, setProfChecked] = useState<Set<string>>(new Set());
  const [roomFilter, setRoomFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter]   = useState('');
  const [showNovoModal, setShowNovoModal]           = useState(false);
  const [novoModalInitial, setNovoModalInitial]     = useState<NovoApptInitial | undefined>(undefined);
  const [showBloquearModal, setShowBloquearModal]   = useState(false);
  const [showLegend, setShowLegend]                 = useState(false);
  const [showViewDropdown, setShowViewDropdown]     = useState(false);
  const [showFiltersDropdown, setShowFiltersDropdown] = useState(false);
  const gridRef        = useRef<HTMLDivElement>(null);
  const legendBtnRef   = useRef<HTMLButtonElement>(null);
  const viewBtnRef     = useRef<HTMLButtonElement>(null);
  const filtersBtnRef  = useRef<HTMLButtonElement>(null);

  // ── Fetch professionals ───────────────────────────────────────────────────
  const { data: profsData } = useQuery({
    queryKey: ['agenda-professionals'],
    queryFn:  agendaApi.professionals,
    staleTime: 60_000,
  });

  // ── Fetch appointment types for toolbar filter ────────────────────────────
  const { data: plansData } = useQuery({
    queryKey: ['appointment-types'],
    queryFn:  () => appointmentTypesApi.list(),
    staleTime: 5 * 60_000,
  });

  const PROF_COLORS = ['#7C3AED','#16A34A','#2563EB','#EC4899','#D97706','#DC2626'];
  const PROF_BGS    = ['#F3E8FF','#DCFCE7','#EFF6FF','#FCE7F3','#FFFBEB','#FEF2F2'];

  const profs: Prof[] = useMemo(() => {
    if (!profsData) return [];
    return (profsData as any[]).map((p, i) => ({
      id:    p.id,
      name:  p.user?.name  || 'Profissional',
      short: (p.user?.name || 'Prof.').split(' ').slice(0, 2).join(' '),
      color: p.color || PROF_COLORS[i % PROF_COLORS.length],
      bg:    PROF_BGS[i % PROF_BGS.length],
    }));
  }, [profsData]);

  // Sync profChecked when real professionals load
  const profsLoadedRef = useRef(false);
  useEffect(() => {
    if (profs.length > 0 && !profsLoadedRef.current) {
      setProfChecked(new Set(profs.map(p => p.id)));
      profsLoadedRef.current = true;
    }
  }, [profs]);

  // Open new appointment modal from URL params (?newAppointment=true&patientId=...)
  const newApptParamFired = useRef(false);
  useEffect(() => {
    if (newApptParamFired.current) return;
    if (searchParams.get('newAppointment') === 'true') {
      newApptParamFired.current = true;
      const patientId   = searchParams.get('patientId')   || undefined;
      const patientName = searchParams.get('patientName') || undefined;
      const patientPhone = searchParams.get('patientPhone') || undefined;
      setNovoModalInitial({ patientId, patientName, patientPhone });
      setShowNovoModal(true);
    }
  }, [searchParams]);

  // ── Fetch appointments ────────────────────────────────────────────────────
  const fetchStart = new Date(calYear, calMonth, 1).toISOString();
  const fetchEnd   = new Date(calYear, calMonth + 1, 0, 23, 59, 59).toISOString();

  const { data: apptData } = useQuery({
    queryKey: ['appointments', calYear, calMonth],
    queryFn:  () => agendaApi.list({ start: fetchStart, end: fetchEnd }),
    staleTime: 30_000,
  });

  const appointments: Appt[] = useMemo(() => {
    const api = ((apptData as any[]) || []).map(a => mapApiAppt(a, todayStart));
    return [...api, ...blockedSlots];
  }, [apptData, blockedSlots, todayStart]);

  // ── Create appointment mutation ───────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (payload: any) => agendaApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments', calYear, calMonth] });
    },
  });

  const selectedAppt = appointments.find(a=>a.id===selectedId) || null;
  const visibleProfs = profs.filter(p=>profChecked.has(p.id));
  const filterCount  = [statusFilter, typeFilter, roomFilter].filter(Boolean).length;

  function apptMatchesDate(a:Appt, d:Date):boolean {
    return sameDay(addDays(todayStart, a.dateOffset ?? 0), d);
  }

  const filteredData = useMemo(() => appointments.filter(a => {
    if (!apptMatchesDate(a, selectedDate)) return false;
    if (!profChecked.has(a.profId)) return false;
    if (roomFilter && a.room !== roomFilter) return false;
    if (statusFilter && a.status !== statusFilter) return false;
    if (typeFilter && !a.type.toLowerCase().includes(typeFilter.toLowerCase())) return false;
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [appointments, selectedDate, profChecked, roomFilter, statusFilter, typeFilter]);

  const now = new Date();
  const nowMin = now.getHours()*60 + now.getMinutes();
  const showNowLine = nowMin >= HOUR_START*60 && nowMin <= HOUR_END*60;
  const nowTop = ((nowMin - HOUR_START*60)/60)*HOUR_HEIGHT;

  const calCells = useMemo(()=>miniCalCells(calYear, calMonth), [calYear, calMonth]);

  const changeStatus = useCallback(async (apptId: string, status: string) => {
    // blocked slots only update locally
    const isBlocked = blockedSlots.some(b => b.id === apptId);
    if (isBlocked) {
      setBlockedSlots(prev => { const n = prev.map(a => a.id===apptId ? {...a,status} : a); saveBlocked(n); return n; });
    } else {
      const backendStatus = STATUS_TO_BACKEND[status] || 'AGUARDANDO';
      try {
        await agendaApi.update(apptId, { status: backendStatus });
        queryClient.invalidateQueries({ queryKey: ['appointments', calYear, calMonth] });
      } catch (e) { console.error('Erro ao atualizar status', e); }
    }
    setCtxMenu(null); setCtxStatusOpen(false);
  }, [blockedSlots, calYear, calMonth, queryClient]);

  const addBlocked = useCallback((a: Appt) => {
    setBlockedSlots(prev => { const n = [...prev, a]; saveBlocked(n); return n; });
  }, []);

  const handleCreateAppt = useCallback(async (payload: any) => {
    await createMut.mutateAsync(payload);
  }, [createMut]);

  function navigate_date(dir:1|-1) {
    if (view==='month') {
      const nm = calMonth+dir;
      if (nm<0) { setCalMonth(11); setCalYear(y=>y-1); }
      else if (nm>11) { setCalMonth(0); setCalYear(y=>y+1); }
      else setCalMonth(nm);
    } else if (view==='week') {
      setSelectedDate(prev => {
        const next = addDays(prev, dir * 7);
        setCalYear(next.getFullYear()); setCalMonth(next.getMonth());
        return next;
      });
    } else {
      setSelectedDate(prev => {
        const next = addDays(prev, dir);
        setCalYear(next.getFullYear()); setCalMonth(next.getMonth());
        return next;
      });
    }
  }

  function goToday() {
    setSelectedDate(todayStart);
    setCalYear(todayStart.getFullYear());
    setCalMonth(todayStart.getMonth());
  }

  useEffect(()=>{
    const h = () => { setCtxMenu(null); setCtxStatusOpen(false); setShowViewDropdown(false); setShowFiltersDropdown(false); };
    window.addEventListener('click', h);
    return ()=>window.removeEventListener('click', h);
  }, []);

  const toggleProf = (id:string) =>
    setProfChecked(prev=>{ const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });

  const handleCtxMenu = (e:React.MouseEvent, apptId:string|null) => {
    e.preventDefault(); e.stopPropagation();
    setCtxMenu({ x:e.clientX, y:e.clientY, apptId });
    setCtxStatusOpen(false);
  };

  // Context menu on empty grid slot — captures time from Y position and profId from column
  const handleSlotCtxMenu = useCallback((e:React.MouseEvent, profId:string|null, date:Date) => {
    e.preventDefault(); e.stopPropagation();
    const rawMinutes = (e.nativeEvent.offsetY / HOUR_HEIGHT) * 60 + HOUR_START * 60;
    const snapped = Math.floor(rawMinutes / 30) * 30;
    const clamped = Math.max(HOUR_START * 60, Math.min(HOUR_END * 60, snapped));
    const h = Math.floor(clamped / 60), m = clamped % 60;
    const slotTime = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    setCtxMenu({ x:e.clientX, y:e.clientY, apptId:null, slotTime, slotProfId: profId||undefined, slotDate: date });
    setCtxStatusOpen(false);
  }, []);

  const getProf = (id:string) => profs.find(p=>p.id===id) || profs[0] || DEFAULT_PROF;

  // ── ApptCard ─────────────────────────────────────────────────────────────────
  const ApptCard = ({ a }:{ a:Appt }) => {
    const st = STATUSES[a.status] || STATUSES.agendado;
    const pr = getProf(a.profId);
    // Use appointment type color for left border accent; fall back to professional color
    const accentColor = a.typeColor || pr.color;
    const top = apptTop(a.sh, a.sm);
    const h = Math.max(apptHeight(a.sh, a.sm, a.eh, a.em), 24);
    const sel = a.id===selectedId;
    const tall = h>=48;
    return (
      <div onClick={e=>{e.stopPropagation();setSelectedId(a.id);}} onContextMenu={e=>handleCtxMenu(e,a.id)}
        style={{ position:'absolute', top, left:3, right:3, height:h, background:st.bg,
          border:`1px solid ${sel?accentColor:st.border}`, borderLeft:`3px solid ${accentColor}`,
          borderRadius:6, padding:tall?'4px 7px':'2px 6px', cursor:'pointer',
          boxShadow:sel?`0 0 0 2px ${accentColor}33,0 2px 8px rgba(0,0,0,.08)`:'0 1px 2px rgba(0,0,0,.05)',
          overflow:'hidden', zIndex:sel?2:1, transition:'box-shadow 0.12s', userSelect:'none' }}>
        <div style={{ fontSize:10, fontWeight:600, color:accentColor, lineHeight:1.3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {fmtTime(a.sh,a.sm)}{tall?` — ${fmtTime(a.eh,a.em)}`:''}
        </div>
        {tall && <div style={{ fontSize:11, fontWeight:600, color:'#191C1D', lineHeight:1.3, marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.status==='bloqueado'?a.type:a.patient}</div>}
        {tall && h>=64 && <div style={{ fontSize:10, color:'#71717A', marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.type}</div>}
        {tall && h>=80 && <span style={{ display:'inline-block', marginTop:3, fontSize:9, fontWeight:600, padding:'1px 6px', borderRadius:99, background:st.border, color:st.text }}>{st.label}</span>}
        {!tall && <div style={{ fontSize:10, color:'#374151', lineHeight:1.2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.status==='bloqueado'?a.type:a.patient}</div>}
        {a.isFromPackage && tall && h >= 48 && (
          <div style={{ position:'absolute', bottom:3, right:5, fontSize:8, fontWeight:700, padding:'1px 4px', borderRadius:3, background:'#7C3AED', color:'#FFF', lineHeight:1.4, letterSpacing:'.04em' }}>PKG</div>
        )}
        {!a.isFromPackage && a.saleId && tall && h >= 48 && (
          <div style={{ position:'absolute', bottom:3, right:5, width:7, height:7, borderRadius:'50%', background: a.saleStatus==='PAID'?'#16A34A':a.saleStatus==='PARTIAL'?'#D97706':'#A1A1AA', border:'1px solid rgba(255,255,255,0.8)' }} />
        )}
      </div>
    );
  };

  const TimeGridBg = () => (
    <>
      {TIME_SLOTS.map(({h,m},i)=>(
        <div key={i} style={{ position:'absolute', left:0, right:0, top:(h-HOUR_START+m/60)*HOUR_HEIGHT, borderTop:m===0?'1px solid #E5E7EB':'1px dashed #F3F4F6', pointerEvents:'none' }} />
      ))}
      {showNowLine && (
        <div style={{ position:'absolute', left:0, right:0, top:nowTop, zIndex:3, pointerEvents:'none', display:'flex', alignItems:'center' }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:'#EF4444', flexShrink:0, marginLeft:-4 }} />
          <div style={{ flex:1, height:1.5, background:'#EF4444' }} />
        </div>
      )}
    </>
  );

  const TimeLabels = () => (
    <div style={{ width:52, flexShrink:0, borderRight:'1px solid #E5E7EB', position:'relative', minHeight:TOTAL_H }}>
      {TIME_SLOTS.filter(s=>s.m===0).map(({h},i)=>(
        <div key={i} style={{ position:'absolute', top:(h-HOUR_START)*HOUR_HEIGHT-7, right:8, left:0, textAlign:'right' }}>
          <span style={{ fontSize:10, fontWeight:500, color:'#9CA3AF' }}>{fmtTime(h,0)}</span>
        </div>
      ))}
    </div>
  );

  // ── Day View ──────────────────────────────────────────────────────────────────
  const DayView = () => (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ flexShrink:0, display:'flex', background:'#FFFFFF', borderBottom:'1px solid #E5E7EB', position:'sticky', top:0, zIndex:10 }}>
        <div style={{ width:52, flexShrink:0, borderRight:'1px solid #E5E7EB' }} />
        {visibleProfs.map(p=>(
          <div key={p.id} style={{ flex:1, minWidth:0, padding:'10px 12px', borderRight:'1px solid #E5E7EB', display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:30, height:30, borderRadius:'50%', background:p.bg, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <span style={{ fontSize:10, fontWeight:700, color:p.color }}>
                {p.name.split(' ').filter(w=>/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/u.test(w)).slice(0,2).map(w=>w[0]).join('')}
              </span>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#191C1D', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.short}</div>
              <div style={{ fontSize:10, color:'#71717A' }}>{filteredData.filter(a=>a.profId===p.id).length} atend.</div>
            </div>
            <div style={{ width:8, height:8, borderRadius:'50%', background:p.color, flexShrink:0 }} />
          </div>
        ))}
      </div>
      <div ref={gridRef} style={{ flex:1, overflowY:'auto' }}>
        <div style={{ display:'flex', minHeight:TOTAL_H }}>
          <TimeLabels />
          {visibleProfs.map(p=>(
            <div key={p.id} onContextMenu={e=>handleSlotCtxMenu(e, p.id, selectedDate)}
              style={{ flex:1, minWidth:0, borderRight:'1px solid #E5E7EB', position:'relative', minHeight:TOTAL_H }}>
              <TimeGridBg />
              {filteredData.filter(a=>a.profId===p.id).map(a=><ApptCard key={a.id} a={a} />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Week View ─────────────────────────────────────────────────────────────────
  const WeekView = () => {
    const wdays = getWeekDays(selectedDate);
    return (
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ flexShrink:0, display:'flex', background:'#FFFFFF', borderBottom:'1px solid #E5E7EB', position:'sticky', top:0, zIndex:10 }}>
          <div style={{ width:52, flexShrink:0, borderRight:'1px solid #E5E7EB' }} />
          {wdays.map((d,i)=>{
            const isT = sameDay(d,todayStart), isSel = sameDay(d,selectedDate);
            return (
              <div key={i} style={{ flex:1, padding:'10px 8px', borderRight:'1px solid #E5E7EB', textAlign:'center', cursor:'pointer' }}
                onClick={()=>{ setSelectedDate(d); setView('day'); setSelectedId(null); }}>
                <div style={{ fontSize:11, color:'#71717A', fontWeight:500, textTransform:'uppercase', letterSpacing:'.04em' }}>{DAYS_SHORT_PT[d.getDay()]}</div>
                <div style={{ width:32, height:32, borderRadius:'50%', margin:'4px auto 0', background:isSel?'#000000':isT?'#F4F4F5':'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <span style={{ fontSize:15, fontWeight:isSel||isT?700:400, color:isSel?'#FFFFFF':'#191C1D' }}>{d.getDate()}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>
          <div style={{ display:'flex', minHeight:TOTAL_H }}>
            <TimeLabels />
            {wdays.map((d,i)=>{
              const dayAppts = appointments.filter(a=>apptMatchesDate(a,d) && profChecked.has(a.profId));
              return (
                <div key={i} onContextMenu={e=>handleSlotCtxMenu(e, null, d)}
                  style={{ flex:1, minWidth:0, borderRight:'1px solid #E5E7EB', position:'relative', minHeight:TOTAL_H }}>
                  <TimeGridBg />
                  {dayAppts.map(a=>{
                    const st=STATUSES[a.status]||STATUSES.agendado, pr=getProf(a.profId);
                    const h=Math.max(apptHeight(a.sh,a.sm,a.eh,a.em),22);
                    return (
                      <div key={a.id} onClick={()=>{setSelectedDate(d);setSelectedId(a.id);}}
                        style={{ position:'absolute', top:apptTop(a.sh,a.sm), left:2, right:2, height:h, background:st.bg, borderLeft:`3px solid ${pr.color}`, borderRadius:5, padding:'2px 6px', cursor:'pointer', overflow:'hidden', zIndex:1 }}>
                        <div style={{ fontSize:9, fontWeight:600, color:pr.color }}>{fmtTime(a.sh,a.sm)}</div>
                        <div style={{ fontSize:10, color:'#191C1D', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.patient}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ── Month View ────────────────────────────────────────────────────────────────
  const MonthView = () => {
    const weeks:(number|null)[][] = [];
    for (let i=0; i<calCells.length; i+=7) weeks.push(calCells.slice(i,i+7));
    return (
      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
        <div style={{ background:'#FFFFFF', borderRadius:12, border:'1px solid #E5E7EB', overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:'1px solid #E5E7EB' }}>
            {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d=>(
              <div key={d} style={{ padding:'10px 12px', textAlign:'center', fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'.05em' }}>{d}</div>
            ))}
          </div>
          {weeks.map((week,wi)=>(
            <div key={wi} style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:wi<weeks.length-1?'1px solid #F1F5F9':'none' }}>
              {week.map((day,di)=>{
                const thisD = day ? new Date(calYear,calMonth,day) : null;
                const isSel = thisD ? sameDay(thisD,selectedDate) : false;
                const isT   = thisD ? sameDay(thisD,todayStart)   : false;
                const dayAppts = day && thisD ? appointments.filter(a=>apptMatchesDate(a,thisD)) : [];
                const conf = dayAppts.filter(a=>['confirmado','chegou','atendimento','finalizado'].includes(a.status)).length;
                const pend = dayAppts.filter(a=>['agendado','aguardando'].includes(a.status)).length;
                const canc = dayAppts.filter(a=>['cancelado','faltou'].includes(a.status)).length;
                return (
                  <div key={di}
                    onClick={()=>{ if (day&&thisD){setSelectedDate(thisD);setView('day');setSelectedId(null);} }}
                    style={{ minHeight:88, padding:'8px 10px', borderRight:di<6?'1px solid #F1F5F9':'none', background:day?'transparent':'#FAFAFA', cursor:day?'pointer':'default' }}
                    onMouseEnter={e=>{ if(day)(e.currentTarget as HTMLElement).style.background='#F8F9FA'; }}
                    onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.background=day?'transparent':'#FAFAFA'; }}>
                    {day && (
                      <>
                        <div style={{ display:'inline-flex', width:26, height:26, borderRadius:'50%', alignItems:'center', justifyContent:'center', background:isSel?'#000000':isT?'#F4F4F5':'transparent', marginBottom:4 }}>
                          <span style={{ fontSize:13, fontWeight:isSel||isT?700:400, color:isSel?'#FFFFFF':'#191C1D' }}>{day}</span>
                        </div>
                        {dayAppts.length>0 && (
                          <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                            {conf>0 && <div style={{ fontSize:10, fontWeight:500, color:'#15803D', background:'#DCFCE7', borderRadius:4, padding:'1px 5px', display:'inline-block' }}>{conf} conf.</div>}
                            {pend>0 && <div style={{ fontSize:10, color:'#A16207', background:'#FEF9C3', borderRadius:4, padding:'1px 5px', display:'inline-block' }}>{pend} pend.</div>}
                            {canc>0 && <div style={{ fontSize:10, color:'#DC2626', background:'#FEF2F2', borderRadius:4, padding:'1px 5px', display:'inline-block' }}>{canc} cancel.</div>}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── List View ─────────────────────────────────────────────────────────────────
  const ListView = () => (
    <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
      <div style={{ background:'#FFFFFF', borderRadius:12, border:'1px solid #E5E7EB', overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#F9FAFB', borderBottom:'1px solid #E5E7EB' }}>
              {['Horário','Paciente','Tipo','Profissional','Sala','Status','Ações'].map((h,i)=>(
                <th key={h} style={{ padding:'10px 14px', textAlign:i===6?'right':'left', fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...filteredData].sort((a,b)=>(a.sh*60+a.sm)-(b.sh*60+b.sm)).map(a=>{
              const st=STATUSES[a.status]||STATUSES.agendado, pr=getProf(a.profId);
              return (
                <tr key={a.id} onClick={()=>setSelectedId(a.id)}
                  style={{ borderBottom:'1px solid #F1F5F9', cursor:'pointer' }}
                  onMouseEnter={e=>(e.currentTarget.style.background='#F8F9FA')}
                  onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                  <td style={{ padding:'10px 14px', fontSize:13, fontWeight:500, color:'#191C1D', whiteSpace:'nowrap' }}>{fmtTime(a.sh,a.sm)}–{fmtTime(a.eh,a.em)}</td>
                  <td style={{ padding:'10px 14px', fontSize:13, color:'#191C1D' }}>{a.patient}</td>
                  <td style={{ padding:'10px 14px', fontSize:12, color:'#71717A' }}>{a.type}</td>
                  <td style={{ padding:'10px 14px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:pr.color }} />
                      <span style={{ fontSize:12, color:'#374151' }}>{pr.short}</span>
                    </div>
                  </td>
                  <td style={{ padding:'10px 14px', fontSize:12, color:'#71717A' }}>{a.room}</td>
                  <td style={{ padding:'10px 14px' }}>
                    <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:99, background:st.bg, color:st.text }}>{st.label}</span>
                  </td>
                  <td style={{ padding:'10px 14px', textAlign:'right' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:4, justifyContent:'flex-end' }}>
                      {/* Primary action based on status */}
                      {(() => {
                        const primaryMap: Record<string, { label: string; icon: string; nextStatus: string; bg: string; color: string; border: string }> = {
                          agendado:    { label:'Confirmar', icon:'ti-check',           nextStatus:'confirmado',  bg:'#F0FDF4', color:'#16A34A', border:'#BBF7D0' },
                          aguardando:  { label:'Confirmar', icon:'ti-check',           nextStatus:'confirmado',  bg:'#F0FDF4', color:'#16A34A', border:'#BBF7D0' },
                          confirmado:  { label:'Iniciar',   icon:'ti-player-play',     nextStatus:'atendimento', bg:'#EFF6FF', color:'#2563EB', border:'#BFDBFE' },
                          chegou:      { label:'Iniciar',   icon:'ti-player-play',     nextStatus:'atendimento', bg:'#EFF6FF', color:'#2563EB', border:'#BFDBFE' },
                          atendimento: { label:'Finalizar', icon:'ti-player-stop',     nextStatus:'finalizado',  bg:'#F5F3FF', color:'#7C3AED', border:'#DDD6FE' },
                          faltou:      { label:'Reagendar', icon:'ti-calendar-event',  nextStatus:'reagendado',  bg:'#FFF7ED', color:'#C2410C', border:'#FED7AA' },
                          reagendado:  { label:'Confirmar', icon:'ti-check',           nextStatus:'confirmado',  bg:'#F0FDF4', color:'#16A34A', border:'#BBF7D0' },
                        };
                        const cfg = primaryMap[a.status];
                        if (!cfg) return (
                          <button onClick={e=>{ e.stopPropagation(); setSelectedId(a.id); }}
                            style={{ height:28, padding:'0 10px', background:'#F4F4F5', border:'1px solid #E4E4E7', borderRadius:7, fontSize:12, fontWeight:500, color:'#374151', cursor:'pointer', display:'flex', alignItems:'center', gap:5, fontFamily:'inherit' }}>
                            <i className="ti ti-eye" style={{ fontSize:12 }} /> Ver
                          </button>
                        );
                        return (
                          <button onClick={e=>{ e.stopPropagation(); changeStatus(a.id, cfg.nextStatus); }}
                            style={{ height:28, padding:'0 10px', background:cfg.bg, border:`1px solid ${cfg.border}`, borderRadius:7, fontSize:12, fontWeight:500, color:cfg.color, cursor:'pointer', display:'flex', alignItems:'center', gap:5, fontFamily:'inherit' }}>
                            <i className={`ti ${cfg.icon}`} style={{ fontSize:12 }} /> {cfg.label}
                          </button>
                        );
                      })()}
                      {/* Three-dot menu */}
                      <button onClick={e=>{e.stopPropagation();handleCtxMenu(e,a.id);}}
                        style={{ width:28, height:28, borderRadius:7, border:'1px solid #E4E4E7', background:'#FFFFFF', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', color:'#71717A' }}
                        onMouseEnter={e=>{ (e.currentTarget as HTMLElement).style.background='#F4F4F5'; (e.currentTarget as HTMLElement).style.borderColor='#D4D4D8'; }}
                        onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.background='#FFFFFF'; (e.currentTarget as HTMLElement).style.borderColor='#E4E4E7'; }}>
                        <i className="ti ti-dots-vertical" style={{ fontSize:14 }} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ── Detail Panel ──────────────────────────────────────────────────────────────
  const DetailPanel = ({ a }: { a: Appt }) => {
    const st = STATUSES[a.status] || STATUSES.agendado;
    const pr = getProf(a.profId);
    const dur = (a.eh*60+a.em) - (a.sh*60+a.sm);
    const apptD = addDays(todayStart, a.dateOffset ?? 0);
    const ds = `${apptD.getDate()} de ${MONTHS_PT[apptD.getMonth()]}`;

    const [cancelOpen, setCancelOpen]     = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [cancelSaving, setCancelSaving] = useState(false);

    const [resOpen, setResOpen]               = useState(false);
    const [resPlanId2, setResPlanId2]         = useState('');
    const [resTotalAmt2, setResTotalAmt2]     = useState('');
    const [resResAmt2, setResResAmt2]         = useState('');
    const [resPayMtd2, setResPayMtd2]         = useState('');
    const [resDate2, setResDate2]             = useState(() => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; });
    const [resNotes2, setResNotes2]           = useState('');
    const [resSaving2, setResSaving2]         = useState(false);
    const [resErr2, setResErr2]               = useState('');

    const { data: plansForDet } = useQuery({ queryKey: ['plans'], queryFn: () => plansApi.list(), staleTime: 5*60_000, enabled: resOpen });
    const { data: payMtdsForDet } = useQuery({ queryKey: ['financial-payment-methods'], queryFn: () => financialApi.paymentMethods(), staleTime: 5*60_000, enabled: resOpen });
    const activeProcsDet = useMemo(() => ((plansForDet as any[]) || []).filter((p: any) => p.active !== false), [plansForDet]);

    async function handleCreateReservation() {
      setResErr2('');
      if (!resTotalAmt2) { setResErr2('Informe o valor total.'); return; }
      setResSaving2(true);
      try {
        const plan = activeProcsDet.find((p: any) => p.id === resPlanId2);
        await agendaApi.createReservation(a.id, {
          planId:            resPlanId2 || null,
          planName:          plan?.name || 'Reserva de horário',
          totalAmount:       parseFloat(resTotalAmt2.replace(',', '.')),
          reservationAmount: parseFloat((resResAmt2 || '0').replace(',', '.')),
          paymentMethodId:   resPayMtd2 || null,
          paymentDate:       resDate2 || null,
          notes:             resNotes2 || null,
        });
        queryClient.invalidateQueries({ queryKey: ['appointments', calYear, calMonth] });
        setResOpen(false);
      } catch (e: any) {
        setResErr2(e?.response?.data?.message || 'Erro ao criar reserva. Tente novamente.');
      } finally { setResSaving2(false); }
    }

    const [reagendarOpen, setReagendarOpen]   = useState(false);
    const [reagDateStr, setReagDateStr]       = useState(() => {
      const d = apptD;
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    });
    const [reagStartTime, setReagStartTime]   = useState(fmtTime(a.sh, a.sm));
    const [reagEndTime, setReagEndTime]       = useState(fmtTime(a.eh, a.em));
    const [reagProfId, setReagProfId]         = useState(a.profId);
    const [reagRoom, setReagRoom]             = useState(a.room);
    const [reagSaving, setReagSaving]         = useState(false);
    const [reagErr, setReagErr]               = useState('');

    const history = useMemo(() => {
      if (!a.patientId) return [];
      return [...appointments]
        .filter(h => h.patientId === a.patientId && h.id !== a.id)
        .sort((x, y) => {
          const xD = addDays(todayStart, x.dateOffset ?? 0);
          const yD = addDays(todayStart, y.dateOffset ?? 0);
          const diff = yD.getTime() - xD.getTime();
          return diff !== 0 ? diff : (y.sh*60+y.sm) - (x.sh*60+x.sm);
        })
        .slice(0, 5);
    }, [a.id, a.patientId, appointments]);

    async function handleCancel() {
      setCancelSaving(true);
      try {
        const isBlocked = blockedSlots.some(b => b.id === a.id);
        if (isBlocked) {
          setBlockedSlots(prev => { const n = prev.map(x => x.id===a.id ? {...x,status:'cancelado'} : x); saveBlocked(n); return n; });
        } else {
          const extra = cancelReason.trim() ? `\nCancelamento: ${cancelReason.trim()}` : '';
          await agendaApi.update(a.id, {
            status: 'CANCELADO',
            ...(cancelReason.trim() ? { notes: (a.notes || '') + extra } : {}),
          });
          queryClient.invalidateQueries({ queryKey: ['appointments', calYear, calMonth] });
        }
        setCancelOpen(false);
        setSelectedId(null);
      } catch (e) { console.error('Erro ao cancelar', e); }
      finally { setCancelSaving(false); }
    }

    async function handleReagendar() {
      setReagErr('');
      const [rsh, rsm] = reagStartTime.split(':').map(Number);
      const [reh, rem] = reagEndTime.split(':').map(Number);
      if (rsh*60+rsm >= reh*60+rem) { setReagErr('Hora início deve ser antes da hora fim.'); return; }
      setReagSaving(true);
      try {
        await agendaApi.update(a.id, {
          startTime: new Date(`${reagDateStr}T${reagStartTime}:00`).toISOString(),
          endTime:   new Date(`${reagDateStr}T${reagEndTime}:00`).toISOString(),
          professionalId: reagProfId || null,
          room:      reagRoom || null,
          status:    'AGUARDANDO',
        });
        queryClient.invalidateQueries({ queryKey: ['appointments', calYear, calMonth] });
        setReagendarOpen(false);
        setSelectedId(null);
      } catch (e: any) {
        setReagErr(e?.response?.data?.message || 'Erro ao reagendar. Tente novamente.');
      } finally { setReagSaving(false); }
    }

    const inp: React.CSSProperties = { width: '100%', height: 34, padding: '0 10px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, color: '#09090B', background: '#FFFFFF', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' };
    const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: '#71717A', display: 'block', marginBottom: 3 };
    const activeRooms = useMemo(() => loadSettingsRooms().filter(r => r.active !== false), []);

    return (
      <div style={{ width: 380, flexShrink: 0, background: '#FFFFFF', borderLeft: '1px solid #E5E7EB', overflowY: 'auto', display: 'flex', flexDirection: 'column', animation: 'slideRight 0.22s cubic-bezier(0.32,0.72,0,1)' }}>

        {/* Header */}
        <div style={{ padding: '16px 18px 14px', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#09090B', lineHeight: 1.25, marginBottom: 6 }}>
                {a.status === 'bloqueado' ? a.type : a.patient}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: st.bg, color: st.text, whiteSpace: 'nowrap' }}>{st.label}</span>
                {a.status !== 'bloqueado' && a.type && (
                  <span style={{ fontSize: 11, color: '#71717A' }}>{a.type}</span>
                )}
              </div>
            </div>
            <button onClick={() => setSelectedId(null)}
              style={{ width: 28, height: 28, border: 'none', background: '#F4F4F5', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className="ti ti-x" style={{ fontSize: 13, color: '#71717A' }} />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: pr.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: '#71717A' }}>{pr.name}</span>
            {a.room && <><span style={{ fontSize: 11, color: '#D4D4D8' }}>·</span><span style={{ fontSize: 12, color: '#71717A' }}>{a.room}</span></>}
          </div>
        </div>

        {/* Quick actions */}
        {a.status !== 'bloqueado' && (
          <div style={{ padding: '12px 18px', borderBottom: '1px solid #F1F5F9' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Ações</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <ActionBtn icon="ti-check" label="Confirmar" color="#16A34A" bg="#DCFCE7"
                active={a.status === 'confirmado'} onClick={() => changeStatus(a.id, 'confirmado')} />
              <ActionBtn icon="ti-door-enter" label="Chegou" color="#7C3AED" bg="#F3E8FF"
                active={a.status === 'chegou'} onClick={() => changeStatus(a.id, 'chegou')} />
              <ActionBtn icon="ti-player-play" label="Iniciar" color="#2563EB" bg="#EFF6FF"
                active={a.status === 'atendimento'}
                onClick={() => { changeStatus(a.id, 'atendimento'); if (a.patientId) navigate(`/prontuario/${a.patientId}`); }} />
              <ActionBtn icon="ti-user-x" label="Faltou" color="#D97706" bg="#FFFBEB"
                active={a.status === 'faltou'} onClick={() => changeStatus(a.id, 'faltou')} />
              <ActionBtn icon="ti-ban" label="Cancelar" color="#DC2626" bg="#FEF2F2"
                active={cancelOpen || a.status === 'cancelado'}
                onClick={() => { setCancelOpen(o => !o); setReagendarOpen(false); }} />
              <ActionBtn icon="ti-calendar-event" label="Reagendar" color="#7C3AED" bg="#F3E8FF"
                active={reagendarOpen}
                onClick={() => { setReagendarOpen(o => !o); setCancelOpen(false); }} />
              {a.patientId && (
                <ActionBtn icon="ti-user" label="Ver contato" color="#374151" bg="#F4F4F5"
                  onClick={() => navigate(`/patients/${a.patientId}`)} />
              )}
            </div>
          </div>
        )}

        {/* Cancel confirmation */}
        {cancelOpen && (
          <div style={{ margin: '8px 18px 0', padding: '12px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#DC2626', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="ti ti-alert-circle" style={{ fontSize: 14 }} /> Confirmar cancelamento?
            </div>
            <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)}
              placeholder="Motivo do cancelamento (opcional)" rows={2}
              style={{ width: '100%', padding: '7px 10px', border: '1px solid #FECACA', borderRadius: 7, fontSize: 12, color: '#09090B', background: '#FFFFFF', resize: 'none', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button onClick={handleCancel} disabled={cancelSaving}
                style={{ flex: 1, height: 32, border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, color: '#FFFFFF', background: '#DC2626', cursor: cancelSaving ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: cancelSaving ? 0.7 : 1 }}>
                {cancelSaving ? 'Cancelando...' : 'Sim, cancelar'}
              </button>
              <button onClick={() => setCancelOpen(false)}
                style={{ flex: 1, height: 32, border: '1px solid #E4E4E7', borderRadius: 7, fontSize: 12, color: '#71717A', background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}>
                Voltar
              </button>
            </div>
          </div>
        )}

        {/* Reagendar form */}
        {reagendarOpen && (
          <div style={{ margin: '8px 18px 0', padding: '12px 14px', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10, flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#7C3AED', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
              <i className="ti ti-calendar-event" style={{ fontSize: 13 }} /> Reagendar atendimento
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div><label style={lbl}>Nova data</label>
                <input type="date" value={reagDateStr} onChange={e => setReagDateStr(e.target.value)} style={inp} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><label style={lbl}>Hora início</label>
                  <input type="time" value={reagStartTime} onChange={e => setReagStartTime(e.target.value)} style={inp} />
                </div>
                <div><label style={lbl}>Hora fim</label>
                  <input type="time" value={reagEndTime} onChange={e => setReagEndTime(e.target.value)} style={inp} />
                </div>
              </div>
              <div><label style={lbl}>Profissional</label>
                <select value={reagProfId} onChange={e => setReagProfId(e.target.value)} style={inp}>
                  <option value="">— Sem profissional —</option>
                  {profs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Sala</label>
                {activeRooms.length > 0 ? (
                  <select value={reagRoom} onChange={e => setReagRoom(e.target.value)} style={inp}>
                    <option value="">— Sem sala —</option>
                    {activeRooms.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                  </select>
                ) : (
                  <input value={reagRoom} onChange={e => setReagRoom(e.target.value)}
                    placeholder="Nome da sala (opcional)" style={inp} />
                )}
              </div>
              {reagErr && <p style={{ fontSize: 11, color: '#DC2626', margin: 0 }}>{reagErr}</p>}
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={handleReagendar} disabled={reagSaving}
                  style={{ flex: 1, height: 32, border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, color: '#FFFFFF', background: '#7C3AED', cursor: reagSaving ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: reagSaving ? 0.7 : 1 }}>
                  {reagSaving ? 'Salvando...' : 'Confirmar'}
                </button>
                <button onClick={() => setReagendarOpen(false)}
                  style={{ height: 32, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 7, fontSize: 12, color: '#71717A', background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Data block */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>
            {[
              { icon: 'ti-calendar', label: 'Data',     value: ds },
              { icon: 'ti-clock',    label: 'Horário',  value: `${fmtTime(a.sh,a.sm)} – ${fmtTime(a.eh,a.em)}` },
              { icon: 'ti-timer',    label: 'Duração',  value: `${dur} min` },
              ...(a.room ? [{ icon: 'ti-door', label: 'Sala', value: a.room }] : []),
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className={`ti ${row.icon}`} style={{ fontSize: 12, color: '#71717A' }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 500 }}>{row.label}</div>
                  <div style={{ fontSize: 12, color: '#191C1D', fontWeight: 500, marginTop: 1 }}>{row.value}</div>
                </div>
              </div>
            ))}
          </div>
          {a.phone && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="ti ti-brand-whatsapp" style={{ fontSize: 12, color: '#16A34A' }} />
              </div>
              <a href={`https://wa.me/55${a.phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                style={{ fontSize: 12, color: '#16A34A', fontWeight: 500, textDecoration: 'none' }}>
                {a.phone}
              </a>
            </div>
          )}
          {a.notes && (
            <div style={{ marginTop: 10, padding: '8px 10px', background: '#F9F9F9', borderRadius: 8, border: '1px solid #F1F5F9' }}>
              <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 500, marginBottom: 3 }}>Observações</div>
              <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{a.notes}</div>
            </div>
          )}
        </div>

        {/* Financial block */}
        {a.status !== 'bloqueado' && (
          <div style={{ padding: '12px 18px', borderBottom: '1px solid #F1F5F9' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Financeiro</div>

            {a.isFromPackage && !a.saleId ? (
              <div style={{ padding: '10px 12px', background: '#F5F3FF', borderRadius: 10, border: '1px solid #DDD6FE', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <i className="ti ti-package" style={{ fontSize: 14, color: '#7C3AED', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6D28D9', marginBottom: 2 }}>Sessão de pacote</div>
                  <div style={{ fontSize: 11, color: '#7C3AED', lineHeight: 1.5 }}>Este atendimento faz parte de um pacote já contratado. O lançamento financeiro é gerenciado pelo módulo de Sessões.</div>
                </div>
              </div>
            ) : a.saleId ? (
              <div style={{ padding: '10px 12px', background: '#F9F9F9', borderRadius: 10, border: '1px solid #E4E4E7' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                    background: a.saleStatus==='PAID' ? '#DCFCE7' : a.saleStatus==='PARTIAL' ? '#FFFBEB' : '#F4F4F5',
                    color:      a.saleStatus==='PAID' ? '#16A34A' : a.saleStatus==='PARTIAL' ? '#D97706' : '#71717A' }}>
                    {a.saleStatus==='PAID' ? 'Pago' : a.saleStatus==='PARTIAL' ? 'Parcialmente pago' : 'Pendente'}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#09090B' }}>
                    R$ {(a.saleTotal || 0).toFixed(2)}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#9CA3AF' }}>Pago</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#16A34A' }}>R$ {(a.salePaidAmount || 0).toFixed(2)}</div>
                  </div>
                  {(a.saleTotal || 0) - (a.salePaidAmount || 0) > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: '#9CA3AF' }}>Saldo</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#D97706' }}>R$ {((a.saleTotal || 0) - (a.salePaidAmount || 0)).toFixed(2)}</div>
                    </div>
                  )}
                </div>
                {a.status === 'cancelado' && (
                  <div style={{ padding: '6px 8px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, fontSize: 11, color: '#DC2626', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <i className="ti ti-alert-triangle" style={{ fontSize: 11 }} />
                    Agendamento cancelado — verifique o estorno da reserva.
                  </div>
                )}
                <a href="/financial" style={{ fontSize: 11, color: '#2563EB', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <i className="ti ti-external-link" style={{ fontSize: 11 }} /> Abrir no financeiro
                </a>
              </div>
            ) : (
              <>
                <button onClick={() => setResOpen(o => !o)}
                  style={{ width: '100%', height: 34, border: `1px solid ${resOpen ? '#000' : '#E4E4E7'}`, borderRadius: 8, fontSize: 12, fontWeight: 500, color: resOpen ? '#09090B' : '#71717A', background: resOpen ? '#FAFAFA' : '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px' }}>
                  <i className={`ti ${resOpen ? 'ti-chevron-down' : 'ti-plus'}`} style={{ fontSize: 12 }} />
                  Lançar reserva financeira
                </button>

                {resOpen && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <label style={lbl}>Procedimento</label>
                      <select value={resPlanId2} onChange={e => {
                        setResPlanId2(e.target.value);
                        const p = activeProcsDet.find((x: any) => x.id === e.target.value);
                        if (p?.price) setResTotalAmt2(String(p.price));
                      }} style={inp}>
                        <option value="">— Selecionar —</option>
                        {activeProcsDet.map((p: any) => (
                          <option key={p.id} value={p.id}>{p.name}{p.price ? ` — R$ ${Number(p.price).toFixed(2)}` : ''}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={lbl}>Valor total *</label>
                        <input value={resTotalAmt2} onChange={e=>setResTotalAmt2(e.target.value)} placeholder="0,00" style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Entrada</label>
                        <input value={resResAmt2} onChange={e=>setResResAmt2(e.target.value)} placeholder="0,00" style={inp} />
                      </div>
                    </div>
                    <div>
                      <label style={lbl}>Forma de pagamento</label>
                      <select value={resPayMtd2} onChange={e=>setResPayMtd2(e.target.value)} style={inp}>
                        <option value="">— Selecionar —</option>
                        {((payMtdsForDet as any[]) || []).filter((m: any) => m.active !== false).map((m: any) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Data pagamento</label>
                      <input type="date" value={resDate2} onChange={e=>setResDate2(e.target.value)} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Observações</label>
                      <input value={resNotes2} onChange={e=>setResNotes2(e.target.value)} placeholder="Opcional" style={inp} />
                    </div>
                    {resErr2 && <p style={{ fontSize: 11, color: '#DC2626', margin: 0 }}>{resErr2}</p>}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={handleCreateReservation} disabled={resSaving2}
                        style={{ flex: 1, height: 32, border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, color: '#FFFFFF', background: '#000000', cursor: resSaving2 ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: resSaving2 ? 0.7 : 1 }}>
                        {resSaving2 ? 'Salvando...' : 'Salvar reserva'}
                      </button>
                      <button onClick={() => setResOpen(false)}
                        style={{ height: 32, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 7, fontSize: 12, color: '#71717A', background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Recent history */}
        {a.status !== 'bloqueado' && a.patientId && (
          <div style={{ padding: '12px 18px', borderBottom: '1px solid #F1F5F9' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Histórico recente</div>
            {history.length === 0 ? (
              <div style={{ fontSize: 12, color: '#A1A1AA', fontStyle: 'italic' }}>Nenhum atendimento anterior no período.</div>
            ) : history.map((h, i) => {
              const hst = STATUSES[h.status] || STATUSES.agendado;
              const hd = addDays(todayStart, h.dateOffset ?? 0);
              const hds = `${String(hd.getDate()).padStart(2,'0')}/${String(hd.getMonth()+1).padStart(2,'0')}`;
              return (
                <div key={h.id} onClick={() => setSelectedId(h.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < history.length-1 ? '1px solid #F4F4F5' : 'none', cursor: 'pointer', borderRadius: 6 }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F9F9F9')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: hst.dot, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: '#191C1D', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.type}</div>
                    <div style={{ fontSize: 10, color: '#9CA3AF' }}>{hds} · {fmtTime(h.sh,h.sm)}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: hst.bg, color: hst.text, whiteSpace: 'nowrap', flexShrink: 0 }}>{hst.label}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        {a.status !== 'bloqueado' && a.patientId && (
          <div style={{ padding: '12px 18px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: 6, marginTop: 'auto' }}>
            <button onClick={() => navigate(`/patients/${a.patientId}`)}
              style={{ flex: 1, height: 34, border: '1px solid #E4E4E7', borderRadius: 8, background: '#FFFFFF', fontSize: 12, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F4F4F5')}
              onMouseLeave={e => (e.currentTarget.style.background = '#FFFFFF')}>
              <i className="ti ti-user" style={{ fontSize: 12 }} /> Ver contato
            </button>
            <button onClick={() => navigate(`/prontuario/${a.patientId}`)}
              style={{ flex: 1, height: 34, border: '1px solid #000', borderRadius: 8, background: '#000', fontSize: 12, fontWeight: 600, color: '#FFF', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
              onMouseEnter={e => (e.currentTarget.style.background = '#222')}
              onMouseLeave={e => (e.currentTarget.style.background = '#000')}>
              <i className="ti ti-notes-medical" style={{ fontSize: 12 }} /> Prontuário
            </button>
          </div>
        )}
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes fadeInScale { from{opacity:0;transform:scale(.95)} to{opacity:1;transform:scale(1)} }
        @keyframes slideRight  { from{transform:translateX(100%)} to{transform:translateX(0)} }
        @keyframes spin        { to{transform:rotate(360deg)} }
        .ctx-menu{animation:fadeInScale .12s ease}
      `}</style>

      {showNovoModal && <NovoAgendamentoModal onClose={()=>{ setShowNovoModal(false); setNovoModalInitial(undefined); }} defaultDate={selectedDate} onSave={handleCreateAppt} modalProfs={profs} initialValues={novoModalInitial} />}
      {showBloquearModal && <BloquearHorarioModal onClose={()=>setShowBloquearModal(false)} defaultDate={selectedDate} todayStart={todayStart} onSave={addBlocked} profs={profs} />}

      <div style={{ height:'100%', display:'flex', flexDirection:'column', overflow:'hidden', background:'transparent', fontFamily:"'Inter', system-ui, sans-serif" }}>

        {/* Controls bar — single row */}
        <div style={{ flexShrink: 0, background: '#FFFFFF', borderBottom: '1px solid #E5E7EB', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 6, height: 52 }}>

          {/* Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
            <button onClick={goToday}
              style={{ height: 32, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 99, fontSize: 12, fontWeight: 500, color: '#18181B', background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              Hoje
            </button>
            <button onClick={()=>navigate_date(-1)}
              style={{ width: 30, height: 30, border: '1px solid #E4E4E7', borderRadius: 99, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <i className="ti ti-chevron-left" style={{ fontSize: 12, color: '#71717A' }} />
            </button>
            <button onClick={()=>navigate_date(1)}
              style={{ width: 30, height: 30, border: '1px solid #E4E4E7', borderRadius: 99, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <i className="ti ti-chevron-right" style={{ fontSize: 12, color: '#71717A' }} />
            </button>
          </div>

          {/* Date */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#191C1D' }}>
              {view==='month' ? `${MONTHS_PT[calMonth]} de ${calYear}` : formatTitle(selectedDate)}
            </span>
            <span style={{ fontSize: 11, color: '#D4D4D8' }}>·</span>
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>
              {view==='month' ? `${calCells.filter(Boolean).length} dias` : formatDayLabel(selectedDate)}
            </span>
          </div>

          <div style={{ flex: 1 }} />

          {/* View dropdown */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button ref={viewBtnRef}
              onClick={e => { e.stopPropagation(); setShowViewDropdown(o => !o); setShowFiltersDropdown(false); }}
              style={{ height: 32, padding: '0 10px', border: `1px solid ${showViewDropdown ? '#A1A1AA' : '#E4E4E7'}`, borderRadius: 99, fontSize: 12, fontWeight: 500, color: '#18181B', background: showViewDropdown ? '#F4F4F5' : '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              {VIEW_LABELS[view]}
              <i className="ti ti-chevron-down" style={{ fontSize: 10, color: '#9CA3AF' }} />
            </button>
          </div>

          {/* Group by */}
          <select value={groupBy} onChange={e => setGroupBy(e.target.value as 'professional'|'room')} title="Agrupar agenda por"
            style={{ height: 32, padding: '0 10px', border: '1px solid #E4E4E7', borderRadius: 99, fontSize: 12, color: '#18181B', background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, outline: 'none' }}>
            <option value="professional">Profissional</option>
            <option value="room">Sala</option>
          </select>

          {/* Filters */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button ref={filtersBtnRef}
              onClick={e => { e.stopPropagation(); setShowFiltersDropdown(o => !o); setShowViewDropdown(false); }}
              style={{ height: 32, padding: '0 10px', border: `1px solid ${filterCount > 0 ? '#18181B' : showFiltersDropdown ? '#A1A1AA' : '#E4E4E7'}`, borderRadius: 99, fontSize: 12, fontWeight: 500, color: '#18181B', background: showFiltersDropdown ? '#F4F4F5' : '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              <i className="ti ti-adjustments-horizontal" style={{ fontSize: 13, color: filterCount > 0 ? '#18181B' : '#71717A' }} />
              Filtros
              {filterCount > 0 && (
                <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#18181B', color: '#FFF', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{filterCount}</span>
              )}
            </button>
          </div>

          {/* Legend icon */}
          <button ref={legendBtnRef} onClick={() => setShowLegend(v => !v)} title="Legenda dos status"
            style={{ width: 32, height: 32, border: `1px solid ${showLegend ? '#A1A1AA' : '#E4E4E7'}`, borderRadius: 99, background: showLegend ? '#F4F4F5' : '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.12s' }}
            onMouseEnter={e => { if (!showLegend) (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; }}
            onMouseLeave={e => { if (!showLegend) (e.currentTarget as HTMLElement).style.background = '#FFFFFF'; }}>
            <i className="ti ti-info-circle" style={{ fontSize: 15, color: showLegend ? '#191C1D' : '#71717A' }} />
          </button>

          <div style={{ width: 1, height: 20, background: '#E4E4E7', flexShrink: 0 }} />

          {/* Lock */}
          <button onClick={() => setShowBloquearModal(true)} title="Bloquear horário"
            style={{ height: 32, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 99, fontSize: 12, fontWeight: 500, color: '#18181B', background: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}
            onMouseEnter={e => (e.currentTarget.style.background = '#F4F4F5')}
            onMouseLeave={e => (e.currentTarget.style.background = '#FFFFFF')}>
            <i className="ti ti-lock" style={{ fontSize: 13, color: '#71717A' }} /> Bloquear
          </button>

          {/* Settings */}
          <button onClick={() => navigate('/settings')} title="Configurações da agenda"
            style={{ width: 32, height: 32, border: '1px solid #E4E4E7', borderRadius: 99, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'background 0.12s' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#F4F4F5')}
            onMouseLeave={e => (e.currentTarget.style.background = '#FFFFFF')}>
            <i className="ti ti-settings" style={{ fontSize: 14, color: '#71717A' }} />
          </button>

          {/* New appointment */}
          <button onClick={() => { setNovoModalInitial(undefined); setShowNovoModal(true); }}
            style={{ height: 36, padding: '0 16px', background: '#000000', border: 'none', borderRadius: 99, fontSize: 13, fontWeight: 600, color: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0, boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>
            <i className="ti ti-plus" style={{ fontSize: 14 }} /> Novo
          </button>

        </div>

        {/* View dropdown portal */}
        {showViewDropdown && (() => {
          const rect = viewBtnRef.current?.getBoundingClientRect();
          if (!rect) return null;
          return createPortal(
            <>
              <div onClick={() => setShowViewDropdown(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
              <div className="ctx-menu" style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, zIndex: 9999, background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.1)', padding: '4px 0', minWidth: 150, fontFamily: "'Inter', system-ui, sans-serif" }}>
                {(['day','week','month','list'] as const).map(v => (
                  <div key={v} onClick={() => { setView(v); setShowViewDropdown(false); }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#F4F4F5')}
                    onMouseLeave={e => { (e.currentTarget.style.background = view === v ? '#F4F4F5' : 'transparent'); }}
                    style={{ padding: '8px 14px', fontSize: 13, color: '#191C1D', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, background: view === v ? '#F4F4F5' : 'transparent' }}>
                    <span style={{ flex: 1 }}>{VIEW_LABELS[v]}</span>
                    {view === v && <i className="ti ti-check" style={{ fontSize: 12, color: '#16A34A' }} />}
                  </div>
                ))}
              </div>
            </>,
            document.body
          );
        })()}

        {/* Filters dropdown portal */}
        {showFiltersDropdown && (() => {
          const rect = filtersBtnRef.current?.getBoundingClientRect();
          if (!rect) return null;
          return createPortal(
            <>
              <div onClick={() => setShowFiltersDropdown(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
              <div onClick={e => e.stopPropagation()} className="ctx-menu" style={{ position: 'fixed', top: rect.bottom + 4, right: window.innerWidth - rect.right, zIndex: 9999, background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,.13)', padding: '14px 16px', minWidth: 240, fontFamily: "'Inter', system-ui, sans-serif" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>Filtros da agenda</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 500, color: '#71717A', display: 'block', marginBottom: 4 }}>Status</label>
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                      style={{ width: '100%', height: 34, padding: '0 10px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, color: '#09090B', background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}>
                      <option value="">Todos os status</option>
                      {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 500, color: '#71717A', display: 'block', marginBottom: 4 }}>Tipo de atendimento</label>
                    <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                      style={{ width: '100%', height: 34, padding: '0 10px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, color: '#09090B', background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}>
                      <option value="">Todos os tipos</option>
                      {((plansData as any[]) || []).filter((p: any) => p.isActive !== false).map((p: any) => <option key={p.id} value={p.name}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
                {filterCount > 0 && (
                  <button onClick={() => { setStatusFilter(''); setTypeFilter(''); setRoomFilter(''); }}
                    style={{ marginTop: 12, width: '100%', height: 32, border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 12, fontWeight: 500, color: '#71717A', background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Limpar filtros
                  </button>
                )}
              </div>
            </>,
            document.body
          );
        })()}

        {/* Legend portal */}
        {showLegend && (() => {
          const rect = legendBtnRef.current?.getBoundingClientRect();
          if (!rect) return null;
          return createPortal(
            <>
              <div onClick={() => setShowLegend(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
              <div style={{ position: 'fixed', top: rect.bottom + 6, right: window.innerWidth - rect.right, zIndex: 9999, background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.13)', padding: '14px 16px', minWidth: 200, fontFamily: "'Inter', system-ui, sans-serif", animation: 'fadeUp 0.12s ease' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>
                  Legenda da agenda
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {Object.entries(STATUSES).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: v.dot, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: '#374151' }}>{v.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>,
            document.body
          );
        })()}

        {/* Body */}
        <div style={{ flex:1, minHeight:0, display:'flex', overflow:'hidden' }}>

          {/* Sidebar */}
          <div style={{ width:216, flexShrink:0, background:'#FFFFFF', borderRight:'1px solid #E5E7EB', overflowY:'auto', display:'flex', flexDirection:'column' }}>

            {/* Mini calendar */}
            <div style={{ padding:'14px 12px 10px', borderBottom:'1px solid #F1F5F9' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <span style={{ fontSize:12, fontWeight:700, color:'#191C1D' }}>{MONTHS_PT[calMonth].slice(0,3)} {calYear}</span>
                <div style={{ display:'flex', gap:1 }}>
                  <button onClick={()=>{ if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}else setCalMonth(m=>m-1); }}
                    style={{ width:22, height:22, border:'none', background:'transparent', cursor:'pointer', color:'#9CA3AF', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:4 }}>
                    <i className="ti ti-chevron-left" style={{ fontSize:11 }} />
                  </button>
                  <button onClick={()=>{ if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}else setCalMonth(m=>m+1); }}
                    style={{ width:22, height:22, border:'none', background:'transparent', cursor:'pointer', color:'#9CA3AF', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:4 }}>
                    <i className="ti ti-chevron-right" style={{ fontSize:11 }} />
                  </button>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:1, marginBottom:3 }}>
                {['D','S','T','Q','Q','S','S'].map((d,i)=>(
                  <div key={i} style={{ textAlign:'center', fontSize:9, fontWeight:600, color:'#9CA3AF', padding:'2px 0' }}>{d}</div>
                ))}
              </div>
              {Array.from({length:calCells.length/7}, (_,wi)=>(
                <div key={wi} style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:1 }}>
                  {calCells.slice(wi*7, wi*7+7).map((day,di)=>{
                    if (!day) return <div key={di} style={{ padding:'1px 0' }} />;
                    const thisD = new Date(calYear,calMonth,day);
                    const isSel = sameDay(thisD,selectedDate);
                    const isT   = sameDay(thisD,todayStart);
                    const hasA  = appointments.some(a=>apptMatchesDate(a,thisD));
                    return (
                      <div key={di} style={{ textAlign:'center', padding:'1px 0' }}>
                        <div style={{ width:22, height:22, borderRadius:'50%', margin:'0 auto', background:isSel?'#000000':isT?'#F4F4F5':'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', position:'relative' }}
                          onClick={()=>{setSelectedDate(thisD);setSelectedId(null);}}
                          onMouseEnter={e=>{ if(!isSel)(e.currentTarget as HTMLElement).style.background='#F4F4F5'; }}
                          onMouseLeave={e=>{ if(!isSel)(e.currentTarget as HTMLElement).style.background=isT?'#F4F4F5':'transparent'; }}>
                          <span style={{ fontSize:11, fontWeight:isSel||isT?700:400, color:isSel?'#FFFFFF':'#374151' }}>{day}</span>
                          {hasA && !isSel && <div style={{ position:'absolute', bottom:1, left:'50%', transform:'translateX(-50%)', width:4, height:4, borderRadius:'50%', background:'#000000' }} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Profissionais */}
            <div style={{ padding:'12px 12px 8px', borderBottom:'1px solid #F1F5F9' }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Profissionais</div>
              <label style={{ display:'flex', alignItems:'center', gap:7, cursor:'pointer', marginBottom:6 }}>
                <input type="checkbox" checked={profChecked.size===profs.length}
                  onChange={()=>profChecked.size===profs.length?setProfChecked(new Set()):setProfChecked(new Set(profs.map(p=>p.id)))}
                  style={{ width:13, height:13, cursor:'pointer', accentColor:'#000000' }} />
                <span style={{ fontSize:11, color:'#374151', fontWeight:500 }}>Todos</span>
              </label>
              {profs.map(p=>(
                <label key={p.id} style={{ display:'flex', alignItems:'center', gap:7, cursor:'pointer', marginBottom:6 }}>
                  <input type="checkbox" checked={profChecked.has(p.id)} onChange={()=>toggleProf(p.id)} style={{ width:13, height:13, cursor:'pointer', accentColor:p.color }} />
                  <div style={{ width:8, height:8, borderRadius:'50%', background:p.color, flexShrink:0 }} />
                  <span style={{ fontSize:11, color:'#374151' }}>{p.name}</span>
                </label>
              ))}
            </div>

            {/* Salas */}
            <div style={{ padding:'12px 12px 8px' }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Salas</div>
              {['Todas as salas', ...loadSettingsRooms().filter(r=>r.active!==false).map(r=>r.name)].map((s,i)=>(
                <label key={s} style={{ display:'flex', alignItems:'center', gap:7, cursor:'pointer', marginBottom:6 }}>
                  <input type="checkbox" checked={i===0?roomFilter==='':roomFilter===s}
                    onChange={()=>setRoomFilter(i===0?'':(roomFilter===s?'':s))}
                    style={{ width:13, height:13, cursor:'pointer', accentColor:'#000000' }} />
                  <span style={{ fontSize:11, color:'#374151' }}>{s}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Grid area + detail panel */}
          <div style={{ flex:1, minWidth:0, display:'flex', overflow:'hidden' }}>
            <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', overflow:'hidden' }}>
              {profsData !== undefined && profs.length === 0 ? (
                <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14, padding:40 }}>
                  <div style={{ width:56, height:56, borderRadius:16, background:'#F4F4F5', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <i className="ti ti-users-group" style={{ fontSize:26, color:'#A1A1AA' }} />
                  </div>
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontSize:15, fontWeight:700, color:'#09090B', marginBottom:4 }}>Nenhum profissional configurado</div>
                    <div style={{ fontSize:13, color:'#71717A' }}>Cadastre ao menos um usuário com perfil profissional para usar a agenda.</div>
                  </div>
                  <a href="/settings" style={{ height:36, padding:'0 18px', background:'#000', color:'#fff', borderRadius:8, fontSize:13, fontWeight:600, textDecoration:'none', display:'inline-flex', alignItems:'center', gap:6 }}>
                    <i className="ti ti-settings" style={{ fontSize:14 }} /> Ir para Configurações
                  </a>
                </div>
              ) : (
                <>
                  {view==='day'   && <DayView />}
                  {view==='week'  && <WeekView />}
                  {view==='month' && <MonthView />}
                  {view==='list'  && <ListView />}
                </>
              )}
            </div>
            {selectedAppt && <DetailPanel a={selectedAppt} />}
          </div>
        </div>

        {/* Context menu */}
        {ctxMenu && (
          <div className="ctx-menu" onClick={e=>e.stopPropagation()}
            style={{ position:'fixed', top:Math.min(ctxMenu.y, window.innerHeight-(ctxMenu.apptId?420:180)), left:Math.min(ctxMenu.x, window.innerWidth-220), zIndex:9999, background:'#FFFFFF', border:'1px solid #E4E4E7', borderRadius:10, boxShadow:'0 8px 30px rgba(0,0,0,.12)', padding:'4px 0', minWidth:210, fontFamily:"'Inter', system-ui, sans-serif" }}>
            {ctxMenu.apptId ? (
              <>
                {[
                  { label:'Ver detalhes',       icon:'ti-eye',            action:()=>{ setSelectedId(ctxMenu!.apptId!); setCtxMenu(null); } },
                  { label:'Reagendar',          icon:'ti-calendar-event', action:()=>{ setSelectedId(ctxMenu!.apptId!); setCtxMenu(null); } },
                  { label:'Duplicar',           icon:'ti-copy',           action:()=>{ const a=appointments.find(x=>x.id===ctxMenu.apptId); if(a && !a.id.startsWith('blk_') && a.patientId) { const start=new Date(); start.setHours(a.sh,a.sm,0,0); const end=new Date(); end.setHours(a.eh,a.em,0,0); handleCreateAppt({patientId:a.patientId,professionalId:a.profId||null,startTime:start.toISOString(),endTime:end.toISOString(),status:'AGUARDANDO',notes:a.type}); } setCtxMenu(null); } },
                  { label:'Ver paciente',       icon:'ti-user',           action:()=>{ const a=appointments.find(x=>x.id===ctxMenu.apptId); if(a?.patientId) navigate(`/patients/${a.patientId}`); setCtxMenu(null); } },
                  { label:'Prontuário',         icon:'ti-notes-medical',  action:()=>{ const a=appointments.find(x=>x.id===ctxMenu.apptId); if(a?.patientId) navigate(`/prontuario/${a.patientId}`); setCtxMenu(null); } },
                  { label:'Enviar WhatsApp',    icon:'ti-brand-whatsapp', action:()=>{ const a=appointments.find(x=>x.id===ctxMenu.apptId); if(a?.phone) window.open(`https://wa.me/55${a.phone.replace(/\D/g,'')}`); setCtxMenu(null); } },
                ].map((item,i)=>(
                  <div key={i} onClick={item.action}
                    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='#F4F4F5'}
                    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}
                    style={{ padding:'7px 14px', fontSize:13, color:'#191C1D', cursor:'pointer', display:'flex', alignItems:'center', gap:8 }}>
                    <i className={`ti ${item.icon}`} style={{ fontSize:13, color:'#71717A' }} />
                    {item.label}
                  </div>
                ))}
                <div style={{ borderTop:'1px solid #F1F5F9', margin:'4px 0' }} />
                <div style={{ position:'relative' }}
                  onMouseEnter={e=>{setCtxStatusOpen(true);(e.currentTarget as HTMLElement).style.background='#F4F4F5';}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='transparent';}}>
                  <div style={{ padding:'7px 14px', fontSize:13, color:'#191C1D', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <i className="ti ti-adjustments" style={{ fontSize:13, color:'#71717A' }} />
                      Alterar status
                    </div>
                    <i className="ti ti-chevron-right" style={{ fontSize:12, color:'#9CA3AF' }} />
                  </div>
                  {ctxStatusOpen && (
                    <div style={{ position:'absolute', left:'100%', top:0, background:'#FFFFFF', border:'1px solid #E4E4E7', borderRadius:10, boxShadow:'0 8px 30px rgba(0,0,0,.12)', padding:'4px 0', minWidth:190, zIndex:10 }}>
                      {Object.entries(STATUSES).map(([k,v])=>(
                        <div key={k} onClick={()=>{ if(ctxMenu.apptId) changeStatus(ctxMenu.apptId,k); }}
                          onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='#F4F4F5'}
                          onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}
                          style={{ padding:'7px 14px', fontSize:12, color:'#191C1D', cursor:'pointer', display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:7, height:7, borderRadius:'50%', background:v.dot, flexShrink:0 }} />
                          {v.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ borderTop:'1px solid #F1F5F9', margin:'4px 0' }} />
                <div onClick={()=>{ if(ctxMenu.apptId) changeStatus(ctxMenu.apptId,'cancelado'); }}
                  onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='#FEF2F2'}
                  onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}
                  style={{ padding:'7px 14px', fontSize:13, color:'#DC2626', cursor:'pointer', display:'flex', alignItems:'center', gap:8 }}>
                  <i className="ti ti-x" style={{ fontSize:13 }} />
                  Cancelar agendamento
                </div>
              </>
            ) : (
              <>
                {/* Slot info header */}
                {ctxMenu.slotTime && (
                  <div style={{ padding:'6px 14px 4px', fontSize:11, fontWeight:600, color:'#9CA3AF', borderBottom:'1px solid #F1F5F9', marginBottom:2 }}>
                    {ctxMenu.slotDate
                      ? `${ctxMenu.slotDate.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})} · `
                      : ''}{ctxMenu.slotTime}
                    {ctxMenu.slotProfId && profs.find(p=>p.id===ctxMenu.slotProfId)
                      ? ` · ${profs.find(p=>p.id===ctxMenu.slotProfId)!.short}`
                      : ''}
                  </div>
                )}
                {[
                  {
                    label:'Novo agendamento', icon:'ti-calendar-plus',
                    action:()=>{
                      setNovoModalInitial({
                        date: ctxMenu.slotDate,
                        startTime: ctxMenu.slotTime,
                        profId: ctxMenu.slotProfId,
                      });
                      setShowNovoModal(true);
                      setCtxMenu(null);
                    },
                  },
                  { label:'Bloquear horário', icon:'ti-lock',          action:()=>{setShowBloquearModal(true);setCtxMenu(null);} },
                  { label:'Criar lembrete',   icon:'ti-bell',          action:()=>setCtxMenu(null) },
                  { label:'Criar evento',     icon:'ti-calendar-event',action:()=>setCtxMenu(null) },
                ].map((item,i)=>(
                  <div key={i} onClick={item.action}
                    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='#F4F4F5'}
                    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}
                    style={{ padding:'7px 14px', fontSize:13, color:'#191C1D', cursor:'pointer', display:'flex', alignItems:'center', gap:8 }}>
                    <i className={`ti ${item.icon}`} style={{ fontSize:13, color:'#71717A' }} />
                    {item.label}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
