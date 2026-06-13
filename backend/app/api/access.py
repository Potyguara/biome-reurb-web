from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_global_admin
from app.db.session import get_db
from app.models.access import Permission, ProjectUser, ProjectUserPermission, Role
from app.models.project import Project
from app.models.user import User
from app.schemas.access import (
    PermissionResponse,
    ProjectUserCreate,
    ProjectUserPermissionCreate,
    ProjectUserResponse,
    ProjectUserUpdate,
    RoleResponse,
)
from app.services.audit_service import register_audit_log

router = APIRouter(tags=["Perfis e Permissões"])


def _role_to_response(role: Role) -> RoleResponse:
    return RoleResponse(
        id=str(role.id),
        name=role.name,
        description=role.description,
    )


def _permission_to_response(permission: Permission) -> PermissionResponse:
    return PermissionResponse(
        id=str(permission.id),
        code=permission.code,
        description=permission.description,
    )


def _project_user_to_response(link: ProjectUser) -> ProjectUserResponse:
    return ProjectUserResponse(
        id=str(link.id),
        project_id=str(link.project_id),
        user_id=str(link.user_id),
        role_id=str(link.role_id),
        active=link.active,
        user_name=link.user.name if link.user else None,
        user_email=link.user.email if link.user else None,
        role_name=link.role.name if link.role else None,
    )


def _project_user_snapshot(link: ProjectUser) -> dict:
    return {
        "id": str(link.id),
        "project_id": str(link.project_id),
        "user_id": str(link.user_id),
        "role_id": str(link.role_id),
        "active": link.active,
        "user_name": link.user.name if link.user else None,
        "user_email": link.user.email if link.user else None,
        "role_name": link.role.name if link.role else None,
    }


@router.get("/roles", response_model=list[RoleResponse])
def list_roles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_global_admin),
) -> list[RoleResponse]:
    roles = db.query(Role).order_by(Role.name.asc()).all()
    return [_role_to_response(role) for role in roles]


@router.get("/permissions", response_model=list[PermissionResponse])
def list_permissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_global_admin),
) -> list[PermissionResponse]:
    permissions = db.query(Permission).order_by(Permission.code.asc()).all()
    return [_permission_to_response(permission) for permission in permissions]


@router.get(
    "/projects/{project_id}/users",
    response_model=list[ProjectUserResponse],
)
def list_project_users(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_global_admin),
) -> list[ProjectUserResponse]:
    project = db.query(Project).filter(Project.id == project_id).first()

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Projeto não encontrado.",
        )

    links = (
        db.query(ProjectUser)
        .filter(ProjectUser.project_id == project_id)
        .order_by(ProjectUser.created_at.desc())
        .all()
    )

    return [_project_user_to_response(link) for link in links]


@router.post(
    "/projects/{project_id}/users",
    response_model=ProjectUserResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_user_to_project(
    project_id: UUID,
    payload: ProjectUserCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_global_admin),
) -> ProjectUserResponse:
    project = db.query(Project).filter(Project.id == project_id).first()

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Projeto não encontrado.",
        )

    user_id = UUID(payload.user_id)
    role_id = UUID(payload.role_id)

    target_user = db.query(User).filter(User.id == user_id).first()

    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado.",
        )

    role = db.query(Role).filter(Role.id == role_id).first()

    if role is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Perfil não encontrado.",
        )

    exists = (
        db.query(ProjectUser)
        .filter(
            ProjectUser.project_id == project_id,
            ProjectUser.user_id == user_id,
        )
        .first()
    )

    if exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Usuário já está vinculado a este projeto.",
        )

    link = ProjectUser(
        project_id=project_id,
        user_id=user_id,
        role_id=role_id,
        active=payload.active,
    )

    db.add(link)
    db.commit()
    db.refresh(link)

    register_audit_log(
        db,
        user=current_user,
        action="CREATE",
        entity_type="project_user",
        entity_id=link.id,
        project_id=project_id,
        description=f"Vinculou o usuário {target_user.email} ao projeto {project.name}.",
        new_data=_project_user_snapshot(link),
        request=request,
        severity="INFO",
    )

    return _project_user_to_response(link)


