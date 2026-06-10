import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const MAX_PER_CATEGORY = 5;

function canAccess(permissions: any, module: string, role: string): boolean {
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return true;
  return permissions?.[module]?.view === true;
}

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async search(clinicId: string, userId: string, role: string, q: string) {
    // Fetch user permissions (only needed for non-admin)
    let permissions: any = null;
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      const user = await this.prisma.user.findFirst({
        where: { id: userId, clinicId },
        select: { accessProfile: { select: { permissions: true } } },
      });
      permissions = user?.accessProfile?.permissions ?? {};
    }

    const term = q.trim();
    const results: Record<string, any[]> = {};

    // ── Contacts / Patients ───────────────────────────────────────────────────
    if (canAccess(permissions, 'contacts', role)) {
      const rows = await this.prisma.patient.findMany({
        where: {
          clinicId,
          OR: [
            { name:  { contains: term, mode: 'insensitive' } },
            { phone: { contains: term, mode: 'insensitive' } },
            { cpf:   { contains: term, mode: 'insensitive' } },
            { email: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, phone: true, cpf: true, status: true },
        take: MAX_PER_CATEGORY,
        orderBy: { name: 'asc' },
      });

      results.contacts = rows.map(p => ({
        id:       p.id,
        type:     'contact',
        title:    p.name,
        subtitle: [p.phone, p.cpf ? `CPF ${p.cpf}` : null].filter(Boolean).join(' · '),
        route:    `/patients/${p.id}`,
      }));
    }

    // ── Agenda / Appointments ────────────────────────────────────────────────
    if (canAccess(permissions, 'agenda', role)) {
      const rows = await this.prisma.appointment.findMany({
        where: {
          clinicId,
          OR: [
            { patient:      { name: { contains: term, mode: 'insensitive' } } },
            { professional: { user: { name: { contains: term, mode: 'insensitive' } } } },
          ],
        },
        select: {
          id: true,
          startTime: true,
          status: true,
          patient:      { select: { name: true } },
          professional: { select: { user: { select: { name: true } } } },
          plan:         { select: { name: true } },
        },
        take: MAX_PER_CATEGORY,
        orderBy: { startTime: 'desc' },
      });

      results.appointments = rows.map(a => {
        const dateStr = a.startTime.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = a.startTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const dateParam = a.startTime.toISOString().slice(0, 10);
        return {
          id:       a.id,
          type:     'appointment',
          title:    a.patient?.name ?? 'Agendamento',
          subtitle: `${dateStr} às ${timeStr}${a.professional?.user?.name ? ' · ' + a.professional.user.name : ''}`,
          route:    `/agenda?date=${dateParam}&appointmentId=${a.id}`,
        };
      });
    }

    // ── Vendas / Sales ───────────────────────────────────────────────────────
    if (canAccess(permissions, 'financial', role)) {
      const rows = await this.prisma.sale.findMany({
        where: {
          clinicId,
          OR: [
            { patient: { name: { contains: term, mode: 'insensitive' } } },
            { id:      { contains: term, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          total: true,
          status: true,
          saleType: true,
          patient: { select: { name: true } },
        },
        take: MAX_PER_CATEGORY,
        orderBy: { createdAt: 'desc' },
      });

      const STATUS_LABEL: Record<string, string> = {
        PENDING: 'Em aberto', PAID: 'Pago', CANCELLED: 'Cancelado',
        PARTIAL: 'Pago parcial', OVERDUE: 'Vencido',
      };

      results.sales = rows.map(s => ({
        id:       s.id,
        type:     'sale',
        title:    `Venda #${s.id.slice(-6).toUpperCase()}`,
        subtitle: `${s.patient?.name ?? '—'} · R$ ${s.total.toFixed(2).replace('.', ',')} · ${STATUS_LABEL[s.status] ?? s.status}`,
        route:    `/financial?saleId=${s.id}`,
      }));
    }

    // ── Sessões ───────────────────────────────────────────────────────────────
    if (canAccess(permissions, 'sessions', role)) {
      const rows = await this.prisma.session.findMany({
        where: {
          clinicId,
          OR: [
            { patient: { name: { contains: term, mode: 'insensitive' } } },
            { plan:    { name: { contains: term, mode: 'insensitive' } } },
          ],
        },
        select: {
          id: true,
          sessionNumber: true,
          sessionStatus: true,
          patient: { select: { name: true } },
          plan:    { select: { name: true, sessionsTotal: true } },
          saleId: true,
        },
        take: MAX_PER_CATEGORY,
        orderBy: { createdAt: 'desc' },
      });

      const SESSION_LABEL: Record<string, string> = {
        A_AGENDAR: 'Aguardando agendamento', AGENDADA: 'Agendada',
        CONFIRMADA: 'Confirmada', EM_ATENDIMENTO: 'Em atendimento',
        REALIZADA: 'Realizada', FALTOU: 'Faltou',
        CANCELADA: 'Cancelada', REAGENDADA: 'Reagendada',
        VENCIDA: 'Vencida', SUSPENSA: 'Suspensa',
      };

      results.sessions = rows.map(s => ({
        id:       s.id,
        type:     'session',
        title:    `${s.plan?.name ?? 'Sessão'} · ${s.sessionNumber}/${s.plan?.sessionsTotal ?? '?'}`,
        subtitle: `${s.patient?.name ?? '—'} · ${SESSION_LABEL[s.sessionStatus] ?? s.sessionStatus}`,
        route:    `/sessions`,
      }));
    }

    return results;
  }
}
