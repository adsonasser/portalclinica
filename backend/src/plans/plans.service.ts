import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlansService {
  constructor(private prisma: PrismaService) {}

  async findAll(clinicId: string) {
    return this.prisma.plan.findMany({
      where: { clinicId },
      include: { defaultCategory: true, procedureProducts: { include: { product: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(clinicId: string, id: string) {
    const p = await this.prisma.plan.findFirst({
      where: { id, clinicId },
      include: { defaultCategory: true, procedureProducts: { include: { product: true } } },
    });
    if (!p) throw new NotFoundException('Procedimento não encontrado');
    return p;
  }

  async create(clinicId: string, data: any) {
    const { procedureProducts, ...rest } = data;
    return this.prisma.plan.create({
      data: { ...rest, clinicId },
      include: { defaultCategory: true },
    });
  }

  async update(clinicId: string, id: string, data: any) {
    await this.findOne(clinicId, id);
    const { procedureProducts, ...rest } = data;
    return this.prisma.plan.update({ where: { id }, data: rest, include: { defaultCategory: true } });
  }

  async remove(clinicId: string, id: string) {
    await this.findOne(clinicId, id);
    return this.prisma.plan.delete({ where: { id } });
  }
}
