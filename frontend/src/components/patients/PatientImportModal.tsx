import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { patientsApi } from '../../services/api';

interface Props {
  onClose: () => void;
}

// Maps CSV column headers (lowercase, trimmed) to patient fields
const COLUMN_MAP: Record<string, string> = {
  nome: 'name', name: 'name',
  email: 'email',
  telefone: 'phone', celular: 'phone', whatsapp: 'phone', phone: 'phone', fone: 'phone',
  cpf: 'cpf',
  'data nascimento': 'birthDate', 'data_nascimento': 'birthDate', nascimento: 'birthDate',
  'dt nascimento': 'birthDate', 'dt_nascimento': 'birthDate', birthdate: 'birthDate',
  sexo: 'gender', genero: 'gender', género: 'gender', gender: 'gender',
  cidade: 'city', city: 'city',
  estado: 'state', uf: 'state', state: 'state',
  endereco: 'address', endereço: 'address', address: 'address', logradouro: 'address',
  cep: 'zipCode', zipcode: 'zipCode', 'zip code': 'zipCode',
  observacoes: 'notes', observações: 'notes', obs: 'notes', notes: 'notes',
  instagram: 'instagram',
  'como conheceu': 'comoConheceu', como_conheceu: 'comoConheceu', origem: 'comoConheceu',
  responsavel: 'responsible', responsável: 'responsible', responsible: 'responsible',
};

const FIELD_LABELS: Record<string, string> = {
  name: 'Nome', email: 'E-mail', phone: 'Telefone', cpf: 'CPF',
  birthDate: 'Nascimento', gender: 'Sexo', city: 'Cidade', state: 'UF',
  address: 'Endereço', zipCode: 'CEP', notes: 'Observações',
  instagram: 'Instagram', comoConheceu: 'Como conheceu', responsible: 'Responsável',
};

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };

  const sep = lines[0].includes(';') ? ';' : ',';

  const parseRow = (line: string) => {
    const result: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === sep && !inQuote) { result.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).filter(l => l.trim()).map(parseRow);
  return { headers, rows };
}

