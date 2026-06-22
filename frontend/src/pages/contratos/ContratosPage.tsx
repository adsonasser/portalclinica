import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { contractsApi, contractTemplatesApi, patientsApi } from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { Portal } from '../../components/ui/Portal';

// ─── Types ────────────────────────────────────────────────────────────────────

type ContractStatus = 'a_gerar' | 'gerado' | 'impresso' | 'aguardando_assinatura' | 'assinado' | 'cancelado';
type ContractOrigin = 'sale_auto' | 'sale_manual' | 'manual_template' | 'custom_blank';

const STATUS_CFG: Record<ContractStatus, { bg: string; color: string; label: string }> = {
  a_gerar:               { bg: '#EFF6FF', color: '#2563EB', label: 'A gerar' },
  gerado:                { bg: '#F5F3FF', color: '#7C3AED', label: 'Gerado' },
  impresso:              { bg: '#F0FDFA', color: '#0D9488', label: 'Impresso' },
  aguardando_assinatura: { bg: '#FFFBEB', color: '#D97706', label: 'Aguardando assinatura' },
  assinado:              { bg: '#DCFCE7', color: '#16A34A', label: 'Assinado' },
  cancelado:             { bg: '#F4F4F5', color: '#71717A', label: 'Cancelado' },
};

const ORIGIN_LABEL: Record<ContractOrigin, string> = {
  sale_auto:       'Venda automática',
  sale_manual:     'Venda manual',
  manual_template: 'Modelo manual',
  custom_blank:    'Personalizado',
};

const CONTRACT_TYPES = [
  'Prestação de serviço', 'Plano/protocolo', 'Procedimento',
  'Termo de consentimento', 'Responsabilidade', 'Ciência',
  'Tratamento', 'Personalizado', 'Outro',
];

const ALL_VARIABLES = [
  '{{nome_paciente}}', '{{cpf_paciente}}', '{{data_nascimento}}', '{{telefone_paciente}}',
  '{{email_paciente}}', '{{nome_clinica}}', '{{cnpj_clinica}}', '{{nome_profissional}}',
  '{{data_atual}}', '{{cidade_clinica}}', '{{valor_total}}', '{{itens_contratados}}',
];

// ─── Print helpers ────────────────────────────────────────────────────────────

function buildContractHTML(contract: any): string {
  const docHdr = (() => { try { return JSON.parse(localStorage.getItem('pcl_doc_header') || '{}'); } catch { return {}; } })() as { header?: string; footer?: string };
  const logo   = localStorage.getItem('pcl_logo') || '';
  const user   = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const clinic = user?.clinic;

  const clinicLines = docHdr.header
    ? docHdr.header.replace(/\n/g, '<br>')
    : [clinic?.name, clinic?.address, clinic?.phone, clinic?.email].filter(Boolean).join(' · ');

  const headerBlock = clinicLines || logo
    ? `<div style="display:flex;align-items:center;gap:16px;padding-bottom:14px;border-bottom:2px solid #191C1D;margin-bottom:20px">
        ${logo ? `<img src="${logo}" style="max-height:52px;max-width:140px;object-fit:contain" />` : ''}
        <div style="font-size:12px;color:#374151;line-height:1.5">${clinicLines || ''}</div>
      </div>`
    : '';

  const footerBlock = docHdr.footer
    ? `<div style="margin-top:32px;padding-top:12px;border-top:1px solid #E4E4E7;font-size:11px;color:#9CA3AF;text-align:center">${docHdr.footer.replace(/\n/g, '<br>')}</div>`
    : '';

  return `${headerBlock}${contract.contentSnapshot || ''}${footerBlock}`;
}

