import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class PublicService {
  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    private config: ConfigService,
  ) {}

  async register(data: {
    name: string;
    cnpj: string;
    email: string;
    phone: string;
    responsavel: string;
    cep: string;
    street: string;
    addressNumber: string;
    complement?: string;
    neighborhood: string;
    cidade: string;
    estado: string;
    password: string;
  }) {
    // Validate required
    if (!data.name || !data.cnpj || !data.email || !data.phone || !data.responsavel || !data.password)
      throw new BadRequestException('Preencha todos os campos obrigatórios');

    // Check CNPJ uniqueness
    const existingCnpj = await this.prisma.clinic.findFirst({ where: { cnpj: data.cnpj.replace(/\D/g, '') } });
    if (existingCnpj) throw new ConflictException('Já existe uma empresa cadastrada com este CNPJ');

    // Check email uniqueness (cross-clinic)
    const existingEmail = await this.prisma.user.findFirst({ where: { email: data.email.toLowerCase().trim() } });
    if (existingEmail) throw new ConflictException('Este e-mail já está em uso no sistema');

    const slug = this.generateSlug(data.name);
    const passwordHash = await bcrypt.hash(data.password, 10);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const result = await this.prisma.$transaction(async (tx) => {
      const clinic = await tx.clinic.create({
        data: {
          name: data.name,
          slug,
          cnpj: data.cnpj.replace(/\D/g, ''),
          email: data.email.trim().toLowerCase(),
          phone: data.phone,
          responsavel: data.responsavel,
          cep: data.cep,
          street: data.street,
          addressNumber: data.addressNumber,
          complement: data.complement,
          neighborhood: data.neighborhood,
          cidade: data.cidade,
          estado: data.estado,
          status: 'TESTE',
          active: false,
          emailConfirmed: false,
        },
      });

      await tx.user.create({
        data: {
          clinicId: clinic.id,
          name: data.responsavel,
          email: data.email.trim().toLowerCase(),
          password: passwordHash,
          role: 'ADMIN',
          active: false,
        },
      });

      await tx.emailConfirmationToken.create({
        data: { token, clinicId: clinic.id, expiresAt },
      });

      return clinic;
    });

    const baseUrl = this.config.get('APP_URL') ?? 'https://nassclin.com.br';
    await this.email.sendConfirmationEmail(data.email, data.responsavel, token, baseUrl);

    return { message: 'Cadastro realizado. Verifique seu e-mail para confirmar a conta.' };
  }

  async confirmEmail(token: string) {
    const record = await this.prisma.emailConfirmationToken.findUnique({ where: { token } });
    if (!record) throw new NotFoundException('Token inválido');
    if (record.usedAt) throw new BadRequestException('Este link já foi utilizado');
    if (record.expiresAt < new Date()) throw new BadRequestException('Link expirado. Solicite um novo e-mail de confirmação.');

    await this.prisma.$transaction(async (tx) => {
      await tx.clinic.update({
        where: { id: record.clinicId },
        data: { active: true, emailConfirmed: true, status: 'TESTE' },
      });
      await tx.user.updateMany({
        where: { clinicId: record.clinicId },
        data: { active: true },
      });
      await tx.emailConfirmationToken.update({
        where: { token },
        data: { usedAt: new Date() },
      });
    });

    return { message: 'E-mail confirmado com sucesso! Agora você pode acessar o sistema.' };
  }

  async resendConfirmation(email: string) {
    const user = await this.prisma.user.findFirst({ where: { email: email.toLowerCase().trim() } });
    if (!user) throw new NotFoundException('E-mail não encontrado');

    const clinic = await this.prisma.clinic.findUnique({ where: { id: user.clinicId } });
    if (!clinic) throw new NotFoundException('Empresa não encontrada');
    if (clinic.emailConfirmed) throw new BadRequestException('Esta conta já foi confirmada');

    // Invalidate old tokens
    await this.prisma.emailConfirmationToken.updateMany({
      where: { clinicId: clinic.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await this.prisma.emailConfirmationToken.create({ data: { token, clinicId: clinic.id, expiresAt } });

    const baseUrl = this.config.get('APP_URL') ?? 'https://nassclin.com.br';
    await this.email.sendConfirmationEmail(email, user.name, token, baseUrl);

    return { message: 'E-mail de confirmação reenviado.' };
  }

  private generateSlug(name: string): string {
    const base = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `${base}-${Date.now()}`;
  }
}
