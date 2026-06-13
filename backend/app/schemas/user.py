from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    name: str = Field(..., min_length=3)
    email: EmailStr
    password: str = Field(..., min_length=8)

    # true = Admin BIOME
    # false = Analista Prefeitura
    is_global_admin: bool = False

    active: bool = True


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=3)
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8)
    is_global_admin: bool | None = None
    active: bool | None = None


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    is_global_admin: bool
    active: bool
    role_label: str

    class Config:
        from_attributes = True


class UserPasswordUpdate(BaseModel):
    password: str = Field(..., min_length=8)
