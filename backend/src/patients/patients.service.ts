import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  async findAll(clinicId: string, query?: { search?: string; status?: string }) {
    const where: any = { clinicId };
    if (query?.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
        { cpf: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query?.status) where.status = query.status;

    return this.prisma.patient.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { appointments: true, sessions: true } },
      },
    });
  }

  async findOne(clinicId: string, id: string) {
    const p = await this.prisma.patient.findFirst({
      where: { id, clinicId },
      include: {
        appointments: { orderBy: { startTime: 'desc' }, take: 10, include: { plan: true, professional: { include: { user: true } } } },
        sessions: { orderBy: { sessionNumber: 'asc' }, take: 50, include: { plan: true, sale: { select: { id: true, total: true, saleType: true, status: true, paidAmount: true } } } },
        evolutionNotes: { orderBy: { date: 'desc' } },
        prescriptions: { orderBy: { date: 'desc' } },
        anamneses: { orderBy: { createdAt: 'desc' }, take: 1 },
        patientNotes: { orderBy: { createdAt: 'desc' } },
        sales: { orderBy: { createdAt: 'desc' }, take: 5 },
        documents: { orderBy: { createdAt: 'desc' }, include: { template: true } },
      },
    });
    if (!p) throw new NotFoundException('Paciente não encontrado');
    return p;
  }

  async create(clinicId: string, data: any) {
    return this.prisma.patient.create({ data: { ...data, clinicId } });
  }

  async update(clinicId: string, id: string, data: any) {
    await this.findOneSimple(clinicId, id);
    return this.prisma.patient.update({ where: { id }, data });
  }

  async remove(clinicId: string, id: string) {
    await this.findOneSimple(clinicId, id);
    return this.prisma.patient.delete({ where: { id } });
  }

  async stats(clinicId: string) {
    const [total, ativos, novos, emRisco] = await Promise.all([
      this.prisma.patient.count({ where: { clinicId } }),
      this.prisma.patient.count({ where: { clinicId, status: 'EM_TRATAMENTO' } }),
      this.prisma.patient.count({ where: { clinicId, status: 'NOVO', createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
      this.prisma.patient.count({ where: { clinicId, status: 'EM_RISCO' } }),
    ]);
    return { total, ativos, novos, emRisco };
  }

  private async findOneSimple(clinicId: string, id: string) {
    const p = await this.prisma.patient.findFirst({ where: { id, clinicId } });
    if (!p) throw new NotFoundException('Paciente não encontrado');
    return p;
  }
}
