import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { ConversationsService } from '../conversations/conversations.service';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private whatsApp: WhatsAppService,
    private conversations: ConversationsService,
  ) {}

  async handleEvolutionWebhook(payload: any) {
    try {
      const event = payload?.event;
      const instanceName = payload?.instance;

      if (!instanceName) return { ok: true };

      // Handle connection state changes
      if (event === 'connection.update') {
        const state = payload?.data?.state;
        const cfg = await this.whatsApp.findConfigByInstance(instanceName);
        if (cfg) {
          await this.whatsApp.markConnected(cfg.clinicId, state === 'open');
        }
        return { ok: true };
      }

      // Handle incoming messages
      if (event === 'messages.upsert') {
        const msgData = payload?.data;
        if (!msgData) return { ok: true };

        const key = msgData.key || {};
        const fromMe: boolean = key.fromMe === true;

        // Skip outbound messages echoed back by Evolution
        if (fromMe) return { ok: true };

        const remoteJid: string = key.remoteJid || '';
        // Skip group messages
        if (remoteJid.includes('@g.us')) return { ok: true };

        const senderPhone = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
        const providerMessageId: string = key.id || `${Date.now()}`;
        const senderName: string = msgData.pushName || senderPhone;

        // Extract text content
        const msg = msgData.message || {};
        const content: string =
          msg.conversation ||
          msg.extendedTextMessage?.text ||
          msg.imageMessage?.caption ||
          msg.videoMessage?.caption ||
          '[mensagem não suportada]';

        const receivedAt = msgData.messageTimestamp
          ? new Date(Number(msgData.messageTimestamp) * 1000)
          : new Date();

        // Find clinic by instance name
        const cfg = await this.whatsApp.findConfigByInstance(instanceName);
        if (!cfg) {
          this.logger.warn(`No clinic found for instance: ${instanceName}`);
          return { ok: true };
        }

        await this.conversations.receiveMessage(cfg.clinicId, {
          providerMessageId,
          senderPhone,
          senderName,
          content,
          receivedAt,
          instanceName,
        });
      }
    } catch (err: any) {
      this.logger.error('Webhook processing error', err?.message);
    }

    return { ok: true };
  }
}
