import { Module } from '@nestjs/common';
import { QuickRepliesService } from './quick-replies.service';
import { QuickRepliesController } from './quick-replies.controller';

@Module({
  providers: [QuickRepliesService],
  controllers: [QuickRepliesController],
  exports: [QuickRepliesService],
})
export class QuickRepliesModule {}
