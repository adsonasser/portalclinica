import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_PERMISSIONS = {
  administrador: {
    dashboard: { view: true },
    contacts: { view: true, create: true, edit: true, delete: true },
    agenda: { view: true, create: true, edit: true, delete: true },
    medicalRecords: { view: true, create: true, edit: true, finalizeEvolution: true, createPrescription: true },
    financial: { view: true, create: true, edit: true, delete: true, receivePayment: true, confirmEntry: true, viewDre: true },
    sessions: { view: true, create: true, edit: true, delete: true },
    contracts: { view: true, create: true, edit: true, delete: true },
    documents: { view: true, create: true, edit: true, delete: true },
    inventory: { view: true, create: true, edit: true, delete: true },
    opportunities: { view: true, create: true, edit: true, delete: true },
    reports: { view: true },
    messages: { view: true, create: true },
    settings: { view: true, edit: true },
  },
  medico: {
    dashboard: { view: true },
    contacts: { view: true, create: true, edit: true, delete: false },
    agenda: { view: true, create: true, edit: true, delete: false },
    medicalRecords: { view: true, create: true, edit: true, finalizeEvolution: true, createPrescription: true },
    financial: { view: false, create: false, edit: false, delete: false, receivePayment: false, confirmEntry: false, viewDre: false },
    sessions: { view: true, create: true, edit: true, delete: false },
    contracts: { view: false, create: false, edit: false, delete: false },
    documents: { view: true, create: true, edit: true, delete: false },
    inventory: { view: false, create: false, edit: false, delete: false },
    opportunities: { view: false, create: false, edit: false, delete: false },
    reports: { view: true },
    messages: { view: true, create: true },
    settings: { view: false, edit: false },
  },
  recepcao: {
    dashboard: { view: true },
    contacts: { view: true, create: true, edit: true, delete: false },
    agenda: { view: true, create: true, edit: true, delete: false },
    medicalRecords: { view: false, create: false, edit: false, finalizeEvolution: false, createPrescription: false },
    financial: { view: false, create: false, edit: false, delete: false, receivePayment: false, confirmEntry: false, viewDre: false },
    sessions: { view: true, create: false, edit: false, delete: false },
    contracts: { view: false, create: false, edit: false, delete: false },
    documents: { view: false, create: false, edit: false, delete: false },
    inventory: { view: false, create: false, edit: false, delete: false },
    opportunities: { view: false, create: false, edit: false, delete: false },
    reports: { view: false },
    messages: { view: true, create: true },
    settings: { view: false, edit: false },
  },
  financeiro: {
    dashboard: { view: true },
    contacts: { view: true, create: false, edit: false, delete: false },
    agenda: { view: false, create: false, edit: false, delete: false },
    medicalRecords: { view: false, create: false, edit: false, finalizeEvolution: false, createPrescription: false },
    financial: { view: true, create: true, edit: true, delete: false, receivePayment: true, confirmEntry: true, viewDre: true },
    sessions: { view: false, create: false, edit: false, delete: false },
    contracts: { view: true, create: true, edit: true, delete: false },
    documents: { view: false, create: false, edit: false, delete: false },
    inventory: { view: false, create: false, edit: false, delete: false },
    opportunities: { view: false, create: false, edit: false, delete: false },
    reports: { view: true },
    messages: { view: false, create: false },
    settings: { view: false, edit: false },
  },
  enfermagem: {
    dashboard: { view: true },
    contacts: { view: true, create: false, edit: false, delete: false },
    agenda: { view: true, create: true, edit: true, delete: false },
    medicalRecords: { view: false, create: false, edit: false, finalizeEvolution: false, createPrescription: false },
    financial: { view: false, create: false, edit: false, delete: false, receivePayment: false, confirmEntry: false, viewDre: false },
    sessions: { view: true, create: true, edit: true, delete: false },
    contracts: { view: false, create: false, edit: false, delete: false },
    documents: { view: true, create: false, edit: false, delete: false },
    inventory: { view: true, create: false, edit: false, delete: false },
    opportunities: { view: false, create: false, edit: false, delete: false },
    reports: { view: false },
    messages: { view: true, create: false },
    settings: { view: false, edit: false },
  },
  somente_leitura: {
    dashboard: { view: true },
    contacts: { view: true, create: false, edit: false, delete: false },
    agenda: { view: true, create: false, edit: false, delete: false },
    medicalRecords: { view: true, create: false, edit: false, finalizeEvolution: false, createPrescription: false },
    financial: { view: true, create: false, edit: false, delete: false, receivePayment: false, confirmEntry: false, viewDre: false },
    sessions: { view: true, create: false, edit: false, delete: false },
    contracts: { view: true, create: false, edit: false, delete: false },
    documents: { view: true, create: false, edit: false, delete: false },
    inventory: { view: true, create: false, edit: false, delete: false },
    opportunities: { view: true, create: false, edit: false, delete: false },
    reports: { view: true },
    messages: { view: true, create: false },
    settings: { view: false, edit: false },
  },
};

