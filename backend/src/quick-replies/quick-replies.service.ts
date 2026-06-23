import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QuickRepliesService {
  constructor(private prisma: PrismaService) {}

  findAll(clinicId: string, onlyActive = false) {
    return this.prisma.quickReply.findMany({
      where: { clinicId, ...(onlyActive ? { isActive: true } : {}) },
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
    });
  }

  async create(clinicId: string, userId: string, dto: any) {
    return this.prisma.quickReply.create({
      data: {
        clinicId,
        title: dto.title,
        shortcut: dto.shortcut || null,
        content: dto.content,
        category: dto.category || null,
        isActive: dto.isActive ?? true,
        createdByUserId: userId,
      },
    });
  }

  async update(clinicId: string, id: string, dto: any) {
    const qr = await this.prisma.quickReply.findFirst({ where: { id, clinicId } });
    if (!qr) throw new NotFoundException('Resposta rápida não encontrada');
    return this.prisma.quickReply.update({
      where: { id },
      data: {
        title: dto.title ?? qr.title,
        shortcut: dto.shortcut !== undefined ? (dto.shortcut || null) : qr.shortcut,
        content: dto.content ?? qr.content,
        category: dto.category !== undefined ? (dto.category || null) : qr.category,
        isActive: dto.isActive ?? qr.isActive,
      },
    });
  }

  async remove(clinicId: string, id: string) {
    const qr = await this.prisma.quickReply.findFirst({ where: { id, clinicId } });
    if (!qr) throw new NotFoundException('Resposta rápida não encontrada');
    await this.prisma.quickReply.delete({ where: { id } });
    return { success: true };
  }
}
