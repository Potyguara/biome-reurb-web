ALTER TABLE lots
ADD COLUMN IF NOT EXISTS lot_review_status TEXT NOT NULL DEFAULT 'preliminar',
ADD COLUMN IF NOT EXISTS technical_status TEXT NOT NULL DEFAULT 'sem_geometria',
ADD COLUMN IF NOT EXISTS is_ready_for_technical_documents BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS geometry_geojson JSONB NULL,
ADD COLUMN IF NOT EXISTS centroid_latitude DOUBLE PRECISION NULL,
ADD COLUMN IF NOT EXISTS centroid_longitude DOUBLE PRECISION NULL,
ADD COLUMN IF NOT EXISTS geospatial_source TEXT NULL,
ADD COLUMN IF NOT EXISTS geospatial_accuracy_m DOUBLE PRECISION NULL,
ADD COLUMN IF NOT EXISTS revision_notes TEXT NULL,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS approved_by_user_id UUID NULL;

CREATE INDEX IF NOT EXISTS idx_lots_project_code
ON lots(project_id, code);

CREATE INDEX IF NOT EXISTS idx_lots_project_review_status
ON lots(project_id, lot_review_status);

CREATE INDEX IF NOT EXISTS idx_lots_project_ready
ON lots(project_id, is_ready_for_technical_documents);