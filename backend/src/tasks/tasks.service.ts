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

    return this.prisma.task.findMany({
      where,
      include: { assignee: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(clinicId: string, data: any) {
    return this.prisma.task.create({ data: { ...data, clinicId } });
  }

  async update(clinicId: string, id: string, data: any) {
    const t = await this.prisma.task.findFirst({ where: { id, clinicId } });
    if (!t) throw new NotFoundException('Tarefa não encontrada');
    if (data.status === 'CONCLUIDA') data.completedAt = new Date();
    return this.prisma.task.update({ where: { id }, data });
  }

  async remove(clinicId: string, id: string) {
    const t = await this.prisma.task.findFirst({ where: { id, clinicId } });
    if (!t) throw new NotFoundException('Tarefa não encontrada');
    return this.prisma.task.delete({ where: { id } });
  }
}
