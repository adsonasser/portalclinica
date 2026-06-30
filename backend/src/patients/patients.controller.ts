import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClinicId } from '../common/decorators/clinic.decorator';

@Controller('patients')
@UseGuards(JwtAuthGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  findAll(@ClinicId() clinicId: string, @Query() query: any) {
    return this.patientsService.findAll(clinicId, query);
  }

  @Get('stats')
  stats(@ClinicId() clinicId: string) {
    return this.patientsService.stats(clinicId);
  }

  @Get(':id')
  findOne(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.patientsService.findOne(clinicId, id);
  }

  @Post()
  create(@ClinicId() clinicId: string, @Body() dto: any) {
    return this.patientsService.create(clinicId, dto);
  }

  @Post('import')
  importMany(@ClinicId() clinicId: string, @Body() body: { patients: any[] }) {
    return this.patientsService.importMany(clinicId, body.patients);
  }

  @Patch(':id')
  update(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) {
    return this.patientsService.update(clinicId, id, dto);
  }

  @Delete(':id')
  remove(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.patientsService.remove(clinicId, id);
  }
}
