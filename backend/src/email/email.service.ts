import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private config: ConfigService) {
    const host = this.config.get('SMTP_HOST');
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(this.config.get('SMTP_PORT') ?? 587),
        secure: this.config.get('SMTP_SECURE') === 'true',
        auth: {
          user: this.config.get('SMTP_USER'),
          pass: this.config.get('SMTP_PASS'),
        },
      });
    }
  }

  async sendConfirmationEmail(to: string, name: string, token: string, baseUrl: string) {
    const link = `${baseUrl}/confirmar-email?token=${token}`;

    if (!this.transporter) {
      this.logger.warn(`[EMAIL NOT SENT] SMTP não configurado. Link de confirmação para ${to}: ${link}`);
      return { sent: false, link };
    }

    await this.transporter.sendMail({
      from: this.config.get('SMTP_FROM') ?? 'noreply@nassclin.com.br',
      to,
      subject: 'Confirme seu cadastro — NassClin',
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
          <h2 style="font-size:20px;font-weight:700;color:#09090B;margin:0 0 8px">Olá, ${name}!</h2>
          <p style="color:#71717A;font-size:14px;line-height:1.6;margin:0 0 24px">
            Seu cadastro no NassClin foi recebido. Clique no botão abaixo para confirmar seu e-mail e ativar sua conta.
          </p>
          <a href="${link}" style="display:inline-block;padding:12px 28px;background:#000;color:#fff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">
            Confirmar e-mail
          </a>
          <p style="color:#A1A1AA;font-size:12px;margin:24px 0 0">
            Link válido por 48 horas. Se não foi você, ignore este e-mail.
          </p>
        </div>
      `,
    });
    return { sent: true, link };
  }

  async sendWelcomeWithPassword(to: string, name: string, clinicName: string, tempPassword: string) {
    if (!this.transporter) {
      this.logger.warn(`[EMAIL NOT SENT] SMTP não configurado. Senha provisória para ${to}: ${tempPassword}`);
      return;
    }

    await this.transporter.sendMail({
      from: this.config.get('SMTP_FROM') ?? 'noreply@nassclin.com.br',
      to,
      subject: `Bem-vindo ao NassClin — ${clinicName}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
          <h2 style="font-size:20px;font-weight:700;color:#09090B;margin:0 0 8px">Olá, ${name}!</h2>
          <p style="color:#71717A;font-size:14px;line-height:1.6;margin:0 0 16px">
            Sua empresa <strong>${clinicName}</strong> foi cadastrada no NassClin.
          </p>
          <p style="color:#71717A;font-size:14px;margin:0 0 8px">Seus dados de acesso:</p>
          <div style="background:#F4F4F5;border-radius:8px;padding:16px;margin-bottom:24px">
            <div style="font-size:13px;color:#09090B"><strong>E-mail:</strong> ${to}</div>
            <div style="font-size:13px;color:#09090B;margin-top:6px"><strong>Senha provisória:</strong> ${tempPassword}</div>
          </div>
          <p style="color:#A1A1AA;font-size:12px;margin:0">Você será solicitado a trocar a senha no primeiro acesso.</p>
        </div>
      `,
    });
  }
}
