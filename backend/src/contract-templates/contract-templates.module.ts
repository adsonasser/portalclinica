import { Module } from '@nestjs/common';
import { ContractTemplatesService } from './contract-templates.service';
import { ContractTemplatesController } from './contract-templates.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ContractTemplatesController],
  providers: [ContractTemplatesService],
  exports: [ContractTemplatesService],
})
export class ContractTemplatesModule {}
