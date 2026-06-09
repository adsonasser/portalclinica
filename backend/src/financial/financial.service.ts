import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { $Enums } from '@prisma/client';
const TransactionType = $Enums.TransactionType;

const TX_INCLUDE = {
  category: true,
  paymentMethod: true,
  sale: { include: { patient: { select: { id: true, name: true, phone: true } }, items: { take: 1 } } },
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
    return this.prisma.financialTransaction.create({
      data: { ...data, clinicId },
      include: TX_INCLUDE,
    });
  }

  async updateTransaction(clinicId: string, id: string, data: any) {
    await this.findTransactionOne(clinicId, id);
    return this.prisma.financialTransaction.update({
      where: { id },
      data,
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
