import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const SALE_INCLUDE = {
  patient: { select: { id: true, name: true, phone: true } },
  paymentMethod: true,
  items: { include: { plan: true, product: true, category: { select: { id: true, name: true } } } },
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

  async create(clinicId: string, data: any, createdByUserId?: string) {
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

    // Enrich items with categoryId from plan.defaultCategoryId
    const enrichedItems = await this._enrichItemsWithCategory(items);
    // Primary category = first item's category (for single-item sales)
    const primaryCategoryId = enrichedItems[0]?.categoryId ?? null;

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
          items: { create: enrichedItems },
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
              categoryId: primaryCategoryId,
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
            categoryId: primaryCategoryId,
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

      // Auto-generate contracts for plans that have a linked contract template
      await this._createContractsFromSale(tx, clinicId, sale.id, saleData.patientId, items, total, createdByUserId);

      return sale;
    });
  }

  private async _createContractsFromSale(
    tx: any,
    clinicId: string,
    saleId: string,
    patientId: string | undefined,
    items: any[],
    totalValue: number,
    createdByUserId?: string,
  ) {
    const seenTemplates = new Set<string>();

    for (const item of items) {
      if (!item.planId) continue;

      const plan = await tx.plan.findUnique({
        where: { id: item.planId },
        include: { contractTemplate: true },
      });

      if (!plan?.contractTemplate) continue;
      if (seenTemplates.has(plan.contractTemplate.id)) continue;
      seenTemplates.add(plan.contractTemplate.id);

      const itemsSnapshot = JSON.stringify(
        items
          .filter((i) => i.planId === item.planId)
          .map((i) => ({
            name: i.name,
            quantity: i.quantity ?? 1,
            unitValue: i.unitPrice ?? i.total ?? 0,
            totalValue: i.total ?? 0,
            sessionsQuantity: plan.sessionsTotal > 0 ? plan.sessionsTotal : undefined,
          })),
      );

      await tx.contract.create({
        data: {
          clinicId,
          patientId: patientId ?? null,
          saleId,
          contractTemplateId: plan.contractTemplate.id,
          title: plan.contractTemplate.name,
          type: plan.contractTemplate.type,
          origin: 'sale_auto',
          status: 'a_gerar',
          totalValue,
          itemsSnapshot,
          createdByUserId: createdByUserId ?? null,
        },
      });
    }
  }

  private async _enrichItemsWithCategory(items: any[]): Promise<any[]> {
    return Promise.all(items.map(async (item) => {
      if (item.categoryId || !item.planId) return item;
      const plan = await this.prisma.plan.findUnique({ where: { id: item.planId }, select: { defaultCategoryId: true } });
      return { ...item, categoryId: plan?.defaultCategoryId ?? null };
    }));
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

      const itemCategoryId = (sale.items[0] as any)?.categoryId ?? null;

      await tx.financialTransaction.create({
        data: {
          clinicId,
          saleId: id,
          categoryId: itemCategoryId,
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
            categoryId: itemCategoryId,
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
