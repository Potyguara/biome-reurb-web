from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=3)
    municipality: str = Field(..., min_length=2)
    state: str = Field(..., min_length=2, max_length=2)
    neighborhood: str = Field(..., min_length=2)

    reurb_type: str = Field(..., description="REURB-S ou REURB-E")
    status: str = "em_execucao"

    administrative_process_number: str | None = None
    legal_basis: str | None = None

    estimated_area_ha: float | None = None
    estimated_lots: int | None = None

    promoter: str | None = None
    technical_responsible: str | None = None
    notes: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    municipality: str | None = None
    state: str | None = Field(default=None, min_length=2, max_length=2)
    neighborhood: str | None = None

    reurb_type: str | None = None
    status: str | None = None

    administrative_process_number: str | None = None
    legal_basis: str | None = None

    estimated_area_ha: float | None = None
    estimated_lots: int | None = None

    promoter: str | None = None
    technical_responsible: str | None = None
    notes: str | None = None


class ProjectResponse(BaseModel):
    id: str

    name: str
    municipality: str
    state: str
    neighborhood: str

    reurb_type: str
    status: str

    administrative_process_number: str | None = None
    legal_basis: str | None = None

    estimated_area_ha: float | None = None
    estimated_lots: int | None = None

    promoter: str | None = None
    technical_responsible: str | None = None
    notes: str | None = None

    class Config:
        from_attributes = True
