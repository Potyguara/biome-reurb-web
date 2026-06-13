ALTER TABLE lots
ADD COLUMN IF NOT EXISTS mobile_import_id UUID NULL,
ADD COLUMN IF NOT EXISTS source_local_id TEXT NULL,
ADD COLUMN IF NOT EXISTS source_device_id TEXT NULL,
ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ NULL;

ALTER TABLE seals
ADD COLUMN IF NOT EXISTS mobile_import_id UUID NULL,
ADD COLUMN IF NOT EXISTS source_local_id TEXT NULL,
ADD COLUMN IF NOT EXISTS source_device_id TEXT NULL,
ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ NULL;

ALTER TABLE social_registrations
ADD COLUMN IF NOT EXISTS mobile_import_id UUID NULL,
ADD COLUMN IF NOT EXISTS source_local_id TEXT NULL,
ADD COLUMN IF NOT EXISTS source_device_id TEXT NULL,
ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ NULL;

ALTER TABLE physical_registrations
ADD COLUMN IF NOT EXISTS mobile_import_id UUID NULL,
ADD COLUMN IF NOT EXISTS source_local_id TEXT NULL,
ADD COLUMN IF NOT EXISTS source_device_id TEXT NULL,
ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ NULL;

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS mobile_import_id UUID NULL,
ADD COLUMN IF NOT EXISTS source_local_id TEXT NULL,
ADD COLUMN IF NOT EXISTS source_device_id TEXT NULL,
ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ NULL;

ALTER TABLE mobile_imports
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS error_message TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_lots_project_source
ON lots(project_id, source_local_id);

CREATE INDEX IF NOT EXISTS idx_seals_project_source
ON seals(project_id, source_local_id);

CREATE INDEX IF NOT EXISTS idx_social_project_source
ON social_registrations(project_id, source_local_id);

CREATE INDEX IF NOT EXISTS idx_physical_project_source
ON physical_registrations(project_id, source_local_id);

CREATE INDEX IF NOT EXISTS idx_documents_project_source
ON documents(project_id, source_local_id);