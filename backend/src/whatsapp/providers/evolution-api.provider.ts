import { BadRequestException } from '@nestjs/common';
import { IWhatsAppProvider, QrCodeResult, SendResult, StatusResult } from './whatsapp-provider.interface';
import { normalizePhone } from '../whatsapp.service';

export class EvolutionApiProvider implements IWhatsAppProvider {
  private getConfig(integration: any): { baseUrl: string; apiKey: string; instanceName: string; webhookUrl?: string } {
    const raw = integration.configEncrypted ? JSON.parse(integration.configEncrypted) : {};
    // Support both new Integration.configEncrypted and legacy WhatsAppConfig shape
    return {
      baseUrl: (raw.baseUrl || integration.baseUrl || '').replace(/\/$/, ''),
      apiKey: raw.apiKey || integration.apiKey || '',
      instanceName: raw.instanceName || integration.instanceName || '',
      webhookUrl: raw.webhookUrl || integration.webhookUrl,
    };
  }

  async connect(clinicId: string, integration: any): Promise<QrCodeResult> {
    const { baseUrl, apiKey, instanceName, webhookUrl } = this.getConfig(integration);
    const headers: any = { apikey: apiKey, 'Content-Type': 'application/json' };

    try {
      const body: any = { instanceName, qrcode: true };
      if (webhookUrl) {
        body.webhook = { url: webhookUrl, events: ['messages.upsert', 'connection.update'] };
      }
      await fetch(`${baseUrl}/instance/create`, {
        method: 'POST', headers, body: JSON.stringify(body),
      });
    } catch { /* instance may already exist */ }

    const res = await fetch(`${baseUrl}/instance/connect/${instanceName}`, { headers });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new BadRequestException(`Erro ao conectar à Evolution API: ${text}`);
    }
    const data: any = await res.json();

    return {
      qrcode: data?.qrcode?.base64 || data?.base64 || null,
      code: data?.qrcode?.code || null,
      status: data?.instance?.status || 'connecting',
    };
  }

  async getConnectionStatus(_clinicId: string, integration: any): Promise<StatusResult> {
    const { baseUrl, apiKey, instanceName } = this.getConfig(integration);
    try {
      const res = await fetch(`${baseUrl}/instance/connectionState/${instanceName}`, {
        headers: { apikey: apiKey },
      });
      if (!res.ok) return { connected: false, status: 'error' };
      const data: any = await res.json();
      const connected = data?.instance?.state === 'open';
      return { connected, status: data?.instance?.state || 'unknown' };
    } catch {
      return { connected: false, status: 'error' };
    }
  }

  async disconnect(_clinicId: string, integration: any): Promise<void> {
    const { baseUrl, apiKey, instanceName } = this.getConfig(integration);
    try {
      await fetch(`${baseUrl}/instance/logout/${instanceName}`, {
        method: 'DELETE', headers: { apikey: apiKey },
      });
    } catch { /* ignore */ }
  }

  async sendTextMessage(_clinicId: string, integration: any, phone: string, text: string): Promise<SendResult> {
    const { baseUrl, apiKey, instanceName } = this.getConfig(integration);
    const number = normalizePhone(phone);
    if (!number || number.length < 10) throw new BadRequestException('Número de telefone inválido');

    const res = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number, text }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => 'Erro desconhecido');
      throw new BadRequestException(`Falha ao enviar via Evolution API: ${err}`);
    }

    const result: any = await res.json();
    return { messageId: result?.key?.id || result?.messageId, status: 'sent' };
  }
}
