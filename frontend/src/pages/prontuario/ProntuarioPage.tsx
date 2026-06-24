import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useNavigationGuard } from '../../contexts/NavigationGuardContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { patientsApi, prontuarioApi } from '../../services/api';
import { NovaVendaModal } from '../../components/NovaVendaModal';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '../../components/ui/Toast';
import { Portal } from '../../components/ui/Portal';
import { SectionLoader } from '../../components/ui/Loader';

// ─── Types ────────────────────────────────────────────────────────────────────

type HistoryItem = {
  id: string; date: Date; tipo: string;
  profissional: string; resumo: string; status?: string;
  icon: string; iconColor: string; iconBg: string;
  docContent?: string; docName?: string; docType?: string;
  fullContent?: string;
  isDocument?: boolean;
};

const HISTORY_STATUS: Record<string, { label: string; bg: string; color: string }> = {
  finalizado: { label: 'Finalizado', bg: '#DCFCE7', color: '#16A34A' },
  enviada:    { label: 'Enviada',    bg: '#EFF6FF', color: '#2563EB' },
  rascunho:   { label: 'Rascunho',   bg: '#F4F4F5', color: '#71717A' },
  salvo:      { label: 'Salvo',      bg: '#F0FDFA', color: '#0D9488' },
};

const DOC_FILTER_TYPES = ['Todos', 'Evolução', 'Prescrição', 'Receita', 'Exames', 'Atestado', 'Declaração', 'Orientação', 'Termo', 'Outros'];
const RECEITUARIO_FILTER = ['Todos', 'Receita', 'Atestado', 'Declaração', 'Orientações', 'Exames', 'Outros'];
void RECEITUARIO_FILTER;

const DEFAULT_PRINT_PARAMS = {
  layout: 'padrao' as 'padrao' | 'sem_cabecalho',
  showHeader:      true,
  showDate:        true,
  showPatientName: true,
  showCPF:         false,
  showPhone:       false,
  showAddress:     false,
  showStamp:       true,
  stampAllPages:   false,
  showQRCode:      false,
  showPageNumber:  false,
  marginTop:       '1.0',
  marginBottom:    '1.0',
  marginLeft:      '1.5',
  marginRight:     '1.5',
  paperSize:       'A4',
  orientation:     'retrato' as 'retrato' | 'paisagem',
};
type PrintParams = typeof DEFAULT_PRINT_PARAMS;

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

