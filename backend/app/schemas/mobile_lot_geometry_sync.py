from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


GeometryOrigin = Literal[
    "tecnico_importado",
    "cidadao_declarado",
    "cidadao_vetorizado",
    "tecnico_vetorizado",
    "rtk_campo",
    "painel_web",
]

GeometryWorkflowStatus = Literal[
    "rascunho",
    "declarado",
    "aguardando_validacao",
    "em_analise",
    "validado",
    "rejeitado",
    "substituido",
    "arquivado",
]


class MobileLotGeometryPushItem(BaseModel):
    source_local_id: UUID
    source_device_id: UUID
    lot_id: UUID | None = None
    seal_id: UUID | None = None
    social_registration_id: UUID | None = None
    origin: GeometryOrigin
    workflow_status: GeometryWorkflowStatus = "rascunho"
    geometry_geojson: dict | None = None
    area_m2: float | None = Field(default=None, ge=0)
    perimeter_m: float | None = Field(default=None, ge=0)
    geospatial_accuracy_m: float | None = Field(default=None, ge=0)
    notes: str | None = None
    client_created_at: datetime | None = None
    client_updated_at: datetime | None = None
    expected_version: int | None = Field(default=None, ge=1)
    deleted: bool = False

    @field_validator("geometry_geojson")
    @classmethod
    def validate_geometry_geojson(cls, value: dict | None) -> dict | None:
        if value is None:
            return value
        if value.get("type") not in {"Polygon", "MultiPolygon"}:
            raise ValueError("A geometria deve ser GeoJSON Polygon ou MultiPolygon.")
        if not value.get("coordinates"):
            raise ValueError("GeoJSON sem coordenadas.")
        return value

    @model_validator(mode="after")
    def validate_deleted_or_geometry(self):
        if not self.deleted and self.geometry_geojson is None:
            raise ValueError("geometry_geojson é obrigatório quando deleted=false.")
        return self


class MobileLotGeometryPushRequest(BaseModel):
    project_id: UUID
    batch_id: UUID
    records: list[MobileLotGeometryPushItem] = Field(min_length=1, max_length=500)


class MobileLotGeometryAcceptedItem(BaseModel):
    source_local_id: UUID
    server_id: UUID
    version: int
    workflow_status: str
    status: str
    server_updated_at: datetime


class MobileLotGeometryRejectedItem(BaseModel):
    source_local_id: UUID
    reason: str


class MobileLotGeometryConflictItem(BaseModel):
    source_local_id: UUID
    server_id: UUID
    expected_version: int
    current_version: int
    reason: str


class MobileLotGeometryPushResponse(BaseModel):
    batch_id: UUID
    accepted: list[MobileLotGeometryAcceptedItem] = Field(default_factory=list)
    rejected: list[MobileLotGeometryRejectedItem] = Field(default_factory=list)
    conflicts: list[MobileLotGeometryConflictItem] = Field(default_factory=list)
    server_time: datetime


class MobileLotGeometryPullItem(BaseModel):
    id: UUID
    project_id: UUID
    lot_id: UUID | None = None
    seal_id: UUID | None = None
    social_registration_id: UUID | None = None
    source_local_id: UUID
    source_device_id: UUID
    origin: str
    workflow_status: str
    geometry_geojson: dict | None = None
    area_m2: float | None = None
    perimeter_m: float | None = None
    geospatial_accuracy_m: float | None = None
    notes: str | None = None
    validation_note: str | None = None
    validated_at: datetime | None = None
    validated_by_user_id: UUID | None = None
    parent_geometry_id: UUID | None = None
    superseded_by_geometry_id: UUID | None = None
    version: int
    is_current: bool
    deleted: bool
    client_created_at: datetime | None = None
    client_updated_at: datetime | None = None
    server_received_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class MobileLotGeometryPullResponse(BaseModel):
    project_id: UUID
    records: list[MobileLotGeometryPullItem]
    next_cursor: datetime
    server_time: datetime


class LotGeometryReviewRequest(BaseModel):
    note: str | None = None


class LotGeometryListResponse(BaseModel):
    project_id: UUID
    records: list[MobileLotGeometryPullItem]
