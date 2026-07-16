from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class MobileFieldSyncRecord(BaseModel):
    source_local_id: str
    payload: dict[str, Any]


class MobileFieldSyncRequest(BaseModel):
    project_id: UUID
    batch_id: UUID

    social_registrations: list[MobileFieldSyncRecord] = Field(
        default_factory=list,
        max_length=500,
    )

    physical_registrations: list[MobileFieldSyncRecord] = Field(
        default_factory=list,
        max_length=500,
    )


class MobileFieldSyncAccepted(BaseModel):
    entity_type: str
    source_local_id: str
    status: str = "synced"


class MobileFieldSyncRejected(BaseModel):
    entity_type: str
    source_local_id: str
    reason: str


class MobileFieldSyncResponse(BaseModel):
    batch_id: UUID

    accepted: list[MobileFieldSyncAccepted] = Field(
        default_factory=list,
    )

    rejected: list[MobileFieldSyncRejected] = Field(
        default_factory=list,
    )

    created: dict[str, int] = Field(default_factory=dict)
    updated: dict[str, int] = Field(default_factory=dict)

    server_time: datetime


class MobileFieldSyncPullResponse(BaseModel):
    project_id: UUID

    social_registrations: list[dict[str, Any]] = Field(
        default_factory=list,
    )

    physical_registrations: list[dict[str, Any]] = Field(
        default_factory=list,
    )

    server_time: datetime
