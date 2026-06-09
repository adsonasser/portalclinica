import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { plansApi } from '../../services/api';
import { TableActions } from '../../components/ui/TableActions';
import { useToast } from '../../components/ui/Toast';

// ─── Types ────────────────────────────────────────────────────────────────────
type SessionMode = 'nao_gera' | 'unica' | 'multipla' | 'composta';
type MainTab     = 'procedimentos' | 'categorias' | 'tipos';

interface CompositeRow {
  id: number;
  procedimentoId: string;
  procedimentoNome: string;
  qtd: number;
  profissional: string;
  duracao: number;
  sala: string;
}

interface ConfigItem { id: string; name: string; description: string; active: boolean; }

// ─── Storage ──────────────────────────────────────────────────────────────────
const LS_CATS  = 'pcl_proc_categorias';
const LS_TYPES = 'pcl_proc_tipos';
const uid = () => Math.random().toString(36).slice(2, 11);
const loadCats  = (): ConfigItem[] => { try { return JSON.parse(localStorage.getItem(LS_CATS)  || '[]'); } catch { return []; } };
const saveCats  = (v: ConfigItem[]) => localStorage.setItem(LS_CATS,  JSON.stringify(v));
const loadTypes = (): ConfigItem[] => { try { return JSON.parse(localStorage.getItem(LS_TYPES) || '[]'); } catch { return []; } };
const saveTypes = (v: ConfigItem[]) => localStorage.setItem(LS_TYPES, JSON.stringify(v));

// ─── Constants ────────────────────────────────────────────────────────────────
const SALAS        = ['Sala 01', 'Sala 02', 'Enfermagem', 'Online'];
const PROFS        = ['Dra. Jéssica', 'Kamila', 'Enfermagem', 'Nutricionista', 'Psicóloga', 'Personal'];
const CAT_EXAMPLES = ['Consultas','Planos de tratamento','Protocolos','Aplicações avulsas','Soroterapia','Injetáveis','Avaliações','Exames'];
const TYP_EXAMPLES = ['Avulso','Pacote','Plano','Protocolo','Procedimento','Produto/Insumo','Exame'];
const fmt          = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function sessBadge(modo: string, total: number) {
  if (!modo || modo === 'nao_gera') return { bg: '#F4F4F5', color: '#71717A', label: 'Não gera' };
  if (modo === 'composta')          return { bg: '#F5F3FF', color: '#7C3AED', label: 'Composição' };
  if (total === 1)                  return { bg: '#EFF6FF', color: '#2563EB', label: '1 sessão' };
  return { bg: '#EFF6FF', color: '#2563EB', label: `${total} sessões` };
}

function hasCircular(plans: any[], currentId: string | undefined, targetId: string): boolean {
  if (!currentId) return false;
  if (currentId === targetId) return true;
  const visited = new Set<string>();
  const stack   = [targetId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const p = plans.find((x: any) => x.id === cur);
    for (const r of p?.composicaoSessoes || []) {
      if (!r.procedimentoId) continue;
      if (r.procedimentoId === currentId) return true;
      stack.push(r.procedimentoId);
    }
  }
  return false;
}

