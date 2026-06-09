import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { AdminService } from './admin.service';
import { SuperAdminGuard } from './guards/super-admin.guard';

@Controller('admin')
@UseGuards(SuperAdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── Dashboard ──────────────────────────────────────────────────────────────

  @Get('dashboard')
  getDashboard() {
    return this.adminService.getDashboardStats();
  }

  // ─── Clinics ────────────────────────────────────────────────────────────────

  @Get('clinics')
  findAllClinics(@Query() query: any) {
    return this.adminService.findAllClinics(query);
  }

  @Post('clinics')
  createClinic(@Body() body: any, @Req() req: any) {
    return this.adminService.createClinic(body);
  }

  @Get('clinics/:id')
  findClinic(@Param('id') id: string) {
    return this.adminService.findClinic(id);
  }

  @Patch('clinics/:id')
  updateClinic(@Param('id') id: string, @Body() body: any) {
    return this.adminService.updateClinic(id, body);
  }

  @Patch('clinics/:id/status')
  updateStatus(@Param('id') id: string, @Body() body: { status: string }, @Req() req: any) {
    return this.adminService.updateStatus(id, body.status, req.user.sub);
  }

  @Get('clinics/:id/users')
  getClinicUsers(@Param('id') id: string) {
    return this.adminService.getClinicUsers(id);
  }

  @Get('clinics/:id/metrics')
  getClinicMetrics(@Param('id') id: string) {
    return this.adminService.getClinicMetrics(id);
  }

  @Post('clinics/:id/impersonate')
  impersonate(@Param('id') id: string, @Req() req: any) {
    return this.adminService.impersonate(id, req.user.sub);
  }

  @Post('clinics/:id/subscription')
  upsertSubscription(@Param('id') id: string, @Body() body: any) {
    return this.adminService.upsertSubscription(id, body);
  }

  // ─── Pricing Plans ───────────────────────────────────────────────────────────

  @Get('plans')
  findAllPlans() {
    return this.adminService.findAllPlans();
  }

  @Post('plans')
  createPlan(@Body() body: any) {
    return this.adminService.createPlan(body);
  }

  @Patch('plans/:id')
  updatePlan(@Param('id') id: string, @Body() body: any) {
    return this.adminService.updatePlan(id, body);
  }

  // ─── Audit Logs ──────────────────────────────────────────────────────────────

  @Get('audit-logs')
  getAuditLogs(@Query('clinicId') clinicId?: string) {
    return this.adminService.getAuditLogs(clinicId);
  }
}
