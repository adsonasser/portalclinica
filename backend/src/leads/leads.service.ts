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

  async deleteFunnel(clinicId: string, id: string) {
    const f = await this.prisma.funnel.findFirst({ where: { id, clinicId } });
    if (!f) throw new NotFoundException('Funil não encontrado');
    return this.prisma.funnel.delete({ where: { id } });
  }

  async createStage(clinicId: string, funnelId: string, data: any) {
    const f = await this.prisma.funnel.findFirst({ where: { id: funnelId, clinicId } });
    if (!f) throw new NotFoundException('Funil não encontrado');
    return this.prisma.funnelStage.create({ data: { ...data, funnelId } });
  }

  async updateStage(clinicId: string, stageId: string, data: any) {
    return this.prisma.funnelStage.update({ where: { id: stageId }, data });
  }

  async deleteStage(clinicId: string, stageId: string) {
    return this.prisma.funnelStage.delete({ where: { id: stageId } });
  }

  // ─── Sources ──────────────────────────────────────────────────────────────

  async findSources(clinicId: string) {
    return this.prisma.leadSource.findMany({
      where: { clinicId, active: true },
      orderBy: { name: 'asc' },
    });
  }

  async createSource(clinicId: string, data: any) {
    return this.prisma.leadSource.create({ data: { ...data, clinicId } });
  }

  async updateSource(clinicId: string, id: string, data: any) {
    return this.prisma.leadSource.update({ where: { id }, data });
  }

  async deleteSource(clinicId: string, id: string) {
    return this.prisma.leadSource.delete({ where: { id } });
  }

  // ─── Loss Reasons ─────────────────────────────────────────────────────────

  async findLossReasons(clinicId: string) {
    return this.prisma.leadLossReason.findMany({
      where: { clinicId, active: true },
      orderBy: { name: 'asc' },
    });
  }

  async createLossReason(clinicId: string, data: any) {
    return this.prisma.leadLossReason.create({ data: { ...data, clinicId } });
  }

  async updateLossReason(clinicId: string, id: string, data: any) {
    return this.prisma.leadLossReason.update({ where: { id }, data });
  }

  async deleteLossReason(clinicId: string, id: string) {
    return this.prisma.leadLossReason.delete({ where: { id } });
  }

  // ─── History ──────────────────────────────────────────────────────────────

  private async addHistory(leadId: string, clinicId: string, event: string, content: string, userId?: string) {
    return this.prisma.leadHistory.create({ data: { leadId, clinicId, event, content, userId } });
  }

  async getHistory(clinicId: string, leadId: string) {
    return this.prisma.leadHistory.findMany({
      where: { leadId, clinicId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Activities ───────────────────────────────────────────────────────────

  async addActivity(clinicId: string, leadId: string, data: any) {
    const lead = await this.findOne(clinicId, leadId);
    const activity = await this.prisma.leadActivity.create({
      data: { leadId, type: data.type, content: data.content },
    });
    await this.addHistory(leadId, clinicId, 'ACTIVITY_ADDED', data.content, data.userId);
    if (data.nextActivity || data.nextActivityAt) {
      await this.prisma.lead.update({
        where: { id: leadId },
        data: {
          nextActivity: data.nextActivity ?? lead.nextActivity,
          nextActivityAt: data.nextActivityAt ? new Date(data.nextActivityAt) : lead.nextActivityAt,
        },
      });
    }
    return activity;
  }

  // ─── Leads ────────────────────────────────────────────────────────────────

  async findAll(clinicId: string, query?: any) {
    const where: any = { clinicId };
    if (query?.funnelId) where.funnelId = query.funnelId;
    if (query?.stageId) where.stageId = query.stageId;
    if (query?.status) where.status = query.status;
    if (query?.assignedUserId) where.assignedUserId = query.assignedUserId;
    if (query?.leadSourceId) where.leadSourceId = query.leadSourceId;
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
        stage: { select: { id: true, name: true, color: true, isWon: true, isLost: true } },
        assignedUser: { select: { id: true, name: true } },
        leadSource: { select: { id: true, name: true } },
        _count: { select: { tasks: true, activities: true } },
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
        assignedUser: { select: { id: true, name: true } },
        leadSource: { select: { id: true, name: true } },
        tasks: { orderBy: { createdAt: 'desc' } },
        messages: { orderBy: { createdAt: 'desc' }, take: 20 },
        activities: { orderBy: { createdAt: 'desc' } },
        history: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!l) throw new NotFoundException('Lead não encontrado');
    return l;
  }

  async create(clinicId: string, data: any) {
    // Strip fields that don't exist on Lead model
    const { nextActivityAt, assignedUserName, ...rest } = data;
    const lead = await this.prisma.lead.create({
      data: {
        ...rest,
        clinicId,
        nextActivityAt: nextActivityAt ? new Date(nextActivityAt) : undefined,
      },
      include: { stage: true, funnel: true, assignedUser: { select: { id: true, name: true } } },
    });
    await this.addHistory(lead.id, clinicId, 'CREATED', `Lead criado: ${lead.name}`);
    return lead;
  }

  async update(clinicId: string, id: string, data: any) {
    const old = await this.findOne(clinicId, id);
    const { nextActivityAt, ...rest } = data;
    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        ...rest,
        nextActivityAt: nextActivityAt ? new Date(nextActivityAt) : undefined,
      },
      include: { stage: true, funnel: true },
    });
    if (data.status && data.status !== old.status) {
      await this.addHistory(id, clinicId, 'STATUS_CHANGED', `Status alterado: ${old.status} → ${data.status}`);
    }
    if (data.assignedUserId && data.assignedUserId !== old.assignedUserId) {
      await this.addHistory(id, clinicId, 'ASSIGNED', `Responsável alterado`);
    }
    if (data.notes && data.notes !== old.notes) {
      await this.addHistory(id, clinicId, 'NOTE_ADDED', `Observação atualizada`);
    }
    if (data.funnelId && data.funnelId !== old.funnelId) {
      await this.addHistory(id, clinicId, 'FUNNEL_CHANGED', `Funil alterado`);
    }
    if (data.stageId && data.stageId !== old.stageId && !data.funnelId) {
      const stage = await this.prisma.funnelStage.findUnique({ where: { id: data.stageId } });
      await this.addHistory(id, clinicId, 'STAGE_CHANGED', `Movido para etapa: ${stage?.name ?? data.stageId}`);
    }
    return updated;
  }

  async markWon(clinicId: string, leadId: string) {
    await this.findOne(clinicId, leadId);
    await this.addHistory(leadId, clinicId, 'STATUS_CHANGED', 'Lead marcado como ganho');
    return this.prisma.lead.update({ where: { id: leadId }, data: { status: 'GANHO', wonAt: new Date() } });
  }

  async moveStage(clinicId: string, id: string, stageId: string, stageOrder: number) {
    const lead = await this.findOne(clinicId, id);
    const stage = await this.prisma.funnelStage.findUnique({ where: { id: stageId } });
    if (!stage) throw new NotFoundException('Etapa não encontrada');

    let newStatus = lead.status;
    if (stage.isWon) newStatus = 'GANHO' as any;
    if (stage.isLost) newStatus = 'PERDIDO' as any;

    await this.addHistory(id, clinicId, 'STAGE_CHANGED', `Movido para etapa: ${stage.name}`);

    return this.prisma.lead.update({
      where: { id },
      data: { stageId, stageOrder, status: newStatus, wonAt: stage.isWon ? new Date() : undefined },
    });
  }

  async convertToPatient(clinicId: string, leadId: string) {
    const lead = await this.findOne(clinicId, leadId);
    if (lead.patientId) return { message: 'Lead já convertido', patientId: lead.patientId };

    const patient = await this.prisma.patient.create({
      data: {
        clinicId,
        name: lead.name,
        email: lead.email ?? undefined,
        phone: lead.phone ?? undefined,
        source: lead.source ?? undefined,
        status: 'NOVO',
      },
    });

    await this.prisma.lead.update({ where: { id: leadId }, data: { patientId: patient.id, status: 'GANHO', wonAt: new Date() } });
    await this.addHistory(leadId, clinicId, 'CONVERTED', `Convertido em contato: ${patient.name}`);

    return { patient, message: 'Lead convertido com sucesso' };
  }

  async markLost(clinicId: string, leadId: string, lostReason: string) {
    await this.findOne(clinicId, leadId);
    await this.addHistory(leadId, clinicId, 'LOST', `Perdido. Motivo: ${lostReason}`);
    return this.prisma.lead.update({
      where: { id: leadId },
      data: { status: 'PERDIDO', lostReason, lostAt: new Date() },
    });
  }

  async importLeads(clinicId: string, leads: any[]) {
    const created: any[] = [];
    const errors: any[] = [];
    for (const l of leads) {
      try {
        const lead = await this.prisma.lead.create({
          data: { clinicId, name: l.name, phone: l.phone, email: l.email, source: l.source, funnelId: l.funnelId, stageId: l.stageId, assignedUserId: l.assignedUserId },
        });
        created.push(lead);
      } catch (e: any) {
        errors.push({ name: l.name, error: e.message });
      }
    }
    return { created: created.length, errors };
  }

  async remove(clinicId: string, id: string) {
    await this.findOne(clinicId, id);
    return this.prisma.lead.delete({ where: { id } });
  }

  async stats(clinicId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total, novo, emNegociacao, agendado, ganhoMes, perdidoMes, valorAgg] = await Promise.all([
      this.prisma.lead.count({ where: { clinicId } }),
      this.prisma.lead.count({ where: { clinicId, status: 'NOVO' } }),
      this.prisma.lead.count({ where: { clinicId, status: { in: ['CONTATADO', 'QUALIFICADO', 'PROPOSTA', 'NEGOCIACAO'] } } }),
      this.prisma.lead.count({ where: { clinicId, status: 'QUALIFICADO', nextActivityAt: { gte: now } } }),
      this.prisma.lead.count({ where: { clinicId, status: 'GANHO', wonAt: { gte: startOfMonth } } }),
      this.prisma.lead.count({ where: { clinicId, status: 'PERDIDO', lostAt: { gte: startOfMonth } } }),
      this.prisma.lead.aggregate({ where: { clinicId, status: { in: ['NOVO', 'CONTATADO', 'QUALIFICADO', 'PROPOSTA', 'NEGOCIACAO'] } }, _sum: { value: true } }),
    ]);

    return {
      total,
      novo,
      emNegociacao,
      agendado,
      ganhoMes,
      perdidoMes,
      valorEmNegociacao: valorAgg._sum.value ?? 0,
    };
  }
}
