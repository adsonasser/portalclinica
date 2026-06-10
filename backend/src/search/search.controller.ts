import { Controller, Get, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClinicId, CurrentUser } from '../common/decorators/clinic.decorator';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(
    @ClinicId() clinicId: string,
    @CurrentUser() user: any,
    @Query('q') q: string,
  ) {
    if (!q || q.trim().length < 2) {
      throw new BadRequestException('O termo de busca deve ter pelo menos 2 caracteres.');
    }
    return this.searchService.search(clinicId, user.sub, user.role, q.trim());
  }
}
