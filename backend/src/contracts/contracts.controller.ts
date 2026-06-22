import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClinicId } from '../common/decorators/clinic.decorator';

@Controller('contracts')
@UseGuards(JwtAuthGuard)
export class ContractsController {
  constructor(private readonly service: ContractsService) {}

  @Get()
  findAll(@ClinicId() clinicId: string, @Query() query: any) {
    return this.service.findAll(clinicId, query);
  }

  @Get(':id')
  findOne(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.service.findOne(clinicId, id);
  }

  @Post()
  create(@ClinicId() clinicId: string, @Body() dto: any, @Req() req: any) {
    return this.service.create(clinicId, dto, req.user?.id);
  }

  @Patch(':id')
  update(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) {
    return this.service.update(clinicId, id, dto);
  }

  @Patch(':id/generate')
  generate(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) {
    return this.service.generate(clinicId, id, dto);
  }

  @Delete(':id')
  remove(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.service.remove(clinicId, id);
  }
}
