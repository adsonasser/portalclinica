import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { SalesService } from './sales.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClinicId } from '../common/decorators/clinic.decorator';

@Controller('sales')
@UseGuards(JwtAuthGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  findAll(@ClinicId() clinicId: string, @Query() query: any) {
    return this.salesService.findAll(clinicId, query);
  }

  @Get('stats')
  stats(@ClinicId() clinicId: string) {
    return this.salesService.stats(clinicId);
  }

  @Get(':id')
  findOne(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.salesService.findOne(clinicId, id);
  }

  @Post()
  create(@ClinicId() clinicId: string, @Body() dto: any) {
    return this.salesService.create(clinicId, dto);
  }

  @Post(':id/receive')
  receive(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) {
    return this.salesService.receive(clinicId, id, dto);
  }

  @Post(':id/generate-sessions')
  generateSessions(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.salesService.generateSessions(clinicId, id);
  }

  @Patch(':id/status')
  updateStatus(@ClinicId() clinicId: string, @Param('id') id: string, @Body('status') status: string) {
    return this.salesService.updateStatus(clinicId, id, status);
  }
}
