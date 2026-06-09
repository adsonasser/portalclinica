import { Module } from '@nestjs/common';
import { OpportunitiesService } from './opportunities.service';
import { OpportunitiesController } from './opportunities.controller';

@Module({ providers: [OpportunitiesService], controllers: [OpportunitiesController] })
export class OpportunitiesModule {}
