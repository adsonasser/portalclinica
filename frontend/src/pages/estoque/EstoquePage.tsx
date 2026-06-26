import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../../components/ui/Toast';
import { Portal } from '../../components/ui/Portal';
import { inventoryApi } from '../../services/api';
import { TableLoader, SectionLoader } from '../../components/ui/Loader';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Product {
  id: string; name: string; sku?: string; unit: string; description?: string;
  stock: number; minStock: number; costPrice: number; salePrice: number; active: boolean;
  category?: { id: string; name: string };
  supplier?: { id: string; name: string };
}
interface StockMovement {
  id: string; productId: string; type: 'ENTRADA' | 'SAIDA' | 'AJUSTE' | 'CONSUMO';
  quantity: number; unitCost?: number; reason?: string; batch?: string;
  expiryDate?: string; createdAt: string;
  product?: { id: string; name: string; unit: string };
}
interface Category { id: string; name: string; }
interface Supplier  { id: string; name: string; }
interface Stats     { total: number; abaixoMinimo: number; valorTotal: number; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const fmtDateOnly = (d: string) => new Date(d).toLocaleDateString('pt-BR');

function stockBadge(p: Product) {
  if (p.stock === 0)         return { label: 'Sem estoque',   bg: '#FEF2F2', color: '#DC2626' };
  if (p.stock <= p.minStock) return { label: 'Estoque baixo', bg: '#FFFBEB', color: '#D97706' };
  return                            { label: 'Normal',        bg: '#DCFCE7', color: '#16A34A' };
}

const MOV_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  ENTRADA: { label: 'Entrada',  bg: '#DCFCE7', color: '#16A34A' },
  SAIDA:   { label: 'Saída',    bg: '#FEF2F2', color: '#DC2626' },
  AJUSTE:  { label: 'Ajuste',   bg: '#EFF6FF', color: '#2563EB' },
  CONSUMO: { label: 'Consumo',  bg: '#FFFBEB', color: '#D97706' },
};

function expiryBadge(expiryDate: string) {
  const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000);
  if (days < 0)   return { label: 'Vencido',        bg: '#FEF2F2', color: '#DC2626', days };
  if (days <= 7)  return { label: 'Vence em breve',  bg: '#FEF2F2', color: '#DC2626', days };
  if (days <= 30) return { label: 'Atenção',          bg: '#FFFBEB', color: '#D97706', days };
  return                  { label: 'OK',              bg: '#DCFCE7', color: '#16A34A', days };
}

type PeriodKey = 'today' | 'this_week' | 'this_month' | 'last_30' | 'last_month' | 'all_time' | 'custom';
const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'today',      label: 'Hoje' },
  { key: 'this_week',  label: 'Esta semana' },
  { key: 'this_month', label: 'Este mês' },
  { key: 'last_30',    label: 'Últimos 30 dias' },
  { key: 'last_month', label: 'Mês passado' },
  { key: 'all_time',   label: 'Todo o período' },
  { key: 'custom',     label: 'Personalizado' },
];
const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: 'Hoje', this_week: 'Esta semana', this_month: 'Este mês',
  last_30: 'Últimos 30 dias', last_month: 'Mês passado',
  all_time: 'Todo o período', custom: 'Personalizado',
};

function computePeriod(period: PeriodKey, cs = '', ce = ''): { start: Date; end: Date } {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eod   = new Date(today.getTime() + 86400000 - 1);
  if (period === 'today')      return { start: today, end: eod };
  if (period === 'this_week')  { const s = new Date(today); s.setDate(today.getDate() - today.getDay()); return { start: s, end: now }; }
  if (period === 'this_month') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
  if (period === 'last_30')    { const s = new Date(today); s.setDate(s.getDate() - 30); return { start: s, end: now }; }
  if (period === 'last_month') return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59) };
  if (period === 'custom' && cs && ce) return { start: new Date(cs + 'T00:00:00'), end: new Date(ce + 'T23:59:59') };
  return { start: new Date(0), end: now };
}

// ─── Style constants ──────────────────────────────────────────────────────────
const SELECT_ICON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717A' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C%2Fsvg%3E")`;

const pillSelect: React.CSSProperties = {
  height: 36, padding: '0 32px 0 14px', border: '1px solid #E4E4E7', borderRadius: 99,
  fontSize: 12, fontWeight: 500, color: '#18181B', background: '#FFFFFF',
  cursor: 'pointer', outline: 'none', fontFamily: 'inherit', flexShrink: 0,
  appearance: 'none' as any, backgroundImage: SELECT_ICON,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
};

const drawerInput: React.CSSProperties = {
  width: '100%', height: 36, padding: '0 12px', border: '1px solid #E4E4E7',
  borderRadius: 8, fontSize: 13, color: '#09090B', background: '#FFFFFF',
  outline: 'none', boxSizing: 'border-box' as any, fontFamily: 'inherit',
};

const thStyle: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600,
  color: '#71717A', textTransform: 'uppercase' as any, letterSpacing: '.06em', whiteSpace: 'nowrap' as any,
};

