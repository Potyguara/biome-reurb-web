BEGIN;

-- ============================================================
-- BIOME REURB
-- Sincronização da tabela seals com o model mobile atual
-- Data: 2026-08-06
--
-- Objetivos:
--   1. Adicionar campos do fluxo mobile ausentes no banco.
--   2. Preservar integralmente registros legados.
--   3. Não remover mobile_import_id/imported_at.
--   4. Criar FKs e índices necessários.
--   5. Permitir reexecução segura.
-- ============================================================


-- ------------------------------------------------------------
-- CAMPOS DE ATENDIMENTO / SELAGEM
-- ------------------------------------------------------------

ALTER TABLE seals
    ADD COLUMN IF NOT EXISTS resident_present BOOLEAN;

ALTER TABLE seals
    ADD COLUMN IF NOT EXISTS dwelling_occupied BOOLEAN;

ALTER TABLE seals
    ADD COLUMN IF NOT EXISTS service_status VARCHAR(100);

ALTER TABLE seals
    ADD COLUMN IF NOT EXISTS unit_type VARCHAR(100);

ALTER TABLE seals
    ADD COLUMN IF NOT EXISTS property_use VARCHAR(100);

ALTER TABLE seals
    ADD COLUMN IF NOT EXISTS informant_name VARCHAR(255);

ALTER TABLE seals
    ADD COLUMN IF NOT EXISTS informant_phone VARCHAR(50);

ALTER TABLE seals
    ADD COLUMN IF NOT EXISTS informant_relationship VARCHAR(100);

ALTER TABLE seals
    ADD COLUMN IF NOT EXISTS facade_photo_path TEXT;

ALTER TABLE seals
    ADD COLUMN IF NOT EXISTS notes TEXT;


-- ------------------------------------------------------------
-- CAMPOS BOOLEANOS NÃO-NULOS
-- ------------------------------------------------------------

ALTER TABLE seals
    ADD COLUMN IF NOT EXISTS revisit_required BOOLEAN DEFAULT FALSE;

UPDATE seals
SET revisit_required = FALSE
WHERE revisit_required IS NULL;

ALTER TABLE seals
    ALTER COLUMN revisit_required SET DEFAULT FALSE;

ALTER TABLE seals
    ALTER COLUMN revisit_required SET NOT NULL;


ALTER TABLE seals
    ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE;

UPDATE seals
SET deleted = FALSE
WHERE deleted IS NULL;

ALTER TABLE seals
    ALTER COLUMN deleted SET DEFAULT FALSE;

ALTER TABLE seals
    ALTER COLUMN deleted SET NOT NULL;


-- ------------------------------------------------------------
-- CONTROLE DE SINCRONIZAÇÃO
-- ------------------------------------------------------------

ALTER TABLE seals
    ADD COLUMN IF NOT EXISTS client_created_at TIMESTAMPTZ;

ALTER TABLE seals
    ADD COLUMN IF NOT EXISTS client_updated_at TIMESTAMPTZ;

ALTER TABLE seals
    ADD COLUMN IF NOT EXISTS server_received_at TIMESTAMPTZ;


ALTER TABLE seals
    ADD COLUMN IF NOT EXISTS sync_version INTEGER DEFAULT 1;

UPDATE seals
SET sync_version = 1
WHERE sync_version IS NULL;

ALTER TABLE seals
    ALTER COLUMN sync_version SET DEFAULT 1;

ALTER TABLE seals
    ALTER COLUMN sync_version SET NOT NULL;


-- ------------------------------------------------------------
-- AUDITORIA / USUÁRIOS
-- ------------------------------------------------------------

ALTER TABLE seals
    ADD COLUMN IF NOT EXISTS created_by_user_id UUID;

ALTER TABLE seals
    ADD COLUMN IF NOT EXISTS updated_by_user_id UUID;


-- ------------------------------------------------------------
-- FOREIGN KEYS
-- Criação condicionada para permitir reexecução.
-- ------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'seals_created_by_user_id_fkey'
    ) THEN
        ALTER TABLE seals
            ADD CONSTRAINT seals_created_by_user_id_fkey
            FOREIGN KEY (created_by_user_id)
            REFERENCES users(id);
    END IF;
END
$$;


DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'seals_updated_by_user_id_fkey'
    ) THEN
        ALTER TABLE seals
            ADD CONSTRAINT seals_updated_by_user_id_fkey
            FOREIGN KEY (updated_by_user_id)
            REFERENCES users(id);
    END IF;
END
$$;


-- ------------------------------------------------------------
-- ÍNDICES DO MODEL
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS ix_seals_source_local_id
    ON seals (source_local_id);

CREATE INDEX IF NOT EXISTS ix_seals_source_device_id
    ON seals (source_device_id);

CREATE INDEX IF NOT EXISTS ix_seals_created_by_user_id
    ON seals (created_by_user_id);

CREATE INDEX IF NOT EXISTS ix_seals_updated_by_user_id
    ON seals (updated_by_user_id);


COMMIT;
