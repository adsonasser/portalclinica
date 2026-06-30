import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, active: true },
      include: { clinic: { select: { id: true, name: true, logoUrl: true, emailConfirmed: true } } },
    });

    if (!user) throw new UnauthorizedException('Credenciais inválidas');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Credenciais inválidas');

    // Block login if clinic email not confirmed
    if (user.clinic && !(user.clinic as any).emailConfirmed) {
      throw new ForbiddenException('PENDING_EMAIL_CONFIRMATION');
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const token = this.jwt.sign({ sub: user.id, clinicId: user.clinicId, role: user.role });

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
        clinic: user.clinic,
        clinicId: user.clinicId,
      },
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        clinic: { select: { id: true, name: true, logoUrl: true } },
        accessProfile: { select: { id: true, name: true, permissions: true, active: true } },
      },
    });
    if (!user) throw new UnauthorizedException();
    const { password: _, ...rest } = user;
    return rest;
  }
}
