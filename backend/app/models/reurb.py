import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.base import TimestampMixin, UUIDMixin


class Lot(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "lots"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id"),
        nullable=False,
        index=True,
    )

    code: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )

    block: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    area_m2: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    perimeter_m: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        default="preliminar",
        nullable=False,
    )

    needs_review: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    geom = mapped_column(
        Geometry("MULTIPOLYGON", srid=4326),
        nullable=True,
    )

    source_file: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # -------------------------------------------------------------------------
    # Rastreabilidade da importação mobile/geoespacial
    # -------------------------------------------------------------------------

    mobile_import_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("mobile_imports.id"),
        nullable=True,
        index=True,
    )

    source_local_id: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        index=True,
    )

    source_device_id: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    imported_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # -------------------------------------------------------------------------
    # Revisão técnica e aptidão para peças técnicas
    # -------------------------------------------------------------------------

    lot_review_status: Mapped[str] = mapped_column(
        String(50),
        default="preliminar",
        nullable=False,
    )

    technical_status: Mapped[str] = mapped_column(
        String(100),
        default="sem_geometria",
        nullable=False,
    )

    is_ready_for_technical_documents: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    revision_notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    approved_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )

    # -------------------------------------------------------------------------
    # Geometria e metadados geoespaciais
    # -------------------------------------------------------------------------

    geometry_geojson: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
    )

    centroid_latitude: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    centroid_longitude: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    geospatial_source: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    geospatial_accuracy_m: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )


class Seal(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "seals"
    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "source_device_id",
            "source_local_id",
            name="uq_seals_project_device_local",
        ),
        UniqueConstraint(
            "project_id",
            "seal_code",
            name="uq_seals_project_code",
        ),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id"),
        nullable=False,
        index=True,
    )

    lot_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lots.id"),
        nullable=True,
        index=True,
    )

    seal_code: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )

    lot_code: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    situation: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    resident_present: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True,
    )

    dwelling_occupied: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True,
    )

    service_status: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    unit_type: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    property_use: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    informant_name: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    informant_phone: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    informant_relationship: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    revisit_required: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    facade_photo_path: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    geo_link_status: Mapped[str] = mapped_column(
        String(100),
        default="nao_validado",
        nullable=False,
    )

    needs_rtk_validation: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    geospatial_note: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    latitude: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    longitude: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    gps_accuracy: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    geom = mapped_column(
        Geometry("POINT", srid=4326),
        nullable=True,
    )

    source_local_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
        index=True,
    )

    source_device_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
        index=True,
    )

    client_created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    client_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    server_received_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    sync_version: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )

    deleted: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )

    updated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )


class SealCodeReservation(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "seal_code_reservations"
    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "start_number",
            "end_number",
            name="uq_seal_reservation_range",
        ),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id"),
        nullable=False,
        index=True,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    device_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )

    prefix: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    start_number: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
    )

    end_number: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
    )

    next_number: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
    )

    quantity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


class SocialRegistration(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "social_registrations"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id"),
        nullable=False,
        index=True,
    )

    seal_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("seals.id"),
        nullable=True,
        index=True,
    )

    seal_code: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )

    responsible_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    responsible_cpf: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
        index=True,
    )

    responsible_rg: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    issuing_agency: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    phone: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    marital_status: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    profession: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    household_members: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    family_income: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    receives_social_program: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    social_program: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    occupation_years: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    occupation_type: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    possession_document: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    owns_other_property: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    has_conflict: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )


class PhysicalRegistration(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "physical_registrations"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id"),
        nullable=False,
        index=True,
    )

    seal_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("seals.id"),
        nullable=True,
        index=True,
    )

    seal_code: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )

    property_type: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    property_use: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    wall_material: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    roof_type: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    floor_type: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    floors: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    rooms: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    bathrooms: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    has_energy: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    has_water: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    has_sewage: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    has_bathroom: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    habitability_condition: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    risk_area: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    flood_prone: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )


class Document(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "documents"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id"),
        nullable=False,
        index=True,
    )

    lot_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lots.id"),
        nullable=True,
        index=True,
    )

    seal_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("seals.id"),
        nullable=True,
        index=True,
    )

    social_registration_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("social_registrations.id"),
        nullable=True,
        index=True,
    )

    seal_code: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )

    document_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    file_path: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    original_filename: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    stored_filename: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    mime_type: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    file_size_bytes: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    validated: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    document_status: Mapped[str] = mapped_column(
        String(50),
        default="pendente",
        nullable=False,
    )

    validation_notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    validated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    validated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )

    # ------------------------------------------------------------------
    # Sincronização Mobile
    # ------------------------------------------------------------------

    mobile_import_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("mobile_imports.id"),
        nullable=True,
        index=True,
    )

    source_local_id: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        index=True,
    )

    source_device_id: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    imported_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    client_created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    client_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    server_received_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    sync_version: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )

    deleted: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )


class MobileImport(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "mobile_imports"

    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id"),
        nullable=True,
        index=True,
    )

    original_filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    stored_zip_path: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )

    extracted_dir_path: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    json_path: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        default="received",
        nullable=False,
    )

    total_projects: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    total_lots: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    total_seals: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    total_social_registrations: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    total_physical_registrations: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    total_documents: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    errors: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
    )


class ProjectOrthomosaic(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "project_orthomosaics"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id"),
        nullable=False,
        index=True,
    )

    original_filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    stored_filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    file_path: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )

    preview_path: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )

    crs: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    min_lon: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    min_lat: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    max_lon: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    max_lat: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    width: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    height: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