@router.patch(
    "/projects/{project_id}/users/{project_user_id}",
    response_model=ProjectUserResponse,
)
def update_project_user(
    project_id: UUID,
    project_user_id: UUID,
    payload: ProjectUserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_global_admin),
) -> ProjectUserResponse:
    link = (
        db.query(ProjectUser)
        .filter(
            ProjectUser.id == project_user_id,
            ProjectUser.project_id == project_id,
        )
        .first()
    )

    if link is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vínculo usuário/projeto não encontrado.",
        )

    old_data = _project_user_snapshot(link)

    if payload.role_id is not None:
        role_id = UUID(payload.role_id)
        role = db.query(Role).filter(Role.id == role_id).first()

        if role is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Perfil não encontrado.",
            )

        link.role_id = role_id

    if payload.active is not None:
        link.active = payload.active

    db.commit()
    db.refresh(link)

    register_audit_log(
        db,
        user=current_user,
        action="UPDATE",
        entity_type="project_user",
        entity_id=link.id,
        project_id=project_id,
        description="Atualizou vínculo de usuário ao projeto.",
        old_data=old_data,
        new_data=_project_user_snapshot(link),
        request=request,
        severity="WARNING",
    )

    return _project_user_to_response(link)


@router.delete(
    "/projects/{project_id}/users/{project_user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_project_user(
    project_id: UUID,
    project_user_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_global_admin),
) -> None:
    link = (
        db.query(ProjectUser)
        .filter(
            ProjectUser.id == project_user_id,
            ProjectUser.project_id == project_id,
        )
        .first()
    )

    if link is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vínculo usuário/projeto não encontrado.",
        )

    old_data = _project_user_snapshot(link)

    db.delete(link)
    db.commit()

    register_audit_log(
        db,
        user=current_user,
        action="DELETE",
        entity_type="project_user",
        entity_id=project_user_id,
        project_id=project_id,
        description="Removeu usuário do projeto.",
        old_data=old_data,
        request=request,
        severity="CRITICAL",
    )


@router.post(
    "/projects/{project_id}/users/{project_user_id}/permissions",
    status_code=status.HTTP_201_CREATED,
)
def add_specific_permission_to_project_user(
    project_id: UUID,
    project_user_id: UUID,
    payload: ProjectUserPermissionCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_global_admin),
) -> dict:
    link = (
        db.query(ProjectUser)
        .filter(
            ProjectUser.id == project_user_id,
            ProjectUser.project_id == project_id,
        )
        .first()
    )

    if link is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vínculo usuário/projeto não encontrado.",
        )

    permission_id = UUID(payload.permission_id)

    permission = db.query(Permission).filter(Permission.id == permission_id).first()

    if permission is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Permissão não encontrada.",
        )

    exists = (
        db.query(ProjectUserPermission)
        .filter(
            ProjectUserPermission.project_user_id == project_user_id,
            ProjectUserPermission.permission_id == permission_id,
        )
        .first()
    )

    if exists:
        exists.allowed = payload.allowed
        db.commit()
        db.refresh(exists)

        action = "UPDATE"
        description = "Atualizou permissão específica do usuário no projeto."
    else:
        item = ProjectUserPermission(
            project_user_id=project_user_id,
            permission_id=permission_id,
            allowed=payload.allowed,
        )
        db.add(item)
        db.commit()
        db.refresh(item)

        action = "CREATE"
        description = "Adicionou permissão específica ao usuário no projeto."

    register_audit_log(
        db,
        user=current_user,
        action=action,
        entity_type="project_user_permission",
        entity_id=project_user_id,
        project_id=project_id,
        description=description,
        new_data={
            "project_user_id": str(project_user_id),
            "permission_id": str(permission_id),
            "permission_code": permission.code,
            "allowed": payload.allowed,
        },
        request=request,
        severity="WARNING",
    )

    return {
        "status": "ok",
        "message": "Permissão específica salva com sucesso.",
    }
