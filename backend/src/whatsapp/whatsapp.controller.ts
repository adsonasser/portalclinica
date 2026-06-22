import { Controller, Get, Post, Body, UseGuards, Query } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClinicId } from '../common/decorators/clinic.decorator';

@Controller('integrations/whatsapp')
@UseGuards(JwtAuthGuard)
export class WhatsAppController {
  constructor(private readonly whatsAppService: WhatsAppService) {}

  @Get()
  getConfig(@ClinicId() clinicId: string, @Query('provider') provider?: string) {
    if (provider) {
      return this.whatsAppService.getIntegration(clinicId, provider);
    }
    return this.whatsAppService.getConfig(clinicId);
  }

  @Get('all')
  getAllIntegrations(@ClinicId() clinicId: string) {
    return this.whatsAppService.getAllIntegrations(clinicId);
  }

  @Post()
  saveConfig(@ClinicId() clinicId: string, @Body() dto: any) {
    return this.whatsAppService.saveConfig(clinicId, dto);
  }

  @Post('qrcode')
  generateQrCode(@ClinicId() clinicId: string) {
    return this.whatsAppService.generateQrCode(clinicId);
  }

  @Get('status')
  getStatus(@ClinicId() clinicId: string) {
    return this.whatsAppService.getConnectionStatus(clinicId);
  }

  @Post('disconnect')
  disconnect(@ClinicId() clinicId: string) {
    return this.whatsAppService.disconnect(clinicId);
  }
}
