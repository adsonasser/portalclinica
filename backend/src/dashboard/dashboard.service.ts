import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats(clinicId: string) {
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

    const [
      totalPacientes,
      novosPatients,
      agendamentosHoje,
      agendamentosMes,
      receitaMes,
      despesaMes,
      leadsAtivos,
      tasksPendentes,
    ] = await Promise.all([
      this.prisma.patient.count({ where: { clinicId } }),
      this.prisma.patient.count({ where: { clinicId, createdAt: { gte: startMonth } } }),
      this.prisma.appointment.count({ where: { clinicId, startTime: { gte: todayStart, lte: todayEnd } } }),
      this.prisma.appointment.count({ where: { clinicId, startTime: { gte: startMonth } } }),
      this.prisma.financialTransaction.aggregate({ where: { clinicId, type: 'INCOME', status: 'PAID', paidAt: { gte: startMonth } }, _sum: { amount: true } }),
      this.prisma.financialTransaction.aggregate({ where: { clinicId, type: 'EXPENSE', status: 'PAID', paidAt: { gte: startMonth } }, _sum: { amount: true } }),
      this.prisma.lead.count({ where: { clinicId, status: { notIn: ['GANHO', 'PERDIDO'] } } }),
      this.prisma.task.count({ where: { clinicId, status: 'PENDENTE' } }),
    ]);

    // Próximos agendamentos
    const proximosAgendamentos = await this.prisma.appointment.findMany({
      where: { clinicId, startTime: { gte: now }, status: { notIn: ['CANCELADO', 'FALTOU'] } },
      include: {
        patient: { select: { id: true, name: true, avatarUrl: true } },
        plan: { select: { id: true, name: true, color: true } },
        professional: { include: { user: { select: { id: true, name: true } } } },
      },
      orderBy: { startTime: 'asc' },
      take: 5,
    });

    return {
      kpis: {
        totalPacientes,
        novosPatients,
        agendamentosHoje,
        agendamentosMes,
        receitaMes: receitaMes._sum.amount || 0,
        despesaMes: despesaMes._sum.amount || 0,
        saldoMes: (receitaMes._sum.amount || 0) - (despesaMes._sum.amount || 0),
        leadsAtivos,
        tasksPendentes,
      },
      proximosAgendamentos,
    };
  }

  private getPeriodRange(period = 'mes_atual') {
    const now = new Date();
    let start: Date, end: Date, prevStart: Date, prevEnd: Date, label: string;
    switch (period) {
      case 'mes_anterior': {
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        prevStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999);
        label = start.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        break;
      }
      case 'ultimos_7': {
        end = new Date(now); end.setHours(23, 59, 59, 999);
        start = new Date(now); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
        prevEnd = new Date(start.getTime() - 1);
        prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - 6); prevStart.setHours(0, 0, 0, 0);
        label = 'Últimos 7 dias';
        break;
      }
      case 'ultimos_30': {
        end = new Date(now); end.setHours(23, 59, 59, 999);
        start = new Date(now); start.setDate(start.getDate() - 29); start.setHours(0, 0, 0, 0);
        prevEnd = new Date(start.getTime() - 1);
        prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - 29); prevStart.setHours(0, 0, 0, 0);
        label = 'Últimos 30 dias';
        break;
      }
      case 'ultimos_90': {
        end = new Date(now); end.setHours(23, 59, 59, 999);
        start = new Date(now); start.setDate(start.getDate() - 89); start.setHours(0, 0, 0, 0);
        prevEnd = new Date(start.getTime() - 1);
        prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - 89); prevStart.setHours(0, 0, 0, 0);
        label = 'Últimos 90 dias';
        break;
      }
      case 'ano_atual': {
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        prevStart = new Date(now.getFullYear() - 1, 0, 1);
        prevEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
        label = `Ano ${now.getFullYear()}`;
        break;
      }
      default: { // mes_atual
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        label = now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
      }
    }
    return { start, end, prevStart, prevEnd, label };
  }

  async getDashboard360(clinicId: string, period = 'mes_atual', professionalId?: string) {
    const now = new Date();
    const { start, end, prevStart, prevEnd, label } = this.getPeriodRange(period);
    const profFilter = professionalId ? { professionalId } : {};

    const [
      fatAtual, fatPrev,
      recebidoAtual,
      aReceber,
      despesasPagas,
      despesasPrevistas,
      salesCountAtual, salesCountPrev,
      novosAtual, novosPrev,
      leadsGanhos, leadsTrabalhados,
      // alert
      pacientesAtivosCount,
      leadsAbertosCount,
      leadsSemRetornoCount,
      sessoesPendentesCount,
      apptRealizadas, apptFaltou, apptCancelado,
      inadimAgg, inadimCount,
      products,
      // analytics
      leadsByStatus,
      leadsGanhosTotal, leadsGanhosPrev,
      leadsPerdidasTotal,
      apptByProf,
      sessionsByProf,
      profissionais,
      pacientesAtivo, pacientesInativo, pacientesSemRetorno,
    ] = await Promise.all([
      // Faturamento
      this.prisma.sale.aggregate({ where: { clinicId, status: { not: 'CANCELLED' }, createdAt: { gte: start, lte: end } }, _sum: { total: true } }),
      this.prisma.sale.aggregate({ where: { clinicId, status: { not: 'CANCELLED' }, createdAt: { gte: prevStart, lte: prevEnd } }, _sum: { total: true } }),
      // Recebido
      this.prisma.financialTransaction.aggregate({ where: { clinicId, type: 'INCOME', status: 'PAID', paidAt: { gte: start, lte: end } }, _sum: { amount: true } }),
      // A receber (all pending)
      this.prisma.financialTransaction.aggregate({ where: { clinicId, type: 'INCOME', status: 'PENDING' }, _sum: { amount: true } }),
      // Despesas pagas
      this.prisma.financialTransaction.aggregate({ where: { clinicId, type: 'EXPENSE', status: 'PAID', paidAt: { gte: start, lte: end } }, _sum: { amount: true } }),
      // Despesas previstas (pending)
      this.prisma.financialTransaction.aggregate({ where: { clinicId, type: 'EXPENSE', status: 'PENDING' }, _sum: { amount: true } }),
      // Ticket médio — sales count
      this.prisma.sale.count({ where: { clinicId, status: { not: 'CANCELLED' }, createdAt: { gte: start, lte: end } } }),
      this.prisma.sale.count({ where: { clinicId, status: { not: 'CANCELLED' }, createdAt: { gte: prevStart, lte: prevEnd } } }),
      // Novos pacientes
      this.prisma.patient.count({ where: { clinicId, createdAt: { gte: start, lte: end } } }),
      this.prisma.patient.count({ where: { clinicId, createdAt: { gte: prevStart, lte: prevEnd } } }),
      // Conversão: ganhos no período
      this.prisma.lead.count({ where: { clinicId, status: 'GANHO', wonAt: { gte: start, lte: end } } }),
      // Leads trabalhados: criados no período
      this.prisma.lead.count({ where: { clinicId, createdAt: { gte: start, lte: end } } }),
      // Alertas
      this.prisma.patient.count({ where: { clinicId, status: { in: ['ATIVO', 'EM_TRATAMENTO', 'NOVO'] } } }),
      this.prisma.lead.count({ where: { clinicId, status: { notIn: ['GANHO', 'PERDIDO'] } } }),
      this.prisma.lead.count({ where: { clinicId, status: { notIn: ['GANHO', 'PERDIDO'] }, nextActivityAt: { lt: now } } }),
      this.prisma.session.count({ where: { clinicId, sessionStatus: 'A_AGENDAR' } }),
      this.prisma.appointment.count({ where: { clinicId, ...profFilter, status: { in: ['CONFIRMADO', 'RETORNO', 'AVALIACAO', 'ENCAIXE', 'ATENCAO'] }, startTime: { gte: start, lte: end } } }),
      this.prisma.appointment.count({ where: { clinicId, ...profFilter, status: 'FALTOU', startTime: { gte: start, lte: end } } }),
      this.prisma.appointment.count({ where: { clinicId, ...profFilter, status: 'CANCELADO', startTime: { gte: start, lte: end } } }),
      this.prisma.financialTransaction.aggregate({ where: { clinicId, type: 'INCOME', status: 'OVERDUE' }, _sum: { amount: true } }),
      this.prisma.financialTransaction.count({ where: { clinicId, type: 'INCOME', status: 'OVERDUE' } }),
      this.prisma.product.findMany({ where: { clinicId, active: true }, select: { stock: true, minStock: true } }),
      // Funil
      this.prisma.lead.groupBy({ by: ['status'], where: { clinicId, status: { notIn: ['GANHO', 'PERDIDO'] } }, _count: { id: true }, _sum: { value: true } }),
      this.prisma.lead.count({ where: { clinicId, status: 'GANHO' } }),
      this.prisma.lead.count({ where: { clinicId, status: 'GANHO', wonAt: { gte: prevStart, lte: prevEnd } } }),
      this.prisma.lead.count({ where: { clinicId, status: 'PERDIDO' } }),
      // Produção
      this.prisma.appointment.groupBy({ by: ['professionalId'], where: { clinicId, ...profFilter, status: { notIn: ['CANCELADO', 'FALTOU'] }, startTime: { gte: start, lte: end } }, _count: { id: true } }),
      this.prisma.session.groupBy({ by: ['professionalId'], where: { clinicId, ...profFilter, attended: true, date: { gte: start, lte: end } }, _count: { id: true } }),
      this.prisma.professional.findMany({ where: { clinicId, active: true }, include: { user: { select: { id: true, name: true } } } }),
      // Pacientes retenção
      this.prisma.patient.count({ where: { clinicId, status: { in: ['ATIVO', 'EM_TRATAMENTO'] } } }),
      this.prisma.patient.count({ where: { clinicId, status: 'INATIVO' } }),
      this.prisma.patient.count({ where: { clinicId, status: 'SEM_RETORNO' } }),
    ]);

    // Compute derived values
    const totalFat = fatAtual._sum.total || 0;
    const prevFat = fatPrev._sum.total || 0;
    const fatChange = prevFat > 0 ? ((totalFat - prevFat) / prevFat) * 100 : 0;

    const recebido = recebidoAtual._sum.amount || 0;
    const aReceberVal = aReceber._sum.amount || 0;
    const percentRecebido = (recebido + aReceberVal) > 0 ? Math.round((recebido / (recebido + aReceberVal)) * 100) : 0;

    const ticketAtual = salesCountAtual > 0 ? totalFat / salesCountAtual : 0;
    const ticketPrevVal = salesCountPrev > 0 ? (prevFat / salesCountPrev) : 0;
    const ticketChange = ticketPrevVal > 0 ? ((ticketAtual - ticketPrevVal) / ticketPrevVal) * 100 : 0;

    const novosChange = novosPrev > 0 ? ((novosAtual - novosPrev) / novosPrev) * 100 : 0;

    const totalLeads = leadsGanhos + leadsTrabalhados;
    const convPerc = totalLeads > 0 ? Math.round((leadsGanhos / totalLeads) * 100) : 0;

    const despPagas = despesasPagas._sum.amount || 0;
    const resultado = recebido - despPagas;

    const totalRealizadas = apptRealizadas + apptFaltou + apptCancelado;
    const taxaComp = totalRealizadas > 0 ? Math.round((apptRealizadas / totalRealizadas) * 100) : 0;

    const inadimValor = inadimAgg._sum.amount || 0;

    const estoqueCritico = products.filter(p => p.minStock > 0 && p.stock <= p.minStock).length;

    // Funil etapas
    const statusOrder = ['NOVO', 'CONTATADO', 'QUALIFICADO', 'PROPOSTA', 'NEGOCIACAO'];
    const etapas = statusOrder.map(s => {
      const found = leadsByStatus.find(l => l.status === s);
      return { status: s, count: found?._count?.id || 0, value: found?._sum?.value || 0 };
    });
    const totalLeadsAll = leadsGanhosTotal + leadsPerdidasTotal + etapas.reduce((a, e) => a + e.count, 0);
    const taxaConversaoFunil = totalLeadsAll > 0 ? Math.round((leadsGanhosTotal / totalLeadsAll) * 100) : 0;

    // Produção por profissional
    const profMap = new Map(profissionais.map(p => [p.id, p.user.name]));
    const consultasByProf = new Map(apptByProf.map(a => [a.professionalId, a._count.id]));
    const sessoesByProf = new Map(sessionsByProf.map(s => [s.professionalId, s._count.id]));
    const allProfIds = new Set([...consultasByProf.keys(), ...sessoesByProf.keys()]);
    const porProfissional = Array.from(allProfIds)
      .map(id => ({ name: profMap.get(id || '') || 'Sem profissional', consultas: consultasByProf.get(id) || 0, sessoes: sessoesByProf.get(id) || 0 }))
      .sort((a, b) => (b.consultas + b.sessoes) - (a.consultas + a.sessoes))
      .slice(0, 8);

    // Alertas inteligentes
    const alertas: Array<{ type: 'warning' | 'danger' | 'info'; category: string; message: string; count: number }> = [];
    if (leadsSemRetornoCount > 0) alertas.push({ type: 'warning', category: 'CRM', message: 'Leads aguardando retorno', count: leadsSemRetornoCount });
    if (sessoesPendentesCount > 0) alertas.push({ type: 'warning', category: 'Sessões', message: 'Sessões vendidas e não agendadas', count: sessoesPendentesCount });
    if (inadimValor > 0) alertas.push({ type: 'danger', category: 'Financeiro', message: 'Receitas vencidas e não recebidas', count: inadimCount });
    if (estoqueCritico > 0) alertas.push({ type: 'danger', category: 'Estoque', message: 'Itens abaixo do estoque mínimo', count: estoqueCritico });
    if (taxaComp < 70 && totalRealizadas > 5) alertas.push({ type: 'warning', category: 'Agenda', message: 'Taxa de comparecimento abaixo de 70%', count: apptFaltou + apptCancelado });

    return {
      period: { label, start: start.toISOString(), end: end.toISOString() },
      faturamento: { total: totalFat, prevPeriod: prevFat, change: fatChange },
      recebido: { recebido, aReceber: aReceberVal, percentRecebido },
      ticketMedio: { value: ticketAtual, prevPeriod: ticketPrevVal, change: ticketChange },
      novosPacientes: { total: novosAtual, prevPeriod: novosPrev, change: novosChange },
      conversaoLeads: { percentual: convPerc, ganhos: leadsGanhos, trabalhados: totalLeads },
      resultadoOperacional: { valor: resultado, receita: recebido, despesas: despPagas },
      pacientesAtivos: { total: pacientesAtivosCount },
      leadsAbertos: { total: leadsAbertosCount, semRetorno: leadsSemRetornoCount },
      sessoesPendentes: { total: sessoesPendentesCount },
      taxaComparecimento: { realizadas: apptRealizadas, faltas: apptFaltou, cancelamentos: apptCancelado, percentual: taxaComp },
      inadimplencia: { valorVencido: inadimValor, qtdRegistros: inadimCount },
      estoqueCritico: { total: estoqueCritico },
      funil: { etapas, ganhos: leadsGanhosTotal, perdidos: leadsPerdidasTotal, taxaConversao: taxaConversaoFunil },
      financeiro: { receitaRecebida: recebido, receitaAReceber: aReceberVal, despesasPagas: despPagas, despesasPrevistas: despesasPrevistas._sum.amount || 0, resultado },
      producao: { realizadas: apptRealizadas, sessoesRealizadas: sessionsByProf.reduce((a, s) => a + s._count.id, 0), porProfissional },
      pacientesRetencao: { novos: novosAtual, ativos: pacientesAtivo, inativos: pacientesInativo, semRetorno: pacientesSemRetorno },
      alertas,
      profissionais: profissionais.map(p => ({ id: p.id, name: p.user.name })),
    };
  }

  async getChartData(clinicId: string, months = 6) {
    const data: Array<{ mes: string; receita: number; despesa: number; lucro: number; pacientes: number }> = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);

      const [receita, despesa, pacientes] = await Promise.all([
        this.prisma.financialTransaction.aggregate({ where: { clinicId, type: 'INCOME', status: 'PAID', paidAt: { gte: start, lte: end } }, _sum: { amount: true } }),
        this.prisma.financialTransaction.aggregate({ where: { clinicId, type: 'EXPENSE', status: 'PAID', paidAt: { gte: start, lte: end } }, _sum: { amount: true } }),
        this.prisma.patient.count({ where: { clinicId, createdAt: { gte: start, lte: end } } }),
      ]);

      data.push({
        mes: start.toLocaleString('pt-BR', { month: 'short' }),
        receita: receita._sum.amount || 0,
        despesa: despesa._sum.amount || 0,
        lucro: (receita._sum.amount || 0) - (despesa._sum.amount || 0),
        pacientes,
      });
    }

    return data;
  }
}
