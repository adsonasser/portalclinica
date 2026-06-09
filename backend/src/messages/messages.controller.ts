import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClinicId, CurrentUser } from '../common/decorators/clinic.decorator';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  findAll(@ClinicId() clinicId: string, @Query() query: any) { return this.messagesService.findAll(clinicId, query); }

  @Post()
  create(@ClinicId() clinicId: string, @CurrentUser() user: any, @Body() dto: any) { return this.messagesService.create(clinicId, user.id, dto); }

  @Get('templates')
  findTemplates(@ClinicId() clinicId: string) { return this.messagesService.findTemplates(clinicId); }

  @Post('templates')
  createTemplate(@ClinicId() clinicId: string, @Body() dto: any) { return this.messagesService.createTemplate(clinicId, dto); }

  @Patch('templates/:id')
  updateTemplate(@Param('id') id: string, @Body() dto: any) { return this.messagesService.updateTemplate(id, dto); }

  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string) { return this.messagesService.deleteTemplate(id); }
}
