import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  async findAll(clinicId: string, query?: any) {
    const where: any = { clinicId };
    if (query?.patientId) where.patientId = query.patientId;
    if (query?.channel) where.channel = query.channel;
    if (query?.status) where.status = query.status;
    return this.prisma.message.findMany({ where, include: { patient: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } });
  }

  async create(clinicId: string, userId: string, data: any) {
    return this.prisma.message.create({ data: { ...data, clinicId, userId, sentAt: new Date() } });
  }

  async findTemplates(clinicId: string) {
    return this.prisma.template.findMany({ where: { clinicId, active: true }, orderBy: { name: 'asc' } });
  }

  async createTemplate(clinicId: string, data: any) {
    return this.prisma.template.create({ data: { ...data, clinicId } });
  }

  async updateTemplate(id: string, data: any) {
    return this.prisma.template.update({ where: { id }, data });
  }

  async deleteTemplate(id: string) {
    return this.prisma.template.delete({ where: { id } });
  }
}
