from pydantic import BaseModel


class RoleResponse(BaseModel):
    id: str
    name: str
    description: str | None = None

    class Config:
        from_attributes = True


class PermissionResponse(BaseModel):
    id: str
    code: str
    description: str | None = None

    class Config:
        from_attributes = True


class ProjectUserCreate(BaseModel):
    user_id: str
    role_id: str
    active: bool = True


class ProjectUserUpdate(BaseModel):
    role_id: str | None = None
    active: bool | None = None


class ProjectUserPermissionCreate(BaseModel):
    permission_id: str
    allowed: bool = True


class ProjectUserResponse(BaseModel):
    id: str
    project_id: str
    user_id: str
    role_id: str
    active: bool

    user_name: str | None = None
    user_email: str | None = None
    role_name: str | None = None

    class Config:
        from_attributes = True
