import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProntuarioService {
  constructor(private prisma: PrismaService) {}

  async getByPatient(clinicId: string, patientId: string) {
    const [evolutionNotes, prescriptions, anamnesis, patientNotes, draft] = await Promise.all([
      this.prisma.evolutionNote.findMany({ where: { clinicId, patientId, status: 'finalized' }, orderBy: { date: 'desc' } }),
      this.prisma.prescription.findMany({ where: { clinicId, patientId }, orderBy: { date: 'desc' } }),
      this.prisma.anamnesis.findFirst({ where: { clinicId, patientId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.patientNote.findMany({ where: { clinicId, patientId }, orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.evolutionNote.findFirst({ where: { clinicId, patientId, status: 'draft' }, orderBy: { updatedAt: 'desc' } }),
    ]);
    return { evolutionNotes, prescriptions, anamnesis, patientNotes, draft };
  }

  async createEvolution(clinicId: string, patientId: string, data: any) {
    return this.prisma.evolutionNote.create({ data: { ...data, status: 'finalized', clinicId, patientId } });
  }

  async saveDraft(clinicId: string, patientId: string, content: string) {
    await this.prisma.evolutionNote.deleteMany({ where: { clinicId, patientId, status: 'draft' } });
    return this.prisma.evolutionNote.create({ data: { clinicId, patientId, content, status: 'draft' } });
  }

  async deleteDraft(clinicId: string, patientId: string) {
    return this.prisma.evolutionNote.deleteMany({ where: { clinicId, patientId, status: 'draft' } });
  }

  async updateEvolution(clinicId: string, id: string, data: any) {
    const record = await this.prisma.evolutionNote.findFirst({ where: { id, clinicId } });
    if (!record) throw new NotFoundException('Evolução não encontrada');
    return this.prisma.evolutionNote.update({ where: { id }, data });
  }

  async deleteEvolution(clinicId: string, id: string) {
    const record = await this.prisma.evolutionNote.findFirst({ where: { id, clinicId } });
    if (!record) throw new NotFoundException('Evolução não encontrada');
    return this.prisma.evolutionNote.delete({ where: { id } });
  }

  async createPrescription(clinicId: string, patientId: string, data: any) {
    return this.prisma.prescription.create({ data: { ...data, clinicId, patientId } });
  }

  async deletePrescription(clinicId: string, id: string) {
    const record = await this.prisma.prescription.findFirst({ where: { id, clinicId } });
    if (!record) throw new NotFoundException('Prescrição não encontrada');
    return this.prisma.prescription.delete({ where: { id } });
  }

  async saveAnamnesis(clinicId: string, patientId: string, answers: any) {
    const existing = await this.prisma.anamnesis.findFirst({ where: { clinicId, patientId } });
    if (existing) {
      return this.prisma.anamnesis.update({ where: { id: existing.id }, data: { answers } });
    }
    return this.prisma.anamnesis.create({ data: { clinicId, patientId, answers } });
  }

  async createNote(clinicId: string, patientId: string, data: any) {
    return this.prisma.patientNote.create({ data: { ...data, clinicId, patientId } });
  }

  async updateNote(clinicId: string, id: string, data: any) {
    const record = await this.prisma.patientNote.findFirst({ where: { id, clinicId } });
    if (!record) throw new NotFoundException('Nota não encontrada');
    return this.prisma.patientNote.update({ where: { id }, data });
  }

  async deleteNote(clinicId: string, id: string) {
    const record = await this.prisma.patientNote.findFirst({ where: { id, clinicId } });
    if (!record) throw new NotFoundException('Nota não encontrada');
    return this.prisma.patientNote.delete({ where: { id } });
  }

  // ── Modelos de documentos ──────────────────────────────────────────────────

  async listDocTemplates(clinicId: string, onlyProntuario = false) {
    return this.prisma.documentTemplate.findMany({
      where: { clinicId, ...(onlyProntuario ? { active: true, showInProntuario: true } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createDocTemplate(clinicId: string, data: any) {
    return this.prisma.documentTemplate.create({ data: { ...data, clinicId } });
  }

  async updateDocTemplate(clinicId: string, id: string, data: any) {
    const record = await this.prisma.documentTemplate.findFirst({ where: { id, clinicId } });
    if (!record) throw new NotFoundException('Modelo não encontrado');
    return this.prisma.documentTemplate.update({ where: { id }, data });
  }

  async deleteDocTemplate(clinicId: string, id: string) {
    const record = await this.prisma.documentTemplate.findFirst({ where: { id, clinicId } });
    if (!record) throw new NotFoundException('Modelo não encontrado');
    return this.prisma.documentTemplate.delete({ where: { id } });
  }

  // ── Documentos do paciente ─────────────────────────────────────────────────

  async listPatientDocuments(clinicId: string, patientId: string) {
    return this.prisma.patientDocument.findMany({
      where: { clinicId, patientId },
      include: { template: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async savePatientDocument(clinicId: string, patientId: string, data: any) {
    return this.prisma.patientDocument.create({ data: { ...data, clinicId, patientId } });
  }
}
