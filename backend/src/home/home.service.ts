import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HomeService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(clinicId: string, userId: string) {
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay   = new Date(now); endOfDay.setHours(23, 59, 59, 999);

    const [
      clinic,
      tasksTodayAll,
      tasksOverdue,
      agendaTodayAll,
      openLeads,
      pinnedNotes,
      agendaItems,
      myTasksRaw,
      patientsWithBirthday,
      quickNotes,
    ] = await Promise.all([
      this.prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true, name: true, observacoes: true, cidade: true, estado: true } }),

      this.prisma.task.findMany({
        where: { clinicId, dueDate: { gte: startOfDay, lte: endOfDay } },
        select: { status: true },
      }),

      this.prisma.task.count({
        where: { clinicId, dueDate: { lt: startOfDay }, status: { not: 'CONCLUIDA' } },
      }),

      this.prisma.appointment.findMany({
        where: { clinicId, startTime: { gte: startOfDay, lte: endOfDay } },
        select: { status: true },
      }),

      this.prisma.lead.count({
        where: { clinicId, status: { notIn: ['GANHO', 'PERDIDO'] as any } },
      }),

      this.prisma.postIt.count({
        where: { clinicId, pinned: true, archived: false },
      }),

      this.prisma.appointment.findMany({
        where: { clinicId, startTime: { gte: startOfDay, lte: endOfDay } },
        orderBy: { startTime: 'asc' },
        take: 6,
        select: {
          id: true, startTime: true, endTime: true, status: true,
          patient: { select: { id: true, name: true } },
          appointmentType: { select: { name: true } },
          professional: { select: { user: { select: { name: true } } } },
        },
      }),

      this.prisma.task.findMany({
        where: {
          clinicId,
          status: { not: 'CONCLUIDA' },
          OR: [
            { dueDate: { gte: startOfDay, lte: endOfDay } },
            { dueDate: null },
          ],
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        take: 5,
        select: {
          id: true, title: true, description: true, notes: true,
          type: true, priority: true, status: true, dueDate: true,
          lead: { select: { id: true, name: true } },
        },
      }),

      this.prisma.patient.findMany({
        where: { clinicId, birthDate: { not: null } },
        select: { id: true, name: true, birthDate: true, phone: true },
      }),

      this.prisma.postIt.findMany({
        where: { clinicId, archived: false },
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        take: 10,
        select: { id: true, title: true, content: true, color: true, pinned: true, createdAt: true, userId: true },
      }),
    ]);

    // ── Cards ────────────────────────────────────────────────────────────────────
    const tasksToday = {
      total: tasksTodayAll.length,
      completed: tasksTodayAll.filter(t => t.status === 'CONCLUIDA').length,
    };
    const agendaToday = {
      total: agendaTodayAll.length,
      confirmed: agendaTodayAll.filter(a => a.status === 'CONFIRMADO').length,
    };

    // ── Agenda ───────────────────────────────────────────────────────────────────
    const agenda = agendaItems.map(a => ({
      id: a.id,
      startTime: (a.startTime as Date).toISOString(),
      endTime: (a.endTime as Date).toISOString(),
      status: a.status,
      patient: a.patient ? { id: (a.patient as any).id, name: (a.patient as any).name } : { id: '', name: 'Paciente' },
      appointmentType: a.appointmentType ? { name: (a.appointmentType as any).name } : null,
      professional: a.professional ? { name: (a.professional as any).user?.name ?? null } : null,
    }));

    // ── My Tasks ─────────────────────────────────────────────────────────────────
    const myTasks = myTasksRaw.map(t => ({
      id: t.id,
      title: t.title,
      description: t.description ?? null,
      notes: (t as any).notes ?? null,
      type: t.type,
      priority: t.priority,
      status: t.status,
      dueDate: t.dueDate ? (t.dueDate as Date).toISOString() : null,
      lead: t.lead ? { id: (t.lead as any).id, name: (t.lead as any).name } : null,
    }));

    // ── Birthdays ────────────────────────────────────────────────────────────────
    const birthdays: any[] = [];
    for (const p of patientsWithBirthday) {
      if (!p.birthDate) continue;
      const bd = p.birthDate as Date;
      const thisYear = now.getFullYear();

      let next = new Date(thisYear, bd.getMonth(), bd.getDate());
      if (next < startOfDay) next = new Date(thisYear + 1, bd.getMonth(), bd.getDate());

      const diff = Math.round((next.getTime() - startOfDay.getTime()) / (1000 * 60 * 60 * 24));
      if (diff < 0 || diff > 7) continue;

      const birthdayYear = next.getFullYear();
      const age = birthdayYear - bd.getFullYear();

      birthdays.push({
        id: p.id,
        name: p.name,
        birthDate: bd.toISOString(),
        phone: p.phone ?? null,
        type: 'patient' as const,
        daysUntil: diff,
        age,
      });
    }
    birthdays.sort((a, b) => a.daysUntil - b.daysUntil);

    return {
      clinic: {
        id: clinic?.id ?? clinicId,
        name: clinic?.name ?? 'Minha Clínica',
        subtitle: clinic?.observacoes ?? null,
        city: clinic?.cidade ?? null,
        estado: clinic?.estado ?? null,
      },
      cards: {
        tasksToday,
        tasksOverdue: { total: tasksOverdue },
        agendaToday,
        openLeads: { total: openLeads },
        pinnedNotes: { total: pinnedNotes },
      },
      agenda,
      myTasks,
      birthdays,
      quickNotes: quickNotes.map(n => ({
        id: n.id,
        title: n.title ?? null,
        content: n.content,
        color: n.color,
        pinned: n.pinned,
        createdAt: (n.createdAt as Date).toISOString(),
        userId: n.userId ?? null,
      })),
    };
  }
}
