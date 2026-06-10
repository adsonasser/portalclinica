import { Controller, Post, Body } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';

// No JwtAuthGuard — this endpoint is called by Evolution API externally
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('evolution/whatsapp')
  handleEvolution(@Body() payload: any) {
    return this.webhooksService.handleEvolutionWebhook(payload);
  }
}
