import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClinicId } from '../common/decorators/clinic.decorator';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('stats')
  getStats(@ClinicId() clinicId: string) { return this.tasksService.getStats(clinicId); }

  @Get('post-its')
  findPostIts(@ClinicId() clinicId: string) { return this.tasksService.findPostIts(clinicId); }

  @Post('post-its')
  createPostIt(@ClinicId() clinicId: string, @Body() dto: any) { return this.tasksService.createPostIt(clinicId, dto); }

  @Patch('post-its/:id')
  updatePostIt(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) { return this.tasksService.updatePostIt(clinicId, id, dto); }

  @Delete('post-its/:id')
  deletePostIt(@ClinicId() clinicId: string, @Param('id') id: string) { return this.tasksService.deletePostIt(clinicId, id); }

  @Get()
  findAll(@ClinicId() clinicId: string, @Query() query: any) { return this.tasksService.findAll(clinicId, query); }

  @Post()
  create(@ClinicId() clinicId: string, @Body() dto: any) { return this.tasksService.create(clinicId, dto); }

  @Patch(':id')
  update(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) { return this.tasksService.update(clinicId, id, dto); }

  @Delete(':id')
  remove(@ClinicId() clinicId: string, @Param('id') id: string) { return this.tasksService.remove(clinicId, id); }
}
