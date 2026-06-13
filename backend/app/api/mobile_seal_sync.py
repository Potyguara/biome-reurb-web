from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from geoalchemy2.functions import ST_MakePoint, ST_SetSRID
from sqlalchemy import func, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.access import ProjectUser
from app.models.project import Project
from app.models.reurb import Seal, SealCodeReservation
from app.models.user import User
from app.schemas.mobile_seal_sync import (
    MobileSealAcceptedItem,
    MobileSealConflictItem,
    MobileSealPullItem,
    MobileSealPullResponse,
    MobileSealPushRequest,
    MobileSealPushResponse,
    MobileSealRejectedItem,
    SealCodeReservationRequest,
    SealCodeReservationResponse,
)

router = APIRouter(prefix="/mobile", tags=["BIOME REURB CAMPO"])


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


def _project_prefix(project: Project) -> str:
    neighborhood = (project.neighborhood or "").strip()
    words = [word for word in neighborhood.split() if word]

    if len(words) >= 2:
        prefix = f"{words[0][0]}{words[1][0]}"
    elif neighborhood:
        prefix = neighborhood[:2]
    else:
        prefix = "RE"

    normalized = "".join(char for char in prefix.upper() if char.isalnum())
    return normalized[:6] or "RE"


def _format_code(prefix: str, number: int) -> str:
    return f"{prefix}-{number:06d}"


@router.post(
    "/projects/{project_id}/seal-reservations",
    response_model=SealCodeReservationResponse,
)
def reserve_seal_codes(
    project_id: UUID,
    payload: SealCodeReservationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SealCodeReservationResponse:
    project = _ensure_project_access(
        db,
        project_id=project_id,
        current_user=current_user,
    )

    # Serializa reservas concorrentes do mesmo projeto no PostgreSQL.
    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:project_id))"),
        {"project_id": str(project_id)},
    )

    last_end = (
        db.query(func.max(SealCodeReservation.end_number))
        .filter(SealCodeReservation.project_id == project_id)
        .scalar()
    ) or 0

    existing_max = (
        db.query(func.max(Seal.seal_code))
        .filter(Seal.project_id == project_id)
        .scalar()
    )

    # A sequência oficial é controlada pela tabela de reservas. O código existente
    # é consultado apenas para auditoria e não altera a numeração por texto.
    _ = existing_max

    start_number = int(last_end) + 1
    end_number = start_number + payload.quantity - 1
    prefix = _project_prefix(project)

    now = _utcnow()

    reservation = SealCodeReservation(
        project_id=project_id,
        user_id=current_user.id,
        device_id=payload.device_id,
        prefix=prefix,
        start_number=start_number,
        end_number=end_number,
        next_number=start_number,
        quantity=payload.quantity,
        active=True,
        expires_at=now + timedelta(days=180),
        created_at=now,
        updated_at=now,
    )

    db.add(reservation)
    db.commit()
    db.refresh(reservation)

    codes = [
        _format_code(prefix, number)
        for number in range(start_number, end_number + 1)
    ]

    return SealCodeReservationResponse(
        reservation_id=reservation.id,
        project_id=project_id,
        device_id=payload.device_id,
        prefix=prefix,
        start_number=start_number,
        end_number=end_number,
        next_number=start_number,
        quantity=payload.quantity,
        codes=codes,
    )


