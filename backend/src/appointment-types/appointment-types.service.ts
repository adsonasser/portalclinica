import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AppointmentTypesService {
  constructor(private prisma: PrismaService) {}

  findAll(clinicId: string) {
    return this.prisma.appointmentType.findMany({
      where: { clinicId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(clinicId: string, id: string) {
    const t = await this.prisma.appointmentType.findFirst({ where: { id, clinicId } });
    if (!t) throw new NotFoundException('Tipo de atendimento não encontrado');
    return t;
  }

  create(clinicId: string, data: any) {
    return this.prisma.appointmentType.create({ data: { ...data, clinicId } });
  }

  async update(clinicId: string, id: string, data: any) {
    await this.findOne(clinicId, id);
    return this.prisma.appointmentType.update({ where: { id }, data });
  }

  async remove(clinicId: string, id: string) {
    await this.findOne(clinicId, id);
    const inUse = await this.prisma.appointment.count({ where: { appointmentTypeId: id } });
    if (inUse > 0) throw new ConflictException('Este tipo está em uso por agendamentos existentes. Inative-o em vez de excluir.');
    return this.prisma.appointmentType.delete({ where: { id } });
  }
}
