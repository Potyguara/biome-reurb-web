from pydantic import BaseModel, Field


class MobileUserResponse(BaseModel):
    id: str
    name: str
    email: str
    is_global_admin: bool
    active: bool


class MobileProjectResponse(BaseModel):
    id: str
    name: str
    municipality: str
    state: str
    neighborhood: str
    reurb_type: str
    status: str
    role: str
    permissions: list[str] = Field(default_factory=list)


class MobileSessionResponse(BaseModel):
    user: MobileUserResponse
    projects: list[MobileProjectResponse] = Field(default_factory=list)
