import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AgendaService {
  constructor(private prisma: PrismaService) {}

  async findAll(clinicId: string, query?: { start?: string; end?: string; professionalId?: string }) {
    const where: any = { clinicId };
    if (query?.start && query?.end) {
      where.startTime = { gte: new Date(query.start), lte: new Date(query.end) };
    }
    if (query?.professionalId) where.professionalId = query.professionalId;

    return this.prisma.appointment.findMany({
      where,
      include: {
        patient: { select: { id: true, name: true, phone: true, avatarUrl: true } },
        plan: { select: { id: true, name: true, color: true, duration: true } },
        professional: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
      },
      orderBy: { startTime: 'asc' },
    });
  }

  async findOne(clinicId: string, id: string) {
    const a = await this.prisma.appointment.findFirst({
      where: { id, clinicId },
      include: {
        patient: true,
        plan: true,
        professional: { include: { user: true } },
      },
    });
    if (!a) throw new NotFoundException('Agendamento não encontrado');
    return a;
  }

  async create(clinicId: string, data: any) {
    return this.prisma.appointment.create({
      data: { ...data, clinicId },
      include: {
        patient: { select: { id: true, name: true, phone: true } },
        plan: { select: { id: true, name: true, color: true } },
        professional: { include: { user: { select: { id: true, name: true } } } },
      },
    });
  }

  async update(clinicId: string, id: string, data: any) {
    await this.findOne(clinicId, id);
    return this.prisma.appointment.update({
      where: { id },
      data,
      include: {
        patient: { select: { id: true, name: true, phone: true } },
        plan: { select: { id: true, name: true, color: true } },
        professional: { include: { user: { select: { id: true, name: true } } } },
      },
    });
  }

  async remove(clinicId: string, id: string) {
    await this.findOne(clinicId, id);
    return this.prisma.appointment.delete({ where: { id } });
  }

  async findProfessionals(clinicId: string) {
    return this.prisma.professional.findMany({
      where: { clinicId, active: true, showInAgenda: true, user: { active: true } },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { user: { name: 'asc' } },
    });
  }

  async stats(clinicId: string, date: string) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const [total, confirmados, cancelados, faltou] = await Promise.all([
      this.prisma.appointment.count({ where: { clinicId, startTime: { gte: start, lte: end } } }),
      this.prisma.appointment.count({ where: { clinicId, startTime: { gte: start, lte: end }, status: 'CONFIRMADO' } }),
      this.prisma.appointment.count({ where: { clinicId, startTime: { gte: start, lte: end }, status: 'CANCELADO' } }),
      this.prisma.appointment.count({ where: { clinicId, startTime: { gte: start, lte: end }, status: 'FALTOU' } }),
    ]);

    return { total, confirmados, cancelados, faltou };
  }
}
