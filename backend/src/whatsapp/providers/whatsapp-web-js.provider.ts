import { BadRequestException } from '@nestjs/common';
import { IWhatsAppProvider, QrCodeResult, SendResult, StatusResult } from './whatsapp-provider.interface';

const NOT_READY_MSG =
  'Este servidor ainda não está preparado para executar WhatsApp Web JS. ' +
  'Instale o pacote whatsapp-web.js e configure Puppeteer no ambiente do servidor.';

export class WhatsAppWebJsProvider implements IWhatsAppProvider {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async connect(_clinicId: string, _integration: any): Promise<QrCodeResult> {
    throw new BadRequestException(NOT_READY_MSG);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getConnectionStatus(_clinicId: string, _integration: any): Promise<StatusResult> {
    return { connected: false, status: 'not_ready' };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async disconnect(_clinicId: string, _integration: any): Promise<void> {
    // no-op
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async sendTextMessage(_clinicId: string, _integration: any, _phone: string, _text: string): Promise<SendResult> {
    throw new BadRequestException(NOT_READY_MSG);
  }
}
