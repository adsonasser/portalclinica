import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { QuickRepliesService } from './quick-replies.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClinicId, CurrentUser } from '../common/decorators/clinic.decorator';

@Controller('quick-replies')
@UseGuards(JwtAuthGuard)
export class QuickRepliesController {
  constructor(private readonly service: QuickRepliesService) {}

  @Get()
  findAll(@ClinicId() clinicId: string, @Query('active') active?: string) {
    return this.service.findAll(clinicId, active === 'true');
  }

  @Post()
  create(@ClinicId() clinicId: string, @CurrentUser() user: any, @Body() dto: any) {
    return this.service.create(clinicId, user.id, dto);
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
