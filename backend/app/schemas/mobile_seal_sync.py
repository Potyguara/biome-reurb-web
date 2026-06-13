from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class SealCodeReservationRequest(BaseModel):
    device_id: UUID
    quantity: int = Field(default=50, ge=1, le=500)


class SealCodeReservationResponse(BaseModel):
    reservation_id: UUID
    project_id: UUID
    device_id: UUID
    prefix: str
    start_number: int
    end_number: int
    next_number: int
    quantity: int
    codes: list[str]


class MobileSealPushItem(BaseModel):
    source_local_id: UUID
    source_device_id: UUID
    seal_code: str = Field(min_length=1, max_length=100)

    lot_id: UUID | None = None
    lot_code: str | None = Field(default=None, max_length=100)

    situation: str = Field(default="ocupado", max_length=100)
    resident_present: bool | None = None
    dwelling_occupied: bool | None = None
    service_status: str | None = Field(default=None, max_length=100)
    unit_type: str | None = Field(default=None, max_length=100)
    property_use: str | None = Field(default=None, max_length=100)

    informant_name: str | None = Field(default=None, max_length=255)
    informant_phone: str | None = Field(default=None, max_length=50)
    informant_relationship: str | None = Field(default=None, max_length=100)

    revisit_required: bool = False
    facade_photo_path: str | None = None
    notes: str | None = None

    geo_link_status: str = Field(default="nao_validado", max_length=100)
    needs_rtk_validation: bool = False
    geospatial_note: str | None = None

    latitude: float | None = None
    longitude: float | None = None
    gps_accuracy: float | None = None

    client_created_at: datetime | None = None
    client_updated_at: datetime | None = None
    expected_sync_version: int | None = Field(default=None, ge=1)
    deleted: bool = False

    @field_validator("latitude")
    @classmethod
    def validate_latitude(cls, value: float | None) -> float | None:
        if value is not None and not -90 <= value <= 90:
            raise ValueError("Latitude fora do intervalo válido.")
        return value

    @field_validator("longitude")
    @classmethod
    def validate_longitude(cls, value: float | None) -> float | None:
        if value is not None and not -180 <= value <= 180:
            raise ValueError("Longitude fora do intervalo válido.")
        return value


class MobileSealPushRequest(BaseModel):
    project_id: UUID
    batch_id: UUID
    records: list[MobileSealPushItem] = Field(min_length=1, max_length=500)


class MobileSealAcceptedItem(BaseModel):
    source_local_id: UUID
    server_id: UUID
    seal_code: str
    sync_version: int
    status: str
    server_updated_at: datetime


class MobileSealRejectedItem(BaseModel):
    source_local_id: UUID
    seal_code: str
    reason: str


class MobileSealConflictItem(BaseModel):
    source_local_id: UUID
    server_id: UUID
    seal_code: str
    expected_sync_version: int
    current_sync_version: int
    reason: str


class MobileSealPushResponse(BaseModel):
    batch_id: UUID
    accepted: list[MobileSealAcceptedItem] = Field(default_factory=list)
    rejected: list[MobileSealRejectedItem] = Field(default_factory=list)
    conflicts: list[MobileSealConflictItem] = Field(default_factory=list)
    server_time: datetime


class MobileSealPullItem(BaseModel):
    id: UUID
    project_id: UUID
    source_local_id: UUID | None = None
    source_device_id: UUID | None = None
    seal_code: str
    lot_id: UUID | None = None
    lot_code: str | None = None
    situation: str
    resident_present: bool | None = None
    dwelling_occupied: bool | None = None
    service_status: str | None = None
    unit_type: str | None = None
    property_use: str | None = None
    informant_name: str | None = None
    informant_phone: str | None = None
    informant_relationship: str | None = None
    revisit_required: bool
    facade_photo_path: str | None = None
    notes: str | None = None
    geo_link_status: str
    needs_rtk_validation: bool
    geospatial_note: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    gps_accuracy: float | None = None
    client_created_at: datetime | None = None
    client_updated_at: datetime | None = None
    sync_version: int
    deleted: bool
    created_at: datetime
    updated_at: datetime


class MobileSealPullResponse(BaseModel):
    project_id: UUID
    records: list[MobileSealPullItem]
    next_cursor: datetime
    server_time: datetime
