import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type ModStatus = 'configurado' | 'parcial' | 'pendente' | 'nao_configurado';

export interface ModuleOverview {
  key: string;
  label: string;
  icon: string;
  color: string;
  bg: string;
  status: ModStatus;
  detail: string;
  configuredItems: string[];
  missingItems: string[];
  pendingItems: string[];
  lastUpdated: string | null;
  route: string;
}

const SCORE: Record<ModStatus, number> = { configurado: 100, parcial: 50, pendente: 25, nao_configurado: 0 };

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getOverview(clinicId: string): Promise<{ modules: ModuleOverview[]; progress: number }> {
    const [
      clinic,
      users,
      accessProfiles,
      professionals,
      clinicSettings,
      contactTypes,
      docTemplates,
      plans,
      paymentMethods,
      financialCategories,
      contractTemplates,
      integrations,
    ] = await Promise.all([
      this.prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { name: true, phone: true, email: true, address: true, cnpj: true, responsavel: true, logoUrl: true, updatedAt: true },
      }),
      this.prisma.user.findMany({
        where: { clinicId, active: true, role: { not: 'SUPER_ADMIN' } },
        select: { id: true, accessProfileId: true, updatedAt: true },
      }),
      this.prisma.accessProfile.findMany({
        where: { clinicId, active: true },
        select: { id: true, updatedAt: true },
      }),
      this.prisma.professional.findMany({
        where: { clinicId, active: true },
        select: { showInAgenda: true, updatedAt: true },
      }),
      this.prisma.clinicSettings.findUnique({
        where: { clinicId },
        select: { workStartTime: true, workEndTime: true, workDays: true },
      }),
      this.prisma.clinicContactType.findMany({
        where: { clinicId, isActive: true },
        select: { id: true, updatedAt: true },
      }),
      this.prisma.documentTemplate.findMany({
        where: { clinicId, active: true },
        select: { showInProntuario: true, behavior: true, updatedAt: true },
      }),
      this.prisma.plan.findMany({
        where: { clinicId, active: true },
        select: { tipoGeracaoSessoes: true, defaultCategoryId: true, updatedAt: true },
      }),
      this.prisma.paymentMethod.findMany({
        where: { clinicId, active: true },
        select: { id: true, createdAt: true },
      }),
      this.prisma.financialCategory.findMany({
        where: { clinicId, active: true },
        select: { id: true, updatedAt: true },
      }),
      this.prisma.contractTemplate.findMany({
        where: { clinicId, isActive: true },
        select: { id: true, updatedAt: true },
      }),
      this.prisma.integration.findMany({
        where: { clinicId },
        select: { status: true, updatedAt: true },
      }),
    ]);

    const modules: ModuleOverview[] = [
      this.computeClinica(clinic),
      this.computeUsers(users, accessProfiles),
      this.computeAgenda(professionals, clinicSettings),
      this.computeContatos(contactTypes),
      this.computeProntuario(docTemplates),
      this.computeProcedimentos(plans),
      this.computeSessoes(plans),
      this.computeFinanceiro(paymentMethods, financialCategories),
      this.computeContratos(contractTemplates),
      this.computePersonalizacao(clinic),
      this.computeIntegracoes(integrations),
    ];

    const progress = Math.round(modules.reduce((s, m) => s + SCORE[m.status], 0) / modules.length);
    return { modules, progress };
  }

  private fmt(d?: Date | null): string | null {
    if (!d) return null;
    return new Date(d).toLocaleDateString('pt-BR');
  }

  private latest(...arrays: (Record<string, any> | null)[][]): string | null {
    const all = arrays.flat().filter(Boolean) as Record<string, any>[];
    const dates = all.map(x => x.updatedAt || x.createdAt).filter(Boolean) as Date[];
    if (!dates.length) return null;
    return this.fmt(new Date(Math.max(...dates.map(d => new Date(d).getTime()))));
  }

  private computeClinica(clinic: any): ModuleOverview {
    const base = { key: 'clinic', label: 'Clínica', icon: 'ti-building', color: '#2563EB', bg: '#EFF6FF', route: 'clinic' };
    if (!clinic) {
      return { ...base, status: 'nao_configurado', detail: 'Nenhum dado cadastral', configuredItems: [], missingItems: ['Nome', 'Telefone', 'E-mail', 'CNPJ', 'Endereço'], pendingItems: [], lastUpdated: null };
    }
    const checks: [string, any][] = [['Nome', clinic.name], ['Telefone', clinic.phone], ['E-mail', clinic.email], ['CNPJ', clinic.cnpj], ['Endereço', clinic.address], ['Responsável', clinic.responsavel]];
    const configured = checks.filter(([, v]) => v).map(([k]) => k);
    const missing    = checks.filter(([, v]) => !v).map(([k]) => k);

    let status: ModStatus;
    if (missing.length === 0)           status = 'configurado';
    else if (configured.length >= 3)    status = 'parcial';
    else if (configured.length >= 1)    status = 'pendente';
    else                                status = 'nao_configurado';

    const detail = status === 'configurado' ? 'Dados cadastrais completos' : `${configured.length} de ${checks.length} campos preenchidos`;
    return { ...base, status, detail, configuredItems: configured, missingItems: missing, pendingItems: [], lastUpdated: this.fmt(clinic.updatedAt) };
  }

  private computeUsers(users: any[], profiles: any[]): ModuleOverview {
    const base = { key: 'users', label: 'Usuários e permissões', icon: 'ti-users', color: '#7C3AED', bg: '#F5F3FF', route: 'users' };
    const uCount = users.length;
    const pCount = profiles.length;
    const withoutProfile = users.filter(u => !u.accessProfileId).length;
    const configured: string[] = [];
    const missing: string[] = [];
    const pending: string[] = [];

    if (uCount > 0) configured.push(`${uCount} usuário${uCount > 1 ? 's' : ''}`);
    else missing.push('Usuários cadastrados');
    if (pCount > 0) configured.push(`${pCount} perfil${pCount > 1 ? 'is' : ''} de acesso`);
    else missing.push('Perfis de acesso');
    if (withoutProfile > 0) pending.push(`${withoutProfile} usuário${withoutProfile > 1 ? 's' : ''} sem perfil vinculado`);

    let status: ModStatus;
    if (uCount >= 1 && pCount >= 1)     status = 'configurado';
    else if (uCount >= 1 || pCount >= 1) status = 'parcial';
    else                                 status = 'nao_configurado';

    const detail = status === 'configurado'
      ? `${uCount} usuário${uCount > 1 ? 's' : ''} e ${pCount} perfil${pCount > 1 ? 'is' : ''}`
      : missing.join(', ') + ' pendente(s)';
    return { ...base, status, detail, configuredItems: configured, missingItems: missing, pendingItems: pending, lastUpdated: this.latest(users, profiles) };
  }

  private computeAgenda(professionals: any[], settings: any): ModuleOverview {
    const base = { key: 'agenda', label: 'Agenda', icon: 'ti-calendar', color: '#4F46E5', bg: '#EEF2FF', route: 'agenda' };
    const inAgenda = professionals.filter(p => p.showInAgenda);
    const configured: string[] = [];
    const missing: string[] = [];

    if (settings) configured.push('Horário de funcionamento');
    else missing.push('Horário de funcionamento');
    if (inAgenda.length > 0) configured.push(`${inAgenda.length} profissional${inAgenda.length > 1 ? 'is' : ''} na agenda`);
    else missing.push('Profissional na agenda');

    let status: ModStatus;
    if (configured.length === 2)        status = 'configurado';
    else if (configured.length === 1)   status = 'parcial';
    else                                status = 'pendente';

    const detail = status === 'configurado'
      ? `${inAgenda.length} profissional${inAgenda.length > 1 ? 'is' : ''} configurado${inAgenda.length > 1 ? 's' : ''} na agenda`
      : missing.join(', ') + ' pendente(s)';
    return { ...base, status, detail, configuredItems: configured, missingItems: missing, pendingItems: [], lastUpdated: this.latest(professionals) };
  }

  private computeContatos(types: any[]): ModuleOverview {
    const base = { key: 'contatos', label: 'Contatos', icon: 'ti-heart-handshake', color: '#16A34A', bg: '#DCFCE7', route: 'contatos' };
    const count = types.length;
    const status: ModStatus = count >= 1 ? 'configurado' : 'nao_configurado';
    return {
      ...base, status,
      detail: count > 0 ? `${count} tipo${count > 1 ? 's' : ''} de contato configurado${count > 1 ? 's' : ''}` : 'Nenhum tipo de contato cadastrado',
      configuredItems: count > 0 ? [`${count} tipo${count > 1 ? 's' : ''} de contato`] : [],
      missingItems: count === 0 ? ['Tipos de contato'] : [],
      pendingItems: [],
      lastUpdated: this.latest(types),
    };
  }

  private computeProntuario(templates: any[]): ModuleOverview {
    const base = { key: 'prontuario', label: 'Prontuário', icon: 'ti-clipboard-list', color: '#0D9488', bg: '#F0FDFA', route: 'prontuario' };
    const evolution   = templates.filter(t => t.showInProntuario !== false && t.behavior !== 'receituario');
    const receituario = templates.filter(t => t.showInProntuario === false || t.behavior === 'receituario');
    const configured: string[] = [];
    const missing: string[] = [];

    if (evolution.length > 0)   configured.push(`${evolution.length} modelo${evolution.length > 1 ? 's' : ''} de evolução`);
    else                        missing.push('Modelos de evolução');
    if (receituario.length > 0) configured.push(`${receituario.length} modelo${receituario.length > 1 ? 's' : ''} de receituário`);
    else                        missing.push('Modelos de receituário');

    let status: ModStatus;
    if (configured.length === 2)        status = 'configurado';
    else if (configured.length === 1)   status = 'parcial';
    else                                status = 'nao_configurado';

    return {
      ...base, status,
      detail: status === 'configurado' ? 'Modelos de evolução e receituário configurados' : missing.join(', ') + ' não cadastrado(s)',
      configuredItems: configured, missingItems: missing, pendingItems: [],
      lastUpdated: this.latest(templates),
    };
  }

  private computeProcedimentos(plans: any[]): ModuleOverview {
    const base = { key: 'procedures', label: 'Procedimentos e Serviços', icon: 'ti-clipboard-text', color: '#C2410C', bg: '#FFF7ED', route: 'procedures' };
    const count = plans.length;
    const withCat = plans.filter(p => p.defaultCategoryId).length;
    const configured: string[] = [];
    const missing: string[] = [];

    if (count > 0)   configured.push(`${count} procedimento${count > 1 ? 's' : ''}`);
    else             missing.push('Procedimentos cadastrados');
    if (withCat > 0) configured.push('Categorias financeiras vinculadas');
    else if (count > 0) missing.push('Categoria financeira vinculada');

    let status: ModStatus;
    if (count >= 1 && withCat >= 1)  status = 'configurado';
    else if (count >= 1)             status = 'parcial';
    else                             status = 'nao_configurado';

    return {
      ...base, status,
      detail: count > 0 ? `${count} procedimento${count > 1 ? 's' : ''} cadastrado${count > 1 ? 's' : ''}` : 'Nenhum procedimento cadastrado',
      configuredItems: configured, missingItems: missing, pendingItems: [],
      lastUpdated: this.latest(plans),
    };
  }

  private computeSessoes(plans: any[]): ModuleOverview {
    const base = { key: 'sessions', label: 'Sessões', icon: 'ti-activity', color: '#0284C7', bg: '#F0F9FF', route: 'sessions' };
    const withSessions = plans.filter(p => p.tipoGeracaoSessoes && p.tipoGeracaoSessoes !== 'nao_gera');
    const count = withSessions.length;

    let status: ModStatus;
    if (count >= 1)        status = 'configurado';
    else if (plans.length) status = 'parcial';
    else                   status = 'nao_configurado';

    return {
      ...base, status,
      detail: count > 0 ? `${count} procedimento${count > 1 ? 's' : ''} gera${count > 1 ? 'm' : ''} sessões` : 'Nenhum procedimento gera sessões',
      configuredItems: count > 0 ? [`${count} procedimento${count > 1 ? 's' : ''} com geração de sessões`] : [],
      missingItems: count === 0 ? ['Procedimentos configurados para gerar sessões'] : [],
      pendingItems: [],
      lastUpdated: this.latest(plans),
    };
  }

  private computeFinanceiro(methods: any[], categories: any[]): ModuleOverview {
    const base = { key: 'financial', label: 'Financeiro', icon: 'ti-cash', color: '#A16207', bg: '#FEFCE8', route: 'financial' };
    const mCount = methods.length;
    const cCount = categories.length;
    const configured: string[] = [];
    const missing: string[] = [];

    if (mCount > 0) configured.push(`${mCount} forma${mCount > 1 ? 's' : ''} de pagamento`);
    else            missing.push('Formas de pagamento');
    if (cCount > 0) configured.push(`${cCount} conta${cCount > 1 ? 's' : ''} DRE`);
    else            missing.push('Contas DRE');

    let status: ModStatus;
    if (mCount >= 1 && cCount >= 1)  status = 'configurado';
    else if (mCount >= 1 || cCount >= 1) status = 'parcial';
    else                             status = 'nao_configurado';

    return {
      ...base, status,
      detail: status === 'configurado' ? `${mCount} forma${mCount > 1 ? 's' : ''} de pagamento e ${cCount} conta${cCount > 1 ? 's' : ''} DRE` : missing.join(', ') + ' pendente(s)',
      configuredItems: configured, missingItems: missing, pendingItems: [],
      lastUpdated: this.latest(methods, categories),
    };
  }

  private computeContratos(templates: any[]): ModuleOverview {
    const base = { key: 'contracts', label: 'Contratos', icon: 'ti-file-certificate', color: '#7C3AED', bg: '#F5F3FF', route: 'contracts' };
    const count = templates.length;
    const status: ModStatus = count >= 1 ? 'configurado' : 'nao_configurado';
    return {
      ...base, status,
      detail: count > 0 ? `${count} modelo${count > 1 ? 's' : ''} de contrato ativo${count > 1 ? 's' : ''}` : 'Nenhum modelo de contrato',
      configuredItems: count > 0 ? [`${count} modelo${count > 1 ? 's' : ''} de contrato`] : [],
      missingItems: count === 0 ? ['Modelos de contrato'] : [],
      pendingItems: [],
      lastUpdated: this.latest(templates),
    };
  }

  private computePersonalizacao(clinic: any): ModuleOverview {
    const base = { key: 'personalization', label: 'Personalização', icon: 'ti-palette', color: '#BE185D', bg: '#FDF2F8', route: 'personalization' };
    const hasLogo = !!clinic?.logoUrl;
    const status: ModStatus = hasLogo ? 'parcial' : 'nao_configurado';
    return {
      ...base, status,
      detail: hasLogo ? 'Logo configurado. Cor principal pendente.' : 'Nenhuma personalização salva',
      configuredItems: hasLogo ? ['Logo'] : [],
      missingItems: hasLogo ? ['Cor principal'] : ['Logo', 'Cor principal'],
      pendingItems: [],
      lastUpdated: null,
    };
  }

  private computeIntegracoes(integrations: any[]): ModuleOverview {
    const base = { key: 'integrations', label: 'Integrações', icon: 'ti-plug-connected', color: '#0891B2', bg: '#ECFEFF', route: 'integrations' };
    const connected = integrations.filter(i => i.status === 'connected');
    const cCount = connected.length;
    const total  = integrations.length;

    let status: ModStatus;
    if (cCount >= 1)    status = 'configurado';
    else if (total >= 1) status = 'parcial';
    else                 status = 'nao_configurado';

    return {
      ...base, status,
      detail: cCount > 0 ? `${cCount} integração${cCount > 1 ? 'ões' : ''} ativa${cCount > 1 ? 's' : ''}` : total > 0 ? 'Integração cadastrada sem conexão ativa' : 'Nenhuma integração configurada',
      configuredItems: cCount > 0 ? [`${cCount} integração conectada`] : [],
      missingItems: cCount === 0 ? ['Integração ativa'] : [],
      pendingItems: [],
      lastUpdated: this.latest(integrations),
    };
  }

  async getClinicInfo(clinicId: string) {
    const c = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { name: true, cnpj: true, phone: true, email: true, address: true, cidade: true, estado: true, responsavel: true },
    });
    return { name: c?.name ?? '', cnpj: c?.cnpj ?? '', phone: c?.phone ?? '', email: c?.email ?? '',
             address: c?.address ?? '', city: c?.cidade ?? '', state: c?.estado ?? '', responsavel: c?.responsavel ?? '' };
  }

  async updateClinicInfo(clinicId: string, dto: any) {
    const { name, cnpj, phone, email, address, city, state, responsavel } = dto;
    const updated = await this.prisma.clinic.update({
      where: { id: clinicId },
      data: {
        ...(name        != null && { name }),
        ...(cnpj        != null && { cnpj }),
        ...(phone       != null && { phone }),
        ...(email       != null && { email }),
        ...(address     != null && { address }),
        ...(city        != null && { cidade: city }),
        ...(state       != null && { estado: state }),
        ...(responsavel != null && { responsavel }),
      },
      select: { name: true, cnpj: true, phone: true, email: true, address: true, cidade: true, estado: true, responsavel: true },
    });
    return { name: updated.name, cnpj: updated.cnpj ?? '', phone: updated.phone ?? '', email: updated.email ?? '',
             address: updated.address ?? '', city: updated.cidade ?? '', state: updated.estado ?? '', responsavel: updated.responsavel ?? '' };
  }
}
