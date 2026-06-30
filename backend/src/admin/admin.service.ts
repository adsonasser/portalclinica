import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { seedClinicDefaults } from '../common/clinic-seed';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private emailService: EmailService,
  ) {}

  // ─── Dashboard ──────────────────────────────────────────────────────────────

  async getDashboardStats() {
    const [
      totalClinics,
      activeClinics,
      testClinics,
      suspendedClinics,
      blockedClinics,
      inadimpleteClinics,
      totalUsers,
      recentClinics,
      clinicsNearExpiry,
    ] = await Promise.all([
      this.prisma.clinic.count({ where: { slug: { not: '__master__' } } }),
      this.prisma.clinic.count({ where: { status: 'ATIVA', slug: { not: '__master__' } } }),
      this.prisma.clinic.count({ where: { status: 'TESTE', slug: { not: '__master__' } } }),
      this.prisma.clinic.count({ where: { status: 'SUSPENSA', slug: { not: '__master__' } } }),
      this.prisma.clinic.count({ where: { status: 'BLOQUEADA', slug: { not: '__master__' } } }),
      this.prisma.clinic.count({ where: { status: 'INADIMPLENTE', slug: { not: '__master__' } } }),
      this.prisma.user.count({ where: { active: true, clinic: { slug: { not: '__master__' } } } }),
      this.prisma.clinic.findMany({
        where: { slug: { not: '__master__' } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          subscription: { include: { clinic: true } },
          _count: { select: { users: true } },
        },
      }),
      this.prisma.clinic.findMany({
        where: {
          slug: { not: '__master__' },
          subscription: { endDate: { lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } },
        },
        include: { subscription: true },
        take: 5,
      }),
    ]);

    return {
      totalClinics,
      activeClinics,
      testClinics,
      suspendedClinics,
      blockedClinics,
      inadimpleteClinics,
      totalUsers,
      recentClinics,
      clinicsNearExpiry,
    };
  }

  // ─── Clinics ────────────────────────────────────────────────────────────────

  async findAllClinics(query?: any) {
    const where: any = { slug: { not: '__master__' } };
    if (query?.status) where.status = query.status;
    if (query?.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { responsavel: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.clinic.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        subscription: { include: { clinic: true } },
        _count: { select: { users: true, patients: true } },
      },
    });
  }

  async findClinic(id: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id },
      include: {
        subscription: { include: { clinic: true } },
        settings: true,
        _count: {
          select: {
            users: true,
            patients: true,
            sessions: true,
            appointments: true,
            sales: true,
            leads: true,
          },
        },
      },
    });
    if (!clinic) throw new NotFoundException('Empresa não encontrada');
    return clinic;
  }

  async createClinic(data: any) {
    if (!data.name || !data.email || !data.cnpj || !data.phone || !data.responsavel)
      throw new ConflictException('Nome, e-mail, CNPJ, telefone e responsável são obrigatórios');

    const cnpjClean = data.cnpj.replace(/\D/g, '');

    const [existingCnpj, existingEmail] = await Promise.all([
      this.prisma.clinic.findFirst({ where: { cnpj: cnpjClean } }),
      this.prisma.user.findFirst({ where: { email: data.email.trim().toLowerCase() } }),
    ]);
    if (existingCnpj) throw new ConflictException('Já existe uma empresa cadastrada com este CNPJ');
    if (existingEmail) throw new ConflictException('Este e-mail já está vinculado a outro usuário no sistema');

    const tempPassword = crypto.randomBytes(5).toString('hex'); // 10 chars hex
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const slug = data.slug || data.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now();

    const clinic = await this.prisma.$transaction(async (tx) => {
      const c = await tx.clinic.create({
        data: {
          name: data.name,
          slug,
          email: data.email.trim().toLowerCase(),
          phone: data.phone,
          cnpj: cnpjClean,
          responsavel: data.responsavel,
          cep: data.cep,
          street: data.street,
          addressNumber: data.addressNumber,
          complement: data.complement,
          neighborhood: data.neighborhood,
          cidade: data.cidade,
          estado: data.estado,
          status: data.status || 'TESTE',
          observacoes: data.observacoes,
          emailConfirmed: true,
          active: true,
        },
      });

      await tx.user.create({
        data: {
          clinicId: c.id,
          name: data.responsavel,
          email: data.email.trim().toLowerCase(),
          password: passwordHash,
          role: 'ADMIN',
          active: true,
          mustChangePassword: true,
        },
      });

      return c;
    });

    // Seed default payment methods + CRM defaults (non-blocking)
    try { await seedClinicDefaults(this.prisma, clinic.id); } catch { /* best effort */ }

    // Try to send welcome email (non-blocking)
    try {
      await this.emailService.sendWelcomeWithPassword(data.email, data.responsavel, data.name, tempPassword);
    } catch { /* SMTP not configured — password returned in response */ }

    return { ...clinic, tempPassword };
  }

  async updateClinic(id: string, data: any) {
    await this.findClinic(id);
    return this.prisma.clinic.update({ where: { id }, data });
  }

  async updateStatus(id: string, status: string, superAdminId: string) {
    await this.findClinic(id);

    const updated = await this.prisma.clinic.update({
      where: { id },
      data: { status: status as any, active: status === 'ATIVA' || status === 'TESTE' || status === 'IMPLANTACAO' },
    });

    await this.createAuditLog({
      userId: superAdminId,
      clinicId: id,
      action: 'UPDATE_STATUS',
      entity: 'Clinic',
      entityId: id,
      details: { newStatus: status },
    });

    return updated;
  }

  async getClinicUsers(id: string) {
    await this.findClinic(id);
    return this.prisma.user.findMany({
      where: { clinicId: id },
      select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createClinicUser(clinicId: string, data: { name: string; email: string; password: string; role?: string }) {
    await this.findClinic(clinicId);

    const existing = await this.prisma.user.findFirst({ where: { clinicId, email: data.email } });
    if (existing) throw new ConflictException('Já existe um usuário com este e-mail nesta empresa');

    const hashed = await bcrypt.hash(data.password, 10);
    return this.prisma.user.create({
      data: {
        clinicId,
        name: data.name,
        email: data.email,
        password: hashed,
        role: (data.role as any) || 'ADMIN',
        active: true,
      },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    });
  }

  async getClinicMetrics(id: string) {
    await this.findClinic(id);
    const [users, patients, sessions, appointments, sales, leads] = await Promise.all([
      this.prisma.user.count({ where: { clinicId: id, active: true } }),
      this.prisma.patient.count({ where: { clinicId: id } }),
      this.prisma.session.count({ where: { clinicId: id } }),
      this.prisma.appointment.count({ where: { clinicId: id } }),
      this.prisma.sale.count({ where: { clinicId: id } }),
      this.prisma.lead.count({ where: { clinicId: id } }),
    ]);
    return { users, patients, sessions, appointments, sales, leads };
  }

  // ─── Impersonate ─────────────────────────────────────────────────────────────

  async impersonate(clinicId: string, superAdminId: string) {
    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId } });
    if (!clinic) throw new NotFoundException('Empresa não encontrada');

    const adminUser = await this.prisma.user.findFirst({
      where: { clinicId, role: { in: ['ADMIN', 'PROFESSIONAL', 'RECEPTIONIST'] } },
      orderBy: { role: 'asc' },
    });

    if (!adminUser) throw new ForbiddenException('Nenhum usuário encontrado nesta empresa');

    const token = this.jwt.sign(
      {
        sub: adminUser.id,
        clinicId,
        role: adminUser.role,
        impersonating: true,
        impersonatorId: superAdminId,
      },
      { secret: this.config.get<string>('JWT_SECRET') || 'secret', expiresIn: '4h' },
    );

    await this.createAuditLog({
      userId: superAdminId,
      clinicId,
      action: 'IMPERSONATE',
      entity: 'Clinic',
      entityId: clinicId,
      details: { targetUserId: adminUser.id, clinicName: clinic.name },
    });

    return {
      token,
      clinicId,
      clinicName: clinic.name,
      impersonating: true,
    };
  }

  // ─── Audit Logs ──────────────────────────────────────────────────────────────

  async createAuditLog(data: {
    userId: string;
    clinicId?: string;
    action: string;
    entity: string;
    entityId?: string;
    details?: any;
    ip?: string;
  }) {
    return this.prisma.auditLog.create({ data });
  }

  async getAuditLogs(clinicId?: string) {
    return this.prisma.auditLog.findMany({
      where: clinicId ? { clinicId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ─── Pricing Plans ───────────────────────────────────────────────────────────

  async findAllPlans() {
    return this.prisma.pricingPlan.findMany({ orderBy: { price: 'asc' } });
  }

  async createPlan(data: any) {
    return this.prisma.pricingPlan.create({ data });
  }

  async updatePlan(id: string, data: any) {
    return this.prisma.pricingPlan.update({ where: { id }, data });
  }

  // ─── Subscriptions ────────────────────────────────────────────────────────────

  async upsertSubscription(clinicId: string, data: any) {
    return this.prisma.tenantSubscription.upsert({
      where: { clinicId },
      update: data,
      create: { clinicId, ...data },
    });
  }
}