function buildDocPreviewHTML(
  params: PrintParams,
  content: string,
  title: string,
  patient: any,
  user: any,
  docHdr: { header?: string; footer?: string },
  logo: string,
): string {
  const clinic = user?.clinic;
  const today  = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  let headerBlock = '';
  if (params.showHeader && params.layout !== 'sem_cabecalho') {
    const clinicLines = docHdr.header
      ? docHdr.header.replace(/\n/g, '<br>')
      : [clinic?.name, clinic?.address, clinic?.phone, clinic?.email, clinic?.cnpj].filter(Boolean).join(' · ');
    headerBlock = `<div style="display:flex;align-items:center;gap:16px;padding-bottom:14px;border-bottom:2px solid #191C1D;margin-bottom:20px">
      ${logo ? `<img src="${logo}" style="max-height:52px;max-width:140px;object-fit:contain" />` : ''}
      <div style="font-size:12px;color:#374151;line-height:1.5">${clinicLines || ''}</div>
    </div>`;
  }

  const metaItems: string[] = [];
  if (params.showPatientName && patient?.name) metaItems.push(`Paciente: <strong>${patient.name}</strong>`);
  if (params.showDate) metaItems.push(`Data: ${today}`);
  if (params.showCPF   && patient?.cpf)    metaItems.push(`CPF: ${patient.cpf}`);
  if (params.showPhone && patient?.phone)  metaItems.push(`Tel: ${patient.phone}`);
  if (params.showAddress && (patient?.address || patient?.city))
    metaItems.push(`Endereço: ${[patient.address, patient.city].filter(Boolean).join(', ')}`);

  const metaBlock = metaItems.length
    ? `<div style="font-size:11.5px;color:#71717A;margin:0 0 20px;padding:10px 14px;background:#F9F9F9;border-radius:6px;border-left:3px solid #E4E4E7">${metaItems.join('&nbsp; · &nbsp;')}</div>`
    : '';

  const sigBlock = params.showStamp
    ? `<div style="margin-top:48px;text-align:center;font-size:12px;color:#374151">
        <div style="border-top:1px solid #374151;width:200px;margin:0 auto 6px"></div>
        <div>${user?.name || 'Profissional'}</div>
       </div>`
    : '';

  const footerBlock = (params.showHeader && params.layout !== 'sem_cabecalho' && docHdr.footer)
    ? `<div style="margin-top:32px;padding-top:12px;border-top:1px solid #E4E4E7;font-size:11px;color:#9CA3AF;text-align:center">${docHdr.footer.replace(/\n/g, '<br>')}</div>`
    : '';

  return `${headerBlock}<h2 style="font-size:16px;font-weight:700;margin:0 0 8px;color:#191C1D">${title}</h2>${metaBlock}<div style="font-size:13.5px;line-height:1.75;color:#191C1D">${content}</div>${sigBlock}${footerBlock}`;
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
      tipo: d.name || d.type || 'Documento',
      profissional: d.professional || profName,
      resumo: d.type || 'Documento',
      status: 'salvo',
      icon: 'ti-file-text', iconColor: '#0D9488', iconBg: '#F0FDFA',
      docContent: d.content, docName: d.name, docType: d.type,
      isDocument: true,
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
  const { isDirty, setIsDirty, requestNavigate, pendingNavPath, proceedNavigation, cancelNavigation } = useNavigationGuard();
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
  const [receituarioCriarModeloOpen, setReceituarioCriarModeloOpen] = useState(false);
  const [receituarioCriarModeloForm, setReceituarioCriarModeloForm] = useState({ name: '', type: 'Receita' });
  const [saveAsModelOpen, setSaveAsModelOpen]   = useState(false);
  const [saveAsModelName, setSaveAsModelName]   = useState('');
  const [receituarioCloseConfirm, setReceituarioCloseConfirm]       = useState(false);
  const [printParamsOpen, setPrintParamsOpen]   = useState(false);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [printParams, setPrintParams]           = useState<PrintParams>({ ...DEFAULT_PRINT_PARAMS });
  const [historyItem, setHistoryItem]             = useState<HistoryItem | null>(null);
  const [transcricaoOpen, setTranscricaoOpen]     = useState(false);
  const [transcricaoText, setTranscricaoText]     = useState('');
  const [isRecording, setIsRecording]             = useState(false);
  const [recTimer, setRecTimer]                   = useState(0);
  const [audioFileName, setAudioFileName]         = useState('');
  const [draftSavedAt, setDraftSavedAt]           = useState<Date | null>(null);
  const [novoModeloOpen, setNovoModeloOpen]       = useState(false);
  const [novoModeloForm, setNovoModeloForm]       = useState({ name: '', type: 'Evolução', content: '' });
  const novoModeloEditorRef = useRef<HTMLDivElement>(null);
  const receituarioCriarModeloEditorRef = useRef<HTMLDivElement>(null);

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

  const { data: receituarioTemplates = [] } = useQuery({
    queryKey: ['receituario-templates'],
    queryFn: () => prontuarioApi.listDocTemplates(false),
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
  const draftMut = useMutation({
    mutationFn: (content: string) => prontuarioApi.saveDraft(patientId!, content),
    onSuccess: () => {
      setDraftSavedAt(new Date());
      setIsDirty(false);
      qc.invalidateQueries({ queryKey: ['patient', patientId] });
    },
    onError: () => toast('Não foi possível salvar o rascunho.', 'error'),
  });

  const saveMut = useMutation({
    mutationFn: (content: string) => prontuarioApi.createEvolution(patientId!, { content }),
    onSuccess: () => {
      prontuarioApi.deleteDraft(patientId!).catch(() => {});
      qc.invalidateQueries({ queryKey: ['patient', patientId] });
      if (editorRef.current) editorRef.current.innerHTML = '';
      setIsDirty(false);
      setDraftSavedAt(null);
      if (isFinalizingRef.current) {
        isFinalizingRef.current = false;
        setConsultaAtiva(false);
        setConsultaStart(null);
        setConsultaDur('00:00:00');
        setPostVendaOpen(true);
      }
      toast('Evolução finalizada com sucesso.', 'success');
    },
    onError: () => { isFinalizingRef.current = false; toast('Não foi possível salvar. Tente novamente.', 'error'); },
  });

  const createTemplateMut = useMutation({
    mutationFn: (data: any) => prontuarioApi.createDocTemplate(data),
    onSuccess: (_created, vars) => {
      qc.invalidateQueries({ queryKey: ['doc-templates'] });
      qc.invalidateQueries({ queryKey: ['receituario-templates'] });
      qc.invalidateQueries({ queryKey: ['doc-templates-all'] });
      if (vars._useNow) {
        const content = novoModeloEditorRef.current?.innerHTML?.trim() || vars.content || '';
        const filled = patient ? fillTemplate(content, patient) : content;
        setNovoModeloOpen(false);
        setModelosOpen(false);
        setNovoModeloForm({ name: '', type: 'Evolução', content: '' });
        if (novoModeloEditorRef.current) novoModeloEditorRef.current.innerHTML = '';
        const hasContent = !!(editorRef.current?.innerHTML?.trim());
        if (hasContent) { setPendingContent(filled); setInsertConflict(true); }
        else insertModeloNoEditor(filled, 'replace');
      } else {
        setNovoModeloOpen(false);
        setNovoModeloForm({ name: '', type: 'Evolução', content: '' });
        if (novoModeloEditorRef.current) novoModeloEditorRef.current.innerHTML = '';
        toast('Modelo salvo com sucesso.', 'success');
      }
    },
    onError: () => toast('Não foi possível salvar o modelo.', 'error'),
  });

  const saveDocMut = useMutation({
    mutationFn: (data: any) => prontuarioApi.savePatientDocument(patientId!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patient', patientId] });
      toast('Documento salvo no histórico do paciente.', 'success');
      setPrintPreviewOpen(false);
      setPrintParamsOpen(false);
      setReceituarioOpen(false);
    },
    onError: () => toast('Não foi possível salvar o documento.', 'error'),
  });

  // ── Ctrl+S shortcut: save draft ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        const content = editorRef.current?.innerHTML?.trim();
        if (content && !draftMut.isPending) {
          draftMut.mutate(content);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [draftMut]);

  // Load draft into editor when patient data arrives
  useEffect(() => {
    if (patient?.draft && editorRef.current && !editorRef.current.innerHTML?.trim()) {
      editorRef.current.innerHTML = patient.draft.content;
      setDraftSavedAt(new Date(patient.draft.updatedAt || patient.draft.createdAt));
    }
  }, [patient?.draft?.id]);

  // reset guard when leaving the page
  useEffect(() => () => { setIsDirty(false); }, [setIsDirty]);

  // ── beforeunload: warn when browser tab is closed/refreshed with unsaved content ──
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const handleNavigate = (path: string) => requestNavigate(path);

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

  // ── Print helper — same tab, no new window ──
  const printWithFrame = (html: string) => {
    const docHdr = (() => { try { return JSON.parse(localStorage.getItem('pcl_doc_header') || '{}'); } catch { return {}; } })();
    const logo   = localStorage.getItem('pcl_logo') || '';
    const user   = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
    const clinic = (user as any)?.clinic;
    const headerBlock = docHdr.header
      ? `<div class="clinic-header">${logo ? `<img src="${logo}" class="clinic-logo" />` : ''}<div class="clinic-text">${docHdr.header.replace(/\n/g, '<br>')}</div></div>`
      : logo ? `<div class="clinic-header"><img src="${logo}" class="clinic-logo" /><div class="clinic-text"><strong>${clinic?.name || ''}</strong></div></div>`
      : clinic?.name ? `<div class="clinic-header"><div class="clinic-text"><strong>${clinic.name}</strong></div></div>` : '';
    const footerBlock = docHdr.footer ? `<div class="clinic-footer">${docHdr.footer.replace(/\n/g, '<br>')}</div>` : '';

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}
      body{font-family:Inter,Arial,sans-serif;max-width:700px;margin:32px auto;padding:0 24px;font-size:13.5px;line-height:1.75;color:#191C1D}
      .clinic-header{display:flex;align-items:center;gap:16px;padding-bottom:14px;border-bottom:2px solid #191C1D;margin-bottom:20px}
      .clinic-logo{max-height:52px;max-width:140px;object-fit:contain}
      .clinic-text{font-size:12px;color:#374151;line-height:1.5}
      .doc-meta{font-size:11.5px;color:#71717A;margin-bottom:20px;padding:10px 14px;background:#F9F9F9;border-radius:6px;border-left:3px solid #E4E4E7}
      .doc-content{font-size:13.5px;line-height:1.75;color:#191C1D}
      .clinic-footer{margin-top:32px;padding-top:12px;border-top:1px solid #E4E4E7;font-size:11px;color:#9CA3AF;text-align:center}
      .sig-block{margin-top:48px;text-align:center;font-size:12px;color:#374151}
      .sig-line{border-top:1px solid #374151;width:200px;margin:0 auto 6px}
      @media print{body{margin:16px auto}@page{margin:18mm}}
    </style></head><body>
      ${headerBlock}
      ${html}
      ${footerBlock}
    </body></html>`);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow!.print();
      setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 2000);
    }, 400);
  };

  // ── Receituário ──
  const inserirTemplateReceituario = (t: any) => {
    if (receituarioEditorRef.current) receituarioEditorRef.current.innerHTML = patient ? fillTemplate(t.content, patient) : t.content;
    setReceituarioType(t.type || 'Receita');
    setReceituarioTitle(t.name);
  };

  const getPrintPrefsKey = (docType: string) => {
    const u = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
    return `pcl_print_prefs_${u?.id || 'default'}_${docType.toLowerCase().replace(/\s+/g, '_')}`;
  };

  const handlePrintReceituario = () => {
    try {
      const saved = localStorage.getItem(getPrintPrefsKey(receituarioType));
      setPrintParams(saved ? { ...DEFAULT_PRINT_PARAMS, ...JSON.parse(saved) } : { ...DEFAULT_PRINT_PARAMS });
    } catch { setPrintParams({ ...DEFAULT_PRINT_PARAMS }); }
    setPrintParamsOpen(true);
  };

  const handleGerarPrevia = () => {
    localStorage.setItem(getPrintPrefsKey(receituarioType), JSON.stringify(printParams));
    setPrintParamsOpen(false);
    setPrintPreviewOpen(true);
  };

  const handlePrintNow = () => {
    const docHdr = (() => { try { return JSON.parse(localStorage.getItem('pcl_doc_header') || '{}'); } catch { return {}; } })();
    const logo   = localStorage.getItem('pcl_logo') || '';
    const u      = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
    const content = receituarioEditorRef.current?.innerHTML || '';
    const title   = receituarioTitle || receituarioType;
    const html    = buildDocPreviewHTML(printParams, content, title, patient, u, docHdr, logo);
    const mt = printParams.marginTop, mb = printParams.marginBottom;
    const ml = printParams.marginLeft, mr = printParams.marginRight;
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}
      @page{margin:${mt}cm ${mr}cm ${mb}cm ${ml}cm}
      body{font-family:Inter,Arial,sans-serif;max-width:700px;margin:32px auto;padding:0 24px;font-size:13.5px;line-height:1.75;color:#191C1D}
      @media print{body{margin:0}}
    </style></head><body>${html}</body></html>`);
    doc.close();
    setTimeout(() => { iframe.contentWindow!.print(); setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 2000); }, 400);
  };

  const handleSalvarDocumento = () => {
    const rawContent = receituarioEditorRef.current?.innerHTML?.trim() || '';
    if (!rawContent) { toast('Escreva o conteúdo antes de salvar.', 'error'); return; }
    const docHdr = (() => { try { return JSON.parse(localStorage.getItem('pcl_doc_header') || '{}'); } catch { return {}; } })();
    const logo   = localStorage.getItem('pcl_logo') || '';
    const u      = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
    const title  = receituarioTitle || receituarioType;
    const fullHtml = buildDocPreviewHTML(printParams, rawContent, title, patient, u, docHdr, logo);
    saveDocMut.mutate({
      name: title,
      type: receituarioType,
      content: fullHtml,
      professional: u?.name || '',
    });
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

  const filteredReceituario = (receituarioTemplates as any[]).filter(m => {
    if (m.showInProntuario !== false) return false;
    const rf = receituarioFilter === 'Todos' || m.type?.toLowerCase() === receituarioFilter.toLowerCase();
    const rb = !receituarioBusca || m.name?.toLowerCase().includes(receituarioBusca.toLowerCase());
    return rf && rb;
  });

  const hasAlerts = patient && (patient.alergias || patient.medicamentos || patient.comorbidades || patient.alertaInterno);

  if (isLoading) return <SectionLoader label="Carregando prontuário..." />;

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
            <button onClick={() => handleNavigate('/patients')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#71717A', padding: '2px 4px', borderRadius: 4, fontFamily: 'inherit' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#191C1D'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#71717A'}
            >Pacientes</button>
            <i className="ti ti-chevron-right" style={{ fontSize: 11, color: '#C4C4C4' }} />
            <button onClick={() => handleNavigate(`/patients/${patientId}`)}
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
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                {patient.alergias && (
                  <span title={`Alergias: ${patient.alergias}`} style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#FEF2F2', color: '#DC2626', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3, cursor: 'default' }}>
                    <i className="ti ti-alert-triangle" style={{ fontSize: 10 }} /> Alergia
                  </span>
                )}
                {patient.medicamentos && (
                  <span title={`Medicamentos: ${patient.medicamentos}`} style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#FFFBEB', color: '#D97706', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3, cursor: 'default' }}>
                    <i className="ti ti-pill" style={{ fontSize: 10 }} /> Med.
                  </span>
                )}
                {patient.comorbidades && (
                  <span title={`Comorbidades: ${patient.comorbidades}`} style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#FEF2F2', color: '#DC2626', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3, cursor: 'default' }}>
                    <i className="ti ti-heart-rate-monitor" style={{ fontSize: 10 }} /> Comorbidade
                  </span>
                )}
                {patient.alertaInterno && (
                  <span title={`Alerta: ${patient.alertaInterno}`} style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#FFFBEB', color: '#D97706', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3, cursor: 'default' }}>
                    <i className="ti ti-exclamation-mark" style={{ fontSize: 10 }} /> Alerta
                  </span>
                )}
              </div>
            )}
          </div>

        </div>

        {/* ── Content area ── */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

          {/* ── Editor column ── */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '20px 24px 16px' }}>

            {/* Editor container */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', border: '1px solid #E4E4E7', borderRadius: 12, overflow: 'hidden', background: '#FFFFFF' }}>

              {/* Toolbar unificada: ações clínicas + formatação */}
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderBottom: '1px solid #F1F3F5', background: '#FAFAFA', flexWrap: 'wrap' }}>

                {/* Iniciar consulta / timer */}
                {!consultaAtiva ? (
                  <button onClick={iniciarConsulta} title="Iniciar cronômetro do atendimento"
                    style={{ height: 26, padding: '0 10px', background: '#09090B', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <i className="ti ti-stethoscope" style={{ fontSize: 12 }} /> Iniciar consulta
                  </button>
                ) : (
                  <div title="Atendimento em andamento" style={{ height: 26, padding: '0 10px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#16A34A', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', userSelect: 'none', flexShrink: 0 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22C55E', display: 'inline-block', animation: 'pulse 1s infinite' }} />
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{consultaDur}</span>
                  </div>
                )}

                {/* Separador */}
                <div style={{ width: 1, height: 16, background: '#E4E4E7', margin: '0 2px', flexShrink: 0 }} />

                {/* Formatação */}
                <ToolBtn icon="ti-bold"             title="Negrito"           onClick={() => exec('bold')} />
                <ToolBtn icon="ti-italic"           title="Itálico"           onClick={() => exec('italic')} />
                <ToolBtn icon="ti-underline"        title="Sublinhado"        onClick={() => exec('underline')} />
                <div style={{ width: 1, height: 16, background: '#E4E4E7', margin: '0 2px', flexShrink: 0 }} />
                <ToolBtn icon="ti-list"             title="Lista"             onClick={() => exec('insertUnorderedList')} />
                <ToolBtn icon="ti-list-numbers"     title="Lista numerada"    onClick={() => exec('insertOrderedList')} />
                <ToolBtn icon="ti-heading"          title="Título"            onClick={() => exec('formatBlock', '<h3>')} />
                <div style={{ width: 1, height: 16, background: '#E4E4E7', margin: '0 2px', flexShrink: 0 }} />
                <ToolBtn icon="ti-arrow-back-up"    title="Desfazer"          onClick={() => exec('undo')} />
                <ToolBtn icon="ti-arrow-forward-up" title="Refazer"           onClick={() => exec('redo')} />
                <ToolBtn icon="ti-clear-formatting" title="Limpar formatação" onClick={() => exec('removeFormat')} />

                {/* Áudio — após formatação */}
                <button onClick={() => setTranscricaoOpen(o => !o)} title="Grave ou transcreva a consulta para auxiliar na evolução"
                  style={{ height: 26, padding: '0 10px', background: isRecording ? '#DC2626' : transcricaoOpen ? '#FEF2F2' : 'transparent', border: isRecording ? 'none' : transcricaoOpen ? '1px solid #FECACA' : '1px solid #E4E4E7', borderRadius: 6, fontSize: 11, fontWeight: 600, color: isRecording ? '#FFF' : transcricaoOpen ? '#DC2626' : '#71717A', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  <i className={`ti ${isRecording ? 'ti-player-stop' : 'ti-microphone'}`} style={{ fontSize: 12 }} />
                  {isRecording ? recTimerStr : 'Áudio'}
                </button>

                {/* Espaço empurra Modelos para a direita */}
                <div style={{ flex: 1 }} />

                {/* Modelos — extrema direita */}
                <div style={{ width: 1, height: 16, background: '#E4E4E7', margin: '0 2px', flexShrink: 0 }} />

                <button onClick={() => { setModelosFilter('Todos'); setModelosOpen(true); }} title="Inserir modelo de evolução"
                  style={{ height: 26, padding: '0 10px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#2563EB', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#DBEAFE'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#EFF6FF'; }}>
                  <i className="ti ti-file-text" style={{ fontSize: 12 }} /> Modelos
                </button>
              </div>

              {/* Editor */}
              <div ref={editorRef} contentEditable suppressContentEditableWarning
                data-placeholder="Digite aqui as queixas relatadas pelo paciente, evolução clínica, observações, conduta, orientações e próximos passos..."
                onInput={() => setIsDirty(!!(editorRef.current?.innerHTML?.trim()))}
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
            <div style={{ flexShrink: 0, paddingTop: 12 }}>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => {
                  if (consultaAtiva) { setConfirmCancelOpen(true); }
                  else { if (editorRef.current) editorRef.current.innerHTML = ''; setIsDirty(false); setDraftSavedAt(null); }
                }}
                  style={{ height: 36, padding: '0 14px', background: 'transparent', border: '1px solid #E4E4E7', borderRadius: 20, fontSize: 13, fontWeight: 500, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancelar
                </button>
                <button onClick={() => { const c = editorRef.current?.innerHTML?.trim(); if (c && !draftMut.isPending) draftMut.mutate(c); }} disabled={draftMut.isPending}
                  style={{ height: 36, padding: '0 14px', background: 'transparent', border: '1px solid #E4E4E7', borderRadius: 20, fontSize: 13, fontWeight: 500, color: '#71717A', cursor: draftMut.isPending ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                  {draftMut.isPending
                    ? <><div style={{ width: 11, height: 11, border: '2px solid #E4E4E7', borderTopColor: '#71717A', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Salvando...</>
                    : 'Salvar rascunho'
                  }
                </button>

                <button
                  onClick={() => { setReceituarioTitle(''); setReceituarioType('Receita'); setReceituarioFilter('Todos'); setReceituarioBusca(''); setReceituarioOpen(true); }}
                  title="Criar receita, atestado ou documento"
                  style={{ height: 36, padding: '0 16px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 20, fontSize: 13, fontWeight: 600, color: '#16A34A', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#DCFCE7'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#F0FDF4'; }}>
                  <i className="ti ti-prescription" style={{ fontSize: 14 }} /> Receituário
                </button>

                <button
                  onClick={() => { const c = editorRef.current?.innerHTML?.trim(); if (c) setConfirmFinalizarEv(true); }}
                  disabled={saveMut.isPending}
                  title="Salvar evolução e finalizar atendimento"
                  style={{ height: 36, padding: '0 18px', background: saveMut.isPending ? '#A1A1AA' : '#16A34A', border: 'none', borderRadius: 20, fontSize: 13, fontWeight: 600, color: '#FFF', cursor: saveMut.isPending ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {saveMut.isPending
                    ? <><div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Salvando...</>
                    : <><i className="ti ti-circle-check" style={{ fontSize: 15 }} /> Finalizar atendimento</>
                  }
                </button>
              </div>
              {draftSavedAt && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', paddingTop: 6 }}>
                  <i className="ti ti-check" style={{ fontSize: 11, color: '#16A34A' }} />
                  <span style={{ fontSize: 11, color: '#71717A' }}>Rascunho salvo em {format(draftSavedAt, "dd/MM 'às' HH:mm", { locale: ptBR })}</span>
                </div>
              )}
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
                        <div style={{ fontSize: 11, color: '#A1A1AA', marginBottom: 1 }}>
                          {format(item.date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </div>
                        {item.profissional && (
                          <div style={{ fontSize: 11, color: '#71717A', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <i className="ti ti-user-check" style={{ fontSize: 10 }} /> {item.profissional}
                          </div>
                        )}
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
            <div style={{ fontSize: 15, fontWeight: 700, color: '#191C1D', textAlign: 'center', marginBottom: 8 }}>Finalizar atendimento?</div>
            <div style={{ fontSize: 13, color: '#71717A', textAlign: 'center', lineHeight: 1.6, marginBottom: 8 }}>
              A evolução será salva e registrada no histórico clínico do paciente.
            </div>
            <div style={{ fontSize: 12, color: '#A1A1AA', textAlign: 'center', marginBottom: 24 }}>
              Esta ação não poderá ser desfeita.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmFinalizarEv(false)} style={{ flex: 1, height: 38, background: '#F4F4F5', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 500, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={() => { setConfirmFinalizarEv(false); finalizarEvolucao(); }} style={{ flex: 1, height: 38, background: '#16A34A', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#FFF', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <i className="ti ti-circle-check" style={{ fontSize: 14 }} /> Finalizar atendimento
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
                  if (content) draftMut.mutate(content);
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
          const title = item.docName || item.tipo;
          printWithFrame(`
            <h2 style="font-size:16px;font-weight:700;margin:0 0 4px">${title}</h2>
            <div class="doc-meta">
              Paciente: <strong>${patient?.name || ''}</strong>
              &nbsp;·&nbsp; ${format(item.date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              ${item.profissional ? `&nbsp;·&nbsp; ${item.profissional}` : ''}
            </div>
            <div class="doc-content">${rendered || `<p>${item.resumo}</p>`}</div>
          `);
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
              <div style={{ flex: 1, overflowY: 'auto', padding: item.isDocument ? '16px' : '20px 22px', minHeight: 0, background: item.isDocument ? '#EAECEF' : '#FFFFFF' }}>
                {item.isDocument ? (
                  rendered ? (
                    <div style={{ background: '#FFFFFF', borderRadius: 6, padding: '20px 24px', boxShadow: '0 2px 16px rgba(0,0,0,0.14)', fontFamily: "'Inter', Arial, sans-serif" }}>
                      <div dangerouslySetInnerHTML={{ __html: rendered }} style={{ fontSize: 13, color: '#191C1D', lineHeight: 1.75 }} />
                    </div>
                  ) : (
                    <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                      <i className="ti ti-file-off" style={{ fontSize: 32, color: '#D4D4D8', display: 'block', marginBottom: 8 }} />
                      <div style={{ fontSize: 12, color: '#A1A1AA' }}>Conteúdo do documento não disponível</div>
                    </div>
                  )
                ) : rendered ? (
                  <div dangerouslySetInnerHTML={{ __html: rendered }} style={{ fontSize: 13, color: '#191C1D', lineHeight: 1.75 }} />
                ) : (
                  <div style={{ fontSize: 13, color: '#71717A', lineHeight: 1.7 }}>{item.resumo || '—'}</div>
                )}
              </div>
              <div style={{ flexShrink: 0, padding: '12px 22px', borderTop: '1px solid #E4E4E7', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                {isEvolution && item.status !== 'finalizado' && (
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
          <div onClick={() => { setModelosOpen(false); setModelosBusca(''); setNovoModeloOpen(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 500, backdropFilter: 'blur(3px)' }} />

          {/* Lista de modelos */}
          {!novoModeloOpen && (
            <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 520, background: '#F8F9FA', zIndex: 501, display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 60px rgba(0,0,0,.16)', fontFamily: "'Inter', system-ui, sans-serif", animation: 'slideInPanel .25s cubic-bezier(0.32,0.72,0,1)' }}>
              <div style={{ flexShrink: 0, background: '#FFFFFF', borderBottom: '1px solid #E5E7EB', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#191C1D' }}>Modelos de evolução</div>
                  <div style={{ fontSize: 12, color: '#71717A', marginTop: 2 }}>Selecione um modelo para inserir na evolução.</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={() => setNovoModeloOpen(true)}
                    style={{ height: 32, padding: '0 12px', background: '#000', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}>
                    <i className="ti ti-plus" style={{ fontSize: 12 }} /> Novo modelo
                  </button>
                  <button onClick={() => { setModelosOpen(false); setModelosBusca(''); }}
                    style={{ width: 32, height: 32, border: 'none', background: '#F4F4F5', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A' }}>
                    <i className="ti ti-x" style={{ fontSize: 14 }} />
                  </button>
                </div>
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
                {/* Modelos padrão do sistema */}
                {(modelosFilter === 'Todos' || modelosFilter === 'Evolução') && !modelosBusca && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Padrão do sistema</div>
                    <div style={{ width: '100%', padding: '14px 16px', marginBottom: 8, background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 12, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <i className="ti ti-template" style={{ fontSize: 17, color: '#7C3AED' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#191C1D', marginBottom: 3 }}>Evolução SOAP</div>
                        <div style={{ fontSize: 11, color: '#71717A', marginBottom: 6, lineHeight: 1.4 }}>Subjetivo · Objetivo · Avaliação · Plano</div>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 99, background: '#F5F3FF', color: '#7C3AED' }}>Evolução</span>
                      </div>
                      <button onClick={() => {
                        const soap = `<h3>S — Subjetivo</h3><p>Queixas e sintomas relatados pelo paciente:</p><br><h3>O — Objetivo</h3><p>Dados observados: exame físico, sinais vitais, exames:</p><br><h3>A — Avaliação</h3><p>Impressão diagnóstica e avaliação clínica:</p><br><h3>P — Plano</h3><p>Conduta, prescrição e orientações:</p>`;
                        const hasContent = !!(editorRef.current?.innerHTML?.trim());
                        setModelosOpen(false);
                        if (hasContent) { setPendingContent(soap); setInsertConflict(true); }
                        else insertModeloNoEditor(soap, 'replace');
                      }}
                        style={{ height: 32, padding: '0 14px', background: '#000', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#FFF', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                        <i className="ti ti-pencil" style={{ fontSize: 12 }} /> Inserir
                      </button>
                    </div>
                  </div>
                )}
                {filteredModelos.length > 0 && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Meus modelos</div>
                )}
                {filteredModelos.length === 0 && !(!modelosBusca && (modelosFilter === 'Todos' || modelosFilter === 'Evolução')) ? (
                  <div style={{ textAlign: 'center', padding: '48px 16px' }}>
                    <i className="ti ti-file-off" style={{ fontSize: 40, color: '#E4E4E7', display: 'block', marginBottom: 14 }} />
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                      {(docTemplates as any[]).length === 0 ? 'Nenhum modelo cadastrado.' : 'Nenhum modelo encontrado.'}
                    </div>
                    <div style={{ fontSize: 12, color: '#A1A1AA', lineHeight: 1.5, marginBottom: 20 }}>
                      {(docTemplates as any[]).length === 0
                        ? 'Cadastre um modelo para agilizar suas evoluções clínicas sem sair do prontuário.'
                        : 'Tente outros termos ou filtros.'}
                    </div>
                    {(docTemplates as any[]).length === 0 && (
                      <button onClick={() => setNovoModeloOpen(true)}
                        style={{ height: 38, padding: '0 18px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#FFF', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
                        <i className="ti ti-plus" style={{ fontSize: 13 }} /> Cadastrar modelo
                      </button>
                    )}
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
          )}

          {/* Cadastro rápido de modelo */}
          {novoModeloOpen && (
            <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 560, background: '#FFFFFF', zIndex: 502, display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 60px rgba(0,0,0,.18)', fontFamily: "'Inter', system-ui, sans-serif", animation: 'slideInPanel .25s cubic-bezier(0.32,0.72,0,1)' }}>
              <div style={{ flexShrink: 0, borderBottom: '1px solid #E4E4E7', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#191C1D' }}>Novo modelo de evolução</div>
                  <div style={{ fontSize: 12, color: '#71717A', marginTop: 2 }}>Salvo em Configurações → Modelos e disponível no prontuário.</div>
                </div>
                <button onClick={() => setNovoModeloOpen(false)}
                  style={{ width: 32, height: 32, border: 'none', background: '#F4F4F5', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A' }}>
                  <i className="ti ti-x" style={{ fontSize: 14 }} />
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Nome do modelo *</label>
                  <input value={novoModeloForm.name} onChange={e => setNovoModeloForm(v => ({ ...v, name: e.target.value }))}
                    placeholder="Ex: Avaliação inicial, Retorno pós-cirúrgico..."
                    style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, color: '#191C1D', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Tipo</label>
                  <select value={novoModeloForm.type} onChange={e => setNovoModeloForm(v => ({ ...v, type: e.target.value }))}
                    style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, color: '#191C1D', background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'border-box' }}>
                    {['Evolução', 'Avaliação', 'Retorno', 'Consulta', 'Procedimento', 'Outro'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Conteúdo do modelo *</label>
                  <div style={{ flex: 1, border: '1px solid #E4E4E7', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 240 }}>
                    <div style={{ flexShrink: 0, padding: '6px 10px', background: '#FAFAFA', borderBottom: '1px solid #F1F3F5', display: 'flex', gap: 4 }}>
                      {[['ti-bold','bold'],['ti-italic','italic'],['ti-underline','underline'],['ti-list','insertUnorderedList']].map(([icon, cmd]) => (
                        <button key={cmd} type="button" onClick={() => { novoModeloEditorRef.current?.focus(); document.execCommand(cmd, false); }}
                          style={{ width: 26, height: 26, border: 'none', background: 'transparent', borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A' }}>
                          <i className={`ti ${icon}`} style={{ fontSize: 13 }} />
                        </button>
                      ))}
                    </div>
                    <div ref={novoModeloEditorRef} contentEditable suppressContentEditableWarning
                      data-placeholder="Digite o conteúdo do modelo. Use {{nome_paciente}}, {{data_atual}}, {{nome_profissional}} para variáveis automáticas..."
                      style={{ flex: 1, padding: '12px 14px', outline: 'none', fontSize: 13, color: '#191C1D', lineHeight: 1.7, fontFamily: "'Inter', system-ui, sans-serif", overflowY: 'auto', minHeight: 200 }} />
                  </div>
                </div>
              </div>
              <div style={{ flexShrink: 0, borderTop: '1px solid #E4E4E7', padding: '14px 24px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setNovoModeloOpen(false)}
                  style={{ height: 36, padding: '0 16px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    const content = novoModeloEditorRef.current?.innerHTML?.trim() || '';
                    if (!novoModeloForm.name.trim() || !content) { toast('Preencha o nome e o conteúdo do modelo.', 'error'); return; }
                    createTemplateMut.mutate({ name: novoModeloForm.name, type: novoModeloForm.type, content, active: true, showInProntuario: true });
                  }}
                  disabled={createTemplateMut.isPending}
                  style={{ height: 36, padding: '0 16px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Salvar modelo
                </button>
                <button
                  onClick={() => {
                    const content = novoModeloEditorRef.current?.innerHTML?.trim() || '';
                    if (!novoModeloForm.name.trim() || !content) { toast('Preencha o nome e o conteúdo do modelo.', 'error'); return; }
                    createTemplateMut.mutate({ name: novoModeloForm.name, type: novoModeloForm.type, content, active: true, showInProntuario: true, _useNow: true });
                  }}
                  disabled={createTemplateMut.isPending}
                  style={{ height: 36, padding: '0 16px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#FFF', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {createTemplateMut.isPending
                    ? <><div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Salvando...</>
                    : <><i className="ti ti-check" style={{ fontSize: 13 }} /> Salvar e usar agora</>
                  }
                </button>
              </div>
            </div>
          )}
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
      <Portal>
        {/* Backdrop — prontuário fica visível e desfocado por trás */}
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', zIndex: 10002, animation: 'fadeIn .2s ease' }} />

        {/* Receituário — modal em camada */}
        <div style={{ position: 'fixed', inset: '12px', borderRadius: 20, background: '#F8F9FA', zIndex: 10003, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.4)', fontFamily: "'Inter', system-ui, sans-serif", animation: 'fadeIn .18s ease' }}>

          {/* Header */}
          <div style={{ flexShrink: 0, background: '#FFFFFF', borderBottom: '1px solid #E4E4E7', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className="ti ti-prescription" style={{ fontSize: 18, color: '#16A34A' }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#191C1D' }}>Receituário</div>
              <div style={{ fontSize: 11, color: '#71717A' }}>{patient.name} · {format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}</div>
            </div>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => {
                const hasContent = !!(receituarioEditorRef.current?.innerHTML?.trim());
                if (hasContent) setReceituarioCloseConfirm(true); else setReceituarioOpen(false);
              }}
              style={{ width: 32, height: 32, border: 'none', background: '#F4F4F5', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A' }}>
              <i className="ti ti-x" style={{ fontSize: 14 }} />
            </button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden', position: 'relative' }}>

            {/* Left sidebar: models */}
            <div style={{ width: 264, flexShrink: 0, background: '#FFFFFF', borderRight: '1px solid #E4E4E7', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ flexShrink: 0, padding: '14px 16px 10px', borderBottom: '1px solid #F4F4F5' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Modelos</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F4F4F5', borderRadius: 7, padding: '0 10px', height: 32 }}>
                  <i className="ti ti-search" style={{ fontSize: 13, color: '#A1A1AA' }} />
                  <input value={receituarioBusca} onChange={e => setReceituarioBusca(e.target.value)} placeholder="Buscar modelo..."
                    style={{ border: 'none', background: 'transparent', fontSize: 12, outline: 'none', width: '100%', color: '#191C1D', fontFamily: 'inherit' }} />
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                {filteredReceituario.length === 0 ? (
                  <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                    <i className="ti ti-bookmark-off" style={{ fontSize: 28, color: '#D4D4D8', display: 'block', marginBottom: 8 }} />
                    <div style={{ fontSize: 12, color: '#A1A1AA', lineHeight: 1.6 }}>Nenhum modelo encontrado.<br/>Crie seu primeiro modelo para agilizar o atendimento.</div>
                  </div>
                ) : filteredReceituario.map((m: any) => (
                  <button key={m.id} onClick={() => inserirTemplateReceituario(m)}
                    style={{ width: '100%', padding: '10px 12px', marginBottom: 4, background: 'transparent', border: '1px solid #E4E4E7', borderRadius: 8, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'block' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F9F9F9'; (e.currentTarget as HTMLElement).style.borderColor = '#000'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderColor = '#E4E4E7'; }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#191C1D' }}>{m.name}</div>
                    <div style={{ fontSize: 10, color: '#71717A', marginTop: 2 }}>{m.type}</div>
                  </button>
                ))}
              </div>
              <div style={{ flexShrink: 0, padding: '12px 16px', borderTop: '1px solid #E4E4E7' }}>
                <button onClick={() => setReceituarioCriarModeloOpen(true)}
                  style={{ width: '100%', height: 34, background: '#F4F4F5', border: '1px dashed #D4D4D8', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#71717A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontFamily: 'inherit' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#EAEAEB'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; }}>
                  <i className="ti ti-plus" style={{ fontSize: 13 }} /> Criar modelo
                </button>
              </div>
            </div>

            {/* Document editor */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '20px 24px' }}>
              <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                <input value={receituarioTitle} onChange={e => setReceituarioTitle(e.target.value)} placeholder="Título (opcional)..."
                  style={{ flex: 1, height: 38, padding: '0 14px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#191C1D', background: '#FFFFFF', outline: 'none', fontFamily: 'inherit' }} />
                <select value={receituarioType}
                  onChange={e => { setReceituarioType(e.target.value); if (!receituarioTitle) setReceituarioTitle(e.target.value); }}
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
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', paddingTop: 14 }}>
                <button
                  onClick={() => {
                    const hasContent = !!(receituarioEditorRef.current?.innerHTML?.trim());
                    if (hasContent) setReceituarioCloseConfirm(true); else setReceituarioOpen(false);
                  }}
                  style={{ height: 36, padding: '0 14px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="ti ti-arrow-left" style={{ fontSize: 13 }} /> Fechar
                </button>
                <div style={{ flex: 1 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handlePrintReceituario}
                    style={{ height: 36, padding: '0 16px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <i className="ti ti-printer" style={{ fontSize: 13 }} /> Imprimir
                  </button>
                  <button
                    onClick={() => {
                      const content = receituarioEditorRef.current?.innerHTML?.trim() || '';
                      if (!content) { toast('Escreva o conteúdo antes de salvar como modelo.', 'error'); return; }
                      setSaveAsModelName(receituarioTitle || receituarioType);
                      setSaveAsModelOpen(true);
                    }}
                    disabled={createTemplateMut.isPending}
                    style={{ height: 36, padding: '0 16px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <i className="ti ti-bookmark" style={{ fontSize: 13 }} /> Salvar como modelo
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

            {/* ── Print params panel (Portal separado — camada 3) ── */}
            {printParamsOpen && (
              <Portal>
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 10004, animation: 'fadeIn .15s ease' }} />
                <div style={{ position: 'fixed', inset: '28px', borderRadius: 20, background: '#FFFFFF', zIndex: 10005, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', fontFamily: "'Inter', system-ui, sans-serif", animation: 'slideInRight .2s ease' }}>
                <div style={{ flexShrink: 0, padding: '14px 24px', borderBottom: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button onClick={() => setPrintParamsOpen(false)}
                    style={{ width: 30, height: 30, border: 'none', background: '#F4F4F5', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A', flexShrink: 0 }}>
                    <i className="ti ti-arrow-left" style={{ fontSize: 13 }} />
                  </button>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#191C1D' }}>Parâmetros de impressão</div>
                    <div style={{ fontSize: 11, color: '#71717A' }}>Configure como o documento será gerado · Salvo automaticamente por tipo</div>
                  </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', display: 'flex', gap: 32 }}>
                  {/* Left column */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>

                    {/* Layout */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Layout</div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        {([['padrao', 'Padrão da clínica', 'ti-building'], ['sem_cabecalho', 'Sem cabeçalho', 'ti-layout-off']] as const).map(([val, label, icon]) => (
                          <button key={val} onClick={() => setPrintParams(p => ({ ...p, layout: val }))}
                            style={{ flex: 1, padding: '10px 14px', border: `2px solid ${printParams.layout === val ? '#000' : '#E4E4E7'}`, borderRadius: 10, background: printParams.layout === val ? '#F4F4F5' : '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                            <i className={`ti ${icon}`} style={{ fontSize: 16, color: printParams.layout === val ? '#191C1D' : '#A1A1AA', display: 'block', marginBottom: 4 }} />
                            <div style={{ fontSize: 12, fontWeight: 600, color: printParams.layout === val ? '#191C1D' : '#71717A' }}>{label}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Dados do documento */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Dados no documento</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {([
                          ['showDate',        'Exibir data'],
                          ['showPatientName', 'Exibir nome do paciente'],
                          ['showCPF',         'Exibir CPF do paciente'],
                          ['showPhone',       'Exibir telefone'],
                          ['showAddress',     'Exibir endereço'],
                        ] as [keyof PrintParams, string][]).map(([key, label]) => (
                          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 0' }}>
                            <input type="checkbox" checked={printParams[key] as boolean}
                              onChange={e => setPrintParams(p => ({ ...p, [key]: e.target.checked }))}
                              style={{ cursor: 'pointer', width: 15, height: 15, accentColor: '#000' }} />
                            <span style={{ fontSize: 13, color: '#374151' }}>{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Assinatura */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Assinatura e autenticação</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {([
                          ['showStamp',      'Exibir assinatura / carimbo'],
                          ['stampAllPages',  'Carimbo em todas as páginas'],
                          ['showQRCode',     'QR Code de autenticação'],
                          ['showPageNumber', 'Número de páginas'],
                        ] as [keyof PrintParams, string][]).map(([key, label]) => (
                          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 0' }}>
                            <input type="checkbox" checked={printParams[key] as boolean}
                              onChange={e => setPrintParams(p => ({ ...p, [key]: e.target.checked }))}
                              style={{ cursor: 'pointer', width: 15, height: 15, accentColor: '#000' }} />
                            <span style={{ fontSize: 13, color: '#374151' }}>{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right column */}
                  <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>

                    {/* Margens */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Margens (cm)</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {([['marginTop','Superior'],['marginBottom','Inferior'],['marginLeft','Esquerda'],['marginRight','Direita']] as [keyof PrintParams, string][]).map(([key, label]) => (
                          <div key={key}>
                            <label style={{ fontSize: 11, color: '#71717A', display: 'block', marginBottom: 4 }}>{label}</label>
                            <input type="number" step="0.1" min="0" max="5" value={printParams[key] as string}
                              onChange={e => setPrintParams(p => ({ ...p, [key]: e.target.value }))}
                              style={{ width: '100%', height: 34, padding: '0 10px', border: '1px solid #E4E4E7', borderRadius: 7, fontSize: 13, color: '#191C1D', background: '#FFFFFF', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Papel e orientação */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Papel e orientação</div>
                      <select value={printParams.paperSize} onChange={e => setPrintParams(p => ({ ...p, paperSize: e.target.value }))}
                        style={{ width: '100%', height: 36, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, color: '#374151', background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10 }}>
                        <option value="A4">A4</option>
                        <option value="A5">A5</option>
                        <option value="Carta">Carta (Letter)</option>
                      </select>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {([['retrato','Retrato','ti-rectangle-vertical'],['paisagem','Paisagem','ti-rectangle']] as const).map(([val, label, icon]) => (
                          <button key={val} onClick={() => setPrintParams(p => ({ ...p, orientation: val }))}
                            style={{ flex: 1, padding: '7px 10px', border: `2px solid ${printParams.orientation === val ? '#000' : '#E4E4E7'}`, borderRadius: 8, background: printParams.orientation === val ? '#F4F4F5' : '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <i className={`ti ${icon}`} style={{ fontSize: 14, color: printParams.orientation === val ? '#191C1D' : '#A1A1AA' }} />
                            <span style={{ fontSize: 12, fontWeight: 500, color: printParams.orientation === val ? '#191C1D' : '#71717A' }}>{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={{ padding: '12px 14px', background: '#F0FDF4', borderRadius: 8, border: '1px solid #DCFCE7' }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                        <i className="ti ti-info-circle" style={{ fontSize: 14, color: '#16A34A', flexShrink: 0, marginTop: 1 }} />
                        <div style={{ fontSize: 11, color: '#166534', lineHeight: 1.5 }}>
                          Parâmetros salvos por tipo de documento. Na próxima impressão de <strong>{receituarioType}</strong> as opções já estarão iguais.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ flexShrink: 0, padding: '14px 24px', borderTop: '1px solid #E4E4E7', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setPrintParamsOpen(false)}
                    style={{ height: 36, padding: '0 14px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Cancelar
                  </button>
                  <button onClick={handleGerarPrevia}
                    style={{ height: 36, padding: '0 18px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#FFF', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="ti ti-eye" style={{ fontSize: 13 }} /> Gerar prévia
                  </button>
                </div>
                </div>
              </Portal>
            )}

            {/* ── Print preview panel (Portal separado — camada 4) ── */}
            {printPreviewOpen && (() => {
              const docHdr = (() => { try { return JSON.parse(localStorage.getItem('pcl_doc_header') || '{}'); } catch { return {}; } })();
              const logo   = localStorage.getItem('pcl_logo') || '';
              const u      = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
              const content = receituarioEditorRef.current?.innerHTML || '';
              const title   = receituarioTitle || receituarioType;
              const previewHTML = buildDocPreviewHTML(printParams, content, title, patient, u, docHdr, logo);

              return (
                <Portal>
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 10006, animation: 'fadeIn .15s ease' }} />
                <div style={{ position: 'fixed', inset: '16px', borderRadius: 20, background: '#EAECEF', zIndex: 10007, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', fontFamily: "'Inter', system-ui, sans-serif", animation: 'fadeIn .18s ease' }}>
                  {/* Preview topbar */}
                  <div style={{ flexShrink: 0, background: '#FFFFFF', borderBottom: '1px solid #E4E4E7', padding: '11px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => { setPrintPreviewOpen(false); setPrintParamsOpen(true); }}
                      style={{ height: 32, padding: '0 12px', background: 'transparent', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 12, fontWeight: 500, color: '#71717A', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}>
                      <i className="ti ti-adjustments" style={{ fontSize: 13 }} /> Ajustar parâmetros
                    </button>
                    <button onClick={() => { setPrintPreviewOpen(false); setPrintParamsOpen(false); }}
                      style={{ height: 32, padding: '0 12px', background: 'transparent', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 12, fontWeight: 500, color: '#71717A', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}>
                      <i className="ti ti-pencil" style={{ fontSize: 13 }} /> Editar documento
                    </button>
                    <div style={{ width: 1, height: 20, background: '#E4E4E7' }} />
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#191C1D' }}>Prévia do documento</div>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#F4F4F5', color: '#71717A', fontWeight: 500 }}>{title}</span>
                    <div style={{ flex: 1 }} />
                    <button onClick={() => { setPrintPreviewOpen(false); setPrintParamsOpen(false); }}
                      style={{ width: 30, height: 30, border: 'none', background: '#F4F4F5', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A' }}>
                      <i className="ti ti-x" style={{ fontSize: 13 }} />
                    </button>
                  </div>

                  <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
                    {/* A4 preview area */}
                    <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: '32px 24px', background: '#EAECEF' }}>
                      <div style={{
                        width: '210mm',
                        minHeight: '297mm',
                        margin: '0 auto',
                        background: '#FFFFFF',
                        boxShadow: '0 4px 32px rgba(0,0,0,0.2)',
                        borderRadius: 3,
                        padding: `${printParams.marginTop}cm ${printParams.marginRight}cm ${printParams.marginBottom}cm ${printParams.marginLeft}cm`,
                        fontFamily: "'Inter', Arial, sans-serif",
                        fontSize: '13.5px',
                        lineHeight: 1.75,
                        color: '#191C1D',
                        boxSizing: 'border-box',
                      }} dangerouslySetInnerHTML={{ __html: previewHTML }} />
                    </div>

                    {/* Action sidebar */}
                    <div style={{ width: 272, flexShrink: 0, background: '#FFFFFF', borderLeft: '1px solid #E4E4E7', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>Forma de saída</div>

                        {/* Imprimir agora */}
                        <button onClick={handlePrintNow}
                          style={{ width: '100%', padding: '11px 14px', marginBottom: 8, background: '#000', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10 }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#18181B'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#000'}>
                          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(255,255,255,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <i className="ti ti-printer" style={{ fontSize: 17, color: '#FFFFFF' }} />
                          </div>
                          <div style={{ textAlign: 'left' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF' }}>Imprimir agora</div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)' }}>Abre o diálogo de impressão</div>
                          </div>
                        </button>

                        {/* Baixar PDF */}
                        <button onClick={handlePrintNow}
                          style={{ width: '100%', padding: '11px 14px', marginBottom: 8, background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10 }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F9F9F9'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#FFFFFF'}>
                          <div style={{ width: 34, height: 34, borderRadius: 8, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <i className="ti ti-download" style={{ fontSize: 17, color: '#DC2626' }} />
                          </div>
                          <div style={{ textAlign: 'left' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Baixar PDF</div>
                            <div style={{ fontSize: 11, color: '#71717A' }}>Selecione "Salvar como PDF" na impressão</div>
                          </div>
                        </button>

                        {/* WhatsApp — desabilitado */}
                        <button disabled
                          style={{ width: '100%', padding: '11px 14px', marginBottom: 8, background: '#FAFAFA', border: '1px solid #E4E4E7', borderRadius: 10, cursor: 'not-allowed', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10, opacity: 0.65 }}>
                          <div style={{ width: 34, height: 34, borderRadius: 8, background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <i className="ti ti-brand-whatsapp" style={{ fontSize: 17, color: '#16A34A' }} />
                          </div>
                          <div style={{ textAlign: 'left' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Enviar por WhatsApp</div>
                            <div style={{ fontSize: 11, color: '#71717A' }}>Configure em Configurações → Integrações</div>
                          </div>
                        </button>

                        {/* Assinatura digital — desabilitado */}
                        <button disabled
                          style={{ width: '100%', padding: '11px 14px', marginBottom: 8, background: '#FAFAFA', border: '1px solid #E4E4E7', borderRadius: 10, cursor: 'not-allowed', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10, opacity: 0.65 }}>
                          <div style={{ width: 34, height: 34, borderRadius: 8, background: '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <i className="ti ti-certificate" style={{ fontSize: 17, color: '#7C3AED' }} />
                          </div>
                          <div style={{ textAlign: 'left' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Assinar digitalmente</div>
                            <div style={{ fontSize: 11, color: '#71717A' }}>Configure em Integrações → Certificados</div>
                          </div>
                        </button>

                        {/* E-mail — desabilitado */}
                        <button disabled
                          style={{ width: '100%', padding: '11px 14px', background: '#FAFAFA', border: '1px solid #E4E4E7', borderRadius: 10, cursor: 'not-allowed', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10, opacity: 0.65 }}>
                          <div style={{ width: 34, height: 34, borderRadius: 8, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <i className="ti ti-mail" style={{ fontSize: 17, color: '#2563EB' }} />
                          </div>
                          <div style={{ textAlign: 'left' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Enviar por e-mail</div>
                            <div style={{ fontSize: 11, color: '#71717A' }}>Disponível em breve</div>
                          </div>
                        </button>

                        <div style={{ height: 1, background: '#E4E4E7', margin: '16px 0' }} />

                        {/* Paciente */}
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Paciente</div>
                        <div style={{ padding: '12px 14px', background: '#F9F9F9', borderRadius: 8, border: '1px solid #E4E4E7' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#191C1D', marginBottom: 4 }}>{patient?.name}</div>
                          {patient?.phone && (
                            <div style={{ fontSize: 12, color: '#71717A', display: 'flex', alignItems: 'center', gap: 5 }}>
                              <i className="ti ti-phone" style={{ fontSize: 11 }} /> {patient.phone}
                            </div>
                          )}
                          {patient?.email && (
                            <div style={{ fontSize: 12, color: '#71717A', display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                              <i className="ti ti-mail" style={{ fontSize: 11 }} /> {patient.email}
                            </div>
                          )}
                        </div>

                        <div style={{ height: 1, background: '#E4E4E7', margin: '16px 0' }} />

                        {/* Salvar e voltar ao prontuário — ação primária */}
                        <button onClick={() => { handleSalvarDocumento(); }}
                          disabled={saveDocMut.isPending}
                          style={{ width: '100%', padding: '12px 14px', background: saveDocMut.isPending ? '#A1A1AA' : '#16A34A', border: 'none', borderRadius: 10, cursor: saveDocMut.isPending ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10 }}
                          onMouseEnter={e => { if (!saveDocMut.isPending) (e.currentTarget as HTMLElement).style.background = '#15803D'; }}
                          onMouseLeave={e => { if (!saveDocMut.isPending) (e.currentTarget as HTMLElement).style.background = '#16A34A'; }}>
                          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {saveDocMut.isPending
                              ? <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                              : <i className="ti ti-device-floppy" style={{ fontSize: 17, color: '#FFFFFF' }} />
                            }
                          </div>
                          <div style={{ textAlign: 'left' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF' }}>
                              {saveDocMut.isPending ? 'Salvando...' : 'Salvar e voltar ao prontuário'}
                            </div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.75)' }}>Registra no histórico clínico</div>
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                </Portal>
              );
            })()}

            {/* "Criar modelo" slide-in panel */}
            {receituarioCriarModeloOpen && (
              <div style={{ position: 'absolute', inset: 0, background: '#FFFFFF', zIndex: 10, display: 'flex', flexDirection: 'column', animation: 'slideInRight .2s ease' }}>
                <div style={{ flexShrink: 0, padding: '16px 24px', borderBottom: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button onClick={() => { setReceituarioCriarModeloOpen(false); setReceituarioCriarModeloForm({ name: '', type: 'Receita' }); if (receituarioCriarModeloEditorRef.current) receituarioCriarModeloEditorRef.current.innerHTML = ''; }}
                    style={{ width: 30, height: 30, border: 'none', background: '#F4F4F5', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A', flexShrink: 0 }}>
                    <i className="ti ti-arrow-left" style={{ fontSize: 13 }} />
                  </button>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#191C1D' }}>Criar modelo</div>
                    <div style={{ fontSize: 11, color: '#71717A' }}>Salve um modelo para reutilizar nos próximos atendimentos</div>
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Nome do modelo</label>
                    <input value={receituarioCriarModeloForm.name}
                      onChange={e => setReceituarioCriarModeloForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Ex: Receita de anti-inflamatório..."
                      style={{ width: '100%', height: 36, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, color: '#191C1D', background: '#FFFFFF', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Tipo</label>
                    <select value={receituarioCriarModeloForm.type}
                      onChange={e => setReceituarioCriarModeloForm(f => ({ ...f, type: e.target.value }))}
                      style={{ width: '100%', height: 36, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, color: '#374151', background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {['Receita', 'Receita controlada', 'Solicitação de exames', 'Atestado', 'Declaração', 'Orientações', 'Plano terapêutico', 'Outro'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Conteúdo</label>
                    <div style={{ border: '1px solid #E4E4E7', borderRadius: 8, overflow: 'hidden', background: '#FFFFFF' }}>
                      <div style={{ display: 'flex', gap: 2, padding: '5px 8px', borderBottom: '1px solid #F1F3F5', background: '#FAFAFA' }}>
                        {[['ti-bold','bold'],['ti-italic','italic'],['ti-underline','underline']].map(([icon, cmd]) => (
                          <button key={cmd} type="button" onClick={() => { receituarioCriarModeloEditorRef.current?.focus(); document.execCommand(cmd, false); }}
                            style={{ width: 26, height: 26, border: 'none', background: 'transparent', borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A' }}>
                            <i className={`ti ${icon}`} style={{ fontSize: 13 }} />
                          </button>
                        ))}
                      </div>
                      <div ref={receituarioCriarModeloEditorRef} contentEditable suppressContentEditableWarning
                        data-placeholder="Digite o conteúdo do modelo..."
                        style={{ padding: '12px 16px', outline: 'none', fontSize: 13, color: '#191C1D', lineHeight: 1.7, fontFamily: "'Inter', system-ui, sans-serif", minHeight: 180 }} />
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, color: '#A1A1AA' }}>
                      Variáveis:{' '}
                      {['{{nome_paciente}}','{{data_atual}}','{{profissional}}'].map(v => (
                        <code key={v} style={{ fontSize: 10, background: '#F4F4F5', padding: '1px 5px', borderRadius: 3, marginRight: 4 }}>{v}</code>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ flexShrink: 0, padding: '14px 24px', borderTop: '1px solid #E4E4E7', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => { setReceituarioCriarModeloOpen(false); setReceituarioCriarModeloForm({ name: '', type: 'Receita' }); if (receituarioCriarModeloEditorRef.current) receituarioCriarModeloEditorRef.current.innerHTML = ''; }}
                    style={{ height: 36, padding: '0 14px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Cancelar
                  </button>
                  <button
                    disabled={createTemplateMut.isPending}
                    onClick={() => {
                      const content = receituarioCriarModeloEditorRef.current?.innerHTML?.trim() || '';
                      const { name, type } = receituarioCriarModeloForm;
                      if (!name.trim()) { toast('Informe o nome do modelo.', 'error'); return; }
                      if (!content) { toast('Escreva o conteúdo do modelo.', 'error'); return; }
                      createTemplateMut.mutate({ name, type, content, active: true, showInProntuario: false }, {
                        onSuccess: () => {
                          setReceituarioCriarModeloOpen(false);
                          setReceituarioCriarModeloForm({ name: '', type: 'Receita' });
                          if (receituarioCriarModeloEditorRef.current) receituarioCriarModeloEditorRef.current.innerHTML = '';
                          toast('Modelo salvo com sucesso.', 'success');
                        },
                      });
                    }}
                    style={{ height: 36, padding: '0 14px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <i className="ti ti-bookmark" style={{ fontSize: 13 }} /> Salvar modelo
                  </button>
                  <button
                    disabled={createTemplateMut.isPending}
                    onClick={() => {
                      const content = receituarioCriarModeloEditorRef.current?.innerHTML?.trim() || '';
                      const { name, type } = receituarioCriarModeloForm;
                      if (!name.trim()) { toast('Informe o nome do modelo.', 'error'); return; }
                      if (!content) { toast('Escreva o conteúdo do modelo.', 'error'); return; }
                      createTemplateMut.mutate({ name, type, content, active: true, showInProntuario: false }, {
                        onSuccess: (created: any) => {
                          inserirTemplateReceituario(created);
                          setReceituarioCriarModeloOpen(false);
                          setReceituarioCriarModeloForm({ name: '', type: 'Receita' });
                          if (receituarioCriarModeloEditorRef.current) receituarioCriarModeloEditorRef.current.innerHTML = '';
                          toast('Modelo criado e inserido.', 'success');
                        },
                      });
                    }}
                    style={{ height: 36, padding: '0 16px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#FFF', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <i className="ti ti-corner-down-right" style={{ fontSize: 13 }} /> Salvar e usar agora
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* "Salvar como modelo" — prompt de nome */}
        {saveAsModelOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10008, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', system-ui, sans-serif" }}>
            <div style={{ background: '#FFFFFF', borderRadius: 16, width: 420, padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', border: '1px solid #E4E4E7' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className="ti ti-bookmark" style={{ fontSize: 18, color: '#374151' }} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#09090B' }}>Salvar como modelo</div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Nome do modelo</label>
                <input
                  value={saveAsModelName}
                  onChange={e => setSaveAsModelName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const name = saveAsModelName.trim();
                      if (!name) { toast('Informe o nome do modelo.', 'error'); return; }
                      const content = receituarioEditorRef.current?.innerHTML?.trim() || '';
                      createTemplateMut.mutate({ name, type: receituarioType, content, active: true, showInProntuario: false }, {
                        onSuccess: () => { setSaveAsModelOpen(false); toast('Modelo salvo com sucesso.', 'success'); },
                      });
                    }
                    if (e.key === 'Escape') setSaveAsModelOpen(false);
                  }}
                  autoFocus
                  placeholder="Ex: Receita padrão..."
                  style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, color: '#191C1D', background: '#FFFFFF', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setSaveAsModelOpen(false)}
                  style={{ height: 36, padding: '0 14px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancelar
                </button>
                <button
                  disabled={createTemplateMut.isPending}
                  onClick={() => {
                    const name = saveAsModelName.trim();
                    if (!name) { toast('Informe o nome do modelo.', 'error'); return; }
                    const content = receituarioEditorRef.current?.innerHTML?.trim() || '';
                    createTemplateMut.mutate({ name, type: receituarioType, content, active: true, showInProntuario: false }, {
                      onSuccess: () => { setSaveAsModelOpen(false); toast('Modelo salvo com sucesso.', 'success'); },
                    });
                  }}
                  style={{ height: 36, padding: '0 16px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#FFF', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                  {createTemplateMut.isPending
                    ? <><div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Salvando...</>
                    : <><i className="ti ti-bookmark" style={{ fontSize: 13 }} /> Salvar modelo</>
                  }
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm close — camada 5, acima de tudo */}
        {receituarioCloseConfirm && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10008, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', system-ui, sans-serif" }}>
            <div style={{ background: '#FFFFFF', borderRadius: 16, width: 380, padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', border: '1px solid #E4E4E7' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className="ti ti-alert-triangle" style={{ fontSize: 18, color: '#D97706' }} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#09090B' }}>Fechar sem salvar?</div>
              </div>
              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: '0 0 20px' }}>
                O conteúdo digitado será perdido. Deseja fechar mesmo assim?
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setReceituarioCloseConfirm(false)}
                  style={{ height: 36, padding: '0 14px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancelar
                </button>
                <button onClick={() => { setReceituarioCloseConfirm(false); setReceituarioOpen(false); }}
                  style={{ height: 36, padding: '0 14px', background: '#EF4444', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#FFF', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Fechar mesmo assim
                </button>
              </div>
            </div>
          </div>
        )}
      </Portal>
      )}

  {/* ── Unsaved Changes Modal ── */}
  {pendingNavPath !== null && (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ background: '#FFFFFF', borderRadius: 16, width: 420, padding: '28px 28px 24px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', border: '1px solid #E4E4E7' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: 20, color: '#D97706' }} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#09090B', lineHeight: 1.3 }}>Conteúdo não salvo</div>
            <div style={{ fontSize: 13, color: '#71717A', marginTop: 2 }}>Você possui texto no editor que ainda não foi salvo.</div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: '0 0 20px' }}>
          Se sair agora, o conteúdo digitado será perdido. Deseja salvar como rascunho antes de continuar?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={() => {
              const content = editorRef.current?.innerHTML?.trim();
              if (content) {
                saveMut.mutate(content, {
                  onSuccess: () => proceedNavigation(),
                  onError: () => cancelNavigation(),
                });
              } else {
                proceedNavigation();
              }
            }}
            disabled={saveMut.isPending}
            style={{ height: 40, padding: '0 16px', background: '#000000', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {saveMut.isPending
              ? <><div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Salvando...</>
              : <><i className="ti ti-device-floppy" style={{ fontSize: 14 }} /> Salvar rascunho e sair</>
            }
          </button>
          <button
            onClick={proceedNavigation}
            style={{ height: 40, padding: '0 16px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 10, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer' }}>
            Sair sem salvar
          </button>
          <button
            onClick={cancelNavigation}
            style={{ height: 40, padding: '0 16px', background: 'transparent', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 500, color: '#71717A', cursor: 'pointer' }}>
            Continuar editando
          </button>
        </div>
      </div>
    </div>
  )}
    </>
  );
}
