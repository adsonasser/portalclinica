import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ContractTemplatesService } from './contract-templates.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClinicId } from '../common/decorators/clinic.decorator';

@Controller('contract-templates')
@UseGuards(JwtAuthGuard)
export class ContractTemplatesController {
  constructor(private readonly service: ContractTemplatesService) {}

  @Get()
  findAll(@ClinicId() clinicId: string) { return this.service.findAll(clinicId); }

  @Get(':id')
  findOne(@ClinicId() clinicId: string, @Param('id') id: string) { return this.service.findOne(clinicId, id); }

  @Post()
  create(@ClinicId() clinicId: string, @Body() dto: any) { return this.service.create(clinicId, dto); }

  @Patch(':id')
  update(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) { return this.service.update(clinicId, id, dto); }

  @Delete(':id')
  remove(@ClinicId() clinicId: string, @Param('id') id: string) { return this.service.remove(clinicId, id); }
}
