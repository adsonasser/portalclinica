import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const SALE_INCLUDE = {
  patient: { select: { id: true, name: true, phone: true } },
  paymentMethod: true,
  items: { include: { plan: true, product: true } },
  sessions: { select: { id: true, sessionNumber: true, sessionStatus: true, date: true, attended: true } },
};

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService) {}

  async findAll(clinicId: string, query?: any) {
    const where: any = { clinicId };
    if (query?.status) where.status = query.status;
    if (query?.saleType) where.saleType = query.saleType;
    if (query?.patientId) where.patientId = query.patientId;

    return this.prisma.sale.findMany({
      where,
      include: SALE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(clinicId: string, id: string) {
    const s = await this.prisma.sale.findFirst({
      where: { id, clinicId },
      include: {
        ...SALE_INCLUDE,
        transactions: true,
      },
    });
    if (!s) throw new NotFoundException('Venda não encontrada');
    return s;
  }

  async create(clinicId: string, data: any) {
    const { items, payments: paymentsData = [], paidAmount: rawPaid, saleType, generateSessions, paymentDate, paymentMethodId: pmId, ...saleData } = data;

    const total = items.reduce(
      (sum: number, i: any) => sum + (i.total ?? i.unitPrice * i.quantity),
      0,
    );

    // Support both new payments[] array and legacy single paidAmount
    const paymentsArr: any[] = paymentsData.length > 0
      ? paymentsData
      : (Number(rawPaid) > 0 ? [{ amount: Number(rawPaid), paymentMethodId: pmId ?? null, paymentDate: paymentDate ?? null }] : []);

    const paid = paymentsArr.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
    const balance = total - paid;

    let status: 'PENDING' | 'PARTIAL' | 'PAID' = 'PENDING';
    if (paid >= total) status = 'PAID';
    else if (paid > 0) status = 'PARTIAL';

    const type = saleType ?? (paid === 0 ? 'ORCAMENTO' : 'VENDA');
    const firstPmId = paymentsArr[0]?.paymentMethodId ?? null;

    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          ...saleData,
          clinicId,
          total,
          paidAmount: paid,
          saleType: type,
          status,
          paymentMethodId: firstPmId,
          items: { create: items },
        },
        include: SALE_INCLUDE,
      });

      // Create one financial transaction per payment line
      for (const payment of paymentsArr) {
        const amt = Number(payment.amount) || 0;
        if (amt > 0) {
          await tx.financialTransaction.create({
            data: {
              clinicId,
              saleId: sale.id,
              type: 'INCOME',
              status: 'PAID',
              description: `Recebimento — ${items[0]?.name || 'Venda'}`,
              amount: amt,
              paymentMethodId: payment.paymentMethodId ?? null,
              paidAt: payment.paymentDate ? new Date(payment.paymentDate) : new Date(),
            },
          });
        }
      }

      if (balance > 0 && paid > 0) {
        await tx.financialTransaction.create({
          data: {
            clinicId,
            saleId: sale.id,
            type: 'INCOME',
            status: 'PENDING',
            description: `Saldo a receber — ${items[0]?.name || 'Venda'}`,
            amount: balance,
          },
        });
      }

      if (generateSessions) {
        // Generate sessions for every item that has a plan with sessions
        for (const item of items) {
          if (item.planId) {
            await this._createSessions(tx, clinicId, sale.id, saleData.patientId, item.planId);
          }
        }
      }

      return sale;
    });
  }

  async receive(clinicId: string, id: string, data: any) {
    const sale = await this.findOne(clinicId, id);
    const amount = Number(data.amount) || 0;
    const newPaid = (sale.paidAmount ?? 0) + amount;
    const balance = sale.total - newPaid;
    const status: 'PARTIAL' | 'PAID' = balance <= 0 ? 'PAID' : 'PARTIAL';

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.sale.update({
        where: { id },
        data: {
          paidAmount: newPaid,
          status,
          saleType: 'VENDA',
          paymentMethodId: data.paymentMethodId ?? sale.paymentMethodId,
        },
        include: SALE_INCLUDE,
      });

      await tx.financialTransaction.create({
        data: {
          clinicId,
          saleId: id,
          type: 'INCOME',
          status: 'PAID',
          description: `Recebimento — ${sale.items[0]?.name ?? 'Venda'}`,
          amount,
          paymentMethodId: data.paymentMethodId ?? null,
          paidAt: data.paymentDate ? new Date(data.paymentDate) : new Date(),
        },
      });

      if (balance > 0) {
        await tx.financialTransaction.deleteMany({
          where: { clinicId, saleId: id, status: 'PENDING', type: 'INCOME' },
        });
        await tx.financialTransaction.create({
          data: {
            clinicId,
            saleId: id,
            type: 'INCOME',
            status: 'PENDING',
            description: `Saldo a receber — ${sale.items[0]?.name ?? 'Venda'}`,
            amount: balance,
          },
        });
      }

      if (data.generateSessions) {
        const planId = (sale.items as any[]).find((i) => i.planId)?.planId;
        if (planId) {
          await this._createSessions(tx, clinicId, id, sale.patientId!, planId);
        }
      }

      return updated;
    });
  }

  async generateSessions(clinicId: string, id: string) {
    const sale = await this.findOne(clinicId, id);
    const planId = (sale.items as any[]).find((i) => i.planId)?.planId;
    if (!planId) throw new NotFoundException('Nenhum procedimento com plano vinculado');

    return this.prisma.$transaction(async (tx) => {
      await this._createSessions(tx, clinicId, id, sale.patientId!, planId);
      return this.prisma.sale.findFirst({ where: { id }, include: SALE_INCLUDE });
    });
  }

  async updateStatus(clinicId: string, id: string, status: string) {
    await this.findOne(clinicId, id);
    return this.prisma.sale.update({
      where: { id },
      data: { status: status as any },
      include: SALE_INCLUDE,
    });
  }

  async stats(clinicId: string) {
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalMes, totalPago, totalPendente, countMes] = await Promise.all([
      this.prisma.sale.aggregate({ where: { clinicId, createdAt: { gte: startMonth } }, _sum: { total: true } }),
      this.prisma.sale.aggregate({ where: { clinicId, status: 'PAID' }, _sum: { total: true } }),
      this.prisma.sale.aggregate({ where: { clinicId, status: 'PENDING' }, _sum: { total: true } }),
      this.prisma.sale.count({ where: { clinicId, createdAt: { gte: startMonth } } }),
    ]);

    return {
      totalMes: totalMes._sum.total || 0,
      totalPago: totalPago._sum.total || 0,
      totalPendente: totalPendente._sum.total || 0,
      countMes,
    };
  }

  private async _createSessions(
    tx: any,
    clinicId: string,
    saleId: string,
    patientId: string,
    planId: string,
  ) {
    const plan = await tx.plan.findUnique({ where: { id: planId } });
    if (!plan || plan.sessionsTotal < 1) return;

    const existing = await tx.session.count({ where: { saleId } });
    const toCreate = plan.sessionsTotal - existing;
    if (toCreate <= 0) return;

    const baseDate = new Date();
    const sessions = Array.from({ length: toCreate }, (_, i) => ({
      clinicId,
      patientId,
      planId,
      saleId,
      sessionNumber: existing + i + 1,
      sessionStatus: 'A_AGENDAR',
      date: baseDate,
      attended: false,
    }));

    await tx.session.createMany({ data: sessions });
  }
}
