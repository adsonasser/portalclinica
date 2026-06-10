import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_TYPES = [
  { name: 'Paciente', color: '#2563EB', sortOrder: 0 },
  { name: 'Prospect', color: '#7C3AED', sortOrder: 1 },
  { name: 'Fornecedor', color: '#D97706', sortOrder: 2 },
  { name: 'Parceiro', color: '#16A34A', sortOrder: 3 },
];

@Injectable()
export class ContactTypesService {
  constructor(private prisma: PrismaService) {}

  async findAll(clinicId: string) {
    const existing = await this.prisma.clinicContactType.findMany({
      where: { clinicId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (existing.length === 0) {
      await this.prisma.clinicContactType.createMany({
        data: DEFAULT_TYPES.map((t) => ({ ...t, clinicId })),
      });
      return this.prisma.clinicContactType.findMany({
        where: { clinicId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    }
    return existing;
  }

  async create(clinicId: string, data: any) {
    return this.prisma.clinicContactType.create({ data: { ...data, clinicId } });
  }

  async update(clinicId: string, id: string, data: any) {
    await this.findOne(clinicId, id);
    return this.prisma.clinicContactType.update({ where: { id }, data });
  }

  async remove(clinicId: string, id: string) {
    await this.findOne(clinicId, id);
    return this.prisma.clinicContactType.delete({ where: { id } });
  }

  private async findOne(clinicId: string, id: string) {
    const t = await this.prisma.clinicContactType.findFirst({ where: { id, clinicId } });
    if (!t) throw new NotFoundException('Tipo de contato não encontrado');
    return t;
  }
}
