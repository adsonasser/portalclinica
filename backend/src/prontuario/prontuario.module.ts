import { Module } from '@nestjs/common';
import { ProntuarioService } from './prontuario.service';
import { ProntuarioController } from './prontuario.controller';
import { RolesGuard } from '../common/guards/roles.guard';

@Module({ providers: [ProntuarioService, RolesGuard], controllers: [ProntuarioController] })
export class ProntuarioModule {}
