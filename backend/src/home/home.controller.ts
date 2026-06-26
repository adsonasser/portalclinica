import { Controller, Get, UseGuards } from '@nestjs/common';
import { HomeService } from './home.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClinicId, CurrentUser } from '../common/decorators/clinic.decorator';

@Controller('home')
@UseGuards(JwtAuthGuard)
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get('summary')
  getSummary(@ClinicId() clinicId: string, @CurrentUser() user: any) {
    return this.homeService.getSummary(clinicId, user.id);
  }
}
