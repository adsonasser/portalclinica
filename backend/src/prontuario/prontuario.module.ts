import { Module } from '@nestjs/common';
import { ProntuarioService } from './prontuario.service';
import { ProntuarioController } from './prontuario.controller';

@Module({ providers: [ProntuarioService], controllers: [ProntuarioController] })
export class ProntuarioModule {}
