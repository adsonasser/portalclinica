import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/portal_clinica_v2' });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log('🌱 Iniciando seed...');

  // ─── Clínica Master (SUPER_ADMIN) ──────────────────────────────────────────
  const masterClinic = await prisma.clinic.upsert({
    where: { slug: '__master__' },
    update: {},
    create: {
      name: 'Sistema Master',
      slug: '__master__',
      email: 'master@sistema.com',
      status: 'ATIVA',
    },
  });

  const masterPass = await bcrypt.hash('master123', 10);
  await prisma.user.upsert({
    where: { clinicId_email: { clinicId: masterClinic.id, email: 'master@sistema.com' } },
    update: {},
    create: {
      clinicId: masterClinic.id,
      name: 'Adson Asser',
      email: 'master@sistema.com',
      password: masterPass,
      role: 'SUPER_ADMIN',
    },
  });
  console.log('✅ SUPER_ADMIN criado: master@sistema.com / master123');

  // ─── Clínica principal ──────────────────────────────────────────────────────
  const clinic = await prisma.clinic.upsert({
    where: { slug: 'clinica-jessica' },
    update: {},
    create: {
      name: 'Clínica Dra. Jéssica Rezende',
      slug: 'clinica-jessica',
      email: 'contato@clinicajessica.com.br',
      phone: '(62) 9 9999-9999',
      address: 'Goiânia, GO',
    },
  });

  console.log('✅ Clínica criada:', clinic.name);

  // Criar usuário admin
  const hashedPass = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { clinicId_email: { clinicId: clinic.id, email: 'admin@clinica.com' } },
    update: {},
    create: {
      clinicId: clinic.id,
      name: 'Adson Asser',
      email: 'admin@clinica.com',
      password: hashedPass,
      role: 'ADMIN',
    },
  });

  console.log('✅ Admin criado:', admin.email);

  // Criar categorias financeiras padrão
  const receitas = await prisma.financialCategory.upsert({
    where: { id: 'cat-receitas-grupo' },
    update: {},
    create: { id: 'cat-receitas-grupo', clinicId: clinic.id, name: 'Receitas', type: 'INCOME' },
  });

  await prisma.financialCategory.upsert({
    where: { id: 'cat-procedimentos' },
    update: {},
    create: { id: 'cat-procedimentos', clinicId: clinic.id, name: 'Procedimentos', type: 'INCOME', parentId: receitas.id },
  });

  const despesas = await prisma.financialCategory.upsert({
    where: { id: 'cat-despesas-grupo' },
    update: {},
    create: { id: 'cat-despesas-grupo', clinicId: clinic.id, name: 'Despesas', type: 'EXPENSE' },
  });

  await prisma.financialCategory.upsert({
    where: { id: 'cat-aluguel' },
    update: {},
    create: { id: 'cat-aluguel', clinicId: clinic.id, name: 'Aluguel', type: 'EXPENSE', parentId: despesas.id },
  });

  console.log('✅ Categorias financeiras criadas');

  // Formas de pagamento padrão
  for (const name of ['Dinheiro', 'PIX', 'Cartão de Crédito', 'Cartão de Débito', 'Transferência']) {
    await prisma.paymentMethod.upsert({
      where: { id: `pm-${name.toLowerCase().replace(/ /g, '-')}` },
      update: {},
      create: { id: `pm-${name.toLowerCase().replace(/ /g, '-')}`, clinicId: clinic.id, name },
    });
  }

  console.log('✅ Formas de pagamento criadas');

  // Funil de vendas padrão
  const funnel = await prisma.funnel.upsert({
    where: { id: 'funil-principal' },
    update: {},
    create: {
      id: 'funil-principal',
      clinicId: clinic.id,
      name: 'Funil Principal',
      order: 0,
      stages: {
        create: [
          { name: 'Novo lead', order: 0, color: '#EEF4FF' },
          { name: 'Contato feito', order: 1, color: '#FFF7E6' },
          { name: 'Avaliação agendada', order: 2, color: '#EAF7EE' },
          { name: 'Proposta enviada', order: 3, color: '#FFF7E6' },
          { name: 'Fechado', order: 4, color: '#EAF7EE' },
        ],
      },
    },
  });

  console.log('✅ Funil de vendas criado:', funnel.name);

  // Configurações da clínica
  await prisma.clinicSettings.upsert({
    where: { clinicId: clinic.id },
    update: {},
    create: {
      clinicId: clinic.id,
      workStartTime: '08:00',
      workEndTime: '18:00',
      slotDuration: 60,
      workDays: [1, 2, 3, 4, 5, 6],
    },
  });

  console.log('✅ Configurações criadas');
  console.log('\n🎉 Seed concluído!');
  console.log('📧 Login: admin@clinica.com');
  console.log('🔑 Senha: admin123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
