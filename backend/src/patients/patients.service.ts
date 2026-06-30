import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  async findAll(clinicId: string, query?: { search?: string; status?: string; contactTypeId?: string }) {
    const where: any = { clinicId };
    if (query?.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
        { cpf: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query?.status) where.status = query.status;
    if (query?.contactTypeId) {
      where.contactTypes = { some: { contactTypeId: query.contactTypeId } };
    }

    return this.prisma.patient.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { appointments: true, sessions: true } },
        contactTypes: { include: { contactType: true } },
        sales:        { select: { paidAmount: true, status: true, saleType: true, total: true } },
        appointments: { select: { status: true } },
        sessions:     { select: { sessionStatus: true } },
      },
    });
  }

  async findOne(clinicId: string, id: string) {
    const p = await this.prisma.patient.findFirst({
      where: { id, clinicId },
      include: {
        appointments: { orderBy: { startTime: 'desc' }, take: 10, include: { plan: true, professional: { include: { user: true } } } },
        sessions: { orderBy: { sessionNumber: 'asc' }, take: 50, include: { plan: true, sale: { select: { id: true, total: true, saleType: true, status: true, paidAmount: true } } } },
        evolutionNotes: { orderBy: { date: 'desc' } },
        prescriptions: { orderBy: { date: 'desc' } },
        anamneses: { orderBy: { createdAt: 'desc' }, take: 1 },
        patientNotes: { orderBy: { createdAt: 'desc' } },
        sales: { orderBy: { createdAt: 'desc' }, take: 5 },
        documents: { orderBy: { createdAt: 'desc' }, include: { template: true } },
        contactTypes: { include: { contactType: true } },
      },
    });
    if (!p) throw new NotFoundException('Paciente não encontrado');
    return p;
  }

  async create(clinicId: string, data: any) {
    const { contactTypeIds, ...rest } = data;
    const patient = await this.prisma.patient.create({ data: { ...rest, clinicId } });
    if (contactTypeIds?.length) {
      await this.prisma.patientContactType.createMany({
        data: contactTypeIds.map((contactTypeId: string) => ({ patientId: patient.id, contactTypeId, clinicId })),
        skipDuplicates: true,
      });
    }
    return this.findOne(clinicId, patient.id);
  }

  async update(clinicId: string, id: string, data: any) {
    await this.findOneSimple(clinicId, id);
    const { contactTypeIds, ...rest } = data;
    await this.prisma.patient.update({ where: { id }, data: rest });
    if (contactTypeIds !== undefined) {
      await this.prisma.patientContactType.deleteMany({ where: { patientId: id } });
      if (contactTypeIds.length) {
        await this.prisma.patientContactType.createMany({
          data: contactTypeIds.map((contactTypeId: string) => ({ patientId: id, contactTypeId, clinicId })),
          skipDuplicates: true,
        });
      }
    }
    return this.findOne(clinicId, id);
  }

  async remove(clinicId: string, id: string) {
    await this.findOneSimple(clinicId, id);
    return this.prisma.patient.delete({ where: { id } });
  }

  async stats(clinicId: string) {
    const [total, ativos, novos, emRisco] = await Promise.all([
      this.prisma.patient.count({ where: { clinicId } }),
      this.prisma.patient.count({ where: { clinicId, status: 'EM_TRATAMENTO' } }),
      this.prisma.patient.count({ where: { clinicId, status: 'NOVO', createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
      this.prisma.patient.count({ where: { clinicId, status: 'EM_RISCO' } }),
    ]);
    return { total, ativos, novos, emRisco };
  }

  async importMany(clinicId: string, patients: any[]) {
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of patients) {
      try {
        const data: any = { clinicId, name: row.name?.trim() };
        if (!data.name) { skipped++; continue; }

        if (row.email)     data.email    = row.email.trim().toLowerCase();
        if (row.phone)     data.phone    = row.phone.trim();
        if (row.cpf)       data.cpf      = row.cpf.trim();
        if (row.birthDate) {
          const d = new Date(row.birthDate);
          if (!isNaN(d.getTime())) data.birthDate = d;
        }
        if (row.gender)    data.gender   = row.gender.trim();
        if (row.city)      data.city     = row.city.trim();
        if (row.state)     data.state    = row.state.trim();
        if (row.address)   data.address  = row.address.trim();
        if (row.zipCode)   data.zipCode  = row.zipCode.trim();
        if (row.notes)     data.notes    = row.notes.trim();
        if (row.instagram) data.instagram = row.instagram.trim();
        if (row.comoConheceu) data.comoConheceu = row.comoConheceu.trim();
        if (row.responsible)  data.responsible  = row.responsible.trim();

        // Skip if patient with same CPF or email already exists in this clinic
        if (data.cpf || data.email) {
          const exists = await this.prisma.patient.findFirst({
            where: {
              clinicId,
              OR: [
                ...(data.cpf   ? [{ cpf: data.cpf }]     : []),
                ...(data.email ? [{ email: data.email }]  : []),
              ],
            },
          });
          if (exists) { skipped++; continue; }
        }

        await this.prisma.patient.create({ data });
        imported++;
      } catch {
        errors.push(row.name ?? 'desconhecido');
        skipped++;
      }
    }

    return { imported, skipped, errors };
  }

  private async findOneSimple(clinicId: string, id: string) {
    const p = await this.prisma.patient.findFirst({ where: { id, clinicId } });
    if (!p) throw new NotFoundException('Paciente não encontrado');
    return p;
  }
}
