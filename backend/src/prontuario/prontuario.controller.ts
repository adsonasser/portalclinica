import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ProntuarioService } from './prontuario.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClinicId } from '../common/decorators/clinic.decorator';

@Controller('prontuario')
@UseGuards(JwtAuthGuard)
export class ProntuarioController {
  constructor(private readonly prontuarioService: ProntuarioService) {}

  @Get('patient/:patientId')
  getByPatient(@ClinicId() clinicId: string, @Param('patientId') patientId: string) {
    return this.prontuarioService.getByPatient(clinicId, patientId);
  }

  @Post('evolution/:patientId')
  createEvolution(@ClinicId() clinicId: string, @Param('patientId') patientId: string, @Body() dto: any) {
    return this.prontuarioService.createEvolution(clinicId, patientId, dto);
  }

  @Patch('evolution/:id')
  updateEvolution(@Param('id') id: string, @Body() dto: any) { return this.prontuarioService.updateEvolution(id, dto); }

  @Delete('evolution/:id')
  deleteEvolution(@Param('id') id: string) { return this.prontuarioService.deleteEvolution(id); }

  @Post('prescription/:patientId')
  createPrescription(@ClinicId() clinicId: string, @Param('patientId') patientId: string, @Body() dto: any) {
    return this.prontuarioService.createPrescription(clinicId, patientId, dto);
  }

  @Delete('prescription/:id')
  deletePrescription(@Param('id') id: string) { return this.prontuarioService.deletePrescription(id); }

  @Post('anamnesis/:patientId')
  saveAnamnesis(@ClinicId() clinicId: string, @Param('patientId') patientId: string, @Body('answers') answers: any) {
    return this.prontuarioService.saveAnamnesis(clinicId, patientId, answers);
  }

  @Post('note/:patientId')
  createNote(@ClinicId() clinicId: string, @Param('patientId') patientId: string, @Body() dto: any) {
    return this.prontuarioService.createNote(clinicId, patientId, dto);
  }

  @Patch('note/:id')
  updateNote(@Param('id') id: string, @Body() dto: any) { return this.prontuarioService.updateNote(id, dto); }

  @Delete('note/:id')
  deleteNote(@Param('id') id: string) { return this.prontuarioService.deleteNote(id); }

  // ── Modelos de documentos ──────────────────────────────────────────────────

  @Get('doc-templates')
  listDocTemplates(
    @ClinicId() clinicId: string,
    @Query('prontuario') prontuario?: string,
  ) {
    return this.prontuarioService.listDocTemplates(clinicId, prontuario === 'true');
  }

  @Post('doc-templates')
  createDocTemplate(@ClinicId() clinicId: string, @Body() dto: any) {
    return this.prontuarioService.createDocTemplate(clinicId, dto);
  }

  @Patch('doc-templates/:id')
  updateDocTemplate(@Param('id') id: string, @Body() dto: any) {
    return this.prontuarioService.updateDocTemplate(id, dto);
  }

  @Delete('doc-templates/:id')
  deleteDocTemplate(@Param('id') id: string) {
    return this.prontuarioService.deleteDocTemplate(id);
  }

  // ── Documentos do paciente ─────────────────────────────────────────────────

  @Get('patient-documents/:patientId')
  listPatientDocuments(@ClinicId() clinicId: string, @Param('patientId') patientId: string) {
    return this.prontuarioService.listPatientDocuments(clinicId, patientId);
  }

  @Post('patient-documents/:patientId')
  savePatientDocument(
    @ClinicId() clinicId: string,
    @Param('patientId') patientId: string,
    @Body() dto: any,
  ) {
    return this.prontuarioService.savePatientDocument(clinicId, patientId, dto);
  }
}
