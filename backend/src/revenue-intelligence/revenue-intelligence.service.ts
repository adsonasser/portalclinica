import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type OppType = 'sessoes_acabando' | 'reativacao' | 'leads_parados' | 'falta_reagendamento' | 'financeiro' | 'upsell';
export type Priority = 'alta' | 'media' | 'baixa';

export interface Opportunity {
  id: string;
  type: OppType;
  priority: Priority;
  score: number;
  title: string;
  personName: string;
  personType: 'patient' | 'lead';
  reason: string;
  estimatedValue: number;
  suggestedAction: string;
  phone?: string;
  relatedEntityId: string;
  relatedEntityType: string;
}

function toPriority(score: number): Priority {
  if (score >= 75) return 'alta';
  if (score >= 50) return 'media';
  return 'baixa';
}

const TOP_RECS: Record<string, string> = {
  sessoes_acabando: 'Priorize renovações de pacientes com sessões acabando para não perder receita recorrente.',
  reativacao: 'Reative pacientes inativos — o custo de retenção é muito menor que o de aquisição.',
  leads_parados: 'Retome leads parados com follow-up antes que esfriem completamente.',
  falta_reagendamento: 'Entre em contato com pacientes faltosos para reagendar e recuperar a agenda.',
  financeiro: 'Recupere pagamentos vencidos e parciais para melhorar o fluxo de caixa.',
  upsell: 'Apresente planos e protocolos para pacientes que compraram consultas avulsas.',
};

@Injectable()
export class RevenueIntelligenceService {
  constructor(private prisma: PrismaService) {}

