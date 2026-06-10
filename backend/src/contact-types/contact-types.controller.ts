import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ContactTypesService } from './contact-types.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClinicId } from '../common/decorators/clinic.decorator';

@Controller('contact-types')
@UseGuards(JwtAuthGuard)
export class ContactTypesController {
  constructor(private readonly contactTypesService: ContactTypesService) {}

  @Get()
  findAll(@ClinicId() clinicId: string) {
    return this.contactTypesService.findAll(clinicId);
  }

  @Post()
  create(@ClinicId() clinicId: string, @Body() dto: any) {
    return this.contactTypesService.create(clinicId, dto);
  }

  @Patch(':id')
  update(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) {
    return this.contactTypesService.update(clinicId, id, dto);
  }

  @Delete(':id')
  remove(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.contactTypesService.remove(clinicId, id);
  }
}
