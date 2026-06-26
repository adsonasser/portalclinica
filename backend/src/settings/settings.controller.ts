import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClinicId } from '../common/decorators/clinic.decorator';
import { SettingsService } from './settings.service';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('overview')
  getOverview(@ClinicId() clinicId: string) {
    return this.settingsService.getOverview(clinicId);
  }

  @Get('clinic-info')
  getClinicInfo(@ClinicId() clinicId: string) {
    return this.settingsService.getClinicInfo(clinicId);
  }

  @Patch('clinic-info')
  updateClinicInfo(@ClinicId() clinicId: string, @Body() dto: any) {
    return this.settingsService.updateClinicInfo(clinicId, dto);
  }
}
