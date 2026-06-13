from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_global_admin
from app.db.session import get_db
from app.models.audit import AuditLog
from app.models.user import User
from app.schemas.audit import AuditLogResponse

router = APIRouter(prefix="/audit-logs", tags=["Auditoria / Logs"])


def _audit_to_response(log: AuditLog) -> AuditLogResponse:
    return AuditLogResponse(
        id=str(log.id),
        project_id=str(log.project_id) if log.project_id else None,
        user_id=str(log.user_id) if log.user_id else None,
        actor_name=log.actor_name,
        actor_email=log.actor_email,
        actor_role=log.actor_role,
        action=log.action,
        entity_type=log.entity_type,
        entity_id=str(log.entity_id) if log.entity_id else None,
        severity=log.severity,
        description=log.description,
        old_data=log.old_data,
        new_data=log.new_data,
        metadata=log.metadata_json,
        ip_address=log.ip_address,
        user_agent=log.user_agent,
        created_at=log.created_at,
    )


@router.get("", response_model=list[AuditLogResponse])
def list_audit_logs(
    project_id: UUID | None = Query(default=None),
    user_id: UUID | None = Query(default=None),
    action: str | None = Query(default=None),
    entity_type: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_global_admin),
) -> list[AuditLogResponse]:
    query = db.query(AuditLog)

    if project_id is not None:
        query = query.filter(AuditLog.project_id == project_id)

    if user_id is not None:
        query = query.filter(AuditLog.user_id == user_id)

    if action:
        query = query.filter(AuditLog.action == action.upper())

    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)

    if severity:
        query = query.filter(AuditLog.severity == severity.upper())

    if search:
        like = f"%{search}%"
        query = query.filter(
            AuditLog.description.ilike(like)
            | AuditLog.actor_name.ilike(like)
            | AuditLog.actor_email.ilike(like)
        )

    logs = query.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()

    return [_audit_to_response(log) for log in logs]
