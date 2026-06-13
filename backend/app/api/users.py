from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import get_password_hash
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import (
    UserCreate,
    UserPasswordUpdate,
    UserResponse,
    UserUpdate,
)

router = APIRouter(prefix="/users", tags=["Usuários"])


def _ensure_admin(current_user: User) -> None:
    if not current_user.is_global_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores BIOME podem gerenciar usuários.",
        )


def _user_to_response(user: User) -> UserResponse:
    return UserResponse(
        id=str(user.id),
        name=user.name,
        email=user.email,
        is_global_admin=bool(user.is_global_admin),
        active=bool(user.active),
        role_label="Admin BIOME" if user.is_global_admin else "Analista Prefeitura",
    )


@router.get("", response_model=list[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[UserResponse]:
    _ensure_admin(current_user)

    users = db.query(User).order_by(User.name.asc()).all()

    return [_user_to_response(user) for user in users]


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    _ensure_admin(current_user)

    email = payload.email.lower().strip()

    existing = db.query(User).filter(User.email == email).first()

    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Já existe um usuário cadastrado com este e-mail.",
        )

    user = User(
        name=payload.name.strip(),
        email=email,
        password_hash=get_password_hash(payload.password),
        is_global_admin=payload.is_global_admin,
        active=payload.active,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return _user_to_response(user)


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    _ensure_admin(current_user)

    user = db.query(User).filter(User.id == user_id).first()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado.",
        )

    return _user_to_response(user)


@router.patch("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: UUID,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    _ensure_admin(current_user)

    user = db.query(User).filter(User.id == user_id).first()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado.",
        )

    if payload.email is not None:
        email = payload.email.lower().strip()

        existing = (
            db.query(User)
            .filter(
                User.email == email,
                User.id != user_id,
            )
            .first()
        )

        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Já existe outro usuário cadastrado com este e-mail.",
            )

        user.email = email

    if payload.name is not None:
        user.name = payload.name.strip()

    if payload.password is not None:
        user.password_hash = get_password_hash(payload.password)

    if payload.is_global_admin is not None:
        # Evita o admin remover o próprio poder administrativo por acidente.
        if user.id == current_user.id and payload.is_global_admin is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Você não pode remover seu próprio perfil de administrador.",
            )

        user.is_global_admin = payload.is_global_admin

    if payload.active is not None:
        # Evita o admin desativar a própria conta por acidente.
        if user.id == current_user.id and payload.active is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Você não pode desativar sua própria conta.",
            )

        user.active = payload.active

    db.commit()
    db.refresh(user)

    return _user_to_response(user)


@router.patch("/{user_id}/password", response_model=UserResponse)
def reset_user_password(
    user_id: UUID,
    payload: UserPasswordUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    _ensure_admin(current_user)

    user = db.query(User).filter(User.id == user_id).first()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado.",
        )

    user.password_hash = get_password_hash(payload.password)

    db.commit()
    db.refresh(user)

    return _user_to_response(user)


@router.delete("/{user_id}")
def delete_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    _ensure_admin(current_user)

    user = db.query(User).filter(User.id == user_id).first()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado.",
        )

    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Você não pode excluir sua própria conta.",
        )

    db.delete(user)
    db.commit()

    return {
        "message": "Usuário excluído com sucesso.",
    }
