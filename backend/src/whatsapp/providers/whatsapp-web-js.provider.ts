import { BadRequestException, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { IWhatsAppProvider, QrCodeResult, SendResult, StatusResult } from './whatsapp-provider.interface';
import { normalizePhone } from '../whatsapp.service';

// ─── Environment guards ───────────────────────────────────────────────────────

const IS_VERCEL  = !!process.env.VERCEL;
const IS_ENABLED = process.env.WHATSAPP_WEBJS_ENABLED !== 'false';
const SESSIONS_PATH = process.env.WHATSAPP_SESSION_PATH
  ? path.resolve(process.env.WHATSAPP_SESSION_PATH)
  : path.join(process.cwd(), 'sessions', 'whatsapp');

const PUPPETEER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--disable-gpu',
];

// ─── Lazy-loaded libs (avoid crash if not installed) ─────────────────────────
function loadWWebJS() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('whatsapp-web.js') as typeof import('whatsapp-web.js');
  } catch {
    return null;
  }
}

function loadQrcode() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('qrcode') as typeof import('qrcode');
  } catch {
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clearChromiumLocks(clinicId: string) {
  const sessionDir = path.join(SESSIONS_PATH, `session-clinic_${clinicId}`);
  const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'lockfile'];
  for (const file of lockFiles) {
    const p = path.join(sessionDir, file);
    try { fs.unlinkSync(p); } catch { /* ok if not found */ }
    const p2 = path.join(sessionDir, 'Default', file);
    try { fs.unlinkSync(p2); } catch { /* ok if not found */ }
  }
}

function killOrphanChromium(clinicId: string) {
  const sessionDir = path.join(SESSIONS_PATH, `session-clinic_${clinicId}`);
  try {
    // Kill any Chrome for Testing process that has our session dir in its args
    const { execSync } = require('child_process');
    const result = execSync(
      `ps aux | grep "${sessionDir}" | grep -v grep | awk '{print $2}'`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] },
    ).trim();
    if (result) {
      for (const pid of result.split('\n').filter(Boolean)) {
        try { process.kill(Number(pid), 'SIGKILL'); } catch { /* already dead */ }
      }
    }
  } catch { /* ignore */ }
}

// ─── In-memory client state ───────────────────────────────────────────────────

type ClientStatus = 'initializing' | 'pending_qr' | 'connected' | 'disconnected' | 'auth_failure';

interface ClientState {
  client: any;
  status: ClientStatus;
  phoneNumber?: string;
  displayName?: string;
}

const clientMap = new Map<string, ClientState>();

// ─── Incoming message callback (optional, set by WhatsAppService) ─────────────

export type IncomingMessageHandler = (
  clinicId: string,
  from: string,
  senderName: string,
  body: string,
  timestamp: Date,
  messageId: string,
  chatId: string,       // real WhatsApp chat JID (e.g. "5571...@c.us") — use this for sending
) => void | Promise<void>;

let onIncomingMessage: IncomingMessageHandler | null = null;

export function setWhatsAppWebJsMessageHandler(handler: IncomingMessageHandler) {
  onIncomingMessage = handler;
}