// ─── ConfigSection (Categorias / Tipos) ───────────────────────────────────────
function ConfigSection({ items, label, examples, onChange }: {
  items: ConfigItem[]; label: string; examples: string[]; onChange: (v: ConfigItem[]) => void;
}) {
  const { toast }           = useToast();
  const ni                  = () => toast('Funcionalidade ainda não implementada.', 'info');
  const [editId,   setEditId]   = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [adding,   setAdding]   = useState(false);
  const [newName,  setNewName]  = useState('');
  const [newDesc,  setNewDesc]  = useState('');
  const [err,      setErr]      = useState('');

  const baseInp: React.CSSProperties = {
    height: 36, padding: '0 11px', border: '1px solid #E4E4E7', borderRadius: 8,
    fontSize: 13, color: '#191C1D', background: '#FFFFFF', outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box', width: '100%',
  };

  const startAdd  = () => { setAdding(true); setNewName(''); setNewDesc(''); setErr(''); };
  const cancelAdd = () => { setAdding(false); setErr(''); };

  const saveNew = () => {
    if (!newName.trim()) { setErr('Nome obrigatório.'); return; }
    if (items.some(x => x.name.toLowerCase() === newName.trim().toLowerCase())) { setErr('Já existe um item com esse nome.'); return; }
    onChange([...items, { id: uid(), name: newName.trim(), description: newDesc.trim(), active: true }]);
    setAdding(false); setErr('');
  };

  const startEdit  = (item: ConfigItem) => { setEditId(item.id); setEditName(item.name); setEditDesc(item.description); setErr(''); };
  const cancelEdit = () => { setEditId(null); setErr(''); };

  const saveEdit = () => {
    if (!editName.trim()) { setErr('Nome obrigatório.'); return; }
    onChange(items.map(x => x.id === editId ? { ...x, name: editName.trim(), description: editDesc.trim() } : x));
    setEditId(null); setErr('');
  };

  const toggleActive = (id: string) => onChange(items.map(x => x.id === id ? { ...x, active: !x.active } : x));

  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: '#71717A', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.04em' };

  return (
    <div style={{ padding: '20px 28px' }}>
      <div style={{ maxWidth: 820 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
          {!adding && (
            <button onClick={startAdd}
              style={{ height: 36, padding: '0 16px', background: '#000000', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, color: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#18181B')}
              onMouseLeave={e => (e.currentTarget.style.background = '#000000')}>
              <i className="ti ti-plus" style={{ fontSize: 13 }} /> Nova {label.toLowerCase()}
            </button>
          )}
        </div>

        {adding && (
          <div style={{ background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 12, padding: '16px 20px', marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#191C1D', marginBottom: 14 }}>Nova {label}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12, marginBottom: 10 }}>
              <div>
                <label style={lbl}>Nome <span style={{ color: '#DC2626' }}>*</span></label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={`Ex: ${examples[0]}`} style={baseInp} autoFocus onKeyDown={e => e.key === 'Enter' && saveNew()} />
              </div>
              <div>
                <label style={lbl}>Descrição</label>
                <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Descrição opcional" style={baseInp} />
              </div>
            </div>
            {err && <div style={{ fontSize: 12, color: '#DC2626', marginBottom: 8 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveNew} style={{ height: 32, padding: '0 14px', background: '#000000', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}>Salvar</button>
              <button onClick={cancelAdd} style={{ height: 32, padding: '0 12px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 12, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
            </div>
          </div>
        )}

        {items.length === 0 && !adding ? (
          <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 14, padding: '48px 24px', textAlign: 'center' }}>
            <i className="ti ti-tag" style={{ fontSize: 36, color: '#D1D5DB', display: 'block', marginBottom: 10 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: '#6B7280', marginBottom: 4 }}>Nenhuma {label.toLowerCase()} cadastrada</div>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 16 }}>Exemplos: {examples.slice(0, 4).join(', ')}</div>
            <button onClick={startAdd} style={{ height: 34, padding: '0 14px', background: '#000000', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}>
              Cadastrar primeira {label.toLowerCase()}
            </button>
          </div>
        ) : items.length > 0 ? (
          <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 14, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                  {['Nome', 'Descrição', 'Status', 'Ações'].map((h, i) => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: i === 3 ? 'right' : 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #F1F5F9' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    {editId === item.id ? (
                      <>
                        <td style={{ padding: '8px 12px' }}>
                          <input value={editName} onChange={e => setEditName(e.target.value)} style={{ ...baseInp, height: 32, fontSize: 12 }} autoFocus onKeyDown={e => e.key === 'Enter' && saveEdit()} />
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Descrição opcional" style={{ ...baseInp, height: 32, fontSize: 12 }} />
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: item.active ? '#DCFCE7' : '#F4F4F5', color: item.active ? '#16A34A' : '#71717A' }}>
                            {item.active ? 'Ativa' : 'Inativa'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                            {err && <span style={{ fontSize: 11, color: '#DC2626', marginRight: 4 }}>{err}</span>}
                            <button onClick={saveEdit} style={{ height: 28, padding: '0 10px', background: '#000000', border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 600, color: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}>Salvar</button>
                            <button onClick={cancelEdit} style={{ height: 28, padding: '0 10px', background: '#F4F4F5', border: 'none', borderRadius: 7, fontSize: 11, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#191C1D' }}>{item.name}</td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: '#71717A' }}>{item.description || '—'}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: item.active ? '#DCFCE7' : '#F4F4F5', color: item.active ? '#16A34A' : '#71717A' }}>
                            {item.active ? 'Ativa' : 'Inativa'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <TableActions
                            primaryAction={{ label: 'Editar', icon: 'ti-pencil', variant: 'default', onClick: () => startEdit(item) }}
                            secondaryActions={[
                              { label: item.active ? 'Inativar' : 'Ativar', icon: item.active ? 'ti-eye-off' : 'ti-eye', onClick: () => toggleActive(item.id), variant: item.active ? 'danger' : 'default' },
                              { label: 'Duplicar', icon: 'ti-copy', onClick: ni },
                              { label: 'Excluir', icon: 'ti-trash', variant: 'danger', onClick: ni, separator: true },
                            ]}
                          />
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Procedure Modal ──────────────────────────────────────────────────────────
interface ModalProps {
  plan?: any | null;
  onClose: () => void;
  categories: ConfigItem[];
  types: ConfigItem[];
  allPlans: any[];
}

function ProcedureModal({ plan, onClose, categories, types, allPlans }: ModalProps) {
  const isEdit = !!plan;
  const qc     = useQueryClient();

  const [nome,         setNome]         = useState(plan?.name || '');
  const [categoria,    setCategoria]    = useState(plan?.categoria || '');
  const [tipo,         setTipo]         = useState(plan?.tipo || '');
  const [descricao,    setDescricao]    = useState(plan?.description || '');
  const [valorPadrao,  setValorPadrao]  = useState(plan?.price != null ? String(plan.price) : '');
  const [ativo,        setAtivo]        = useState<boolean>(plan ? plan.active : true);
  const [tipoSessoes,  setTipoSessoes]  = useState<SessionMode>(plan?.tipoGeracaoSessoes || 'nao_gera');
  const [qtdSessoes,   setQtdSessoes]   = useState(String(plan?.quantidadeSessoes || plan?.sessionsTotal || 1));
  const [duracao,      setDuracao]      = useState(String(plan?.duracaoPadrao || plan?.duration || ''));
  const [profissional, setProfissional] = useState(plan?.profissionalPadrao || '');
  const [sala,         setSala]         = useState(plan?.salaPadrao || '');
  const [validadeDias, setValidadeDias] = useState(plan?.validadeDias != null ? String(plan.validadeDias) : '');
  const [error,        setError]        = useState('');

  const loadCompositeRows = (): CompositeRow[] => {
    if (!Array.isArray(plan?.composicaoSessoes) || plan.composicaoSessoes.length === 0) return [];
    return plan.composicaoSessoes
      .filter((r: any) => r.procedimentoId)
      .map((r: any, i: number) => ({
        id: i + 1,
        procedimentoId: r.procedimentoId || '',
        procedimentoNome: r.nome || '',
        qtd: r.quantidade || r.qtd || 1,
        profissional: r.profissionalPadrao || r.profissional || '',
        duracao: r.duracaoPadrao || Number(r.duracao) || 60,
        sala: r.salaPadrao || r.sala || '',
      }));
  };
  const [compositeRows, setCompositeRows] = useState<CompositeRow[]>(loadCompositeRows);

  const availableProcs = useMemo(() =>
    allPlans.filter(p => p.active && !hasCircular(allPlans, plan?.id, p.id)),
    [allPlans, plan?.id]
  );

  const addRow    = () => setCompositeRows(r => [...r, { id: Date.now(), procedimentoId: '', procedimentoNome: '', qtd: 1, profissional: '', duracao: 60, sala: '' }]);
  const removeRow = (id: number) => setCompositeRows(r => r.filter(x => x.id !== id));

  const selectProc = (rowId: number, procId: string) => {
    const proc = allPlans.find((p: any) => p.id === procId);
    setCompositeRows(r => r.map(x => x.id === rowId ? {
      ...x,
      procedimentoId:   procId,
      procedimentoNome: proc?.name || '',
      duracao:          proc?.duracaoPadrao || proc?.duration || 60,
      profissional:     proc?.profissionalPadrao || '',
      sala:             proc?.salaPadrao || '',
    } : x));
  };

  const updateRow = (id: number, field: 'qtd' | 'profissional' | 'duracao' | 'sala', value: any) =>
    setCompositeRows(r => r.map(x => x.id === id ? { ...x, [field]: value } : x));

  const saveMut = useMutation({
    mutationFn: (payload: any) => isEdit ? plansApi.update(plan.id, payload) : plansApi.create(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plans'] }); onClose(); },
    onError:   () => setError('Erro ao salvar. Verifique os dados e tente novamente.'),
  });

  const handleSave = () => {
    if (!nome.trim())  { setError('Nome é obrigatório.'); return; }
    if (!categoria)    { setError('Categoria é obrigatória.'); return; }
    if (!tipo)         { setError('Tipo é obrigatório.'); return; }
    if (!valorPadrao)  { setError('Valor padrão é obrigatório.'); return; }
    if (tipoSessoes === 'multipla' && (!qtdSessoes || Number(qtdSessoes) < 1)) {
      setError('Quantidade de sessões deve ser maior que zero.'); return;
    }
    if (tipoSessoes === 'composta') {
      if (compositeRows.length === 0) { setError('Adicione pelo menos um item na composição.'); return; }
      if (compositeRows.some(r => !r.procedimentoId || r.qtd < 1)) {
        setError('Todos os itens precisam ter procedimento selecionado e quantidade válida.'); return;
      }
    }
    const dur = Number(duracao);
    if (duracao && (dur < 5 || dur > 480)) { setError('Duração deve ser entre 5 e 480 minutos.'); return; }
    setError('');

    const sessionsTotal =
      tipoSessoes === 'nao_gera' ? 0 :
      tipoSessoes === 'unica'    ? 1 :
      tipoSessoes === 'multipla' ? (Number(qtdSessoes) || 1) :
      compositeRows.reduce((s, r) => s + Number(r.qtd), 0);

    saveMut.mutate({
      name:               nome.trim(),
      description:        descricao || undefined,
      price:              Number(valorPadrao) || 0,
      active:             ativo,
      categoria,
      tipo:               tipo || undefined,
      tipoGeracaoSessoes: tipoSessoes,
      quantidadeSessoes:  Number(qtdSessoes) || 0,
      sessionsTotal,
      duration:           dur || undefined,
      duracaoPadrao:      dur || undefined,
      profissionalPadrao: profissional || undefined,
      salaPadrao:         sala || undefined,
      validadeDias:       validadeDias ? Number(validadeDias) : undefined,
      composicaoSessoes:  tipoSessoes === 'composta' ? compositeRows.map(r => ({
        procedimentoId:   r.procedimentoId,
        nome:             r.procedimentoNome,
        quantidade:       r.qtd,
        duracaoPadrao:    r.duracao,
        profissionalPadrao: r.profissional || undefined,
        salaPadrao:       r.sala || undefined,
      })) : undefined,
    });
  };

  const isSaving = saveMut.isPending;

  const inp: React.CSSProperties = {
    width: '100%', height: 38, padding: '0 12px', border: '1px solid #E4E4E7',
    borderRadius: 9, fontSize: 13, color: '#191C1D', background: '#FFFFFF',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: '#71717A', marginBottom: 5 };
  const card: React.CSSProperties = { background: '#FFFFFF', borderRadius: 14, border: '1px solid #E5E7EB', padding: '20px 24px', marginBottom: 16 };

  const SectionHeader = ({ icon, iconBg, iconColor, title }: { icon: string; iconBg: string; iconColor: string; title: string }) => (
    <div style={{ fontSize: 14, fontWeight: 700, color: '#191C1D', marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 30, height: 30, borderRadius: 9, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <i className={`ti ${icon}`} style={{ fontSize: 15, color: iconColor }} />
      </div>
      {title}
    </div>
  );

  const SESSION_OPTS: { key: SessionMode; icon: string; label: string; desc: string }[] = [
    { key: 'nao_gera', icon: 'ti-ban',         label: 'Não gera sessões',      desc: 'Venda simples, sem sessões vinculadas' },
    { key: 'unica',    icon: 'ti-circle-1',    label: 'Gera 1 sessão',         desc: 'Cria uma sessão ao vender' },
    { key: 'multipla', icon: 'ti-stack',       label: 'Múltiplas sessões',     desc: 'Cria N sessões ao vender' },
    { key: 'composta', icon: 'ti-layout-list', label: 'Composição de sessões', desc: 'Combinação de procedimentos cadastrados' },
  ];

  const noCats  = categories.length === 0;
  const noTypes = types.length === 0;

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 300, backdropFilter: 'blur(3px)' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 720, background: '#F8F9FA', zIndex: 301, display: 'flex', flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif", boxShadow: '-8px 0 48px rgba(0,0,0,.14)', animation: 'slideIn .22s ease' }}>

        {/* Header */}
        <div style={{ flexShrink: 0, background: '#FFFFFF', borderBottom: '1px solid #E5E7EB', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#191C1D' }}>{isEdit ? 'Editar procedimento' : 'Novo procedimento'}</div>
            <div style={{ fontSize: 12, color: '#71717A', marginTop: 2 }}>Preencha os dados e configure as sessões vinculadas</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, border: 'none', background: '#F4F4F5', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A' }}>
            <i className="ti ti-x" style={{ fontSize: 14 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* Dados básicos */}
          <div style={card}>
            <SectionHeader icon="ti-info-circle" iconBg="#EFF6FF" iconColor="#2563EB" title="Dados básicos" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={lbl}>Nome do procedimento / serviço <span style={{ color: '#DC2626' }}>*</span></label>
                <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Consulta médica inicial" style={inp} />
              </div>
              <div>
                <label style={lbl}>Categoria <span style={{ color: '#DC2626' }}>*</span></label>
                {noCats ? (
                  <div style={{ padding: '9px 12px', border: '1px solid #FEF08A', borderRadius: 9, background: '#FEFCE8', fontSize: 12, color: '#854D0E' }}>
                    Nenhuma categoria cadastrada. Vá em <b>Categorias</b> nesta mesma tela para criar.
                  </div>
                ) : (
                  <select value={categoria} onChange={e => setCategoria(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                    <option value="">Selecionar</option>
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label style={lbl}>Tipo <span style={{ color: '#DC2626' }}>*</span></label>
                {noTypes ? (
                  <div style={{ padding: '9px 12px', border: '1px solid #FEF08A', borderRadius: 9, background: '#FEFCE8', fontSize: 12, color: '#854D0E' }}>
                    Nenhum tipo cadastrado. Vá em <b>Tipos</b> nesta mesma tela para criar.
                  </div>
                ) : (
                  <select value={tipo} onChange={e => setTipo(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                    <option value="">Selecionar</option>
                    {types.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label style={lbl}>Status</label>
                <select value={ativo ? 'ativo' : 'inativo'} onChange={e => setAtivo(e.target.value === 'ativo')} style={{ ...inp, cursor: 'pointer' }}>
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Duração padrão</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="number" min={5} max={480} step={5}
                    value={duracao}
                    onChange={e => setDuracao(e.target.value)}
                    placeholder="Ex: 30"
                    style={{ ...inp, width: 100 }}
                  />
                  <span style={{ fontSize: 13, color: '#71717A', flexShrink: 0 }}>min</span>
                </div>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={lbl}>Descrição interna</label>
                <textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descreva o procedimento para uso interno..." rows={3}
                  style={{ ...inp, height: 'auto', padding: '8px 12px', resize: 'vertical' }} />
              </div>
            </div>
          </div>

          {/* Comercial */}
          <div style={card}>
            <SectionHeader icon="ti-cash" iconBg="#F0FDF4" iconColor="#16A34A" title="Comercial" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={lbl}>Valor padrão <span style={{ color: '#DC2626' }}>*</span></label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#71717A', pointerEvents: 'none' }}>R$</span>
                  <input type="number" min={0} step={0.01} value={valorPadrao} onChange={e => setValorPadrao(e.target.value)} placeholder="0,00" style={{ ...inp, paddingLeft: 36 }} />
                </div>
              </div>
              <div>
                <label style={lbl}>Validade após compra (dias)</label>
                <input type="number" min={0} value={validadeDias} onChange={e => setValidadeDias(e.target.value)} placeholder="Vazio = sem limite" style={inp} />
              </div>
            </div>
          </div>

          {/* Sessões */}
          <div style={card}>
            <SectionHeader icon="ti-activity" iconBg="#F5F3FF" iconColor="#7C3AED" title="Sessões vinculadas" />
            <div style={{ fontSize: 13, color: '#374151', marginBottom: 14 }}>Este procedimento gera sessões para o paciente?</div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
              {SESSION_OPTS.map(m => {
                const active = tipoSessoes === m.key;
                return (
                  <button key={m.key} onClick={() => setTipoSessoes(m.key)}
                    style={{ padding: '14px 12px', border: active ? '2px solid #7C3AED' : '1px solid #E4E4E7', borderRadius: 12, background: active ? '#F5F3FF' : '#FFFFFF', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                    <i className={`ti ${m.icon}`} style={{ fontSize: 20, color: active ? '#7C3AED' : '#A1A1AA', display: 'block', marginBottom: 9 }} />
                    <div style={{ fontSize: 12, fontWeight: 700, color: active ? '#7C3AED' : '#191C1D', marginBottom: 4 }}>{m.label}</div>
                    <div style={{ fontSize: 11, color: '#71717A', lineHeight: 1.45 }}>{m.desc}</div>
                  </button>
                );
              })}
            </div>

            {tipoSessoes === 'nao_gera' && (
              <div style={{ padding: '13px 16px', background: '#F9FAFB', borderRadius: 10, border: '1px solid #F1F5F9', fontSize: 13, color: '#71717A', display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                <i className="ti ti-info-circle" style={{ fontSize: 15, color: '#A1A1AA', flexShrink: 0, marginTop: 1 }} />
                Este procedimento será tratado como venda simples e não criará sessões no paciente.
              </div>
            )}

            {tipoSessoes === 'unica' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>Profissional padrão</label>
                  <select value={profissional} onChange={e => setProfissional(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                    <option value="">Qualquer</option>
                    {PROFS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Sala padrão</label>
                  <select value={sala} onChange={e => setSala(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                    <option value="">Qualquer</option>
                    {SALAS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            )}

            {tipoSessoes === 'multipla' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>Quantidade de sessões <span style={{ color: '#DC2626' }}>*</span></label>
                  <input type="number" min={1} value={qtdSessoes} onChange={e => setQtdSessoes(e.target.value)} placeholder="Ex: 8" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Profissional padrão</label>
                  <select value={profissional} onChange={e => setProfissional(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                    <option value="">Qualquer</option>
                    {PROFS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Sala padrão</label>
                  <select value={sala} onChange={e => setSala(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                    <option value="">Qualquer</option>
                    {SALAS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            )}

            {tipoSessoes === 'composta' && (
              <div>
                <div style={{ fontSize: 12, color: '#71717A', marginBottom: 12 }}>
                  Selecione procedimentos já cadastrados para compor as sessões deste plano.
                </div>
                {availableProcs.length === 0 ? (
                  <div style={{ padding: '13px 16px', background: '#FFFBEB', borderRadius: 10, border: '1px solid #FEF08A', fontSize: 13, color: '#854D0E' }}>
                    <i className="ti ti-alert-triangle" style={{ fontSize: 14, marginRight: 8 }} />
                    Nenhum procedimento ativo disponível para compor este plano. Cadastre outros procedimentos primeiro.
                  </div>
                ) : (
                  <>
                    <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden', marginBottom: 10 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                            {['Procedimento / Sessão', 'Qtd', 'Profissional', 'Duração', 'Sala', ''].map((h, i) => (
                              <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {compositeRows.map(row => (
                            <tr key={row.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                              <td style={{ padding: '6px 10px', minWidth: 200 }}>
                                <select value={row.procedimentoId} onChange={e => selectProc(row.id, e.target.value)}
                                  style={{ ...inp, height: 32, fontSize: 12, cursor: 'pointer' }}>
                                  <option value="">Selecionar procedimento</option>
                                  {availableProcs.map((p: any) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name}{p.categoria ? ` — ${p.categoria}` : ''}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td style={{ padding: '6px 10px', width: 70 }}>
                                <input type="number" value={row.qtd} min={1} onChange={e => updateRow(row.id, 'qtd', Number(e.target.value))} style={{ ...inp, height: 32, fontSize: 12 }} />
                              </td>
                              <td style={{ padding: '6px 10px', minWidth: 130 }}>
                                <select value={row.profissional} onChange={e => updateRow(row.id, 'profissional', e.target.value)} style={{ ...inp, height: 32, fontSize: 12, cursor: 'pointer' }}>
                                  <option value="">Qualquer</option>
                                  {PROFS.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                              </td>
                              <td style={{ padding: '6px 10px', width: 120 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <input type="number" min={5} max={480} step={5} value={row.duracao} onChange={e => updateRow(row.id, 'duracao', Number(e.target.value))} style={{ ...inp, height: 32, fontSize: 12, width: 60 }} />
                                  <span style={{ fontSize: 11, color: '#71717A', flexShrink: 0 }}>min</span>
                                </div>
                              </td>
                              <td style={{ padding: '6px 10px', minWidth: 110 }}>
                                <select value={row.sala} onChange={e => updateRow(row.id, 'sala', e.target.value)} style={{ ...inp, height: 32, fontSize: 12, cursor: 'pointer' }}>
                                  <option value="">Qualquer</option>
                                  {SALAS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </td>
                              <td style={{ padding: '6px 10px' }}>
                                <button onClick={() => removeRow(row.id)} style={{ width: 28, height: 28, border: 'none', background: '#FEF2F2', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#DC2626' }}>
                                  <i className="ti ti-x" style={{ fontSize: 12 }} />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {compositeRows.length === 0 && (
                            <tr>
                              <td colSpan={6} style={{ padding: '20px 16px', textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>
                                Nenhum item adicionado. Clique em "+ Adicionar item" abaixo.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <button onClick={addRow}
                      style={{ height: 34, padding: '0 14px', border: '1px dashed #D1D5DB', background: 'transparent', borderRadius: 9, fontSize: 12, fontWeight: 500, color: '#71717A', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#A1A1AA'; (e.currentTarget as HTMLElement).style.color = '#374151'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#D1D5DB'; (e.currentTarget as HTMLElement).style.color = '#71717A'; }}>
                      <i className="ti ti-plus" style={{ fontSize: 13 }} /> Adicionar item da composição
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0, background: '#FFFFFF', borderTop: '1px solid #E5E7EB', padding: '14px 24px' }}>
          {error && (
            <div style={{ fontSize: 12, color: '#DC2626', marginBottom: 10, padding: '8px 12px', background: '#FEF2F2', borderRadius: 8, border: '1px solid #FECACA' }}>{error}</div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose}
              style={{ flex: 1, height: 40, border: '1px solid #E4E4E7', background: '#FFFFFF', borderRadius: 10, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancelar
            </button>
            <button onClick={handleSave} disabled={isSaving}
              style={{ flex: 2, height: 40, background: isSaving ? '#71717A' : '#000000', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#FFFFFF', cursor: isSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
              {isSaving
                ? <><i className="ti ti-loader-2" style={{ fontSize: 14 }} /> Salvando...</>
                : <><i className="ti ti-check" style={{ fontSize: 14 }} /> {isEdit ? 'Salvar alterações' : 'Criar procedimento'}</>}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function ProceduresPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const ni        = () => toast('Funcionalidade ainda não implementada.', 'info');

  const [mainTab,    setMainTab]    = useState<MainTab>('procedimentos');
  const [filterTab,  setFilterTab]  = useState('todos');
  const [search,     setSearch]     = useState('');
  const [catFilter,  setCatFilter]  = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [modalOpen,  setModalOpen]  = useState(false);
  const [editPlan,   setEditPlan]   = useState<any | null>(null);

  const [categories, setCategories] = useState<ConfigItem[]>(loadCats);
  const [types,      setTypes]      = useState<ConfigItem[]>(loadTypes);

  const updateCategories = (v: ConfigItem[]) => { saveCats(v);  setCategories(v); };
  const updateTypes      = (v: ConfigItem[]) => { saveTypes(v); setTypes(v);      };

  const activeCategories = useMemo(() => categories.filter(c => c.active), [categories]);
  const activeTypes      = useMemo(() => types.filter(t => t.active),      [types]);

  const { data: plans = [], isLoading } = useQuery<any[]>({
    queryKey: ['plans'],
    queryFn:  () => plansApi.list(),
  });

  const filtered = useMemo(() => {
    return plans
      .filter(p => {
        if (filterTab === 'ativos')       return p.active;
        if (filterTab === 'inativos')     return !p.active;
        if (filterTab === 'com_sessoes')  return p.tipoGeracaoSessoes && p.tipoGeracaoSessoes !== 'nao_gera';
        if (filterTab === 'sem_sessoes')  return !p.tipoGeracaoSessoes || p.tipoGeracaoSessoes === 'nao_gera';
        return true;
      })
      .filter(p => !catFilter  || p.categoria === catFilter)
      .filter(p => !typeFilter || p.tipo === typeFilter)
      .filter(p => !search || (p.name || '').toLowerCase().includes(search.toLowerCase()));
  }, [plans, filterTab, search, catFilter, typeFilter]);

  const kpis = useMemo(() => {
    const ativos     = plans.filter(p => p.active).length;
    const comSessoes = plans.filter(p => p.tipoGeracaoSessoes && p.tipoGeracaoSessoes !== 'nao_gera').length;
    const semSessoes = plans.filter(p => !p.tipoGeracaoSessoes || p.tipoGeracaoSessoes === 'nao_gera').length;
    const cats       = new Set(plans.map((p: any) => p.categoria).filter(Boolean)).size;
    return [
      { label: 'Procedimentos ativos',   value: String(ativos),     sub: 'disponíveis para venda',    icon: 'ti-activity',      iconBg: '#EFF6FF', iconColor: '#2563EB' },
      { label: 'Com sessões vinculadas', value: String(comSessoes), sub: 'geram sessões ao paciente', icon: 'ti-calendar-plus', iconBg: '#F5F3FF', iconColor: '#7C3AED' },
      { label: 'Sem sessões',            value: String(semSessoes), sub: 'venda simples',             icon: 'ti-shopping-bag',  iconBg: '#F0FDF4', iconColor: '#16A34A' },
      { label: 'Categorias',             value: String(cats),       sub: 'tipos organizados',         icon: 'ti-tag',           iconBg: '#FFFBEB', iconColor: '#D97706' },
    ];
  }, [plans]);

  const FILTER_TABS = [
    { key: 'todos',       label: 'Todos' },
    { key: 'ativos',      label: 'Ativos' },
    { key: 'inativos',    label: 'Inativos' },
    { key: 'com_sessoes', label: 'Com sessões' },
    { key: 'sem_sessoes', label: 'Sem sessões' },
  ];

  const MAIN_TABS: { key: MainTab; label: string; icon: string }[] = [
    { key: 'procedimentos', label: 'Procedimentos', icon: 'ti-activity' },
    { key: 'categorias',    label: 'Categorias',    icon: 'ti-tag' },
    { key: 'tipos',         label: 'Tipos',         icon: 'ti-layers-intersect' },
  ];

  const openNew  = () => { setEditPlan(null); setModalOpen(true); };
  const openEdit = (p: any) => { setEditPlan(p); setModalOpen(true); };

  return (
    <>
      <style>{`
        @keyframes fadeUp  { from { opacity:0; transform:translateY(8px);  } to { opacity:1; transform:translateY(0);  } }
        @keyframes slideIn { from { opacity:0; transform:translateX(32px); } to { opacity:1; transform:translateX(0); } }
      `}</style>

      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F8F9FA', fontFamily: "'Inter', system-ui, sans-serif" }}>

        {/* Header */}
        <div style={{ flexShrink: 0, background: '#FFFFFF', borderBottom: '1px solid #E5E7EB', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
              <button onClick={() => navigate('/settings')}
                style={{ fontSize: 12, color: '#71717A', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
                onMouseEnter={e => (e.currentTarget.style.color = '#374151')}
                onMouseLeave={e => (e.currentTarget.style.color = '#71717A')}>
                <i className="ti ti-settings" style={{ fontSize: 12 }} /> Configurações
              </button>
              <i className="ti ti-chevron-right" style={{ fontSize: 11, color: '#D1D5DB' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#191C1D' }}>Procedimentos e Serviços</span>
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#191C1D', margin: 0 }}>Procedimentos e Serviços</h1>
            <p style={{ fontSize: 12, color: '#71717A', margin: '2px 0 0' }}>
              Gerencie procedimentos, planos, protocolos e configure categorias e tipos.
            </p>
          </div>
          {mainTab === 'procedimentos' && (
            <button onClick={openNew}
              style={{ height: 36, padding: '0 16px', background: '#000000', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#18181B')}
              onMouseLeave={e => (e.currentTarget.style.background = '#000000')}>
              <i className="ti ti-plus" style={{ fontSize: 14 }} /> Novo procedimento
            </button>
          )}
        </div>

        {/* Main Tabs */}
        <div style={{ flexShrink: 0, background: '#FFFFFF', borderBottom: '1px solid #E5E7EB', padding: '0 28px' }}>
          <div style={{ display: 'flex' }}>
            {MAIN_TABS.map(t => {
              const active = mainTab === t.key;
              return (
                <button key={t.key} onClick={() => setMainTab(t.key)}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', fontSize: 13, fontWeight: active ? 600 : 400, color: active ? '#09090B' : '#71717A', background: 'none', border: 'none', borderBottom: active ? '2px solid #000000' : '2px solid transparent', cursor: 'pointer', marginBottom: -1, fontFamily: 'inherit' }}>
                  <i className={`ti ${t.icon}`} style={{ fontSize: 14 }} />
                  {t.label}
                  {t.key === 'categorias' && categories.length > 0 && (
                    <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 99, background: active ? '#000000' : '#F4F4F5', color: active ? '#FFFFFF' : '#71717A' }}>{categories.length}</span>
                  )}
                  {t.key === 'tipos' && types.length > 0 && (
                    <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 99, background: active ? '#000000' : '#F4F4F5', color: active ? '#FFFFFF' : '#71717A' }}>{types.length}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>

          {/* ── Categorias Tab ── */}
          {mainTab === 'categorias' && (
            <ConfigSection
              items={categories}
              label="Categoria"
              examples={CAT_EXAMPLES}
              onChange={updateCategories}
            />
          )}

          {/* ── Tipos Tab ── */}
          {mainTab === 'tipos' && (
            <ConfigSection
              items={types}
              label="Tipo"
              examples={TYP_EXAMPLES}
              onChange={updateTypes}
            />
          )}

          {/* ── Procedimentos Tab ── */}
          {mainTab === 'procedimentos' && (
            <div>
              <div style={{ padding: '20px 28px 0' }}>

                {/* KPIs */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
                  {kpis.map(k => (
                    <div key={k.label} style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid #E5E7EB', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: k.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <i className={`ti ${k.icon}`} style={{ fontSize: 20, color: k.iconColor }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 500, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '.04em' }}>{k.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#191C1D', lineHeight: 1.1 }}>{k.value}</div>
                        <div style={{ fontSize: 11, color: '#71717A', marginTop: 2 }}>{k.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Filters */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', background: '#F4F4F5', borderRadius: 10, padding: 3 }}>
                    {FILTER_TABS.map(t => {
                      const active = filterTab === t.key;
                      return (
                        <button key={t.key} onClick={() => setFilterTab(t.key)}
                          style={{ height: 30, padding: '0 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: active ? 600 : 400, color: active ? '#191C1D' : '#71717A', background: active ? '#FFFFFF' : 'transparent', cursor: 'pointer', fontFamily: 'inherit', boxShadow: active ? '0 1px 3px rgba(0,0,0,.08)' : 'none', whiteSpace: 'nowrap' }}>
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
                      style={{ height: 34, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 9, fontSize: 12, color: catFilter ? '#191C1D' : '#9CA3AF', background: '#FFFFFF', cursor: 'pointer' }}>
                      <option value="">Todas categorias</option>
                      {activeCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                    <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                      style={{ height: 34, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 9, fontSize: 12, color: typeFilter ? '#191C1D' : '#9CA3AF', background: '#FFFFFF', cursor: 'pointer' }}>
                      <option value="">Todos tipos</option>
                      {activeTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                    </select>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 10px', border: '1px solid #E4E4E7', borderRadius: 9, background: '#FFFFFF', width: 220 }}>
                      <i className="ti ti-search" style={{ fontSize: 13, color: '#9CA3AF' }} />
                      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar procedimento..."
                        style={{ border: 'none', background: 'transparent', fontSize: 12, outline: 'none', width: '100%', fontFamily: 'inherit', color: '#191C1D' }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Table */}
              <div style={{ padding: '0 28px 28px' }}>
                {isLoading ? (
                  <div style={{ textAlign: 'center', padding: 48, color: '#71717A', fontSize: 14 }}>
                    <i className="ti ti-loader-2" style={{ fontSize: 28, display: 'block', marginBottom: 10, color: '#A1A1AA' }} />
                    Carregando procedimentos...
                  </div>
                ) : (
                  <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid #E5E7EB', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                          {['Nome', 'Categoria', 'Valor', 'Sessões', 'Tipo', 'Status', 'Ações'].map((h, i) => (
                            <th key={h} style={{ padding: '10px 16px', textAlign: i === 2 ? 'right' : i === 6 ? 'right' : 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((p: any) => {
                          const sb = sessBadge(p.tipoGeracaoSessoes, p.sessionsTotal);
                          return (
                            <tr key={p.id} style={{ borderBottom: '1px solid #F1F5F9' }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                              <td style={{ padding: '13px 16px' }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#191C1D' }}>{p.name}</div>
                                {p.description && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{p.description.slice(0, 60)}{p.description.length > 60 ? '…' : ''}</div>}
                              </td>
                              <td style={{ padding: '13px 16px', fontSize: 12, color: '#71717A' }}>{p.categoria || '—'}</td>
                              <td style={{ padding: '13px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#191C1D', whiteSpace: 'nowrap' }}>{fmt(p.price || 0)}</td>
                              <td style={{ padding: '13px 16px' }}>
                                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: sb.bg, color: sb.color }}>{sb.label}</span>
                              </td>
                              <td style={{ padding: '13px 16px', fontSize: 12, color: '#374151' }}>{p.tipo || '—'}</td>
                              <td style={{ padding: '13px 16px' }}>
                                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: p.active ? '#DCFCE7' : '#F4F4F5', color: p.active ? '#16A34A' : '#71717A' }}>
                                  {p.active ? 'Ativo' : 'Inativo'}
                                </span>
                              </td>
                              <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                                <TableActions
                                  primaryAction={{ label: 'Editar', icon: 'ti-pencil', variant: 'default', onClick: () => openEdit(p) }}
                                  secondaryActions={[
                                    { label: 'Duplicar', icon: 'ti-copy', onClick: ni },
                                    { label: p.active ? 'Inativar' : 'Ativar', icon: p.active ? 'ti-eye-off' : 'ti-eye', onClick: ni, separator: true },
                                    { label: 'Excluir', icon: 'ti-trash', variant: 'danger', onClick: ni },
                                  ]}
                                />
                              </td>
                            </tr>
                          );
                        })}
                        {filtered.length === 0 && (
                          <tr>
                            <td colSpan={7} style={{ padding: '48px 16px', textAlign: 'center' }}>
                              <i className="ti ti-search-off" style={{ fontSize: 36, color: '#D1D5DB', display: 'block', marginBottom: 10 }} />
                              <div style={{ fontSize: 14, fontWeight: 600, color: '#6B7280', marginBottom: 4 }}>
                                {plans.length === 0 ? 'Nenhum procedimento cadastrado' : 'Nenhum resultado encontrado'}
                              </div>
                              <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                                {plans.length === 0 ? 'Clique em "Novo procedimento" para começar.' : 'Tente ajustar os filtros ou a busca'}
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    <div style={{ padding: '12px 20px', borderTop: '1px solid #F1F5F9', background: '#FAFAFA', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 12, color: '#71717A' }}>
                        Mostrando <b style={{ color: '#191C1D' }}>{filtered.length}</b> de <b style={{ color: '#191C1D' }}>{plans.length}</b> procedimentos
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <ProcedureModal
          plan={editPlan}
          onClose={() => setModalOpen(false)}
          categories={activeCategories}
          types={activeTypes}
          allPlans={plans}
        />
      )}
    </>
  );
}
