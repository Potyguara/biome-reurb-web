import json
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from geoalchemy2.functions import ST_GeomFromGeoJSON, ST_Multi, ST_SetSRID
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.access import ProjectUser
from app.models.lot_geometry import LotGeometry
from app.models.project import Project
from app.models.reurb import Lot, Seal, SocialRegistration
from app.models.user import User
from app.schemas.mobile_lot_geometry_sync import (
    LotGeometryListResponse,
    LotGeometryReviewRequest,
    MobileLotGeometryAcceptedItem,
    MobileLotGeometryConflictItem,
    MobileLotGeometryPullItem,
    MobileLotGeometryPullResponse,
    MobileLotGeometryPushRequest,
    MobileLotGeometryPushResponse,
    MobileLotGeometryRejectedItem,
)

router = APIRouter(tags=["BIOME REURB Geoespacial"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_project_access(
    db: Session,
    *,
    project_id: UUID,
    current_user: User,
) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Projeto REURB não encontrado.",
        )

    if current_user.is_global_admin:
        return project

    link = (
        db.query(ProjectUser)
        .filter(
            ProjectUser.project_id == project_id,
            ProjectUser.user_id == current_user.id,
            ProjectUser.active.is_(True),
        )
        .first()
    )

    if link is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário não possui acesso ativo a este projeto.",
        )

    return project


def _validate_references(
    db: Session,
    *,
    project_id: UUID,
    lot_id: UUID | None,
    seal_id: UUID | None,
    social_registration_id: UUID | None,
) -> None:
    if lot_id is not None:
        exists = (
            db.query(Lot.id)
            .filter(
                Lot.id == lot_id,
                Lot.project_id == project_id,
            )
            .first()
        )
        if exists is None:
            raise ValueError("O lote informado não pertence ao projeto.")

    if seal_id is not None:
        exists = (
            db.query(Seal.id)
            .filter(
                Seal.id == seal_id,
                Seal.project_id == project_id,
            )
            .first()
        )
        if exists is None:
            raise ValueError("A selagem informada não pertence ao projeto.")

    if social_registration_id is not None:
        exists = (
            db.query(SocialRegistration.id)
            .filter(
                SocialRegistration.id == social_registration_id,
                SocialRegistration.project_id == project_id,
            )
            .first()
        )
        if exists is None:
            raise ValueError("O cadastro social informado não pertence ao projeto.")


def _apply_geometry(record: LotGeometry, geometry_geojson: dict | None) -> None:
    record.geometry_geojson = geometry_geojson

    if geometry_geojson is None:
        record.geom = None
        record.geometry_type = "MultiPolygon"
        return

    record.geometry_type = geometry_geojson.get("type", "MultiPolygon")
    record.geom = ST_SetSRID(
        ST_Multi(ST_GeomFromGeoJSON(json.dumps(geometry_geojson))),
        4326,
    )


def _assert_valid_geometry(db: Session, geometry_id: UUID) -> None:
    result = (
        db.execute(
            text("""
            SELECT
                CASE WHEN geom IS NULL THEN TRUE ELSE ST_IsValid(geom) END AS is_valid,
                CASE WHEN geom IS NULL THEN NULL ELSE ST_IsValidReason(geom) END AS reason
            FROM lot_geometries
            WHERE id = :geometry_id
            """),
            {"geometry_id": geometry_id},
        )
        .mappings()
        .one()
    )

    if not result["is_valid"]:
        raise ValueError(
            f"Geometria inválida: {result['reason'] or 'motivo desconhecido'}."
        )


