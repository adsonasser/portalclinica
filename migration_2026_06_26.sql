-- ============================================================
-- MIGRATION — 2026-06-26
-- Portal Clínica 2 — Rodar no Supabase SQL Editor
-- Seguro para reexecutar (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- ============================================================

-- ─── 1. NOVAS COLUNAS em tabelas existentes ──────────────────

-- sales: valor pago, tipo de venda, flag de inconsistência financeira
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS "saleType"          TEXT    NOT NULL DEFAULT 'VENDA',
  ADD COLUMN IF NOT EXISTS "paidAmount"         FLOAT8  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "hasFinancialIssue"  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "notes"              TEXT;

-- financial_transactions: campos de conferência + recorrência + índice
ALTER TABLE financial_transactions
  ADD COLUMN IF NOT EXISTS "notes"               TEXT,
  ADD COLUMN IF NOT EXISTS "contactName"         TEXT,
  ADD COLUMN IF NOT EXISTS "statusConferencia"   TEXT    NOT NULL DEFAULT 'PENDENTE',
  ADD COLUMN IF NOT EXISTS "dataConferencia"     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "usuarioConferencia"  TEXT,
  ADD COLUMN IF NOT EXISTS "motivoDivergencia"   TEXT,
  ADD COLUMN IF NOT EXISTS "recurrenceId"        TEXT,
  ADD COLUMN IF NOT EXISTS "recurrenceIndex"     INTEGER,
  ADD COLUMN IF NOT EXISTS "recurrenceTotal"     INTEGER;

-- leads: responsável, próxima atividade, origem (LeadSource FK)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS "assignedUserId"   TEXT,
  ADD COLUMN IF NOT EXISTS "nextActivity"     TEXT,
  ADD COLUMN IF NOT EXISTS "nextActivityAt"   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "leadSourceId"     TEXT;

-- funnel_stages: flags de etapa especial
ALTER TABLE funnel_stages
  ADD COLUMN IF NOT EXISTS "isInitial" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "isWon"     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "isLost"    BOOLEAN NOT NULL DEFAULT FALSE;

-- tasks: tipo, notas, vínculos
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS "type"        TEXT NOT NULL DEFAULT 'OUTRO',
  ADD COLUMN IF NOT EXISTS "notes"       TEXT,
  ADD COLUMN IF NOT EXISTS "assigneeId"  TEXT,
  ADD COLUMN IF NOT EXISTS "patientId"   TEXT,
  ADD COLUMN IF NOT EXISTS "leadId"      TEXT,
  ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMPTZ;

-- plans: campos adicionais de configuração
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS "categoria"             TEXT,
  ADD COLUMN IF NOT EXISTS "tipo"                  TEXT,
  ADD COLUMN IF NOT EXISTS "tipoGeracaoSessoes"    TEXT    NOT NULL DEFAULT 'nao_gera',
  ADD COLUMN IF NOT EXISTS "quantidadeSessoes"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "composicaoSessoes"     JSONB,
  ADD COLUMN IF NOT EXISTS "duracaoPadrao"          INTEGER,
  ADD COLUMN IF NOT EXISTS "profissionalPadrao"    TEXT,
  ADD COLUMN IF NOT EXISTS "salaPadrao"            TEXT,
  ADD COLUMN IF NOT EXISTS "validadeDias"          INTEGER;


-- ─── 2. NOVA TABELA: lead_sources ────────────────────────────

CREATE TABLE IF NOT EXISTS lead_sources (
  "id"        TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "clinicId"  TEXT        NOT NULL,
  "name"      TEXT        NOT NULL,
  "active"    BOOLEAN     NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT lead_sources_pkey PRIMARY KEY ("id"),
  CONSTRAINT lead_sources_clinic_fkey
    FOREIGN KEY ("clinicId") REFERENCES clinics ("id") ON DELETE CASCADE
);


-- ─── 3. NOVA TABELA: lead_loss_reasons ───────────────────────

CREATE TABLE IF NOT EXISTS lead_loss_reasons (
  "id"        TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "clinicId"  TEXT        NOT NULL,
  "name"      TEXT        NOT NULL,
  "active"    BOOLEAN     NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT lead_loss_reasons_pkey PRIMARY KEY ("id"),
  CONSTRAINT lead_loss_reasons_clinic_fkey
    FOREIGN KEY ("clinicId") REFERENCES clinics ("id") ON DELETE CASCADE
);


-- ─── 4. NOVA TABELA: lead_history ────────────────────────────

CREATE TABLE IF NOT EXISTS lead_history (
  "id"        TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "leadId"    TEXT        NOT NULL,
  "clinicId"  TEXT        NOT NULL,
  "event"     TEXT        NOT NULL,
  "content"   TEXT        NOT NULL,
  "userId"    TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT lead_history_pkey PRIMARY KEY ("id"),
  CONSTRAINT lead_history_lead_fkey
    FOREIGN KEY ("leadId") REFERENCES leads ("id") ON DELETE CASCADE
);


-- ─── 5. NOVA TABELA: post_its ────────────────────────────────

CREATE TABLE IF NOT EXISTS post_its (
  "id"        TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "clinicId"  TEXT        NOT NULL,
  "title"     TEXT,
  "content"   TEXT        NOT NULL,
  "color"     TEXT        NOT NULL DEFAULT '#FFFBEB',
  "userId"    TEXT,
  "pinned"    BOOLEAN     NOT NULL DEFAULT FALSE,
  "archived"  BOOLEAN     NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT post_its_pkey PRIMARY KEY ("id"),
  CONSTRAINT post_its_clinic_fkey
    FOREIGN KEY ("clinicId") REFERENCES clinics ("id") ON DELETE CASCADE
);


-- ─── 6. NOVA TABELA: financial_recurrences ───────────────────

CREATE TABLE IF NOT EXISTS financial_recurrences (
  "id"          TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "clinicId"    TEXT        NOT NULL,
  "type"        TEXT        NOT NULL,
  "description" TEXT        NOT NULL,
  "amount"      FLOAT8      NOT NULL,
  "frequency"   TEXT        NOT NULL,
  "startDate"   TIMESTAMPTZ NOT NULL,
  "endDate"     TIMESTAMPTZ,
  "occurrences" INTEGER     NOT NULL DEFAULT 1,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT financial_recurrences_pkey PRIMARY KEY ("id"),
  CONSTRAINT financial_recurrences_clinic_fkey
    FOREIGN KEY ("clinicId") REFERENCES clinics ("id") ON DELETE CASCADE
);


-- ─── 7. FOREIGN KEYS nas novas colunas ───────────────────────

-- leads.assignedUserId → users
DO $$ BEGIN
  ALTER TABLE leads
    ADD CONSTRAINT leads_assignedUser_fkey
    FOREIGN KEY ("assignedUserId") REFERENCES users ("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- leads.leadSourceId → lead_sources
DO $$ BEGIN
  ALTER TABLE leads
    ADD CONSTRAINT leads_leadSource_fkey
    FOREIGN KEY ("leadSourceId") REFERENCES lead_sources ("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- financial_transactions.recurrenceId → financial_recurrences
DO $$ BEGIN
  ALTER TABLE financial_transactions
    ADD CONSTRAINT financial_transactions_recurrence_fkey
    FOREIGN KEY ("recurrenceId") REFERENCES financial_recurrences ("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ─── 8. ÍNDICES úteis ────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_lead_history_leadId    ON lead_history ("leadId");
CREATE INDEX IF NOT EXISTS idx_lead_history_clinicId  ON lead_history ("clinicId");
CREATE INDEX IF NOT EXISTS idx_lead_sources_clinicId  ON lead_sources ("clinicId");
CREATE INDEX IF NOT EXISTS idx_lead_loss_reasons_clinicId ON lead_loss_reasons ("clinicId");
CREATE INDEX IF NOT EXISTS idx_post_its_clinicId      ON post_its ("clinicId");
CREATE INDEX IF NOT EXISTS idx_fin_rec_clinicId       ON financial_recurrences ("clinicId");
CREATE INDEX IF NOT EXISTS idx_fin_tx_recurrenceId    ON financial_transactions ("recurrenceId");
CREATE INDEX IF NOT EXISTS idx_leads_assignedUserId   ON leads ("assignedUserId");
CREATE INDEX IF NOT EXISTS idx_leads_leadSourceId     ON leads ("leadSourceId");

-- ─── FIM ─────────────────────────────────────────────────────
-- Verificação rápida (opcional — cole numa query separada):
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- ORDER BY table_name;
