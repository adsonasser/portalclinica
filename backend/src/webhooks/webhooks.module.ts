import { Module } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { ConversationsModule } from '../conversations/conversations.module';

@Module({
  imports: [WhatsAppModule, ConversationsModule],
  providers: [WebhooksService],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
