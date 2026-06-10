import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Session statuses that mean the appointment slot is occupied
const ACTIVE_STATUSES  = new Set(['AGENDADA', 'CONFIRMADA', 'EM_ATENDIMENTO']);
// Mapping from session status to appointment status
const APPT_STATUS: Record<string, string> = {
  AGENDADA:       'AGUARDANDO',
  CONFIRMADA:     'CONFIRMADO',
  EM_ATENDIMENTO: 'CONFIRMADO',
  CANCELADA:      'CANCELADO',
  FALTOU:         'FALTOU',
};

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
        sale: { select: { createdAt: true } },
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
    const session = await this.prisma.session.findFirst({
      where: { id, clinicId },
      include: { plan: { select: { duracaoPadrao: true, duration: true } } },
    });
    if (!session) throw new NotFoundException('Sessão não encontrada');

    // Apply the session update first
    const updated = await this.prisma.session.update({ where: { id }, data });

    // Sync with appointments table whenever status or date changes
    const newStatus: string = data.sessionStatus ?? session.sessionStatus;
    const newDate: Date     = data.date ? new Date(data.date) : session.date;
    const profId: string | null = data.professionalId !== undefined ? data.professionalId : session.professionalId;

    const apptStatus = APPT_STATUS[newStatus];

    if (apptStatus) {
      const durMins = (session.plan as any)?.duracaoPadrao ?? (session.plan as any)?.duration ?? 60;
      const endTime = new Date(newDate.getTime() + durMins * 60 * 1000);

      if (session.appointmentId) {
        // Update existing appointment
        await this.prisma.appointment.update({
          where: { id: session.appointmentId },
          data: {
            startTime:     newDate,
            endTime,
            status:        apptStatus as any,
            professionalId: profId ?? undefined,
            notes:         data.observations ?? undefined,
          },
        });
      } else if (ACTIVE_STATUSES.has(newStatus)) {
        // Create appointment and link it to the session
        const appt = await this.prisma.appointment.create({
          data: {
            clinicId,
            patientId:     session.patientId,
            planId:        session.planId ?? undefined,
            professionalId: profId ?? undefined,
            startTime:     newDate,
            endTime,
            status:        apptStatus as any,
            notes:         data.observations ?? undefined,
          },
        });
        await this.prisma.session.update({
          where: { id },
          data: { appointmentId: appt.id },
        });
      }
    }

    return updated;
  }

  async remove(clinicId: string, id: string) {
    const session = await this.prisma.session.findFirst({ where: { id, clinicId } });
    if (!session) throw new NotFoundException('Sessão não encontrada');

    // Remove the linked appointment if it exists
    if (session.appointmentId) {
      await this.prisma.appointment.deleteMany({ where: { id: session.appointmentId } });
    }

    return this.prisma.session.delete({ where: { id } });
  }
}
