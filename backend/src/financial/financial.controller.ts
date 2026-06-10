import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { FinancialService } from './financial.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClinicId } from '../common/decorators/clinic.decorator';

@Controller('financial')
@UseGuards(JwtAuthGuard)
export class FinancialController {
  constructor(private readonly financialService: FinancialService) {}

  @Get('summary')
  summary(@ClinicId() clinicId: string) { return this.financialService.summary(clinicId); }

  @Get('dre')
  dre(@ClinicId() clinicId: string, @Query('year') year: string, @Query('month') month?: string) {
    return this.financialService.dre(clinicId, Number(year) || new Date().getFullYear(), month ? Number(month) : undefined);
  }

  @Get('transactions')
  findTransactions(@ClinicId() clinicId: string, @Query() query: any) { return this.financialService.findTransactions(clinicId, query); }

  @Post('transactions')
  createTransaction(@ClinicId() clinicId: string, @Body() dto: any) { return this.financialService.createTransaction(clinicId, dto); }

  @Patch('transactions/:id')
  updateTransaction(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) { return this.financialService.updateTransaction(clinicId, id, dto); }

  @Post('transactions/:id/receive')
  receiveTransaction(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) { return this.financialService.receiveTransaction(clinicId, id, dto); }

  @Delete('transactions/:id')
  deleteTransaction(@ClinicId() clinicId: string, @Param('id') id: string) { return this.financialService.deleteTransaction(clinicId, id); }

  @Get('categories')
  findCategories(@ClinicId() clinicId: string) { return this.financialService.findCategories(clinicId); }

  @Post('categories/ensure-defaults')
  ensureDefaultCategory(@ClinicId() clinicId: string) { return this.financialService.ensureDefaultCategory(clinicId); }

  @Post('categories')
  createCategory(@ClinicId() clinicId: string, @Body() dto: any) { return this.financialService.createCategory(clinicId, dto); }

  @Patch('categories/:id')
  updateCategory(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) { return this.financialService.updateCategory(clinicId, id, dto); }

  @Delete('categories/:id')
  deleteCategory(@ClinicId() clinicId: string, @Param('id') id: string) { return this.financialService.deleteCategory(clinicId, id); }

  @Get('payment-methods')
  findPaymentMethods(@ClinicId() clinicId: string) { return this.financialService.findPaymentMethods(clinicId); }

  @Post('payment-methods')
  createPaymentMethod(@ClinicId() clinicId: string, @Body() dto: any) { return this.financialService.createPaymentMethod(clinicId, dto); }

  @Patch('payment-methods/:id')
  updatePaymentMethod(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) { return this.financialService.updatePaymentMethod(clinicId, id, dto); }

  @Delete('payment-methods/:id')
  deletePaymentMethod(@ClinicId() clinicId: string, @Param('id') id: string) { return this.financialService.deletePaymentMethod(clinicId, id); }
}