  async getSummary(clinicId: string) {
    const now = new Date();
    const ago30 = new Date(now.getTime() - 30 * 86400000);
    const ago14 = new Date(now.getTime() - 14 * 86400000);
    const ago60 = new Date(now.getTime() - 60 * 86400000);

    const [
      salesWithSessions,
      allAppointments,
      staleLeads,
      missedAppointments,
      futureApptPatients,
      overdueTransactions,
      paidSalesRecent,
    ] = await Promise.all([
      // A: sessões acabando
      this.prisma.sale.findMany({
        where: { clinicId, status: { in: ['PENDING', 'PARTIAL'] } },
        include: {
          patient: { select: { id: true, name: true, phone: true } },
          sessions: { where: { sessionStatus: 'A_AGENDAR' } },
          items: { select: { name: true, unitPrice: true, quantity: true, planId: true } },
        },
      }).catch(() => []),

      // B: reativação — all appointments for grouping
      this.prisma.appointment.findMany({
        where: { clinicId },
        select: { patientId: true, startTime: true, status: true },
        orderBy: { startTime: 'desc' },
      }).catch(() => []),

      // C: leads parados
      this.prisma.lead.findMany({
        where: {
          clinicId,
          status: { notIn: ['GANHO', 'PERDIDO'] },
          updatedAt: { lt: ago14 },
        },
        select: { id: true, name: true, phone: true, value: true, status: true, updatedAt: true },
      }).catch(() => []),

      // D: faltas sem reagendamento
      this.prisma.appointment.findMany({
        where: {
          clinicId,
          status: { in: ['FALTOU', 'CANCELADO'] },
          startTime: { gte: ago60 },
        },
        include: { patient: { select: { id: true, name: true, phone: true } } },
        orderBy: { startTime: 'desc' },
      }).catch(() => []),

      // D helper: patients with future appointments
      this.prisma.appointment.findMany({
        where: { clinicId, startTime: { gt: now }, status: { notIn: ['CANCELADO', 'FALTOU'] } },
        select: { patientId: true },
      }).catch(() => []),

      // E: overdue financial
      this.prisma.financialTransaction.findMany({
        where: { clinicId, type: 'INCOME', status: 'OVERDUE' },
        include: {
          sale: { include: { patient: { select: { id: true, name: true, phone: true } } } },
        },
      }).catch(() => []),

      // F: upsell — recent paid sales
      this.prisma.sale.findMany({
        where: { clinicId, status: 'PAID' },
        include: {
          patient: { select: { id: true, name: true, phone: true } },
          sessions: { select: { id: true } },
          items: { select: { planId: true, name: true } },
        },
        take: 60,
        orderBy: { createdAt: 'desc' },
      }).catch(() => []),
    ]);

    const opportunities: Opportunity[] = [];

    // ── A: Sessões acabando ────────────────────────────────────────────────────
    for (const sale of salesWithSessions as any[]) {
      if (!sale.patient) continue;
      const remaining = sale.sessions.length;
      if (remaining === 0 || remaining > 3) continue;
      const itemName = sale.items[0]?.name ?? 'Protocolo';
      const estimatedValue = Math.max(sale.total * 0.9, 200);
      const score = Math.min(100, 40 + (3 - remaining) * 15 + Math.min(30, estimatedValue / 500));
      opportunities.push({
        id: `sessoes_acabando:${sale.id}`,
        type: 'sessoes_acabando',
        priority: toPriority(score),
        score: Math.round(score),
        title: `${remaining} sessão(ões) restante(s)`,
        personName: sale.patient.name,
        personType: 'patient',
        reason: `${remaining} sessão(ões) restante(s) — ${itemName}`,
        estimatedValue: Math.round(estimatedValue),
        suggestedAction: 'Entrar em contato antes da última sessão para renovar o protocolo.',
        phone: sale.patient.phone ?? undefined,
        relatedEntityId: sale.id,
        relatedEntityType: 'sale',
      });
    }

    // ── B: Reativação ─────────────────────────────────────────────────────────
    const latestApptByPatient = new Map<string, Date>();
    const futureApptSet = new Set<string>();
    for (const a of allAppointments as any[]) {
      if (a.startTime > now) { futureApptSet.add(a.patientId); continue; }
      const prev = latestApptByPatient.get(a.patientId);
      if (!prev || a.startTime > prev) latestApptByPatient.set(a.patientId, a.startTime);
    }
    const reactivationIds: string[] = [];
    latestApptByPatient.forEach((lastDate, patientId) => {
      if (!futureApptSet.has(patientId) && lastDate < ago30) reactivationIds.push(patientId);
    });
    const reactivationPatients = reactivationIds.length > 0
      ? await this.prisma.patient.findMany({
          where: { id: { in: reactivationIds.slice(0, 30) }, clinicId },
          select: { id: true, name: true, phone: true },
        }).catch(() => [])
      : [];
    for (const p of reactivationPatients as any[]) {
      const lastDate = latestApptByPatient.get(p.id)!;
      const daysSince = Math.floor((now.getTime() - lastDate.getTime()) / 86400000);
      const score = Math.min(100, 20 + Math.min(60, daysSince - 30));
      opportunities.push({
        id: `reativacao:${p.id}`,
        type: 'reativacao',
        priority: toPriority(score),
        score: Math.round(score),
        title: 'Paciente sem retorno',
        personName: p.name,
        personType: 'patient',
        reason: `Sem agendamento há ${daysSince} dias`,
        estimatedValue: 200,
        suggestedAction: 'Enviar mensagem de retorno personalizada para reativar o paciente.',
        phone: p.phone ?? undefined,
        relatedEntityId: p.id,
        relatedEntityType: 'patient',
      });
    }

    // ── C: Leads parados ──────────────────────────────────────────────────────
    for (const lead of staleLeads as any[]) {
      const days = Math.floor((now.getTime() - lead.updatedAt.getTime()) / 86400000);
      const val = lead.value || 500;
      const score = Math.min(100, 30 + Math.min(50, val / 100));
      opportunities.push({
        id: `leads_parados:${lead.id}`,
        type: 'leads_parados',
        priority: toPriority(score),
        score: Math.round(score),
        title: 'Lead parado',
        personName: lead.name,
        personType: 'lead',
        reason: `Lead sem atividade há ${days} dias — etapa ${lead.status}`,
        estimatedValue: Math.round(val),
        suggestedAction: 'Fazer follow-up ou agendar avaliação antes que o lead esfrie.',
        phone: lead.phone ?? undefined,
        relatedEntityId: lead.id,
        relatedEntityType: 'lead',
      });
    }

    // ── D: Faltas sem reagendamento ───────────────────────────────────────────
    const futureSet = new Set(
      (futureApptPatients as any[]).map((a: any) => a.patientId),
    );
    const seenMissed = new Set<string>();
    for (const appt of missedAppointments as any[]) {
      if (!appt.patient) continue;
      if (futureSet.has(appt.patientId)) continue;
      if (seenMissed.has(appt.patientId)) continue;
      seenMissed.add(appt.patientId);
      const dateStr = new Date(appt.startTime).toLocaleDateString('pt-BR');
      opportunities.push({
        id: `falta_reagendamento:${appt.id}`,
        type: 'falta_reagendamento',
        priority: 'media',
        score: 55,
        title: 'Falta sem reagendamento',
        personName: appt.patient.name,
        personType: 'patient',
        reason: `${appt.status === 'FALTOU' ? 'Faltou' : 'Cancelou'} em ${dateStr} sem reagendamento`,
        estimatedValue: 150,
        suggestedAction: 'Entrar em contato para reagendar e manter o vínculo com o paciente.',
        phone: appt.patient.phone ?? undefined,
        relatedEntityId: appt.id,
        relatedEntityType: 'appointment',
      });
    }

    // ── E: Financeiro recuperável ─────────────────────────────────────────────
    for (const tx of overdueTransactions as any[]) {
      const patientName = tx.sale?.patient?.name ?? 'Paciente';
      const score = Math.min(100, 50 + Math.min(40, tx.amount / 200));
      opportunities.push({
        id: `financeiro:${tx.id}`,
        type: 'financeiro',
        priority: toPriority(score),
        score: Math.round(score),
        title: 'Pagamento vencido',
        personName: patientName,
        personType: 'patient',
        reason: `Pagamento vencido de R$ ${tx.amount.toFixed(0)}`,
        estimatedValue: Math.round(tx.amount),
        suggestedAction: 'Enviar cobrança ou registrar recebimento para regularizar.',
        phone: tx.sale?.patient?.phone ?? undefined,
        relatedEntityId: tx.id,
        relatedEntityType: 'transaction',
      });
    }

    // ── F: Upsell ─────────────────────────────────────────────────────────────
    const seenUpsell = new Set<string>();
    for (const sale of paidSalesRecent as any[]) {
      if (!sale.patient) continue;
      if (seenUpsell.has(sale.patientId)) continue;
      const hasSessions = sale.sessions.length > 0;
      const hasPlan = sale.items.some((i: any) => i.planId);
      if (hasSessions || hasPlan) continue;
      seenUpsell.add(sale.patientId);
      opportunities.push({
        id: `upsell:${sale.id}`,
        type: 'upsell',
        priority: 'baixa',
        score: 45,
        title: 'Oportunidade de upsell',
        personName: sale.patient.name,
        personType: 'patient',
        reason: `Comprou consulta avulsa — pode se beneficiar de um plano`,
        estimatedValue: 800,
        suggestedAction: 'Apresentar plano de tratamento ou protocolo para aumentar LTV.',
        phone: sale.patient.phone ?? undefined,
        relatedEntityId: sale.id,
        relatedEntityType: 'sale',
      });
    }

    // ── Sort by score ─────────────────────────────────────────────────────────
    opportunities.sort((a, b) => b.score - a.score);

    // ── Cards summary ─────────────────────────────────────────────────────────
    const sessoesAcabando = (salesWithSessions as any[]).filter(
      s => s.patient && s.sessions.length > 0 && s.sessions.length <= 3,
    ).length;
    const pacientesSemRetorno = reactivationIds.length;
    const leadsParados = (staleLeads as any[]).length;
    const faltasSemReagendamento = seenMissed.size;
    const financeiroRecuperavel = (overdueTransactions as any[]).length;
    const potentialTotal = opportunities.reduce((s, o) => s + o.estimatedValue, 0);

    // ── AI Insight ────────────────────────────────────────────────────────────
    const valueByType: Record<string, number> = {};
    for (const o of opportunities) {
      valueByType[o.type] = (valueByType[o.type] || 0) + o.estimatedValue;
    }
    const topCategory = Object.entries(valueByType).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'reativacao';

    return {
      aiInsight: {
        estimatedTotal: potentialTotal,
        topRecommendation: TOP_RECS[topCategory] ?? 'Analise as oportunidades abaixo e priorize as de maior score.',
        topCategory,
      },
      cards: {
        potentialTotal,
        sessoesAcabando,
        pacientesSemRetorno,
        leadsParados,
        faltasSemReagendamento,
        financeiroRecuperavel,
      },
      opportunities,
    };
  }
}
