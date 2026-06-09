import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService) {}

  // ─── Funnels ──────────────────────────────────────────────────────────────

  async findFunnels(clinicId: string) {
    return this.prisma.funnel.findMany({
      where: { clinicId, active: true },
      include: {
        stages: { orderBy: { order: 'asc' } },
        _count: { select: { leads: true } },
      },
      orderBy: { order: 'asc' },
    });
  }

  async createFunnel(clinicId: string, data: any) {
    const { stages, ...funnelData } = data;
    return this.prisma.funnel.create({
      data: {
        ...funnelData,
        clinicId,
        stages: stages ? { create: stages } : undefined,
      },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
  }

  async updateFunnel(clinicId: string, id: string, data: any) {
    return this.prisma.funnel.update({ where: { id }, data });
  }

  // ─── Leads ────────────────────────────────────────────────────────────────

  async findAll(clinicId: string, query?: any) {
    const where: any = { clinicId };
    if (query?.funnelId) where.funnelId = query.funnelId;
    if (query?.stageId) where.stageId = query.stageId;
    if (query?.status) where.status = query.status;
    if (query?.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.lead.findMany({
      where,
      include: {
        patient: { select: { id: true, name: true } },
        funnel: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true, color: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: [{ stageOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(clinicId: string, id: string) {
    const l = await this.prisma.lead.findFirst({
      where: { id, clinicId },
      include: {
        patient: true,
        funnel: { include: { stages: { orderBy: { order: 'asc' } } } },
        stage: true,
        tasks: { orderBy: { createdAt: 'desc' } },
        messages: { orderBy: { createdAt: 'desc' }, take: 20 },
        activities: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!l) throw new NotFoundException('Lead não encontrado');
    return l;
  }

  async create(clinicId: string, data: any) {
    return this.prisma.lead.create({ data: { ...data, clinicId }, include: { stage: true, funnel: true } });
  }

  async update(clinicId: string, id: string, data: any) {
    await this.findOne(clinicId, id);
    return this.prisma.lead.update({ where: { id }, data, include: { stage: true, funnel: true } });
  }

  async moveStage(clinicId: string, id: string, stageId: string, stageOrder: number) {
    const lead = await this.findOne(clinicId, id);
    const stage = await this.prisma.funnelStage.findUnique({ where: { id: stageId } });

    await this.prisma.leadActivity.create({
      data: { leadId: id, type: 'STAGE_CHANGE', content: `Movido para ${stage?.name}` },
    });

    return this.prisma.lead.update({ where: { id }, data: { stageId, stageOrder } });
  }

  async remove(clinicId: string, id: string) {
    await this.findOne(clinicId, id);
    return this.prisma.lead.delete({ where: { id } });
  }

  async stats(clinicId: string) {
    const [total, quente, morno, frio, ganhos, perdidos] = await Promise.all([
      this.prisma.lead.count({ where: { clinicId } }),
      this.prisma.lead.count({ where: { clinicId, temperature: 'QUENTE' } }),
      this.prisma.lead.count({ where: { clinicId, temperature: 'MORNO' } }),
      this.prisma.lead.count({ where: { clinicId, temperature: 'FRIO' } }),
      this.prisma.lead.count({ where: { clinicId, status: 'GANHO' } }),
      this.prisma.lead.count({ where: { clinicId, status: 'PERDIDO' } }),
    ]);
    const taxaConversao = total > 0 ? Math.round((ganhos / total) * 100) : 0;
    return { total, quente, morno, frio, ganhos, perdidos, taxaConversao };
  }
}
