from datetime import datetime
from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: str

    project_id: str | None = None
    user_id: str | None = None

    actor_name: str | None = None
    actor_email: str | None = None
    actor_role: str | None = None

    action: str
    entity_type: str
    entity_id: str | None = None

    severity: str
    description: str

    old_data: dict | None = None
    new_data: dict | None = None
    metadata: dict | None = None

    ip_address: str | None = None
    user_agent: str | None = None

    created_at: datetime

    class Config:
        from_attributes = True