export function PatientImportModal({ onClose }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const importMut = useMutation({
    mutationFn: (patients: any[]) => patientsApi.import(patients),
    onSuccess: (data) => {
      setResult(data);
      setStep('done');
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.invalidateQueries({ queryKey: ['patients-stats'] });
    },
  });

  function processFile(file: File) {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      alert('Selecione um arquivo .csv');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers: h, rows: r } = parseCSV(text);
      if (!h.length) { alert('CSV inválido ou vazio'); return; }
      setHeaders(h);
      setRawRows(r);
      // Auto-map
      const autoMap: Record<string, string> = {};
      h.forEach(col => {
        const key = col.toLowerCase().trim();
        if (COLUMN_MAP[key]) autoMap[col] = COLUMN_MAP[key];
      });
      setMapping(autoMap);
      setStep('preview');
    };
    reader.readAsText(file, 'UTF-8');
  }

  function buildPatients() {
    return rawRows.map(row => {
      const patient: Record<string, string> = {};
      headers.forEach((col, i) => {
        if (mapping[col]) patient[mapping[col]] = row[i] ?? '';
      });
      return patient;
    }).filter(p => p.name?.trim());
  }

  const patients = step === 'preview' ? buildPatients() : [];

  const inp: React.CSSProperties = {
    height: 32, padding: '0 8px', border: '1px solid #E4E4E7', borderRadius: 6,
    fontSize: 12, color: '#09090B', background: '#FFFFFF', cursor: 'pointer', outline: 'none',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}>
      <div style={{ background: '#FFFFFF', borderRadius: 16, width: '100%', maxWidth: 780, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,.15)', fontFamily: "'Inter',system-ui,sans-serif" }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#09090B' }}>Importar pacientes via CSV</div>
            <div style={{ fontSize: 12, color: '#71717A', marginTop: 2 }}>
              {step === 'upload' && 'Selecione um arquivo .csv para começar'}
              {step === 'preview' && `${patients.length} paciente(s) encontrado(s) — revise antes de importar`}
              {step === 'done' && 'Importação concluída'}
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#71717A', padding: 4 }}>
            <i className="ti ti-x" style={{ fontSize: 18 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

          {/* ── Step 1: Upload ── */}
          {step === 'upload' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
                onClick={() => fileRef.current?.click()}
                style={{ border: `2px dashed ${dragOver ? '#000' : '#D4D4D8'}`, borderRadius: 12, padding: '48px 24px', textAlign: 'center', cursor: 'pointer', background: dragOver ? '#F4F4F5' : '#FAFAFA', transition: 'all .15s' }}>
                <i className="ti ti-file-text" style={{ fontSize: 36, color: '#A1A1AA', display: 'block', marginBottom: 12 }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: '#09090B', marginBottom: 4 }}>Arraste o arquivo CSV ou clique para selecionar</div>
                <div style={{ fontSize: 12, color: '#71717A' }}>Suporta separadores vírgula (,) e ponto-e-vírgula (;) · UTF-8</div>
                <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
              </div>

              {/* Template */}
              <div style={{ background: '#F4F4F5', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#09090B', marginBottom: 6 }}>Colunas reconhecidas automaticamente</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.values(FIELD_LABELS).map(label => (
                    <span key={label} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#E4E4E7', color: '#52525B' }}>{label}</span>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: '#71717A', marginTop: 10 }}>
                  Exemplo de cabeçalho: <code style={{ background: '#E4E4E7', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>nome,email,telefone,cpf,data_nascimento,sexo,cidade,estado</code>
                </div>
                <button
                  onClick={() => {
                    const csv = 'nome,email,telefone,cpf,data_nascimento,sexo,cidade,estado\nMaria Silva,maria@email.com,(62) 99999-0000,000.000.000-00,1990-05-15,Feminino,Goiânia,GO\n';
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = 'modelo_pacientes.csv'; a.click();
                    URL.revokeObjectURL(url);
                  }}
                  style={{ marginTop: 10, height: 30, padding: '0 12px', border: '1px solid #D4D4D8', background: '#FFFFFF', borderRadius: 6, fontSize: 12, fontWeight: 500, color: '#18181B', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}>
                  <i className="ti ti-download" style={{ fontSize: 12 }} /> Baixar modelo
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Preview + mapping ── */}
          {step === 'preview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Column mapping */}
              <div style={{ background: '#F4F4F5', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#09090B', marginBottom: 10 }}>Mapeamento de colunas</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                  {headers.map(col => (
                    <div key={col} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ fontSize: 11, color: '#71717A', fontWeight: 500 }}>{col}</div>
                      <select value={mapping[col] ?? ''} onChange={e => setMapping(m => ({ ...m, [col]: e.target.value }))} style={inp}>
                        <option value="">— ignorar —</option>
                        {Object.entries(FIELD_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview table */}
              <div style={{ border: '1px solid #E4E4E7', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid #E4E4E7', fontSize: 12, fontWeight: 600, color: '#09090B' }}>
                  Prévia — primeiros {Math.min(5, patients.length)} de {patients.length}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#F4F4F5' }}>
                        {Object.values(mapping).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).map(field => (
                          <th key={field} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#71717A', textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>
                            {FIELD_LABELS[field] ?? field}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {patients.slice(0, 5).map((p, i) => (
                        <tr key={i} style={{ borderTop: '1px solid #F4F4F5' }}>
                          {Object.values(mapping).filter(Boolean).filter((v, idx, a) => a.indexOf(v) === idx).map(field => (
                            <td key={field} style={{ padding: '8px 12px', fontSize: 12, color: '#18181B', whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {p[field] || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {patients.length === 0 && (
                <div style={{ textAlign: 'center', padding: 24, color: '#71717A', fontSize: 13 }}>
                  Nenhum paciente válido encontrado. Verifique se a coluna "Nome" está mapeada corretamente.
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Done ── */}
          {step === 'done' && result && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <i className="ti ti-check" style={{ fontSize: 28, color: '#16A34A' }} />
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#09090B', marginBottom: 6 }}>Importação concluída!</div>
              <div style={{ fontSize: 14, color: '#71717A', marginBottom: 24 }}>Os pacientes já estão disponíveis no sistema.</div>
              <div style={{ display: 'inline-flex', gap: 24, background: '#F4F4F5', borderRadius: 12, padding: '16px 28px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#16A34A' }}>{result.imported}</div>
                  <div style={{ fontSize: 12, color: '#71717A', marginTop: 2 }}>importados</div>
                </div>
                <div style={{ width: 1, background: '#E4E4E7' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#71717A' }}>{result.skipped}</div>
                  <div style={{ fontSize: 12, color: '#71717A', marginTop: 2 }}>ignorados / duplicados</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #E4E4E7', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          {step === 'upload' && (
            <button onClick={onClose} style={{ height: 36, padding: '0 16px', border: '1px solid #E4E4E7', background: '#FFFFFF', borderRadius: 8, fontSize: 13, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
          )}
          {step === 'preview' && (
            <>
              <button onClick={() => { setStep('upload'); setHeaders([]); setRawRows([]); }} style={{ height: 36, padding: '0 16px', border: '1px solid #E4E4E7', background: '#FFFFFF', borderRadius: 8, fontSize: 13, color: '#71717A', cursor: 'pointer', fontFamily: 'inherit' }}>Voltar</button>
              <button
                onClick={() => importMut.mutate(buildPatients())}
                disabled={importMut.isPending || patients.length === 0}
                style={{ height: 36, padding: '0 20px', background: '#000000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#FFFFFF', cursor: patients.length === 0 ? 'not-allowed' : 'pointer', opacity: patients.length === 0 ? .5 : 1, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
                {importMut.isPending
                  ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .75s linear infinite' }} /> Importando...</>
                  : <><i className="ti ti-upload" style={{ fontSize: 14 }} /> Importar {patients.length} paciente(s)</>
                }
              </button>
            </>
          )}
          {step === 'done' && (
            <button onClick={onClose} style={{ height: 36, padding: '0 20px', background: '#000000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}>Fechar</button>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
