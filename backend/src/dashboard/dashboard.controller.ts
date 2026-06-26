import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClinicId } from '../common/decorators/clinic.decorator';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  getStats(@ClinicId() clinicId: string) { return this.dashboardService.getStats(clinicId); }

  @Get('chart')
  getChartData(@ClinicId() clinicId: string, @Query('months') months?: string) {
    return this.dashboardService.getChartData(clinicId, Number(months) || 6);
  }

  @Get('360')
  getDashboard360(
    @ClinicId() clinicId: string,
    @Query('period') period?: string,
    @Query('professionalId') professionalId?: string,
  ) {
    return this.dashboardService.getDashboard360(clinicId, period, professionalId);
  }
}