function printContractIframe(html: string) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}
    body{font-family:Inter,Arial,sans-serif;max-width:700px;margin:32px auto;padding:0 24px;font-size:13.5px;line-height:1.75;color:#191C1D}
    @media print{body{margin:0}@page{margin:18mm}}
  </style></head><body>${html}</body></html>`);
  doc.close();
  setTimeout(() => {
    iframe.contentWindow!.print();
    setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 2000);
  }, 400);
}

// ─── Contract Print Preview ───────────────────────────────────────────────────

function ContractPrintPreview({ contract, onClose, onPrinted }: { contract: any; onClose: () => void; onPrinted: () => void }) {
  const previewHTML = buildContractHTML(contract);

  const handlePrint = () => {
    printContractIframe(previewHTML);
    onPrinted();
  };

  return (
    <Portal>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 959 }} />
      <div style={{ position: 'fixed', inset: '16px', borderRadius: 20, background: '#EAECEF', zIndex: 960, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', fontFamily: "'Inter', system-ui, sans-serif" }}>

        {/* Topbar */}
        <div style={{ flexShrink: 0, background: '#FFFFFF', borderBottom: '1px solid #E4E4E7', padding: '11px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#191C1D' }}>Prévia do contrato</div>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#F4F4F5', color: '#71717A', fontWeight: 500 }}>{contract.title}</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose}
            style={{ width: 30, height: 30, border: 'none', background: '#F4F4F5', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A' }}>
            <i className="ti ti-x" style={{ fontSize: 13 }} />
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
          {/* A4 preview */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: '32px 24px', background: '#EAECEF' }}>
            <div style={{
              width: '210mm', minHeight: '297mm',
              margin: '0 auto',
              background: '#FFFFFF', boxShadow: '0 4px 32px rgba(0,0,0,0.2)',
              borderRadius: 3, padding: '2cm 2.5cm',
              fontFamily: "'Inter', Arial, sans-serif", fontSize: '13.5px', lineHeight: 1.75, color: '#191C1D',
              boxSizing: 'border-box',
            }} dangerouslySetInnerHTML={{ __html: previewHTML }} />
          </div>

          {/* Sidebar de ações */}
          <div style={{ width: 272, flexShrink: 0, background: '#FFFFFF', borderLeft: '1px solid #E4E4E7', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>Forma de saída</div>

              <button onClick={handlePrint}
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

              <button onClick={handlePrint}
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

              <div style={{ height: 1, background: '#E4E4E7', margin: '16px 0' }} />

              <div style={{ fontSize: 11, fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Informações</div>
              {[
                { label: 'Paciente', value: contract.patient?.name ?? '—' },
                { label: 'Tipo', value: contract.type },
                { label: 'Status', value: STATUS_CFG[contract.status as ContractStatus]?.label ?? contract.status },
              ].map(({ label, value }) => (
                <div key={label} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ─── Variable fill ────────────────────────────────────────────────────────────

function fillVariables(content: string, data: { patient?: any; clinic?: any; user?: any; items?: any[]; totalValue?: number }) {
  const { patient, clinic, user, items = [], totalValue } = data;
  const fmt = (v: number) => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? '';
  const itemsText = items.map(i =>
    `${i.name}${i.sessionsQuantity ? ` (${i.sessionsQuantity} sessões)` : ''} — ${fmt(i.totalValue ?? 0)}`
  ).join('\n');

  const vars: Record<string, string> = {
    '{{nome_paciente}}':     patient?.name ?? '',
    '{{cpf_paciente}}':      patient?.cpf ?? '',
    '{{data_nascimento}}':   patient?.birthDate ? new Date(patient.birthDate).toLocaleDateString('pt-BR') : '',
    '{{telefone_paciente}}': patient?.phone ?? '',
    '{{email_paciente}}':    patient?.email ?? '',
    '{{endereco_paciente}}': patient?.address ?? '',
    '{{nome_clinica}}':      clinic?.name ?? '',
    '{{cnpj_clinica}}':      clinic?.cnpj ?? '',
    '{{endereco_clinica}}':  clinic?.address ?? '',
    '{{telefone_clinica}}':  clinic?.phone ?? '',
    '{{email_clinica}}':     clinic?.email ?? '',
    '{{nome_profissional}}': user?.name ?? '',
    '{{cargo_profissional}}': user?.role ?? '',
    '{{data_atual}}':        new Date().toLocaleDateString('pt-BR'),
    '{{cidade_clinica}}':    clinic?.city ?? '',
    '{{valor_total}}':       totalValue != null ? fmt(totalValue) : '',
    '{{itens_contratados}}': itemsText,
    '{{descricao_itens}}':   itemsText,
  };

  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(k, v), content);
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon, iconBg, iconColor }: { label: string; value: number; icon: string; iconBg: string; iconColor: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', background: '#FFFFFF', borderRadius: 12, border: '1px solid #E4E4E7' }}>
      <div style={{ width: 42, height: 42, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <i className={`ti ${icon}`} style={{ fontSize: 20, color: iconColor }} />
      </div>
      <div>
        <div style={{ fontSize: 11, color: '#71717A', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#09090B', lineHeight: 1.1 }}>{value}</div>
      </div>
    </div>
  );
}

// ─── Contract Detail Panel ────────────────────────────────────────────────────

function ContractDetailPanel({ contract, onClose, onRefresh }: { contract: any; onClose: () => void; onRefresh: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [previewOpen, setPreviewOpen]           = useState(false);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [confirmCancel, setConfirmCancel]       = useState(false);
  const s = STATUS_CFG[contract.status as ContractStatus] ?? STATUS_CFG.a_gerar;

  const updateMut = useMutation({
    mutationFn: (data: any) => contractsApi.update(contract.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contracts'] }); onRefresh(); },
  });

  const handleOpenPrint = () => {
    if (!contract.contentSnapshot) { toast('Gere o contrato antes de imprimir.', 'error'); return; }
    setPrintPreviewOpen(true);
  };

  const items = (() => { try { return JSON.parse(contract.itemsSnapshot || '[]') || []; } catch { return []; } })();

  return (
    <Portal>
    <div style={{ position: 'fixed', inset: 0, zIndex: 800, display: 'flex' }}>
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(0,0,0,0.35)' }} />
      <div style={{ width: 520, background: '#FFFFFF', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 32px rgba(0,0,0,.14)', fontFamily: "'Inter', system-ui, sans-serif" }}>
        {/* Header */}
        <div style={{ flexShrink: 0, padding: '18px 24px', borderBottom: '1px solid #E4E4E7', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#09090B', marginBottom: 4 }}>{contract.title}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: s.bg, color: s.color }}>{s.label}</span>
              <span style={{ fontSize: 11, color: '#71717A' }}>{ORIGIN_LABEL[contract.origin as ContractOrigin] ?? contract.origin}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, border: 'none', background: '#F4F4F5', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A', flexShrink: 0 }}>
            <i className="ti ti-x" style={{ fontSize: 14 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Paciente */}
          {contract.patient && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Paciente</div>
              <div style={{ padding: '12px 14px', background: '#F9F9F9', borderRadius: 8, border: '1px solid #E4E4E7' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#09090B' }}>{contract.patient.name}</div>
                {contract.patient.phone && <div style={{ fontSize: 12, color: '#71717A', marginTop: 2 }}>{contract.patient.phone}</div>}
              </div>
            </div>
          )}

          {/* Informações */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Informações</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'Tipo', value: contract.type },
                { label: 'Criado em', value: new Date(contract.createdAt).toLocaleDateString('pt-BR') },
                { label: 'Gerado em', value: contract.generatedAt ? new Date(contract.generatedAt).toLocaleDateString('pt-BR') : '—' },
                { label: 'Modelo', value: contract.contractTemplate?.name ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} style={{ padding: '10px 12px', background: '#F9F9F9', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#09090B' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Itens */}
          {items.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Itens contratados</div>
              <div style={{ border: '1px solid #E4E4E7', borderRadius: 8, overflow: 'hidden' }}>
                {items.map((item: any, i: number) => (
                  <div key={i} style={{ padding: '10px 14px', borderBottom: i < items.length - 1 ? '1px solid #F4F4F5' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#09090B' }}>{item.name}</div>
                      {item.sessionsQuantity && <div style={{ fontSize: 11, color: '#71717A' }}>{item.sessionsQuantity} sessões</div>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#09090B', whiteSpace: 'nowrap' }}>
                      {(item.totalValue ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </div>
                  </div>
                ))}
                {contract.totalValue != null && (
                  <div style={{ padding: '10px 14px', background: '#F9F9F9', display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #E4E4E7' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#09090B' }}>Total</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#09090B' }}>
                      {contract.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Preview do conteúdo */}
          {contract.contentSnapshot && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                Conteúdo
                <button onClick={() => setPreviewOpen(o => !o)} style={{ fontSize: 11, fontWeight: 500, color: '#71717A', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {previewOpen ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
              {previewOpen && (
                <div style={{ border: '1px solid #E4E4E7', borderRadius: 8, padding: '16px', background: '#FAFAFA', maxHeight: 280, overflowY: 'auto', fontSize: 12, color: '#374151', lineHeight: 1.7 }}
                  dangerouslySetInnerHTML={{ __html: contract.contentSnapshot }} />
              )}
            </div>
          )}

          {/* Observações */}
          {contract.notes && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Observações</div>
              <div style={{ fontSize: 12, color: '#374151', background: '#F9F9F9', padding: '10px 12px', borderRadius: 8, border: '1px solid #E4E4E7' }}>{contract.notes}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0, padding: '14px 24px', borderTop: '1px solid #E4E4E7', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {contract.contentSnapshot && (
            <button onClick={handleOpenPrint}
              style={{ flex: 1, height: 36, background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <i className="ti ti-printer" style={{ fontSize: 13 }} /> Imprimir
            </button>
          )}
          {contract.status !== 'cancelado' && (
            <button onClick={() => setConfirmCancel(true)}
              style={{ height: 36, padding: '0 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#DC2626', cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancelar contrato
            </button>
          )}
        </div>
      </div>

      {printPreviewOpen && (
        <ContractPrintPreview
          contract={contract}
          onClose={() => setPrintPreviewOpen(false)}
          onPrinted={() => { updateMut.mutate({ status: 'impresso' }); }}
        />
      )}

      {confirmCancel && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 820, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setConfirmCancel(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
          <div style={{ position: 'relative', background: '#FFFFFF', borderRadius: 16, padding: '24px 28px', width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.22)', fontFamily: "'Inter', system-ui, sans-serif" }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: 22, color: '#DC2626' }} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#09090B', marginBottom: 6 }}>Cancelar contrato?</div>
            <div style={{ fontSize: 13, color: '#71717A', lineHeight: 1.6, marginBottom: 22 }}>
              Tem certeza que deseja cancelar <strong style={{ color: '#09090B' }}>{contract.title}</strong>? Esta ação não poderá ser desfeita.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmCancel(false)}
                style={{ height: 36, padding: '0 16px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                Voltar
              </button>
              <button onClick={() => { updateMut.mutate({ status: 'cancelado' }); setConfirmCancel(false); onClose(); }}
                style={{ height: 36, padding: '0 16px', background: '#DC2626', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}>
                Confirmar cancelamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </Portal>
  );
}

// ─── New Contract Drawer ──────────────────────────────────────────────────────

type NewContractMode = 'manual_template' | 'custom_blank' | 'sale_manual';

function NewContractDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [step, setStep]               = useState<'choose' | 'form'>('choose');
  const [mode, setMode]               = useState<NewContractMode>('manual_template');
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [title, setTitle]             = useState('');
  const [type, setType]               = useState('Prestação de serviço');
  const [notes, setNotes]             = useState('');
  const [totalValue, setTotalValue]   = useState('');
  const [items, setItems]             = useState<any[]>([]);
  const [generateNow, setGenerateNow] = useState(true);
  const editorRef = useRef<HTMLDivElement>(null);

  const { data: templates = [] } = useQuery({
    queryKey: ['contract-templates'],
    queryFn: () => contractTemplatesApi.list(),
  });

  const { data: patients = [] } = useQuery({
    queryKey: ['patients-search', patientSearch],
    queryFn: () => patientsApi.list({ search: patientSearch }),
    enabled: patientSearch.length > 1,
  });

  const createMut = useMutation({
    mutationFn: (data: any) => contractsApi.create(data),
    onSuccess: () => { toast('Contrato criado com sucesso.', 'success'); onCreated(); },
    onError:   () => toast('Erro ao criar contrato.', 'error'),
  });

  const addItem = () => setItems(prev => [...prev, { name: '', description: '', quantity: 1, unitValue: 0, totalValue: 0, sessionsQuantity: '' }]);
  const updateItem = (i: number, field: string, value: any) => setItems(prev => {
    const next = [...prev];
    next[i] = { ...next[i], [field]: value };
    if (field === 'quantity' || field === 'unitValue') {
      next[i].totalValue = (next[i].quantity ?? 1) * (next[i].unitValue ?? 0);
    }
    return next;
  });
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));

  const computedTotal = items.reduce((sum, it) => sum + (it.totalValue ?? 0), 0);

  const handleSubmit = () => {
    if (!title.trim()) { toast('Informe o título do contrato.', 'error'); return; }
    const user   = (() => { try { return JSON.parse(localStorage.getItem('user')   || '{}'); } catch { return {}; } })();
    const clinic = (() => { try { return JSON.parse(localStorage.getItem('clinic') || '{}'); } catch { return {}; } })();
    const rawContent = mode === 'custom_blank'
      ? (editorRef.current?.innerHTML?.trim() || '')
      : (selectedTemplate?.content || '');
    const filledContent = fillVariables(rawContent, { patient: selectedPatient, clinic, user, items, totalValue: totalValue ? parseFloat(totalValue) : computedTotal || undefined });

    createMut.mutate({
      patientId:           selectedPatient?.id,
      contractTemplateId:  selectedTemplate?.id,
      title:               title.trim(),
      type,
      origin:              mode,
      status:              generateNow && filledContent ? 'gerado' : 'a_gerar',
      contentSnapshot:     generateNow && filledContent ? filledContent : undefined,
      itemsSnapshot:       items.length ? JSON.stringify(items) : undefined,
      notes:               notes.trim() || undefined,
      totalValue:          totalValue ? parseFloat(totalValue) : computedTotal || undefined,
    });
  };

  const inputStyle: React.CSSProperties = { width: '100%', height: 36, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, color: '#09090B', background: '#FFFFFF', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 };

  return (
    <Portal>
    <div style={{ position: 'fixed', inset: 0, zIndex: 800, display: 'flex' }}>
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(0,0,0,0.35)' }} />
      <div style={{ width: 560, background: '#FFFFFF', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 32px rgba(0,0,0,.14)', fontFamily: "'Inter', system-ui, sans-serif" }}>

        {/* Header */}
        <div style={{ flexShrink: 0, padding: '18px 24px', borderBottom: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', gap: 10 }}>
          {step === 'form' && (
            <button onClick={() => setStep('choose')} style={{ width: 28, height: 28, border: 'none', background: '#F4F4F5', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A', flexShrink: 0 }}>
              <i className="ti ti-arrow-left" style={{ fontSize: 12 }} />
            </button>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#09090B' }}>Novo contrato</div>
            <div style={{ fontSize: 11, color: '#71717A' }}>{step === 'choose' ? 'Escolha como criar o contrato' : 'Preencha os dados'}</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, border: 'none', background: '#F4F4F5', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A' }}>
            <i className="ti ti-x" style={{ fontSize: 14 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Step: choose */}
          {step === 'choose' && ([
            { mode: 'manual_template' as const, icon: 'ti-template',  title: 'Manual com modelo',        desc: 'Escolha um modelo de contrato e selecione o paciente.' },
            { mode: 'custom_blank'    as const, icon: 'ti-file-plus', title: 'Personalizado em branco',   desc: 'Escreva um contrato livre sem estar preso a um modelo.' },
            { mode: 'sale_manual'     as const, icon: 'ti-receipt',   title: 'A partir de venda',         desc: 'Selecione uma venda e gere o contrato com os dados dela.' },
          ] as const).map(opt => (
            <button key={opt.mode}
              onClick={() => { setMode(opt.mode); setStep('form'); }}
              style={{ width: '100%', padding: '16px 18px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 12, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'flex-start', gap: 14 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#000'; (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 12px rgba(0,0,0,.07)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#E4E4E7'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className={`ti ${opt.icon}`} style={{ fontSize: 18, color: '#374151' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#09090B', marginBottom: 4 }}>{opt.title}</div>
                <div style={{ fontSize: 12, color: '#71717A', lineHeight: 1.5 }}>{opt.desc}</div>
              </div>
              <i className="ti ti-chevron-right" style={{ fontSize: 14, color: '#C4C4C8', alignSelf: 'center' }} />
            </button>
          ))}

          {/* Step: form */}
          {step === 'form' && (
            <>
              {/* Título */}
              <div>
                <label style={labelStyle}>Título do contrato *</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Contrato de prestação de serviços" style={inputStyle} />
              </div>

              {/* Tipo */}
              <div>
                <label style={labelStyle}>Tipo</label>
                <select value={type} onChange={e => setType(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  {CONTRACT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>

              {/* Paciente */}
              <div style={{ position: 'relative' }}>
                <label style={labelStyle}>Paciente</label>
                <input
                  value={selectedPatient ? selectedPatient.name : patientSearch}
                  onChange={e => { setPatientSearch(e.target.value); if (selectedPatient) setSelectedPatient(null); }}
                  placeholder="Buscar paciente..."
                  style={inputStyle}
                />
                {!selectedPatient && (patients as any[]).length > 0 && patientSearch.length > 1 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 20, maxHeight: 180, overflowY: 'auto' }}>
                    {(patients as any[]).map((p: any) => (
                      <button key={p.id} onClick={() => { setSelectedPatient(p); setPatientSearch(''); }}
                        style={{ width: '100%', padding: '9px 14px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13, color: '#09090B', fontFamily: 'inherit' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F5F5F7'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}>
                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                        {p.phone && <div style={{ fontSize: 11, color: '#71717A' }}>{p.phone}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Modelo (mode=manual_template) */}
              {mode === 'manual_template' && (
                <div>
                  <label style={labelStyle}>Modelo de contrato</label>
                  <select value={selectedTemplate?.id || ''}
                    onChange={e => {
                      const t = (templates as any[]).find((t: any) => t.id === e.target.value);
                      setSelectedTemplate(t || null);
                      if (t && !title) setTitle(t.name);
                    }}
                    style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">Selecione um modelo...</option>
                    {(templates as any[]).filter((t: any) => t.isActive).map((t: any) => (
                      <option key={t.id} value={t.id}>{t.name} · {t.type}</option>
                    ))}
                  </select>
                  {(templates as any[]).filter((t: any) => t.isActive).length === 0 && (
                    <div style={{ fontSize: 11, color: '#D97706', marginTop: 4 }}>
                      Nenhum modelo ativo. Crie modelos em Configurações → Contratos.
                    </div>
                  )}
                </div>
              )}

              {/* Editor (mode=custom_blank) */}
              {mode === 'custom_blank' && (
                <div>
                  <label style={labelStyle}>Conteúdo</label>
                  <div style={{ border: '1px solid #E4E4E7', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', gap: 2, padding: '5px 8px', background: '#FAFAFA', borderBottom: '1px solid #F1F3F5' }}>
                      {[['ti-bold', 'bold'], ['ti-italic', 'italic'], ['ti-underline', 'underline']].map(([icon, cmd]) => (
                        <button key={cmd} onMouseDown={e => { e.preventDefault(); editorRef.current?.focus(); document.execCommand(cmd); }}
                          style={{ width: 26, height: 26, border: 'none', background: 'transparent', borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A' }}>
                          <i className={`ti ${icon}`} style={{ fontSize: 13 }} />
                        </button>
                      ))}
                    </div>
                    <div ref={editorRef} contentEditable suppressContentEditableWarning
                      style={{ padding: '12px 14px', outline: 'none', fontSize: 13, color: '#09090B', lineHeight: 1.75, fontFamily: 'inherit', minHeight: 140, overflowY: 'auto' }} />
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {ALL_VARIABLES.slice(0, 8).map(v => (
                      <button key={v} onClick={() => { editorRef.current?.focus(); document.execCommand('insertText', false, v); }}
                        style={{ fontSize: 10, padding: '2px 7px', borderRadius: 5, background: '#EFF6FF', color: '#2563EB', border: 'none', cursor: 'pointer', fontFamily: 'monospace' }}>{v}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Venda info (mode=sale_manual) */}
              {mode === 'sale_manual' && (
                <div style={{ padding: '12px 14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="ti ti-info-circle" style={{ fontSize: 14, color: '#D97706' }} />
                    <div style={{ fontSize: 12, color: '#92400E' }}>Selecione o paciente para carregar as vendas disponíveis.</div>
                  </div>
                </div>
              )}

              {/* Itens contratados */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Itens contratados</label>
                  <button onClick={addItem} style={{ height: 28, padding: '0 10px', background: 'transparent', border: '1px solid #E4E4E7', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <i className="ti ti-plus" style={{ fontSize: 11 }} /> Adicionar
                  </button>
                </div>
                {items.length === 0 ? (
                  <div style={{ padding: '14px', background: '#F9F9F9', borderRadius: 8, border: '1px dashed #D4D4D8', textAlign: 'center', fontSize: 12, color: '#A1A1AA' }}>Nenhum item adicionado</div>
                ) : items.map((item, i) => (
                  <div key={i} style={{ border: '1px solid #E4E4E7', borderRadius: 8, padding: '12px', marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input value={item.name} onChange={e => updateItem(i, 'name', e.target.value)} placeholder="Nome do item *" style={{ ...inputStyle, flex: 2 }} />
                      <button onClick={() => removeItem(i)} style={{ width: 32, height: 36, border: 'none', background: '#FEF2F2', borderRadius: 6, cursor: 'pointer', color: '#DC2626', flexShrink: 0 }}>
                        <i className="ti ti-trash" style={{ fontSize: 13 }} />
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      {[
                        { label: 'Qtd', field: 'quantity', type: 'number', min: 1 },
                        { label: 'Valor unit. (R$)', field: 'unitValue', type: 'number', step: '0.01' },
                        { label: 'Sessões', field: 'sessionsQuantity', type: 'number' },
                      ].map(({ label, field, ...rest }) => (
                        <div key={field}>
                          <div style={{ fontSize: 10, color: '#71717A', marginBottom: 3, fontWeight: 600 }}>{label}</div>
                          <input {...rest} value={item[field]} onChange={e => updateItem(i, field, parseFloat(e.target.value) || 0)} style={inputStyle} />
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, color: '#71717A', textAlign: 'right' }}>
                      Total: <strong style={{ color: '#09090B' }}>{item.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                    </div>
                  </div>
                ))}
              </div>

              {/* Valor total */}
              <div>
                <label style={labelStyle}>Valor total (R$){items.length > 0 ? ' — calculado pelos itens' : ''}</label>
                <input type="number" min="0" step="0.01"
                  value={items.length > 0 ? computedTotal.toFixed(2) : totalValue}
                  onChange={e => { if (items.length === 0) setTotalValue(e.target.value); }}
                  readOnly={items.length > 0}
                  style={{ ...inputStyle, background: items.length > 0 ? '#F9F9F9' : '#FFFFFF' }} />
              </div>

              {/* Observações */}
              <div>
                <label style={labelStyle}>Observações</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observações internas ou condições especiais..."
                  style={{ ...inputStyle, height: 68, resize: 'vertical', padding: '8px 12px' }} />
              </div>

              {/* Gerar agora toggle */}
              <div style={{ padding: '12px 14px', background: '#F9F9F9', borderRadius: 8, border: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#09090B' }}>Gerar contrato agora</div>
                  <div style={{ fontSize: 11, color: '#71717A' }}>Preenche e salva o conteúdo imediatamente</div>
                </div>
                <button onClick={() => setGenerateNow(o => !o)}
                  style={{ width: 36, height: 20, borderRadius: 99, cursor: 'pointer', background: generateNow ? '#000' : '#E4E4E7', border: 'none', position: 'relative', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 3, left: generateNow ? 19 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.18s' }} />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {step === 'form' && (
          <div style={{ flexShrink: 0, padding: '14px 24px', borderTop: '1px solid #E4E4E7', display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ height: 38, padding: '0 16px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancelar
            </button>
            <button onClick={handleSubmit} disabled={createMut.isPending}
              style={{ flex: 1, height: 38, background: createMut.isPending ? '#A1A1AA' : '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: createMut.isPending ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {createMut.isPending ? 'Salvando...' : generateNow ? 'Criar e gerar contrato' : 'Criar contrato pendente'}
            </button>
          </div>
        )}
      </div>
    </div>
    </Portal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ContratosPage() {
  const { toast } = useToast();
  const navigate  = useNavigate();
  const qc        = useQueryClient();
  const [search, setSearch]                     = useState('');
  const [statusFilter, setStatusFilter]         = useState('');
  const [detailContract, setDetailContract]     = useState<any>(null);
  const [newDrawerOpen, setNewDrawerOpen]       = useState(false);
  const [cancelConfirmContract, setCancelConfirmContract] = useState<any>(null);

  const { data: contracts = [], isLoading, refetch } = useQuery({
    queryKey: ['contracts', search, statusFilter],
    queryFn:  () => contractsApi.list({ search: search || undefined, status: statusFilter || undefined }),
  });

  const generateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => contractsApi.generate(id, data),
    onSuccess: () => { toast('Contrato gerado com sucesso.', 'success'); qc.invalidateQueries({ queryKey: ['contracts'] }); },
    onError:   () => toast('Erro ao gerar contrato.', 'error'),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => contractsApi.update(id, { status: 'cancelado' }),
    onSuccess: () => { toast('Contrato cancelado.', 'success'); qc.invalidateQueries({ queryKey: ['contracts'] }); },
  });

  const handleGenerate = (contract: any) => {
    if (!contract.contractTemplate) { toast('Nenhum modelo vinculado a este contrato.', 'error'); return; }
    const user   = (() => { try { return JSON.parse(localStorage.getItem('user')   || '{}'); } catch { return {}; } })();
    const clinic = (() => { try { return JSON.parse(localStorage.getItem('clinic') || '{}'); } catch { return {}; } })();
    const items  = (() => { try { return JSON.parse(contract.itemsSnapshot || '[]') || []; } catch { return []; } })();
    const filled = fillVariables(contract.contractTemplate.content, { patient: contract.patient, clinic, user, items, totalValue: contract.totalValue });
    generateMut.mutate({ id: contract.id, data: { contentSnapshot: filled } });
  };

  const list = contracts as any[];
  const counts = {
    a_gerar:               list.filter(c => c.status === 'a_gerar').length,
    gerado:                list.filter(c => c.status === 'gerado' || c.status === 'impresso').length,
    aguardando_assinatura: list.filter(c => c.status === 'aguardando_assinatura').length,
    assinado:              list.filter(c => c.status === 'assinado').length,
  };

  const fmt = (v: number | null | undefined) =>
    v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#FAFAFA', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ flexShrink: 0, background: '#FFFFFF', borderBottom: '1px solid #E4E4E7', padding: '18px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#09090B', letterSpacing: '-0.3px', margin: 0 }}>Contratos</h1>
          <p style={{ fontSize: 13, color: '#71717A', margin: '2px 0 0' }}>Gerencie contratos de pacientes, vendas e serviços</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate('/settings?section=contratos')}
            style={{ height: 36, padding: '0 14px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
            <i className="ti ti-settings" style={{ fontSize: 13 }} /> Modelos
          </button>
          <button onClick={() => setNewDrawerOpen(true)}
            style={{ height: 36, padding: '0 16px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
            <i className="ti ti-plus" style={{ fontSize: 13 }} /> Novo contrato
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          <KpiCard label="A gerar"            value={counts.a_gerar}               icon="ti-clock"        iconBg="#EFF6FF" iconColor="#2563EB" />
          <KpiCard label="Gerados"            value={counts.gerado}                 icon="ti-file-check"   iconBg="#F5F3FF" iconColor="#7C3AED" />
          <KpiCard label="Aguard. assinatura" value={counts.aguardando_assinatura}  icon="ti-writing"      iconBg="#FFFBEB" iconColor="#D97706" />
          <KpiCard label="Assinados"          value={counts.assinado}               icon="ti-circle-check" iconBg="#DCFCE7" iconColor="#16A34A" />
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, padding: '0 12px', height: 36, flex: 1, maxWidth: 380 }}>
            <i className="ti ti-search" style={{ fontSize: 14, color: '#A1A1AA' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por paciente ou título..."
              style={{ border: 'none', background: 'transparent', fontSize: 13, outline: 'none', width: '100%', color: '#09090B', fontFamily: 'inherit' }} />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ height: 36, padding: '0 12px', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, color: '#09090B', background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}>
            <option value="">Todos os status</option>
            {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {(search || statusFilter) && (
            <button onClick={() => { setSearch(''); setStatusFilter(''); }}
              style={{ height: 36, padding: '0 10px', border: 'none', background: 'transparent', fontSize: 12, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="ti ti-x" style={{ fontSize: 12 }} /> Limpar
            </button>
          )}
        </div>

        {/* Table / Empty */}
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', flexDirection: 'column', gap: 10 }}>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div style={{ width: 28, height: 28, border: '3px solid #E4E4E7', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <div style={{ fontSize: 13, color: '#71717A' }}>Carregando contratos...</div>
          </div>
        ) : list.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
            <div style={{ textAlign: 'center', maxWidth: 380 }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <i className="ti ti-file-description" style={{ fontSize: 28, color: '#A1A1AA' }} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#09090B', marginBottom: 6 }}>Nenhum contrato encontrado</div>
              <div style={{ fontSize: 13, color: '#71717A', lineHeight: 1.6, marginBottom: 20 }}>
                Contratos serão gerados a partir das vendas ou podem ser criados manualmente usando modelos.
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button onClick={() => setNewDrawerOpen(true)}
                  style={{ height: 36, padding: '0 16px', background: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="ti ti-plus" style={{ fontSize: 13 }} /> Novo contrato
                </button>
                <button onClick={() => navigate('/settings?section=contratos')}
                  style={{ height: 36, padding: '0 14px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Configurar modelos
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E4E4E7', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F4F4F5', borderBottom: '1px solid #E4E4E7' }}>
                  {['DATA', 'PACIENTE', 'CONTRATO', 'ORIGEM', 'VALOR', 'STATUS', 'AÇÕES'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#71717A', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((c: any) => {
                  const s = STATUS_CFG[c.status as ContractStatus] ?? STATUS_CFG.a_gerar;
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid #F4F4F5', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F9F9F9'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                      onClick={() => setDetailContract(c)}>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#71717A', whiteSpace: 'nowrap' }}>
                        {new Date(c.createdAt).toLocaleDateString('pt-BR')}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#09090B' }}>{c.patient?.name ?? '—'}</div>
                        {c.patient?.phone && <div style={{ fontSize: 11, color: '#71717A' }}>{c.patient.phone}</div>}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#09090B' }}>{c.title}</div>
                        <div style={{ fontSize: 11, color: '#71717A' }}>{c.type}</div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#71717A' }}>
                        {ORIGIN_LABEL[c.origin as ContractOrigin] ?? c.origin}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#09090B', whiteSpace: 'nowrap' }}>
                        {fmt(c.totalValue)}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>{s.label}</span>
                      </td>
                      <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          {c.status === 'a_gerar' && (
                            <button onClick={() => handleGenerate(c)} disabled={generateMut.isPending}
                              style={{ height: 28, padding: '0 10px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#2563EB', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                              Gerar
                            </button>
                          )}
                          <button onClick={() => setDetailContract(c)} title="Ver detalhes"
                            style={{ width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer', color: '#71717A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F4F4F5'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                            <i className="ti ti-eye" style={{ fontSize: 14 }} />
                          </button>
                          {c.status !== 'cancelado' && (
                            <button onClick={() => setCancelConfirmContract(c)} title="Cancelar"
                              style={{ width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#FEF2F2'}
                              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                              <i className="ti ti-x" style={{ fontSize: 14 }} />
                            </button>
                          )}
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

      {detailContract && (
        <ContractDetailPanel
          contract={detailContract}
          onClose={() => setDetailContract(null)}
          onRefresh={() => refetch()}
        />
      )}

      {newDrawerOpen && (
        <NewContractDrawer
          onClose={() => setNewDrawerOpen(false)}
          onCreated={() => { setNewDrawerOpen(false); qc.invalidateQueries({ queryKey: ['contracts'] }); }}
        />
      )}

      {cancelConfirmContract && (
        <Portal>
          <div style={{ position: 'fixed', inset: 0, zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={() => setCancelConfirmContract(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
            <div style={{ position: 'relative', background: '#FFFFFF', borderRadius: 16, padding: '24px 28px', width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.22)', fontFamily: "'Inter', system-ui, sans-serif" }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: 22, color: '#DC2626' }} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#09090B', marginBottom: 6 }}>Cancelar contrato?</div>
              <div style={{ fontSize: 13, color: '#71717A', lineHeight: 1.6, marginBottom: 22 }}>
                Tem certeza que deseja cancelar <strong style={{ color: '#09090B' }}>{cancelConfirmContract.title}</strong>? Esta ação não poderá ser desfeita.
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setCancelConfirmContract(null)}
                  style={{ height: 36, padding: '0 16px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Voltar
                </button>
                <button onClick={() => { cancelMut.mutate(cancelConfirmContract.id); setCancelConfirmContract(null); }}
                  style={{ height: 36, padding: '0 16px', background: '#DC2626', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Confirmar cancelamento
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
