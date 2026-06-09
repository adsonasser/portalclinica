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
