export interface ScoreBreakdown {
  valorConsumido: number;
  recorrencia: number;
  pagamentoEmDia: number;
  comparecimento: number;
  engajamento: number;
  relacionamento: number;
  penalizacoes: number;
}

export interface ScoreResult {
  score: number;
  label: string;
  level: 'low' | 'regular' | 'high' | 'strategic';
  scoreColor: string;
  scoreBg: string;
  breakdown: ScoreBreakdown;
}

export function calcPatientScore(patient: any): ScoreResult {
  const sales    = patient.sales    ?? [];
  const appts    = patient.appointments ?? [];
  const sessions = patient.sessions ?? [];
  const vendas   = sales.filter((s: any) => s.saleType === 'VENDA');

  // 1. Valor consumido (0–35)
  const totalPaid = sales.reduce((s: number, v: any) => s + (v.paidAmount ?? 0), 0);
  const valorConsumido =
    totalPaid >= 10000 ? 35 : totalPaid >= 6000 ? 28 :
    totalPaid >=  3000 ? 20 : totalPaid >= 1000 ? 12 :
    totalPaid >      0 ?  5 : 0;

  // 2. Recorrência (0–20)
  const planNames = vendas.map((v: any) => v.items?.[0]?.plan?.name || v.items?.[0]?.name || '').filter(Boolean);
  const hasRenewal = new Set(planNames).size < planNames.length;
  const recorrencia =
    hasRenewal || vendas.length >= 3 ? 20 :
    vendas.length === 2 ? 10 : vendas.length === 1 ? 5 : 0;

  // 3. Pagamento em dia (0–15)
  const paidCount    = sales.filter((s: any) => s.status === 'PAID').length;
  const pendingCount = sales.filter((s: any) => s.status === 'PENDING' || s.status === 'PARTIAL').length;
  const pagamentoEmDia =
    sales.length === 0                  ?  5 :
    pendingCount === 0 && paidCount > 0 ? 15 :
    paidCount > pendingCount            ? 10 : 5;

  // 4. Comparecimento (0–15)
  const faltou   = appts.filter((a: any) => a.status === 'FALTOU').length;
  const cancelou = appts.filter((a: any) => a.status === 'CANCELADO').length;
  const comparecimento =
    appts.length === 0             ?  0 :
    faltou === 0 && cancelou === 0 ? 15 :
    faltou <= 1  && cancelou <= 1  ? 12 :
    faltou <= 2  || cancelou <= 2  ?  8 :
    Math.max(0, 5 - faltou);

  // 5. Engajamento (0–10)
  const doneSess  = sessions.filter((s: any) => s.sessionStatus === 'REALIZADA').length;
  const totalSess = sessions.length;
  const engajamento =
    totalSess === 0 && sales.length === 0 ?  0 :
    totalSess === 0                        ?  3 :
    doneSess === totalSess                 ? 10 :
    doneSess > 0                           ?  7 : 3;

  // 6. Relacionamento (0–5)
  const relacionamento = patient.alertaInterno ? 2 : 5;

  // Penalizações
  const reagendou      = appts.filter((a: any) => a.status === 'REAGENDADO').length;
  const cancelledSales = sales.filter((s: any) => s.status === 'CANCELLED').length;
  const hasOverdue     = sales.some((s: any) =>
    (s.status === 'PENDING' || s.status === 'PARTIAL') && (s.total ?? 0) > (s.paidAmount ?? 0));
  let penalizacoes = 0;
  penalizacoes -= faltou * 5;
  penalizacoes -= cancelou * 3;
  penalizacoes -= reagendou * 2;
  if (hasOverdue) penalizacoes -= 8;
  penalizacoes -= cancelledSales * 10;

  const raw   = valorConsumido + recorrencia + pagamentoEmDia + comparecimento + engajamento + relacionamento + penalizacoes;
  const score = Math.max(0, Math.min(100, raw));

  const label      = score >= 85 ? 'Paciente estratégico' : score >= 70 ? 'Alto valor' : score >= 40 ? 'Regular' : 'Baixo';
  const level      = (score >= 85 ? 'strategic' : score >= 70 ? 'high' : score >= 40 ? 'regular' : 'low') as ScoreResult['level'];
  const scoreColor = score >= 85 ? '#16A34A' : score >= 70 ? '#2563EB' : score >= 40 ? '#D97706' : '#DC2626';
  const scoreBg    = score >= 85 ? '#DCFCE7' : score >= 70 ? '#EFF6FF' : score >= 40 ? '#FFFBEB' : '#FEF2F2';

  return {
    score, label, level, scoreColor, scoreBg,
    breakdown: { valorConsumido, recorrencia, pagamentoEmDia, comparecimento, engajamento, relacionamento, penalizacoes },
  };
}

export function scoreBadge(score: number) {
  const color = score >= 85 ? '#16A34A' : score >= 70 ? '#2563EB' : score >= 40 ? '#D97706' : '#DC2626';
  const bg    = score >= 85 ? '#DCFCE7' : score >= 70 ? '#EFF6FF' : score >= 40 ? '#FFFBEB' : '#FEF2F2';
  const label = score >= 85 ? 'Estratégico' : score >= 70 ? 'Alto valor' : score >= 40 ? 'Regular' : 'Baixo';
  return { color, bg, label };
}
