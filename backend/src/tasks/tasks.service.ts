import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async findAll(clinicId: string, query?: any) {
    const where: any = { clinicId };
    if (query?.status) where.status = query.status;
    if (query?.priority) where.priority = query.priority;
    if (query?.assigneeId) where.assigneeId = query.assigneeId;
    if (query?.leadId) where.leadId = query.leadId;
    if (query?.patientId) where.patientId = query.patientId;
    if (query?.type) where.type = query.type;

    return this.prisma.task.findMany({
      where,
      include: {
        assignee: { select: { id: true, name: true, avatarUrl: true } },
        lead: { select: { id: true, name: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async getStats(clinicId: string) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);

    const [today, overdue, upcoming, completedToday] = await Promise.all([
      this.prisma.task.count({
        where: { clinicId, status: { notIn: ['CONCLUIDA', 'CANCELADA'] }, dueDate: { gte: todayStart, lt: todayEnd } },
      }),
      this.prisma.task.count({
        where: { clinicId, status: { notIn: ['CONCLUIDA', 'CANCELADA'] }, dueDate: { lt: todayStart } },
      }),
      this.prisma.task.count({
        where: { clinicId, status: { notIn: ['CONCLUIDA', 'CANCELADA'] }, dueDate: { gte: todayEnd } },
      }),
      this.prisma.task.count({
        where: { clinicId, status: 'CONCLUIDA', completedAt: { gte: todayStart, lt: todayEnd } },
      }),
    ]);

    return { today, overdue, upcoming, completedToday };
  }

  async create(clinicId: string, data: any) {
    const { assignedUserName, assignedUserId, dueDate, ...rest } = data;
    return this.prisma.task.create({
      data: {
        ...rest,
        clinicId,
        ...(assignedUserId ? { assigneeId: assignedUserId } : {}),
        ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
      },
    });
  }

  async update(clinicId: string, id: string, data: any) {
    const t = await this.prisma.task.findFirst({ where: { id, clinicId } });
    if (!t) throw new NotFoundException('Tarefa não encontrada');
    const { assignedUserName, assignedUserId, dueDate, ...rest } = data;
    const updateData: any = { ...rest };
    if (assignedUserId !== undefined) updateData.assigneeId = assignedUserId;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
    if (updateData.status === 'CONCLUIDA' && !t.completedAt) updateData.completedAt = new Date();
    return this.prisma.task.update({ where: { id }, data: updateData });
  }

  async remove(clinicId: string, id: string) {
    const t = await this.prisma.task.findFirst({ where: { id, clinicId } });
    if (!t) throw new NotFoundException('Tarefa não encontrada');
    return this.prisma.task.delete({ where: { id } });
  }

  // Post-its
  async findPostIts(clinicId: string) {
    return this.prisma.postIt.findMany({
      where: { clinicId, archived: false },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createPostIt(clinicId: string, data: any) {
    return this.prisma.postIt.create({ data: { ...data, clinicId } });
  }

  async updatePostIt(clinicId: string, id: string, data: any) {
    const p = await this.prisma.postIt.findFirst({ where: { id, clinicId } });
    if (!p) throw new NotFoundException('Post-it não encontrado');
    return this.prisma.postIt.update({ where: { id }, data });
  }

  async deletePostIt(clinicId: string, id: string) {
    const p = await this.prisma.postIt.findFirst({ where: { id, clinicId } });
    if (!p) throw new NotFoundException('Post-it não encontrado');
    return this.prisma.postIt.delete({ where: { id } });
  }
}
