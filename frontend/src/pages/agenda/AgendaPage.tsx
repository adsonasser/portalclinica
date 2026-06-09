import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { patientsApi, agendaApi } from '../../services/api';

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

const TYPES = ['Consulta inicial','Retorno','Avaliação nutricional','Retorno nutricional','Aplicação injetável','Consulta psicológica','Retorno psicológico','Curativo','Encaixe'];
const ROOMS = ['Sala 01','Sala 02','Enfermagem','Online'];

interface Appt {
  id: string; profId: string; patient: string; patientId?: string; type: string; status: string;
  sh: number; sm: number; eh: number; em: number;
  room: string; phone: string; email: string; notes: string;
  dateOffset?: number; // days from today; 0 or undefined = today
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
  const start    = new Date(a.startTime);
  const end      = new Date(a.endTime);
  const apptDay  = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const diff     = Math.round((apptDay.getTime() - todayStart.getTime()) / 86400000);
  const [typeLine, ...rest] = (a.notes || '').split('\n');
  return {
    id: a.id, profId: a.professionalId || '',
    patient: a.patient?.name || '—', patientId: a.patientId,
    type: typeLine || a.plan?.name || 'Consulta',
    status: BACKEND_TO_STATUS[a.status] || 'agendado',
    sh: start.getHours(), sm: start.getMinutes(),
    eh: end.getHours(),   em: end.getMinutes(),
    room: '', phone: a.patient?.phone || '', email: a.patient?.email || '',
    notes: rest.join('\n'), dateOffset: diff,
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
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#FFFFFF', borderRadius:16, width, maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 24px 80px rgba(0,0,0,0.18)', padding:'28px 32px', fontFamily:"'Inter', system-ui, sans-serif" }}>
        {children}
      </div>
    </div>
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

function NovoAgendamentoModal({ onClose, defaultDate, onSave, modalProfs }: {
  onClose:()=>void; defaultDate:Date; onSave:(payload:any)=>Promise<void>; modalProfs: Prof[];
}) {
  // ── Patient state ──
  const [mode, setMode]                     = useState<'existing'|'new'>('existing');
  const [searchQ, setSearchQ]               = useState('');
  const [searchRes, setSearchRes]           = useState<any[]>([]);
  const [searching, setSearching]           = useState(false);
  const [showDrop, setShowDrop]             = useState(false);
  const [selPat, setSelPat]                 = useState<SelPatient|null>(null);
  const [savedMsg, setSavedMsg]             = useState('');
  const [dupWarn, setDupWarn]               = useState<{patient:any; field:string}|null>(null);
  const [savingPat, setSavingPat]           = useState(false);
  // new patient fields
  const [npName, setNpName]     = useState('');
  const [npPhone, setNpPhone]   = useState('');
  const [npCpf, setNpCpf]       = useState('');
  const [npBirth, setNpBirth]   = useState('');
  const [npEmail, setNpEmail]   = useState('');
  const [npSource, setNpSource] = useState('Agenda');
  const [npNotes, setNpNotes]   = useState('');
  const [npErr, setNpErr]       = useState('');

  // ── Appointment state ──
  const [saving, setSaving]       = useState(false);
  const [profId, setProfId]       = useState(() => modalProfs[0]?.id || '');
  const [dateStr, setDateStr]     = useState(() => {
    const d = defaultDate;
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime]     = useState('10:00');
  const [type, setType]           = useState(TYPES[0]);
  const [room, setRoom]           = useState(ROOMS[0]);
  const [apptNotes, setApptNotes] = useState('');
  const [err, setErr]             = useState('');

  // ── Patient search debounce ──
  useEffect(() => {
    if (searchQ.length < 2) { setSearchRes([]); setShowDrop(false); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await patientsApi.list({ search: searchQ });
        setSearchRes(res);
        setShowDrop(true);
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
    const startDt = new Date(`${dateStr}T${startTime}:00`);
    const endDt   = new Date(`${dateStr}T${endTime}:00`);
    const realProfId = profId || null;
    setSaving(true);
    try {
      await onSave({
        patientId:      selPat.id,
        professionalId: realProfId,
        startTime:      startDt.toISOString(),
        endTime:        endDt.toISOString(),
        status:         'AGUARDANDO',
        notes:          type + (apptNotes ? '\n' + apptNotes : ''),
      });
      onClose();
    } catch {
      setErr('Erro ao salvar agendamento. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  const inp: React.CSSProperties = { width:'100%', height:36, padding:'0 10px', border:'1px solid #E4E4E7', borderRadius:8, fontSize:13, color:'#09090B', background:'#FFFFFF', boxSizing:'border-box', fontFamily:'inherit', outline:'none' };
  const lbl: React.CSSProperties = { fontSize:12, fontWeight:500, color:'#71717A', display:'block', marginBottom:4 };
  const secHdr: React.CSSProperties = { fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:12 };

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.25)', zIndex:9000, backdropFilter:'blur(2px)' }} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:640, background:'#FFFFFF', zIndex:9001, boxShadow:'-4px 0 32px rgba(0,0,0,.14)', display:'flex', flexDirection:'column', fontFamily:"'Inter', system-ui, sans-serif", animation:'slideRight .22s cubic-bezier(0.32,0.72,0,1)', overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'20px 28px', borderBottom:'1px solid #E4E4E7', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:'#F0FDF4', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <i className="ti ti-calendar-plus" style={{ fontSize:18, color:'#16A34A' }} />
          </div>
          <div>
            <h2 style={{ fontSize:16, fontWeight:700, color:'#09090B', margin:0 }}>Novo agendamento</h2>
            <p style={{ fontSize:12, color:'#71717A', margin:'2px 0 0' }}>Preencha os dados do atendimento</p>
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

          {/* Success banner */}
          {savedMsg && (
            <div style={{ marginBottom:12, padding:'8px 12px', background:'#DCFCE7', borderRadius:8, border:'1px solid #BBF7D0', display:'flex', alignItems:'center', gap:8 }}>
              <i className="ti ti-circle-check" style={{ fontSize:14, color:'#16A34A', flexShrink:0 }} />
              <span style={{ fontSize:12, color:'#15803D', fontWeight:500 }}>{savedMsg}</span>
            </div>
          )}

          {/* Selected patient card */}
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
                  <div style={{ fontSize:11, color:'#71717A' }}>
                    {selPat.phone}{selPat.cpf ? ` · CPF ${selPat.cpf}` : ''}{selPat.email ? ` · ${selPat.email}` : ''}
                  </div>
                </div>
              </div>
              <button onClick={()=>{ setSelPat(null); setSavedMsg(''); setSearchQ(''); }}
                style={{ fontSize:11, color:'#71717A', background:'none', border:'1px solid #E4E4E7', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontFamily:'inherit' }}>
                Trocar
              </button>
            </div>
          ) : (
            <>
              {/* Tab switcher */}
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

              {/* ── Existing patient search ── */}
              {mode === 'existing' && (
                <div>
                  <div style={{ position:'relative' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, background:'#FFFFFF', border:'1px solid #E4E4E7', borderRadius:8, padding:'0 12px', height:36 }}>
                      <i className="ti ti-search" style={{ fontSize:14, color:'#A1A1AA', flexShrink:0 }} />
                      <input value={searchQ} onChange={e=>{ setSearchQ(e.target.value); }}
                        onFocus={()=>{ if (searchRes.length > 0) setShowDrop(true); }}
                        placeholder="Buscar por nome, CPF, telefone ou e-mail..."
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
                              <div style={{ fontSize:11, color:'#71717A' }}>{p.phone||'Sem telefone'}{p.cpf ? ` · CPF ${p.cpf}` : ''}</div>
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

              {/* ── New patient quick form ── */}
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
                      {savingPat
                        ? <><i className="ti ti-loader-2" style={{ fontSize:13, animation:'spin 1s linear infinite' }} /> Salvando...</>
                        : <><i className="ti ti-check" style={{ fontSize:13 }} /> Salvar paciente</>
                      }
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
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div><label style={lbl}>Profissional</label>
                <select value={profId} onChange={e=>setProfId(e.target.value)} style={inp}>
                  {modalProfs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Tipo de atendimento</label>
                <select value={type} onChange={e=>setType(e.target.value)} style={inp}>
                  {TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div><label style={lbl}>Data</label><input type="date" value={dateStr} onChange={e=>setDateStr(e.target.value)} style={inp} /></div>
              <div><label style={lbl}>Sala</label>
                <select value={room} onChange={e=>setRoom(e.target.value)} style={inp}>
                  {ROOMS.map(r=><option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div><label style={lbl}>Hora início</label><input type="time" value={startTime} onChange={e=>setStartTime(e.target.value)} style={inp} /></div>
              <div><label style={lbl}>Hora fim</label><input type="time" value={endTime} onChange={e=>setEndTime(e.target.value)} style={inp} /></div>
            </div>
            <div><label style={lbl}>Observações</label>
              <textarea value={apptNotes} onChange={e=>setApptNotes(e.target.value)} rows={2} placeholder="Observações opcionais..."
                style={{ ...inp, height:'auto', padding:'8px 10px', resize:'vertical' }} />
            </div>
          </div>
        </div>

        {err && <p style={{ fontSize:12, color:'#DC2626', margin:'0 0 4px' }}>{err}</p>}
      </div>

      {/* Footer */}
      <div style={{ flexShrink:0, padding:'14px 28px', borderTop:'1px solid #E4E4E7', display:'flex', gap:10, background:'#FAFAFA' }}>
        <button onClick={onClose} style={{ flex:1, height:40, border:'1px solid #E4E4E7', borderRadius:8, fontSize:13, fontWeight:500, color:'#71717A', background:'#FFFFFF', cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
        <button onClick={saveAppt} disabled={saving || !selPat} style={{ flex:2, height:40, border:'none', borderRadius:8, fontSize:13, fontWeight:600, color:'#FFFFFF', background: (selPat && !saving) ? '#000000' : '#A1A1AA', cursor:(selPat && !saving)?'pointer':'not-allowed', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
          {saving ? <><i className="ti ti-loader-2" style={{ fontSize:14, animation:'spin 1s linear infinite' }} /> Salvando...</> : <><i className="ti ti-calendar-plus" style={{ fontSize:14 }} /> Salvar agendamento</>}
        </button>
      </div>
    </div>
  </>
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

// ─── Main Component ────────────────────────────────────────────────────────────
export function AgendaPage() {
  const navigate     = useNavigate();
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
  const [ctxMenu, setCtxMenu]         = useState<{ x:number; y:number; apptId:string|null }|null>(null);
  const [ctxStatusOpen, setCtxStatusOpen] = useState(false);
  const [profChecked, setProfChecked] = useState<Set<string>>(new Set());
  const [roomFilter, setRoomFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter]   = useState('');
  const [showNovoModal, setShowNovoModal]       = useState(false);
  const [showBloquearModal, setShowBloquearModal] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  // ── Fetch professionals ───────────────────────────────────────────────────
  const { data: profsData } = useQuery({
    queryKey: ['agenda-professionals'],
    queryFn:  agendaApi.professionals,
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

  // ── Fetch appointments ────────────────────────────────────────────────────
  const fetchStart = new Date(calYear, calMonth, 1).toISOString();
  const fetchEnd   = new Date(calYear, calMonth + 1, 0, 23, 59, 59).toISOString();

  const { data: apptData, refetch: refetchAppts } = useQuery({
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
    const h = () => { setCtxMenu(null); setCtxStatusOpen(false); };
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

  const getProf = (id:string) => profs.find(p=>p.id===id) || profs[0] || DEFAULT_PROF;

  // ── ApptCard ─────────────────────────────────────────────────────────────────
  const ApptCard = ({ a }:{ a:Appt }) => {
    const st = STATUSES[a.status] || STATUSES.agendado;
    const pr = getProf(a.profId);
    const top = apptTop(a.sh, a.sm);
    const h = Math.max(apptHeight(a.sh, a.sm, a.eh, a.em), 24);
    const sel = a.id===selectedId;
    const tall = h>=48;
    return (
      <div onClick={e=>{e.stopPropagation();setSelectedId(a.id);}} onContextMenu={e=>handleCtxMenu(e,a.id)}
        style={{ position:'absolute', top, left:3, right:3, height:h, background:st.bg,
          border:`1px solid ${sel?pr.color:st.border}`, borderLeft:`3px solid ${pr.color}`,
          borderRadius:6, padding:tall?'4px 7px':'2px 6px', cursor:'pointer',
          boxShadow:sel?`0 0 0 2px ${pr.color}33,0 2px 8px rgba(0,0,0,.08)`:'0 1px 2px rgba(0,0,0,.05)',
          overflow:'hidden', zIndex:sel?2:1, transition:'box-shadow 0.12s', userSelect:'none' }}>
        <div style={{ fontSize:10, fontWeight:600, color:pr.color, lineHeight:1.3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {fmtTime(a.sh,a.sm)}{tall?` — ${fmtTime(a.eh,a.em)}`:''}
        </div>
        {tall && <div style={{ fontSize:11, fontWeight:600, color:'#191C1D', lineHeight:1.3, marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.status==='bloqueado'?a.type:a.patient}</div>}
        {tall && h>=64 && <div style={{ fontSize:10, color:'#71717A', marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.type}</div>}
        {tall && h>=80 && <span style={{ display:'inline-block', marginTop:3, fontSize:9, fontWeight:600, padding:'1px 6px', borderRadius:99, background:st.border, color:st.text }}>{st.label}</span>}
        {!tall && <div style={{ fontSize:10, color:'#374151', lineHeight:1.2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.status==='bloqueado'?a.type:a.patient}</div>}
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
            <div key={p.id} onContextMenu={e=>handleCtxMenu(e,null)}
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
                <div key={i} onContextMenu={e=>handleCtxMenu(e,null)}
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
  const DetailPanel = ({ a }:{ a:Appt }) => {
    const st = STATUSES[a.status] || STATUSES.agendado;
    const pr = getProf(a.profId);
    const dur = (a.eh*60+a.em)-(a.sh*60+a.sm);
    const apptD = addDays(todayStart, a.dateOffset??0);
    const ds = `${String(apptD.getDate()).padStart(2,'0')}/${String(apptD.getMonth()+1).padStart(2,'0')}/${apptD.getFullYear()}`;

    const qa = [
      { label:'Confirmar',  icon:'ti-check',         color:'#16A34A', status:'confirmado'  },
      { label:'Chegou',     icon:'ti-door-enter',     color:'#7C3AED', status:'chegou'      },
      { label:'Iniciar',    icon:'ti-player-play',    color:'#2563EB', status:'atendimento' },
      { label:'Finalizar',  icon:'ti-player-stop',    color:'#15803D', status:'finalizado'  },
      { label:'Faltou',     icon:'ti-user-x',         color:'#DC2626', status:'faltou'      },
      { label:'Cancelar',   icon:'ti-x',              color:'#EF4444', status:'cancelado'   },
      { label:'Reagendar',  icon:'ti-calendar-event', color:'#C2410C', status:'reagendado'  },
      { label:'Ver paciente',icon:'ti-user',          color:'#1D4ED8', status:null          },
    ];

    return (
      <div style={{ width:520, flexShrink:0, background:'#FFFFFF', borderLeft:'1px solid #E5E7EB', overflowY:'auto', display:'flex', flexDirection:'column', animation:'slideRight 0.22s cubic-bezier(0.32,0.72,0,1)' }}>
        <div style={{ padding:'16px 20px 14px', borderBottom:'1px solid #F1F5F9', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <span style={{ fontSize:11, fontWeight:600, padding:'2px 9px', borderRadius:99, background:st.bg, color:st.text }}>{st.label}</span>
            <button onClick={()=>setSelectedId(null)} style={{ width:26, height:26, border:'none', background:'#F4F4F5', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className="ti ti-x" style={{ fontSize:13, color:'#71717A' }} />
            </button>
          </div>
          <div style={{ fontSize:16, fontWeight:700, color:'#191C1D' }}>{a.type}</div>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:pr.color }} />
            <span style={{ fontSize:12, color:'#71717A' }}>{pr.name}</span>
          </div>
        </div>

        <div style={{ padding:'14px 20px', borderBottom:'1px solid #F1F5F9' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 16px' }}>
            {[
              { icon:'ti-user',     label:'Paciente', value:a.status==='bloqueado'?'—':a.patient },
              { icon:'ti-calendar', label:'Data',     value:ds },
              { icon:'ti-clock',    label:'Horário',  value:`${fmtTime(a.sh,a.sm)} — ${fmtTime(a.eh,a.em)}` },
              { icon:'ti-timer',    label:'Duração',  value:`${dur} min` },
              { icon:'ti-door',     label:'Sala',     value:a.room||'—' },
              { icon:'ti-phone',    label:'Telefone', value:a.phone||'—' },
              { icon:'ti-mail',     label:'E-mail',   value:a.email||'—' },
            ].map(row=>(
              <div key={row.label} style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                <div style={{ width:26, height:26, borderRadius:7, background:'#F4F4F5', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <i className={`ti ${row.icon}`} style={{ fontSize:12, color:'#71717A' }} />
                </div>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:10, color:'#9CA3AF', fontWeight:500 }}>{row.label}</div>
                  <div style={{ fontSize:12, color:'#191C1D', fontWeight:500, marginTop:1, wordBreak:'break-all' }}>{row.value}</div>
                </div>
              </div>
            ))}
          </div>
          {a.notes && (
            <div style={{ marginTop:10, padding:'8px 10px', background:'#F9F9F9', borderRadius:8, border:'1px solid #F1F5F9' }}>
              <div style={{ fontSize:10, color:'#9CA3AF', fontWeight:500, marginBottom:4 }}>Observações</div>
              <div style={{ fontSize:12, color:'#374151', lineHeight:1.5 }}>{a.notes}</div>
            </div>
          )}
        </div>

        <div style={{ padding:'12px 20px', borderBottom:'1px solid #F1F5F9' }}>
          <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Ações rápidas</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
            {qa.map(q=>(
              <button key={q.label} onClick={()=>{ if(q.status) changeStatus(a.id, q.status); }}
                style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'8px 4px', border:`1px solid ${a.status===q.status?q.color+'60':'#E4E4E7'}`, borderRadius:8, background:a.status===q.status?q.color+'10':'#FFFFFF', cursor:'pointer', fontFamily:'inherit' }}
                onMouseEnter={e=>{ (e.currentTarget as HTMLElement).style.background='#F8F9FA'; }}
                onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.background=a.status===q.status?q.color+'10':'#FFFFFF'; }}>
                <i className={`ti ${q.icon}`} style={{ fontSize:14, color:q.color }} />
                <span style={{ fontSize:9, color:'#374151', fontWeight:500, textAlign:'center', lineHeight:1.2 }}>{q.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding:'12px 20px', flex:1 }}>
          <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Histórico recente</div>
          {[
            { date:'20/05/2026', type:'Consulta inicial', status:'finalizado' },
            { date:'13/05/2026', type:'Bioimpedância',    status:'finalizado' },
            { date:'06/05/2026', type:'Enfermagem',       status:'faltou'     },
          ].map((h,i)=>{
            const hs=STATUSES[h.status];
            return (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:i<2?'1px solid #F1F5F9':'none' }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:hs?.dot||'#9CA3AF', flexShrink:0 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, color:'#191C1D', fontWeight:500 }}>{h.type}</div>
                  <div style={{ fontSize:10, color:'#9CA3AF' }}>{h.date}</div>
                </div>
                <span style={{ fontSize:10, fontWeight:600, padding:'1px 6px', borderRadius:99, background:hs?.bg, color:hs?.text }}>{hs?.label}</span>
              </div>
            );
          })}
          <div style={{ marginTop:10, display:'flex', gap:6 }}>
            {a.patientId && (
              <button onClick={()=>navigate(`/patients/${a.patientId}`)} style={{ flex:1, padding:'8px 0', border:'1px solid #E4E4E7', borderRadius:8, background:'transparent', fontSize:12, color:'#374151', fontWeight:500, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}
                onMouseEnter={e=>{ (e.currentTarget as HTMLElement).style.background='#F4F4F5'; }}
                onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.background='transparent'; }}>
                <i className="ti ti-user" style={{ fontSize:12 }} /> Ver contato
              </button>
            )}
            {a.patientId && (
              <button onClick={()=>navigate(`/prontuario/${a.patientId}`)} style={{ flex:1, padding:'8px 0', border:'1px solid #000', borderRadius:8, background:'#000', fontSize:12, color:'#FFF', fontWeight:600, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}
                onMouseEnter={e=>{ (e.currentTarget as HTMLElement).style.background='#222'; }}
                onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.background='#000'; }}>
                <i className="ti ti-notes-medical" style={{ fontSize:12 }} /> Prontuário
              </button>
            )}
          </div>
        </div>
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

      {showNovoModal && <NovoAgendamentoModal onClose={()=>setShowNovoModal(false)} defaultDate={selectedDate} onSave={handleCreateAppt} modalProfs={profs} />}
      {showBloquearModal && <BloquearHorarioModal onClose={()=>setShowBloquearModal(false)} defaultDate={selectedDate} todayStart={todayStart} onSave={addBlocked} profs={profs} />}

      <div style={{ height:'100%', display:'flex', flexDirection:'column', overflow:'hidden', background:'#F8F9FA', fontFamily:"'Inter', system-ui, sans-serif" }}>

        {/* Header */}
        <div style={{ flexShrink:0, background:'#FFFFFF', borderBottom:'1px solid #E5E7EB', padding:'18px 28px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <h1 style={{ fontSize:20, fontWeight:700, color:'#191C1D', margin:0 }}>Agenda</h1>
            <p style={{ fontSize:12, color:'#71717A', margin:'2px 0 0' }}>Gerencie atendimentos por dia, semana, mês, profissional e sala.</p>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>setShowBloquearModal(true)}
              style={{ height:36, padding:'0 14px', border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:10, fontSize:12, fontWeight:500, color:'#374151', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}>
              <i className="ti ti-lock" style={{ fontSize:13 }} /> Bloquear horário
            </button>
            <button onClick={()=>navigate('/settings')}
              style={{ height:36, padding:'0 14px', border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:10, fontSize:12, fontWeight:500, color:'#374151', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}>
              <i className="ti ti-settings" style={{ fontSize:13 }} /> Configurações
            </button>
            <button onClick={()=>setShowNovoModal(true)}
              style={{ height:36, padding:'0 16px', background:'#000000', border:'none', borderRadius:10, fontSize:13, fontWeight:600, color:'#FFFFFF', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}>
              <i className="ti ti-plus" style={{ fontSize:14 }} /> Novo agendamento
            </button>
          </div>
        </div>

        {/* Controls bar */}
        <div style={{ flexShrink:0, background:'#FFFFFF', borderBottom:'1px solid #E5E7EB', padding:'8px 28px', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <button onClick={goToday} style={{ height:32, padding:'0 14px', border:'1px solid #E4E4E7', borderRadius:8, fontSize:12, fontWeight:500, color:'#374151', background:'#FFFFFF', cursor:'pointer', fontFamily:'inherit' }}>Hoje</button>
            <button onClick={()=>navigate_date(-1)} style={{ width:28, height:28, border:'1px solid #E4E4E7', borderRadius:7, background:'#FFFFFF', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
              <i className="ti ti-chevron-left" style={{ fontSize:13, color:'#71717A' }} />
            </button>
            <button onClick={()=>navigate_date(1)} style={{ width:28, height:28, border:'1px solid #E4E4E7', borderRadius:7, background:'#FFFFFF', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
              <i className="ti ti-chevron-right" style={{ fontSize:13, color:'#71717A' }} />
            </button>
          </div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'#191C1D', lineHeight:1 }}>
              {view==='month' ? `${MONTHS_PT[calMonth]} de ${calYear}` : formatTitle(selectedDate)}
            </div>
            <div style={{ fontSize:11, color:'#71717A', marginTop:1 }}>
              {view==='month' ? `${calCells.filter(Boolean).length} dias` : formatDayLabel(selectedDate)}
            </div>
          </div>
          <div style={{ flex:1 }} />
          <div style={{ display:'flex', background:'#F4F4F5', borderRadius:8, padding:2, gap:1 }}>
            {(['day','week','month','list'] as const).map(v=>{
              const labels={day:'Dia',week:'Semana',month:'Mês',list:'Lista'};
              const act=view===v;
              return <button key={v} onClick={()=>setView(v)} style={{ height:28, padding:'0 12px', borderRadius:6, border:'none', fontSize:12, fontWeight:act?600:400, color:act?'#191C1D':'#71717A', background:act?'#FFFFFF':'transparent', cursor:'pointer', fontFamily:'inherit', boxShadow:act?'0 1px 3px rgba(0,0,0,.1)':'none' }}>{labels[v]}</button>;
            })}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:12, color:'#71717A' }}>Agrupar por</span>
            <select value={groupBy} onChange={e=>setGroupBy(e.target.value as 'professional'|'room')}
              style={{ height:30, padding:'0 8px', border:'1px solid #E4E4E7', borderRadius:8, fontSize:12, color:'#374151', background:'#FFFFFF', cursor:'pointer', fontFamily:'inherit' }}>
              <option value="professional">Profissional</option>
              <option value="room">Sala</option>
            </select>
          </div>
          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
            style={{ height:30, padding:'0 8px', border:'1px solid #E4E4E7', borderRadius:8, fontSize:12, color:'#374151', background:'#FFFFFF', cursor:'pointer', fontFamily:'inherit' }}>
            <option value="">Todos os status</option>
            {Object.entries(STATUSES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}
            style={{ height:30, padding:'0 8px', border:'1px solid #E4E4E7', borderRadius:8, fontSize:12, color:'#374151', background:'#FFFFFF', cursor:'pointer', fontFamily:'inherit' }}>
            <option value="">Todos os tipos</option>
            {TYPES.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          {(statusFilter||typeFilter||roomFilter) && (
            <button onClick={()=>{setStatusFilter('');setTypeFilter('');setRoomFilter('');}}
              style={{ fontSize:12, color:'#71717A', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit' }}>
              Limpar filtros
            </button>
          )}
        </div>

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
            <div style={{ padding:'12px 12px 8px', borderBottom:'1px solid #F1F5F9' }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Salas</div>
              {['Todas as salas',...ROOMS].map((s,i)=>(
                <label key={s} style={{ display:'flex', alignItems:'center', gap:7, cursor:'pointer', marginBottom:6 }}>
                  <input type="checkbox" checked={i===0?roomFilter==='':roomFilter===s}
                    onChange={()=>setRoomFilter(i===0?'':(roomFilter===s?'':s))}
                    style={{ width:13, height:13, cursor:'pointer', accentColor:'#000000' }} />
                  <span style={{ fontSize:11, color:'#374151' }}>{s}</span>
                </label>
              ))}
            </div>

            {/* Legenda */}
            <div style={{ padding:'12px 12px 8px' }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Legenda</div>
              {Object.entries(STATUSES).map(([k,v])=>(
                <div key={k} onClick={()=>setStatusFilter(statusFilter===k?'':k)}
                  style={{ display:'flex', alignItems:'center', gap:7, marginBottom:6, cursor:'pointer', padding:'2px 4px', borderRadius:5, background:statusFilter===k?'#F4F4F5':'transparent' }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:v.dot, flexShrink:0 }} />
                  <span style={{ fontSize:11, color:statusFilter===k?'#191C1D':'#374151', fontWeight:statusFilter===k?600:400 }}>{v.label}</span>
                </div>
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
                  { label:'Abrir atendimento', icon:'ti-stethoscope', action:()=>{const a=appointments.find(x=>x.id===ctxMenu.apptId);if(a)window.alert(`Prontuário: ${a.patient}`);setCtxMenu(null);} },
                  { label:'Reagendar',          icon:'ti-calendar-event', action:()=>setCtxMenu(null) },
                  { label:'Duplicar',           icon:'ti-copy', action:()=>{ const a=appointments.find(x=>x.id===ctxMenu.apptId); if(a && !a.id.startsWith('blk_') && a.patientId) { const start=new Date(); start.setHours(a.sh,a.sm,0,0); const end=new Date(); end.setHours(a.eh,a.em,0,0); handleCreateAppt({patientId:a.patientId,professionalId:a.profId||null,startTime:start.toISOString(),endTime:end.toISOString(),status:'AGUARDANDO',notes:a.type}); } setCtxMenu(null); } },
                  { label:'Ver paciente',       icon:'ti-user',  action:()=>setCtxMenu(null) },
                  { label:'Histórico',          icon:'ti-history', action:()=>setCtxMenu(null) },
                  { label:'Enviar lembrete',    icon:'ti-bell', action:()=>setCtxMenu(null) },
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
                {[
                  { label:'Novo agendamento', icon:'ti-plus',          action:()=>{setShowNovoModal(true);setCtxMenu(null);} },
                  { label:'Bloquear horário', icon:'ti-lock',          action:()=>{setShowBloquearModal(true);setCtxMenu(null);} },
                  { label:'Criar encaixe',    icon:'ti-bolt',          action:()=>{setShowNovoModal(true);setCtxMenu(null);} },
                  { label:'Ver disponibilidade',icon:'ti-calendar-check',action:()=>setCtxMenu(null) },
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