def _to_pull_item(record: LotGeometry) -> MobileLotGeometryPullItem:
    return MobileLotGeometryPullItem(
        id=record.id,
        project_id=record.project_id,
        lot_id=record.lot_id,
        seal_id=record.seal_id,
        social_registration_id=record.social_registration_id,
        source_local_id=record.source_local_id,
        source_device_id=record.source_device_id,
        origin=record.origin,
        workflow_status=record.workflow_status,
        geometry_geojson=record.geometry_geojson,
        area_m2=record.area_m2,
        perimeter_m=record.perimeter_m,
        geospatial_accuracy_m=record.geospatial_accuracy_m,
        notes=record.notes,
        validation_note=record.validation_note,
        validated_at=record.validated_at,
        validated_by_user_id=record.validated_by_user_id,
        parent_geometry_id=record.parent_geometry_id,
        superseded_by_geometry_id=record.superseded_by_geometry_id,
        version=record.version,
        is_current=record.is_current,
        deleted=record.deleted,
        client_created_at=record.client_created_at,
        client_updated_at=record.client_updated_at,
        server_received_at=record.server_received_at,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def _new_version_from_current(
    *,
    current: LotGeometry,
    now: datetime,
    current_user: User,
) -> LotGeometry:
    next_record = LotGeometry(
        project_id=current.project_id,
        lot_id=current.lot_id,
        seal_id=current.seal_id,
        social_registration_id=current.social_registration_id,
        source_local_id=current.source_local_id,
        source_device_id=current.source_device_id,
        origin=current.origin,
        workflow_status=current.workflow_status,
        geometry_type=current.geometry_type,
        geometry_geojson=current.geometry_geojson,
        geom=current.geom,
        area_m2=current.area_m2,
        perimeter_m=current.perimeter_m,
        geospatial_accuracy_m=current.geospatial_accuracy_m,
        notes=current.notes,
        validation_note=current.validation_note,
        validated_at=current.validated_at,
        created_by_user_id=current_user.id,
        validated_by_user_id=current.validated_by_user_id,
        parent_geometry_id=current.id,
        version=current.version + 1,
        is_current=True,
        client_created_at=current.client_created_at,
        client_updated_at=current.client_updated_at,
        server_received_at=now,
        deleted=current.deleted,
        created_at=now,
        updated_at=now,
    )

    current.is_current = False
    current.updated_at = now

    return next_record


@router.post(
    "/mobile/sync/lot-geometries",
    response_model=MobileLotGeometryPushResponse,
)
def push_mobile_lot_geometries(
    payload: MobileLotGeometryPushRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MobileLotGeometryPushResponse:
    _ensure_project_access(
        db,
        project_id=payload.project_id,
        current_user=current_user,
    )

    accepted: list[MobileLotGeometryAcceptedItem] = []
    rejected: list[MobileLotGeometryRejectedItem] = []
    conflicts: list[MobileLotGeometryConflictItem] = []
    now = _utcnow()

    for item in payload.records:
        savepoint = db.begin_nested()

        try:
            allowed_mobile_origins = {
                "cidadao_declarado",
                "cidadao_vetorizado",
            }

            if item.origin not in allowed_mobile_origins:
                raise ValueError(
                    "O aplicativo móvel não possui permissão para "
                    f"criar geometria com origem '{item.origin}'."
                )
            _validate_references(
                db,
                project_id=payload.project_id,
                lot_id=item.lot_id,
                seal_id=item.seal_id,
                social_registration_id=item.social_registration_id,
            )

            current = (
                db.query(LotGeometry)
                .filter(
                    LotGeometry.project_id == payload.project_id,
                    LotGeometry.source_device_id == item.source_device_id,
                    LotGeometry.source_local_id == item.source_local_id,
                    LotGeometry.is_current.is_(True),
                )
                .with_for_update()
                .first()
            )

            if current is None:
                if item.expected_version not in (None, 1):
                    rejected.append(
                        MobileLotGeometryRejectedItem(
                            source_local_id=item.source_local_id,
                            reason=(
                                "A geometria ainda não existe no servidor, "
                                "mas foi enviada com versão esperada diferente de 1."
                            ),
                        )
                    )
                    savepoint.rollback()
                    continue

                record = LotGeometry(
                    project_id=payload.project_id,
                    source_local_id=item.source_local_id,
                    source_device_id=item.source_device_id,
                    version=1,
                    is_current=True,
                    created_by_user_id=current_user.id,
                    server_received_at=now,
                    created_at=now,
                    updated_at=now,
                )
            else:
                if (
                    item.expected_version is not None
                    and item.expected_version != current.version
                ):
                    conflicts.append(
                        MobileLotGeometryConflictItem(
                            source_local_id=item.source_local_id,
                            server_id=current.id,
                            expected_version=item.expected_version,
                            current_version=current.version,
                            reason="A geometria foi alterada no servidor.",
                        )
                    )
                    savepoint.rollback()
                    continue

                record = _new_version_from_current(
                    current=current,
                    now=now,
                    current_user=current_user,
                )

            record.lot_id = item.lot_id
            record.seal_id = item.seal_id
            record.social_registration_id = item.social_registration_id
            record.origin = item.origin
            record.workflow_status = item.workflow_status
            record.area_m2 = item.area_m2
            record.perimeter_m = item.perimeter_m
            record.geospatial_accuracy_m = item.geospatial_accuracy_m
            record.notes = item.notes
            record.client_created_at = item.client_created_at
            record.client_updated_at = item.client_updated_at
            record.server_received_at = now
            record.deleted = item.deleted
            record.updated_at = now

            _apply_geometry(record, item.geometry_geojson)

            db.add(record)
            db.flush()

            _assert_valid_geometry(db, record.id)

            if current is not None:
                current.superseded_by_geometry_id = record.id

            savepoint.commit()

            accepted.append(
                MobileLotGeometryAcceptedItem(
                    source_local_id=item.source_local_id,
                    server_id=record.id,
                    version=record.version,
                    workflow_status=record.workflow_status,
                    status="deleted" if record.deleted else "synced",
                    server_updated_at=record.updated_at or now,
                )
            )

        except IntegrityError:
            savepoint.rollback()
            rejected.append(
                MobileLotGeometryRejectedItem(
                    source_local_id=item.source_local_id,
                    reason="Conflito de unicidade ao gravar a geometria.",
                )
            )
        except Exception as exc:
            savepoint.rollback()
            rejected.append(
                MobileLotGeometryRejectedItem(
                    source_local_id=item.source_local_id,
                    reason=str(exc),
                )
            )

    db.commit()

    return MobileLotGeometryPushResponse(
        batch_id=payload.batch_id,
        accepted=accepted,
        rejected=rejected,
        conflicts=conflicts,
        server_time=_utcnow(),
    )


@router.get(
    "/mobile/sync/lot-geometries",
    response_model=MobileLotGeometryPullResponse,
)
def pull_mobile_lot_geometries(
    project_id: UUID,
    since: datetime | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=1000),
    include_history: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MobileLotGeometryPullResponse:
    _ensure_project_access(
        db,
        project_id=project_id,
        current_user=current_user,
    )

    query = db.query(LotGeometry).filter(LotGeometry.project_id == project_id)

    if not include_history:
        query = query.filter(LotGeometry.is_current.is_(True))

    if since is not None:
        query = query.filter(LotGeometry.updated_at > since)

    records = query.order_by(LotGeometry.updated_at.asc()).limit(limit).all()

    now = _utcnow()
    next_cursor = records[-1].updated_at if records else (since or now)

    return MobileLotGeometryPullResponse(
        project_id=project_id,
        records=[_to_pull_item(record) for record in records],
        next_cursor=next_cursor,
        server_time=now,
    )


@router.get(
    "/projects/{project_id}/lot-geometries",
    response_model=LotGeometryListResponse,
)
def list_project_lot_geometries(
    project_id: UUID,
    origin: str | None = Query(default=None),
    workflow_status: str | None = Query(default=None),
    include_history: bool = Query(default=False),
    include_deleted: bool = Query(default=False),
    limit: int = Query(default=1000, ge=1, le=5000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LotGeometryListResponse:
    _ensure_project_access(
        db,
        project_id=project_id,
        current_user=current_user,
    )

    query = db.query(LotGeometry).filter(LotGeometry.project_id == project_id)

    if not include_history:
        query = query.filter(LotGeometry.is_current.is_(True))

    if not include_deleted:
        query = query.filter(LotGeometry.deleted.is_(False))

    if origin is not None:
        query = query.filter(LotGeometry.origin == origin)

    if workflow_status is not None:
        query = query.filter(LotGeometry.workflow_status == workflow_status)

    records = (
        query.order_by(
            LotGeometry.updated_at.desc(),
            LotGeometry.version.desc(),
        )
        .limit(limit)
        .all()
    )

    return LotGeometryListResponse(
        project_id=project_id,
        records=[_to_pull_item(record) for record in records],
    )


def _review_geometry(
    *,
    geometry_id: UUID,
    project_id: UUID,
    workflow_status: str,
    payload: LotGeometryReviewRequest,
    db: Session,
    current_user: User,
) -> MobileLotGeometryPullItem:
    _ensure_project_access(
        db,
        project_id=project_id,
        current_user=current_user,
    )

    current = (
        db.query(LotGeometry)
        .filter(
            LotGeometry.id == geometry_id,
            LotGeometry.project_id == project_id,
            LotGeometry.is_current.is_(True),
        )
        .with_for_update()
        .first()
    )

    if current is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Geometria atual não encontrada.",
        )

    now = _utcnow()
    reviewed = _new_version_from_current(
        current=current,
        now=now,
        current_user=current_user,
    )

    reviewed.workflow_status = workflow_status
    reviewed.validation_note = payload.note
    reviewed.validated_at = now
    reviewed.validated_by_user_id = current_user.id

    db.add(reviewed)
    db.flush()

    current.superseded_by_geometry_id = reviewed.id

    db.commit()
    db.refresh(reviewed)

    return _to_pull_item(reviewed)


@router.post(
    "/projects/{project_id}/lot-geometries/{geometry_id}/validate",
    response_model=MobileLotGeometryPullItem,
)
def validate_project_lot_geometry(
    project_id: UUID,
    geometry_id: UUID,
    payload: LotGeometryReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MobileLotGeometryPullItem:
    return _review_geometry(
        geometry_id=geometry_id,
        project_id=project_id,
        workflow_status="validado",
        payload=payload,
        db=db,
        current_user=current_user,
    )


@router.post(
    "/projects/{project_id}/lot-geometries/{geometry_id}/reject",
    response_model=MobileLotGeometryPullItem,
)
def reject_project_lot_geometry(
    project_id: UUID,
    geometry_id: UUID,
    payload: LotGeometryReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MobileLotGeometryPullItem:
    return _review_geometry(
        geometry_id=geometry_id,
        project_id=project_id,
        workflow_status="rejeitado",
        payload=payload,
        db=db,
        current_user=current_user,
    )
