import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { AccessProfilesService } from './access-profiles.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClinicId } from '../common/decorators/clinic.decorator';

@Controller('access-profiles')
@UseGuards(JwtAuthGuard)
export class AccessProfilesController {
  constructor(private readonly service: AccessProfilesService) {}

  @Get()
  findAll(@ClinicId() clinicId: string) {
    return this.service.findAll(clinicId);
  }

  @Get(':id')
  findOne(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.service.findOne(clinicId, id);
  }

  @Post()
  create(@ClinicId() clinicId: string, @Body() dto: any) {
    return this.service.create(clinicId, dto);
  }

  @Post('seed-defaults')
  seedDefaults(@ClinicId() clinicId: string) {
    return this.service.seedDefaults(clinicId);
  }

  @Post(':id/duplicate')
  duplicate(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.service.duplicate(clinicId, id);
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
