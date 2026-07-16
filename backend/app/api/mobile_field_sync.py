from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.access import ProjectUser
from app.models.project import Project
from app.models.reurb import PhysicalRegistration, SocialRegistration
from app.models.user import User
from app.schemas.mobile_field_sync import (
    MobileFieldSyncAccepted,
    MobileFieldSyncPullResponse,
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


def _date_to_iso(value: datetime | None) -> str | None:
    if value is None:
        return None

    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc).isoformat()


def _social_registration_to_mobile(
    record: SocialRegistration,
) -> dict:
    return {
        # Em um aparelho novo, este UUID será utilizado como ID local.
        "id": str(record.id),
        "projeto_id": str(record.project_id),
        # Este valor é o UUID da selagem no servidor.
        # O Flutter deverá convertê-lo para o ID local da selagem,
        # procurando pelo campo server_id da tabela selagens.
        "selagem_server_id": (
            str(record.seal_id) if record.seal_id is not None else None
        ),
        "codigo_selo": record.seal_code,
        "nome_responsavel": record.responsible_name,
        "cpf_responsavel": record.responsible_cpf,
        "rg_responsavel": record.responsible_rg,
        "orgao_emissor": record.issuing_agency,
        "estado_civil": record.marital_status,
        "profissao": record.profession,
        "telefone": record.phone,
        "quantidade_moradores": record.household_members,
        "renda_familiar": record.family_income,
        "recebe_programa_social": record.receives_social_program,
        "programa_social": record.social_program,
        "tempo_ocupacao_anos": record.occupation_years,
        "forma_ocupacao": record.occupation_type,
        "documento_posse": record.possession_document,
        "possui_outro_imovel": record.owns_other_property,
        "possui_conflito": record.has_conflict,
        "observacoes": record.notes,
        "created_at": _date_to_iso(record.created_at),
        "updated_at": _date_to_iso(record.updated_at),
    }


def _physical_registration_to_mobile(
    record: PhysicalRegistration,
) -> dict:
    return {
        # Em um aparelho novo, este UUID será utilizado como ID local.
        "id": str(record.id),
        "projeto_id": str(record.project_id),
        # UUID da selagem existente no servidor.
        "selagem_server_id": (
            str(record.seal_id) if record.seal_id is not None else None
        ),
        "codigo_selo": record.seal_code,
        "tipo_imovel": record.property_type,
        "uso_imovel": record.property_use,
        "material_paredes": record.wall_material,
        "tipo_cobertura": record.roof_type,
        "tipo_piso": record.floor_type,
        "numero_pavimentos": record.floors,
        "numero_comodos": record.rooms,
        "numero_banheiros": record.bathrooms,
        "possui_energia": record.has_energy,
        "possui_agua": record.has_water,
        "possui_esgoto": record.has_sewage,
        "possui_banheiro": record.has_bathroom,
        "condicao_habitabilidade": record.habitability_condition,
        "area_risco": record.risk_area,
        "sujeito_inundacao": record.flood_prone,
        "observacoes": record.notes,
        "created_at": _date_to_iso(record.created_at),
        "updated_at": _date_to_iso(record.updated_at),
    }


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

        social_processed = created.get(
            "social_registrations",
            0,
        ) + updated.get(
            "social_registrations",
            0,
        )

        physical_processed = created.get(
            "physical_registrations",
            0,
        ) + updated.get(
            "physical_registrations",
            0,
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


@router.get(
    "/mobile/sync/field-records",
    response_model=MobileFieldSyncPullResponse,
)
def pull_mobile_field_records(
    project_id: UUID,
    limit: int = Query(
        default=1000,
        ge=1,
        le=5000,
    ),
    since: datetime | None = Query(
        default=None,
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MobileFieldSyncPullResponse:
    _ensure_project_access(
        db,
        project_id=project_id,
        current_user=current_user,
    )

    social_query = db.query(SocialRegistration).filter(
        SocialRegistration.project_id == project_id,
    )

    physical_query = db.query(PhysicalRegistration).filter(
        PhysicalRegistration.project_id == project_id,
    )

    if since is not None:
        if since.tzinfo is None:
            since = since.replace(tzinfo=timezone.utc)

        social_query = social_query.filter(
            or_(
                SocialRegistration.created_at >= since,
                SocialRegistration.updated_at >= since,
            )
        )

        physical_query = physical_query.filter(
            or_(
                PhysicalRegistration.created_at >= since,
                PhysicalRegistration.updated_at >= since,
            )
        )

    social_records = (
        social_query.order_by(
            SocialRegistration.created_at.asc(),
            SocialRegistration.id.asc(),
        )
        .limit(limit)
        .all()
    )

    physical_records = (
        physical_query.order_by(
            PhysicalRegistration.created_at.asc(),
            PhysicalRegistration.id.asc(),
        )
        .limit(limit)
        .all()
    )

    return MobileFieldSyncPullResponse(
        project_id=project_id,
        social_registrations=[
            _social_registration_to_mobile(record) for record in social_records
        ],
        physical_registrations=[
            _physical_registration_to_mobile(record) for record in physical_records
        ],
        server_time=_utcnow(),
    )
