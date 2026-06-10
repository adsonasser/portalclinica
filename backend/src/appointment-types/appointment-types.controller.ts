import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { AppointmentTypesService } from './appointment-types.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClinicId } from '../common/decorators/clinic.decorator';

@Controller('appointment-types')
@UseGuards(JwtAuthGuard)
export class AppointmentTypesController {
  constructor(private readonly service: AppointmentTypesService) {}

  @Get()
  findAll(@ClinicId() clinicId: string) {
    return this.service.findAll(clinicId);
  }

  @Post()
  create(@ClinicId() clinicId: string, @Body() dto: any) {
    return this.service.create(clinicId, dto);
  }

  @Get(':id')
  findOne(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.service.findOne(clinicId, id);
  }

  @Patch(':id')
  update(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) {
    return this.service.update(clinicId, id, dto);
  }

  @Delete(':id')
  remove(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.service.remove(clinicId, id);
  }
}
