import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(clinicId: string) {
    return this.prisma.user.findMany({
      where: { clinicId },
      select: {
        id: true, name: true, email: true, role: true, phone: true,
        avatarUrl: true, active: true, lastLoginAt: true, createdAt: true,
        accessProfileId: true,
        accessProfile: { select: { id: true, name: true } },
        professional: { select: { id: true, active: true, showInAgenda: true, color: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(clinicId: string, dto: CreateUserDto) {
    const exists = await this.prisma.user.findFirst({ where: { clinicId, email: dto.email } });
    if (exists) throw new ConflictException('E-mail já cadastrado nesta clínica');

    const hashed = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: { ...dto, password: hashed, clinicId },
      select: { id: true, name: true, email: true, role: true, phone: true, active: true, createdAt: true },
    });
  }

  async update(clinicId: string, id: string, rawData: any) {
    await this.findOne(clinicId, id);
    const { isProfessional, showInAgenda, ...data } = rawData;
    if (data.password) data.password = await bcrypt.hash(data.password, 10);

    const user = await this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true, phone: true, active: true },
    });

    if (isProfessional !== undefined) {
      const existing = await this.prisma.professional.findFirst({ where: { userId: id, clinicId } });
      if (isProfessional) {
        if (existing) {
          await this.prisma.professional.update({
            where: { id: existing.id },
            data: { active: true, ...(showInAgenda !== undefined ? { showInAgenda } : {}) },
          });
        } else {
          await this.prisma.professional.create({
            data: { clinicId, userId: id, active: true, showInAgenda: showInAgenda ?? true },
          });
        }
      } else if (existing) {
        await this.prisma.professional.update({ where: { id: existing.id }, data: { active: false } });
      }
    } else if (showInAgenda !== undefined) {
      const existing = await this.prisma.professional.findFirst({ where: { userId: id, clinicId } });
      if (existing) {
        await this.prisma.professional.update({ where: { id: existing.id }, data: { showInAgenda } });
      }
    }

    return user;
  }

  async findOne(clinicId: string, id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, clinicId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  async remove(clinicId: string, id: string) {
    await this.findOne(clinicId, id);
    return this.prisma.user.update({ where: { id }, data: { active: false } });
  }
}
