import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { OpportunitiesService } from './opportunities.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClinicId } from '../common/decorators/clinic.decorator';

@Controller('opportunities')
@UseGuards(JwtAuthGuard)
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @Get()
  findAll(@ClinicId() clinicId: string, @Query() query: any) { return this.opportunitiesService.findAll(clinicId, query); }

  @Post()
  create(@ClinicId() clinicId: string, @Body() dto: any) { return this.opportunitiesService.create(clinicId, dto); }

  @Patch(':id')
  update(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) { return this.opportunitiesService.update(clinicId, id, dto); }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.opportunitiesService.remove(id); }
}
