import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClinicId } from '../common/decorators/clinic.decorator';
import { RevenueIntelligenceService } from './revenue-intelligence.service';

@Controller('revenue-intelligence')
@UseGuards(JwtAuthGuard)
export class RevenueIntelligenceController {
  constructor(private readonly service: RevenueIntelligenceService) {}

  @Get('summary')
  getSummary(@ClinicId() clinicId: string) {
    return this.service.getSummary(clinicId);
  }
}
