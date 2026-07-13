from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.access import ProjectUser
from app.models.project import Project
from app.models.user import User
from app.schemas.mobile_field_sync import (
    MobileFieldSyncAccepted,
    MobileFieldSyncRejected,
    MobileFieldSyncRequest,
    MobileFieldSyncResponse,
)
from app.services.mobile_import_service import (
    import_mobile_json_to_database,
)

router = APIRouter(
    tags=["BIOME REURB Sincronização de Campo"],
)


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
            status_code=404,
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
            status_code=403,
            detail="Usuário não possui acesso ativo a este projeto.",
        )

    return project


@router.post(
    "/mobile/sync/field-records",
    response_model=MobileFieldSyncResponse,
)
def sync_mobile_field_records(
    payload: MobileFieldSyncRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MobileFieldSyncResponse:
    _ensure_project_access(
        db,
        project_id=payload.project_id,
        current_user=current_user,
    )

    sociais: list[dict] = []
    fisicos: list[dict] = []

    for item in payload.social_registrations:
        row = dict(item.payload)

        row["id"] = item.source_local_id
        row["projeto_id"] = str(payload.project_id)

        sociais.append(row)

    for item in payload.physical_registrations:
        row = dict(item.payload)

        row["id"] = item.source_local_id
        row["projeto_id"] = str(payload.project_id)

        fisicos.append(row)

    try:
        result = import_mobile_json_to_database(
            db,
            {
                "dados": {
                    "cadastros_sociais": sociais,
                    "cadastros_fisicos": fisicos,
                }
            },
            forced_project_id=payload.project_id,
        )

        created = result.get("created", {})
        updated = result.get("updated", {})

        social_processed = created.get("social_registrations", 0) + updated.get(
            "social_registrations", 0
        )

        physical_processed = created.get("physical_registrations", 0) + updated.get(
            "physical_registrations", 0
        )

        if social_processed != len(payload.social_registrations):
            raise ValueError(
                "Nem todos os cadastros sociais foram persistidos no servidor."
            )

        if physical_processed != len(payload.physical_registrations):
            raise ValueError(
                "Nem todos os cadastros físicos foram persistidos no servidor."
            )

        accepted = [
            MobileFieldSyncAccepted(
                entity_type="social_registration",
                source_local_id=item.source_local_id,
            )
            for item in payload.social_registrations
        ]

        accepted.extend(
            MobileFieldSyncAccepted(
                entity_type="physical_registration",
                source_local_id=item.source_local_id,
            )
            for item in payload.physical_registrations
        )

        return MobileFieldSyncResponse(
            batch_id=payload.batch_id,
            accepted=accepted,
            created=created,
            updated=updated,
            server_time=_utcnow(),
        )

    except Exception as exc:
        db.rollback()

        reason = str(exc)

        rejected = [
            MobileFieldSyncRejected(
                entity_type="social_registration",
                source_local_id=item.source_local_id,
                reason=reason,
            )
            for item in payload.social_registrations
        ]

        rejected.extend(
            MobileFieldSyncRejected(
                entity_type="physical_registration",
                source_local_id=item.source_local_id,
                reason=reason,
            )
            for item in payload.physical_registrations
        )

        return MobileFieldSyncResponse(
            batch_id=payload.batch_id,
            rejected=rejected,
            server_time=_utcnow(),
        )
