import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { patientsApi, prontuarioApi } from '../../services/api';
import { NovaVendaModal } from '../../components/NovaVendaModal';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '../../components/ui/Toast';

// ─── Types ────────────────────────────────────────────────────────────────────

type HistoryItem = {
  id: string; date: Date; tipo: string;
  profissional: string; resumo: string; status?: string;
  icon: string; iconColor: string; iconBg: string;
  docContent?: string; docName?: string; docType?: string;
  fullContent?: string;
};

const HISTORY_STATUS: Record<string, { label: string; bg: string; color: string }> = {
  finalizado: { label: 'Finalizado', bg: '#DCFCE7', color: '#16A34A' },
  enviada:    { label: 'Enviada',    bg: '#EFF6FF', color: '#2563EB' },
  rascunho:   { label: 'Rascunho',   bg: '#F4F4F5', color: '#71717A' },
  salvo:      { label: 'Salvo',      bg: '#F0FDFA', color: '#0D9488' },
};

const DOC_FILTER_TYPES = ['Todos', 'Evolução', 'Prescrição', 'Receita', 'Exames', 'Atestado', 'Declaração', 'Orientação', 'Termo', 'Outros'];
const RECEITUARIO_FILTER = ['Todos', 'Receita', 'Atestado', 'Declaração', 'Orientações', 'Exames', 'Outros'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function calcAge(birthDate?: string | null): number | null {
  if (!birthDate) return null;
  const bd = new Date(birthDate);
  const today = new Date();
  return Math.floor((today.getTime() - bd.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

function fillTemplate(content: string, patient: any): string {
  const today = new Date();
  const birthDate = patient.birthDate ? new Date(patient.birthDate) : null;
  const age = calcAge(patient.birthDate);
  const user = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const profName = user?.name || 'Profissional';
  return content
    .replace(/{{nome_paciente}}/g,     patient.name       || 'Não informado')
    .replace(/{{cpf_paciente}}/g,      patient.cpf        || 'Não informado')
    .replace(/{{data_nascimento}}/g,   birthDate ? format(birthDate, 'dd/MM/yyyy', { locale: ptBR }) : 'Não informado')
    .replace(/{{idade_paciente}}/g,    age != null ? `${age} anos` : 'Não informado')
    .replace(/{{telefone_paciente}}/g, patient.phone      || 'Não informado')
    .replace(/{{email_paciente}}/g,    patient.email      || 'Não informado')
    .replace(/{{data_atual}}/g,        format(today, 'dd/MM/yyyy', { locale: ptBR }))
    .replace(/{{nome_profissional}}/g, profName)
    .replace(/{{crm_profissional}}/g,  'Não informado')
    .replace(/{{nome_clinica}}/g,      'Não informado')
    .replace(/{{procedimento}}/g,      'Não informado')
    .replace(/{{observacoes}}/g,       patient.obsGerais  || 'Não informado')
    .replace(/{{profissional}}/g,      profName)
    .replace(/{{crm}}/g,               'Não informado')
    .replace(/{{clinica}}/g,           'Não informado')
    .replace(/{{[^}]+}}/g, 'Não informado');
}

function buildHistory(patient: any): HistoryItem[] {
  const items: HistoryItem[] = [];
  const user = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const profName = user?.name || 'Profissional';

  (patient.evolutionNotes || []).forEach((n: any) => {
    const clean = stripHtml(n.content || '');
    items.push({
      id: n.id, date: new Date(n.date),
      tipo: 'Evolução', profissional: profName,
      resumo: clean.slice(0, 120) + (clean.length > 120 ? '…' : ''),
      status: 'finalizado',
      icon: 'ti-notes', iconColor: '#16A34A', iconBg: '#F0FDF4',
      fullContent: n.content || '',
    });
  });

  (patient.prescriptions || []).forEach((p: any) => {
    const clean = stripHtml(p.content || '');
    items.push({
      id: p.id, date: new Date(p.date),
      tipo: 'Receita', profissional: profName,
      resumo: clean.slice(0, 120) + (clean.length > 120 ? '…' : ''),
      status: 'enviada',
      icon: 'ti-pill', iconColor: '#7C3AED', iconBg: '#F5F3FF',
      fullContent: p.content || '',
    });
  });

  (patient.documents || []).forEach((d: any) => {
    items.push({
      id: d.id, date: new Date(d.createdAt),
      tipo: `Documento — ${d.name}`, profissional: d.professional || profName,
      resumo: d.type ? `Tipo: ${d.type}` : 'Documento',
      status: 'salvo',
      icon: 'ti-file-text', iconColor: '#0D9488', iconBg: '#F0FDFA',
      docContent: d.content, docName: d.name, docType: d.type,
    });
  });

  return items.sort((a, b) => b.date.getTime() - a.date.getTime());
}

function ToolBtn({ icon, title, onClick }: { icon: string; title: string; onClick: () => void }) {
  return (
    <button type="button" title={title} onClick={onClick}
      style={{ width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A', flexShrink: 0 }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; (e.currentTarget as HTMLElement).style.color = '#191C1D'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#71717A'; }}>
      <i className={`ti ${icon}`} style={{ fontSize: 14 }} />
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ProntuarioPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const editorRef = useRef<HTMLDivElement>(null);
  const receituarioEditorRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const audioFileRef = useRef<HTMLInputElement>(null);
  const isFinalizingRef = useRef(false);

  // ── State ──
  const [consultaAtiva, setConsultaAtiva]         = useState(false);
  const [consultaStart, setConsultaStart]         = useState<Date | null>(null);
  const [consultaDur, setConsultaDur]             = useState('00:00:00');
  const [confirmFinalizarEv, setConfirmFinalizarEv] = useState(false);
  const [postVendaOpen, setPostVendaOpen]         = useState(false);
  const [vendaModalOpen, setVendaModalOpen]       = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [modelosOpen, setModelosOpen]             = useState(false);
  const [modelosFilter, setModelosFilter]         = useState('Todos');
  const [modelosBusca, setModelosBusca]           = useState('');
  const [insertConflict, setInsertConflict]       = useState(false);
  const [pendingContent, setPendingContent]       = useState('');
  const [receituarioOpen, setReceituarioOpen]     = useState(false);
  const [receituarioType, setReceituarioType]     = useState('Receita');
  const [receituarioTitle, setReceituarioTitle]   = useState('');
  const [receituarioFilter, setReceituarioFilter] = useState('Todos');
  const [receituarioBusca, setReceituarioBusca]   = useState('');
  const [saveDocOk, setSaveDocOk]                 = useState(false);
  const [historyItem, setHistoryItem]             = useState<HistoryItem | null>(null);
  const [transcricaoOpen, setTranscricaoOpen]     = useState(false);
  const [transcricaoText, setTranscricaoText]     = useState('');
  const [isRecording, setIsRecording]             = useState(false);
  const [recTimer, setRecTimer]                   = useState(0);
  const [audioFileName, setAudioFileName]         = useState('');
  const [alertsOpen, setAlertsOpen]               = useState(true);

  // ── Data ──
  const { data: patient, isLoading } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => patientsApi.get(patientId!),
    enabled: !!patientId,
  });

  const { data: docTemplates = [] } = useQuery({
    queryKey: ['doc-templates'],
    queryFn: () => prontuarioApi.listDocTemplates(true),
  });

  // ── Timers ──
  useEffect(() => {
    if (!consultaAtiva || !consultaStart) return;
    const t = setInterval(() => {
      const diff = Math.floor((Date.now() - consultaStart.getTime()) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setConsultaDur(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(t);
  }, [consultaAtiva, consultaStart]);

  useEffect(() => {
    if (!isRecording) return;
    const t = setInterval(() => setRecTimer(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [isRecording]);

  // ── Mutations ──
  const saveMut = useMutation({
    mutationFn: (content: string) => prontuarioApi.createEvolution(patientId!, { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patient', patientId] });
      if (editorRef.current) editorRef.current.innerHTML = '';
      if (isFinalizingRef.current) {
        isFinalizingRef.current = false;
        setConsultaAtiva(false);
        setConsultaStart(null);
        setConsultaDur('00:00:00');
        setPostVendaOpen(true);
      }
      toast('Evolução salva com sucesso.', 'success');
    },
    onError: () => { isFinalizingRef.current = false; toast('Não foi possível salvar. Tente novamente.', 'error'); },
  });

  const saveDocMut = useMutation({
    mutationFn: (data: any) => prontuarioApi.savePatientDocument(patientId!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patient', patientId] });
      setSaveDocOk(true);
      setTimeout(() => setSaveDocOk(false), 4000);
      toast('Documento salvo com sucesso.', 'success');
    },
    onError: () => toast('Não foi possível salvar o documento.', 'error'),
  });

  // ── Ctrl+S shortcut ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        const content = editorRef.current?.innerHTML?.trim();
        if (content && !saveMut.isPending) {
          saveMut.mutate(content);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [saveMut]);

  // ── Editor commands ──
  const exec = useCallback((cmd: string, value?: string) => {
    document.execCommand(cmd, false, value ?? undefined);
    editorRef.current?.focus();
  }, []);

  const insertModeloNoEditor = (content: string, mode: 'replace' | 'append') => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = mode === 'replace' ? content
      : (editorRef.current.innerHTML?.trim() ? `${editorRef.current.innerHTML}<br><br>${content}` : content);
    editorRef.current.focus();
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(editorRef.current);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  const abrirModelo = (modelo: any) => {
    const filled = patient ? fillTemplate(modelo.content, patient) : modelo.content;
    const hasContent = !!(editorRef.current?.innerHTML?.trim());
    setModelosOpen(false);
    setModelosBusca('');
    if (hasContent) { setPendingContent(filled); setInsertConflict(true); }
    else insertModeloNoEditor(filled, 'replace');
  };

  const iniciarConsulta = () => { setConsultaAtiva(true); setConsultaStart(new Date()); setConsultaDur('00:00:00'); };

  const finalizarEvolucao = () => {
    const content = editorRef.current?.innerHTML?.trim();
    if (!content) return;
    isFinalizingRef.current = true;
    saveMut.mutate(content);
  };

  // ── Voice ──
  const startRecording = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setTranscricaoText('Navegador não suporta reconhecimento de voz. Use Chrome ou Edge.'); return; }
    const rec = new SR();
    rec.lang = 'pt-BR'; rec.continuous = true; rec.interimResults = false;
    rec.onresult = (e: any) => {
      let t = '';
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) t += e.results[i][0].transcript + ' ';
      if (t) setTranscricaoText(prev => prev + t);
    };
    rec.onerror = () => setIsRecording(false);
    rec.onend = () => setIsRecording(false);
    rec.start(); recognitionRef.current = rec; setIsRecording(true); setRecTimer(0);
  };

  const stopRecording = () => { if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; } setIsRecording(false); };

  const insertTranscricao = () => {
    if (!transcricaoText.trim() || !editorRef.current) return;
    editorRef.current.focus();
    document.execCommand('insertText', false, '\n\n[Transcrição]\n' + transcricaoText);
    setTranscricaoText(''); setTranscricaoOpen(false);
  };

  // ── Receituário ──
  const inserirTemplateReceituario = (t: any) => {
    if (receituarioEditorRef.current) receituarioEditorRef.current.innerHTML = patient ? fillTemplate(t.content, patient) : t.content;
    setReceituarioType(t.type || 'Receita');
    setReceituarioTitle(t.name);
  };

  const handlePrintReceituario = () => {
    const content = receituarioEditorRef.current?.innerHTML || '';
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<html><head><title>${receituarioTitle || receituarioType}</title><style>body{font-family:Arial,sans-serif;max-width:680px;margin:40px auto;padding:24px;font-size:14px;line-height:1.7;color:#111}.meta{font-size:12px;color:#555;margin-bottom:24px;padding-bottom:12px;border-bottom:1px solid #ccc}h1{font-size:18px;margin-bottom:6px}</style></head><body><h1>${receituarioTitle || receituarioType}</h1><div class="meta">Paciente: ${patient?.name} &nbsp;|&nbsp; Data: ${format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}</div>${content}</body></html>`);
    win.document.close(); win.print();
  };

  const handleSalvarDocumento = () => {
    const content = receituarioEditorRef.current?.innerHTML?.trim() || '';
    if (!content) return;
    saveDocMut.mutate({ name: receituarioTitle || receituarioType, type: receituarioType, content });
  };

  // ── Computed ──
  const history = patient ? buildHistory(patient) : [];
  const age = calcAge(patient?.birthDate);
  const recTimerStr = `${String(Math.floor(recTimer / 60)).padStart(2, '0')}:${String(recTimer % 60).padStart(2, '0')}`;

  const filteredModelos = (docTemplates as any[]).filter(m => {
    const mf = modelosFilter === 'Todos' || m.type?.toLowerCase() === modelosFilter.toLowerCase() ||
      (modelosFilter === 'Outros' && !DOC_FILTER_TYPES.slice(1).some((f: string) => m.type?.toLowerCase() === f.toLowerCase()));
    const mb = !modelosBusca || m.name?.toLowerCase().includes(modelosBusca.toLowerCase()) || m.type?.toLowerCase().includes(modelosBusca.toLowerCase());
    return mf && mb;
  });

  const filteredReceituario = (docTemplates as any[]).filter(m => {
    const docTypes = ['receita', 'atestado', 'declaração', 'orientações', 'exames', 'outros', 'receita controlada', 'solicitação de exames'];
    const rf = receituarioFilter === 'Todos' || m.type?.toLowerCase() === receituarioFilter.toLowerCase();
    const rb = !receituarioBusca || m.name?.toLowerCase().includes(receituarioBusca.toLowerCase());
    const isDoc = docTypes.some(t => m.type?.toLowerCase() === t);
    return (rf || isDoc) && rb && isDoc;
  });

  const hasAlerts = patient && (patient.alergias || patient.medicamentos || patient.comorbidades || patient.alertaInterno);

  const actionBtn: React.CSSProperties = { height: 32, padding: '0 12px', background: '#FAFAFA', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 12, fontWeight: 500, color: '#71717A', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit', whiteSpace: 'nowrap' };

  if (isLoading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: '3px solid #E4E4E7', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 13, color: '#71717A' }}>Carregando prontuário...</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!patient) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <i className="ti ti-user-off" style={{ fontSize: 40, color: '#D4D4D8', display: 'block', marginBottom: 12 }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: '#191C1D', marginBottom: 6 }}>Paciente não encontrado</div>
          <button onClick={() => navigate('/patients')} style={{ height: 36, padding: '0 16px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Voltar para Pacientes</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes slideInRight { from{transform:translateX(100%)} to{transform:translateX(0)} }
        @keyframes slideInPanel { from{transform:translateX(100%)} to{transform:translateX(0)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        [contenteditable]:empty:before { content: attr(data-placeholder); color: #C4C4C4; pointer-events: none; font-style: italic; }
        [contenteditable] h3 { font-size: 14px; font-weight: 600; margin: 8px 0 4px; }
        [contenteditable] ul, [contenteditable] ol { padding-left: 20px; margin: 6px 0; }
        [contenteditable] li { margin: 2px 0; }
      `}</style>

      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'Inter', system-ui, sans-serif", background: '#F8F9FA' }}>

        {/* ── Top bar ── */}
        <div style={{ flexShrink: 0, background: '#FFFFFF', borderBottom: '1px solid #E4E4E7', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', gap: 16 }}>

          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <button onClick={() => navigate('/patients')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#71717A', padding: '2px 4px', borderRadius: 4, fontFamily: 'inherit' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#191C1D'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#71717A'}
            >Pacientes</button>
            <i className="ti ti-chevron-right" style={{ fontSize: 11, color: '#C4C4C4' }} />
            <button onClick={() => navigate(`/patients/${patientId}`)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#71717A', padding: '2px 4px', borderRadius: 4, fontFamily: 'inherit', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#191C1D'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#71717A'}
            >{patient.name}</button>
            <i className="ti ti-chevron-right" style={{ fontSize: 11, color: '#C4C4C4' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#191C1D' }}>Prontuário</span>
          </div>

          <div style={{ width: 1, height: 22, background: '#E4E4E7', flexShrink: 0 }} />

          {/* Patient info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#18181B', flexShrink: 0 }}>
              {patient.name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#191C1D', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {patient.name}
                {age !== null && <span style={{ fontSize: 12, fontWeight: 400, color: '#71717A', marginLeft: 8 }}>{age} anos</span>}
              </div>
              {patient.phone && (
                <div style={{ fontSize: 11, color: '#71717A' }}>{patient.phone}</div>
              )}
            </div>
            {hasAlerts && (
              <button onClick={() => setAlertsOpen(o => !o)}
                style={{ height: 24, padding: '0 8px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, fontSize: 10, fontWeight: 600, color: '#DC2626', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit', flexShrink: 0 }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: 11 }} /> Alertas clínicos
              </button>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
            {/* Consultation timer */}
            {!consultaAtiva ? (
              <button onClick={iniciarConsulta}
                style={{ ...actionBtn, background: '#000', color: '#FFF', border: 'none', borderRadius: 8 }}>
                <i className="ti ti-stethoscope" style={{ fontSize: 13 }} /> Iniciar consulta
              </button>
            ) : (
              <div style={{ ...actionBtn, background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0', cursor: 'default', userSelect: 'none' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', display: 'inline-block', animation: 'pulse 1s infinite', flexShrink: 0 }} />
                Atendimento · <span style={{ fontVariantNumeric: 'tabular-nums' }}>{consultaDur}</span>
              </div>
            )}

            <button onClick={() => { setModelosFilter('Todos'); setModelosOpen(true); }}
              style={actionBtn}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; (e.currentTarget as HTMLElement).style.color = '#191C1D'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#FAFAFA'; (e.currentTarget as HTMLElement).style.color = '#71717A'; }}>
              <i className="ti ti-file-text" style={{ fontSize: 13 }} /> Modelos
            </button>

            <button onClick={() => { setReceituarioTitle(''); setReceituarioType('Receita'); setReceituarioFilter('Todos'); setReceituarioBusca(''); setReceituarioOpen(true); }}
              style={actionBtn}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; (e.currentTarget as HTMLElement).style.color = '#191C1D'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#FAFAFA'; (e.currentTarget as HTMLElement).style.color = '#71717A'; }}>
              <i className="ti ti-prescription" style={{ fontSize: 13 }} /> Receituário
            </button>
          </div>
        </div>

        {/* ── Clinical alerts strip ── */}
        {hasAlerts && alertsOpen && (
          <div style={{ flexShrink: 0, background: '#FFFBEB', borderBottom: '1px solid #FDE68A', padding: '8px 24px', display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: 13, color: '#D97706', flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '.04em' }}>Alertas clínicos</span>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', flex: 1 }}>
              {patient.alergias && (
                <div style={{ fontSize: 12, color: '#92400E' }}>
                  <span style={{ fontWeight: 600 }}>Alergias: </span>{patient.alergias}
                </div>
              )}
              {patient.medicamentos && (
                <div style={{ fontSize: 12, color: '#92400E' }}>
                  <span style={{ fontWeight: 600 }}>Medicamentos: </span>{patient.medicamentos}
                </div>
              )}
              {patient.comorbidades && (
                <div style={{ fontSize: 12, color: '#92400E' }}>
                  <span style={{ fontWeight: 600 }}>Comorbidades: </span>{patient.comorbidades}
                </div>
              )}
              {patient.alertaInterno && (
                <div style={{ fontSize: 12, color: '#92400E' }}>
                  <span style={{ fontWeight: 600 }}>Alerta: </span>{patient.alertaInterno}
                </div>
              )}
            </div>
            <button onClick={() => setAlertsOpen(false)}
              style={{ width: 22, height: 22, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D97706', flexShrink: 0 }}>
              <i className="ti ti-x" style={{ fontSize: 12 }} />
            </button>
          </div>
        )}

        {/* ── Content area ── */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

          {/* ── Editor column ── */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '20px 24px 16px' }}>

            {/* Editor container */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', border: '1px solid #E4E4E7', borderRadius: 12, overflow: 'hidden', background: '#FFFFFF' }}>

              {/* Toolbar */}
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2, padding: '6px 10px', borderBottom: '1px solid #F1F3F5', background: '#FAFAFA', flexWrap: 'wrap' }}>
                <ToolBtn icon="ti-bold"             title="Negrito"              onClick={() => exec('bold')} />
                <ToolBtn icon="ti-italic"           title="Itálico"              onClick={() => exec('italic')} />
                <ToolBtn icon="ti-underline"        title="Sublinhado"           onClick={() => exec('underline')} />
                <div style={{ width: 1, height: 16, background: '#E4E4E7', margin: '0 4px' }} />
                <ToolBtn icon="ti-list"             title="Lista"                onClick={() => exec('insertUnorderedList')} />
                <ToolBtn icon="ti-list-numbers"     title="Lista numerada"       onClick={() => exec('insertOrderedList')} />
                <ToolBtn icon="ti-heading"          title="Título"               onClick={() => exec('formatBlock', '<h3>')} />
                <div style={{ width: 1, height: 16, background: '#E4E4E7', margin: '0 4px' }} />
                <ToolBtn icon="ti-arrow-back-up"    title="Desfazer"             onClick={() => exec('undo')} />
                <ToolBtn icon="ti-arrow-forward-up" title="Refazer"              onClick={() => exec('redo')} />
                <ToolBtn icon="ti-clear-formatting" title="Limpar formatação"    onClick={() => exec('removeFormat')} />
                <div style={{ flex: 1 }} />
                <button
                  onClick={() => {
                    const soap = `<h3>S — Subjetivo</h3><p>Queixas e sintomas relatados pelo paciente:</p><br><h3>O — Objetivo</h3><p>Dados observados: exame físico, sinais vitais, exames:</p><br><h3>A — Avaliação</h3><p>Impressão diagnóstica e avaliação clínica:</p><br><h3>P — Plano</h3><p>Conduta, prescrição e orientações:</p>`;
                    if (editorRef.current) {
                      const hasContent = !!editorRef.current.innerHTML?.trim();
                      if (!hasContent) { editorRef.current.innerHTML = soap; }
                      else if (window.confirm('Substituir conteúdo pelo template SOAP?')) { editorRef.current.innerHTML = soap; }
                      editorRef.current.focus();
                    }
                  }}
                  title="Inserir template SOAP (Subjetivo, Objetivo, Avaliação, Plano)"
                  style={{ height: 26, padding: '0 10px', border: '1px solid #7C3AED33', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#7C3AED', background: '#F5F3FF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
                  <i className="ti ti-template" style={{ fontSize: 12 }} /> SOAP
                </button>
                <button onClick={() => setTranscricaoOpen(o => !o)} title="Transcrição de áudio"
                  style={{ height: 26, padding: '0 10px', border: transcricaoOpen ? '1px solid #2563EB' : '1px solid #E4E4E7', borderRadius: 6, fontSize: 11, fontWeight: 500, color: transcricaoOpen ? '#2563EB' : '#71717A', background: transcricaoOpen ? '#EFF6FF' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
                  <i className="ti ti-microphone" style={{ fontSize: 12 }} /> Áudio
                </button>
              </div>

              {/* Editor */}
              <div ref={editorRef} contentEditable suppressContentEditableWarning
                data-placeholder="Digite aqui as queixas relatadas pelo paciente, evolução clínica, observações, conduta, orientações e próximos passos..."
                style={{ flex: 1, padding: '16px 20px', outline: 'none', fontSize: 14, color: '#191C1D', lineHeight: 1.8, fontFamily: "'Inter', system-ui, sans-serif", overflowY: 'auto' }} />

              {/* Transcription panel */}
              {transcricaoOpen && (
                <div style={{ flexShrink: 0, borderTop: '1px solid #F1F3F5', padding: '14px 16px', background: '#FAFAFA' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#71717A', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Transcrição de áudio</div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    {!isRecording ? (
                      <button onClick={startRecording} style={{ height: 28, padding: '0 10px', background: '#000', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
                        <i className="ti ti-microphone" style={{ fontSize: 12 }} /> Gravar
                      </button>
                    ) : (
                      <>
                        <button onClick={stopRecording} style={{ height: 28, padding: '0 10px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#DC2626', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
                          <i className="ti ti-player-stop" style={{ fontSize: 12 }} /> Parar
                        </button>
                        <span style={{ fontSize: 11, color: '#DC2626', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444', display: 'inline-block', animation: 'pulse 1s infinite' }} />
                          {recTimerStr}
                        </span>
                      </>
                    )}
                    <button onClick={() => audioFileRef.current?.click()}
                      style={{ height: 28, padding: '0 10px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 6, fontSize: 11, color: '#71717A', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
                      <i className="ti ti-upload" style={{ fontSize: 12 }} /> {audioFileName ? audioFileName.slice(0, 16) + '…' : 'Enviar áudio'}
                    </button>
                    <input ref={audioFileRef} type="file" accept="audio/*" onChange={e => { const f = e.target.files?.[0]; if (f) setAudioFileName(f.name); }} style={{ display: 'none' }} />
                  </div>
                  <textarea value={transcricaoText} onChange={e => setTranscricaoText(e.target.value)}
                    placeholder="O texto transcrito aparecerá aqui..."
                    style={{ width: '100%', minHeight: 72, padding: '8px 12px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, color: '#191C1D', background: '#FFFFFF', fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                    <button onClick={insertTranscricao} disabled={!transcricaoText.trim()}
                      style={{ height: 30, padding: '0 14px', background: transcricaoText.trim() ? '#000' : '#E4E4E7', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, color: transcricaoText.trim() ? '#FFF' : '#A1A1AA', cursor: transcricaoText.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <i className="ti ti-corner-down-left" style={{ fontSize: 12 }} /> Inserir no texto
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div style={{ flexShrink: 0, display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', paddingTop: 12, flexWrap: 'wrap' }}>
              <button onClick={() => {
                if (consultaAtiva) { setConfirmCancelOpen(true); }
                else { if (editorRef.current) editorRef.current.innerHTML = ''; }
              }}
                style={{ height: 36, padding: '0 14px', background: 'transparent', border: '1px solid #E4E4E7', borderRadius: 20, fontSize: 13, fontWeight: 500, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancelar
              </button>
              <button onClick={() => { const c = editorRef.current?.innerHTML?.trim(); if (c) saveMut.mutate(c); }} disabled={saveMut.isPending}
                style={{ height: 36, padding: '0 14px', background: 'transparent', border: '1px solid #E4E4E7', borderRadius: 20, fontSize: 13, fontWeight: 500, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit' }}>
                Salvar rascunho
              </button>
              <button onClick={() => { setReceituarioTitle(''); setReceituarioType('Receita'); setReceituarioFilter('Todos'); setReceituarioBusca(''); setReceituarioOpen(true); }}
                style={{ height: 36, padding: '0 14px', background: 'transparent', border: '1px solid #E4E4E7', borderRadius: 20, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                <i className="ti ti-prescription" style={{ fontSize: 13 }} /> Receituário
              </button>
              <button
                onClick={() => { const c = editorRef.current?.innerHTML?.trim(); if (c) setConfirmFinalizarEv(true); }}
                disabled={saveMut.isPending}
                style={{ height: 36, padding: '0 18px', background: saveMut.isPending ? '#A1A1AA' : '#000', border: 'none', borderRadius: 20, fontSize: 13, fontWeight: 600, color: '#FFF', cursor: saveMut.isPending ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                {saveMut.isPending
                  ? <><div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Salvando...</>
                  : <><i className="ti ti-check" style={{ fontSize: 14 }} /> Finalizar evolução</>
                }
              </button>
            </div>
          </div>

          {/* ── History sidebar ── */}
          <div style={{ width: 320, flexShrink: 0, borderLeft: '1px solid #E4E4E7', background: '#FFFFFF', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flexShrink: 0, padding: '16px 16px 12px', borderBottom: '1px solid #F1F3F5' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#191C1D' }}>Histórico clínico</div>
              <div style={{ fontSize: 11, color: '#A1A1AA', marginTop: 2 }}>{history.length} registro{history.length !== 1 ? 's' : ''}</div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
              {history.length === 0 ? (
                <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                  <i className="ti ti-clock" style={{ fontSize: 32, color: '#E4E4E7', display: 'block', marginBottom: 10 }} />
                  <div style={{ fontSize: 12, color: '#A1A1AA' }}>Nenhum registro clínico</div>
                </div>
              ) : history.map((item, i) => {
                const st = item.status ? HISTORY_STATUS[item.status] : null;
                const isActive = historyItem?.id === item.id;
                return (
                  <button key={item.id} onClick={() => setHistoryItem(isActive ? null : item)}
                    style={{ width: '100%', padding: '10px 14px', background: isActive ? '#F0F9FF' : 'transparent', border: 'none', borderLeft: isActive ? '2px solid #2563EB' : '2px solid transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', borderBottom: i < history.length - 1 ? '1px solid #F4F4F5' : 'none', display: 'block' }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '#F9F9F9'; }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: item.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                        <i className={`ti ${item.icon}`} style={{ fontSize: 13, color: item.iconColor }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#191C1D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.tipo}</span>
                          {st && <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: st.bg, color: st.color, flexShrink: 0 }}>{st.label}</span>}
                        </div>
                        <div style={{ fontSize: 11, color: '#A1A1AA', marginBottom: 2 }}>
                          {format(item.date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </div>
                        <div style={{ fontSize: 12, color: '#71717A', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {item.resumo || '—'}
                        </div>
                      </div>
                      <i className="ti ti-chevron-right" style={{ fontSize: 11, color: '#A1A1AA', marginTop: 6, flexShrink: 0 }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Modal: Confirmar finalizar evolução ── */}
      {confirmFinalizarEv && (
        <>
          <div onClick={() => setConfirmFinalizarEv(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 500, backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#FFFFFF', borderRadius: 16, padding: '28px 32px', width: 400, zIndex: 501, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: "'Inter', system-ui, sans-serif" }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <i className="ti ti-notes-medical" style={{ fontSize: 20, color: '#16A34A' }} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#191C1D', textAlign: 'center', marginBottom: 8 }}>Finalizar evolução?</div>
            <div style={{ fontSize: 13, color: '#71717A', textAlign: 'center', lineHeight: 1.6, marginBottom: 8 }}>
              Esta evolução será salva e comporá o histórico clínico do paciente.
            </div>
            <div style={{ fontSize: 12, color: '#A1A1AA', textAlign: 'center', marginBottom: 24 }}>
              Esta ação não poderá ser desfeita.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmFinalizarEv(false)} style={{ flex: 1, height: 38, background: '#F4F4F5', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 500, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={() => { setConfirmFinalizarEv(false); finalizarEvolucao(); }} style={{ flex: 1, height: 38, background: '#000', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#FFF', cursor: 'pointer', fontFamily: 'inherit' }}>
                Finalizar evolução
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Modal: Deseja registrar uma venda? ── */}
      {postVendaOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 900, backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#FFFFFF', borderRadius: 16, padding: '32px 36px', width: 420, zIndex: 901, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: "'Inter', system-ui, sans-serif" }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
              <i className="ti ti-receipt" style={{ fontSize: 24, color: '#16A34A' }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#191C1D', textAlign: 'center', marginBottom: 8 }}>Evolução finalizada!</div>
            <div style={{ fontSize: 13, color: '#71717A', textAlign: 'center', lineHeight: 1.6, marginBottom: 28 }}>
              Deseja registrar uma venda ou orçamento para este atendimento?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => { setPostVendaOpen(false); setVendaModalOpen(true); }}
                style={{ height: 42, background: '#000', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#FFF', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                <i className="ti ti-shopping-cart" style={{ fontSize: 15 }} /> Sim, registrar venda
              </button>
              <button
                onClick={() => { setPostVendaOpen(false); navigate(`/patients/${patientId}`); }}
                style={{ height: 42, background: '#F4F4F5', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                Não, voltar para o contato
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Modal: Cancelar com timer ativo ── */}
      {confirmCancelOpen && (
        <>
          <div onClick={() => setConfirmCancelOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 900, backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#FFFFFF', borderRadius: 16, padding: '28px 32px', width: 400, zIndex: 901, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: "'Inter', system-ui, sans-serif" }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: 20, color: '#D97706' }} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#191C1D', textAlign: 'center', marginBottom: 8 }}>Consulta em andamento</div>
            <div style={{ fontSize: 13, color: '#71717A', textAlign: 'center', lineHeight: 1.5, marginBottom: 24 }}>
              O que deseja fazer com a evolução não salva?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => {
                  setConfirmCancelOpen(false);
                  const content = editorRef.current?.innerHTML?.trim();
                  if (content) saveMut.mutate(content);
                  setConsultaAtiva(false); setConsultaStart(null); setConsultaDur('00:00:00');
                  navigate(`/patients/${patientId}`);
                }}
                style={{ height: 40, background: '#000', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#FFF', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <i className="ti ti-device-floppy" style={{ fontSize: 14 }} /> Salvar rascunho e sair
              </button>
              <button
                onClick={() => {
                  setConfirmCancelOpen(false);
                  if (editorRef.current) editorRef.current.innerHTML = '';
                  setConsultaAtiva(false); setConsultaStart(null); setConsultaDur('00:00:00');
                  navigate(`/patients/${patientId}`);
                }}
                style={{ height: 40, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 13, fontWeight: 500, color: '#DC2626', cursor: 'pointer', fontFamily: 'inherit' }}>
                Sair sem salvar
              </button>
              <button onClick={() => setConfirmCancelOpen(false)}
                style={{ height: 36, background: 'transparent', border: '1px solid #E4E4E7', borderRadius: 10, fontSize: 13, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit' }}>
                Continuar editando
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Modal: Conflito de conteúdo ── */}
      {insertConflict && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 600, backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#FFFFFF', borderRadius: 16, padding: '28px 32px', width: 400, zIndex: 601, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: "'Inter', system-ui, sans-serif" }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: 20, color: '#D97706' }} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#191C1D', textAlign: 'center', marginBottom: 8 }}>Já existe conteúdo na evolução</div>
            <div style={{ fontSize: 13, color: '#71717A', textAlign: 'center', lineHeight: 1.5, marginBottom: 24 }}>O que deseja fazer com o conteúdo do modelo?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => { insertModeloNoEditor(pendingContent, 'replace'); setInsertConflict(false); setPendingContent(''); }}
                style={{ height: 40, background: '#000', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#FFF', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <i className="ti ti-replace" style={{ fontSize: 14 }} /> Substituir conteúdo atual
              </button>
              <button onClick={() => { insertModeloNoEditor(pendingContent, 'append'); setInsertConflict(false); setPendingContent(''); }}
                style={{ height: 40, background: '#F4F4F5', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 500, color: '#191C1D', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <i className="ti ti-arrow-bar-down" style={{ fontSize: 14 }} /> Inserir no final
              </button>
              <button onClick={() => { setInsertConflict(false); setPendingContent(''); }}
                style={{ height: 36, background: 'transparent', border: '1px solid #E4E4E7', borderRadius: 10, fontSize: 13, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── History item panel ── */}
      {historyItem && (() => {
        const item = historyItem;
        const st = item.status ? HISTORY_STATUS[item.status] : null;
        const isEvolution = item.tipo === 'Evolução';
        const rendered = item.docContent || item.fullContent || '';

        const printItem = () => {
          const win = window.open('', '_blank');
          if (!win) return;
          const title = item.docName || item.tipo;
          win.document.write(`<html><head><title>${title}</title><style>body{font-family:Inter,system-ui,sans-serif;max-width:700px;margin:40px auto;color:#191C1D;line-height:1.7}h1{font-size:18px;font-weight:700;margin-bottom:4px}.meta{font-size:12px;color:#71717A;margin-bottom:24px;padding-bottom:12px;border-bottom:1px solid #E4E4E7}@media print{body{margin:20px}}</style></head><body><h1>${title}</h1><div class="meta">Paciente: ${patient?.name} · ${format(item.date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</div>${rendered || `<p>${item.resumo}</p>`}</body></html>`);
          win.document.close();
          setTimeout(() => win.print(), 400);
        };

        return (
          <>
            <div onClick={() => setHistoryItem(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 800, backdropFilter: 'blur(2px)', animation: 'fadeIn .15s ease' }} />
            <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 480, background: '#FFFFFF', zIndex: 801, display: 'flex', flexDirection: 'column', boxShadow: '-16px 0 60px rgba(0,0,0,0.14)', fontFamily: "'Inter', system-ui, sans-serif", animation: 'slideInPanel .22s cubic-bezier(0.32,0.72,0,1)' }}>
              <div style={{ flexShrink: 0, padding: '18px 22px', borderBottom: '1px solid #E4E4E7', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: item.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className={`ti ${item.icon}`} style={{ fontSize: 16, color: item.iconColor }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#09090B' }}>{item.docName || item.tipo}</div>
                    <div style={{ fontSize: 12, color: '#71717A', marginTop: 3 }}>{format(item.date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</div>
                    {st && <span style={{ display: 'inline-block', marginTop: 6, fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: st.bg, color: st.color }}>{st.label}</span>}
                  </div>
                </div>
                <button onClick={() => setHistoryItem(null)} style={{ width: 32, height: 32, border: 'none', background: '#F4F4F5', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A', flexShrink: 0 }}>
                  <i className="ti ti-x" style={{ fontSize: 14 }} />
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', minHeight: 0 }}>
                {rendered ? (
                  <div dangerouslySetInnerHTML={{ __html: rendered }} style={{ fontSize: 13, color: '#191C1D', lineHeight: 1.75 }} />
                ) : (
                  <div style={{ fontSize: 13, color: '#71717A', lineHeight: 1.7 }}>{item.resumo || '—'}</div>
                )}
              </div>
              <div style={{ flexShrink: 0, padding: '14px 22px', borderTop: '1px solid #E4E4E7', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                {isEvolution && (
                  <button onClick={() => { if (editorRef.current && item.fullContent) { editorRef.current.innerHTML = item.fullContent; editorRef.current.focus(); } setHistoryItem(null); }}
                    style={{ height: 34, padding: '0 14px', background: '#F4F4F5', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <i className="ti ti-pencil" style={{ fontSize: 13 }} /> Continuar edição
                  </button>
                )}
                <button onClick={printItem}
                  style={{ height: 34, padding: '0 14px', background: '#F4F4F5', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="ti ti-printer" style={{ fontSize: 13 }} /> Imprimir
                </button>
                <button onClick={() => setHistoryItem(null)} style={{ height: 34, padding: '0 14px', background: '#000', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#FFF', cursor: 'pointer', fontFamily: 'inherit' }}>Fechar</button>
              </div>
            </div>
          </>
        );
      })()}

      {/* ── Modelos drawer ── */}
      {modelosOpen && (
        <>
          <div onClick={() => { setModelosOpen(false); setModelosBusca(''); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 500, backdropFilter: 'blur(3px)' }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 520, background: '#F8F9FA', zIndex: 501, display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 60px rgba(0,0,0,.16)', fontFamily: "'Inter', system-ui, sans-serif", animation: 'slideInRight .25s cubic-bezier(0.32,0.72,0,1)' }}>
            <div style={{ flexShrink: 0, background: '#FFFFFF', borderBottom: '1px solid #E5E7EB', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#191C1D' }}>Modelos de evolução</div>
                <div style={{ fontSize: 12, color: '#71717A', marginTop: 2 }}>Selecione um modelo para inserir na evolução.</div>
              </div>
              <button onClick={() => { setModelosOpen(false); setModelosBusca(''); }}
                style={{ width: 32, height: 32, border: 'none', background: '#F4F4F5', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A' }}>
                <i className="ti ti-x" style={{ fontSize: 14 }} />
              </button>
            </div>
            <div style={{ flexShrink: 0, padding: '14px 24px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, padding: '0 12px', height: 36, marginBottom: 10 }}>
                <i className="ti ti-search" style={{ fontSize: 14, color: '#A1A1AA' }} />
                <input value={modelosBusca} onChange={e => setModelosBusca(e.target.value)} placeholder="Buscar modelo..."
                  style={{ border: 'none', background: 'transparent', fontSize: 13, outline: 'none', width: '100%', color: '#191C1D', fontFamily: 'inherit' }} />
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', paddingBottom: 4 }}>
                {DOC_FILTER_TYPES.map(f => (
                  <button key={f} onClick={() => setModelosFilter(f)}
                    style={{ height: 26, padding: '0 10px', borderRadius: 99, fontSize: 11, fontWeight: modelosFilter === f ? 600 : 400, background: modelosFilter === f ? '#000' : '#FFFFFF', color: modelosFilter === f ? '#FFF' : '#71717A', border: modelosFilter === f ? 'none' : '1px solid #E4E4E7', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 24px 24px' }}>
              {filteredModelos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0' }}>
                  <i className="ti ti-file-off" style={{ fontSize: 32, color: '#E4E4E7', display: 'block', marginBottom: 12 }} />
                  <div style={{ fontSize: 13, color: '#A1A1AA', marginBottom: 6 }}>{(docTemplates as any[]).length === 0 ? 'Nenhum modelo cadastrado.' : 'Nenhum modelo encontrado.'}</div>
                  {(docTemplates as any[]).length === 0 && <div style={{ fontSize: 12, color: '#C4C4C4' }}>Acesse <strong>Configurações → Prontuário → Modelos de evolução</strong>.</div>}
                </div>
              ) : filteredModelos.map((m: any) => (
                <div key={m.id}
                  style={{ width: '100%', padding: '14px 16px', marginBottom: 8, background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 12, display: 'flex', alignItems: 'flex-start', gap: 14, transition: 'border-color 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#000'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#E4E4E7'; }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className="ti ti-file-description" style={{ fontSize: 17, color: '#71717A' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#191C1D', marginBottom: 3 }}>{m.name}</div>
                    {m.description && <div style={{ fontSize: 11, color: '#71717A', marginBottom: 6, lineHeight: 1.4 }}>{m.description}</div>}
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 99, background: '#F4F4F5', color: '#71717A' }}>{m.type}</span>
                  </div>
                  <button onClick={() => abrirModelo(m)}
                    style={{ height: 32, padding: '0 14px', background: '#000', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#FFF', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                    <i className="ti ti-pencil" style={{ fontSize: 12 }} /> Inserir
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Nova venda modal ── */}
      {vendaModalOpen && patient && (
        <NovaVendaModal
          onClose={() => setVendaModalOpen(false)}
          onSuccess={() => { setVendaModalOpen(false); navigate(`/patients/${patientId}`); }}
          prefilledPatientId={patientId}
          prefilledPatientName={patient.name}
        />
      )}

      {/* ── Receituário full-screen overlay ── */}
      {receituarioOpen && (
        <div style={{ position: 'fixed', inset: 0, background: '#F8F9FA', zIndex: 900, display: 'flex', flexDirection: 'column', fontFamily: "'Inter', system-ui, sans-serif", animation: 'fadeIn .18s ease' }}>
          <div style={{ flexShrink: 0, background: '#FFFFFF', borderBottom: '1px solid #E4E4E7', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <button onClick={() => setReceituarioOpen(false)}
              style={{ height: 32, padding: '0 12px', background: 'transparent', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 12, fontWeight: 500, color: '#71717A', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}>
              <i className="ti ti-arrow-left" style={{ fontSize: 13 }} /> Voltar
            </button>
            <div style={{ width: 1, height: 20, background: '#E4E4E7' }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#191C1D' }}>Receituário</div>
              <div style={{ fontSize: 11, color: '#71717A' }}>Receitas, solicitações, atestados e documentos para o paciente.</div>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 12, color: '#71717A', textAlign: 'right' }}>
              <div style={{ fontWeight: 500, color: '#191C1D' }}>{patient.name}</div>
              <div>{format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}</div>
            </div>
            {saveDocOk && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#16A34A', fontWeight: 500, background: '#DCFCE7', padding: '6px 12px', borderRadius: 8 }}>
                <i className="ti ti-circle-check" style={{ fontSize: 14 }} /> Salvo no paciente
              </div>
            )}
            <button onClick={() => setReceituarioOpen(false)}
              style={{ width: 32, height: 32, border: 'none', background: '#F4F4F5', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A' }}>
              <i className="ti ti-x" style={{ fontSize: 14 }} />
            </button>
          </div>

          <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
            {/* Template list */}
            <div style={{ width: 300, flexShrink: 0, background: '#FFFFFF', borderRight: '1px solid #E4E4E7', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ flexShrink: 0, padding: '14px 16px', borderBottom: '1px solid #E4E4E7' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Modelos de receituário</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F4F4F5', borderRadius: 7, padding: '0 10px', height: 32, marginBottom: 8 }}>
                  <i className="ti ti-search" style={{ fontSize: 13, color: '#A1A1AA' }} />
                  <input value={receituarioBusca} onChange={e => setReceituarioBusca(e.target.value)} placeholder="Buscar..."
                    style={{ border: 'none', background: 'transparent', fontSize: 12, outline: 'none', width: '100%', color: '#191C1D', fontFamily: 'inherit' }} />
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {RECEITUARIO_FILTER.map(f => (
                    <button key={f} onClick={() => setReceituarioFilter(f)}
                      style={{ height: 22, padding: '0 8px', borderRadius: 99, fontSize: 10, fontWeight: receituarioFilter === f ? 600 : 400, background: receituarioFilter === f ? '#000' : '#F4F4F5', color: receituarioFilter === f ? '#FFF' : '#71717A', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                {/* New document types */}
                <div style={{ padding: '8px 8px 4px', fontSize: 10, fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.06em' }}>Novo documento</div>
                {['Receita', 'Receita controlada', 'Solicitação de exames', 'Atestado', 'Declaração', 'Orientações', 'Plano terapêutico', 'Outro'].map(t => (
                  <button key={t} onClick={() => { setReceituarioType(t); setReceituarioTitle(t); if (receituarioEditorRef.current) receituarioEditorRef.current.innerHTML = ''; }}
                    style={{ width: '100%', padding: '8px 12px', marginBottom: 3, background: receituarioType === t && !receituarioEditorRef.current?.innerHTML ? '#F4F4F5' : 'transparent', border: '1px solid #E4E4E7', borderRadius: 7, textAlign: 'left', fontSize: 12, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F9F9F9'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                    <i className="ti ti-file-plus" style={{ fontSize: 12, color: '#A1A1AA' }} /> {t}
                  </button>
                ))}
                {filteredReceituario.length > 0 && (
                  <>
                    <div style={{ padding: '12px 8px 4px', fontSize: 10, fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.06em' }}>Modelos salvos</div>
                    {filteredReceituario.map((m: any) => (
                      <button key={m.id} onClick={() => inserirTemplateReceituario(m)}
                        style={{ width: '100%', padding: '8px 12px', marginBottom: 3, background: 'transparent', border: '1px solid #E4E4E7', borderRadius: 7, textAlign: 'left', fontSize: 12, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', display: 'block' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F9F9F9'; (e.currentTarget as HTMLElement).style.borderColor = '#000'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderColor = '#E4E4E7'; }}>
                        <div style={{ fontWeight: 500 }}>{m.name}</div>
                        <div style={{ fontSize: 10, color: '#A1A1AA', marginTop: 1 }}>{m.type}</div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* Document editor */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '20px 24px' }}>
              <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                <input value={receituarioTitle} onChange={e => setReceituarioTitle(e.target.value)} placeholder="Título do documento..."
                  style={{ flex: 1, height: 38, padding: '0 14px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#191C1D', background: '#FFFFFF', outline: 'none', fontFamily: 'inherit' }} />
                <select value={receituarioType} onChange={e => setReceituarioType(e.target.value)}
                  style={{ height: 38, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, color: '#374151', background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {['Receita', 'Receita controlada', 'Solicitação de exames', 'Atestado', 'Declaração', 'Orientações', 'Plano terapêutico', 'Outro'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', border: '1px solid #E4E4E7', borderRadius: 12, overflow: 'hidden', background: '#FFFFFF' }}>
                <div style={{ flexShrink: 0, display: 'flex', gap: 2, padding: '6px 10px', borderBottom: '1px solid #F1F3F5', background: '#FAFAFA' }}>
                  {[['ti-bold','bold'],['ti-italic','italic'],['ti-underline','underline']].map(([icon, cmd]) => (
                    <button key={cmd} type="button" onClick={() => { receituarioEditorRef.current?.focus(); document.execCommand(cmd, false); }}
                      style={{ width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A' }}>
                      <i className={`ti ${icon}`} style={{ fontSize: 14 }} />
                    </button>
                  ))}
                </div>
                <div ref={receituarioEditorRef} contentEditable suppressContentEditableWarning
                  data-placeholder="Digite o conteúdo do documento..."
                  style={{ flex: 1, padding: '16px 20px', outline: 'none', fontSize: 14, color: '#191C1D', lineHeight: 1.8, fontFamily: "'Inter', system-ui, sans-serif", overflowY: 'auto' }} />
              </div>
              <div style={{ flexShrink: 0, display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 14 }}>
                <button onClick={handlePrintReceituario}
                  style={{ height: 36, padding: '0 16px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="ti ti-printer" style={{ fontSize: 13 }} /> Imprimir
                </button>
                <button onClick={handleSalvarDocumento} disabled={saveDocMut.isPending}
                  style={{ height: 36, padding: '0 16px', background: saveDocMut.isPending ? '#A1A1AA' : '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#FFF', cursor: saveDocMut.isPending ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                  {saveDocMut.isPending
                    ? <><div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Salvando...</>
                    : <><i className="ti ti-device-floppy" style={{ fontSize: 13 }} /> Salvar no paciente</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
