import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EvolutionApiProvider } from './providers/evolution-api.provider';
import { WhatsAppWebJsProvider, forceDestroyClient } from './providers/whatsapp-web-js.provider';
import { IWhatsAppProvider } from './providers/whatsapp-provider.interface';

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits || digits.length < 8) return digits;
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

const providers: Record<string, IWhatsAppProvider> = {
  evolution_api: new EvolutionApiProvider(),
  whatsapp_web_js: new WhatsAppWebJsProvider(),
};

@Injectable()
export class WhatsAppService {
  constructor(private prisma: PrismaService) {}

  // ─── Integration (new multi-provider) ─────────────────────────────────────

  async getIntegration(clinicId: string, provider?: string) {
    if (provider) {
      return this.prisma.integration.findUnique({
        where: { clinicId_type_provider: { clinicId, type: 'whatsapp', provider } },
      });
    }
    return this.prisma.integration.findFirst({
      where: { clinicId, type: 'whatsapp', status: { not: 'disabled' } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async saveIntegration(clinicId: string, data: {
    provider: string;
    instanceName?: string;
    baseUrl?: string;
    apiKey?: string;
    webhookUrl?: string;
    active?: boolean;
  }) {
    const { provider, instanceName, baseUrl, apiKey, webhookUrl, active } = data;

    const autoInstance = instanceName || `clinic_${clinicId}`;

    const existing = await this.prisma.integration.findUnique({
      where: { clinicId_type_provider: { clinicId, type: 'whatsapp', provider } },
    });

    // Config blob — only store what each provider needs
    let configEncrypted: string | undefined;
    if (provider === 'evolution_api') {
      const current = existing?.configEncrypted ? JSON.parse(existing.configEncrypted) : {};
      configEncrypted = JSON.stringify({
        baseUrl: (baseUrl || current.baseUrl || '').replace(/\/$/, ''),
        apiKey: (apiKey && apiKey !== '***') ? apiKey : (current.apiKey || ''),
        webhookUrl: webhookUrl || current.webhookUrl || null,
      });
    }
    // whatsapp_web_js needs no external config

    const upsertData = {
      clinicId,
      type: 'whatsapp',
      provider,
      instanceName: autoInstance,
      status: active === false ? 'disabled' : (existing?.status === 'disabled' ? 'not_configured' : (existing?.status ?? 'not_configured')),
      configEncrypted: configEncrypted ?? existing?.configEncrypted ?? null,
    };

    if (existing) {
      return this.prisma.integration.update({
        where: { id: existing.id },
        data: upsertData,
      });
    }
    return this.prisma.integration.create({ data: upsertData });
  }

  // ─── Legacy WhatsAppConfig API (keeps backward compat for Evolution API) ──

  async getConfig(clinicId: string) {
    // Try new Integration first
    const integration = await this.getIntegration(clinicId, 'evolution_api');
    if (integration) {
      const cfg = integration.configEncrypted ? JSON.parse(integration.configEncrypted) : {};
      return {
        provider: 'evolution_api',
        instanceName: integration.instanceName,
        baseUrl: cfg.baseUrl || '',
        apiKey: cfg.apiKey ? '***' : '',
        webhookUrl: cfg.webhookUrl || '',
        active: integration.status !== 'disabled',
        connected: integration.status === 'connected',
        status: integration.status,
      };
    }

    // Fall back to legacy WhatsAppConfig
    const legacy = await this.prisma.whatsAppConfig.findUnique({ where: { clinicId } });
    if (!legacy) return null;
    return {
      provider: 'evolution_api',
      instanceName: legacy.instanceName,
      baseUrl: legacy.baseUrl,
      apiKey: legacy.apiKey ? '***' : '',
      webhookUrl: legacy.webhookUrl || '',
      active: legacy.active,
      connected: legacy.connected,
      status: legacy.connected ? 'connected' : 'not_configured',
    };
  }

  async saveConfig(clinicId: string, data: {
    provider?: string;
    baseUrl?: string;
    apiKey?: string;
    instanceName?: string;
    active?: boolean;
    webhookUrl?: string;
  }) {
    const provider = data.provider || 'evolution_api';
    const result = await this.saveIntegration(clinicId, { provider, ...data });

    // Mirror to legacy WhatsAppConfig for evolution_api so webhooks still work
    if (provider === 'evolution_api' && data.baseUrl && data.instanceName) {
      const cfg = result.configEncrypted ? JSON.parse(result.configEncrypted) : {};
      const legacyExists = await this.prisma.whatsAppConfig.findUnique({ where: { clinicId } });
      const saveData: any = {
        baseUrl: cfg.baseUrl,
        instanceName: result.instanceName,
        active: data.active ?? true,
        webhookUrl: data.webhookUrl || null,
      };
      if (cfg.apiKey) saveData.apiKey = cfg.apiKey;

      if (legacyExists) {
        await this.prisma.whatsAppConfig.update({ where: { clinicId }, data: saveData });
      } else if (cfg.apiKey) {
        await this.prisma.whatsAppConfig.create({ data: { clinicId, ...saveData } });
      }
    }

    return result;
  }

  // ─── Provider-routed operations ────────────────────────────────────────────

  private async _resolveIntegration(clinicId: string) {
    let integration: any = await this.getIntegration(clinicId);
    if (integration) return integration;

    // Fall back to legacy WhatsAppConfig shaped as pseudo-Integration
    const legacy = await this.prisma.whatsAppConfig.findUnique({ where: { clinicId } });
    if (!legacy) throw new NotFoundException('WhatsApp não configurado');
    return { ...legacy, provider: 'evolution_api', configEncrypted: null };
  }

  async generateQrCode(clinicId: string) {
    const integration = await this._resolveIntegration(clinicId);
    const provider = providers[integration.provider] ?? providers['evolution_api'];
    const result = await provider.connect(clinicId, integration);

    await this.prisma.integration.updateMany({
      where: { clinicId, type: 'whatsapp', provider: integration.provider },
      data: { status: 'pending_qr', metadata: { qrGeneratedAt: new Date().toISOString() } as any },
    });

    return result;
  }

  async getConnectionStatus(clinicId: string) {
    let integration: any;
    try {
      integration = await this._resolveIntegration(clinicId);
    } catch {
      return { connected: false, status: 'not_configured' };
    }

    const provider = providers[integration.provider] ?? providers['evolution_api'];
    const result = await provider.getConnectionStatus(clinicId, integration);

    const newStatus = result.connected ? 'connected' : 'disconnected';
    await this.prisma.integration.updateMany({
      where: { clinicId, type: 'whatsapp', provider: integration.provider },
      data: {
        status: newStatus,
        ...(result.connected ? { lastConnectionAt: new Date() } : { lastDisconnectAt: new Date() }),
      },
    });
    // Keep legacy WhatsAppConfig in sync
    await this.prisma.whatsAppConfig.updateMany({
      where: { clinicId },
      data: { connected: result.connected },
    });

    return result;
  }

  async disconnect(clinicId: string) {
    const integration = await this._resolveIntegration(clinicId);
    const provider = providers[integration.provider] ?? providers['evolution_api'];
    await provider.disconnect(clinicId, integration);

    await this.prisma.integration.updateMany({
      where: { clinicId, type: 'whatsapp', provider: integration.provider },
      data: { status: 'disconnected', lastDisconnectAt: new Date() },
    });
    await this.prisma.whatsAppConfig.updateMany({
      where: { clinicId },
      data: { connected: false },
    });

    return { success: true };
  }

  async sendTextMessage(clinicId: string, phone: string, text: string) {
    let integration: any;
    try {
      integration = await this._resolveIntegration(clinicId);
    } catch {
      throw new BadRequestException('WhatsApp não configurado');
    }

    if (integration.status === 'disabled') {
      throw new BadRequestException('Integração WhatsApp desativada');
    }

    // Quick check: for legacy WhatsAppConfig path, check connected flag
    if (!integration.configEncrypted && integration.provider === 'evolution_api') {
      if (!integration.connected) {
        throw new BadRequestException('WhatsApp desconectado. Reconecte antes de enviar mensagens.');
      }
    } else if (integration.status !== 'connected') {
      throw new BadRequestException('WhatsApp desconectado. Reconecte antes de enviar mensagens.');
    }

    const number = normalizePhone(phone);
    if (!number || number.length < 10) throw new BadRequestException('Número de telefone inválido');

    const provider = providers[integration.provider] ?? providers['evolution_api'];

    let result: any;
    try {
      result = await provider.sendTextMessage(clinicId, integration, phone, text);
    } catch (err: any) {
      // Ensure provider errors are always HttpExceptions (not raw 500s)
      if (err?.status) throw err;
      throw new BadRequestException(err?.message ?? 'Erro ao enviar mensagem via WhatsApp');
    }

    await this.prisma.integration.updateMany({
      where: { clinicId, type: 'whatsapp', provider: integration.provider },
      data: { lastMessageAt: new Date() },
    }).catch(() => { /* non-critical, don't fail the send */ });

    return result;
  }

  // ─── Webhook helpers ────────────────────────────────────────────────────────

  async markConnected(clinicId: string, connected: boolean) {
    await this.prisma.whatsAppConfig.updateMany({ where: { clinicId }, data: { connected } });
    const status = connected ? 'connected' : 'disconnected';
    await this.prisma.integration.updateMany({
      where: { clinicId, type: 'whatsapp', provider: 'evolution_api' },
      data: {
        status,
        ...(connected ? { lastConnectionAt: new Date() } : { lastDisconnectAt: new Date() }),
      },
    });
  }

  async findConfigByInstance(instanceName: string) {
    const integration = await this.prisma.integration.findFirst({
      where: { instanceName, type: 'whatsapp' },
    });
    if (integration) {
      const cfg = integration.configEncrypted ? JSON.parse(integration.configEncrypted) : {};
      return { ...cfg, clinicId: integration.clinicId, instanceName, provider: integration.provider };
    }
    return this.prisma.whatsAppConfig.findFirst({ where: { instanceName } });
  }

  async forceClear(clinicId: string) {
    await forceDestroyClient(clinicId);
    await this.prisma.integration.updateMany({
      where: { clinicId, type: 'whatsapp', provider: 'whatsapp_web_js' },
      data: { status: 'disconnected', lastDisconnectAt: new Date() },
    });
    await this.prisma.whatsAppConfig.updateMany({
      where: { clinicId },
      data: { connected: false },
    });
    return { success: true, message: 'Conexão limpa. Você pode reconectar agora.' };
  }

  // ─── Config listing for settings UI ────────────────────────────────────────

  async getAllIntegrations(clinicId: string) {
    const integrations = await this.prisma.integration.findMany({
      where: { clinicId, type: 'whatsapp' },
    });

    // If no integrations exist, check legacy config
    if (integrations.length === 0) {
      const legacy = await this.prisma.whatsAppConfig.findUnique({ where: { clinicId } });
      if (legacy) {
        return [{
          provider: 'evolution_api',
          instanceName: legacy.instanceName,
          baseUrl: legacy.baseUrl,
          apiKey: '***',
          webhookUrl: legacy.webhookUrl || '',
          active: legacy.active,
          status: legacy.connected ? 'connected' : 'not_configured',
        }];
      }
    }

    return integrations.map(i => {
      const cfg = i.configEncrypted ? JSON.parse(i.configEncrypted) : {};
      return {
        provider: i.provider,
        instanceName: i.instanceName,
        baseUrl: cfg.baseUrl || '',
        apiKey: cfg.apiKey ? '***' : '',
        webhookUrl: cfg.webhookUrl || '',
        active: i.status !== 'disabled',
        status: i.status,
        metadata: i.metadata,
        lastConnectionAt: i.lastConnectionAt,
      };
    });
  }
}
