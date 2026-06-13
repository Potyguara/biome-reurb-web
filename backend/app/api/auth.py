from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import create_access_token, verify_password
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import CurrentUserResponse, LoginRequest, TokenResponse

router = APIRouter(prefix="/auth", tags=["Autenticação"])


def _role_label(user: User) -> str:
    return "Admin BIOME" if user.is_global_admin else "Analista Prefeitura"


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    user = db.query(User).filter(User.email == payload.email.lower()).first()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha inválidos.",
        )

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha inválidos.",
        )

    if not user.active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário desativado.",
        )

    token = create_access_token(
        subject=str(user.id),
        extra_data={
            "email": user.email,
            "is_global_admin": user.is_global_admin,
            "role_label": _role_label(user),
        },
    )

    return TokenResponse(access_token=token)


@router.get("/me", response_model=CurrentUserResponse)
def me(
    current_user: User = Depends(get_current_user),
) -> CurrentUserResponse:
    return CurrentUserResponse(
        id=str(current_user.id),
        name=current_user.name,
        email=current_user.email,
        is_global_admin=current_user.is_global_admin,
        active=current_user.active,
        role_label=_role_label(current_user),
    )
