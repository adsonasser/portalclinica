import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SALE_INCLUDE = {
  patient: { select: { id: true, name: true, phone: true } },
  paymentMethod: true,
  items: { include: { plan: true, product: true, category: { select: { id: true, name: true } } } },
  sessions: { select: { id: true, sessionNumber: true, sessionStatus: true, date: true, attended: true } },
  transactions: {
    select: { id: true, amount: true, status: true, type: true, dueDate: true, paymentMethodId: true },
    where: { type: TransactionType.INCOME },
  },
} as const;

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService) {}

  async findAll(clinicId: string, query?: any) {
    const where: any = { clinicId };
    if (query?.status)    where.status    = query.status;
    if (query?.saleType)  where.saleType  = query.saleType;
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
      include: SALE_INCLUDE,
    });
    if (!s) throw new NotFoundException('Venda não encontrada');
    return s;
  }

  // ─── Create ──────────────────────────────────────────────────────────────────

  async create(clinicId: string, data: any, createdByUserId?: string) {
    const { items, notes, generateSessions } = data;

    const total = items.reduce(
      (sum: number, i: any) => sum + (i.total ?? i.unitPrice * i.quantity),
      0,
    );

    // ── Determine negotiation format ──────────────────────────────────────────
    let negType: 'none' | 'partial' | 'full';
    let paymentsNow: any[];
    let installments: any[];

    if (data.negotiation) {
      // New format
      negType      = data.negotiation.type   ?? 'none';
      paymentsNow  = data.negotiation.paymentsNow ?? [];
      installments = data.negotiation.installments ?? [];
    } else {
      // Legacy format (backward compat)
      const { payments: legacyPayments = [], paidAmount: rawPaid, saleType: legacyType, paymentDate, paymentMethodId: pmId } = data;
      const legacyArr: any[] = legacyPayments.length > 0
        ? legacyPayments
        : (Number(rawPaid) > 0 ? [{ amount: Number(rawPaid), paymentMethodId: pmId ?? null, paymentDate: paymentDate ?? null }] : []);

      if (legacyType === 'ORCAMENTO' || legacyArr.length === 0) {
        negType = 'none';
      } else {
        const legacyPaid = legacyArr.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
        negType = legacyPaid >= total ? 'full' : 'partial';
      }
      paymentsNow  = legacyArr.map(p => ({
        amount: Number(p.amount),
        paymentMethodId: p.paymentMethodId ?? null,
        paymentDate: p.paymentDate ?? null,
      }));
      installments = [];
    }

    // ── Compute paid now ──────────────────────────────────────────────────────
    const paidFromNow  = paymentsNow.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
    const paidFromFull = installments.filter((i: any) => i.receivedNow).reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0);
    const paidNow      = paidFromNow + paidFromFull;

    let status: 'PENDING' | 'PARTIAL' | 'PAID' = 'PENDING';
    if (negType !== 'none' && paidNow >= total)   status = 'PAID';
    else if (paidNow > 0)                          status = 'PARTIAL';

    const saleType    = negType === 'none' ? 'ORCAMENTO' : 'VENDA';
    const firstPmId   = paymentsNow[0]?.paymentMethodId ?? installments[0]?.paymentMethodId ?? null;
    const enrichedItems = await this._enrichItemsWithCategory(items);
    const primaryCatId  = enrichedItems[0]?.categoryId ?? null;
    const itemName      = items[0]?.name || 'Venda';

    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          clinicId,
          patientId: data.patientId,
          total,
          paidAmount: paidNow,
          saleType,
          status,
          paymentMethodId: firstPmId,
          notes: notes || null,
          items: { create: enrichedItems },
        },
        include: SALE_INCLUDE,
      });

      if (negType === 'partial') {
        // Only register payments made NOW — no "saldo a receber" pending transaction
        for (const p of paymentsNow) {
          const amt = Number(p.amount) || 0;
          if (amt <= 0) continue;
          await tx.financialTransaction.create({
            data: {
              clinicId, saleId: sale.id, categoryId: primaryCatId,
              type: 'INCOME', status: 'PAID',
              description: `Recebimento — ${itemName}`,
              amount: amt,
              paymentMethodId: p.paymentMethodId || null,
              paidAt: p.paymentDate ? new Date(p.paymentDate) : new Date(),
            },
          });
        }
      } else if (negType === 'full') {
        // Create all installments with proper status
        for (const inst of installments) {
          const amt = Number(inst.amount) || 0;
          if (amt <= 0) continue;
          await tx.financialTransaction.create({
            data: {
              clinicId, saleId: sale.id, categoryId: primaryCatId,
              type: 'INCOME',
              status: inst.receivedNow ? 'PAID' : 'PENDING',
              description: `Recebimento — ${itemName}`,
              amount: amt,
              paymentMethodId: inst.paymentMethodId || null,
              dueDate: inst.dueDate ? new Date(inst.dueDate) : null,
              paidAt:  inst.receivedNow ? new Date() : null,
            },
          });
        }
      }
      // negType === 'none' → orçamento, no transactions at all

      if (generateSessions) {
        for (const item of items) {
          if (item.planId) {
            await this._createSessions(tx, clinicId, sale.id, data.patientId, item.planId);
          }
        }
      }

      await this._createContractsFromSale(tx, clinicId, sale.id, data.patientId, items, total, createdByUserId);

      return sale;
    });
  }

  // ─── Receive ─────────────────────────────────────────────────────────────────
  // Registers a receipt for a sale. Does NOT auto-create "saldo a receber".
  // Unnegotiated balance remains on the sale until explicitly scheduled via negotiate().

  async receive(clinicId: string, id: string, data: any) {
    const sale = await this.findOne(clinicId, id);
    const amount = Number(data.amount) || 0;
    if (amount <= 0) throw new BadRequestException('Valor inválido');

    const newPaid = (sale.paidAmount ?? 0) + amount;
    const status: 'PARTIAL' | 'PAID' = newPaid >= sale.total ? 'PAID' : 'PARTIAL';
    const isPaid = data.receivedNow !== false; // default: true

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.sale.update({
        where: { id },
        data: {
          paidAmount: isPaid ? newPaid : sale.paidAmount ?? 0,
          status: isPaid ? status : (sale.paidAmount ?? 0) > 0 ? 'PARTIAL' : 'PENDING',
          saleType: 'VENDA',
          paymentMethodId: data.paymentMethodId ?? sale.paymentMethodId,
        },
        include: SALE_INCLUDE,
      });

      const itemCategoryId = (sale.items[0] as any)?.categoryId ?? null;

      await tx.financialTransaction.create({
        data: {
          clinicId, saleId: id, categoryId: itemCategoryId,
          type: 'INCOME',
          status: isPaid ? 'PAID' : 'PENDING',
          description: `Recebimento — ${sale.items[0]?.name ?? 'Venda'}`,
          amount,
          paymentMethodId: data.paymentMethodId ?? null,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          paidAt:  isPaid ? (data.paymentDate ? new Date(data.paymentDate) : new Date()) : null,
        },
      });

      // NOTE: no longer auto-creating "saldo a receber" pending transaction.
      // Unnegotiated balance stays on the sale until negotiate() is called.

      if (data.generateSessions) {
        const planId = (sale.items as any[]).find(i => i.planId)?.planId;
        if (planId) await this._createSessions(tx, clinicId, id, sale.patientId!, planId);
      }

      return updated;
    });
  }

  // ─── Negotiate ───────────────────────────────────────────────────────────────
  // Schedules future payments (PENDING installments) for the unnegotiated balance.
  // Also handles "received now" installments in the same call.

  async negotiate(clinicId: string, id: string, data: any) {
    const sale = await this.findOne(clinicId, id);
    const installments: any[] = data.installments ?? [];
    if (installments.length === 0) throw new BadRequestException('Informe pelo menos uma parcela.');

    const itemCategoryId = (sale.items[0] as any)?.categoryId ?? null;
    const itemName = sale.items[0]?.name ?? 'Venda';

    return this.prisma.$transaction(async (tx) => {
      let receivedNowTotal = 0;

      for (const inst of installments) {
        const amt = Number(inst.amount) || 0;
        if (amt <= 0) continue;
        const isPaid = inst.receivedNow === true;
        if (isPaid) receivedNowTotal += amt;

        await tx.financialTransaction.create({
          data: {
            clinicId, saleId: id, categoryId: itemCategoryId,
            type: 'INCOME',
            status: isPaid ? 'PAID' : 'PENDING',
            description: `Recebimento — ${itemName}`,
            amount: amt,
            paymentMethodId: inst.paymentMethodId || null,
            dueDate: inst.dueDate ? new Date(inst.dueDate) : null,
            paidAt:  isPaid ? new Date() : null,
          },
        });
      }

      if (receivedNowTotal > 0) {
        const newPaid = (sale.paidAmount ?? 0) + receivedNowTotal;
        const newStatus = newPaid >= sale.total ? 'PAID' : 'PARTIAL';
        await tx.sale.update({
          where: { id },
          data: { paidAmount: newPaid, status: newStatus as any, saleType: 'VENDA' },
        });
      }

      return this.prisma.sale.findFirst({ where: { id }, include: SALE_INCLUDE });
    });
  }

  // ─── Other ───────────────────────────────────────────────────────────────────

  async generateSessions(clinicId: string, id: string) {
    const sale = await this.findOne(clinicId, id);
    const planId = (sale.items as any[]).find(i => i.planId)?.planId;
    if (!planId) throw new NotFoundException('Nenhum procedimento com plano vinculado');

    return this.prisma.$transaction(async (tx) => {
      await this._createSessions(tx, clinicId, id, sale.patientId!, planId);
      return this.prisma.sale.findFirst({ where: { id }, include: SALE_INCLUDE });
    });
  }

  async updateStatus(clinicId: string, id: string, status: string) {
    await this.findOne(clinicId, id);
    return this.prisma.sale.update({ where: { id }, data: { status: status as any }, include: SALE_INCLUDE });
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
      totalMes:      totalMes._sum.total      || 0,
      totalPago:     totalPago._sum.total     || 0,
      totalPendente: totalPendente._sum.total || 0,
      countMes,
    };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async _enrichItemsWithCategory(items: any[]): Promise<any[]> {
    return Promise.all(items.map(async (item) => {
      if (item.categoryId || !item.planId) return item;
      const plan = await this.prisma.plan.findUnique({ where: { id: item.planId }, select: { defaultCategoryId: true } });
      return { ...item, categoryId: plan?.defaultCategoryId ?? null };
    }));
  }

  private async _createSessions(tx: any, clinicId: string, saleId: string, patientId: string, planId: string) {
    const plan = await tx.plan.findUnique({ where: { id: planId } });
    if (!plan || plan.sessionsTotal < 1) return;

    const existing = await tx.session.count({ where: { saleId } });
    const toCreate = plan.sessionsTotal - existing;
    if (toCreate <= 0) return;

    const baseDate = new Date();
    const sessions = Array.from({ length: toCreate }, (_, i) => ({
      clinicId, patientId, planId, saleId,
      sessionNumber: existing + i + 1,
      sessionStatus: 'A_AGENDAR',
      date: baseDate,
      attended: false,
    }));

    await tx.session.createMany({ data: sessions });
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

      const plan = await tx.plan.findUnique({ where: { id: item.planId }, include: { contractTemplate: true } });
      if (!plan?.contractTemplate) continue;
      if (seenTemplates.has(plan.contractTemplate.id)) continue;
      seenTemplates.add(plan.contractTemplate.id);

      const itemsSnapshot = JSON.stringify(
        items.filter(i => i.planId === item.planId).map(i => ({
          name: i.name, quantity: i.quantity ?? 1,
          unitValue: i.unitPrice ?? i.total ?? 0, totalValue: i.total ?? 0,
          sessionsQuantity: plan.sessionsTotal > 0 ? plan.sessionsTotal : undefined,
        })),
      );

      await tx.contract.create({
        data: {
          clinicId, patientId: patientId ?? null, saleId,
          contractTemplateId: plan.contractTemplate.id,
          title: plan.contractTemplate.name,
          type: plan.contractTemplate.type,
          origin: 'sale_auto', status: 'a_gerar',
          totalValue, itemsSnapshot,
          createdByUserId: createdByUserId ?? null,
        },
      });
    }
  }
}
