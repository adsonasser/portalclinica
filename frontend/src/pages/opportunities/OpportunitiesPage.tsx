import { useState, useRef } from 'react';
import { TableActions } from '../../components/ui/TableActions';
import { useToast } from '../../components/ui/Toast';

// ─── Types ────────────────────────────────────────────────────────────────────
type Temperatura = 'frio' | 'morno' | 'quente';

interface Etapa {
  id: string; nome: string; cor: string;
}
interface Funil {
  id: string; nome: string; cor: string; etapas: Etapa[];
}
interface Lead {
  id: string; nome: string; telefone: string; email?: string;
  origem: string; interesse: string; temperatura: Temperatura;
  responsavel: string; proximaAcao?: string;
  funil: string; etapa: string; valor?: number;
}
interface LeadPerdido extends Lead {
  motivo: string; perdidoEm: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const FUNIS: Funil[] = [
  {
    id:'nova_consulta', nome:'Nova Consulta', cor:'#2563EB',
    etapas:[
      { id:'nc_novo',      nome:'Novo lead',        cor:'#E4E4E7' },
      { id:'nc_contato',   nome:'Primeiro contato', cor:'#BFDBFE' },
      { id:'nc_qualif',    nome:'Qualificado',      cor:'#DDD6FE' },
      { id:'nc_valor',     nome:'Valor enviado',    cor:'#FDE68A' },
      { id:'nc_agendado',  nome:'Agendado',         cor:'#BBF7D0' },
    ],
  },
  {
    id:'reativacao', nome:'Reativação', cor:'#7C3AED',
    etapas:[
      { id:'re_inativo',   nome:'Paciente inativo',      cor:'#E4E4E7' },
      { id:'re_msg',       nome:'Mensagem enviada',       cor:'#BFDBFE' },
      { id:'re_respondeu', nome:'Respondeu',              cor:'#DDD6FE' },
      { id:'re_interesse', nome:'Interesse identificado', cor:'#FDE68A' },
      { id:'re_sugestao',  nome:'Agendamento sugerido',   cor:'#FCA5A5' },
      { id:'re_agendado',  nome:'Agendado',               cor:'#BBF7D0' },
    ],
  },
  {
    id:'plano_tratamento', nome:'Plano de Tratamento', cor:'#0D9488',
    etapas:[
      { id:'pt_consulta',  nome:'Consulta realizada', cor:'#E4E4E7' },
      { id:'pt_proposta',  nome:'Proposta enviada',   cor:'#BFDBFE' },
      { id:'pt_negoc',     nome:'Negociação',         cor:'#FDE68A' },
      { id:'pt_sinal',     nome:'Aguardando sinal',   cor:'#FCA5A5' },
      { id:'pt_contrato',  nome:'Contrato pendente',  cor:'#DDD6FE' },
      { id:'pt_fechado',   nome:'Fechado',            cor:'#BBF7D0' },
    ],
  },
];

const INIT_LEADS: Lead[] = [];

const INIT_PERDIDOS: LeadPerdido[] = [];

const TEMP_CFG: Record<Temperatura, { bg: string; color: string; label: string }> = {
  frio:   { bg:'#EFF6FF', color:'#2563EB', label:'Frio' },
  morno:  { bg:'#FFFBEB', color:'#D97706', label:'Morno' },
  quente: { bg:'#FEF2F2', color:'#DC2626', label:'Quente' },
};

function initials(nome: string) {
  return nome.split(' ').slice(0,2).map(n => n[0]).join('').toUpperCase();
}

// ─── Modais ───────────────────────────────────────────────────────────────────
function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:600, backdropFilter:'blur(3px)' }} />
      <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:601, width:480, background:'#FFFFFF', borderRadius:18, boxShadow:'0 24px 64px rgba(0,0,0,.18)', display:'flex', flexDirection:'column', fontFamily:"'Inter',system-ui,sans-serif", maxHeight:'88vh', animation:'fadeUp .16s ease' }}>
        {children}
      </div>
    </>
  );
}

