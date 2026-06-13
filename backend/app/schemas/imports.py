from datetime import datetime
from pydantic import BaseModel


class MobileImportResponse(BaseModel):
    id: str
    project_id: str | None = None

    original_filename: str
    stored_zip_path: str
    extracted_dir_path: str | None = None
    json_path: str | None = None

    status: str

    total_projects: int = 0
    total_lots: int = 0
    total_seals: int = 0
    total_social_registrations: int = 0
    total_physical_registrations: int = 0
    total_documents: int = 0

    # Campos compatíveis com o frontend atual
    total_records: int = 0
    lots_count: int = 0
    seals_count: int = 0
    social_count: int = 0
    physical_count: int = 0
    documents_count: int = 0

    errors: dict | None = None

    created_at: datetime

    class Config:
        from_attributes = True
