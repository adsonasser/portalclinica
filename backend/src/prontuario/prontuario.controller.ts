import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ProntuarioService } from './prontuario.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ClinicId } from '../common/decorators/clinic.decorator';

const WRITE_ROLES = ['PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'];

@Controller('prontuario')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProntuarioController {
  constructor(private readonly prontuarioService: ProntuarioService) {}

  @Get('patient/:patientId')
  getByPatient(@ClinicId() clinicId: string, @Param('patientId') patientId: string) {
    return this.prontuarioService.getByPatient(clinicId, patientId);
  }

  @Post('evolution/:patientId')
  @Roles(...WRITE_ROLES)
  createEvolution(@ClinicId() clinicId: string, @Param('patientId') patientId: string, @Body() dto: any) {
    return this.prontuarioService.createEvolution(clinicId, patientId, dto);
  }

  @Post('draft/:patientId')
  @Roles(...WRITE_ROLES)
  saveDraft(@ClinicId() clinicId: string, @Param('patientId') patientId: string, @Body('content') content: string) {
    return this.prontuarioService.saveDraft(clinicId, patientId, content);
  }

  @Delete('draft/:patientId')
  @Roles(...WRITE_ROLES)
  deleteDraft(@ClinicId() clinicId: string, @Param('patientId') patientId: string) {
    return this.prontuarioService.deleteDraft(clinicId, patientId);
  }

  @Patch('evolution/:id')
  @Roles(...WRITE_ROLES)
  updateEvolution(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) {
    return this.prontuarioService.updateEvolution(clinicId, id, dto);
  }

  @Delete('evolution/:id')
  @Roles(...WRITE_ROLES)
  deleteEvolution(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.prontuarioService.deleteEvolution(clinicId, id);
  }

  @Post('prescription/:patientId')
  @Roles(...WRITE_ROLES)
  createPrescription(@ClinicId() clinicId: string, @Param('patientId') patientId: string, @Body() dto: any) {
    return this.prontuarioService.createPrescription(clinicId, patientId, dto);
  }

  @Delete('prescription/:id')
  @Roles(...WRITE_ROLES)
  deletePrescription(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.prontuarioService.deletePrescription(clinicId, id);
  }

  @Post('anamnesis/:patientId')
  @Roles(...WRITE_ROLES)
  saveAnamnesis(@ClinicId() clinicId: string, @Param('patientId') patientId: string, @Body('answers') answers: any) {
    return this.prontuarioService.saveAnamnesis(clinicId, patientId, answers);
  }

  @Post('note/:patientId')
  createNote(@ClinicId() clinicId: string, @Param('patientId') patientId: string, @Body() dto: any) {
    return this.prontuarioService.createNote(clinicId, patientId, dto);
  }

  @Patch('note/:id')
  updateNote(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) {
    return this.prontuarioService.updateNote(clinicId, id, dto);
  }

  @Delete('note/:id')
  deleteNote(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.prontuarioService.deleteNote(clinicId, id);
  }

  // ── Modelos de documentos ──────────────────────────────────────────────────

  @Get('doc-templates')
  listDocTemplates(@ClinicId() clinicId: string, @Query('prontuario') prontuario?: string) {
    return this.prontuarioService.listDocTemplates(clinicId, prontuario === 'true');
  }

  @Post('doc-templates')
  @Roles(...WRITE_ROLES)
  createDocTemplate(@ClinicId() clinicId: string, @Body() dto: any) {
    return this.prontuarioService.createDocTemplate(clinicId, dto);
  }

  @Patch('doc-templates/:id')
  @Roles(...WRITE_ROLES)
  updateDocTemplate(@ClinicId() clinicId: string, @Param('id') id: string, @Body() dto: any) {
    return this.prontuarioService.updateDocTemplate(clinicId, id, dto);
  }

  @Delete('doc-templates/:id')
  @Roles(...WRITE_ROLES)
  deleteDocTemplate(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.prontuarioService.deleteDocTemplate(clinicId, id);
  }

  // ── Documentos do paciente ─────────────────────────────────────────────────

  @Get('patient-documents/:patientId')
  listPatientDocuments(@ClinicId() clinicId: string, @Param('patientId') patientId: string) {
    return this.prontuarioService.listPatientDocuments(clinicId, patientId);
  }

  @Post('patient-documents/:patientId')
  @Roles(...WRITE_ROLES)
  savePatientDocument(@ClinicId() clinicId: string, @Param('patientId') patientId: string, @Body() dto: any) {
    return this.prontuarioService.savePatientDocument(clinicId, patientId, dto);
  }
}