// ─── PeriodDropdown ───────────────────────────────────────────────────────────
function PeriodDropdown({ period, cs, ce, onChange }: {
  period: PeriodKey; cs: string; ce: string;
  onChange: (p: PeriodKey, cs?: string, ce?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button onClick={() => setOpen(v => !v)} style={{ height: 36, padding: '0 14px', border: '1px solid #E4E4E7', borderRadius: 99, fontSize: 12, fontWeight: 500, color: '#09090B', background: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
        <i className="ti ti-calendar" style={{ fontSize: 13, color: '#71717A' }} />
        {PERIOD_LABELS[period]}
        <i className="ti ti-chevron-down" style={{ fontSize: 11, color: '#A1A1AA', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200, background: '#FFFFFF', borderRadius: 12, border: '1px solid #E4E4E7', boxShadow: '0 8px 24px rgba(0,0,0,0.10)', padding: '6px', minWidth: 190, animation: 'fadeUp .12s ease' }}>
          {PERIOD_OPTIONS.map(opt => (
            <button key={opt.key} onClick={() => { onChange(opt.key, cs, ce); if (opt.key !== 'custom') setOpen(false); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: period === opt.key ? 600 : 400, color: period === opt.key ? '#09090B' : '#374151', background: period === opt.key ? '#F4F4F5' : 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
              {opt.label}
              {period === opt.key && <i className="ti ti-check" style={{ fontSize: 12, color: '#09090B' }} />}
            </button>
          ))}
          {period === 'custom' && (
            <div style={{ padding: '8px 8px 4px', borderTop: '1px solid #F4F4F5', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.05em' }}>Intervalo personalizado</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="date" value={cs} onChange={e => onChange('custom', e.target.value, ce)} style={{ flex: 1, height: 30, padding: '0 8px', border: '1px solid #E4E4E7', borderRadius: 6, fontSize: 11, color: '#09090B', background: '#FFFFFF', outline: 'none', fontFamily: 'inherit' }} />
                <span style={{ fontSize: 11, color: '#A1A1AA' }}>—</span>
                <input type="date" value={ce} onChange={e => onChange('custom', cs, e.target.value)} style={{ flex: 1, height: 30, padding: '0 8px', border: '1px solid #E4E4E7', borderRadius: 6, fontSize: 11, color: '#09090B', background: '#FFFFFF', outline: 'none', fontFamily: 'inherit' }} />
              </div>
              <button onClick={() => setOpen(false)} style={{ height: 28, background: '#000', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Aplicar</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── FormField ────────────────────────────────────────────────────────────────
function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#71717A', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</label>
      {children}
    </div>
  );
}

// ─── Kpi ──────────────────────────────────────────────────────────────────────
function Kpi({ icon, iconBg, iconColor, label, value, sub }: { icon: string; iconBg: string; iconColor: string; label: string; value: string; sub: string }) {
  return (
    <div style={{ background: '#FFFFFF', borderRadius: 20, border: '1px solid #EAECEF', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
      <div style={{ width: 46, height: 46, borderRadius: 14, background: iconBg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <i className={`ti ${icon}`} style={{ fontSize: 21, color: iconColor }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: '#71717A', fontWeight: 500, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#09090B', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11, color: '#71717A', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
      </div>
    </div>
  );
}

// ─── SearchBox ────────────────────────────────────────────────────────────────
function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 99, background: '#FFFFFF', flex: '1 1 220px', maxWidth: 300 }}>
      <i className="ti ti-search" style={{ fontSize: 13, color: '#A1A1AA', flexShrink: 0 }} />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ border: 'none', background: 'transparent', fontSize: 12, outline: 'none', width: '100%', fontFamily: 'inherit', color: '#09090B' }} />
    </div>
  );
}

// ─── ActionBtn ────────────────────────────────────────────────────────────────
function ActionBtn({ label, icon, onClick, variant = 'primary' }: { label: string; icon?: string; onClick: () => void; variant?: 'primary' | 'outline' | 'green' | 'red' }) {
  const styles: Record<string, { bg: string; border: string; color: string; hoverBg: string }> = {
    primary: { bg: '#000000', border: 'none',                   color: '#FFFFFF', hoverBg: '#18181B' },
    outline: { bg: '#FFFFFF', border: '1px solid #000000',      color: '#000000', hoverBg: '#F4F4F5' },
    green:   { bg: '#FFFFFF', border: '1px solid #16A34A',      color: '#16A34A', hoverBg: '#F0FDF4' },
    red:     { bg: '#FFFFFF', border: '1px solid #DC2626',      color: '#DC2626', hoverBg: '#FEF2F2' },
  };
  const s = styles[variant];
  return (
    <button onClick={onClick}
      style={{ height: 36, padding: '0 16px', background: s.bg, border: s.border, borderRadius: 99, fontSize: 13, fontWeight: 600, color: s.color, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = s.hoverBg; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = s.bg; }}>
      {icon && <i className={`ti ${icon}`} style={{ fontSize: 14 }} />}
      {label}
    </button>
  );
}

// ─── ProductDrawer ────────────────────────────────────────────────────────────
function ProductDrawer({ product, categories, suppliers, onClose, onSaved }: {
  product: Product | null;
  categories: Category[]; suppliers: Supplier[];
  onClose: () => void; onSaved: (newCat?: Category) => void;
}) {
  const { toast } = useToast();
  const isEdit = !!product;

  const [name,        setName]        = useState(product?.name || '');
  const [sku,         setSku]         = useState(product?.sku || '');
  const [unit,        setUnit]        = useState(product?.unit || 'un');
  const [categoryId,  setCategoryId]  = useState(product?.category?.id || '');
  const [supplierId,  setSupplierId]  = useState(product?.supplier?.id || '');
  const [costPrice,   setCostPrice]   = useState(String(product?.costPrice ?? 0));
  const [salePrice,   setSalePrice]   = useState(String(product?.salePrice ?? 0));
  const [stock,       setStock]       = useState('0');
  const [minStock,    setMinStock]    = useState(String(product?.minStock ?? 0));
  const [description, setDescription] = useState(product?.description || '');
  const [active,      setActive]      = useState(product?.active ?? true);
  const [saving,      setSaving]      = useState(false);

  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [localCats,  setLocalCats]  = useState<Category[]>(categories);

  useEffect(() => { setLocalCats(categories); }, [categories]);

  async function handleCreateCat() {
    if (!newCatName.trim()) return;
    try {
      const cat = await inventoryApi.createCategory({ name: newCatName.trim() });
      setLocalCats(prev => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)));
      setCategoryId(cat.id);
      setNewCatName('');
      setShowNewCat(false);
      onSaved(cat);
    } catch { toast('Erro ao criar categoria', 'error'); }
  }

  async function handleSave() {
    if (!name.trim()) { toast('Nome obrigatório', 'error'); return; }
    setSaving(true);
    try {
      const data: any = {
        name: name.trim(), sku: sku || null, description: description || null,
        unit, categoryId: categoryId || null, supplierId: supplierId || null,
        costPrice: Number(costPrice) || 0, salePrice: Number(salePrice) || 0,
        minStock: Number(minStock) || 0, active,
      };
      if (!isEdit) data.stock = Number(stock) || 0;
      if (isEdit)  await inventoryApi.updateProduct(product!.id, data);
      else         await inventoryApi.createProduct(data);
      toast(isEdit ? 'Produto atualizado' : 'Produto criado', 'success');
      onSaved();
    } catch { toast('Erro ao salvar produto', 'error'); }
    finally { setSaving(false); }
  }

  return (
    <Portal>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={{ width: 460, background: '#FFFFFF', height: '100%', overflowY: 'auto', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', zIndex: 1001, display: 'flex', flexDirection: 'column', animation: 'slideIn .2s ease' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#09090B' }}>{isEdit ? 'Editar produto' : 'Novo produto'}</div>
              <div style={{ fontSize: 13, color: '#71717A', marginTop: 2 }}>{isEdit ? 'Atualize as informações' : 'Cadastre um novo produto no estoque'}</div>
            </div>
            <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}><i className="ti ti-x" style={{ fontSize: 18, color: '#71717A' }} /></button>
          </div>

          <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
            <FormField label="Nome *">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Vitamina C 500mg" style={drawerInput} autoFocus />
            </FormField>

            <FormField label="SKU / Código">
              <input value={sku} onChange={e => setSku(e.target.value)} placeholder="Ex: VIT-C-500" style={drawerInput} />
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Unidade">
                <select value={unit} onChange={e => setUnit(e.target.value)} style={{ ...drawerInput, cursor: 'pointer' }}>
                  {['un', 'cx', 'ampola', 'frasco', 'kit', 'pacote', 'comprimido', 'mg', 'ml', 'g', 'L'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </FormField>
              <FormField label="Categoria">
                {showNewCat ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Nome" style={{ ...drawerInput, flex: 1 }} onKeyDown={e => { if (e.key === 'Enter') handleCreateCat(); }} autoFocus />
                    <button onClick={handleCreateCat} style={{ height: 36, padding: '0 10px', background: '#000', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>OK</button>
                    <button onClick={() => setShowNewCat(false)} style={{ height: 36, width: 36, background: 'transparent', border: '1px solid #E4E4E7', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="ti ti-x" style={{ fontSize: 12, color: '#71717A' }} /></button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <select value={categoryId} onChange={e => setCategoryId(e.target.value)} style={{ ...drawerInput, flex: 1, cursor: 'pointer' }}>
                      <option value="">Sem categoria</option>
                      {localCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button title="Nova categoria" onClick={() => setShowNewCat(true)} style={{ height: 36, width: 36, background: 'transparent', border: '1px solid #E4E4E7', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><i className="ti ti-plus" style={{ fontSize: 13, color: '#71717A' }} /></button>
                  </div>
                )}
              </FormField>
            </div>

            <FormField label="Fornecedor">
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)} style={{ ...drawerInput, cursor: 'pointer' }}>
                <option value="">Sem fornecedor</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Custo unitário (R$)">
                <input type="number" min="0" step="0.01" value={costPrice} onChange={e => setCostPrice(e.target.value)} style={drawerInput} />
              </FormField>
              <FormField label="Preço de venda (R$)">
                <input type="number" min="0" step="0.01" value={salePrice} onChange={e => setSalePrice(e.target.value)} style={drawerInput} />
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {!isEdit && (
                <FormField label="Estoque inicial">
                  <input type="number" min="0" step="0.1" value={stock} onChange={e => setStock(e.target.value)} style={drawerInput} />
                </FormField>
              )}
              <FormField label="Estoque mínimo">
                <input type="number" min="0" step="0.1" value={minStock} onChange={e => setMinStock(e.target.value)} style={drawerInput} />
              </FormField>
            </div>

            <FormField label="Descrição">
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Informações adicionais..." style={{ ...drawerInput, height: 72, resize: 'none', paddingTop: 10 }} />
            </FormField>

            {isEdit && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                <span style={{ fontSize: 13, color: '#09090B' }}>Produto ativo</span>
              </label>
            )}
          </div>

          <div style={{ padding: '16px 24px', borderTop: '1px solid #E4E4E7', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
            <button onClick={onClose} style={{ height: 36, padding: '0 16px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#71717A', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={handleSave} disabled={saving} style={{ height: 36, padding: '0 20px', background: '#000000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#FFFFFF', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar produto'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ─── MovementDrawer ───────────────────────────────────────────────────────────
function MovementDrawer({ productId: initProductId = '', forceType, products, onClose, onSaved }: {
  productId?: string; forceType?: string; products: Product[];
  onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [productId, setProductId] = useState(initProductId);
  const [type,      setType]      = useState(forceType || 'ENTRADA');
  const [quantity,  setQuantity]  = useState('');
  const [unitCost,  setUnitCost]  = useState('');
  const [batch,     setBatch]     = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [reason,    setReason]    = useState('');
  const [saving,    setSaving]    = useState(false);

  async function handleSave() {
    if (!productId) { toast('Selecione um produto', 'error'); return; }
    if (!quantity || Number(quantity) <= 0) { toast('Quantidade inválida', 'error'); return; }
    setSaving(true);
    try {
      await inventoryApi.createMovement({
        productId, type, quantity: Number(quantity),
        unitCost:   unitCost   ? Number(unitCost)   : undefined,
        batch:      batch      || undefined,
        expiryDate: expiryDate ? new Date(expiryDate + 'T00:00:00').toISOString() : undefined,
        reason:     reason     || undefined,
      });
      toast('Movimento registrado', 'success');
      onSaved();
    } catch { toast('Erro ao registrar movimento', 'error'); }
    finally { setSaving(false); }
  }

  const typeLabel: Record<string, string> = {
    ENTRADA: 'Entrada (adiciona ao estoque)',
    SAIDA:   'Saída (remove do estoque)',
    CONSUMO: 'Consumo (uso interno)',
    AJUSTE:  'Ajuste (correção manual)',
  };

  return (
    <Portal>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={{ width: 420, background: '#FFFFFF', height: '100%', overflowY: 'auto', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', zIndex: 1001, display: 'flex', flexDirection: 'column', animation: 'slideIn .2s ease' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#09090B' }}>Registrar movimento</div>
              <div style={{ fontSize: 13, color: '#71717A', marginTop: 2 }}>Entrada, saída ou ajuste de estoque</div>
            </div>
            <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}><i className="ti ti-x" style={{ fontSize: 18, color: '#71717A' }} /></button>
          </div>

          <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <FormField label="Produto *">
              <select value={productId} onChange={e => setProductId(e.target.value)} style={{ ...drawerInput, cursor: 'pointer' }}>
                <option value="">Selecione um produto</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name} — estoque: {p.stock} {p.unit}</option>)}
              </select>
            </FormField>

            {!forceType && (
              <FormField label="Tipo *">
                <select value={type} onChange={e => setType(e.target.value)} style={{ ...drawerInput, cursor: 'pointer' }}>
                  {Object.entries(typeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </FormField>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Quantidade *">
                <input type="number" min="0.1" step="0.1" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0" style={drawerInput} />
              </FormField>
              <FormField label="Custo unit. (R$)">
                <input type="number" min="0" step="0.01" value={unitCost} onChange={e => setUnitCost(e.target.value)} placeholder="Opcional" style={drawerInput} />
              </FormField>
            </div>

            {(type === 'ENTRADA') && (
              <>
                <FormField label="Lote / Nº do lote">
                  <input value={batch} onChange={e => setBatch(e.target.value)} placeholder="Ex: LOT-2026-001" style={drawerInput} />
                </FormField>
                <FormField label="Data de vencimento">
                  <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} style={drawerInput} />
                </FormField>
              </>
            )}

            <FormField label="Motivo / Observação">
              <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex: Compra fornecedor X, nota fiscal 123" style={drawerInput} />
            </FormField>
          </div>

          <div style={{ padding: '16px 24px', borderTop: '1px solid #E4E4E7', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
            <button onClick={onClose} style={{ height: 36, padding: '0 16px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#71717A', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={handleSave} disabled={saving} style={{ height: 36, padding: '0 20px', background: '#000000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#FFFFFF', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Salvando...' : 'Registrar'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ─── ItensTab ─────────────────────────────────────────────────────────────────
function ItensTab() {
  const { toast } = useToast();
  const [products,   setProducts]   = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers,  setSuppliers]  = useState<Supplier[]>([]);
  const [stats,      setStats]      = useState<Stats>({ total: 0, abaixoMinimo: 0, valorTotal: 0 });
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [catFilter,  setCatFilter]  = useState('');
  const [statusFilt, setStatusFilt] = useState('todos');

  const [showProduct, setShowProduct] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [showMov,     setShowMov]     = useState(false);
  const [movProdId,   setMovProdId]   = useState('');
  const [movType,     setMovType]     = useState<string | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, c, sup] = await Promise.all([inventoryApi.stats(), inventoryApi.products(), inventoryApi.categories(), inventoryApi.suppliers()]);
      setStats(s); setProducts(p); setCategories(c); setSuppliers(sup);
    } catch { toast('Erro ao carregar estoque', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(p: Product) {
    if (!confirm(`Excluir "${p.name}"?`)) return;
    try { await inventoryApi.deleteProduct(p.id); toast('Produto removido', 'success'); load(); }
    catch { toast('Erro ao excluir produto', 'error'); }
  }

  const q = search.toLowerCase();
  const filtered = products.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q);
    const matchCat    = !catFilter || p.category?.id === catFilter;
    const matchStatus = statusFilt === 'todos' ? true
      : statusFilt === 'baixo'  ? (p.stock > 0 && p.stock <= p.minStock)
      : statusFilt === 'zerado' ? p.stock === 0
      : p.stock > p.minStock;
    return matchSearch && matchCat && matchStatus;
  });

  const semEstoque = products.filter(p => p.stock === 0).length;

  const kpis = [
    { label: 'Total de produtos', value: String(stats.total),         sub: 'produtos ativos',        icon: 'ti-package',        iconBg: '#EFF6FF', iconColor: '#2563EB' },
    { label: 'Estoque baixo',     value: String(stats.abaixoMinimo),  sub: 'abaixo do mínimo',       icon: 'ti-alert-triangle', iconBg: '#FFFBEB', iconColor: '#D97706' },
    { label: 'Sem estoque',       value: String(semEstoque),          sub: 'com estoque zerado',      icon: 'ti-box-off',        iconBg: '#FEF2F2', iconColor: '#DC2626' },
    { label: 'Valor em estoque',  value: fmt(stats.valorTotal),       sub: 'custo total do estoque', icon: 'ti-coin',           iconBg: '#F0FDF4', iconColor: '#16A34A' },
  ];

  return (
    <div style={{ padding: '16px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {kpis.map(k => <Kpi key={k.label} {...k} />)}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar produto ou SKU..." />
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={pillSelect}>
          <option value="">Todas as categorias</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={statusFilt} onChange={e => setStatusFilt(e.target.value)} style={pillSelect}>
          <option value="todos">Todos os status</option>
          <option value="ok">Normal</option>
          <option value="baixo">Estoque baixo</option>
          <option value="zerado">Sem estoque</option>
        </select>
        <div style={{ flex: 1 }} />
        <ActionBtn label="- Lançar saída"   icon="ti-circle-arrow-up"   variant="red"   onClick={() => { setMovProdId(''); setMovType('CONSUMO'); setShowMov(true); }} />
        <ActionBtn label="+ Lançar entrada" icon="ti-circle-arrow-down" variant="green" onClick={() => { setMovProdId(''); setMovType('ENTRADA'); setShowMov(true); }} />
        <ActionBtn label="Novo produto"   icon="ti-plus"  onClick={() => { setEditProduct(null); setShowProduct(true); }} />
      </div>

      <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E4E4E7', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F4F4F5', borderBottom: '1px solid #E4E4E7' }}>
              {['Produto', 'Categoria', 'Estoque', 'Unidade', 'Mínimo', 'Custo unit.', 'Status', 'Ações'].map((h, i) => (
                <th key={h} style={{ ...thStyle, textAlign: i >= 2 && i <= 5 ? 'right' : i === 7 ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoader colSpan={8} />
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '48px 16px', textAlign: 'center', color: '#A1A1AA', fontSize: 13 }}>
                {products.length === 0 ? 'Nenhum produto cadastrado. Clique em "Novo produto" para começar.' : 'Nenhum produto encontrado.'}
              </td></tr>
            ) : filtered.map(p => {
              const badge = stockBadge(p);
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid #F4F4F5', cursor: 'default' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F9F9F9')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#09090B' }}>{p.name}</div>
                    {p.sku && <div style={{ fontSize: 11, color: '#A1A1AA' }}>SKU: {p.sku}</div>}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#71717A' }}>{p.category?.name || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#09090B', textAlign: 'right' }}>{p.stock}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#71717A', textAlign: 'right' }}>{p.unit}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#71717A', textAlign: 'right' }}>{p.minStock}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#71717A', textAlign: 'right' }}>{fmt(p.costPrice)}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: badge.bg, color: badge.color }}>{badge.label}</span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button title="Lançar entrada" onClick={() => { setMovProdId(p.id); setMovType('ENTRADA'); setShowMov(true); }} style={{ height: 28, width: 28, border: '1px solid #BBF7D0', borderRadius: 6, background: '#F0FDF4', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="ti ti-plus" style={{ fontSize: 13, color: '#16A34A' }} />
                      </button>
                      <button title="Lançar saída" onClick={() => { setMovProdId(p.id); setMovType('CONSUMO'); setShowMov(true); }} style={{ height: 28, width: 28, border: '1px solid #FECACA', borderRadius: 6, background: '#FEF2F2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="ti ti-minus" style={{ fontSize: 13, color: '#DC2626' }} />
                      </button>
                      <button title="Editar" onClick={() => { setEditProduct(p); setShowProduct(true); }} style={{ height: 28, width: 28, border: '1px solid #E4E4E7', borderRadius: 6, background: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="ti ti-pencil" style={{ fontSize: 13, color: '#71717A' }} />
                      </button>
                      <button title="Excluir" onClick={() => handleDelete(p)} style={{ height: 28, width: 28, border: '1px solid #E4E4E7', borderRadius: 6, background: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="ti ti-trash" style={{ fontSize: 13, color: '#DC2626' }} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #E4E4E7', background: '#FAFAFA', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, color: '#71717A' }}>Mostrando <b style={{ color: '#09090B' }}>{filtered.length}</b> de <b style={{ color: '#09090B' }}>{products.length}</b> produtos</div>
        </div>
      </div>

      {showProduct && (
        <ProductDrawer
          product={editProduct}
          categories={categories}
          suppliers={suppliers}
          onClose={() => setShowProduct(false)}
          onSaved={(newCat) => {
            if (newCat) setCategories(prev => [...prev, newCat].sort((a, b) => a.name.localeCompare(b.name)));
            setShowProduct(false);
            load();
          }}
        />
      )}
      {showMov && (
        <MovementDrawer productId={movProdId} forceType={movType} products={products} onClose={() => setShowMov(false)} onSaved={() => { setShowMov(false); load(); }} />
      )}
    </div>
  );
}

// ─── MovimentosTab ────────────────────────────────────────────────────────────
function MovimentosTab() {
  const { toast } = useToast();
  const [products,  setProducts]  = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [period,    setPeriod]    = useState<PeriodKey>('this_month');
  const [cs,        setCs]        = useState('');
  const [ce,        setCe]        = useState('');
  const [showMov,   setShowMov]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, m] = await Promise.all([inventoryApi.products(), inventoryApi.movements()]);
      setProducts(p); setMovements(m);
    } catch { toast('Erro ao carregar movimentos', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { start, end } = computePeriod(period, cs, ce);
  const periodMovs = movements.filter(m => {
    const d = new Date(m.createdAt);
    return d >= start && d <= end;
  });
  const filtered = periodMovs.filter(m => {
    const matchSearch = !search || (m.product?.name || '').toLowerCase().includes(search.toLowerCase());
    const matchType   = !typeFilter || m.type === typeFilter;
    return matchSearch && matchType;
  });

  const countByType = (type: string) => periodMovs.filter(m => m.type === type).length;

  const kpis = [
    { label: 'Total no período', value: String(periodMovs.length), sub: 'movimentações',    icon: 'ti-arrows-exchange', iconBg: '#EFF6FF', iconColor: '#2563EB' },
    { label: 'Entradas',         value: String(countByType('ENTRADA')), sub: 'no período', icon: 'ti-arrow-down',      iconBg: '#F0FDF4', iconColor: '#16A34A' },
    { label: 'Consumos/Saídas',  value: String(countByType('CONSUMO') + countByType('SAIDA')), sub: 'no período', icon: 'ti-arrow-up', iconBg: '#FEF2F2', iconColor: '#DC2626' },
    { label: 'Ajustes',          value: String(countByType('AJUSTE')), sub: 'no período',  icon: 'ti-adjustments',    iconBg: '#FFFBEB', iconColor: '#D97706' },
  ];

  return (
    <div style={{ padding: '16px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {kpis.map(k => <Kpi key={k.label} {...k} />)}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar por produto..." />
        <PeriodDropdown period={period} cs={cs} ce={ce} onChange={(p, ncs, nce) => { setPeriod(p); if (ncs) setCs(ncs); if (nce) setCe(nce); }} />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={pillSelect}>
          <option value="">Todos os tipos</option>
          <option value="ENTRADA">Entrada</option>
          <option value="SAIDA">Saída</option>
          <option value="CONSUMO">Consumo</option>
          <option value="AJUSTE">Ajuste</option>
        </select>
        <div style={{ flex: 1 }} />
        <ActionBtn label="- Lançar saída"   icon="ti-circle-arrow-up"   variant="red"   onClick={() => setShowMov(true)} />
        <ActionBtn label="+ Lançar entrada" icon="ti-circle-arrow-down" variant="green" onClick={() => setShowMov(true)} />
      </div>

      <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E4E4E7', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F4F4F5', borderBottom: '1px solid #E4E4E7' }}>
              {['Data', 'Produto', 'Tipo', 'Quantidade', 'Custo unit.', 'Lote', 'Motivo'].map((h, i) => (
                <th key={h} style={{ ...thStyle, textAlign: i >= 3 && i <= 4 ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoader colSpan={7} />
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: '48px 16px', textAlign: 'center', color: '#A1A1AA', fontSize: 13 }}>Nenhum movimento no período.</td></tr>
            ) : filtered.map(m => {
              const badge = MOV_BADGE[m.type] || { label: m.type, bg: '#F4F4F5', color: '#71717A' };
              const isPos = m.type === 'ENTRADA' || m.type === 'AJUSTE';
              return (
                <tr key={m.id} style={{ borderBottom: '1px solid #F4F4F5' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F9F9F9')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#71717A', whiteSpace: 'nowrap' }}>{fmtDate(m.createdAt)}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: '#09090B' }}>{m.product?.name || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: badge.bg, color: badge.color }}>{badge.label}</span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: isPos ? '#16A34A' : '#DC2626', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {isPos ? '+' : '-'}{m.quantity} {m.product?.unit || ''}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#71717A', textAlign: 'right' }}>{m.unitCost ? fmt(m.unitCost) : '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#71717A' }}>{m.batch || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#71717A' }}>{m.reason || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #E4E4E7', background: '#FAFAFA', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, color: '#71717A' }}>Mostrando <b style={{ color: '#09090B' }}>{filtered.length}</b> de <b style={{ color: '#09090B' }}>{movements.length}</b> registros</div>
        </div>
      </div>

      {showMov && <MovementDrawer products={products} onClose={() => setShowMov(false)} onSaved={() => { setShowMov(false); load(); }} />}
    </div>
  );
}

// ─── ValidadesTab ─────────────────────────────────────────────────────────────
function ValidadesTab() {
  const { toast } = useToast();
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products,  setProducts]  = useState<Product[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [statusFilt, setStatusFilt] = useState('todos');
  const [showMov,   setShowMov]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, p] = await Promise.all([inventoryApi.expiryMovements(), inventoryApi.products()]);
      setMovements(m); setProducts(p);
    } catch { toast('Erro ao carregar validades', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const withBadge = movements.map(m => ({ ...m, badge: expiryBadge(m.expiryDate!) }));
  const vencidos  = withBadge.filter(m => m.badge.days < 0).length;
  const vence7    = withBadge.filter(m => m.badge.days >= 0 && m.badge.days <= 7).length;
  const vence30   = withBadge.filter(m => m.badge.days > 7 && m.badge.days <= 30).length;
  const ok        = withBadge.filter(m => m.badge.days > 30).length;

  const filtered = withBadge.filter(m => {
    const matchSearch = !search || (m.product?.name || '').toLowerCase().includes(search.toLowerCase()) || (m.batch || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilt === 'todos' ? true
      : statusFilt === 'vencido'  ? m.badge.days < 0
      : statusFilt === 'breve'    ? (m.badge.days >= 0 && m.badge.days <= 7)
      : statusFilt === 'atencao'  ? (m.badge.days > 7 && m.badge.days <= 30)
      : m.badge.days > 30;
    return matchSearch && matchStatus;
  });

  const kpis = [
    { label: 'Vencidos',        value: String(vencidos), sub: 'já venceram',          icon: 'ti-x',              iconBg: '#FEF2F2', iconColor: '#DC2626' },
    { label: 'Vencem em 7 dias', value: String(vence7),  sub: 'ação urgente',         icon: 'ti-alert-triangle', iconBg: '#FEF2F2', iconColor: '#DC2626' },
    { label: 'Vencem em 30 dias', value: String(vence30), sub: 'atenção',             icon: 'ti-clock',          iconBg: '#FFFBEB', iconColor: '#D97706' },
    { label: 'OK',              value: String(ok),        sub: 'dentro da validade',  icon: 'ti-circle-check',   iconBg: '#F0FDF4', iconColor: '#16A34A' },
  ];

  return (
    <div style={{ padding: '16px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {kpis.map(k => <Kpi key={k.label} {...k} />)}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar produto ou lote..." />
        <select value={statusFilt} onChange={e => setStatusFilt(e.target.value)} style={pillSelect}>
          <option value="todos">Todos os status</option>
          <option value="vencido">Vencidos</option>
          <option value="breve">Vencem em 7 dias</option>
          <option value="atencao">Vencem em 30 dias</option>
          <option value="ok">OK</option>
        </select>
        <div style={{ flex: 1 }} />
        <ActionBtn label="Nova entrada c/ validade" icon="ti-plus" onClick={() => setShowMov(true)} />
      </div>

      {movements.length === 0 && !loading ? (
        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E4E4E7', padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <i className="ti ti-calendar-off" style={{ fontSize: 22, color: '#D97706' }} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#09090B', marginBottom: 6 }}>Nenhuma validade registrada</div>
          <div style={{ fontSize: 13, color: '#71717A', maxWidth: 380, margin: '0 auto' }}>
            Registre a data de vencimento e o lote ao lançar entradas. Clique em "Nova entrada c/ validade" para começar.
          </div>
        </div>
      ) : (
        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E4E4E7', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F4F4F5', borderBottom: '1px solid #E4E4E7' }}>
                {['Produto', 'Lote', 'Quantidade', 'Validade', 'Dias restantes', 'Status'].map((h, i) => (
                  <th key={h} style={{ ...thStyle, textAlign: i >= 2 && i <= 4 ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableLoader colSpan={6} />
              ) : filtered.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid #F4F4F5' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F9F9F9')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: '#09090B' }}>{m.product?.name || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#71717A' }}>{m.batch || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#09090B', textAlign: 'right' }}>{m.quantity} {m.product?.unit || ''}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#71717A', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtDateOnly(m.expiryDate!)}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: m.badge.days < 0 ? '#DC2626' : m.badge.days <= 30 ? '#D97706' : '#09090B', textAlign: 'right' }}>
                    {m.badge.days < 0 ? `${Math.abs(m.badge.days)}d atrás` : `${m.badge.days}d`}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: m.badge.bg, color: m.badge.color }}>{m.badge.label}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '12px 20px', borderTop: '1px solid #E4E4E7', background: '#FAFAFA' }}>
            <div style={{ fontSize: 12, color: '#71717A' }}>Mostrando <b style={{ color: '#09090B' }}>{filtered.length}</b> de <b style={{ color: '#09090B' }}>{movements.length}</b> registros</div>
          </div>
        </div>
      )}

      {showMov && <MovementDrawer forceType="ENTRADA" products={products} onClose={() => setShowMov(false)} onSaved={() => { setShowMov(false); load(); }} />}
    </div>
  );
}

// ─── SugestaoTab ─────────────────────────────────────────────────────────────
function SugestaoTab() {
  const { toast } = useToast();
  const [products,   setProducts]   = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [catFilter,  setCatFilter]  = useState('');
  const [urgFilter,  setUrgFilter]  = useState('todos');
  const [showMov,    setShowMov]    = useState(false);
  const [movProdId,  setMovProdId]  = useState('');
  const [showProduct, setShowProduct] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([inventoryApi.products(), inventoryApi.categories()]);
      setProducts(p); setCategories(c);
    } catch { toast('Erro ao carregar sugestões', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const lowStock = products.filter(p => p.active && p.stock <= p.minStock);
  const urgentes = lowStock.filter(p => p.stock === 0).length;
  const fornecedores = new Set(lowStock.map(p => p.supplier?.id).filter(Boolean)).size;

  const filtered = lowStock.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchCat    = !catFilter || p.category?.id === catFilter;
    const matchUrg    = urgFilter === 'todos' ? true : urgFilter === 'urgente' ? p.stock === 0 : p.stock > 0;
    return matchSearch && matchCat && matchUrg;
  });

  const kpis = [
    { label: 'Abaixo do mínimo', value: String(lowStock.length), sub: 'itens para repor',       icon: 'ti-alert-triangle', iconBg: '#FFFBEB', iconColor: '#D97706' },
    { label: 'Urgentes',         value: String(urgentes),        sub: 'com estoque zerado',      icon: 'ti-alert-circle',   iconBg: '#FEF2F2', iconColor: '#DC2626' },
    { label: 'Fornecedores',     value: String(fornecedores),    sub: 'envolvidos nas sugestões', icon: 'ti-truck-delivery', iconBg: '#EFF6FF', iconColor: '#2563EB' },
  ];

  return (
    <div style={{ padding: '16px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {kpis.map(k => <Kpi key={k.label} {...k} />)}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar produto..." />
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={pillSelect}>
          <option value="">Todas as categorias</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={urgFilter} onChange={e => setUrgFilter(e.target.value)} style={pillSelect}>
          <option value="todos">Toda urgência</option>
          <option value="urgente">Urgente (sem estoque)</option>
          <option value="baixo">Baixo</option>
        </select>
        <div style={{ flex: 1 }} />
        <ActionBtn label="Novo produto" icon="ti-plus" variant="outline" onClick={() => setShowProduct(true)} />
        <ActionBtn label="Nova entrada" icon="ti-plus" onClick={() => { setMovProdId(''); setShowMov(true); }} />
      </div>

      {lowStock.length === 0 && !loading ? (
        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E4E4E7', padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <i className="ti ti-check" style={{ fontSize: 22, color: '#16A34A' }} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#09090B', marginBottom: 6 }}>Estoque em dia</div>
          <div style={{ fontSize: 13, color: '#71717A' }}>Todos os produtos estão acima do estoque mínimo.</div>
        </div>
      ) : (
        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E4E4E7', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F4F4F5', borderBottom: '1px solid #E4E4E7' }}>
                {['Produto', 'Categoria', 'Estoque atual', 'Mínimo', 'Sugestão de compra', 'Fornecedor', 'Status', ''].map((h, i) => (
                  <th key={h + i} style={{ ...thStyle, textAlign: i >= 2 && i <= 4 ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableLoader colSpan={8} />
              ) : filtered.map(p => {
                const sugestao = Math.max(1, Math.ceil(p.minStock * 2 - p.stock));
                const badge    = stockBadge(p);
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #F4F4F5' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#F9F9F9')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#09090B' }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: '#A1A1AA' }}>{p.unit}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#71717A' }}>{p.category?.name || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 700, color: p.stock === 0 ? '#DC2626' : '#D97706', textAlign: 'right' }}>{p.stock}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#71717A', textAlign: 'right' }}>{p.minStock}</td>
                    <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 700, color: '#09090B', textAlign: 'right' }}>{sugestao} {p.unit}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#71717A' }}>{p.supplier?.name || '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: badge.bg, color: badge.color }}>{badge.label}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <button onClick={() => { setMovProdId(p.id); setShowMov(true); }} style={{ height: 28, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 6, background: '#FFFFFF', cursor: 'pointer', fontSize: 12, color: '#09090B', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                        <i className="ti ti-plus" style={{ fontSize: 12, color: '#16A34A' }} /> Entrada
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: '12px 20px', borderTop: '1px solid #E4E4E7', background: '#FAFAFA' }}>
            <div style={{ fontSize: 12, color: '#71717A' }}>Mostrando <b style={{ color: '#09090B' }}>{filtered.length}</b> de <b style={{ color: '#09090B' }}>{lowStock.length}</b> itens</div>
          </div>
        </div>
      )}

      {showMov && <MovementDrawer productId={movProdId} forceType="ENTRADA" products={products} onClose={() => setShowMov(false)} onSaved={() => { setShowMov(false); load(); }} />}
      {showProduct && (
        <ProductDrawer product={null} categories={categories} suppliers={[]} onClose={() => setShowProduct(false)} onSaved={() => { setShowProduct(false); load(); }} />
      )}
    </div>
  );
}

// ─── ComprasTab ───────────────────────────────────────────────────────────────
function ComprasTab() {
  const { toast } = useToast();
  const [products,  setProducts]  = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [period,    setPeriod]    = useState<PeriodKey>('this_month');
  const [cs,        setCs]        = useState('');
  const [ce,        setCe]        = useState('');
  const [showMov,   setShowMov]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, m] = await Promise.all([inventoryApi.products(), inventoryApi.movements({ type: 'ENTRADA' })]);
      setProducts(p); setMovements(m);
    } catch { toast('Erro ao carregar compras', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { start, end } = computePeriod(period, cs, ce);
  const periodMovs = movements.filter(m => { const d = new Date(m.createdAt); return d >= start && d <= end; });
  const filtered = periodMovs.filter(m =>
    !search || (m.product?.name || '').toLowerCase().includes(search.toLowerCase()),
  );

  const totalQty   = periodMovs.reduce((s, m) => s + m.quantity, 0);
  const totalValue = periodMovs.reduce((s, m) => s + m.quantity * (m.unitCost || 0), 0);

  const kpis = [
    { label: 'Entradas no período', value: String(periodMovs.length), sub: 'registros de entrada', icon: 'ti-package', iconBg: '#EFF6FF', iconColor: '#2563EB' },
    { label: 'Qtd total recebida',  value: String(totalQty),          sub: 'unidades recebidas',  icon: 'ti-arrow-down', iconBg: '#F0FDF4', iconColor: '#16A34A' },
    { label: 'Valor total recebido', value: fmt(totalValue),          sub: 'custo das entradas',  icon: 'ti-coin', iconBg: '#FFFBEB', iconColor: '#D97706' },
  ];

  return (
    <div style={{ padding: '16px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {kpis.map(k => <Kpi key={k.label} {...k} />)}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar produto ou fornecedor..." />
        <PeriodDropdown period={period} cs={cs} ce={ce} onChange={(p, ncs, nce) => { setPeriod(p); if (ncs) setCs(ncs); if (nce) setCe(nce); }} />
        <div style={{ flex: 1 }} />
        <ActionBtn label="Nova entrada" icon="ti-plus" onClick={() => setShowMov(true)} />
      </div>

      <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E4E4E7', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F4F4F5', borderBottom: '1px solid #E4E4E7' }}>
              {['Data', 'Produto', 'Quantidade', 'Custo unit.', 'Total', 'Lote', 'Validade', 'Observação'].map((h, i) => (
                <th key={h} style={{ ...thStyle, textAlign: i >= 2 && i <= 4 ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoader colSpan={8} />
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '48px 16px', textAlign: 'center', color: '#A1A1AA', fontSize: 13 }}>Nenhuma entrada registrada no período.</td></tr>
            ) : filtered.map(m => (
              <tr key={m.id} style={{ borderBottom: '1px solid #F4F4F5' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#F9F9F9')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '12px 16px', fontSize: 12, color: '#71717A', whiteSpace: 'nowrap' }}>{fmtDate(m.createdAt)}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: '#09090B' }}>{m.product?.name || '—'}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#16A34A', textAlign: 'right' }}>+{m.quantity} {m.product?.unit || ''}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: '#71717A', textAlign: 'right' }}>{m.unitCost ? fmt(m.unitCost) : '—'}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#09090B', textAlign: 'right' }}>{m.unitCost ? fmt(m.quantity * m.unitCost) : '—'}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: '#71717A' }}>{m.batch || '—'}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: '#71717A', whiteSpace: 'nowrap' }}>{m.expiryDate ? fmtDateOnly(m.expiryDate) : '—'}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: '#71717A' }}>{m.reason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #E4E4E7', background: '#FAFAFA', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, color: '#71717A' }}>Mostrando <b style={{ color: '#09090B' }}>{filtered.length}</b> de <b style={{ color: '#09090B' }}>{movements.length}</b> entradas</div>
          {totalValue > 0 && <div style={{ fontSize: 12, color: '#71717A' }}>Total no período: <b style={{ color: '#09090B' }}>{fmt(totalValue)}</b></div>}
        </div>
      </div>

      {showMov && <MovementDrawer forceType="ENTRADA" products={products} onClose={() => setShowMov(false)} onSaved={() => { setShowMov(false); load(); }} />}
    </div>
  );
}

// ─── RelatoriosTab ────────────────────────────────────────────────────────────
function RelatoriosTab() {
  const { toast } = useToast();
  const [stats,    setStats]    = useState<Stats>({ total: 0, abaixoMinimo: 0, valorTotal: 0 });
  const [movStats, setMovStats] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [period,   setPeriod]   = useState<PeriodKey>('this_month');
  const [cs,       setCs]       = useState('');
  const [ce,       setCe]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = computePeriod(period, cs, ce);
      const params: Record<string, string> = {
        startDate: start.toISOString(),
        endDate:   end.toISOString(),
      };
      const [s, ms, p] = await Promise.all([inventoryApi.stats(), inventoryApi.movementStats(params), inventoryApi.products()]);
      setStats(s); setMovStats(ms); setProducts(p);
    } catch { toast('Erro ao carregar relatórios', 'error'); }
    finally { setLoading(false); }
  }, [period, cs, ce]);

  useEffect(() => { load(); }, [load]);

  const criticos = products.filter(p => p.active && p.stock <= p.minStock);

  const kpis = [
    { label: 'Total de produtos',  value: String(stats.total),         sub: 'produtos ativos',        icon: 'ti-package',        iconBg: '#EFF6FF', iconColor: '#2563EB' },
    { label: 'Valor em estoque',   value: fmt(stats.valorTotal),       sub: 'custo total do estoque', icon: 'ti-coin',           iconBg: '#F0FDF4', iconColor: '#16A34A' },
    { label: 'Movimentações',      value: String(movStats?.total || 0), sub: 'no período selecionado', icon: 'ti-arrows-exchange', iconBg: '#FFFBEB', iconColor: '#D97706' },
    { label: 'Estoque crítico',    value: String(stats.abaixoMinimo),  sub: 'abaixo do mínimo',       icon: 'ti-alert-triangle', iconBg: '#FEF2F2', iconColor: '#DC2626' },
  ];

  const movTypes = movStats ? [
    { label: 'Entradas',        count: movStats.byType.ENTRADA.count, qty: movStats.byType.ENTRADA.qty, value: movStats.byType.ENTRADA.value, color: '#16A34A' },
    { label: 'Saídas',          count: movStats.byType.SAIDA.count,   qty: movStats.byType.SAIDA.qty,   value: 0, color: '#DC2626' },
    { label: 'Consumos',        count: movStats.byType.CONSUMO.count, qty: movStats.byType.CONSUMO.qty, value: 0, color: '#D97706' },
    { label: 'Ajustes',         count: movStats.byType.AJUSTE.count,  qty: movStats.byType.AJUSTE.qty,  value: 0, color: '#2563EB' },
  ] : [];

  return (
    <div style={{ padding: '16px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {kpis.map(k => <Kpi key={k.label} {...k} />)}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <PeriodDropdown period={period} cs={cs} ce={ce} onChange={(p, ncs, nce) => { setPeriod(p); if (ncs) setCs(ncs); if (nce) setCe(nce); }} />
        <div style={{ flex: 1 }} />
        <ActionBtn label="Exportar" icon="ti-download" variant="outline" onClick={() => toast('Exportação em breve', 'info')} />
      </div>

      {loading ? (
        <SectionLoader />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* Movimentações por tipo */}
          <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E4E4E7', padding: '20px 24px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#09090B', marginBottom: 16 }}>Movimentações por tipo</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {movTypes.map(t => (
                <div key={t.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: '#374151' }}>{t.label}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#09090B' }}>{t.count} mov.</span>
                    <span style={{ fontSize: 13, color: '#71717A', minWidth: 60, textAlign: 'right' }}>{t.qty} un.</span>
                    {t.value > 0 && <span style={{ fontSize: 13, color: '#16A34A', minWidth: 80, textAlign: 'right' }}>{fmt(t.value)}</span>}
                  </div>
                </div>
              ))}
              {movTypes.every(t => t.count === 0) && (
                <div style={{ fontSize: 13, color: '#A1A1AA', textAlign: 'center', padding: '16px 0' }}>Nenhuma movimentação no período.</div>
              )}
            </div>
          </div>

          {/* Produtos críticos */}
          <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E4E4E7', padding: '20px 24px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#09090B', marginBottom: 16 }}>
              Produtos críticos <span style={{ fontSize: 11, fontWeight: 500, color: '#71717A' }}>({criticos.length})</span>
            </div>
            {criticos.length === 0 ? (
              <div style={{ fontSize: 13, color: '#A1A1AA', textAlign: 'center', padding: '16px 0' }}>Todos os produtos estão acima do mínimo.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {criticos.slice(0, 8).map(p => {
                  const badge = stockBadge(p);
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 13, color: '#09090B', fontWeight: 500 }}>{p.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: '#71717A' }}>{p.stock}/{p.minStock} {p.unit}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 99, background: badge.bg, color: badge.color }}>{badge.label}</span>
                      </div>
                    </div>
                  );
                })}
                {criticos.length > 8 && <div style={{ fontSize: 12, color: '#A1A1AA', textAlign: 'center', marginTop: 4 }}>+ {criticos.length - 8} outros</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function EstoquePage() {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'itens';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'transparent', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @keyframes fadeUp  { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes slideIn { from { transform:translateX(100%); } to { transform:translateX(0); } }
      `}</style>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {tab === 'itens'      && <ItensTab />}
        {tab === 'movimentos' && <MovimentosTab />}
        {tab === 'validades'  && <ValidadesTab />}
        {tab === 'sugestao'   && <SugestaoTab />}
        {tab === 'compras'    && <ComprasTab />}
        {tab === 'relatorios' && <RelatoriosTab />}
      </div>
    </div>
  );
}
