import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService, normalizePhone } from '../whatsapp/whatsapp.service';

@Injectable()
export class ConversationsService {
  constructor(
    private prisma: PrismaService,
    private whatsApp: WhatsAppService,
  ) {}

  async findAll(clinicId: string) {
    const convs = await this.prisma.conversation.findMany({
      where: { clinicId },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        contact: { select: { id: true, name: true, phone: true, avatarUrl: true } },
      },
    });
    return convs;
  }

  async findMessages(clinicId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findFirst({ where: { id: conversationId, clinicId } });
    if (!conv) throw new NotFoundException('Conversa não encontrada');

    // Mark as read
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
    if (!contact.phone) throw new BadRequestException('Contato sem telefone cadastrado');

    const existing = await this.prisma.conversation.findFirst({
      where: { clinicId, contactId, channel: 'whatsapp', provider: 'evolution_api' },
      include: { contact: { select: { id: true, name: true, phone: true } } },
    });
    if (existing) return existing;

    return this.prisma.conversation.create({
      data: {
        clinicId,
        contactId,
        channel: 'whatsapp',
        provider: 'evolution_api',
        externalChatId: `${normalizePhone(contact.phone)}@s.whatsapp.net`,
        status: 'open',
      },
      include: { contact: { select: { id: true, name: true, phone: true } } },
    });
  }

  async sendMessage(clinicId: string, conversationId: string, userId: string, content: string) {
    if (!content?.trim()) throw new BadRequestException('Mensagem vazia');

    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, clinicId },
      include: { contact: { select: { id: true, name: true, phone: true } } },
    });
    if (!conv) throw new NotFoundException('Conversa não encontrada');
    if (!conv.contact.phone) throw new BadRequestException('Contato sem telefone');

    // Send via Evolution API
    let providerMessageId: string | null = null;
    try {
      const result: any = await this.whatsApp.sendTextMessage(clinicId, conv.contact.phone, content.trim());
      providerMessageId = result?.key?.id || result?.messageId || null;
    } catch (err: any) {
      // Save as failed and re-throw
      await this.prisma.chatMessage.create({
        data: {
          clinicId,
          conversationId,
          direction: 'outbound',
          content: content.trim(),
          status: 'failed',
          sentByUserId: userId,
          sentAt: new Date(),
        },
      });
      throw err;
    }

    const msg = await this.prisma.chatMessage.create({
      data: {
        clinicId,
        conversationId,
        direction: 'outbound',
        content: content.trim(),
        status: 'sent',
        sentByUserId: userId,
        sentAt: new Date(),
        providerMessageId,
      },
      include: { sentBy: { select: { id: true, name: true } } },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date(), lastMessagePreview: content.trim().slice(0, 100), status: 'open' },
    });

    return msg;
  }

  // Called by webhook handler
  async receiveMessage(clinicId: string, data: {
    providerMessageId: string;
    senderPhone: string;
    senderName: string;
    content: string;
    receivedAt: Date;
    instanceName: string;
  }) {
    // Dedup by providerMessageId
    const existing = await this.prisma.chatMessage.findUnique({
      where: { providerMessageId: data.providerMessageId },
    });
    if (existing) return existing;

    const normalizedPhone = normalizePhone(data.senderPhone);

    // Find or create contact
    let contact = await this.prisma.patient.findFirst({
      where: { clinicId, phone: { contains: normalizedPhone.slice(-8) } },
    });

    if (!contact) {
      contact = await this.prisma.patient.create({
        data: {
          clinicId,
          name: data.senderName || normalizedPhone,
          phone: normalizedPhone,
          status: 'NOVO',
        },
      });
    }

    // Find or create conversation
    let conv = await this.prisma.conversation.findFirst({
      where: { clinicId, contactId: contact.id, channel: 'whatsapp', provider: 'evolution_api' },
    });

    if (!conv) {
      conv = await this.prisma.conversation.create({
        data: {
          clinicId,
          contactId: contact.id,
          channel: 'whatsapp',
          provider: 'evolution_api',
          externalChatId: `${normalizedPhone}@s.whatsapp.net`,
          status: 'open',
        },
      });
    }

    // Save message
    const msg = await this.prisma.chatMessage.create({
      data: {
        clinicId,
        conversationId: conv.id,
        direction: 'inbound',
        content: data.content,
        status: 'received',
        providerMessageId: data.providerMessageId,
        receivedAt: data.receivedAt,
      },
    });

    // Update conversation
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