@router.post("/sync/seals", response_model=MobileSealPushResponse)
def push_mobile_seals(
    payload: MobileSealPushRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MobileSealPushResponse:
    _ensure_project_access(
        db,
        project_id=payload.project_id,
        current_user=current_user,
    )

    accepted: list[MobileSealAcceptedItem] = []
    rejected: list[MobileSealRejectedItem] = []
    conflicts: list[MobileSealConflictItem] = []
    now = _utcnow()

    for item in payload.records:
        savepoint = db.begin_nested()

        try:
            seal = (
                db.query(Seal)
                .filter(
                    Seal.project_id == payload.project_id,
                    Seal.source_device_id == item.source_device_id,
                    Seal.source_local_id == item.source_local_id,
                )
                .first()
            )

            if seal is None:
                duplicate_code = (
                    db.query(Seal)
                    .filter(
                        Seal.project_id == payload.project_id,
                        Seal.seal_code == item.seal_code,
                    )
                    .first()
                )

                if duplicate_code is not None:
                    rejected.append(
                        MobileSealRejectedItem(
                            source_local_id=item.source_local_id,
                            seal_code=item.seal_code,
                            reason=(
                                "O código de selagem já está associado a outro "
                                "registro neste projeto."
                            ),
                        )
                    )
                    savepoint.rollback()
                    continue

                seal = Seal(
                    project_id=payload.project_id,
                    source_local_id=item.source_local_id,
                    source_device_id=item.source_device_id,
                    created_by_user_id=current_user.id,
                    sync_version=1,
                    server_received_at=now,
                    created_at=now,
                    updated_at=now,
                )
                db.add(seal)

            elif (
                item.expected_sync_version is not None
                and item.expected_sync_version != seal.sync_version
            ):
                conflicts.append(
                    MobileSealConflictItem(
                        source_local_id=item.source_local_id,
                        server_id=seal.id,
                        seal_code=seal.seal_code,
                        expected_sync_version=item.expected_sync_version,
                        current_sync_version=seal.sync_version,
                        reason="O registro foi alterado no servidor.",
                    )
                )
                savepoint.rollback()
                continue

            else:
                seal.sync_version += 1

            seal.lot_id = item.lot_id
            seal.seal_code = item.seal_code
            seal.lot_code = item.lot_code
            seal.situation = item.situation
            seal.resident_present = item.resident_present
            seal.dwelling_occupied = item.dwelling_occupied
            seal.service_status = item.service_status
            seal.unit_type = item.unit_type
            seal.property_use = item.property_use
            seal.informant_name = item.informant_name
            seal.informant_phone = item.informant_phone
            seal.informant_relationship = item.informant_relationship
            seal.revisit_required = item.revisit_required
            seal.facade_photo_path = item.facade_photo_path
            seal.notes = item.notes
            seal.geo_link_status = item.geo_link_status
            seal.needs_rtk_validation = item.needs_rtk_validation
            seal.geospatial_note = item.geospatial_note
            seal.latitude = item.latitude
            seal.longitude = item.longitude
            seal.gps_accuracy = item.gps_accuracy
            seal.client_created_at = item.client_created_at
            seal.client_updated_at = item.client_updated_at
            seal.deleted = item.deleted
            seal.updated_by_user_id = current_user.id
            seal.server_received_at = now
            seal.updated_at = now

            if item.latitude is not None and item.longitude is not None:
                seal.geom = ST_SetSRID(
                    ST_MakePoint(item.longitude, item.latitude),
                    4326,
                )
            else:
                seal.geom = None

            db.flush()
            savepoint.commit()

            accepted.append(
                MobileSealAcceptedItem(
                    source_local_id=item.source_local_id,
                    server_id=seal.id,
                    seal_code=seal.seal_code,
                    sync_version=seal.sync_version,
                    status="deleted" if seal.deleted else "synced",
                    server_updated_at=seal.updated_at or now,
                )
            )

        except IntegrityError:
            savepoint.rollback()
            rejected.append(
                MobileSealRejectedItem(
                    source_local_id=item.source_local_id,
                    seal_code=item.seal_code,
                    reason="Conflito de unicidade ao gravar a selagem.",
                )
            )
        except Exception as exc:
            savepoint.rollback()
            rejected.append(
                MobileSealRejectedItem(
                    source_local_id=item.source_local_id,
                    seal_code=item.seal_code,
                    reason=str(exc),
                )
            )

    db.commit()

    return MobileSealPushResponse(
        batch_id=payload.batch_id,
        accepted=accepted,
        rejected=rejected,
        conflicts=conflicts,
        server_time=_utcnow(),
    )


@router.get("/sync/seals", response_model=MobileSealPullResponse)
def pull_mobile_seals(
    project_id: UUID,
    since: datetime | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MobileSealPullResponse:
    _ensure_project_access(
        db,
        project_id=project_id,
        current_user=current_user,
    )

    query = db.query(Seal).filter(Seal.project_id == project_id)

    if since is not None:
        query = query.filter(Seal.updated_at > since)

    seals = query.order_by(Seal.updated_at.asc()).limit(limit).all()
    now = _utcnow()

    records = [
        MobileSealPullItem(
            id=seal.id,
            project_id=seal.project_id,
            source_local_id=seal.source_local_id,
            source_device_id=seal.source_device_id,
            seal_code=seal.seal_code,
            lot_id=seal.lot_id,
            lot_code=seal.lot_code,
            situation=seal.situation,
            resident_present=seal.resident_present,
            dwelling_occupied=seal.dwelling_occupied,
            service_status=seal.service_status,
            unit_type=seal.unit_type,
            property_use=seal.property_use,
            informant_name=seal.informant_name,
            informant_phone=seal.informant_phone,
            informant_relationship=seal.informant_relationship,
            revisit_required=seal.revisit_required,
            facade_photo_path=seal.facade_photo_path,
            notes=seal.notes,
            geo_link_status=seal.geo_link_status,
            needs_rtk_validation=seal.needs_rtk_validation,
            geospatial_note=seal.geospatial_note,
            latitude=seal.latitude,
            longitude=seal.longitude,
            gps_accuracy=seal.gps_accuracy,
            client_created_at=seal.client_created_at,
            client_updated_at=seal.client_updated_at,
            sync_version=seal.sync_version,
            deleted=seal.deleted,
            created_at=seal.created_at,
            updated_at=seal.updated_at,
        )
        for seal in seals
    ]

    next_cursor = seals[-1].updated_at if seals else (since or now)

    return MobileSealPullResponse(
        project_id=project_id,
        records=records,
        next_cursor=next_cursor,
        server_time=now,
    )
