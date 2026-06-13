BEGIN;

ALTER TABLE seals
    ADD COLUMN IF NOT EXISTS resident_present BOOLEAN,
    ADD COLUMN IF NOT EXISTS dwelling_occupied BOOLEAN,
    ADD COLUMN IF NOT EXISTS service_status VARCHAR(100),
    ADD COLUMN IF NOT EXISTS unit_type VARCHAR(100),
    ADD COLUMN IF NOT EXISTS property_use VARCHAR(100),
    ADD COLUMN IF NOT EXISTS informant_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS informant_phone VARCHAR(50),
    ADD COLUMN IF NOT EXISTS informant_relationship VARCHAR(100),
    ADD COLUMN IF NOT EXISTS revisit_required BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS facade_photo_path TEXT,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS source_local_id UUID,
    ADD COLUMN IF NOT EXISTS source_device_id UUID,
    ADD COLUMN IF NOT EXISTS client_created_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS client_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS server_received_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sync_version INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS updated_by_user_id UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS ix_seals_source_local_id
    ON seals(source_local_id);

CREATE INDEX IF NOT EXISTS ix_seals_source_device_id
    ON seals(source_device_id);

CREATE INDEX IF NOT EXISTS ix_seals_created_by_user_id
    ON seals(created_by_user_id);

CREATE INDEX IF NOT EXISTS ix_seals_updated_by_user_id
    ON seals(updated_by_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seals_project_device_local
    ON seals(project_id, source_device_id, source_local_id)
    WHERE source_device_id IS NOT NULL
      AND source_local_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_seals_project_code
    ON seals(project_id, seal_code);

CREATE TABLE IF NOT EXISTS seal_code_reservations (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id),
    user_id UUID NOT NULL REFERENCES users(id),
    device_id UUID NOT NULL,
    prefix VARCHAR(20) NOT NULL,
    start_number BIGINT NOT NULL,
    end_number BIGINT NOT NULL,
    next_number BIGINT NOT NULL,
    quantity INTEGER NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_seal_reservation_range
        UNIQUE(project_id, start_number, end_number)
);

CREATE INDEX IF NOT EXISTS ix_seal_code_reservations_project_id
    ON seal_code_reservations(project_id);

CREATE INDEX IF NOT EXISTS ix_seal_code_reservations_user_id
    ON seal_code_reservations(user_id);

CREATE INDEX IF NOT EXISTS ix_seal_code_reservations_device_id
    ON seal_code_reservations(device_id);

COMMIT;
