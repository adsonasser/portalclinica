import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_PAYMENT_METHODS = [
  { name: 'Dinheiro',         type: 'dinheiro' },
  { name: 'Pix',              type: 'pix' },
  { name: 'Cartão de Crédito', type: 'cartao_credito' },
  { name: 'Cartão de Débito', type: 'cartao_debito' },
];

const DEFAULT_FUNNEL_STAGES = [
  { name: 'Novo lead',                  order: 1, isInitial: true,  color: '#E5E7EB' },
  { name: 'Primeiro contato',           order: 2, color: '#DBEAFE' },
  { name: 'Avaliação / Consulta agendada', order: 3, color: '#FEF9C3' },
  { name: 'Proposta enviada',           order: 4, color: '#FEF3C7' },
  { name: 'Fechamento',                 order: 5, isWon: true, color: '#DCFCE7' },
];

const DEFAULT_LEAD_SOURCES = [
  'Instagram', 'WhatsApp', 'Indicação', 'Google', 'Site',
  'Tráfego pago', 'Evento', 'Retorno/Reativação', 'Outros',
];

const DEFAULT_LOSS_REASONS = [
  'Preço', 'Sem retorno', 'Escolheu concorrente', 'Não tem interesse no momento',
  'Não compareceu', 'Fora do perfil', 'Sem disponibilidade de agenda',
  'Apenas pesquisando', 'Outros',
];

export async function seedClinicDefaults(prisma: PrismaService, clinicId: string) {
  // Payment methods — only create what doesn't exist yet (by name)
  const existingMethods = await prisma.paymentMethod.findMany({ where: { clinicId }, select: { name: true } });
  const existingMethodNames = new Set(existingMethods.map(m => m.name));
  const methodsToCreate = DEFAULT_PAYMENT_METHODS.filter(m => !existingMethodNames.has(m.name));
  if (methodsToCreate.length > 0) {
    await prisma.paymentMethod.createMany({
      data: methodsToCreate.map(m => ({ clinicId, name: m.name, type: m.type, active: true })),
    });
  }

  // CRM funnel — only create if no funnels exist yet
  const existingFunnels = await prisma.funnel.count({ where: { clinicId } });
  if (existingFunnels === 0) {
    const funnel = await prisma.funnel.create({
      data: { clinicId, name: 'Funil Comercial', order: 1, active: true },
    });
    await prisma.funnelStage.createMany({
      data: DEFAULT_FUNNEL_STAGES.map(s => ({
        funnelId: funnel.id,
        name:      s.name,
        order:     s.order,
        color:     s.color,
        isInitial: s.isInitial ?? false,
        isWon:     s.isWon    ?? false,
        isLost:    false,
      })),
    });
  }

  // Lead sources — only create missing
  const existingSources = await prisma.leadSource.findMany({ where: { clinicId }, select: { name: true } });
  const existingSourceNames = new Set(existingSources.map(s => s.name));
  const sourcesToCreate = DEFAULT_LEAD_SOURCES.filter(n => !existingSourceNames.has(n));
  if (sourcesToCreate.length > 0) {
    await prisma.leadSource.createMany({
      data: sourcesToCreate.map(name => ({ clinicId, name, active: true })),
    });
  }

  // Loss reasons — only create missing
  const existingReasons = await prisma.leadLossReason.findMany({ where: { clinicId }, select: { name: true } });
  const existingReasonNames = new Set(existingReasons.map(r => r.name));
  const reasonsToCreate = DEFAULT_LOSS_REASONS.filter(n => !existingReasonNames.has(n));
  if (reasonsToCreate.length > 0) {
    await prisma.leadLossReason.createMany({
      data: reasonsToCreate.map(name => ({ clinicId, name, active: true })),
    });
  }
}
