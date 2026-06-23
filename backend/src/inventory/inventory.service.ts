import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async findProducts(clinicId: string, query?: any) {
    const where: any = { clinicId };
    if (query?.search) where.name = { contains: query.search, mode: 'insensitive' };
    if (query?.categoryId) where.categoryId = query.categoryId;
    if (query?.active !== undefined) where.active = query.active === 'true';

    return this.prisma.product.findMany({
      where,
      include: { category: true, supplier: true },
      orderBy: { name: 'asc' },
    });
  }

  async findProduct(clinicId: string, id: string) {
    const p = await this.prisma.product.findFirst({ where: { id, clinicId }, include: { category: true, supplier: true, stockMovements: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    if (!p) throw new NotFoundException('Produto não encontrado');
    return p;
  }

  async createProduct(clinicId: string, data: any) {
    return this.prisma.product.create({ data: { ...data, clinicId }, include: { category: true, supplier: true } });
  }

  async updateProduct(clinicId: string, id: string, data: any) {
    await this.findProduct(clinicId, id);
    return this.prisma.product.update({ where: { id }, data, include: { category: true, supplier: true } });
  }

  async deleteProduct(clinicId: string, id: string) {
    await this.findProduct(clinicId, id);
    return this.prisma.product.delete({ where: { id } });
  }

  async createMovement(clinicId: string, data: any) {
    const { productId, type, quantity, ...rest } = data;
    const product = await this.findProduct(clinicId, productId);

    const delta = ['ENTRADA', 'AJUSTE'].includes(type) ? quantity : -quantity;

    return this.prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id: productId }, data: { stock: { increment: delta } } });
      return tx.stockMovement.create({ data: { clinicId, productId, type, quantity, ...rest } });
    });
  }

  async findMovements(clinicId: string, query?: any) {
    const where: any = { clinicId };
    if (query?.type) where.type = query.type;
    if (query?.productId) where.productId = query.productId;
    return this.prisma.stockMovement.findMany({
      where,
      include: { product: { select: { name: true, unit: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findExpiryMovements(clinicId: string) {
    return this.prisma.stockMovement.findMany({
      where: { clinicId, type: 'ENTRADA', expiryDate: { not: null } },
      include: { product: { select: { id: true, name: true, unit: true } } },
      orderBy: { expiryDate: 'asc' },
    });
  }

  async movementStats(clinicId: string, query?: any) {
    const where: any = { clinicId };
    if (query?.startDate) where.createdAt = { gte: new Date(query.startDate) };
    if (query?.endDate) where.createdAt = { ...(where.createdAt || {}), lte: new Date(query.endDate) };
    const movements = await this.prisma.stockMovement.findMany({ where, select: { type: true, quantity: true, unitCost: true } });
    const byType: Record<string, { count: number; qty: number; value: number }> = {
      ENTRADA: { count: 0, qty: 0, value: 0 },
      SAIDA:   { count: 0, qty: 0, value: 0 },
      AJUSTE:  { count: 0, qty: 0, value: 0 },
      CONSUMO: { count: 0, qty: 0, value: 0 },
    };
    for (const m of movements) {
      const t = byType[m.type];
      if (t) { t.count++; t.qty += m.quantity; t.value += m.quantity * (m.unitCost || 0); }
    }
    return { total: movements.length, byType };
  }

  async findCategories(clinicId: string) {
    return this.prisma.productCategory.findMany({ where: { clinicId }, orderBy: { name: 'asc' } });
  }

  async createCategory(clinicId: string, data: any) {
    return this.prisma.productCategory.create({ data: { ...data, clinicId } });
  }

  async findSuppliers(clinicId: string) {
    return this.prisma.supplier.findMany({ where: { clinicId }, orderBy: { name: 'asc' } });
  }

  async createSupplier(clinicId: string, data: any) {
    return this.prisma.supplier.create({ data: { ...data, clinicId } });
  }

  async updateSupplier(clinicId: string, id: string, data: any) {
    return this.prisma.supplier.update({ where: { id }, data });
  }

  async stats(clinicId: string) {
    const products = await this.prisma.product.findMany({ where: { clinicId, active: true } });
    const total = products.length;
    const abaixoMinimo = products.filter(p => p.stock <= p.minStock).length;
    const valorTotal = products.reduce((s, p) => s + p.stock * p.costPrice, 0);
    return { total, abaixoMinimo, valorTotal };
  }
}
