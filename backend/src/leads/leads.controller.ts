import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClinicId } from '../common/decorators/clinic.decorator';

@Controller('leads')
@UseGuards(JwtAuthGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get('funnels')
  findFunnels(@ClinicId() clinicId: string) { return this.leadsService.findFunnels(clinicId); }

  @Post('funnels')
  createFunnel(@ClinicId() clinicId: string, @Body() dto: any) { return this.leadsService.createFunnel(clinicId, dto); }

  @Patch('funnels/:id')
  updateFunnel(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) { return this.leadsService.updateFunnel(clinicId, id, dto); }

  @Get('stats')
  stats(@ClinicId() clinicId: string) { return this.leadsService.stats(clinicId); }

  @Get()
  findAll(@ClinicId() clinicId: string, @Query() query: any) { return this.leadsService.findAll(clinicId, query); }

  @Get(':id')
  findOne(@ClinicId() clinicId: string, @Param('id') id: string) { return this.leadsService.findOne(clinicId, id); }

  @Post()
  create(@ClinicId() clinicId: string, @Body() dto: any) { return this.leadsService.create(clinicId, dto); }

  @Patch(':id')
  update(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) { return this.leadsService.update(clinicId, id, dto); }

  @Patch(':id/move')
  moveStage(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: { stageId: string; stageOrder: number }) {
    return this.leadsService.moveStage(clinicId, id, dto.stageId, dto.stageOrder);
  }

  @Delete(':id')
  remove(@ClinicId() clinicId: string, @Param('id') id: string) { return this.leadsService.remove(clinicId, id); }
}
