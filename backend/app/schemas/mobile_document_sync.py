from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class MobileDocumentPushItem(BaseModel):
    source_local_id: UUID
    source_device_id: UUID

    lot_id: UUID | None = None
    seal_id: UUID | None = None
    social_registration_id: UUID | None = None

    seal_code: str
    document_type: str

    original_filename: str | None = None
    stored_filename: str | None = None
    mime_type: str | None = None
    file_size_bytes: int | None = Field(default=None, ge=0)

    notes: str | None = None

    client_created_at: datetime | None = None
    client_updated_at: datetime | None = None

    expected_sync_version: int | None = Field(default=None, ge=1)

    deleted: bool = False


class MobileDocumentPushRequest(BaseModel):
    project_id: UUID
    batch_id: UUID
    records: list[MobileDocumentPushItem] = Field(
        min_length=1,
        max_length=500,
    )


class MobileDocumentAcceptedItem(BaseModel):
    source_local_id: UUID
    server_id: UUID
    sync_version: int
    status: str
    server_updated_at: datetime


class MobileDocumentRejectedItem(BaseModel):
    source_local_id: UUID
    reason: str


class MobileDocumentConflictItem(BaseModel):
    source_local_id: UUID
    server_id: UUID
    expected_sync_version: int
    current_sync_version: int
    reason: str


class MobileDocumentPushResponse(BaseModel):
    batch_id: UUID

    accepted: list[MobileDocumentAcceptedItem] = Field(default_factory=list)

    rejected: list[MobileDocumentRejectedItem] = Field(default_factory=list)

    conflicts: list[MobileDocumentConflictItem] = Field(default_factory=list)

    server_time: datetime


class MobileDocumentPullItem(BaseModel):
    id: UUID

    project_id: UUID

    source_local_id: UUID | None = None
    source_device_id: UUID | None = None

    lot_id: UUID | None = None
    seal_id: UUID | None = None
    social_registration_id: UUID | None = None

    seal_code: str

    document_type: str

    original_filename: str | None = None
    stored_filename: str | None = None

    mime_type: str | None = None

    file_size_bytes: int | None = None

    notes: str | None = None

    sync_version: int

    deleted: bool

    client_created_at: datetime | None = None
    client_updated_at: datetime | None = None
    server_received_at: datetime | None = None

    created_at: datetime
    updated_at: datetime


class MobileDocumentPullResponse(BaseModel):
    project_id: UUID

    records: list[MobileDocumentPullItem]

    next_cursor: datetime

    server_time: datetime
