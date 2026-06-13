from typing import Any
from uuid import UUID

from fastapi import Request
from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.models.user import User


def register_audit_log(
    db: Session,
    *,
    user: User | None,
    action: str,
    entity_type: str,
    description: str,
    entity_id: UUID | None = None,
    project_id: UUID | None = None,
    old_data: dict[str, Any] | None = None,
    new_data: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
    request: Request | None = None,
    severity: str = "INFO",
) -> AuditLog:
    ip_address = None
    user_agent = None

    if request is not None:
        if request.client is not None:
            ip_address = request.client.host
        user_agent = request.headers.get("user-agent")

    log = AuditLog(
        project_id=project_id,
        user_id=user.id if user else None,
        actor_name=user.name if user else None,
        actor_email=user.email if user else None,
        actor_role="ADMIN_GERAL" if user and user.is_global_admin else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        severity=severity,
        description=description,
        old_data=old_data,
        new_data=new_data,
        metadata_json=metadata,
        ip_address=ip_address,
        user_agent=user_agent,
    )

    db.add(log)
    db.commit()
    db.refresh(log)

    return log
