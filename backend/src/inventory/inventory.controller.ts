import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClinicId } from '../common/decorators/clinic.decorator';

@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('stats')
  stats(@ClinicId() clinicId: string) { return this.inventoryService.stats(clinicId); }

  @Get('products')
  findProducts(@ClinicId() clinicId: string, @Query() query: any) { return this.inventoryService.findProducts(clinicId, query); }

  @Get('products/:id')
  findProduct(@ClinicId() clinicId: string, @Param('id') id: string) { return this.inventoryService.findProduct(clinicId, id); }

  @Post('products')
  createProduct(@ClinicId() clinicId: string, @Body() dto: any) { return this.inventoryService.createProduct(clinicId, dto); }

  @Patch('products/:id')
  updateProduct(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) { return this.inventoryService.updateProduct(clinicId, id, dto); }

  @Delete('products/:id')
  deleteProduct(@ClinicId() clinicId: string, @Param('id') id: string) { return this.inventoryService.deleteProduct(clinicId, id); }

  @Get('movements')
  findMovements(@ClinicId() clinicId: string, @Query() query: any) { return this.inventoryService.findMovements(clinicId, query); }

  @Post('movements')
  createMovement(@ClinicId() clinicId: string, @Body() dto: any) { return this.inventoryService.createMovement(clinicId, dto); }

  @Get('expiry')
  findExpiryMovements(@ClinicId() clinicId: string) { return this.inventoryService.findExpiryMovements(clinicId); }

  @Get('movement-stats')
  movementStats(@ClinicId() clinicId: string, @Query() query: any) { return this.inventoryService.movementStats(clinicId, query); }

  @Get('categories')
  findCategories(@ClinicId() clinicId: string) { return this.inventoryService.findCategories(clinicId); }

  @Post('categories')
  createCategory(@ClinicId() clinicId: string, @Body() dto: any) { return this.inventoryService.createCategory(clinicId, dto); }

  @Get('suppliers')
  findSuppliers(@ClinicId() clinicId: string) { return this.inventoryService.findSuppliers(clinicId); }

  @Post('suppliers')
  createSupplier(@ClinicId() clinicId: string, @Body() dto: any) { return this.inventoryService.createSupplier(clinicId, dto); }

  @Patch('suppliers/:id')
  updateSupplier(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) { return this.inventoryService.updateSupplier(clinicId, id, dto); }
}
