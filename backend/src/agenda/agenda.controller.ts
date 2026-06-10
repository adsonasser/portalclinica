import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AgendaService } from './agenda.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClinicId } from '../common/decorators/clinic.decorator';

@Controller('agenda')
@UseGuards(JwtAuthGuard)
export class AgendaController {
  constructor(private readonly agendaService: AgendaService) {}

  @Get()
  findAll(@ClinicId() clinicId: string, @Query() query: any) {
    return this.agendaService.findAll(clinicId, query);
  }

  @Get('professionals')
  findProfessionals(@ClinicId() clinicId: string) {
    return this.agendaService.findProfessionals(clinicId);
  }

  @Get('stats')
  stats(@ClinicId() clinicId: string, @Query('date') date: string) {
    return this.agendaService.stats(clinicId, date || new Date().toISOString());
  }

  @Get(':id')
  findOne(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.agendaService.findOne(clinicId, id);
  }

  @Post()
  create(@ClinicId() clinicId: string, @Body() dto: any) {
    return this.agendaService.create(clinicId, dto);
  }

  @Patch(':id')
  update(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) {
    return this.agendaService.update(clinicId, id, dto);
  }

  @Delete(':id')
  remove(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.agendaService.remove(clinicId, id);
  }

  @Post(':id/reservation')
  createReservation(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) {
    return this.agendaService.createReservation(clinicId, id, dto);
  }

  @Get(':id/sale')
  getSale(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.agendaService.getSaleForAppointment(clinicId, id);
  }
}
