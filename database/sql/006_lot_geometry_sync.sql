BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS lot_geometries (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id),
    lot_id UUID REFERENCES lots(id),
    seal_id UUID REFERENCES seals(id),
    social_registration_id UUID REFERENCES social_registrations(id),

    source_local_id UUID NOT NULL,
    source_device_id UUID NOT NULL,

    origin VARCHAR(80) NOT NULL,
    workflow_status VARCHAR(80) NOT NULL DEFAULT 'rascunho',

    geometry_type VARCHAR(40) NOT NULL DEFAULT 'MultiPolygon',
    geometry_geojson JSONB,
    geom geometry(MULTIPOLYGON, 4326),

    area_m2 DOUBLE PRECISION,
    perimeter_m DOUBLE PRECISION,
    geospatial_accuracy_m DOUBLE PRECISION,

    notes TEXT,
    validation_note TEXT,
    validated_at TIMESTAMPTZ,

    created_by_user_id UUID REFERENCES users(id),
    validated_by_user_id UUID REFERENCES users(id),

    parent_geometry_id UUID REFERENCES lot_geometries(id),
    superseded_by_geometry_id UUID REFERENCES lot_geometries(id),

    version INTEGER NOT NULL DEFAULT 1,
    is_current BOOLEAN NOT NULL DEFAULT TRUE,

    client_created_at TIMESTAMPTZ,
    client_updated_at TIMESTAMPTZ,
    server_received_at TIMESTAMPTZ,

    deleted BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_lot_geometries_source_version
        UNIQUE (
            project_id,
            source_device_id,
            source_local_id,
            version
        ),

    CONSTRAINT ck_lot_geometries_version_positive
        CHECK (version >= 1),

    CONSTRAINT ck_lot_geometries_origin
        CHECK (
            origin IN (
                'tecnico_importado',
                'cidadao_declarado',
                'cidadao_vetorizado',
                'tecnico_vetorizado',
                'rtk_campo',
                'painel_web'
            )
        ),

    CONSTRAINT ck_lot_geometries_workflow_status
        CHECK (
            workflow_status IN (
                'rascunho',
                'declarado',
                'aguardando_validacao',
                'em_analise',
                'validado',
                'rejeitado',
                'substituido',
                'arquivado'
            )
        )
);

CREATE INDEX IF NOT EXISTS ix_lot_geometries_project_id
    ON lot_geometries(project_id);

CREATE INDEX IF NOT EXISTS ix_lot_geometries_lot_id
    ON lot_geometries(lot_id);

CREATE INDEX IF NOT EXISTS ix_lot_geometries_seal_id
    ON lot_geometries(seal_id);

CREATE INDEX IF NOT EXISTS ix_lot_geometries_social_registration_id
    ON lot_geometries(social_registration_id);

CREATE INDEX IF NOT EXISTS ix_lot_geometries_source_local_id
    ON lot_geometries(source_local_id);

CREATE INDEX IF NOT EXISTS ix_lot_geometries_source_device_id
    ON lot_geometries(source_device_id);

CREATE INDEX IF NOT EXISTS ix_lot_geometries_origin
    ON lot_geometries(origin);

CREATE INDEX IF NOT EXISTS ix_lot_geometries_workflow_status
    ON lot_geometries(workflow_status);

CREATE INDEX IF NOT EXISTS ix_lot_geometries_parent_geometry_id
    ON lot_geometries(parent_geometry_id);

CREATE INDEX IF NOT EXISTS ix_lot_geometries_superseded_by_geometry_id
    ON lot_geometries(superseded_by_geometry_id);

CREATE INDEX IF NOT EXISTS ix_lot_geometries_created_by_user_id
    ON lot_geometries(created_by_user_id);

CREATE INDEX IF NOT EXISTS ix_lot_geometries_validated_by_user_id
    ON lot_geometries(validated_by_user_id);

CREATE INDEX IF NOT EXISTS ix_lot_geometries_current_project_status
    ON lot_geometries(project_id, is_current, workflow_status);

CREATE INDEX IF NOT EXISTS ix_lot_geometries_geom_gist
    ON lot_geometries
    USING GIST (geom);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lot_geometries_current_source
    ON lot_geometries(
        project_id,
        source_device_id,
        source_local_id
    )
    WHERE is_current = TRUE;

COMMIT;
