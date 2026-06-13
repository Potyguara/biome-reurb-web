ALTER TABLE documents
ADD COLUMN IF NOT EXISTS lot_id uuid NULL REFERENCES lots(id);

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS original_filename varchar(255) NULL;

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS stored_filename varchar(255) NULL;

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS mime_type varchar(100) NULL;

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS file_size_bytes integer NULL;

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS document_status varchar(50) NOT NULL DEFAULT 'pendente';

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS validation_notes text NULL;

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS validated_at timestamp with time zone NULL;

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS validated_by_user_id uuid NULL REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_documents_project_lot
ON documents(project_id, lot_id);

CREATE INDEX IF NOT EXISTS idx_documents_project_status
ON documents(project_id, document_status);

CREATE INDEX IF NOT EXISTS idx_documents_project_seal_code
ON documents(project_id, seal_code);