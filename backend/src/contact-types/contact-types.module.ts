import { Module } from '@nestjs/common';
import { ContactTypesService } from './contact-types.service';
import { ContactTypesController } from './contact-types.controller';

@Module({
  providers: [ContactTypesService],
  controllers: [ContactTypesController],
  exports: [ContactTypesService],
})
export class ContactTypesModule {}
