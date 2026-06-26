import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { $Enums } from '@prisma/client';
const TransactionType = $Enums.TransactionType;

const TX_INCLUDE = {
  category: true,
  paymentMethod: true,
  recurrence: { select: { id: true, frequency: true, occurrences: true, startDate: true, endDate: true } },
  sale: {
    include: {
      patient:  { select: { id: true, name: true, phone: true } },
      items:    { include: { plan: true } },
      sessions: { select: { id: true, sessionStatus: true, attended: true } },
    },
  },
};

@Injectable()
export class FinancialService {
  constructor(private prisma: PrismaService) {}

  // ─── Transactions ─────────────────────────────────────────────────────────

  async findTransactions(clinicId: string, query?: any) {
    const where: any = { clinicId };
    if (query?.type)   where.type   = query.type;
    if (query?.status) where.status = query.status;
    if (query?.saleId) where.saleId = query.saleId;
    if (query?.start && query?.end) {
      where.createdAt = { gte: new Date(query.start), lte: new Date(query.end) };
    }
    if (query?.categoryId) where.categoryId = query.categoryId;

    return this.prisma.financialTransaction.findMany({
      where,
      include: TX_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTransaction(clinicId: string, data: any) {
    const amount = parseFloat(data.amount);
    if (!isFinite(amount) || amount <= 0) throw new BadRequestException('Informe um valor válido.');

    if (data.recurrence) {
      return this._createRecurring(clinicId, data, amount);
    }

    const txData = this._buildTxData(clinicId, data, amount);
    return this.prisma.financialTransaction.create({ data: txData, include: TX_INCLUDE });
  }

  private _buildTxData(clinicId: string, data: any, amount: number) {
    return {
      clinicId,
      amount,
      type:            data.type,
      status:          data.status ?? 'PENDING',
      description:     data.description,
      contactName:     data.contactName   || null,
      notes:           data.notes         || null,
      categoryId:      data.categoryId    || null,
      paymentMethodId: data.paymentMethodId || null,
      saleId:          data.saleId        || null,
      dueDate:         data.dueDate ? new Date(data.dueDate) : null,
      paidAt:          data.paidAt  ? new Date(data.paidAt)  : null,
    };
  }

  private _addFrequency(date: Date, freq: string): Date {
    const d = new Date(date);
    switch (freq) {
      case 'SEMANAL':     d.setDate(d.getDate() + 7);   break;
      case 'QUINZENAL':   d.setDate(d.getDate() + 15);  break;
      case 'MENSAL':      d.setMonth(d.getMonth() + 1); break;
      case 'BIMESTRAL':   d.setMonth(d.getMonth() + 2); break;
      case 'TRIMESTRAL':  d.setMonth(d.getMonth() + 3); break;
      case 'SEMESTRAL':   d.setMonth(d.getMonth() + 6); break;
      case 'ANUAL':       d.setFullYear(d.getFullYear() + 1); break;
    }
    return d;
  }

  private _buildOccurrenceDates(startDate: Date, freq: string, mode: 'count' | 'until', count?: number, until?: Date): Date[] {
    const dates: Date[] = [];
    let current = new Date(startDate);

    if (mode === 'count') {
      const n = Math.min(Math.max(count ?? 2, 2), 120);
      for (let i = 0; i < n; i++) {
        dates.push(new Date(current));
        current = this._addFrequency(current, freq);
      }
    } else {
      const limit = until!;
      let iterations = 0;
      while (current <= limit && iterations < 120) {
        dates.push(new Date(current));
        current = this._addFrequency(current, freq);
        iterations++;
      }
      if (dates.length < 2) throw new BadRequestException('Recorrência deve gerar pelo menos 2 lançamentos.');
    }

    return dates;
  }

  private async _createRecurring(clinicId: string, data: any, amount: number) {
    const rec = data.recurrence as {
      frequency: string;
      mode: 'count' | 'until';
      count?: number;
      until?: string;
    };

    if (!rec.frequency) throw new BadRequestException('Frequência obrigatória para recorrência.');

    const startDate = data.dueDate ? new Date(data.dueDate) : new Date();
    const until     = rec.mode === 'until' && rec.until ? new Date(rec.until) : undefined;
    const dates     = this._buildOccurrenceDates(startDate, rec.frequency, rec.mode, rec.count, until);
    const total     = dates.length;

    return this.prisma.$transaction(async (p) => {
      const recurrence = await p.financialRecurrence.create({
        data: {
          clinicId,
          type:        data.type,
          description: data.description,
          amount,
          frequency:   rec.frequency,
          startDate,
          endDate:     until ?? dates[dates.length - 1],
          occurrences: total,
        },
      });

      const created = await Promise.all(
        dates.map((dueDate, idx) =>
          p.financialTransaction.create({
            data: {
              ...this._buildTxData(clinicId, data, amount),
              dueDate,
              recurrenceId:    recurrence.id,
              recurrenceIndex: idx + 1,
              recurrenceTotal: total,
            },
            include: TX_INCLUDE,
          }),
        ),
      );

      return { recurrence, transactions: created };
    });
  }

  async updateTransaction(clinicId: string, id: string, data: any) {
    await this.findTransactionOne(clinicId, id);
    const update: any = { ...data };
    if (update.dueDate !== undefined) update.dueDate = update.dueDate ? new Date(update.dueDate) : null;
    if (update.paidAt  !== undefined) update.paidAt  = update.paidAt  ? new Date(update.paidAt)  : null;
    return this.prisma.financialTransaction.update({
      where: { id },
      data: update,
      include: TX_INCLUDE,
    });
  }

  async receiveTransaction(clinicId: string, id: string, data: any) {
    const tx = await this.findTransactionOne(clinicId, id);
    if (tx.status === 'PAID') throw new BadRequestException('Transação já recebida');

    const amount = Number(data.amount) > 0 ? Number(data.amount) : tx.amount;

    return this.prisma.$transaction(async (p) => {
      const updated = await p.financialTransaction.update({
        where: { id },
        data: {
          status: 'PAID',
          amount,
          paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
          paymentMethodId: data.paymentMethodId || null,
        },
        include: TX_INCLUDE,
      });

      if (tx.saleId && tx.type === 'INCOME') {
        const sale = await p.sale.findUnique({ where: { id: tx.saleId } });
        if (sale) {
          const newPaid  = Math.min(sale.total, (sale.paidAmount ?? 0) + amount);
          const balance  = sale.total - newPaid;
          const saleStatus = balance <= 0 ? 'PAID' : 'PARTIAL';

          await p.sale.update({
            where: { id: tx.saleId },
            data: { paidAmount: newPaid, status: saleStatus as any, saleType: 'VENDA' },
          });

          // Remove all other PENDING INCOME transactions for this sale
          await p.financialTransaction.deleteMany({
            where: { clinicId, saleId: tx.saleId, status: 'PENDING', type: 'INCOME', id: { not: id } },
          });

          if (balance > 0) {
            const base = tx.description.replace(/^(Saldo a receber — |Recebimento — )/, '');
            await p.financialTransaction.create({
              data: {
                clinicId,
                saleId: tx.saleId,
                type: 'INCOME',
                status: 'PENDING',
                description: `Saldo a receber — ${base}`,
                amount: balance,
              },
            });
          }
        }
      }

      return updated;
    });
  }

  async cancelTransaction(clinicId: string, id: string, motivo?: string) {
    const tx = await this.findTransactionOne(clinicId, id);
    if (tx.status === 'CANCELLED') throw new BadRequestException('Transação já cancelada');

    return this.prisma.$transaction(async (p) => {
      const noteText = motivo ? `[Cancelado] ${motivo}` : '[Cancelado]';
      const cancelled = await p.financialTransaction.update({
        where: { id },
        data: { status: 'CANCELLED', notes: noteText },
        include: TX_INCLUDE,
      });

      if (tx.status === 'PAID' && tx.type === 'INCOME' && tx.saleId) {
        const sale = await p.sale.findUnique({ where: { id: tx.saleId } });
        if (sale && sale.status !== 'CANCELLED') {
          const newPaid = Math.max(0, (sale.paidAmount ?? 0) - tx.amount);
          const newStatus = newPaid <= 0 ? 'PENDING' : newPaid >= sale.total ? 'PAID' : 'PARTIAL';
          await p.sale.update({
            where: { id: tx.saleId },
            data: { paidAmount: newPaid, status: newStatus as any, hasFinancialIssue: true },
          });
        }
      }

      return cancelled;
    });
  }

  async deleteTransaction(clinicId: string, id: string) {
    await this.findTransactionOne(clinicId, id);
    return this.prisma.financialTransaction.delete({ where: { id } });
  }

  private async findTransactionOne(clinicId: string, id: string) {
    const t = await this.prisma.financialTransaction.findFirst({ where: { id, clinicId } });
    if (!t) throw new NotFoundException('Transação não encontrada');
    return t;
  }

  // ─── Categories ────────────────────────────────────────────────────────────

  async findCategories(clinicId: string) {
    return this.prisma.financialCategory.findMany({
      where: { clinicId },
      include: { children: true },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(clinicId: string, data: any) {
    return this.prisma.financialCategory.create({ data: { ...data, clinicId } });
  }

  async ensureDefaultCategory(clinicId: string) {
    const existing = await this.prisma.financialCategory.findFirst({
      where: { clinicId, name: 'Receita com Venda', type: 'INCOME' },
    });
    if (existing) return existing;
    return this.prisma.financialCategory.create({
      data: { clinicId, name: 'Receita com Venda', type: 'INCOME', active: true },
    });
  }

  async getOrCreateDefaultCategory(clinicId: string): Promise<string | null> {
    const cat = await this.ensureDefaultCategory(clinicId);
    return cat?.id ?? null;
  }

  async updateCategory(clinicId: string, id: string, data: any) {
    return this.prisma.financialCategory.update({ where: { id }, data });
  }

  async deleteCategory(clinicId: string, id: string) {
    return this.prisma.financialCategory.delete({ where: { id } });
  }

  // ─── Payment Methods ───────────────────────────────────────────────────────

  async findPaymentMethods(clinicId: string) {
    return this.prisma.paymentMethod.findMany({ where: { clinicId }, orderBy: { name: 'asc' } });
  }

  async createPaymentMethod(clinicId: string, data: any) {
    return this.prisma.paymentMethod.create({ data: { ...data, clinicId } });
  }

  async updatePaymentMethod(clinicId: string, id: string, data: any) {
    return this.prisma.paymentMethod.update({ where: { id }, data });
  }

  async deletePaymentMethod(clinicId: string, id: string) {
    return this.prisma.paymentMethod.delete({ where: { id } });
  }

  // ─── DRE ───────────────────────────────────────────────────────────────────

  async dre(clinicId: string, year: number, month?: number) {
    const start = month ? new Date(year, month - 1, 1) : new Date(year, 0, 1);
    const end   = month ? new Date(year, month, 0, 23, 59, 59) : new Date(year, 11, 31, 23, 59, 59);

    const transactions = await this.prisma.financialTransaction.findMany({
      where: { clinicId, status: 'PAID', paidAt: { gte: start, lte: end } },
      include: { category: { include: { parent: true } } },
    });

    const receitas = transactions.filter(t => t.type === TransactionType.INCOME);
    const despesas = transactions.filter(t => t.type === TransactionType.EXPENSE);
    const totalReceitas = receitas.reduce((s, t) => s + t.amount, 0);
    const totalDespesas = despesas.reduce((s, t) => s + t.amount, 0);
    const lucroLiquido  = totalReceitas - totalDespesas;

    const groupBy = (items: typeof transactions) => {
      const groups: Record<string, { name: string; total: number; items: any[] }> = {};
      for (const t of items) {
        const key   = t.category?.parentId || t.category?.id || 'sem-categoria';
        const label = t.category?.parent?.name || t.category?.name || 'Sem categoria';
        if (!groups[key]) groups[key] = { name: label, total: 0, items: [] };
        groups[key].total += t.amount;
        groups[key].items.push(t);
      }
      return Object.values(groups);
    };

    return {
      periodo: { start, end, year, month },
      totalReceitas,
      totalDespesas,
      lucroLiquido,
      margemLiquida: totalReceitas > 0 ? (lucroLiquido / totalReceitas) * 100 : 0,
      receitasPorCategoria: groupBy(receitas),
      despesasPorCategoria: groupBy(despesas),
    };
  }

  // ─── Summary ───────────────────────────────────────────────────────────────

  async summary(clinicId: string) {
    const now        = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endMonth   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const today      = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow   = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

    const [aReceber, aPagar, recebidoMes, pagaMes, vencidas, vendemHoje] = await Promise.all([
      this.prisma.financialTransaction.aggregate({
        where: { clinicId, type: 'INCOME', status: 'PENDING' }, _sum: { amount: true },
      }),
      this.prisma.financialTransaction.aggregate({
        where: { clinicId, type: 'EXPENSE', status: 'PENDING' }, _sum: { amount: true },
      }),
      this.prisma.financialTransaction.aggregate({
        where: { clinicId, type: 'INCOME', status: 'PAID', paidAt: { gte: startMonth, lte: endMonth } },
        _sum: { amount: true },
      }),
      this.prisma.financialTransaction.aggregate({
        where: { clinicId, type: 'EXPENSE', status: 'PAID', paidAt: { gte: startMonth, lte: endMonth } },
        _sum: { amount: true },
      }),
      this.prisma.financialTransaction.count({
        where: { clinicId, status: 'PENDING', dueDate: { lt: today } },
      }),
      this.prisma.financialTransaction.count({
        where: { clinicId, status: 'PENDING', dueDate: { gte: today, lt: tomorrow } },
      }),
    ]);

    return {
      aReceber:    aReceber._sum.amount  || 0,
      aPagar:      aPagar._sum.amount    || 0,
      recebidoMes: recebidoMes._sum.amount || 0,
      pagaMes:     pagaMes._sum.amount   || 0,
      saldoMes:    (recebidoMes._sum.amount || 0) - (pagaMes._sum.amount || 0),
      vencidas,
      vendemHoje,
    };
  }
}
