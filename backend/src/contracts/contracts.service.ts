import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContractsService {
  constructor(private prisma: PrismaService) {}

  async findAll(clinicId: string, query: any = {}) {
    const { search, status, patientId } = query;
    return this.prisma.contract.findMany({
      where: {
        clinicId,
        ...(status ? { status } : {}),
        ...(patientId ? { patientId } : {}),
        ...(search ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { patient: { name: { contains: search, mode: 'insensitive' } } },
          ],
        } : {}),
      },
      include: {
        patient: { select: { id: true, name: true, phone: true, email: true } },
        sale: { select: { id: true, total: true, status: true, createdAt: true } },
        contractTemplate: { select: { id: true, name: true, type: true, content: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(clinicId: string, id: string) {
    const c = await this.prisma.contract.findFirst({
      where: { id, clinicId },
      include: {
        patient: true,
        sale: { include: { items: true } },
        contractTemplate: true,
      },
    });
    if (!c) throw new NotFoundException('Contrato não encontrado');
    return c;
  }

  async create(clinicId: string, data: any, userId?: string) {
    const {
      patientId, saleId, contractTemplateId, title, type, origin,
      status, contentSnapshot, variablesSnapshot, itemsSnapshot,
      notes, totalValue,
    } = data;
    return this.prisma.contract.create({
      data: {
        clinicId, patientId, saleId, contractTemplateId,
        title: title || 'Contrato',
        type: type || 'Prestação de serviço',
        origin: origin || 'custom_blank',
        status: status || 'a_gerar',
        contentSnapshot,
        variablesSnapshot,
        itemsSnapshot,
        notes,
        totalValue,
        createdByUserId: userId,
        generatedAt: contentSnapshot ? new Date() : undefined,
      },
      include: {
        patient: { select: { id: true, name: true } },
        contractTemplate: { select: { id: true, name: true } },
      },
    });
  }

  async update(clinicId: string, id: string, data: any) {
    await this.findOne(clinicId, id);
    const {
      title, type, status, contentSnapshot, variablesSnapshot,
      itemsSnapshot, notes, totalValue, signedAt, signedFileUrl,
    } = data;
    return this.prisma.contract.update({
      where: { id },
      data: {
        title, type, status, contentSnapshot, variablesSnapshot,
        itemsSnapshot, notes, totalValue, signedAt, signedFileUrl,
        ...(contentSnapshot && !data.keepGeneratedAt ? { generatedAt: new Date() } : {}),
      },
      include: {
        patient: { select: { id: true, name: true } },
        contractTemplate: { select: { id: true, name: true } },
      },
    });
  }

  async remove(clinicId: string, id: string) {
    await this.findOne(clinicId, id);
    return this.prisma.contract.delete({ where: { id } });
  }

  async generate(clinicId: string, id: string, data: any) {
    await this.findOne(clinicId, id);
    const { contentSnapshot, variablesSnapshot, itemsSnapshot } = data;
    return this.prisma.contract.update({
      where: { id },
      data: {
        contentSnapshot,
        variablesSnapshot,
        itemsSnapshot,
        status: 'gerado',
        generatedAt: new Date(),
      },
    });
  }
}
