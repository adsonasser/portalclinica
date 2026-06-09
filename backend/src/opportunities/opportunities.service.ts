import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OpportunitiesService {
  constructor(private prisma: PrismaService) {}

  async findAll(clinicId: string, query?: any) {
    const where: any = { clinicId };
    if (query?.status) where.status = query.status;
    return this.prisma.opportunity.findMany({
      where,
      include: { patient: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(clinicId: string, data: any) {
    return this.prisma.opportunity.create({ data: { ...data, clinicId } });
  }

  async update(clinicId: string, id: string, data: any) {
    return this.prisma.opportunity.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.opportunity.delete({ where: { id } });
  }
}
