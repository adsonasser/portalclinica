import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
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
    return this.prisma.clinic.create({
      data: {
        name: data.name,
        slug: data.slug || data.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        email: data.email,
        phone: data.phone,
        cnpj: data.cnpj,
        address: data.address,
        cidade: data.cidade,
        estado: data.estado,
        responsavel: data.responsavel,
        status: data.status || 'TESTE',
        observacoes: data.observacoes,
      },
    });
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
