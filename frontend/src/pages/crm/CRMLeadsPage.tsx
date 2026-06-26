import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leadsApi } from '../../services/api';
import { SectionLoader } from '../../components/ui/Loader';
import { useToast } from '../../components/ui/Toast';
import { useSearchParams } from 'react-router-dom';
import {
  LEAD_STATUS_MAP,
  NovoLeadDrawer,
  LeadDetailDrawer,
  MarkLostModal,
  type Lead,
  type Funnel,
} from './CRMPage';

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const thStyle: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left',
  fontSize: 11, fontWeight: 600, color: '#71717A',
  textTransform: 'uppercase', letterSpacing: '.06em',
  whiteSpace: 'nowrap',
};

export function CRMLeadsPage() {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const [searchParams] = useSearchParams();
  const isLost = searchParams.get('view') === 'perdidos' || window.location.pathname.includes('/perdidos');

  const [search, setSearch] = useState('');
  const [funnelFilter, setFunnelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState(isLost ? 'PERDIDO' : '');
  const [showNovoLead, setShowNovoLead] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [confirmLost, setConfirmLost] = useState<Lead | null>(null);

  const { data: funnels = [] } = useQuery<Funnel[]>({
    queryKey: ['crm-funnels'],
    queryFn: () => leadsApi.funnels(),
  });

  const { data: leads = [], isLoading } = useQuery<Lead[]>({
    queryKey: ['crm-leads-list', search, funnelFilter, statusFilter],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (funnelFilter) params.funnelId = funnelFilter;
      if (statusFilter) params.status = statusFilter;
      return leadsApi.list(params);
    },
  });

  const markLostMut = useMutation({
    mutationFn: ({ id, lostReason }: { id: string; lostReason: string }) => leadsApi.markLost(id, lostReason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-leads-list'] });
      qc.invalidateQueries({ queryKey: ['crm-stats'] });
      addToast({ type: 'success', message: 'Lead marcado como perdido.' });
      setConfirmLost(null);
    },
    onError: () => addToast({ type: 'error', message: 'Erro ao atualizar lead.' }),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => leadsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-leads-list'] });
      addToast({ type: 'success', message: 'Lead excluído.' });
    },
    onError: () => addToast({ type: 'error', message: 'Erro ao excluir lead.' }),
  });

  const pageTitle = isLost ? 'CRM — Leads perdidos' : 'CRM — Lista de leads';
  const pageSubtitle = isLost ? 'Leads marcados como perdidos' : 'Todos os leads do sistema';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#FAFAFA', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ flexShrink: 0, background: '#FFFFFF', borderBottom: '1px solid #E4E4E7', padding: '20px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#09090B', letterSpacing: '-0.3px', margin: 0 }}>{pageTitle}</h1>
          <p style={{ fontSize: 13, color: '#71717A', marginTop: 2, marginBottom: 0 }}>{pageSubtitle}</p>
        </div>
        <button
          onClick={() => setShowNovoLead(true)}
          style={{ height: 36, padding: '0 16px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <i className="ti ti-plus" style={{ fontSize: 14 }} /> Novo lead
        </button>
      </div>

      {/* Filter Bar */}
      <div style={{ flexShrink: 0, background: '#FFFFFF', borderBottom: '1px solid #F0F0F0', padding: '12px 40px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, padding: '0 12px', height: 36, flex: '1 1 200px', maxWidth: 320 }}>
          <i className="ti ti-search" style={{ fontSize: 14, color: '#A1A1AA', flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone..."
            style={{ border: 'none', background: 'transparent', fontSize: 13, outline: 'none', width: '100%', color: '#09090B', fontFamily: 'inherit' }}
          />
        </div>
        <select
          value={funnelFilter}
          onChange={e => setFunnelFilter(e.target.value)}
          style={{ height: 36, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, color: '#09090B', background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          <option value="">Todos os funis</option>
          {funnels.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ height: 36, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, color: '#09090B', background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          <option value="">Todos os status</option>
          {Object.entries(LEAD_STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {(search || funnelFilter || (statusFilter && !isLost)) && (
          <button
            onClick={() => { setSearch(''); setFunnelFilter(''); if (!isLost) setStatusFilter(''); }}
            style={{ height: 36, padding: '0 12px', background: 'transparent', border: 'none', fontSize: 13, fontWeight: 500, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <i className="ti ti-x" style={{ fontSize: 12 }} /> Limpar filtros
          </button>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#A1A1AA' }}>{leads.length} lead{leads.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '24px 40px' }}>
        {isLoading ? (
          <SectionLoader label="Carregando leads..." />
        ) : leads.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 300 }}>
            <div style={{ textAlign: 'center', color: '#71717A' }}>
              <i className="ti ti-users" style={{ fontSize: 40, color: '#D1D5DB', display: 'block', marginBottom: 12 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: '#09090B', marginBottom: 4 }}>Nenhum lead encontrado</div>
              <div style={{ fontSize: 13, color: '#A1A1AA' }}>Crie um novo lead ou ajuste os filtros</div>
            </div>
          </div>
        ) : (
          <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E4E4E7', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F4F4F5', borderBottom: '1px solid #E4E4E7' }}>
                  <th style={thStyle}>Data</th>
                  <th style={thStyle}>Nome / Contato</th>
                  <th style={thStyle}>Funil / Etapa</th>
                  <th style={thStyle}>Origem</th>
                  <th style={thStyle}>Responsável</th>
                  <th style={thStyle}>Valor</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Próx. Atividade</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {leads.map(lead => {
                  const st = LEAD_STATUS_MAP[lead.status] ?? LEAD_STATUS_MAP.NOVO;
                  const funnel = funnels.find(f => f.id === lead.funnelId);
                  return (
                    <tr
                      key={lead.id}
                      style={{ borderBottom: '1px solid #F4F4F5' }}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#F9F9F9'}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                    >
                      <td style={{ padding: '12px 14px', fontSize: 12, color: '#71717A', whiteSpace: 'nowrap' }}>
                        {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#71717A', flexShrink: 0 }}>
                            {lead.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#09090B' }}>{lead.name}</div>
                            <div style={{ fontSize: 11, color: '#A1A1AA', marginTop: 1 }}>
                              {lead.phone && <span style={{ marginRight: 8 }}>{lead.phone}</span>}
                              {lead.email && <span>{lead.email}</span>}
                              {!lead.phone && !lead.email && '—'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: '#374151' }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: '#09090B' }}>{funnel?.name ?? '—'}</div>
                        {lead.stage && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: lead.stage.color || '#E5E7EB', flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: '#71717A' }}>{lead.stage.name}</span>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: '#71717A' }}>
                        {lead.leadSource?.name ?? lead.source ?? '—'}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: '#374151' }}>
                        {lead.assignedUser?.name ?? '—'}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: lead.value ? 600 : 400, color: lead.value ? '#09090B' : '#A1A1AA', whiteSpace: 'nowrap' }}>
                        {lead.value ? fmt(lead.value) : '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: st.bg, color: st.color }}>
                          {st.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 11, color: lead.nextActivityAt ? '#D97706' : '#A1A1AA', whiteSpace: 'nowrap' }}>
                        {lead.nextActivityAt ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <i className="ti ti-calendar" style={{ fontSize: 11 }} />
                            {lead.nextActivity} · {new Date(lead.nextActivityAt).toLocaleDateString('pt-BR')}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => setSelectedLead(lead)}
                            style={{ height: 30, padding: '0 10px', background: '#F4F4F5', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}
                          >
                            <i className="ti ti-eye" style={{ fontSize: 12 }} /> Ver
                          </button>
                          {lead.status !== 'PERDIDO' && (
                            <button
                              onClick={() => setConfirmLost(lead)}
                              style={{ height: 30, padding: '0 8px', background: 'transparent', border: 'none', borderRadius: 6, fontSize: 12, color: '#DC2626', cursor: 'pointer', fontFamily: 'inherit' }}
                              title="Marcar como perdido"
                            >
                              <i className="ti ti-x-circle" style={{ fontSize: 14 }} />
                            </button>
                          )}
                          <button
                            onClick={() => { if (window.confirm('Excluir este lead?')) removeMut.mutate(lead.id); }}
                            style={{ height: 30, padding: '0 8px', background: 'transparent', border: 'none', borderRadius: 6, fontSize: 12, color: '#A1A1AA', cursor: 'pointer', fontFamily: 'inherit' }}
                            title="Excluir"
                          >
                            <i className="ti ti-trash" style={{ fontSize: 14 }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Overlays */}
      {showNovoLead && (
        <NovoLeadDrawer
          funnels={funnels}
          defaultFunnelId={funnelFilter || funnels[0]?.id}
          onClose={() => setShowNovoLead(false)}
        />
      )}
      {selectedLead && (
        <LeadDetailDrawer
          lead={selectedLead}
          funnels={funnels}
          onClose={() => setSelectedLead(null)}
          onMarkLost={l => setConfirmLost(l)}
        />
      )}
      {confirmLost && (
        <MarkLostModal
          lead={confirmLost}
          onConfirm={reason => markLostMut.mutate({ id: confirmLost.id, lostReason: reason })}
          onCancel={() => setConfirmLost(null)}
          loading={markLostMut.isPending}
        />
      )}
    </div>
  );
}
