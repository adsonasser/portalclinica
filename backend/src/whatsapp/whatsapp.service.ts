import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits || digits.length < 8) return digits;
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

@Injectable()
export class WhatsAppService {
  constructor(private prisma: PrismaService) {}

  async getConfig(clinicId: string) {
    const cfg = await this.prisma.whatsAppConfig.findUnique({ where: { clinicId } });
    if (!cfg) return null;
    return { ...cfg, apiKey: cfg.apiKey ? '***' : '' };
  }

  async saveConfig(clinicId: string, data: {
    baseUrl: string;
    apiKey?: string;
    instanceName: string;
    active: boolean;
    webhookUrl?: string;
  }) {
    const existing = await this.prisma.whatsAppConfig.findUnique({ where: { clinicId } });
    const saveData: any = {
      baseUrl: data.baseUrl.replace(/\/$/, ''),
      instanceName: data.instanceName,
      active: data.active,
      webhookUrl: data.webhookUrl || null,
    };
    if (data.apiKey && data.apiKey !== '***') {
      saveData.apiKey = data.apiKey;
    }
    if (existing) {
      return this.prisma.whatsAppConfig.update({ where: { clinicId }, data: saveData });
    }
    if (!data.apiKey) throw new BadRequestException('API Key obrigatória na primeira configuração');
    return this.prisma.whatsAppConfig.create({
      data: { clinicId, apiKey: data.apiKey, ...saveData },
    });
  }

  async generateQrCode(clinicId: string) {
    const cfg = await this.prisma.whatsAppConfig.findUnique({ where: { clinicId } });
    if (!cfg) throw new NotFoundException('WhatsApp não configurado');

    const headers: any = { apikey: cfg.apiKey, 'Content-Type': 'application/json' };

    // Try creating the instance (idempotent — ignores if already exists)
    try {
      const body: any = { instanceName: cfg.instanceName, qrcode: true };
      if (cfg.webhookUrl) {
        body.webhook = { url: cfg.webhookUrl, events: ['messages.upsert', 'connection.update'] };
      }
      await fetch(`${cfg.baseUrl}/instance/create`, {
        method: 'POST', headers, body: JSON.stringify(body),
      });
    } catch { /* instance may already exist */ }

    const res = await fetch(`${cfg.baseUrl}/instance/connect/${cfg.instanceName}`, { headers });
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

  async getConnectionStatus(clinicId: string) {
    const cfg = await this.prisma.whatsAppConfig.findUnique({ where: { clinicId } });
    if (!cfg) return { connected: false, status: 'not_configured' };

    try {
      const headers: any = { apikey: cfg.apiKey };
      const res = await fetch(`${cfg.baseUrl}/instance/connectionState/${cfg.instanceName}`, { headers });
      if (!res.ok) return { connected: false, status: 'error' };
      const data: any = await res.json();
      const connected = data?.instance?.state === 'open';
      await this.prisma.whatsAppConfig.update({ where: { clinicId }, data: { connected } });
      return { connected, status: data?.instance?.state || 'unknown' };
    } catch {
      return { connected: false, status: 'error' };
    }
  }

  async disconnect(clinicId: string) {
    const cfg = await this.prisma.whatsAppConfig.findUnique({ where: { clinicId } });
    if (!cfg) throw new NotFoundException('WhatsApp não configurado');

    try {
      await fetch(`${cfg.baseUrl}/instance/logout/${cfg.instanceName}`, {
        method: 'DELETE', headers: { apikey: cfg.apiKey },
      });
    } catch { /* ignore */ }

    await this.prisma.whatsAppConfig.update({ where: { clinicId }, data: { connected: false } });
    return { success: true };
  }

  async sendTextMessage(clinicId: string, phone: string, text: string) {
    const cfg = await this.prisma.whatsAppConfig.findUnique({ where: { clinicId } });
    if (!cfg) throw new BadRequestException('WhatsApp não configurado');
    if (!cfg.connected) throw new BadRequestException('WhatsApp desconectado. Reconecte antes de enviar mensagens.');

    const number = normalizePhone(phone);
    if (!number || number.length < 10) throw new BadRequestException('Número de telefone inválido');

    const headers: any = { apikey: cfg.apiKey, 'Content-Type': 'application/json' };
    const res = await fetch(`${cfg.baseUrl}/message/sendText/${cfg.instanceName}`, {
      method: 'POST', headers, body: JSON.stringify({ number, text }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => 'Erro desconhecido');
      throw new BadRequestException(`Falha ao enviar: ${err}`);
    }

    return await res.json();
  }

  // Called by webhooks to mark as connected
  async markConnected(clinicId: string, connected: boolean) {
    await this.prisma.whatsAppConfig.updateMany({ where: { clinicId }, data: { connected } });
  }

  async findConfigByInstance(instanceName: string) {
    return this.prisma.whatsAppConfig.findFirst({ where: { instanceName } });
  }
}
