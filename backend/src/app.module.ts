import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PatientsModule } from './patients/patients.module';
import { PlansModule } from './plans/plans.module';
import { SessionsModule } from './sessions/sessions.module';
import { AgendaModule } from './agenda/agenda.module';
import { LeadsModule } from './leads/leads.module';
import { TasksModule } from './tasks/tasks.module';
import { MessagesModule } from './messages/messages.module';
import { FinancialModule } from './financial/financial.module';
import { SalesModule } from './sales/sales.module';
import { InventoryModule } from './inventory/inventory.module';
import { ProntuarioModule } from './prontuario/prontuario.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { AdminModule } from './admin/admin.module';
import { AccessProfilesModule } from './access-profiles/access-profiles.module';
import { SearchModule } from './search/search.module';
import { AppointmentTypesModule } from './appointment-types/appointment-types.module';
import { ContractTemplatesModule } from './contract-templates/contract-templates.module';
import { ContractsModule } from './contracts/contracts.module';
import { ContactTypesModule } from './contact-types/contact-types.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { ConversationsModule } from './conversations/conversations.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { QuickRepliesModule } from './quick-replies/quick-replies.module';
import { SettingsModule } from './settings/settings.module';
import { HomeModule } from './home/home.module';
import { RevenueIntelligenceModule } from './revenue-intelligence/revenue-intelligence.module';
import { EmailModule } from './email/email.module';
import { PublicModule } from './public/public.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    PatientsModule,
    PlansModule,
    SessionsModule,
    AgendaModule,
    AppointmentTypesModule,
    LeadsModule,
    TasksModule,
    MessagesModule,
    FinancialModule,
    SalesModule,
    InventoryModule,
    ProntuarioModule,
    DashboardModule,
    OpportunitiesModule,
    AdminModule,
    AccessProfilesModule,
    SearchModule,
    ContractTemplatesModule,
    ContractsModule,
    ContactTypesModule,
    WhatsAppModule,
    ConversationsModule,
    WebhooksModule,
    QuickRepliesModule,
    SettingsModule,
    HomeModule,
    RevenueIntelligenceModule,
    EmailModule,
    PublicModule,
  ],
})
export class AppModule {}
