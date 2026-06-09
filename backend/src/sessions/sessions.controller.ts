import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClinicId } from '../common/decorators/clinic.decorator';

@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  findAll(@ClinicId() clinicId: string, @Query() query: any) { return this.sessionsService.findAll(clinicId, query); }

  @Post()
  create(@ClinicId() clinicId: string, @Body() dto: any) { return this.sessionsService.create(clinicId, dto); }

  @Patch(':id')
  update(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) { return this.sessionsService.update(clinicId, id, dto); }

  @Delete(':id')
  remove(@ClinicId() clinicId: string, @Param('id') id: string) { return this.sessionsService.remove(clinicId, id); }
}
