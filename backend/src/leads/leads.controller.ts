import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClinicId } from '../common/decorators/clinic.decorator';

@Controller('leads')
@UseGuards(JwtAuthGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  // Funnels
  @Get('funnels')
  findFunnels(@ClinicId() clinicId: string) { return this.leadsService.findFunnels(clinicId); }

  @Post('funnels')
  createFunnel(@ClinicId() clinicId: string, @Body() dto: any) { return this.leadsService.createFunnel(clinicId, dto); }

  @Patch('funnels/:id')
  updateFunnel(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) { return this.leadsService.updateFunnel(clinicId, id, dto); }

  @Delete('funnels/:id')
  deleteFunnel(@ClinicId() clinicId: string, @Param('id') id: string) { return this.leadsService.deleteFunnel(clinicId, id); }

  @Post('funnels/:funnelId/stages')
  createStage(@ClinicId() clinicId: string, @Param('funnelId') funnelId: string, @Body() dto: any) { return this.leadsService.createStage(clinicId, funnelId, dto); }

  @Patch('funnels/stages/:stageId')
  updateStage(@ClinicId() clinicId: string, @Param('stageId') stageId: string, @Body() dto: any) { return this.leadsService.updateStage(clinicId, stageId, dto); }

  @Delete('funnels/stages/:stageId')
  deleteStage(@ClinicId() clinicId: string, @Param('stageId') stageId: string) { return this.leadsService.deleteStage(clinicId, stageId); }

  // Sources
  @Get('sources')
  findSources(@ClinicId() clinicId: string) { return this.leadsService.findSources(clinicId); }

  @Post('sources')
  createSource(@ClinicId() clinicId: string, @Body() dto: any) { return this.leadsService.createSource(clinicId, dto); }

  @Patch('sources/:id')
  updateSource(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) { return this.leadsService.updateSource(clinicId, id, dto); }

  @Delete('sources/:id')
  deleteSource(@ClinicId() clinicId: string, @Param('id') id: string) { return this.leadsService.deleteSource(clinicId, id); }

  // Loss Reasons
  @Get('loss-reasons')
  findLossReasons(@ClinicId() clinicId: string) { return this.leadsService.findLossReasons(clinicId); }

  @Post('loss-reasons')
  createLossReason(@ClinicId() clinicId: string, @Body() dto: any) { return this.leadsService.createLossReason(clinicId, dto); }

  @Patch('loss-reasons/:id')
  updateLossReason(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) { return this.leadsService.updateLossReason(clinicId, id, dto); }

  @Delete('loss-reasons/:id')
  deleteLossReason(@ClinicId() clinicId: string, @Param('id') id: string) { return this.leadsService.deleteLossReason(clinicId, id); }

  // Stats
  @Get('stats')
  stats(@ClinicId() clinicId: string) { return this.leadsService.stats(clinicId); }

  // Leads CRUD
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

  @Post(':id/convert')
  convertToPatient(@ClinicId() clinicId: string, @Param('id') id: string) { return this.leadsService.convertToPatient(clinicId, id); }

  @Post(':id/mark-lost')
  markLost(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: { lostReason: string }) {
    return this.leadsService.markLost(clinicId, id, dto.lostReason);
  }

  @Post(':id/mark-won')
  markWon(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.leadsService.markWon(clinicId, id);
  }

  @Get(':id/history')
  getHistory(@ClinicId() clinicId: string, @Param('id') id: string) { return this.leadsService.getHistory(clinicId, id); }

  @Post(':id/activities')
  addActivity(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) { return this.leadsService.addActivity(clinicId, id, dto); }

  @Post('import')
  importLeads(@ClinicId() clinicId: string, @Body() dto: { leads: any[] }) { return this.leadsService.importLeads(clinicId, dto.leads); }

  @Delete(':id')
  remove(@ClinicId() clinicId: string, @Param('id') id: string) { return this.leadsService.remove(clinicId, id); }
}
