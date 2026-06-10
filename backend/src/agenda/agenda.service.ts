import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const APPT_INCLUDE = {
  patient: { select: { id: true, name: true, phone: true, avatarUrl: true } },
  plan: { select: { id: true, name: true, color: true, duration: true } },
  appointmentType: { select: { id: true, name: true, color: true, defaultDurationMinutes: true } },
  professional: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
  sale: { select: { id: true, status: true, total: true, paidAmount: true } },
} as const;

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
      include: APPT_INCLUDE,
      orderBy: { startTime: 'asc' },
    });
  }

  async findOne(clinicId: string, id: string) {
    const a = await this.prisma.appointment.findFirst({
      where: { id, clinicId },
      include: {
        patient: true,
        plan: true,
        appointmentType: true,
        professional: { include: { user: true } },
        sale: { select: { id: true, status: true, total: true, paidAmount: true } },
      },
    });
    if (!a) throw new NotFoundException('Agendamento não encontrado');
    return a;
  }

  async create(clinicId: string, data: any) {
    const { professionalId, room, startTime, endTime, reservation, ...rest } = data;
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (professionalId) {
      const conflict = await this.prisma.appointment.findFirst({
        where: {
          clinicId, professionalId,
          status: { notIn: ['CANCELADO', 'FALTOU'] },
          AND: [{ startTime: { lt: end } }, { endTime: { gt: start } }],
        },
      });
      if (conflict) throw new ConflictException('Este profissional já possui atendimento neste horário.');
    }

    if (room) {
      const conflict = await this.prisma.appointment.findFirst({
        where: {
          clinicId, room,
          status: { notIn: ['CANCELADO', 'FALTOU'] },
          AND: [{ startTime: { lt: end } }, { endTime: { gt: start } }],
        },
      });
      if (conflict) throw new ConflictException('Esta sala já está ocupada neste horário.');
    }

    if (!reservation) {
      return this.prisma.appointment.create({
        data: { ...rest, professionalId, room, startTime: start, endTime: end, clinicId },
        include: APPT_INCLUDE,
      });
    }

    return this._createWithReservation(clinicId, {
      ...rest, professionalId, room, startTime: start, endTime: end,
    }, reservation);
  }

  private async _resolveCategoryFromPlan(planId?: string | null): Promise<string | null> {
    if (!planId) return null;
    const plan = await this.prisma.plan.findUnique({ where: { id: planId }, select: { defaultCategoryId: true } });
    return plan?.defaultCategoryId ?? null;
  }

  private async _createWithReservation(clinicId: string, apptData: any, reservation: any) {
    const {
      planId, planName, totalAmount, reservationAmount = 0,
      paymentMethodId, paymentDate, notes,
    } = reservation;

    const paid = Number(reservationAmount) || 0;
    const total = Number(totalAmount) || 0;
    const saleStatus = paid >= total ? 'PAID' : paid > 0 ? 'PARTIAL' : 'PENDING';
    const categoryId = await this._resolveCategoryFromPlan(planId);

    return this.prisma.$transaction(async (tx) => {
      // 1. Create sale
      const sale = await tx.sale.create({
        data: {
          clinicId,
          patientId: apptData.patientId || null,
          paymentMethodId: paymentMethodId || null,
          status: saleStatus,
          saleType: 'RESERVA',
          total,
          paidAmount: paid,
          notes: notes || null,
          items: {
            create: [{
              planId: planId || null,
              categoryId: categoryId || null,
              name: planName || 'Reserva de horário',
              quantity: 1,
              unitPrice: total,
              discount: 0,
              total,
            }],
          },
        },
      });

      // 2. Create financial transaction if something was paid
      if (paid > 0) {
        await tx.financialTransaction.create({
          data: {
            clinicId,
            saleId: sale.id,
            categoryId,
            paymentMethodId: paymentMethodId || null,
            type: 'INCOME',
            status: 'PAID',
            description: planName ? `Reserva — ${planName}` : 'Reserva de horário',
            amount: paid,
            paidAt: paymentDate ? new Date(paymentDate) : new Date(),
            dueDate: paymentDate ? new Date(paymentDate) : new Date(),
          },
        });
      }

      // 3. If there's a remaining balance, create a PENDING receivable
      if (total - paid > 0) {
        await tx.financialTransaction.create({
          data: {
            clinicId,
            saleId: sale.id,
            categoryId,
            paymentMethodId: null,
            type: 'INCOME',
            status: 'PENDING',
            description: planName ? `Saldo — ${planName}` : 'Saldo de reserva',
            amount: total - paid,
            dueDate: null,
          },
        });
      }

      // 4. Create appointment linked to sale
      const appt = await tx.appointment.create({
        data: { ...apptData, clinicId, saleId: sale.id },
        include: APPT_INCLUDE,
      });

      return appt;
    });
  }

  async update(clinicId: string, id: string, data: any) {
    await this.findOne(clinicId, id);
    return this.prisma.appointment.update({
      where: { id },
      data,
      include: APPT_INCLUDE,
    });
  }

  async remove(clinicId: string, id: string) {
    await this.findOne(clinicId, id);
    return this.prisma.appointment.delete({ where: { id } });
  }

  async createReservation(clinicId: string, appointmentId: string, reservation: any) {
    const appt = await this.findOne(clinicId, appointmentId);
    if (appt.saleId) throw new BadRequestException('Este agendamento já possui uma reserva financeira.');

    const {
      planId, planName, totalAmount, reservationAmount = 0,
      paymentMethodId, paymentDate, notes,
    } = reservation;

    const paid = Number(reservationAmount) || 0;
    const total = Number(totalAmount) || 0;
    const saleStatus = paid >= total ? 'PAID' : paid > 0 ? 'PARTIAL' : 'PENDING';
    const categoryId = await this._resolveCategoryFromPlan(planId);

    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          clinicId,
          patientId: appt.patientId || null,
          paymentMethodId: paymentMethodId || null,
          status: saleStatus,
          saleType: 'RESERVA',
          total,
          paidAmount: paid,
          notes: notes || null,
          items: {
            create: [{
              planId: planId || null,
              categoryId: categoryId || null,
              name: planName || 'Reserva de horário',
              quantity: 1,
              unitPrice: total,
              discount: 0,
              total,
            }],
          },
        },
      });

      if (paid > 0) {
        await tx.financialTransaction.create({
          data: {
            clinicId,
            saleId: sale.id,
            categoryId,
            paymentMethodId: paymentMethodId || null,
            type: 'INCOME',
            status: 'PAID',
            description: planName ? `Reserva — ${planName}` : 'Reserva de horário',
            amount: paid,
            paidAt: paymentDate ? new Date(paymentDate) : new Date(),
            dueDate: paymentDate ? new Date(paymentDate) : new Date(),
          },
        });
      }

      if (total - paid > 0) {
        await tx.financialTransaction.create({
          data: {
            clinicId,
            saleId: sale.id,
            categoryId,
            paymentMethodId: null,
            type: 'INCOME',
            status: 'PENDING',
            description: planName ? `Saldo — ${planName}` : 'Saldo de reserva',
            amount: total - paid,
            dueDate: null,
          },
        });
      }

      const updated = await tx.appointment.update({
        where: { id: appointmentId },
        data: { saleId: sale.id },
        include: APPT_INCLUDE,
      });

      return updated;
    });
  }

  async getSaleForAppointment(clinicId: string, appointmentId: string) {
    const appt = await this.findOne(clinicId, appointmentId);
    if (!appt.saleId) return null;

    return this.prisma.sale.findFirst({
      where: { id: appt.saleId, clinicId },
      include: {
        items: { include: { plan: { select: { id: true, name: true } } } },
        transactions: {
          orderBy: { createdAt: 'asc' },
          include: {
            category: { select: { id: true, name: true } },
            paymentMethod: { select: { id: true, name: true } },
          },
        },
      },
    });
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
