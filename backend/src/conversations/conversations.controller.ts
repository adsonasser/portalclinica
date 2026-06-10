import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClinicId, CurrentUser } from '../common/decorators/clinic.decorator';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  findAll(@ClinicId() clinicId: string) {
    return this.conversationsService.findAll(clinicId);
  }

  @Get(':id/messages')
  findMessages(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.conversationsService.findMessages(clinicId, id);
  }

  @Post('open')
  openConversation(@ClinicId() clinicId: string, @Body() dto: { contactId: string }) {
    return this.conversationsService.openConversation(clinicId, dto.contactId);
  }

  @Post(':id/send')
  sendMessage(
    @ClinicId() clinicId: string,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: { content: string },
  ) {
    return this.conversationsService.sendMessage(clinicId, id, user.id, dto.content);
  }
}
