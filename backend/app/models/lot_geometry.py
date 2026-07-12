import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.base import TimestampMixin, UUIDMixin


class LotGeometry(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "lot_geometries"
    __table_args__ = (
        UniqueConstraint(
            "project_id", "source_device_id", "source_local_id", "version",
            name="uq_lot_geometries_source_version",
        ),
        Index(
            "ix_lot_geometries_current_project_status",
            "project_id", "is_current", "workflow_status",
        ),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    lot_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("lots.id"), nullable=True, index=True)
    seal_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("seals.id"), nullable=True, index=True)
    social_registration_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("social_registrations.id"), nullable=True, index=True)

    source_local_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    source_device_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)

    origin: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    workflow_status: Mapped[str] = mapped_column(String(80), default="rascunho", nullable=False, index=True)

    geometry_type: Mapped[str] = mapped_column(String(40), default="MultiPolygon", nullable=False)
    geometry_geojson: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    geom = mapped_column(Geometry("MULTIPOLYGON", srid=4326), nullable=True)

    area_m2: Mapped[float | None] = mapped_column(Float, nullable=True)
    perimeter_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    geospatial_accuracy_m: Mapped[float | None] = mapped_column(Float, nullable=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    validation_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    validated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)

    parent_geometry_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("lot_geometries.id"), nullable=True, index=True)
    superseded_by_geometry_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("lot_geometries.id"), nullable=True, index=True)

    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)

    client_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    client_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    server_received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
