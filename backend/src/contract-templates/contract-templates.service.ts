import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContractTemplatesService {
  constructor(private prisma: PrismaService) {}

  async findAll(clinicId: string) {
    return this.prisma.contractTemplate.findMany({
      where: { clinicId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(clinicId: string, id: string) {
    const t = await this.prisma.contractTemplate.findFirst({ where: { id, clinicId } });
    if (!t) throw new NotFoundException('Modelo de contrato não encontrado');
    return t;
  }

  async create(clinicId: string, data: any) {
    const { name, description, content, variables, isActive } = data;
    return this.prisma.contractTemplate.create({
      data: { clinicId, name, description, content, variables: variables ?? [], isActive: isActive ?? true },
    });
  }

  async update(clinicId: string, id: string, data: any) {
    await this.findOne(clinicId, id);
    const { name, description, content, variables, isActive } = data;
    return this.prisma.contractTemplate.update({
      where: { id },
      data: { name, description, content, variables, isActive },
    });
  }

  async remove(clinicId: string, id: string) {
    await this.findOne(clinicId, id);
    return this.prisma.contractTemplate.delete({ where: { id } });
  }
}
