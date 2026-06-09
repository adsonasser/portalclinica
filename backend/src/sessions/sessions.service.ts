import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SessionsService {
  constructor(private prisma: PrismaService) {}

  async findAll(clinicId: string, query?: any) {
    const where: any = { clinicId };
    if (query?.patientId) where.patientId = query.patientId;
    if (query?.planId) where.planId = query.planId;

    return this.prisma.session.findMany({
      where,
      include: {
        patient: { select: { id: true, name: true, phone: true } },
        plan: { select: { id: true, name: true, sessionsTotal: true, duracaoPadrao: true, profissionalPadrao: true, salaPadrao: true } },
        professional: { include: { user: { select: { id: true, name: true } } } },
      },
      orderBy: { date: 'desc' },
    });
  }

  async create(clinicId: string, data: any) {
    return this.prisma.session.create({
      data: { ...data, clinicId },
      include: { patient: { select: { id: true, name: true, phone: true } }, plan: { select: { id: true, name: true, sessionsTotal: true } }, professional: { include: { user: { select: { id: true, name: true } } } } },
    });
  }

  async update(clinicId: string, id: string, data: any) {
    const s = await this.prisma.session.findFirst({ where: { id, clinicId } });
    if (!s) throw new NotFoundException('Sessão não encontrada');
    return this.prisma.session.update({ where: { id }, data });
  }

  async remove(clinicId: string, id: string) {
    const s = await this.prisma.session.findFirst({ where: { id, clinicId } });
    if (!s) throw new NotFoundException('Sessão não encontrada');
    return this.prisma.session.delete({ where: { id } });
  }
}
