import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { homeApi, tasksApi } from '../../services/api';
import { useToast } from '../../components/ui/Toast';

interface HomeSummary {
  clinic: { id: string; name: string; subtitle: string | null; city: string | null; estado: string | null };
  cards: {
    tasksToday: { total: number; completed: number };
    tasksOverdue: { total: number };
    agendaToday: { total: number; confirmed: number };
    openLeads: { total: number };
    pinnedNotes: { total: number };
  };
  agenda: Array<{
    id: string; startTime: string; endTime: string; status: string;
    patient: { id: string; name: string };
    appointmentType: { name: string } | null;
    professional: { name: string } | null;
  }>;
  myTasks: Array<{
    id: string; title: string; description: string | null; notes: string | null;
    type: string; priority: string; status: string; dueDate: string | null;
    lead: { id: string; name: string } | null;
  }>;
  birthdays: Array<{
    id: string; name: string; birthDate: string; phone: string | null;
    type: 'patient'; daysUntil: number; age: number | null;
  }>;
  quickNotes: Array<{
    id: string; title: string | null; content: string; color: string;
    pinned: boolean; createdAt: string; userId: string | null;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAYS_PT   = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
const MONTHS_PT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

function getGreeting(h: number) {
  if (h >= 5  && h < 12) return { text: 'Bom dia',   emoji: '☀️' };
  if (h >= 12 && h < 18) return { text: 'Boa tarde',  emoji: '🌤️' };
  return                          { text: 'Boa noite', emoji: '🌙' };
}

function formatDate(d: Date) {
  return `${DAYS_PT[d.getDay()]}, ${String(d.getDate()).padStart(2,'0')} de ${MONTHS_PT[d.getMonth()]}`;
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const TASK_ICONS: Record<string, string> = {
  LIGACAO: 'ti-phone', EMAIL: 'ti-mail', REUNIAO: 'ti-users',
  VISITA: 'ti-map-pin', OUTRO: 'ti-checkbox',
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  CONFIRMADO:    { bg: '#DCFCE7', color: '#16A34A' },
  AGUARDANDO:    { bg: '#F4F4F5', color: '#71717A' },
  EM_ATENDIMENTO:{ bg: '#EFF6FF', color: '#2563EB' },
  FINALIZADO:    { bg: '#F4F4F5', color: '#A1A1AA' },
  CANCELADO:     { bg: '#FEF2F2', color: '#DC2626' },
};

const STATUS_LABELS: Record<string, string> = {
  CONFIRMADO: 'Confirmado', AGUARDANDO: 'Aguardando',
  EM_ATENDIMENTO: 'Em atendimento', FINALIZADO: 'Finalizado', CANCELADO: 'Cancelado',
};

const PRIORITY_COLORS: Record<string, { color: string }> = {
  ALTA:  { color: '#DC2626' },
  MEDIA: { color: '#D97706' },
  BAIXA: { color: '#16A34A' },
};

function weatherIcon(code: number) {
  if (code === 0) return '☀️';
  if (code <= 2)  return '⛅';
  if (code <= 3)  return '☁️';
  if (code <= 49) return '🌫️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  return '⛈️';
}

function weatherDesc(code: number) {
  if (code === 0) return 'Céu limpo';
  if (code <= 2)  return 'Parcialmente nublado';
  if (code <= 3)  return 'Nublado';
  if (code <= 49) return 'Neblina';
  if (code <= 67) return 'Chuva';
  if (code <= 77) return 'Neve';
  if (code <= 82) return 'Pancadas de chuva';
  return 'Tempestade';
}

const MOTIVATIONAL = [
  { quote: 'Organização hoje,\nresultados sempre.', sub: 'Bons atendimentos! 🌟' },
  { quote: 'Cada paciente\nmerece o seu melhor.', sub: 'Vai ser um ótimo dia! ✨' },
  { quote: 'Foco e dedicação\ntransformam vidas.', sub: 'Continue assim! 💪' },
  { quote: 'Cuidar é\nsua vocação.', sub: 'Que dia incrível te espera! 🌈' },
  { quote: 'Produtividade\ncom propósito.', sub: 'Vamos nessa! 🚀' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function InicioPage() {
  const { user }     = useAuth();
  const navigate     = useNavigate();
  const qc           = useQueryClient();
  const { toast }    = useToast();
  const now          = new Date();
  const { text: greeting, emoji: greetEmoji } = getGreeting(now.getHours());
  const firstName    = user?.name?.split(' ')[0] ?? 'você';
  const dateStr      = formatDate(now);
  const motivational = MOTIVATIONAL[now.getDay() % MOTIVATIONAL.length];

  const [weather, setWeather] = useState<{ temp: number; code: number; max?: number; min?: number; rain?: number } | null>(null);
  const [weatherCity, setWeatherCity] = useState<string | null>(null);
  const [newNote, setNewNote] = useState('');
  const [showNoteForm, setShowNoteForm] = useState(false);

  const { data, isLoading } = useQuery<HomeSummary>({
    queryKey: ['home-summary'],
    queryFn:  homeApi.summary,
    refetchInterval: 60_000,
  });

  // Fetch weather — uses clinic city if configured, falls back to browser geolocation
  useEffect(() => {
    if (data === undefined) return; // wait for API response
    const city = data?.clinic?.city;
    let cancelled = false;

    async function fetchByCoords(lat: number, lon: number, displayName?: string) {
      const wxRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,weather_code` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum` +
        `&timezone=auto&forecast_days=1`
      );
      const wx = await wxRes.json();
      if (cancelled || !wx?.current) return;
      setWeather({
        temp: Math.round(wx.current.temperature_2m),
        code: wx.current.weather_code,
        max:  wx.daily?.temperature_2m_max?.[0]  != null ? Math.round(wx.daily.temperature_2m_max[0])  : undefined,
        min:  wx.daily?.temperature_2m_min?.[0]  != null ? Math.round(wx.daily.temperature_2m_min[0])  : undefined,
        rain: wx.daily?.precipitation_sum?.[0]   != null ? Math.round(wx.daily.precipitation_sum[0])   : undefined,
      });
      if (displayName && !cancelled) setWeatherCity(displayName);
    }

    (async () => {
      try {
        if (city) {
          // Geocode clinic city name
          const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=pt&format=json`);
          const geo = await geoRes.json();
          if (cancelled || !geo?.results?.[0]) return;
          const { latitude, longitude, name } = geo.results[0];
          await fetchByCoords(latitude, longitude, name);
        } else {
          // Fallback: browser geolocation with 8s timeout
          const geoTimeout = setTimeout(() => {
            if (!cancelled) setWeatherCity('—');
          }, 8000);
          navigator.geolocation.getCurrentPosition(
            async (pos) => {
              clearTimeout(geoTimeout);
              if (cancelled) return;
              try {
                const { latitude, longitude } = pos.coords;
                const revRes = await fetch(
                  `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=pt`,
                  { headers: { 'Accept-Language': 'pt-BR' } }
                );
                const rev = await revRes.json();
                const name = rev?.address?.city || rev?.address?.town || rev?.address?.village || 'Localização atual';
                await fetchByCoords(latitude, longitude, name);
              } catch {
                await fetchByCoords(pos.coords.latitude, pos.coords.longitude, 'Localização atual');
              }
            },
            () => { clearTimeout(geoTimeout); if (!cancelled) setWeatherCity('—'); },
            { timeout: 8000 }
          );
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.clinic?.city, data !== undefined]);

  const completeMut = useMutation({
    mutationFn: (id: string) => tasksApi.update(id, { status: 'CONCLUIDA' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['home-summary'] }); },
    onError: () => toast('Erro ao atualizar tarefa', 'error'),
  });

  const createNoteMut = useMutation({
    mutationFn: (content: string) => tasksApi.createPostIt({ content, pinned: false }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['home-summary'] });
      setNewNote(''); setShowNoteForm(false);
      toast('Anotação criada!', 'success');
    },
    onError: () => toast('Erro ao criar anotação', 'error'),
  });

  // Count appointment statuses
  const agendaCounts = (data?.agenda ?? []).reduce((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const cardBase: React.CSSProperties = {
    background: '#FFFFFF', borderRadius: 14, border: '1px solid #E4E4E7',
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
  };

  if (isLoading) return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: "'Inter', system-ui, sans-serif", padding: '12px 16px', gap: 10 }}>
      {[180, 64, 0].map((h, i) => (
        <div key={i} style={{ background: '#F4F4F5', borderRadius: 14, height: h || 'auto', flex: h ? 0 : 1 }} />
      ))}
    </div>
  );

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: "'Inter', system-ui, sans-serif", padding: '10px 14px', gap: 8,
    }}>

      {/* ── Animations ── */}
      <style>{`
        @keyframes heroFloat {
          0%,100% { transform: translateY(0px); }
          50%      { transform: translateY(-5px); }
        }
        @keyframes heroGlow {
          0%,100% { box-shadow: 0 0 24px rgba(99,102,241,0.35), 0 8px 32px rgba(0,0,0,0.3); }
          50%      { box-shadow: 0 0 48px rgba(139,92,246,0.55), 0 8px 32px rgba(0,0,0,0.3); }
        }
        @keyframes dotPulse {
          0%,100% { opacity: 0.3; transform: scale(1) rotate(45deg); }
          50%      { opacity: 0.7; transform: scale(1.3) rotate(45deg); }
        }
        @keyframes orbDrift1 {
          0%,100% { transform: translate(0px, 0px) scale(1);    opacity: 0.7; }
          40%      { transform: translate(18px, -12px) scale(1.12); opacity: 1; }
          70%      { transform: translate(-8px, 8px) scale(0.95);  opacity: 0.8; }
        }
        @keyframes orbDrift2 {
          0%,100% { transform: translate(0px, 0px) scale(1);      opacity: 0.6; }
          35%      { transform: translate(-14px, 10px) scale(1.08); opacity: 0.9; }
          65%      { transform: translate(10px, -6px) scale(0.93);  opacity: 0.7; }
        }
        @keyframes orbDrift3 {
          0%,100% { transform: translate(0px, 0px) scale(1);      opacity: 0.5; }
          50%      { transform: translate(12px, 14px) scale(1.15);  opacity: 0.8; }
        }
        @keyframes meshDrift {
          0%,100% { background-position: 0px 0px; }
          50%      { background-position: 14px 8px; }
        }
      `}</style>

      {/* ── Hero Banner ─────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        background: 'linear-gradient(135deg, #FAFBFF 0%, #F3F4FF 45%, #FAF5FF 100%)',
        borderRadius: 18, border: '1px solid rgba(99,102,241,0.14)',
        boxShadow: '0 2px 12px rgba(99,102,241,0.06)',
        padding: '18px 22px', position: 'relative', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      }}>
        {/* Animated dot mesh */}
        <div style={{ position:'absolute', inset:0, pointerEvents:'none', opacity:0.30,
          backgroundImage:'radial-gradient(circle, rgba(99,102,241,0.09) 1px, transparent 1px)',
          backgroundSize:'28px 28px',
          animation:'meshDrift 8s ease-in-out infinite' }} />
        {/* Drifting aurora orbs */}
        <div style={{ position:'absolute', top:-50, left:'22%', width:220, height:220, borderRadius:'50%',
          background:'radial-gradient(circle, rgba(99,102,241,0.09) 0%, transparent 60%)', pointerEvents:'none',
          animation:'orbDrift1 9s ease-in-out infinite' }} />
        <div style={{ position:'absolute', bottom:-50, right:'32%', width:180, height:180, borderRadius:'50%',
          background:'radial-gradient(circle, rgba(139,92,246,0.07) 0%, transparent 60%)', pointerEvents:'none',
          animation:'orbDrift2 11s ease-in-out infinite' }} />
        <div style={{ position:'absolute', top:'20%', left:'-30px', width:140, height:140, borderRadius:'50%',
          background:'radial-gradient(circle, rgba(34,211,238,0.05) 0%, transparent 60%)', pointerEvents:'none',
          animation:'orbDrift3 13s ease-in-out infinite' }} />

        {/* Left — Greeting */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#09090B', lineHeight: 1.2, letterSpacing: '-0.5px' }}>
              {greeting}, {firstName}!
            </span>
            <span style={{ fontSize: 22, lineHeight: 1 }}>{greetEmoji}</span>
          </div>
          <div style={{ fontSize: 13, color: '#71717A', marginBottom: 4 }}>
            Aqui está o que precisa da sua atenção hoje.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#A1A1AA', marginBottom: 14 }}>
            <i className="ti ti-calendar" style={{ fontSize: 12 }} />
            {dateStr}
          </div>
          {/* Quick actions */}
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {[
              { icon: 'ti-calendar-plus', label: 'Novo agendamento', path: '/agenda?new=1',  bg: '#EFF6FF', color: '#2563EB' },
              { icon: 'ti-user-plus',     label: 'Novo lead',         path: '/crm?new=1',    bg: '#F5F3FF', color: '#7C3AED' },
              { icon: 'ti-checkbox',      label: 'Nova tarefa',       path: '/tarefas?new=1', bg: '#F0FDF4', color: '#16A34A' },
              { icon: 'ti-note',          label: 'Nova anotação',     path: '',              bg: '#FFFBEB', color: '#D97706' },
              { icon: 'ti-calendar',      label: 'Abrir agenda',      path: '/agenda',       bg: '#F4F4F5', color: '#71717A' },
            ].map(a => (
              <button key={a.label}
                onClick={() => a.path ? navigate(a.path) : setShowNoteForm(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  height: 28, padding: '0 12px',
                  background: '#FFFFFF', border: '1px solid #E4E4E7',
                  borderRadius: 99, fontSize: 11, fontWeight: 500, color: '#18181B',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = a.bg;
                  (e.currentTarget as HTMLElement).style.borderColor = 'transparent';
                  (e.currentTarget as HTMLElement).style.color = a.color;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = '#FFFFFF';
                  (e.currentTarget as HTMLElement).style.borderColor = '#E4E4E7';
                  (e.currentTarget as HTMLElement).style.color = '#18181B';
                }}
              >
                <i className={`ti ${a.icon}`} style={{ fontSize: 12 }} />
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right — Weather card + Quote card side by side */}
        <div style={{ display: 'flex', gap: 18, alignItems: 'stretch', flexShrink: 0, position: 'relative', zIndex: 1, overflow: 'visible' }}>

          {/* Weather card — dark AI aesthetic + float/glow animation */}
          <div style={{
            width: 136,
            background: 'linear-gradient(135deg, #0F0C29 0%, #0D2137 45%, #0F1A2E 100%)',
            borderRadius: 16, padding: '14px 14px', color: '#FFFFFF',
            position: 'relative', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            animation: 'heroFloat 4.6s ease-in-out 0.6s infinite, heroGlow 4.6s ease-in-out 0.6s infinite',
          }}>
            {/* Aurora orbs */}
            <div style={{ position:'absolute', top:-25, right:-15, width:90, height:90, borderRadius:'50%',
              background:'radial-gradient(circle, rgba(34,211,238,0.20) 0%, transparent 65%)', pointerEvents:'none' }} />
            <div style={{ position:'absolute', bottom:-20, left:-10, width:70, height:70, borderRadius:'50%',
              background:'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 65%)', pointerEvents:'none' }} />
            <div style={{ position:'absolute', inset:0, borderRadius:16, pointerEvents:'none',
              background:'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 50%)' }} />
            {/* Animated dots */}
            {[{ top:12, right:18, size:3, delay:'0.3s' }, { bottom:14, left:16, size:2.5, delay:'1.8s' }].map((d, i) => (
              <div key={i} style={{ position:'absolute', top:(d as any).top, bottom:(d as any).bottom, right:(d as any).right, left:(d as any).left,
                width:d.size, height:d.size, borderRadius:1, background:'rgba(165,180,252,0.7)',
                animation:`dotPulse 2.5s ease-in-out ${d.delay} infinite`, pointerEvents:'none' }} />
            ))}
            {/* City */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8, position: 'relative' }}>
              <i className="ti ti-map-pin" style={{ fontSize: 11, color: 'rgba(165,180,252,0.8)' }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(196,181,253,0.9)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {weatherCity || data?.clinic?.city || 'Clima local'}
              </span>
            </div>
            {!weather ? (
              <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.7)', flex: 1, display: 'flex', alignItems: 'center', position: 'relative' }}>
                {data === undefined ? 'Carregando...' : weatherCity === '—' ? 'Clima indisponível' : 'Obtendo localização...'}
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 32, lineHeight: 1 }}>{weatherIcon(weather.code)}</span>
                  <div>
                    <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: '#FFFFFF' }}>{weather.temp}°</div>
                    <div style={{ fontSize: 9, color: 'rgba(196,181,253,0.8)', lineHeight: 1.3, marginTop: 2 }}>
                      {weatherDesc(weather.code)}
                    </div>
                  </div>
                </div>
                {(weather.max !== undefined && weather.min !== undefined) && (
                  <div style={{ display: 'flex', gap: 8, fontSize: 10, fontWeight: 600 }}>
                    <span style={{ color: '#FCA5A5' }}>↑ {weather.max}°</span>
                    <span style={{ color: '#93C5FD' }}>↓ {weather.min}°</span>
                  </div>
                )}
                {weather.rain !== undefined && weather.rain > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 10, color: 'rgba(147,197,253,0.85)' }}>
                    <i className="ti ti-droplet" style={{ fontSize: 10 }} />
                    {weather.rain}mm hoje
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Animated daily quote card — dark AI aesthetic */}
          <div style={{
            width: 190,
            background: 'linear-gradient(135deg, #0F0C29 0%, #0D2137 45%, #0F1A2E 100%)',
            borderRadius: 16, padding: '16px 18px', color: '#FFFFFF',
            position: 'relative', overflow: 'hidden',
            animation: 'heroFloat 4s ease-in-out infinite, heroGlow 4s ease-in-out infinite',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          }}>
            <div style={{ position:'absolute', top:-30, left:'30%', width:120, height:120, borderRadius:'50%',
              background:'radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 65%)', pointerEvents:'none' }} />
            <div style={{ position:'absolute', bottom:-20, right:-10, width:90, height:90, borderRadius:'50%',
              background:'radial-gradient(circle, rgba(139,92,246,0.20) 0%, transparent 65%)', pointerEvents:'none' }} />
            <div style={{ position:'absolute', inset:0, borderRadius:16, pointerEvents:'none',
              background:'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 50%)' }} />
            {[{ top:14, right:22, size:4, delay:'0s' }, { bottom:16, left:18, size:3, delay:'1.2s' }].map((d, i) => (
              <div key={i} style={{ position:'absolute', top:(d as any).top, bottom:(d as any).bottom, right:(d as any).right, left:(d as any).left,
                width:d.size, height:d.size, borderRadius:1, background:'rgba(165,180,252,0.7)',
                animation:`dotPulse 2.5s ease-in-out ${d.delay} infinite`, pointerEvents:'none' }} />
            ))}
            <div style={{ marginBottom: 8, position: 'relative' }}>
              <i className="ti ti-sparkles" style={{ fontSize: 18, opacity: 0.85 }} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.5, marginBottom: 10, position: 'relative',
              letterSpacing: '-0.1px', flex: 1, color: 'rgba(226,232,240,0.95)' }}>
              {motivational.quote.split('\n').map((l, i) => <span key={i}>{l}{i === 0 ? <br/> : ''}</span>)}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.8)', position: 'relative' }}>{motivational.sub}</div>
          </div>

        </div>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {[
          { label: 'Minhas tarefas hoje', icon: 'ti-checkbox',          bg: '#F0FDF4', color: '#16A34A', value: data?.cards.tasksToday.total ?? 0,    sub: `${data?.cards.tasksToday.completed ?? 0} concluídas`, onClick: () => navigate('/tarefas') },
          { label: 'Tarefas atrasadas',   icon: 'ti-clock-exclamation', bg: '#FEF2F2', color: '#DC2626', value: data?.cards.tasksOverdue.total ?? 0,   sub: 'Precisam de atenção',  onClick: () => navigate('/tarefas') },
          { label: 'Agenda hoje',         icon: 'ti-calendar',          bg: '#FFFBEB', color: '#D97706', value: data?.cards.agendaToday.total ?? 0,    sub: `${data?.cards.agendaToday.confirmed ?? 0} confirmados`, onClick: () => navigate('/agenda') },
          { label: 'Leads em aberto',     icon: 'ti-layout-kanban',     bg: '#F5F3FF', color: '#7C3AED', value: data?.cards.openLeads.total ?? 0,      sub: 'No funil comercial',   onClick: () => navigate('/crm') },
          { label: 'Anotações fixadas',   icon: 'ti-pin',               bg: '#EFF6FF', color: '#2563EB', value: data?.cards.pinnedNotes.total ?? 0,    sub: 'Post-its fixados',     onClick: undefined },
        ].map(card => (
          <div key={card.label}
            onClick={card.onClick}
            style={{
              ...cardBase, padding: '10px 14px', cursor: card.onClick ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', gap: 10,
              transition: 'box-shadow 0.15s',
            }}
            onMouseEnter={e => { if (card.onClick) (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'; }}
          >
            <div style={{ width: 36, height: 36, borderRadius: 10, background: card.bg, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className={`ti ${card.icon}`} style={{ fontSize: 17, color: card.color }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 1,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#09090B', lineHeight: 1.1 }}>{card.value}</div>
              <div style={{ fontSize: 10, color: '#71717A', marginTop: 1 }}>{card.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main 3-col ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr 288px', gap: 10 }}>

        {/* ── Col 1: Agenda ─────────────────────────────────────────────────── */}
        <div style={{ ...cardBase, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px 8px', borderBottom: '1px solid #F4F4F5' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, background: '#FFFBEB',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="ti ti-calendar" style={{ fontSize: 13, color: '#D97706' }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#09090B' }}>Agenda da clínica — Hoje</span>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 99,
                background: '#F4F4F5', color: '#71717A' }}>{data?.cards.agendaToday.total ?? 0}</span>
            </div>
            <button onClick={() => navigate('/agenda')}
              style={{ fontSize: 11, fontWeight: 500, color: '#7C3AED', background: 'none', border: 'none',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}>
              Ver agenda <i className="ti ti-arrow-up-right" style={{ fontSize: 11 }} />
            </button>
          </div>
          {/* Status chips row */}
          {(data?.cards.agendaToday.total ?? 0) > 0 && (
            <div style={{ flexShrink: 0, display: 'flex', gap: 5, padding: '6px 16px', flexWrap: 'wrap',
              borderBottom: '1px solid #F4F4F5' }}>
              {[
                { key: 'CONFIRMADO',     label: 'Confirmados',     color: '#16A34A', bg: '#DCFCE7' },
                { key: 'AGUARDANDO',     label: 'Aguardando',      color: '#71717A', bg: '#F4F4F5' },
                { key: 'EM_ATENDIMENTO', label: 'Em atendimento',  color: '#2563EB', bg: '#EFF6FF' },
                { key: 'FINALIZADO',     label: 'Finalizados',     color: '#A1A1AA', bg: '#F4F4F5' },
                { key: 'CANCELADO',      label: 'Cancelados',      color: '#DC2626', bg: '#FEF2F2' },
              ].filter(s => agendaCounts[s.key]).map(s => (
                <span key={s.key} style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
                  background: s.bg, color: s.color }}>
                  {s.label}: {agendaCounts[s.key]}
                </span>
              ))}
            </div>
          )}
          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {(data?.agenda ?? []).length === 0 ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 8, color: '#A1A1AA', padding: '20px' }}>
                <i className="ti ti-calendar-off" style={{ fontSize: 28, opacity: 0.4 }} />
                <span style={{ fontSize: 12 }}>Nenhum agendamento para hoje.</span>
              </div>
            ) : (data?.agenda ?? []).map((apt, i) => {
              const sc = STATUS_COLORS[apt.status] ?? { bg: '#F4F4F5', color: '#71717A' };
              return (
                <div key={apt.id}
                  onClick={() => navigate('/agenda')}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
                    borderBottom: i < (data?.agenda ?? []).length - 1 ? '1px solid #F9F9F9' : 'none',
                    cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F9F9F9'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                >
                  {/* Time */}
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#71717A', flexShrink: 0, width: 38 }}>
                    {fmtTime(apt.startTime)}
                  </span>
                  {/* Avatar */}
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#F0EEFF',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: '#7C3AED', flexShrink: 0 }}>
                    {initials(apt.patient.name)}
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#09090B',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {apt.patient.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#A1A1AA' }}>
                      {apt.appointmentType?.name ?? 'Consulta'}
                      {apt.professional && ` · ${apt.professional.name}`}
                    </div>
                  </div>
                  {/* Status */}
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
                    background: sc.bg, color: sc.color, flexShrink: 0 }}>
                    {STATUS_LABELS[apt.status] ?? apt.status}
                  </span>
                </div>
              );
            })}
          </div>
          {/* Footer */}
          <div style={{ flexShrink: 0, padding: '8px 16px', borderTop: '1px solid #F4F4F5',
            display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => navigate('/agenda?new=1')}
              style={{ height: 28, padding: '0 12px', background: '#000', border: 'none', borderRadius: 20,
                fontSize: 11, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="ti ti-plus" style={{ fontSize: 11 }} /> Novo agendamento
            </button>
          </div>
        </div>

        {/* ── Col 2: Tasks ──────────────────────────────────────────────────── */}
        <div style={{ ...cardBase, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px 8px', borderBottom: '1px solid #F4F4F5' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, background: '#F0FDF4',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="ti ti-checkbox" style={{ fontSize: 13, color: '#16A34A' }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#09090B' }}>Minhas tarefas — Hoje</span>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 99,
                background: '#F4F4F5', color: '#71717A' }}>{data?.myTasks?.length ?? 0}</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => navigate('/tarefas')}
                style={{ fontSize: 11, fontWeight: 500, color: '#16A34A', background: 'none', border: 'none',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}>
                Ver todas <i className="ti ti-arrow-up-right" style={{ fontSize: 11 }} />
              </button>
            </div>
          </div>
          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {(data?.myTasks ?? []).length === 0 ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 8, color: '#A1A1AA', padding: '20px' }}>
                <i className="ti ti-circle-check" style={{ fontSize: 28, opacity: 0.4 }} />
                <span style={{ fontSize: 12 }}>Você não possui tarefas para hoje.</span>
              </div>
            ) : (data?.myTasks ?? []).map((task, i) => {
              const done     = task.status === 'CONCLUIDA';
              const priColor = PRIORITY_COLORS[task.priority]?.color ?? '#71717A';
              const icon     = TASK_ICONS[task.type] ?? 'ti-checkbox';
              return (
                <div key={task.id}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 16px',
                    borderBottom: i < (data?.myTasks ?? []).length - 1 ? '1px solid #F9F9F9' : 'none',
                    opacity: done ? 0.5 : 1 }}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => !done && completeMut.mutate(task.id)}
                    style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${done ? '#16A34A' : '#D4D4D8'}`,
                      background: done ? '#16A34A' : 'transparent', flexShrink: 0, marginTop: 1,
                      cursor: done ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {done && <i className="ti ti-check" style={{ fontSize: 10, color: '#fff' }} />}
                  </button>
                  {/* Type icon */}
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: '#F4F4F5', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className={`ti ${icon}`} style={{ fontSize: 12, color: '#71717A' }} />
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#09090B',
                      textDecoration: done ? 'line-through' : 'none',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {task.title}
                    </div>
                    {task.lead && (
                      <div style={{ fontSize: 11, color: '#A1A1AA', marginTop: 1 }}>
                        <i className="ti ti-user" style={{ fontSize: 10 }} /> {task.lead.name}
                      </div>
                    )}
                    {task.dueDate && (
                      <div style={{ fontSize: 11, color: '#A1A1AA' }}>
                        <i className="ti ti-clock" style={{ fontSize: 10 }} /> {fmtTime(task.dueDate)}
                      </div>
                    )}
                  </div>
                  {/* Priority */}
                  <span style={{ fontSize: 10, fontWeight: 700, color: priColor, flexShrink: 0,
                    textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 3 }}>
                    {task.priority}
                  </span>
                </div>
              );
            })}
          </div>
          {/* Footer */}
          <div style={{ flexShrink: 0, padding: '8px 16px', borderTop: '1px solid #F4F4F5',
            display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => navigate('/tarefas?new=1')}
              style={{ height: 28, padding: '0 12px', background: '#000', border: 'none', borderRadius: 20,
                fontSize: 11, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="ti ti-plus" style={{ fontSize: 11 }} /> Nova tarefa
            </button>
          </div>
        </div>

        {/* ── Col 3: Right sidebar ──────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>

          {/* Birthdays — takes most of the vertical space */}
          <div style={{ ...cardBase, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px 8px', borderBottom: '1px solid #F4F4F5' }}>
              <i className="ti ti-cake" style={{ fontSize: 14, color: '#D97706' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#09090B' }}>Aniversariantes</span>
              <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99,
                background: '#FFFBEB', color: '#D97706' }}>{data?.birthdays?.length ?? 0}</span>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 14px 10px' }}>
              {(data?.birthdays ?? []).length === 0 ? (
                <div style={{ fontSize: 11, color: '#A1A1AA', textAlign: 'center', padding: '14px 0' }}>
                  Nenhum aniversariante nos próximos 7 dias.
                </div>
              ) : (data?.birthdays ?? []).map(b => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                  borderBottom: '1px solid #F9F9F9' }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#FFFBEB',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: '#D97706', flexShrink: 0 }}>
                    {initials(b.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#09090B',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</div>
                    <div style={{ fontSize: 10, color: '#A1A1AA' }}>
                      {b.daysUntil === 0 ? '🎂 Hoje!' : b.daysUntil === 1 ? 'Amanhã' : `Em ${b.daysUntil} dias`}
                      {b.age !== null && ` · ${b.age} anos`}
                    </div>
                  </div>
                  {b.phone && (
                    <a href={`https://wa.me/55${b.phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                      style={{ color: '#16A34A', fontSize: 14, flexShrink: 0 }}>
                      <i className="ti ti-brand-whatsapp" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Quick Notes — equal split with birthdays */}
          <div style={{ ...cardBase, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px 8px', borderBottom: '1px solid #F4F4F5' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-note" style={{ fontSize: 13, color: '#2563EB' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#09090B' }}>Anotações rápidas</span>
                <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99,
                  background: '#EFF6FF', color: '#2563EB' }}>{data?.quickNotes?.length ?? 0}</span>
              </div>
              <button onClick={() => setShowNoteForm(s => !s)}
                style={{ width: 22, height: 22, borderRadius: 6, background: showNoteForm ? '#000' : '#F4F4F5',
                  border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: showNoteForm ? '#fff' : '#71717A' }}>
                <i className={`ti ti-${showNoteForm ? 'x' : 'plus'}`} style={{ fontSize: 11 }} />
              </button>
            </div>
            {showNoteForm && (
              <div style={{ flexShrink: 0, padding: '8px 14px', borderBottom: '1px solid #F4F4F5' }}>
                <textarea
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  placeholder="Digite uma anotação..."
                  rows={2}
                  style={{ width: '100%', border: '1px solid #E4E4E7', borderRadius: 8, padding: '7px 10px',
                    fontSize: 11, fontFamily: 'inherit', resize: 'none', outline: 'none',
                    boxSizing: 'border-box', background: '#FFFBEB' }}
                />
                <button onClick={() => newNote.trim() && createNoteMut.mutate(newNote.trim())}
                  style={{ marginTop: 5, height: 26, padding: '0 12px', background: '#000', border: 'none',
                    borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Salvar
                </button>
              </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(data?.quickNotes ?? []).length === 0 ? (
                <div style={{ textAlign: 'center', color: '#A1A1AA', fontSize: 11, padding: '12px 0' }}>
                  Nenhuma anotação ainda.
                </div>
              ) : (data?.quickNotes ?? []).slice(0, 5).map(note => (
                <div key={note.id} style={{ background: note.color || '#FFFBEB', borderRadius: 10,
                  padding: '8px 10px', border: '1px solid rgba(0,0,0,0.05)', position: 'relative' }}>
                  {note.pinned && (
                    <i className="ti ti-pin" style={{ fontSize: 9, color: '#71717A', position: 'absolute', top: 6, right: 8 }} />
                  )}
                  {note.title && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#09090B', marginBottom: 2 }}>{note.title}</div>
                  )}
                  <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.4,
                    overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as any}>
                    {note.content}
                  </div>
                  <div style={{ fontSize: 10, color: '#A1A1AA', marginTop: 4 }}>
                    {new Date(note.createdAt).toLocaleDateString('pt-BR')}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