export async function forceDestroyClient(clinicId: string): Promise<void> {
  const state = clientMap.get(clinicId);
  if (state) {
    try { await state.client.destroy(); } catch { /* ignore */ }
    clientMap.delete(clinicId);
  }
  killOrphanChromium(clinicId);
  clearChromiumLocks(clinicId);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class WhatsAppWebJsProvider implements IWhatsAppProvider {
  private readonly logger = new Logger('WhatsAppWebJsProvider');

  private assertAvailable() {
    if (IS_VERCEL) {
      throw new BadRequestException(
        'WhatsApp Web JS não funciona em ambientes serverless (Vercel). ' +
        'Para produção, use Evolution API ou migre o backend para um servidor persistente (VPS, Railway, Render).',
      );
    }
    if (!IS_ENABLED) {
      throw new BadRequestException('WhatsApp Web JS desativado (WHATSAPP_WEBJS_ENABLED=false).');
    }
    if (!loadWWebJS()) {
      throw new BadRequestException(
        'Pacote whatsapp-web.js não encontrado. Execute: cd backend && npm install whatsapp-web.js qrcode',
      );
    }
    if (!loadQrcode()) {
      throw new BadRequestException(
        'Pacote qrcode não encontrado. Execute: cd backend && npm install qrcode',
      );
    }
  }

  private buildClient(clinicId: string): any {
    const wwebjs = loadWWebJS()!;
    const { Client, LocalAuth } = wwebjs;

    const puppeteerConfig: any = {
      headless: true,
      args: PUPPETEER_ARGS,
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      puppeteerConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    return new Client({
      authStrategy: new LocalAuth({ clientId: `clinic_${clinicId}`, dataPath: SESSIONS_PATH }),
      puppeteer: puppeteerConfig,
    });
  }

  // ─── connect ─────────────────────────────────────────────────────────────

  async connect(clinicId: string, _integration: any): Promise<QrCodeResult> {
    this.assertAvailable();

    // Already connected — return immediately
    const existing = clientMap.get(clinicId);
    if (existing?.status === 'connected') {
      return { qrcode: null, status: 'connected' };
    }

    // Clean up a stale/failed client before creating a new one
    if (existing) {
      try { await existing.client.destroy(); } catch { /* ignore */ }
      clientMap.delete(clinicId);
    }

    // Kill any orphan Chromium left from previous crashes/restarts, then clear lock files
    killOrphanChromium(clinicId);
    clearChromiumLocks(clinicId);

    const qrcode = loadQrcode()!;
    const client = this.buildClient(clinicId);
    const state: ClientState = { client, status: 'initializing' };
    clientMap.set(clinicId, state);

    // Attach persistent event listeners
    client.on('ready', () => {
      state.status = 'connected';
      client.getInfo().then((info: any) => {
        state.phoneNumber = info?.wid?.user;
        state.displayName = info?.pushname;
      }).catch(() => {});
      this.logger.log(`[${clinicId}] WhatsApp conectado`);
    });

    client.on('auth_failure', (msg: string) => {
      state.status = 'auth_failure';
      clientMap.delete(clinicId);
      this.logger.warn(`[${clinicId}] Auth failure: ${msg}`);
    });

    client.on('disconnected', (reason: string) => {
      state.status = 'disconnected';
      clientMap.delete(clinicId);
      this.logger.warn(`[${clinicId}] Disconnected: ${reason}`);
    });

    client.on('message', async (msg: any) => {
      if (!onIncomingMessage) return;

      const from: string = msg.from ?? '';

      // Block everything that's not a 1-on-1 private chat
      if (from.endsWith('@g.us')) return;         // group
      if (from.endsWith('@newsletter')) return;    // WhatsApp Channel / Newsletter
      if (from.includes('@broadcast')) return;     // broadcast list / status
      if (from === 'status@broadcast') return;     // status updates
      if (msg.isGroupMsg === true) return;         // extra guard
      if (msg.broadcast === true) return;          // broadcast flag
      if (msg.fromMe === true) return;            // our own sent messages

      if (!msg.body?.trim()) return;

      try {
        // Strip any @suffix to get raw number (handles @c.us, @lid, @s.whatsapp.net)
        let phone = from.replace(/@[^@]+$/, '');
        let chatId = from;   // real WhatsApp chat JID — updated below
        let senderName = '';

        // Prefer chat.id when it's a proper @c.us JID (real phone).
        // Do NOT use chat.id when it ends @lid — that's still a LID, not a phone.
        try {
          const chat = await msg.getChat();
          if (chat?.id?._serialized) chatId = chat.id._serialized;
          if (chat?.id?.user && chat.id._serialized?.endsWith('@c.us')) {
            phone = chat.id.user;
          }
        } catch { /* keep fallback */ }

        // Secondary attempt: contact's own @c.us JID
        try {
          const contact = await msg.getContact();
          if (contact?.id?._serialized?.endsWith('@c.us') && contact.id.user) {
            phone = contact.id.user;
            chatId = contact.id._serialized;
          }
          senderName = contact?.pushname || contact?.name || '';
        } catch { /* keep empty */ }

        // Skip if we still can't resolve a plausible phone number (E.164: 7–15 digits)
        if (!/^\d{7,15}$/.test(phone)) {
          this.logger.warn(`[${clinicId}] Skipping unresolvable ID: ${from} → "${phone}"`);
          return;
        }

        await onIncomingMessage(
          clinicId,
          phone,
          senderName,
          msg.body,
          new Date((msg.timestamp ?? Date.now() / 1000) * 1000),
          msg.id?.id ?? String(Date.now()),
          chatId,
        );
      } catch (err) {
        this.logger.error(`[${clinicId}] Erro ao processar mensagem recebida: ${err}`);
      }
    });

    // Wait for QR or connected (handles restored sessions)
    return new Promise<QrCodeResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new BadRequestException(
          'Timeout ao gerar QR Code (45s). Verifique se Puppeteer/Chromium está disponível.',
        ));
      }, 45_000);

      client.once('qr', async (qr: string) => {
        clearTimeout(timeout);
        state.status = 'pending_qr';
        try {
          const qrDataUrl = await qrcode.toDataURL(qr, { margin: 1, scale: 6 });
          resolve({ qrcode: qrDataUrl, status: 'pending_qr' });
        } catch {
          reject(new BadRequestException('Erro ao converter QR Code em imagem.'));
        }
      });

      client.once('ready', () => {
        clearTimeout(timeout);
        state.status = 'connected';
        resolve({ qrcode: null, status: 'connected' });
      });

      client.initialize().catch(async (err: any) => {
        // "browser already running" — remove locks and retry once
        if (err?.message?.includes('already running')) {
          this.logger.warn(`[${clinicId}] Browser lock detectado, limpando e tentando novamente...`);
          killOrphanChromium(clinicId);
          clearChromiumLocks(clinicId);
          try { await client.destroy(); } catch { /* ignore */ }
          clientMap.delete(clinicId);

          // Retry once with a fresh client
          const retryClient = this.buildClient(clinicId);
          const retryState: ClientState = { client: retryClient, status: 'initializing' };
          clientMap.set(clinicId, retryState);

          // Re-attach ready/qr listeners on retry client
          retryClient.on('ready', () => { retryState.status = 'connected'; });
          retryClient.on('auth_failure', () => { retryState.status = 'auth_failure'; clientMap.delete(clinicId); });
          retryClient.on('disconnected', () => { retryState.status = 'disconnected'; clientMap.delete(clinicId); });

          retryClient.once('qr', async (qr: string) => {
            clearTimeout(timeout);
            retryState.status = 'pending_qr';
            try {
              const qrDataUrl = await qrcode.toDataURL(qr, { margin: 1, scale: 6 });
              resolve({ qrcode: qrDataUrl, status: 'pending_qr' });
            } catch { reject(new BadRequestException('Erro ao converter QR Code.')); }
          });
          retryClient.once('ready', () => {
            clearTimeout(timeout);
            retryState.status = 'connected';
            resolve({ qrcode: null, status: 'connected' });
          });
          retryClient.initialize().catch((retryErr: any) => {
            clearTimeout(timeout);
            clientMap.delete(clinicId);
            reject(new BadRequestException(`Erro ao iniciar WhatsApp (retry): ${retryErr?.message ?? String(retryErr)}`));
          });
        } else {
          clearTimeout(timeout);
          clientMap.delete(clinicId);
          reject(new BadRequestException(
            `Erro ao iniciar WhatsApp Web JS: ${err?.message ?? String(err)}`,
          ));
        }
      });
    });
  }

  // ─── getConnectionStatus ─────────────────────────────────────────────────

  async getConnectionStatus(clinicId: string, _integration: any): Promise<StatusResult> {
    if (IS_VERCEL) {
      return { connected: false, status: 'serverless_not_supported' };
    }

    const state = clientMap.get(clinicId);
    if (!state) return { connected: false, status: 'disconnected' };

    if (state.status === 'connected') {
      return {
        connected: true,
        status: 'connected',
        phoneNumber: state.phoneNumber,
        displayName: state.displayName,
      };
    }

    return { connected: false, status: state.status };
  }

  // ─── disconnect ───────────────────────────────────────────────────────────

  async disconnect(clinicId: string, _integration: any): Promise<void> {
    const state = clientMap.get(clinicId);
    if (!state) return;
    try { await state.client.logout(); } catch { /* ignore */ }
    try { await state.client.destroy(); } catch { /* ignore */ }
    clientMap.delete(clinicId);
    this.logger.log(`[${clinicId}] WhatsApp desconectado manualmente`);
  }

  // ─── sendTextMessage ──────────────────────────────────────────────────────

  async sendTextMessage(
    clinicId: string,
    _integration: any,
    phone: string,
    text: string,
    chatId?: string,
  ): Promise<SendResult> {
    this.assertAvailable();

    const state = clientMap.get(clinicId);
    if (!state || state.status !== 'connected') {
      throw new BadRequestException(
        'WhatsApp não está conectado. Abra Configurações → WhatsApp e escaneie o QR Code.',
      );
    }

    // Build a list of JIDs to try in order
    const rawDigits = (chatId ?? phone).replace(/@[^@]+$/, '').replace(/\D/g, '');
    const jidsToTry: string[] = [];

    // 1. Prefer the stored chat JID (most reliable when it's @c.us)
    if (chatId && chatId.includes('@') && !chatId.includes('@s.whatsapp.net')) {
      jidsToTry.push(chatId);
    }

    // 2. Try @c.us and @lid variants of the raw digits
    if (rawDigits) {
      jidsToTry.push(`${rawDigits}@c.us`);
      jidsToTry.push(`${rawDigits}@lid`);
    }

    // 3. Try via server-side number resolution (works for normal phones, fails for LIDs)
    const normalized = normalizePhone(phone || rawDigits);
    let resolvedJid: string | null = null;
    if (normalized && normalized.length >= 10) {
      try {
        const numberId = await state.client.getNumberId(normalized);
        if (numberId?._serialized) resolvedJid = numberId._serialized;
      } catch { /* ignore */ }
    }
    if (resolvedJid && !jidsToTry.includes(resolvedJid)) {
      jidsToTry.unshift(resolvedJid); // Highest priority when available
    }

    // Also add @s.whatsapp.net as last resort (legacy)
    if (chatId?.includes('@s.whatsapp.net')) jidsToTry.push(chatId);

    for (const jid of jidsToTry) {
      try {
        const result = await state.client.sendMessage(jid, text);
        this.logger.log(`[${clinicId}] Mensagem enviada via ${jid}`);
        return { messageId: result?.id?.id ?? String(Date.now()), status: 'sent' };
      } catch (e: any) {
        this.logger.warn(`[${clinicId}] Falha ao enviar para ${jid}: ${e?.message}`);
      }
    }

    throw new BadRequestException(
      'Não foi possível entregar a mensagem. Se o contato usa WhatsApp multi-dispositivo, ' +
      'aguarde ele enviar uma nova mensagem e tente novamente.',
    );
  }
}
