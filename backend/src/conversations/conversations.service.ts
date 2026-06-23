import { Injectable, NotFoundException, BadRequestException, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService, normalizePhone } from '../whatsapp/whatsapp.service';
import { setWhatsAppWebJsMessageHandler } from '../whatsapp/providers/whatsapp-web-js.provider';

@Injectable()
export class ConversationsService implements OnModuleInit {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private prisma: PrismaService,
    private whatsApp: WhatsAppService,
  ) {}

  onModuleInit() {
    setWhatsAppWebJsMessageHandler(async (clinicId, from, senderName, body, timestamp, messageId) => {
      try {
        await this.receiveMessage(clinicId, {
          providerMessageId: messageId,
          senderPhone: from,
          senderName,
          content: body,
          receivedAt: timestamp,
          instanceName: '',
        });
      } catch (err) {
        this.logger.error(`[${clinicId}] Erro ao salvar mensagem recebida: ${err}`);
      }
    });
    this.logger.log('WhatsApp Web JS message handler registrado');
  }

  async findAll(clinicId: string, status?: string) {
    const where: any = { clinicId };
    if (status === 'open')   where.status = 'open';
    else if (status === 'closed')  where.status = 'closed';
    else if (status === 'unread')  { where.status = 'open'; where.unreadCount = { gt: 0 }; }
    // 'all' → no filter

    return this.prisma.conversation.findMany({
      where,
      orderBy: [{ unreadCount: 'desc' }, { lastMessageAt: 'desc' }],
      include: {
        contact: { select: { id: true, name: true, phone: true, avatarUrl: true } },
      },
    });
  }

  async findMessages(clinicId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findFirst({ where: { id: conversationId, clinicId } });
    if (!conv) throw new NotFoundException('Conversa não encontrada');

    await this.prisma.conversation.update({ where: { id: conversationId }, data: { unreadCount: 0 } });

    return this.prisma.chatMessage.findMany({
      where: { conversationId, clinicId },
      orderBy: { createdAt: 'asc' },
      include: { sentBy: { select: { id: true, name: true } } },
    });
  }

  async openConversation(clinicId: string, contactId: string) {
    const contact = await this.prisma.patient.findFirst({ where: { id: contactId, clinicId } });
    if (!contact) throw new NotFoundException('Contato não encontrado');
    if (!contact.phone) throw new BadRequestException('Este contato não possui um telefone válido para WhatsApp.');

    // If there's a closed conversation, reopen it
    const closed = await this.prisma.conversation.findFirst({
      where: { clinicId, contactId, channel: 'whatsapp' },
      orderBy: { createdAt: 'desc' },
      include: { contact: { select: { id: true, name: true, phone: true, avatarUrl: true } } },
    });

    if (closed) {
      if (closed.status !== 'open') {
        return this.prisma.conversation.update({
          where: { id: closed.id },
          data: { status: 'open', closedAt: null, closedByUserId: null, closeReason: null },
          include: { contact: { select: { id: true, name: true, phone: true, avatarUrl: true } } },
        });
      }
      return closed;
    }

    return this.prisma.conversation.create({
      data: {
        clinicId,
        contactId,
        channel: 'whatsapp',
        provider: 'whatsapp_web_js',
        externalChatId: `${normalizePhone(contact.phone)}@s.whatsapp.net`,
        status: 'open',
      },
      include: { contact: { select: { id: true, name: true, phone: true, avatarUrl: true } } },
    });
  }

  async closeConversation(clinicId: string, conversationId: string, userId: string, reason?: string) {
    const conv = await this.prisma.conversation.findFirst({ where: { id: conversationId, clinicId } });
    if (!conv) throw new NotFoundException('Conversa não encontrada');
    if (conv.status === 'closed') throw new BadRequestException('Conversa já está fechada');

    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status: 'closed',
        closedAt: new Date(),
        closedByUserId: userId,
        closeReason: reason || null,
        unreadCount: 0,
      },
      include: { contact: { select: { id: true, name: true, phone: true, avatarUrl: true } } },
    });
  }

  async sendMessage(clinicId: string, conversationId: string, userId: string, content: string) {
    if (!content?.trim()) throw new BadRequestException('Mensagem vazia');

    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, clinicId },
      include: { contact: { select: { id: true, name: true, phone: true } } },
    });
    if (!conv) throw new NotFoundException('Conversa não encontrada');

    const phone = conv.contact?.phone ?? conv.guestPhone;
    if (!phone) throw new BadRequestException('Contato sem telefone');

    if (conv.status === 'closed') {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { status: 'open', closedAt: null, closedByUserId: null, closeReason: null },
      });
    }

    let providerMessageId: string | null = null;
    try {
      const result: any = await this.whatsApp.sendTextMessage(clinicId, phone, content.trim());
      providerMessageId = result?.key?.id || result?.messageId || null;
    } catch (err: any) {
      await this.prisma.chatMessage.create({
        data: {
          clinicId, conversationId, direction: 'outbound',
          content: content.trim(), status: 'failed',
          sentByUserId: userId, sentAt: new Date(),
        },
      }).catch(() => {});
      throw err;
    }

    const msg = await this.prisma.chatMessage.create({
      data: {
        clinicId, conversationId, direction: 'outbound',
        content: content.trim(), status: 'sent',
        sentByUserId: userId, sentAt: new Date(), providerMessageId,
      },
      include: { sentBy: { select: { id: true, name: true } } },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date(), lastMessagePreview: content.trim().slice(0, 100), status: 'open' },
    });

    return msg;
  }

  // Called by webhook handler (Evolution API) and WhatsApp Web JS message handler
  async receiveMessage(clinicId: string, data: {
    providerMessageId: string;
    senderPhone: string;
    senderName: string;
    content: string;
    receivedAt: Date;
    instanceName: string;
  }) {
    // Drop group messages (safety net — provider should already filter)
    if (data.senderPhone.includes('@g.us') || data.senderPhone.includes('-')) return null;
    if (!data.content?.trim()) return null;

    const existing = await this.prisma.chatMessage.findUnique({
      where: { providerMessageId: data.providerMessageId },
    });
    if (existing) return existing;

    const normalizedPhone = normalizePhone(data.senderPhone);
    const externalChatId = `${normalizedPhone}@s.whatsapp.net`;

    // Try to find a registered patient by phone (last 10 digits)
    const phoneSuffix = normalizedPhone.slice(-10);
    const contact = await this.prisma.patient.findFirst({
      where: { clinicId, phone: { contains: phoneSuffix } },
    });

    // Look up existing conversation — by contactId if registered, or by externalChatId for guests
    let conv = contact
      ? await this.prisma.conversation.findFirst({
          where: { clinicId, contactId: contact.id, channel: 'whatsapp' },
        })
      : await this.prisma.conversation.findFirst({
          where: { clinicId, guestPhone: normalizedPhone, channel: 'whatsapp' },
        });

    if (!conv) {
      conv = await this.prisma.conversation.create({
        data: {
          clinicId,
          contactId: contact?.id ?? null,
          guestPhone: contact ? null : normalizedPhone,
          guestName: contact ? null : (data.senderName !== normalizedPhone ? data.senderName : null),
          channel: 'whatsapp',
          provider: 'whatsapp_web_js',
          externalChatId,
          status: 'open',
        },
      });
    } else if (conv.status === 'closed') {
      conv = await this.prisma.conversation.update({
        where: { id: conv.id },
        data: { status: 'open', closedAt: null, closedByUserId: null, closeReason: null },
      });
    }

    const msg = await this.prisma.chatMessage.create({
      data: {
        clinicId, conversationId: conv.id, direction: 'inbound',
        content: data.content, status: 'received',
        providerMessageId: data.providerMessageId, receivedAt: data.receivedAt,
      },
    });

    await this.prisma.conversation.update({
      where: { id: conv.id },
      data: {
        lastMessageAt: data.receivedAt,
        lastMessagePreview: data.content.slice(0, 100),
        status: 'open',
        unreadCount: { increment: 1 },
      },
    });

    return msg;
  }
}
