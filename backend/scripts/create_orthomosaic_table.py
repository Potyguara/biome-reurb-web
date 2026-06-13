from sqlalchemy import text

from app.db.session import engine


SQL = """
CREATE TABLE IF NOT EXISTS project_orthomosaics (
    id UUID PRIMARY KEY,

    project_id UUID NOT NULL REFERENCES projects(id),

    original_filename VARCHAR(255) NOT NULL,
    stored_filename VARCHAR(255) NOT NULL,

    file_path VARCHAR(500) NOT NULL,
    preview_path VARCHAR(500) NOT NULL,

    crs VARCHAR(255) NULL,

    min_lon DOUBLE PRECISION NULL,
    min_lat DOUBLE PRECISION NULL,
    max_lon DOUBLE PRECISION NULL,
    max_lat DOUBLE PRECISION NULL,

    width INTEGER NULL,
    height INTEGER NULL,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_project_orthomosaics_project_id
ON project_orthomosaics(project_id);
"""


def main() -> None:
    with engine.begin() as conn:
        conn.execute(text(SQL))

    print("Tabela project_orthomosaics criada/verificada com sucesso.")


if __name__ == "__main__":
    main()
