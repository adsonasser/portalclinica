import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../../components/ui/Toast';

// ─── Types ────────────────────────────────────────────────────────────────────
type ProdStatus = 'ok' | 'atencao' | 'estoque_baixo' | 'vencendo' | 'vencido' | 'sem_estoque' | 'inativo';
type MovTipo    = 'entrada' | 'saida' | 'ajuste' | 'perda' | 'vencimento';
type ExpStatus  = 'vencendo' | 'atencao' | 'vencido';

interface Produto {
  id: number; nome: string; unidade: string; categoria: string;
  atual: number; minimo: number; ideal: number;
  validade: string; dias: number | null; status: ProdStatus;
}

interface Movimentacao {
  id: number; data: string; tipo: MovTipo; produto: string;
  qtd: string; lote: string; motivo: string; paciente: string; profissional: string;
}

interface ValidadeItem {
  produto: string; lote: string; qtd: string; validade: string; dias: number; status: ExpStatus;
}

interface Sugestao {
  produto: string; atual: number; minimo: number; ideal: number; sugestao: number; motivo: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const INIT_PRODUTOS: Produto[] = [
  { id:  1, nome: 'Vitamina C 500mg',           unidade: 'Ampola',   categoria: 'Soroterapia',              atual: 48,  minimo: 20, ideal: 60, validade: '2026-08-15', dias: 68,  status: 'ok' },
  { id:  2, nome: 'Vitamina D3 200.000UI',       unidade: 'Ampola',   categoria: 'Injetáveis',               atual: 22,  minimo: 10, ideal: 40, validade: '2026-09-30', dias: 114, status: 'ok' },
  { id:  3, nome: 'Complexo B Injetável',        unidade: 'Ampola',   categoria: 'Injetáveis',               atual: 8,   minimo: 15, ideal: 40, validade: '2026-07-20', dias: 42,  status: 'estoque_baixo' },
  { id:  4, nome: 'Glutationa Reduzida 600mg',   unidade: 'Frasco',   categoria: 'Soroterapia',              atual: 14,  minimo: 8,  ideal: 24, validade: '2026-10-05', dias: 119, status: 'ok' },
  { id:  5, nome: 'Magnésio Dimalato',           unidade: 'Frasco',   categoria: 'Suplementos internos',     atual: 6,   minimo: 10, ideal: 20, validade: '2026-12-01', dias: 176, status: 'estoque_baixo' },
  { id:  6, nome: 'Seringa 20ml c/ agulha',      unidade: 'Caixa',    categoria: 'Insumos descartáveis',     atual: 4,   minimo: 5,  ideal: 12, validade: '2027-03-10', dias: 275, status: 'estoque_baixo' },
  { id:  7, nome: 'Luva de procedimento M',      unidade: 'Caixa',    categoria: 'Materiais de enfermagem',  atual: 7,   minimo: 5,  ideal: 15, validade: '2027-06-30', dias: 387, status: 'ok' },
  { id:  8, nome: 'Scalp 23G',                   unidade: 'Caixa',    categoria: 'Insumos descartáveis',     atual: 3,   minimo: 5,  ideal: 10, validade: '2027-01-15', dias: 221, status: 'estoque_baixo' },
  { id:  9, nome: 'NaCl 0,9% 250ml',             unidade: 'Unidade',  categoria: 'Soroterapia',              atual: 30,  minimo: 15, ideal: 40, validade: '2026-11-20', dias: 165, status: 'ok' },
  { id: 10, nome: 'Dipirona Sódica 1g/2ml',      unidade: 'Ampola',   categoria: 'Medicamentos',             atual: 18,  minimo: 10, ideal: 30, validade: '2026-06-25', dias: 17,  status: 'vencendo' },
  { id: 11, nome: 'Omeprazol 20mg',              unidade: 'Caixa',    categoria: 'Medicamentos',             atual: 5,   minimo: 5,  ideal: 12, validade: '2026-05-10', dias: null, status: 'vencido' },
  { id: 12, nome: 'Ácido Hialurônico 20mg/ml',   unidade: 'Frasco',   categoria: 'Injetáveis',               atual: 4,   minimo: 3,  ideal: 10, validade: '2026-07-08', dias: 30,  status: 'vencendo' },
  { id: 13, nome: 'Bioimpedância — eletrodos',   unidade: 'Pacote',   categoria: 'Exames/Testes',            atual: 12,  minimo: 5,  ideal: 20, validade: '2027-04-01', dias: 297, status: 'ok' },
  { id: 14, nome: 'Álcool 70% 1L',               unidade: 'Frasco',   categoria: 'Materiais de enfermagem',  atual: 9,   minimo: 5,  ideal: 15, validade: '2026-10-15', dias: 129, status: 'ok' },
  { id: 15, nome: 'Kit coleta a vácuo',           unidade: 'Kit',      categoria: 'Exames/Testes',            atual: 0,   minimo: 5,  ideal: 10, validade: '2027-02-20', dias: 257, status: 'sem_estoque' },
  { id: 16, nome: 'Colchicina 0,5mg',            unidade: 'Caixa',    categoria: 'Medicamentos',             atual: 2,   minimo: 3,  ideal: 8,  validade: '2026-08-01', dias: 54,  status: 'atencao' },
  { id: 17, nome: 'Probiótico Lactobacillus',    unidade: 'Frasco',   categoria: 'Suplementos internos',     atual: 10,  minimo: 5,  ideal: 20, validade: '2026-09-12', dias: 96,  status: 'ok' },
];

const MOVIMENTACOES: Movimentacao[] = [
  { id: 1, data: '08/06/2025', tipo: 'entrada',  produto: 'Vitamina C 500mg',        qtd: '+12 ampolas',  lote: 'L2025-041', motivo: 'Reposição mensal',   paciente: '—',               profissional: 'Adm. Clínica' },
  { id: 2, data: '07/06/2025', tipo: 'saida',    produto: 'Glutationa Reduzida',     qtd: '-2 frascos',   lote: 'L2025-032', motivo: 'Atendimento',        paciente: 'Ana B. Santos',   profissional: 'Dra. Jéssica' },
  { id: 3, data: '05/06/2025', tipo: 'saida',    produto: 'Vitamina D3 200.000UI',   qtd: '-1 ampola',    lote: 'L2025-028', motivo: 'Atendimento',        paciente: 'Carlos E. Lima',  profissional: 'Dra. Jéssica' },
  { id: 4, data: '03/06/2025', tipo: 'ajuste',   produto: 'NaCl 0,9% 250ml',         qtd: '+5 unidades',  lote: 'L2025-055', motivo: 'Correção inventário', paciente: '—',               profissional: 'Adm. Clínica' },
  { id: 5, data: '01/06/2025', tipo: 'perda',    produto: 'Dipirona Sódica',         qtd: '-3 ampolas',   lote: 'L2024-099', motivo: 'Frasco quebrado',    paciente: '—',               profissional: 'Adm. Clínica' },
];

const VALIDADES: ValidadeItem[] = [
  { produto: 'Dipirona Sódica 1g/2ml',  lote: 'L2024-099', qtd: '18 ampolas', validade: '25/06/2026', dias: 17,  status: 'vencendo' },
  { produto: 'Ácido Hialurônico 20mg',  lote: 'L2025-017', qtd: '4 frascos',  validade: '08/07/2026', dias: 30,  status: 'vencendo' },
  { produto: 'Omeprazol 20mg',          lote: 'L2024-078', qtd: '5 caixas',   validade: '10/05/2026', dias: null, status: 'vencido' },
  { produto: 'Colchicina 0,5mg',        lote: 'L2025-003', qtd: '2 caixas',   validade: '01/08/2026', dias: 54,  status: 'atencao' },
];

const SUGESTOES: Sugestao[] = [
  { produto: 'Complexo B Injetável',  atual: 8,  minimo: 15, ideal: 40, sugestao: 32, motivo: 'Estoque abaixo do mínimo' },
  { produto: 'Seringa 20ml c/ agulha', atual: 4, minimo: 5,  ideal: 12, sugestao: 8,  motivo: 'Estoque abaixo do mínimo' },
  { produto: 'Scalp 23G',             atual: 3,  minimo: 5,  ideal: 10, sugestao: 7,  motivo: 'Estoque abaixo do mínimo' },
  { produto: 'Kit coleta a vácuo',    atual: 0,  minimo: 5,  ideal: 10, sugestao: 10, motivo: 'Sem estoque' },
  { produto: 'Magnésio Dimalato',     atual: 6,  minimo: 10, ideal: 20, sugestao: 14, motivo: 'Estoque abaixo do mínimo' },
];

// ─── Status Configs ───────────────────────────────────────────────────────────
const PROD_STATUS: Record<ProdStatus, { bg: string; color: string; label: string }> = {
  ok:           { bg:'#DCFCE7', color:'#16A34A', label:'Ok' },
  atencao:      { bg:'#FEFCE8', color:'#A16207', label:'Atenção' },
  estoque_baixo:{ bg:'#FFF7ED', color:'#C2410C', label:'Estoque baixo' },
  vencendo:     { bg:'#FEF2F2', color:'#B91C1C', label:'Vencendo' },
  vencido:      { bg:'#FEF2F2', color:'#DC2626', label:'Vencido' },
  sem_estoque:  { bg:'#FEF2F2', color:'#DC2626', label:'Sem estoque' },
  inativo:      { bg:'#F4F4F5', color:'#71717A', label:'Inativo' },
};

const MOV_TIPO: Record<MovTipo, { bg: string; color: string; label: string; icon: string }> = {
  entrada:    { bg:'#DCFCE7', color:'#16A34A', label:'Entrada',    icon:'ti-circle-arrow-down' },
  saida:      { bg:'#EFF6FF', color:'#2563EB', label:'Saída',      icon:'ti-circle-arrow-up' },
  ajuste:     { bg:'#FEFCE8', color:'#A16207', label:'Ajuste',     icon:'ti-adjustments' },
  perda:      { bg:'#FEF2F2', color:'#DC2626', label:'Perda',      icon:'ti-alert-triangle' },
  vencimento: { bg:'#F4F4F5', color:'#71717A', label:'Vencimento', icon:'ti-calendar-x' },
};

const EXP_STATUS: Record<ExpStatus, { bg: string; color: string; label: string }> = {
  vencendo: { bg:'#FEF2F2', color:'#B91C1C', label:'Vencendo' },
  atencao:  { bg:'#FEFCE8', color:'#A16207', label:'Atenção' },
  vencido:  { bg:'#FEF2F2', color:'#DC2626', label:'Vencido' },
};

const CATEGORIAS  = ['Injetáveis','Soroterapia','Medicamentos','Insumos descartáveis','Materiais de enfermagem','Exames/Testes','Suplementos internos','Equipamentos/consumo','Outros'];
const UNIDADES    = ['Unidade','Ampola','Frasco','Caixa','Seringa','Ml','Dose','Kit','Pacote'];
const MOTIVOS     = ['Uso em paciente','Perda','Vencimento','Ajuste manual','Quebra','Teste interno','Doação/amostra','Outro'];
const PROFISSIONAIS = ['Dra. Jéssica Rezende','Kamila','Enfermagem','Nutricionista','Admin'];
const FORNECEDORES  = ['Farmácia X','Distribuidora Y','Lab Z','Fornecedor Geral'];
const LOCAIS        = ['Geladeira','Armário principal','Enfermagem','Sala de aplicação','Estoque geral'];

// ─── Shared Styles ────────────────────────────────────────────────────────────
const inp: React.CSSProperties = { width:'100%', height:38, padding:'0 12px', border:'1px solid #E4E4E7', borderRadius:9, fontSize:13, color:'#191C1D', background:'#FFFFFF', outline:'none', boxSizing:'border-box', fontFamily:'inherit' };
const lbl: React.CSSProperties = { display:'block', fontSize:12, fontWeight:500, color:'#71717A', marginBottom:5 };

function SectionHeader({ icon, iconBg, iconColor, title }: { icon: string; iconBg: string; iconColor: string; title: string }) {
  return (
    <div style={{ fontSize:14, fontWeight:700, color:'#191C1D', marginBottom:16, paddingBottom:12, borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', gap:10 }}>
      <div style={{ width:30, height:30, borderRadius:9, background:iconBg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <i className={`ti ${icon}`} style={{ fontSize:14, color:iconColor }} />
      </div>
      {title}
    </div>
  );
}

// ─── Modal: Nova Entrada ──────────────────────────────────────────────────────
function NovaEntradaModal({ onClose, produtos, onSave }: { onClose: () => void; produtos: Produto[]; onSave: (prodId: number, qty: number) => void }) {
  const [prodId, setProdId] = useState(0);
  const [qty, setQty] = useState('');
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', zIndex:300, backdropFilter:'blur(3px)' }} />
      <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:540, background:'#FFFFFF', borderRadius:18, zIndex:301, boxShadow:'0 24px 64px rgba(0,0,0,.16)', display:'flex', flexDirection:'column', fontFamily:"'Inter',system-ui,sans-serif", animation:'fadeUp .18s ease', maxHeight:'90vh' }}>
        <div style={{ padding:'18px 24px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:'#191C1D' }}>Nova entrada</div>
            <div style={{ fontSize:12, color:'#71717A', marginTop:2 }}>Registrar entrada de produto no estoque</div>
          </div>
          <button onClick={onClose} style={{ width:30, height:30, border:'none', background:'#F4F4F5', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#71717A' }}>
            <i className="ti ti-x" style={{ fontSize:13 }} />
          </button>
        </div>
        <div style={{ padding:'20px 24px', overflowY:'auto', display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Produto <span style={{color:'#DC2626'}}>*</span></label>
              <select value={prodId} onChange={e => setProdId(Number(e.target.value))} style={{ ...inp, height:38, cursor:'pointer' }}>
                <option value={0}>Selecionar produto</option>
                {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Quantidade <span style={{color:'#DC2626'}}>*</span></label>
              <input type="number" min={1} placeholder="Ex: 20" value={qty} onChange={e => setQty(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Lote</label>
              <input placeholder="Ex: VD2301" style={inp} />
            </div>
            <div>
              <label style={lbl}>Validade</label>
              <input type="date" style={inp} />
            </div>
            <div>
              <label style={lbl}>Custo unitário</label>
              <div style={{ position:'relative' }}>
                <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', fontSize:13, color:'#71717A', pointerEvents:'none' }}>R$</span>
                <input placeholder="0,00" style={{ ...inp, paddingLeft:36 }} />
              </div>
            </div>
            <div>
              <label style={lbl}>Fornecedor</label>
              <select style={{ ...inp, height:38, cursor:'pointer' }}>
                <option value="">Selecionar</option>
                {FORNECEDORES.map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Data da entrada</label>
              <input type="date" defaultValue="2026-05-26" style={inp} />
            </div>
            <div>
              <label style={lbl}>Nota fiscal / comprovante</label>
              <input placeholder="Opcional" style={inp} />
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Observação</label>
              <textarea placeholder="Observação opcional..." rows={2} style={{ ...inp, height:'auto', padding:'8px 12px', resize:'vertical' }} />
            </div>
          </div>
          <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#16A34A', display:'flex', gap:8, alignItems:'center' }}>
            <i className="ti ti-info-circle" style={{ fontSize:14, flexShrink:0 }} />
            Ao salvar, o estoque será atualizado e uma movimentação de entrada será registrada.
          </div>
        </div>
        <div style={{ padding:'14px 24px', borderTop:'1px solid #F1F5F9', display:'flex', gap:10 }}>
          <button onClick={onClose} style={{ flex:1, height:40, border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:10, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
          <button onClick={() => { if (prodId && qty) { onSave(prodId, parseInt(qty)); onClose(); } }} style={{ flex:2, height:40, background: prodId && qty ? '#000' : '#A1A1AA', border:'none', borderRadius:10, fontSize:13, fontWeight:600, color:'#fff', cursor: prodId && qty ? 'pointer' : 'not-allowed', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
            <i className="ti ti-circle-arrow-down" style={{ fontSize:14 }} /> Registrar entrada
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Modal: Lançar Consumo ────────────────────────────────────────────────────
function LancarConsumoModal({ onClose, produtos, onSave }: { onClose: () => void; produtos: Produto[]; onSave: (prodId: number, qty: number) => void }) {
  const [prodId, setProdId] = useState(0);
  const [qty, setQty] = useState('');
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', zIndex:300, backdropFilter:'blur(3px)' }} />
      <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:540, background:'#FFFFFF', borderRadius:18, zIndex:301, boxShadow:'0 24px 64px rgba(0,0,0,.16)', display:'flex', flexDirection:'column', fontFamily:"'Inter',system-ui,sans-serif", animation:'fadeUp .18s ease', maxHeight:'90vh' }}>
        <div style={{ padding:'18px 24px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:'#191C1D' }}>Lançar consumo</div>
            <div style={{ fontSize:12, color:'#71717A', marginTop:2 }}>Registre consumo avulso ou exceção fora de sessão</div>
          </div>
          <button onClick={onClose} style={{ width:30, height:30, border:'none', background:'#F4F4F5', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#71717A' }}>
            <i className="ti ti-x" style={{ fontSize:13 }} />
          </button>
        </div>
        <div style={{ padding:'20px 24px', overflowY:'auto', display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Produto <span style={{color:'#DC2626'}}>*</span></label>
              <select value={prodId} onChange={e => setProdId(Number(e.target.value))} style={{ ...inp, height:38, cursor:'pointer' }}>
                <option value={0}>Selecionar produto</option>
                {produtos.map(p => <option key={p.id} value={p.id}>{p.nome} (Lote sugerido: FEFO)</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Quantidade <span style={{color:'#DC2626'}}>*</span></label>
              <input type="number" min={1} placeholder="Ex: 1" value={qty} onChange={e => setQty(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Motivo <span style={{color:'#DC2626'}}>*</span></label>
              <select style={{ ...inp, height:38, cursor:'pointer' }}>
                <option value="">Selecionar motivo</option>
                {MOTIVOS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Paciente <span style={{ fontSize:11, color:'#9CA3AF' }}>(opcional)</span></label>
              <input placeholder="Buscar paciente..." style={inp} />
            </div>
            <div>
              <label style={lbl}>Sessão vinculada <span style={{ fontSize:11, color:'#9CA3AF' }}>(opcional)</span></label>
              <input placeholder="ID ou nome da sessão..." style={inp} />
            </div>
            <div>
              <label style={lbl}>Profissional responsável <span style={{color:'#DC2626'}}>*</span></label>
              <select style={{ ...inp, height:38, cursor:'pointer' }}>
                <option value="">Selecionar</option>
                {PROFISSIONAIS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Data</label>
              <input type="date" defaultValue="2026-05-26" style={inp} />
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Observação</label>
              <textarea placeholder="Observação opcional..." rows={2} style={{ ...inp, height:'auto', padding:'8px 12px', resize:'vertical' }} />
            </div>
          </div>
          <div style={{ background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#C2410C', display:'flex', gap:8, alignItems:'center' }}>
            <i className="ti ti-info-circle" style={{ fontSize:14, flexShrink:0 }} />
            O sistema usará automaticamente o lote com validade mais próxima (FEFO).
          </div>
        </div>
        <div style={{ padding:'14px 24px', borderTop:'1px solid #F1F5F9', display:'flex', gap:10 }}>
          <button onClick={onClose} style={{ flex:1, height:40, border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:10, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
          <button onClick={() => { if (prodId && qty) { onSave(prodId, parseInt(qty)); onClose(); } }} style={{ flex:2, height:40, background: prodId && qty ? '#C2410C' : '#A1A1AA', border:'none', borderRadius:10, fontSize:13, fontWeight:600, color:'#fff', cursor: prodId && qty ? 'pointer' : 'not-allowed', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
            <i className="ti ti-circle-arrow-up" style={{ fontSize:14 }} /> Registrar consumo
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Modal: Novo Produto (right drawer) ───────────────────────────────────────
function NovoProdutoModal({ onClose, onSave }: { onClose: () => void; onSave: (p: Produto) => void }) {
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState('');
  const [unidade, setUnidade] = useState('');
  const [atual, setAtual] = useState('0');
  const [minimo, setMinimo] = useState('0');
  const [ideal, setIdeal] = useState('0');
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', zIndex:300, backdropFilter:'blur(3px)' }} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:700, background:'#F8F9FA', zIndex:301, display:'flex', flexDirection:'column', fontFamily:"'Inter',system-ui,sans-serif", boxShadow:'-8px 0 48px rgba(0,0,0,.13)', animation:'slideIn .22s ease' }}>
        <div style={{ flexShrink:0, background:'#FFFFFF', borderBottom:'1px solid #E5E7EB', padding:'18px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:17, fontWeight:700, color:'#191C1D' }}>Novo produto</div>
            <div style={{ fontSize:12, color:'#71717A', marginTop:2 }}>Cadastre um produto ou insumo no estoque</div>
          </div>
          <button onClick={onClose} style={{ width:32, height:32, border:'none', background:'#F4F4F5', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#71717A' }}>
            <i className="ti ti-x" style={{ fontSize:14 }} />
          </button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>

          {/* Dados principais */}
          <div style={{ background:'#FFFFFF', borderRadius:14, border:'1px solid #E5E7EB', padding:'20px 24px', marginBottom:16 }}>
            <SectionHeader icon="ti-package" iconBg="#EFF6FF" iconColor="#2563EB" title="Dados principais" />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Nome do produto <span style={{color:'#DC2626'}}>*</span></label>
                <input placeholder="Ex: Vitamina D3 100.000 UI" value={nome} onChange={e => setNome(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lbl}>Categoria <span style={{color:'#DC2626'}}>*</span></label>
                <select value={categoria} onChange={e => setCategoria(e.target.value)} style={{ ...inp, height:38, cursor:'pointer' }}>
                  <option value="">Selecionar</option>
                  {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Unidade de medida <span style={{color:'#DC2626'}}>*</span></label>
                <select value={unidade} onChange={e => setUnidade(e.target.value)} style={{ ...inp, height:38, cursor:'pointer' }}>
                  <option value="">Selecionar</option>
                  {UNIDADES.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Fornecedor padrão</label>
                <select style={{ ...inp, height:38, cursor:'pointer' }}>
                  <option value="">Selecionar</option>
                  {FORNECEDORES.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Local de armazenamento</label>
                <select style={{ ...inp, height:38, cursor:'pointer' }}>
                  <option value="">Selecionar</option>
                  {LOCAIS.map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Status</label>
                <select defaultValue="ativo" style={{ ...inp, height:38, cursor:'pointer' }}>
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Observações</label>
                <textarea placeholder="Informações internas sobre o produto..." rows={2} style={{ ...inp, height:'auto', padding:'8px 12px', resize:'vertical' }} />
              </div>
            </div>
          </div>

          {/* Controle de estoque */}
          <div style={{ background:'#FFFFFF', borderRadius:14, border:'1px solid #E5E7EB', padding:'20px 24px', marginBottom:16 }}>
            <SectionHeader icon="ti-chart-bar" iconBg="#F0FDF4" iconColor="#16A34A" title="Controle de estoque" />
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:14 }}>
              <div>
                <label style={lbl}>Estoque atual</label>
                <input type="number" min={0} value={atual} onChange={e => setAtual(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lbl}>Estoque mínimo</label>
                <input type="number" min={0} value={minimo} onChange={e => setMinimo(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lbl}>Estoque ideal</label>
                <input type="number" min={0} value={ideal} onChange={e => setIdeal(e.target.value)} style={inp} />
              </div>
              <div style={{ gridColumn:'1/-1', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                {[
                  { label:'Controla validade?', checked:true },
                  { label:'Controla lote?',     checked:true },
                  { label:'Permite saldo negativo?', checked:false },
                ].map(({ label, checked }) => (
                  <label key={label} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'#374151', cursor:'pointer', padding:'9px 12px', borderRadius:9, border:'1px solid #E4E4E7', background:'#FAFAFA', userSelect:'none' }}>
                    <input type="checkbox" defaultChecked={checked} style={{ width:14, height:14, accentColor:'#000', flexShrink:0 }} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Compra */}
          <div style={{ background:'#FFFFFF', borderRadius:14, border:'1px solid #E5E7EB', padding:'20px 24px' }}>
            <SectionHeader icon="ti-shopping-cart" iconBg="#FFFBEB" iconColor="#D97706" title="Compra" />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div>
                <label style={lbl}>Custo unitário</label>
                <div style={{ position:'relative' }}>
                  <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', fontSize:13, color:'#71717A', pointerEvents:'none' }}>R$</span>
                  <input placeholder="0,00" style={{ ...inp, paddingLeft:36 }} />
                </div>
              </div>
              <div>
                <label style={lbl}>Quantidade mínima de compra</label>
                <input type="number" min={1} placeholder="Ex: 10" style={inp} />
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Observações de compra</label>
                <textarea placeholder="Informações para compra..." rows={2} style={{ ...inp, height:'auto', padding:'8px 12px', resize:'vertical' }} />
              </div>
            </div>
          </div>
        </div>
        <div style={{ flexShrink:0, background:'#FFFFFF', borderTop:'1px solid #E5E7EB', padding:'14px 24px', display:'flex', gap:10 }}>
          <button onClick={onClose} style={{ flex:1, height:40, border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:10, fontSize:13, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
          <button onClick={() => { if (nome && categoria && unidade) { onSave({ id: Date.now(), nome, unidade, categoria, atual: parseInt(atual)||0, minimo: parseInt(minimo)||0, ideal: parseInt(ideal)||0, validade:'—', dias:null, status:'ok' }); onClose(); } }} style={{ flex:2, height:40, background: nome && categoria && unidade ? '#000' : '#A1A1AA', border:'none', borderRadius:10, fontSize:13, fontWeight:600, color:'#fff', cursor: nome && categoria && unidade ? 'pointer' : 'not-allowed', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
            <i className="ti ti-check" style={{ fontSize:14 }} /> Criar produto
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Tab: Produtos ────────────────────────────────────────────────────────────
function ProdutosTab({ onNovoProduto, produtos }: { onNovoProduto: () => void; produtos: Produto[] }) {
  const { toast } = useToast();
  const ni = () => toast('Funcionalidade ainda não implementada.', 'info');
  const [filtroRapido, setFiltroRapido] = useState('todos');
  const [catFilter,    setCatFilter]    = useState('');
  const [search,       setSearch]       = useState('');

  const FILTROS_RAPIDOS = [
    { key:'todos',           label:'Todos' },
    { key:'estoque_baixo',   label:'Estoque baixo' },
    { key:'vencendo',        label:'Vencendo' },
    { key:'atencao',         label:'Atenção' },
  ];

  const filtered = produtos.filter(p => {
    if (filtroRapido === 'estoque_baixo') return p.status === 'estoque_baixo';
    if (filtroRapido === 'vencendo')      return p.status === 'vencendo';
    if (filtroRapido === 'atencao')       return p.status === 'atencao';
    return true;
  }).filter(p => !catFilter || p.categoria === catFilter)
    .filter(p => !search || p.nome.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      {/* Filters */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:14, flexWrap:'wrap' }}>
        <div style={{ display:'flex', background:'#F4F4F5', borderRadius:10, padding:3 }}>
          {FILTROS_RAPIDOS.map(f => {
            const active = filtroRapido === f.key;
            return (
              <button key={f.key} onClick={() => setFiltroRapido(f.key)}
                style={{ height:30, padding:'0 12px', borderRadius:8, border:'none', fontSize:12, fontWeight: active?600:400, color: active?'#191C1D':'#71717A', background: active?'#FFFFFF':'transparent', cursor:'pointer', fontFamily:'inherit', boxShadow: active?'0 1px 3px rgba(0,0,0,.08)':'none', whiteSpace:'nowrap' }}>
                {f.label}
              </button>
            );
          })}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            style={{ height:34, padding:'0 12px', border:'1px solid #E4E4E7', borderRadius:9, fontSize:12, color: catFilter?'#191C1D':'#9CA3AF', background:'#FFFFFF', cursor:'pointer' }}>
            <option value="">Todas categorias</option>
            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div style={{ display:'flex', alignItems:'center', gap:6, height:34, padding:'0 10px', border:'1px solid #E4E4E7', borderRadius:9, background:'#FFFFFF', width:220 }}>
            <i className="ti ti-search" style={{ fontSize:13, color:'#9CA3AF' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar produto..."
              style={{ border:'none', background:'transparent', fontSize:12, outline:'none', width:'100%', fontFamily:'inherit', color:'#191C1D' }} />
          </div>
          <button onClick={onNovoProduto}
            style={{ height:34, padding:'0 14px', border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:9, fontSize:12, fontWeight:500, color:'#374151', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#FFFFFF'; }}>
            <i className="ti ti-plus" style={{ fontSize:13 }} /> Novo produto
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ background:'#FFFFFF', borderRadius:14, border:'1px solid #E5E7EB', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,.04)' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#F9FAFB', borderBottom:'1px solid #E5E7EB' }}>
              {['Produto','Categoria','Estoque atual','Mínimo','Validade próxima','Status','Ações'].map((h, i) => (
                <th key={h} style={{ padding:'10px 16px', textAlign: i===2||i===3?'center':i===6?'right':'left', fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'.05em', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const st  = PROD_STATUS[p.status];
              const low = p.atual < p.minimo;
              return (
                <tr key={p.id} style={{ borderBottom:'1px solid #F1F5F9' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#191C1D' }}>{p.nome}</div>
                    <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>{p.unidade}</div>
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:12, color:'#71717A' }}>{p.categoria}</td>
                  <td style={{ padding:'12px 16px', textAlign:'center' }}>
                    <div style={{ fontSize:14, fontWeight:700, color: low ? '#C2410C' : '#191C1D' }}>{p.atual} <span style={{ fontSize:11, fontWeight:400, color:'#9CA3AF' }}>{p.unidade.toLowerCase()}s</span></div>
                    {low && <div style={{ fontSize:10, color:'#C2410C', marginTop:2 }}>↓ abaixo do mínimo</div>}
                  </td>
                  <td style={{ padding:'12px 16px', textAlign:'center', fontSize:13, color:'#71717A' }}>{p.minimo}</td>
                  <td style={{ padding:'12px 16px' }}>
                    {p.validade !== '—' ? (
                      <div>
                        <div style={{ fontSize:12, color: (p.dias ?? 999) <= 15 ? '#DC2626' : (p.dias ?? 999) <= 45 ? '#D97706' : '#374151' }}>{p.validade}</div>
                        <div style={{ fontSize:11, color:'#9CA3AF', marginTop:1 }}>{p.dias} dias</div>
                      </div>
                    ) : (
                      <span style={{ fontSize:12, color:'#D1D5DB' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ fontSize:11, fontWeight:600, padding:'2px 9px', borderRadius:99, background:st.bg, color:st.color, whiteSpace:'nowrap' }}>{st.label}</span>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                      {(p.status === 'ok' || p.status === 'inativo') ? (
                        <button onClick={ni} style={{ height:30, padding:'0 14px', background:'#F4F4F5', border:'none', borderRadius:8, fontSize:12, fontWeight:500, color:'#374151', cursor:'pointer', fontFamily:'inherit' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#E4E4E7'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; }}>
                          Ver
                        </button>
                      ) : (
                        <button onClick={ni} style={{ height:30, padding:'0 14px', background: p.status === 'vencendo' ? '#FEF2F2' : '#FFF7ED', border:'none', borderRadius:8, fontSize:12, fontWeight:600, color: p.status === 'vencendo' ? '#DC2626' : '#C2410C', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                          Comprar
                        </button>
                      )}
                      <button onClick={ni} style={{ width:28, height:28, border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:7, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#71717A' }}
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
        <div style={{ padding:'11px 20px', borderTop:'1px solid #F1F5F9', background:'#FAFAFA', display:'flex', justifyContent:'space-between', fontSize:12, color:'#71717A' }}>
          <span>Mostrando <b style={{color:'#191C1D'}}>{filtered.length}</b> de <b style={{color:'#191C1D'}}>{produtos.length}</b> produtos</span>
          <span>Página 1 de 1</span>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Movimentações ───────────────────────────────────────────────────────
function MovimentacoesTab() {
  const { toast } = useToast();
  const ni = () => toast('Funcionalidade ainda não implementada.', 'info');
  const [tipoFilter, setTipoFilter] = useState('');
  const [search,     setSearch]     = useState('');

  const filtered = MOVIMENTACOES
    .filter(m => !tipoFilter || m.tipo === tipoFilter)
    .filter(m => !search || m.produto.toLowerCase().includes(search.toLowerCase()) || m.paciente.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:14 }}>
        <select value={tipoFilter} onChange={e => setTipoFilter(e.target.value)}
          style={{ height:34, padding:'0 12px', border:'1px solid #E4E4E7', borderRadius:9, fontSize:12, color: tipoFilter?'#191C1D':'#9CA3AF', background:'#FFFFFF', cursor:'pointer' }}>
          <option value="">Todos os tipos</option>
          {Object.entries(MOV_TIPO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <div style={{ display:'flex', alignItems:'center', gap:6, height:34, padding:'0 10px', border:'1px solid #E4E4E7', borderRadius:9, background:'#FFFFFF', width:240 }}>
          <i className="ti ti-search" style={{ fontSize:13, color:'#9CA3AF' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar produto ou paciente..."
            style={{ border:'none', background:'transparent', fontSize:12, outline:'none', width:'100%', fontFamily:'inherit', color:'#191C1D' }} />
        </div>
      </div>
      <div style={{ background:'#FFFFFF', borderRadius:14, border:'1px solid #E5E7EB', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,.04)' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#F9FAFB', borderBottom:'1px solid #E5E7EB' }}>
              {['Data','Tipo','Produto','Quantidade','Lote','Motivo','Paciente','Profissional',''].map((h, i) => (
                <th key={h} style={{ padding:'10px 16px', textAlign: i===8?'right':'left', fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'.05em', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => {
              const tp = MOV_TIPO[m.tipo];
              return (
                <tr key={m.id} style={{ borderBottom:'1px solid #F1F5F9' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding:'11px 16px', fontSize:12, color:'#71717A', whiteSpace:'nowrap' }}>{m.data}</td>
                  <td style={{ padding:'11px 16px' }}>
                    <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:99, background:tp.bg, color:tp.color, display:'inline-flex', alignItems:'center', gap:5 }}>
                      <i className={`ti ${tp.icon}`} style={{ fontSize:11 }} />{tp.label}
                    </span>
                  </td>
                  <td style={{ padding:'11px 16px', fontSize:13, fontWeight:500, color:'#191C1D', maxWidth:160 }}>
                    <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.produto}</div>
                  </td>
                  <td style={{ padding:'11px 16px', fontSize:12, color:'#374151', whiteSpace:'nowrap' }}>{m.qtd}</td>
                  <td style={{ padding:'11px 16px', fontSize:12, color:'#9CA3AF' }}>{m.lote || '—'}</td>
                  <td style={{ padding:'11px 16px', fontSize:12, color:'#374151' }}>{m.motivo}</td>
                  <td style={{ padding:'11px 16px', fontSize:12, color: m.paciente === '—' ? '#D1D5DB' : '#374151' }}>{m.paciente}</td>
                  <td style={{ padding:'11px 16px', fontSize:12, color:'#71717A' }}>{m.profissional}</td>
                  <td style={{ padding:'11px 16px', textAlign:'right' }}>
                    <button onClick={ni} style={{ height:28, padding:'0 12px', background:'#F4F4F5', border:'none', borderRadius:7, fontSize:11, fontWeight:500, color:'#71717A', cursor:'pointer', fontFamily:'inherit' }}>Ver</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ padding:'11px 20px', borderTop:'1px solid #F1F5F9', background:'#FAFAFA', display:'flex', justifyContent:'space-between', fontSize:12, color:'#71717A' }}>
          <span>Mostrando <b style={{color:'#191C1D'}}>{filtered.length}</b> movimentações</span>
          <span>Página 1 de 1</span>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Validades ───────────────────────────────────────────────────────────
function ValidadesTab() {
  const { toast } = useToast();
  const ni = () => toast('Funcionalidade ainda não implementada.', 'info');
  return (
    <div>
      <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:10, padding:'10px 16px', marginBottom:14, fontSize:13, color:'#B91C1C', display:'flex', gap:8, alignItems:'center' }}>
        <i className="ti ti-alert-triangle" style={{ fontSize:15, flexShrink:0 }} />
        <span><b>Atenção:</b> Produtos com validade próxima devem ter consumo priorizado. Use a lógica FEFO — o primeiro que vence deve ser o primeiro a sair.</span>
      </div>
      <div style={{ background:'#FFFFFF', borderRadius:14, border:'1px solid #E5E7EB', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,.04)' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#F9FAFB', borderBottom:'1px solid #E5E7EB' }}>
              {['Produto','Lote','Quantidade','Validade','Dias restantes','Status','Ações'].map((h, i) => (
                <th key={h} style={{ padding:'10px 16px', textAlign: i===4?'center':i===6?'right':'left', fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'.05em', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {VALIDADES.map((v, i) => {
              const st = EXP_STATUS[v.status];
              return (
                <tr key={i} style={{ borderBottom:'1px solid #F1F5F9' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding:'12px 16px', fontSize:13, fontWeight:600, color:'#191C1D' }}>{v.produto}</td>
                  <td style={{ padding:'12px 16px', fontSize:12, color:'#71717A' }}>{v.lote}</td>
                  <td style={{ padding:'12px 16px', fontSize:12, color:'#374151' }}>{v.qtd}</td>
                  <td style={{ padding:'12px 16px', fontSize:12, color: v.dias <= 15 ? '#DC2626' : '#374151', fontWeight: v.dias <= 15 ? 600 : 400 }}>{v.validade}</td>
                  <td style={{ padding:'12px 16px', textAlign:'center' }}>
                    <span style={{ fontSize:12, fontWeight:700, color: v.dias <= 15 ? '#DC2626' : v.dias <= 45 ? '#D97706' : '#374151' }}>{v.dias} dias</span>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ fontSize:11, fontWeight:600, padding:'2px 9px', borderRadius:99, background:st.bg, color:st.color }}>{st.label}</span>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                      {v.dias <= 30 ? (
                        <button onClick={ni} style={{ height:28, padding:'0 11px', background:'#FFF7ED', border:'none', borderRadius:7, fontSize:11, fontWeight:600, color:'#C2410C', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>Priorizar uso</button>
                      ) : (
                        <button onClick={ni} style={{ height:28, padding:'0 11px', background:'#F4F4F5', border:'none', borderRadius:7, fontSize:11, fontWeight:500, color:'#71717A', cursor:'pointer', fontFamily:'inherit' }}>Ver</button>
                      )}
                      <button onClick={ni} style={{ height:28, padding:'0 11px', background:'#FEF2F2', border:'none', borderRadius:7, fontSize:11, fontWeight:500, color:'#DC2626', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>Dar baixa</button>
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
}

// ─── Tab: Sugestão de Compras ─────────────────────────────────────────────────
function SugestaoTab() {
  const { toast } = useToast();
  const ni = () => toast('Funcionalidade ainda não implementada.', 'info');
  return (
    <div>
      <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:10, padding:'10px 16px', marginBottom:14, fontSize:13, color:'#2563EB', display:'flex', gap:8, alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <i className="ti ti-bulb" style={{ fontSize:15, flexShrink:0 }} />
          <span>Sugestão calculada automaticamente: <b>Estoque ideal − Estoque atual.</b> {SUGESTOES.length} produtos precisam de reposição.</span>
        </div>
        <button style={{ height:32, padding:'0 14px', background:'#2563EB', border:'none', borderRadius:8, fontSize:12, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap', flexShrink:0 }}>
          Exportar lista
        </button>
      </div>
      <div style={{ background:'#FFFFFF', borderRadius:14, border:'1px solid #E5E7EB', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,.04)' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#F9FAFB', borderBottom:'1px solid #E5E7EB' }}>
              {['Produto','Atual','Mínimo','Ideal','Sugestão de compra','Motivo','Ação'].map((h, i) => (
                <th key={h} style={{ padding:'10px 16px', textAlign: i>=1&&i<=4?'center':i===6?'right':'left', fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'.05em', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SUGESTOES.map((s, i) => (
              <tr key={i} style={{ borderBottom:'1px solid #F1F5F9' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding:'13px 16px', fontSize:13, fontWeight:600, color:'#191C1D' }}>{s.produto}</td>
                <td style={{ padding:'13px 16px', textAlign:'center', fontSize:13, fontWeight:700, color: s.atual < s.minimo ? '#DC2626' : '#374151' }}>{s.atual}</td>
                <td style={{ padding:'13px 16px', textAlign:'center', fontSize:13, color:'#71717A' }}>{s.minimo}</td>
                <td style={{ padding:'13px 16px', textAlign:'center', fontSize:13, color:'#71717A' }}>{s.ideal}</td>
                <td style={{ padding:'13px 16px', textAlign:'center' }}>
                  <span style={{ fontSize:14, fontWeight:700, color:'#2563EB' }}>+{s.sugestao}</span>
                  <div style={{ fontSize:10, color:'#9CA3AF', marginTop:1 }}>unidades</div>
                </td>
                <td style={{ padding:'13px 16px' }}>
                  <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:99,
                    background: s.motivo.includes('mínimo') ? '#FFF7ED' : '#EFF6FF',
                    color:      s.motivo.includes('mínimo') ? '#C2410C'  : '#2563EB' }}>
                    {s.motivo}
                  </span>
                </td>
                <td style={{ padding:'13px 16px', textAlign:'right' }}>
                  <button onClick={ni} style={{ height:30, padding:'0 14px', background:'#000', border:'none', borderRadius:8, fontSize:12, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#18181B'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#000'; }}>
                    Comprar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding:'11px 20px', borderTop:'1px solid #F1F5F9', background:'#FAFAFA', display:'flex', justifyContent:'space-between', fontSize:12, color:'#71717A' }}>
          <span><b style={{color:'#191C1D'}}>{SUGESTOES.length}</b> itens para reposição · Total sugerido: <b style={{color:'#191C1D'}}>{SUGESTOES.reduce((a, s) => a + s.sugestao, 0)} unidades</b></span>
          <span>Atualizado agora</span>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Relatórios ─────────────────────────────────────────────────────────
function RelatoriosTab() {
  const futuros = [
    { icon:'ti-package',        color:'#2563EB', bg:'#EFF6FF', label:'Consumo por produto',      desc:'Veja quais produtos mais são utilizados' },
    { icon:'ti-users',          color:'#7C3AED', bg:'#F5F3FF', label:'Consumo por paciente',     desc:'Histórico de consumo vinculado a cada paciente' },
    { icon:'ti-clipboard-list', color:'#0D9488', bg:'#F0FDFA', label:'Consumo por procedimento', desc:'Custo de insumos por tipo de procedimento' },
    { icon:'ti-alert-triangle', color:'#DC2626', bg:'#FEF2F2', label:'Perdas por vencimento',    desc:'Controle de insumos descartados por vencimento' },
    { icon:'ti-shopping-cart',  color:'#D97706', bg:'#FFFBEB', label:'Sugestão de compra',       desc:'Relatório consolidado de reposição' },
    { icon:'ti-chart-bar',      color:'#16A34A', bg:'#F0FDF4', label:'Custo por procedimento',   desc:'Análise de custo de insumos por atendimento' },
  ];

  return (
    <div>
      <div style={{ background:'#F9FAFB', border:'1px solid #E5E7EB', borderRadius:12, padding:'20px 24px', marginBottom:24, textAlign:'center' }}>
        <i className="ti ti-chart-bar" style={{ fontSize:40, color:'#D1D5DB', display:'block', marginBottom:10 }} />
        <div style={{ fontSize:16, fontWeight:700, color:'#6B7280', marginBottom:6 }}>Relatórios em desenvolvimento</div>
        <div style={{ fontSize:13, color:'#9CA3AF' }}>Os relatórios abaixo estão previstos para as próximas versões.</div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
        {futuros.map(r => (
          <div key={r.label} style={{ background:'#FFFFFF', borderRadius:12, border:'1px solid #E5E7EB', padding:'18px 20px', display:'flex', alignItems:'flex-start', gap:14, opacity:.65 }}>
            <div style={{ width:40, height:40, borderRadius:10, background:r.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <i className={`ti ${r.icon}`} style={{ fontSize:18, color:r.color }} />
            </div>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:'#191C1D', marginBottom:4 }}>{r.label}</div>
              <div style={{ fontSize:12, color:'#71717A', lineHeight:1.5 }}>{r.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function EstoquePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab    = searchParams.get('tab') || 'produtos';
  const setTab = (t: string) => setSearchParams({ tab: t }, { replace: true });
  const [novaEntradaOpen, setNovaEntradaOpen] = useState(false);
  const [consumoOpen,     setConsumoOpen]     = useState(false);
  const [novoProdutoOpen, setNovoProdutoOpen] = useState(false);
  const [produtos,        setProdutos]        = useState<Produto[]>(INIT_PRODUTOS);

  const handleEntrada = (prodId: number, qty: number) => {
    setProdutos(prev => prev.map(p => p.id === prodId ? { ...p, atual: p.atual + qty } : p));
  };
  const handleConsumo = (prodId: number, qty: number) => {
    setProdutos(prev => prev.map(p => p.id === prodId ? { ...p, atual: Math.max(0, p.atual - qty) } : p));
  };
  const handleNovoProduto = (p: Produto) => {
    setProdutos(prev => [...prev, p]);
  };

  const kpis = [
    { label:'Produtos ativos',       value:'42', sub:'itens cadastrados',          icon:'ti-package',        iconBg:'#EFF6FF', iconColor:'#2563EB' },
    { label:'Estoque baixo',         value:'8',  sub:'itens abaixo do mínimo',     icon:'ti-alert-triangle', iconBg:'#FFF7ED', iconColor:'#C2410C' },
    { label:'Vencendo em 30 dias',   value:'5',  sub:'itens próximos do vencimento', icon:'ti-calendar-x',   iconBg:'#FEF2F2', iconColor:'#DC2626' },
    { label:'Sugestão de compra',    value:'12', sub:'itens para reposição',        icon:'ti-shopping-cart',  iconBg:'#F0FDF4', iconColor:'#16A34A' },
  ];

  const TABS = [
    { key:'produtos',    label:'Produtos' },
    { key:'movimentos',  label:'Movimentações' },
    { key:'validades',   label:'Validades' },
    { key:'sugestao',    label:'Sugestão de compras' },
    { key:'relatorios',  label:'Relatórios' },
  ];

  return (
    <>
      <style>{`
        @keyframes fadeUp  { from { opacity:0; transform:translateY(6px);  } to { opacity:1; transform:translateY(0);  } }
        @keyframes slideIn { from { opacity:0; transform:translateX(30px); } to { opacity:1; transform:translateX(0); } }
      `}</style>

      <div style={{ height:'100%', display:'flex', flexDirection:'column', overflow:'hidden', background:'transparent', fontFamily:"'Inter', system-ui, sans-serif" }}>

        {/* ── Scrollable body ───────────────────────────────────────────────── */}
        <div style={{ flex:1, minHeight:0, overflowY:'auto' }}>
          <div style={{ padding:'16px 28px 0' }}>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginBottom:16 }}>
              <button onClick={() => setConsumoOpen(true)}
                style={{ height:34, padding:'0 14px', border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:99, fontSize:13, fontWeight:500, color:'#18181B', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#FFFFFF'; }}>
                <i className="ti ti-circle-arrow-up" style={{ fontSize:14 }} /> Lançar consumo
              </button>
              <button onClick={() => setNovoProdutoOpen(true)}
                style={{ height:34, padding:'0 14px', border:'1px solid #E4E4E7', background:'#FFFFFF', borderRadius:99, fontSize:13, fontWeight:500, color:'#18181B', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F5'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#FFFFFF'; }}>
                <i className="ti ti-plus" style={{ fontSize:14 }} /> Novo produto
              </button>
              <button onClick={() => setNovaEntradaOpen(true)}
                style={{ height:38, padding:'0 18px', background:'#000000', border:'none', borderRadius:99, fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', gap:7, fontFamily:'inherit', boxShadow:'0 2px 8px rgba(0,0,0,0.15)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#18181B'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#000000'; }}>
                <i className="ti ti-circle-arrow-down" style={{ fontSize:15 }} /> Nova entrada
              </button>
            </div>

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

            {/* Tabs */}
            <div style={{ display:'flex', borderBottom:'1px solid #E5E7EB', marginBottom:20, background:'#FFFFFF', borderRadius:'12px 12px 0 0', padding:'0 4px' }}>
              {TABS.map(t => {
                const active = tab === t.key;
                return (
                  <button key={t.key} onClick={() => setTab(t.key)}
                    style={{ height:42, padding:'0 16px', border:'none', background:'none', fontSize:13, fontWeight: active?600:400, color: active?'#191C1D':'#71717A', cursor:'pointer', fontFamily:'inherit', borderBottom: active?'2px solid #000000':'2px solid transparent', whiteSpace:'nowrap', marginBottom:-1 }}>
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab Content */}
          <div style={{ padding:'0 28px 28px' }}>
            {tab === 'produtos'   && <ProdutosTab onNovoProduto={() => setNovoProdutoOpen(true)} produtos={produtos} />}
            {tab === 'movimentos' && <MovimentacoesTab />}
            {tab === 'validades'  && <ValidadesTab />}
            {tab === 'sugestao'   && <SugestaoTab />}
            {tab === 'relatorios' && <RelatoriosTab />}
          </div>
        </div>
      </div>

      {novaEntradaOpen && <NovaEntradaModal onClose={() => setNovaEntradaOpen(false)} produtos={produtos} onSave={handleEntrada} />}
      {consumoOpen     && <LancarConsumoModal onClose={() => setConsumoOpen(false)} produtos={produtos} onSave={handleConsumo} />}
      {novoProdutoOpen && <NovoProdutoModal onClose={() => setNovoProdutoOpen(false)} onSave={handleNovoProduto} />}
    </>
  );
}
