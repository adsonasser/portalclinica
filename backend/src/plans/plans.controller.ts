import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { PlansService } from './plans.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClinicId } from '../common/decorators/clinic.decorator';

@Controller('plans')
@UseGuards(JwtAuthGuard)
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  findAll(@ClinicId() clinicId: string) { return this.plansService.findAll(clinicId); }

  @Get(':id')
  findOne(@ClinicId() clinicId: string, @Param('id') id: string) { return this.plansService.findOne(clinicId, id); }

  @Post()
  create(@ClinicId() clinicId: string, @Body() dto: any) { return this.plansService.create(clinicId, dto); }

  @Patch(':id')
  update(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) { return this.plansService.update(clinicId, id, dto); }

  @Delete(':id')
  remove(@ClinicId() clinicId: string, @Param('id') id: string) { return this.plansService.remove(clinicId, id); }
}