function ModalHeader({ title, sub, onClose }: { title: string; sub?: string; onClose: () => void }) {
  return (
    <div style={{ padding:'18px 22px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexShrink:0 }}>
      <div>
        <div style={{ fontSize:16, fontWeight:700, color:'#191C1D' }}>{title}</div>
        {sub && <div style={{ fontSize:12, color:'#71717A', marginTop:2 }}>{sub}</div>}
      </div>
      <button onClick={onClose} style={{ width:30, height:30, border:'none', background:'#F4F4F5', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#71717A' }}>
        <i className="ti ti-x" style={{ fontSize:13 }} />
      </button>
    </div>
  );
}

const inp: React.CSSProperties = { width:'100%', height:38, padding:'0 12px', border:'1px solid #E4E4E7', borderRadius:9, fontSize:13, color:'#191C1D', background:'#FFFFFF', outline:'none', boxSizing:'border-box', fontFamily:'inherit' };
const lbl: React.CSSProperties = { display:'block', fontSize:12, fontWeight:500, color:'#71717A', marginBottom:5 };

function GanhoModal({ lead, onClose, onConfirm }: { lead: Lead; onClose: () => void; onConfirm: () => void }) {
  return (
    <ModalOverlay onClose={onClose}>
      <ModalHeader title="Oportunidade ganha 🏆" sub={`${lead.nome} · ${lead.interesse}`} onClose={onClose} />
      <div style={{ padding:'20px 22px', overflowY:'auto', display:'flex', flexDirection:'column', gap:14 }}>
        <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:10, padding:'12px 16px', fontSize:13, color:'#16A34A', display:'flex', gap:8, alignItems:'center' }}>
          <i className="ti ti-trophy" style={{ fontSize:16 }} /> Parabéns! Registre os dados do fechamento.
        </div>
        <div>
          <label style={lbl}>Valor final <span style={{fontSize:11,color:'#9CA3AF'}}>(opcional)</span></label>
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', fontSize:13, color:'#71717A', pointerEvents:'none' }}>R$</span>
            <input defaultValue={lead.valor?.toFixed(2).replace('.',',') ?? ''} placeholder="0,00" style={{ ...inp, paddingLeft:36 }} />
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {[
            'Criar contato / paciente no sistema?',
            'Criar venda / orçamento?',
            'Criar agendamento?',
          ].map((l, i) => (
            <label key={l} style={{ display:'flex', alignItems:'center', gap:9, fontSize:13, color:'#374151', cursor:'pointer', padding:'9px 12px', borderRadius:9, border:'1px solid #E4E4E7', background:'#FAFAFA' }}>
              <input type="checkbox" defaultChecked={i < 2} style={{ width:14, height:14, accentColor:'#000', flexShrink:0 }} /> {l}
            </label>
          ))}
        </div>
        <div>
          <label style={lbl}>Observação</label>
          <textarea rows={2} placeholder="Notas do fechamento..." style={{ ...inp, height:'auto', padding:'8px 12px', resize:'vertical' }} />
        </div>
      </div>
      <div style={{ padding:'14px 22px', borderTop:'1px solid #F1F5F9', display:'flex', gap:10, flexShrink:0 }}>
        <button onClick={onClose} style={{ flex:1, height:40, border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:10, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
        <button onClick={() => { onConfirm(); onClose(); }} style={{ flex:2, height:40, background:'#16A34A', border:'none', borderRadius:10, fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
          <i className="ti ti-check" style={{ fontSize:14 }} /> Confirmar ganho
        </button>
      </div>
    </ModalOverlay>
  );
}

const MOTIVOS_PERDA = ['Achou caro','Não respondeu','Quer convênio','Sem perfil','Escolheu outro profissional','Sem disponibilidade','Vai pensar','Não tem urgência','Outro'];
const REATIVAR_OPTS = ['7 dias','15 dias','30 dias','60 dias','Data personalizada'];

function PerdidoModal({ lead, onClose, onConfirm }: { lead: Lead; onClose: () => void; onConfirm: (motivo: string) => void }) {
  const [reativar, setReativar] = useState(false);
  const [motivo, setMotivo] = useState('');
  return (
    <ModalOverlay onClose={onClose}>
      <ModalHeader title="Oportunidade perdida" sub={`${lead.nome} · ${lead.interesse}`} onClose={onClose} />
      <div style={{ padding:'20px 22px', overflowY:'auto', display:'flex', flexDirection:'column', gap:14 }}>
        <div>
          <label style={lbl}>Motivo da perda <span style={{color:'#DC2626'}}>*</span></label>
          <select value={motivo} onChange={e => setMotivo(e.target.value)} style={{ ...inp, height:38, cursor:'pointer' }}>
            <option value="">Selecionar motivo</option>
            {MOTIVOS_PERDA.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Observação <span style={{fontSize:11,color:'#9CA3AF'}}>(opcional)</span></label>
          <textarea rows={2} placeholder="Detalhes da perda..." style={{ ...inp, height:'auto', padding:'8px 12px', resize:'vertical' }} />
        </div>
        <label style={{ display:'flex', alignItems:'center', gap:9, fontSize:13, color:'#374151', cursor:'pointer', padding:'10px 13px', borderRadius:9, border:'1px solid #E4E4E7', background:'#FAFAFA' }}>
          <input type="checkbox" checked={reativar} onChange={e => setReativar(e.target.checked)} style={{ width:14, height:14, accentColor:'#000' }} />
          Reativar futuramente?
        </label>
        {reativar && (
          <div>
            <label style={lbl}>Reativar em</label>
            <select style={{ ...inp, height:38, cursor:'pointer' }}>
              {REATIVAR_OPTS.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
        )}
      </div>
      <div style={{ padding:'14px 22px', borderTop:'1px solid #F1F5F9', display:'flex', gap:10, flexShrink:0 }}>
        <button onClick={onClose} style={{ flex:1, height:40, border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:10, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
        <button onClick={() => { onConfirm(motivo || 'Não informado'); onClose(); }} style={{ flex:2, height:40, background:'#DC2626', border:'none', borderRadius:10, fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
          <i className="ti ti-x" style={{ fontSize:14 }} /> Registrar perda
        </button>
      </div>
    </ModalOverlay>
  );
}

function TrocarFunilModal({ lead, onClose, onConfirm }: { lead: Lead; onClose: () => void; onConfirm: (destFunilId: string, destEtapaId: string) => void }) {
  const [destFunil, setDestFunil] = useState('');
  const [destEtapa, setDestEtapa] = useState('');
  const funilAtual = FUNIS.find(f => f.id === lead.funil);
  const funilDest  = FUNIS.find(f => f.id === destFunil);
  return (
    <ModalOverlay onClose={onClose}>
      <ModalHeader title="Trocar de funil" sub={`${lead.nome} · ${funilAtual?.nome}`} onClose={onClose} />
      <div style={{ padding:'20px 22px', overflowY:'auto', display:'flex', flexDirection:'column', gap:14 }}>
        <div style={{ background:'#F9FAFB', border:'1px solid #E5E7EB', borderRadius:10, padding:'10px 14px' }}>
          <div style={{ fontSize:11, color:'#9CA3AF', fontWeight:500, marginBottom:3, textTransform:'uppercase', letterSpacing:'.04em' }}>Funil atual</div>
          <div style={{ fontSize:13, fontWeight:600, color:'#191C1D' }}>{funilAtual?.nome}</div>
        </div>
        <div>
          <label style={lbl}>Funil de destino <span style={{color:'#DC2626'}}>*</span></label>
          <select value={destFunil} onChange={e => { setDestFunil(e.target.value); setDestEtapa(''); }} style={{ ...inp, height:38, cursor:'pointer' }}>
            <option value="">Selecionar funil</option>
            {FUNIS.filter(f => f.id !== lead.funil).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </div>
        {funilDest && (
          <div>
            <label style={lbl}>Etapa de destino <span style={{color:'#DC2626'}}>*</span></label>
            <select value={destEtapa} onChange={e => setDestEtapa(e.target.value)} style={{ ...inp, height:38, cursor:'pointer' }}>
              <option value="">Selecionar etapa</option>
              {funilDest.etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </div>
        )}
        <label style={{ display:'flex', alignItems:'center', gap:9, fontSize:13, color:'#374151', cursor:'pointer', padding:'10px 13px', borderRadius:9, border:'1px solid #E4E4E7', background:'#FAFAFA' }}>
          <input type="checkbox" defaultChecked style={{ width:14, height:14, accentColor:'#000' }} />
          Manter responsável atual?
        </label>
        <div>
          <label style={lbl}>Observação <span style={{fontSize:11,color:'#9CA3AF'}}>(opcional)</span></label>
          <textarea rows={2} placeholder="Motivo da transferência..." style={{ ...inp, height:'auto', padding:'8px 12px', resize:'vertical' }} />
        </div>
      </div>
      <div style={{ padding:'14px 22px', borderTop:'1px solid #F1F5F9', display:'flex', gap:10, flexShrink:0 }}>
        <button onClick={onClose} style={{ flex:1, height:40, border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:10, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
        <button onClick={() => { if (destFunil && destEtapa) { onConfirm(destFunil, destEtapa); onClose(); } }} style={{ flex:2, height:40, background: (destFunil && destEtapa) ? '#000' : '#A1A1AA', border:'none', borderRadius:10, fontSize:13, fontWeight:600, color:'#fff', cursor: (destFunil && destEtapa) ? 'pointer' : 'default', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
          <i className="ti ti-arrows-exchange" style={{ fontSize:14 }} /> Transferir oportunidade
        </button>
      </div>
    </ModalOverlay>
  );
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────
function KanbanCard({
  lead, isDragging,
  onDragStart, onDragEnd,
}: {
  lead: Lead; isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const temp = TEMP_CFG[lead.temperatura];
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        background:'#FFFFFF', borderRadius:10, border: isDragging ? '1.5px dashed #A1A1AA' : '1px solid #E4E4E7',
        padding:'13px 14px', cursor:'grab', userSelect:'none',
        opacity: isDragging ? .45 : 1,
        boxShadow: isDragging ? 'none' : '0 1px 3px rgba(0,0,0,.04)',
        transition:'opacity .15s, box-shadow .15s',
      }}
    >
      {/* Top */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, marginBottom:8 }}>
        <span style={{ fontSize:13, fontWeight:600, color:'#09090B', lineHeight:1.3 }}>{lead.nome}</span>
        <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:99, background:temp.bg, color:temp.color, whiteSpace:'nowrap', letterSpacing:'.04em', flexShrink:0, textTransform:'uppercase' }}>{temp.label}</span>
      </div>

      {/* Meta */}
      <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom: lead.proximaAcao ? 10 : 10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#71717A' }}>
          <i className="ti ti-brand-whatsapp" style={{ fontSize:11, color:'#16A34A' }} /> {lead.telefone}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#71717A' }}>
          <i className="ti ti-map-pin" style={{ fontSize:11 }} /> {lead.origem}
        </div>
        <div style={{ fontSize:11, color:'#374151', fontWeight:500 }}>{lead.interesse}</div>
      </div>

      {/* Próxima ação */}
      {lead.proximaAcao && (
        <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:6, padding:'5px 9px', fontSize:11, color:'#D97706', display:'flex', gap:5, alignItems:'center', marginBottom:10 }}>
          <i className="ti ti-bell" style={{ fontSize:11, flexShrink:0 }} /> {lead.proximaAcao}
        </div>
      )}

      {/* Footer */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:4 }}>
        {lead.valor ? (
          <span style={{ fontSize:12, fontWeight:700, color:'#09090B' }}>
            {lead.valor.toLocaleString('pt-BR', { style:'currency', currency:'BRL' })}
          </span>
        ) : <span />}
        <div style={{ width:26, height:26, borderRadius:'50%', background:'#F4F4F5', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#71717A' }}>
          {initials(lead.responsavel)}
        </div>
      </div>
    </div>
  );
}

// ─── Drag Footer (visible only while dragging) ────────────────────────────────
type DropZone = 'trocar' | 'ganho' | 'perdido';

function DragFooter({ visible, onDrop }: { visible: boolean; onDrop: (z: DropZone) => void }) {
  const [hoveredZone, setHoveredZone] = useState<DropZone | null>(null);

  const handleOver = (e: React.DragEvent, zone: DropZone) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setHoveredZone(zone);
  };
  const handleLeave = () => setHoveredZone(null);
  const handleDrop  = (e: React.DragEvent, zone: DropZone) => {
    e.preventDefault();
    setHoveredZone(null);
    onDrop(zone);
  };

  const zones: { id: DropZone; icon: string; label: string; color: string; bg: string; hbg: string }[] = [
    { id:'trocar',  icon:'ti-arrows-exchange', label:'Trocar de funil',    color:'rgba(255,255,255,.85)', bg:'rgba(255,255,255,.07)', hbg:'rgba(255,255,255,.14)' },
    { id:'ganho',   icon:'ti-trophy',          label:'Marcar como ganho',  color:'#86EFAC',               bg:'rgba(22,163,74,.22)',   hbg:'rgba(22,163,74,.38)' },
    { id:'perdido', icon:'ti-x',               label:'Marcar como perdido', color:'#FCA5A5',              bg:'rgba(220,38,38,.22)',   hbg:'rgba(220,38,38,.38)' },
  ];

  return (
    <div style={{
      position:'fixed', bottom:0, left:96, right:0, zIndex:400,
      background:'rgba(9,9,11,.92)', backdropFilter:'blur(10px)',
      padding:'12px 28px', display:'flex', gap:12,
      transform: visible ? 'translateY(0)' : 'translateY(100%)',
      transition:'transform .22s ease',
      borderTop:'1px solid rgba(255,255,255,.08)',
    }}>
      <div style={{ display:'flex', alignItems:'center', fontSize:12, color:'rgba(255,255,255,.4)', gap:8, flexShrink:0, marginRight:4 }}>
        <i className="ti ti-drag-drop" style={{ fontSize:14 }} /> Soltar aqui:
      </div>
      {zones.map(z => (
        <div key={z.id}
          onDragOver={e => handleOver(e, z.id)}
          onDragLeave={handleLeave}
          onDrop={e => handleDrop(e, z.id)}
          style={{
            flex:1, height:52, borderRadius:12, cursor:'copy',
            border:`1.5px dashed ${z.color}55`,
            background: hoveredZone === z.id ? z.hbg : z.bg,
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            color:z.color, fontSize:13, fontWeight:600,
            transition:'background .12s',
            transform: hoveredZone === z.id ? 'scale(1.015)' : 'scale(1)',
          }}>
          <i className={`ti ${z.icon}`} style={{ fontSize:18 }} /> {z.label}
        </div>
      ))}
    </div>
  );
}

// ─── Kanban View ──────────────────────────────────────────────────────────────
function FunilView({
  leads, setLeads,
  funil,
  onGanho, onPerdido, onTrocar,
}: {
  leads: Lead[]; setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  funil: Funil;
  onGanho: (l: Lead) => void;
  onPerdido: (l: Lead) => void;
  onTrocar: (l: Lead) => void;
}) {
  const [draggingId, setDraggingId]   = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const droppedRef = useRef(false);

  const funilLeads = leads.filter(l => l.funil === funil.id);

  const handleDragStart = (e: React.DragEvent, lead: Lead) => {
    e.dataTransfer.setData('leadId', lead.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(lead.id);
    droppedRef.current = false;
  };

  const handleDragEnd = () => {
    setTimeout(() => {
      if (!droppedRef.current) setDraggingId(null);
      setDragOverCol(null);
    }, 60);
  };

  const handleColOver = (e: React.DragEvent, etapaId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(etapaId);
  };

  const handleColDrop = (e: React.DragEvent, etapaId: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('leadId');
    droppedRef.current = true;
    setLeads(prev => prev.map(l => l.id === id ? { ...l, etapa: etapaId } : l));
    setDraggingId(null);
    setDragOverCol(null);
  };

  const handleFooterDrop = (zone: DropZone) => {
    droppedRef.current = true;
    const lead = leads.find(l => l.id === draggingId);
    setDraggingId(null);
    if (!lead) return;
    if (zone === 'ganho')   onGanho(lead);
    if (zone === 'perdido') onPerdido(lead);
    if (zone === 'trocar')  onTrocar(lead);
  };

  return (
    <>
      {/* Columns */}
      <div style={{ display:'flex', gap:14, overflowX:'auto', paddingBottom: draggingId ? 80 : 28, paddingTop:4, paddingLeft:28, paddingRight:28, flex:1, minHeight:0 }}>
        {funil.etapas.map(etapa => {
          const etapaLeads = funilLeads.filter(l => l.etapa === etapa.id);
          const isOver     = dragOverCol === etapa.id;
          return (
            <div key={etapa.id}
              onDragOver={e => handleColOver(e, etapa.id)}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={e => handleColDrop(e, etapa.id)}
              style={{ width:240, flexShrink:0, display:'flex', flexDirection:'column', gap:0 }}>
              {/* Column header */}
              <div style={{ marginBottom:10 }}>
                <div style={{ height:3, borderRadius:'99px 99px 0 0', background:etapa.cor, marginBottom:0 }} />
                <div style={{ background:'#FFFFFF', border:'1px solid #E5E7EB', borderTop:'none', borderRadius:'0 0 10px 10px', padding:'10px 14px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:700, color:'#191C1D' }}>{etapa.nome}</div>
                    <div style={{ fontSize:11, color:'#9CA3AF', marginTop:1 }}>{etapaLeads.length} lead{etapaLeads.length !== 1 ? 's' : ''}</div>
                  </div>
                  <button style={{ width:24, height:24, border:'none', background:'#F4F4F5', borderRadius:6, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#71717A' }}>
                    <i className="ti ti-plus" style={{ fontSize:12 }} />
                  </button>
                </div>
              </div>

              {/* Drop zone feedback */}
              <div style={{
                flex:1, display:'flex', flexDirection:'column', gap:8,
                padding:'8px',
                borderRadius:10,
                background: isOver ? '#F0F9FF' : 'transparent',
                border: isOver ? '2px dashed #BAE6FD' : '2px dashed transparent',
                minHeight:120,
                transition:'background .1s, border-color .1s',
              }}>
                {etapaLeads.map(lead => (
                  <KanbanCard
                    key={lead.id}
                    lead={lead}
                    isDragging={draggingId === lead.id}
                    onDragStart={e => handleDragStart(e, lead)}
                    onDragEnd={handleDragEnd}
                  />
                ))}
                {etapaLeads.length === 0 && !isOver && (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, fontSize:11, color:'#D1D5DB', minHeight:60 }}>
                    Soltar aqui
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <DragFooter visible={!!draggingId} onDrop={handleFooterDrop} />
    </>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────
function ListaView({ leads, funil }: { leads: Lead[]; funil: Funil }) {
  const [search, setSearch] = useState('');
  const { toast } = useToast();
  const ni = () => toast('Funcionalidade ainda não implementada.', 'info');
  const funilLeads = leads.filter(l => l.funil === funil.id)
    .filter(l => !search || l.nome.toLowerCase().includes(search.toLowerCase()) || l.interesse.toLowerCase().includes(search.toLowerCase()));
  return (
    <div style={{ padding:'0 28px 28px' }}>
      <div style={{ marginBottom:14, display:'flex', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, height:34, padding:'0 10px', border:'1px solid #E4E4E7', borderRadius:9, background:'#FFFFFF', width:280 }}>
          <i className="ti ti-search" style={{ fontSize:13, color:'#9CA3AF' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar lead..."
            style={{ border:'none', background:'transparent', fontSize:12, outline:'none', width:'100%', fontFamily:'inherit', color:'#191C1D' }} />
        </div>
      </div>
      <div style={{ background:'#FFFFFF', borderRadius:14, border:'1px solid #E5E7EB', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,.04)' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#F9FAFB', borderBottom:'1px solid #E5E7EB' }}>
              {['Lead','Etapa','Temperatura','Origem','Interesse','Responsável','Próxima ação','Ações'].map((h, i) => (
                <th key={h} style={{ padding:'10px 16px', textAlign: i === 7 ? 'right' : 'left', fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'.05em', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {funilLeads.map(l => {
              const temp  = TEMP_CFG[l.temperatura];
              const etapa = funil.etapas.find(e => e.id === l.etapa);
              return (
                <tr key={l.id} style={{ borderBottom:'1px solid #F1F5F9' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#191C1D' }}>{l.nome}</div>
                    <div style={{ fontSize:11, color:'#71717A', display:'flex', alignItems:'center', gap:4, marginTop:2 }}>
                      <i className="ti ti-brand-whatsapp" style={{ fontSize:11, color:'#16A34A' }} /> {l.telefone}
                    </div>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:etapa?.cor ?? '#E4E4E7', flexShrink:0 }} />
                      <span style={{ fontSize:12, color:'#374151' }}>{etapa?.nome ?? '—'}</span>
                    </div>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:99, background:temp.bg, color:temp.color }}>{temp.label}</span>
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:12, color:'#71717A' }}>{l.origem}</td>
                  <td style={{ padding:'12px 16px', fontSize:12, color:'#374151' }}>{l.interesse}</td>
                  <td style={{ padding:'12px 16px', fontSize:12, color:'#71717A' }}>{l.responsavel}</td>
                  <td style={{ padding:'12px 16px', fontSize:12, color: l.proximaAcao ? '#D97706' : '#D1D5DB' }}>
                    {l.proximaAcao ?? '—'}
                  </td>
                  <td style={{ padding:'12px 16px', textAlign:'right' }}>
                    <TableActions
                      primaryAction={{ label:'Abrir', icon:'ti-external-link', variant:'default', onClick: ni }}
                      secondaryActions={[
                        { label:'Editar lead', icon:'ti-pencil', onClick: ni },
                        { label:'Mover etapa', icon:'ti-arrows-right-left', onClick: ni },
                        { label:'Agendar', icon:'ti-calendar-plus', onClick: ni },
                        { label:'Criar venda', icon:'ti-receipt', onClick: ni },
                        { label:'Marcar como ganho', icon:'ti-trophy', variant:'default', onClick: ni, separator: true },
                        { label:'Marcar como perdido', icon:'ti-x', variant:'danger', onClick: ni },
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
            {funilLeads.length === 0 && (
              <tr><td colSpan={8} style={{ padding:'48px', textAlign:'center', fontSize:13, color:'#9CA3AF' }}>Nenhum lead encontrado</td></tr>
            )}
          </tbody>
        </table>
        <div style={{ padding:'11px 20px', borderTop:'1px solid #F1F5F9', background:'#FAFAFA', fontSize:12, color:'#71717A' }}>
          <b style={{color:'#191C1D'}}>{funilLeads.length}</b> leads neste funil
        </div>
      </div>
    </div>
  );
}

// ─── Perdidas View ────────────────────────────────────────────────────────────
function PerdidasView({ perdidos }: { perdidos: LeadPerdido[] }) {
  const { toast } = useToast();
  const ni = () => toast('Funcionalidade ainda não implementada.', 'info');
  return (
    <div style={{ padding:'0 28px 28px' }}>
      <div style={{ background:'#FFFFFF', borderRadius:14, border:'1px solid #E5E7EB', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,.04)' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#F9FAFB', borderBottom:'1px solid #E5E7EB' }}>
              {['Lead','Funil','Motivo da perda','Perdido em','Responsável','Ações'].map((h, i) => (
                <th key={h} style={{ padding:'10px 16px', textAlign: i === 5 ? 'right' : 'left', fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'.05em', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {perdidos.map(l => {
              const funil = FUNIS.find(f => f.id === l.funil);
              return (
                <tr key={l.id} style={{ borderBottom:'1px solid #F1F5F9' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#191C1D' }}>{l.nome}</div>
                    <div style={{ fontSize:11, color:'#71717A', marginTop:2 }}>{l.telefone}</div>
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:12, color:'#71717A' }}>{funil?.nome}</td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ fontSize:11, fontWeight:600, padding:'2px 9px', borderRadius:99, background:'#FEF2F2', color:'#DC2626' }}>{l.motivo}</span>
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:12, color:'#71717A' }}>{l.perdidoEm}</td>
                  <td style={{ padding:'12px 16px', fontSize:12, color:'#71717A' }}>{l.responsavel}</td>
                  <td style={{ padding:'12px 16px', textAlign:'right' }}>
                    <TableActions
                      primaryAction={{ label:'Reativar', icon:'ti-refresh', variant:'success', onClick: ni }}
                      secondaryActions={[
                        { label:'Ver lead', icon:'ti-eye', onClick: ni },
                        { label:'Trocar funil', icon:'ti-arrows-exchange', onClick: ni },
                        { label:'Excluir', icon:'ti-trash', variant:'danger', onClick: ni, separator: true },
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ padding:'11px 20px', borderTop:'1px solid #F1F5F9', background:'#FAFAFA', fontSize:12, color:'#71717A' }}>
          <b style={{color:'#191C1D'}}>{perdidos.length}</b> oportunidades perdidas
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function OpportunitiesPage() {
  const [activeTab,  setActiveTab]  = useState('funil');
  const [activeFunil, setActiveFunil] = useState(FUNIS[0].id);
  const [leads,      setLeads]      = useState<Lead[]>(INIT_LEADS);
  const [ganhoLead,  setGanhoLead]  = useState<Lead | null>(null);
  const [perdidoLead, setPerdidoLead] = useState<Lead | null>(null);
  const [trocarLead, setTrocarLead] = useState<Lead | null>(null);
  const [perdidos, setPerdidos] = useState<LeadPerdido[]>(INIT_PERDIDOS);

  const handleGanhoConfirm = () => {
    if (!ganhoLead) return;
    setLeads(prev => prev.filter(l => l.id !== ganhoLead.id));
  };
  const handlePerdidoConfirm = (motivo: string) => {
    if (!perdidoLead) return;
    setPerdidos(prev => [...prev, { ...perdidoLead, motivo, perdidoEm: new Date().toLocaleDateString('pt-BR') }]);
    setLeads(prev => prev.filter(l => l.id !== perdidoLead.id));
  };
  const handleTrocarConfirm = (destFunilId: string, destEtapaId: string) => {
    if (!trocarLead) return;
    setLeads(prev => prev.map(l => l.id === trocarLead.id ? { ...l, funil: destFunilId, etapa: destEtapaId } : l));
  };

  const funil      = FUNIS.find(f => f.id === activeFunil)!;
  const funilLeads = leads.filter(l => l.funil === activeFunil);

  const kpis = [
    { label:'Novos leads',    value: String(leads.filter(l=>l.etapa.endsWith('_novo')||l.etapa.endsWith('_inativo')).length || 3), sub:'esta semana',         icon:'ti-user-plus',    iconBg:'#EFF6FF', iconColor:'#2563EB' },
    { label:'Em negociação',  value: String(leads.filter(l=>!l.etapa.endsWith('_agendado')&&!l.etapa.endsWith('_fechado')).length), sub:'em todos os funis', icon:'ti-messages',    iconBg:'#F5F3FF', iconColor:'#7C3AED' },
    { label:'Agendados',      value: String(leads.filter(l=>l.etapa.endsWith('_agendado')||l.etapa.endsWith('_fechado')).length), sub:'aguardando consulta', icon:'ti-calendar-check', iconBg:'#F0FDF4', iconColor:'#16A34A' },
    { label:'Ganhos no mês',  value:'8', sub:'R$ 45.600 convertidos',  icon:'ti-trophy',       iconBg:'#FFFBEB', iconColor:'#D97706' },
  ];

  const TABS = [
    { key:'funil',      label:'Funil' },
    { key:'lista',      label:'Lista' },
    { key:'importacoes', label:'Importações' },
    { key:'perdidas',   label:'Perdidas' },
    { key:'relatorios', label:'Relatórios' },
  ];

  return (
    <>
      <style>{`
        @keyframes fadeUp  { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      <div style={{ height:'100%', display:'flex', flexDirection:'column', overflow:'hidden', background:'transparent', fontFamily:"'Inter', system-ui, sans-serif" }}>

        {/* ── Scrollable (only for KPIs + tab bar) ─────────────────────────── */}
        <div style={{ flexShrink:0, padding:'16px 28px 0' }}>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginBottom:16 }}>
            {[
              { icon:'ti-settings',    label:'Configurações' },
              { icon:'ti-file-import', label:'Importar' },
              { icon:'ti-download',    label:'Exportar' },
            ].map(b => (
              <button key={b.label}
                style={{ height:34, padding:'0 14px', border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:99, fontSize:13, fontWeight:500, color:'#18181B', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#FFFFFF'; }}>
                <i className={`ti ${b.icon}`} style={{ fontSize:14 }} /> {b.label}
              </button>
            ))}
            <button
              style={{ height:38, padding:'0 18px', background:'#000', border:'none', borderRadius:99, fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', gap:7, fontFamily:'inherit', boxShadow:'0 2px 8px rgba(0,0,0,0.15)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#18181B'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#000'; }}>
              <i className="ti ti-plus" style={{ fontSize:15 }} /> Novo lead
            </button>
          </div>

          {/* KPI Cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
            {kpis.map(k => (
              <div key={k.label}
                style={{ background:'#FFFFFF', borderRadius:14, border:'1px solid #E5E7EB', padding:'16px 20px', display:'flex', alignItems:'center', gap:14, boxShadow:'0 1px 3px rgba(0,0,0,.04)' }}>
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

          {/* Tab bar + funil selector */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #E5E7EB', paddingBottom:0, background:'#FFFFFF', borderRadius:'12px 12px 0 0', padding:'0 4px' }}>
            <div style={{ display:'flex' }}>
              {TABS.map(t => {
                const active = activeTab === t.key;
                return (
                  <button key={t.key} onClick={() => setActiveTab(t.key)}
                    style={{ height:42, padding:'0 16px', border:'none', background:'none', fontSize:13, fontWeight: active?600:400, color: active?'#191C1D':'#71717A', cursor:'pointer', fontFamily:'inherit', borderBottom: active?'2px solid #000':'2px solid transparent', whiteSpace:'nowrap', marginBottom:-1 }}>
                    {t.label}
                    {t.key === 'perdidas' && (
                      <span style={{ marginLeft:5, fontSize:10, fontWeight:700, padding:'1px 5px', borderRadius:99, background: active?'#FEF2F2':'#F4F4F5', color: active?'#DC2626':'#71717A' }}>
                        {perdidos.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {(activeTab === 'funil' || activeTab === 'lista') && (
              <div style={{ display:'flex', alignItems:'center', gap:10, paddingRight:4 }}>
                <div style={{ width:10, height:10, borderRadius:'50%', background:funil.cor, flexShrink:0 }} />
                <select value={activeFunil} onChange={e => setActiveFunil(e.target.value)}
                  style={{ height:30, padding:'0 10px', border:'1px solid #E4E4E7', borderRadius:8, fontSize:12, fontWeight:600, color:'#191C1D', background:'#FFFFFF', cursor:'pointer' }}>
                  {FUNIS.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
                <span style={{ fontSize:11, color:'#9CA3AF' }}>{funil.etapas.length} etapas · {funilLeads.length} leads</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Tab content ───────────────────────────────────────────────────── */}
        <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          {activeTab === 'funil' && (
            <FunilView
              leads={leads} setLeads={setLeads}
              funil={funil}
              onGanho={setGanhoLead}
              onPerdido={setPerdidoLead}
              onTrocar={setTrocarLead}
            />
          )}
          {activeTab === 'lista' && <ListaView leads={leads} funil={funil} />}
          {activeTab === 'perdidas' && <PerdidasView perdidos={perdidos} />}
          {(activeTab === 'importacoes' || activeTab === 'relatorios') && (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:10, color:'#9CA3AF' }}>
              <i className={`ti ${activeTab === 'relatorios' ? 'ti-chart-bar' : 'ti-file-import'}`} style={{ fontSize:40, color:'#D1D5DB' }} />
              <div style={{ fontSize:15, fontWeight:600, color:'#6B7280' }}>{activeTab === 'relatorios' ? 'Relatórios' : 'Importações'} em breve</div>
              <div style={{ fontSize:13 }}>Esta seção será desenvolvida em uma próxima etapa.</div>
            </div>
          )}
        </div>
      </div>

      {ganhoLead   && <GanhoModal   lead={ganhoLead}   onClose={() => setGanhoLead(null)}   onConfirm={handleGanhoConfirm} />}
      {perdidoLead && <PerdidoModal lead={perdidoLead} onClose={() => setPerdidoLead(null)} onConfirm={handlePerdidoConfirm} />}
      {trocarLead  && <TrocarFunilModal lead={trocarLead} onClose={() => setTrocarLead(null)} onConfirm={handleTrocarConfirm} />}
    </>
  );
}