const DEFAULT_PROFILE_DEFS = [
  { name: 'Administrador', description: 'Acesso total ao sistema. Pode gerenciar usuários, configurações e todos os módulos.', isDefault: true, permKey: 'administrador' },
  { name: 'Médico', description: 'Acesso a contatos, agenda, prontuário, receituário, documentos e sessões.', isDefault: false, permKey: 'medico' },
  { name: 'Recepção', description: 'Acesso a contatos, agenda e comunicação. Sem acesso ao prontuário clínico e financeiro estratégico.', isDefault: false, permKey: 'recepcao' },
  { name: 'Financeiro', description: 'Acesso ao financeiro, vendas, recebimentos, contratos e DRE. Sem acesso ao prontuário clínico.', isDefault: false, permKey: 'financeiro' },
  { name: 'Enfermagem', description: 'Acesso a agenda, sessões e registros operacionais. Acesso limitado ao prontuário.', isDefault: false, permKey: 'enfermagem' },
  { name: 'Somente leitura', description: 'Pode visualizar menus permitidos, mas não pode cadastrar, editar ou excluir.', isDefault: false, permKey: 'somente_leitura' },
];

@Injectable()
export class AccessProfilesService {
  constructor(private prisma: PrismaService) {}

  async findAll(clinicId: string) {
    const profiles = await this.prisma.accessProfile.findMany({
      where: { clinicId },
      include: { _count: { select: { users: true } } },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    return profiles.map(p => ({
      ...p,
      userCount: p._count.users,
    }));
  }

  async findOne(clinicId: string, id: string) {
    const profile = await this.prisma.accessProfile.findFirst({ where: { id, clinicId } });
    if (!profile) throw new NotFoundException('Perfil não encontrado');
    return profile;
  }

  async create(clinicId: string, dto: { name: string; description?: string; active?: boolean; permissions?: any }) {
    const exists = await this.prisma.accessProfile.findFirst({ where: { clinicId, name: dto.name } });
    if (exists) throw new ConflictException('Já existe um perfil com este nome');
    return this.prisma.accessProfile.create({
      data: { clinicId, name: dto.name, description: dto.description, active: dto.active ?? true, permissions: dto.permissions ?? {} },
    });
  }

  async update(clinicId: string, id: string, dto: { name?: string; description?: string; active?: boolean; permissions?: any }) {
    await this.findOne(clinicId, id);
    if (dto.name) {
      const exists = await this.prisma.accessProfile.findFirst({ where: { clinicId, name: dto.name, id: { not: id } } });
      if (exists) throw new ConflictException('Já existe um perfil com este nome');
    }
    return this.prisma.accessProfile.update({ where: { id }, data: dto });
  }

  async remove(clinicId: string, id: string) {
    const profile = await this.findOne(clinicId, id);
    if (profile.isDefault) throw new ConflictException('Perfis padrão não podem ser excluídos');
    const userCount = await this.prisma.user.count({ where: { accessProfileId: id } });
    if (userCount > 0) throw new ConflictException(`Este perfil possui ${userCount} usuário(s) vinculado(s). Desvincule-os antes de excluir.`);
    return this.prisma.accessProfile.delete({ where: { id } });
  }

  async duplicate(clinicId: string, id: string) {
    const original = await this.findOne(clinicId, id);
    const newName = `${original.name} (cópia)`;
    return this.prisma.accessProfile.create({
      data: { clinicId, name: newName, description: original.description, permissions: original.permissions as any, active: true, isDefault: false },
    });
  }

  async seedDefaults(clinicId: string) {
    const existing = await this.prisma.accessProfile.count({ where: { clinicId } });
    if (existing > 0) return { message: 'Perfis padrão já existem', seeded: 0 };

    const created = await Promise.all(
      DEFAULT_PROFILE_DEFS.map(def =>
        this.prisma.accessProfile.create({
          data: {
            clinicId,
            name: def.name,
            description: def.description,
            isDefault: def.isDefault,
            active: true,
            permissions: DEFAULT_PERMISSIONS[def.permKey as keyof typeof DEFAULT_PERMISSIONS],
          },
        }),
      ),
    );
    return { message: 'Perfis padrão criados com sucesso', seeded: created.length };
  }
}
