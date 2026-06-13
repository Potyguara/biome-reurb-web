from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.access import ProjectUser, ProjectUserPermission
from app.models.project import Project
from app.models.user import User
from app.schemas.mobile import (
    MobileProjectResponse,
    MobileSessionResponse,
    MobileUserResponse,
)

router = APIRouter(prefix="/mobile", tags=["BIOME REURB CAMPO"])


ROLE_DEFAULT_PERMISSIONS: dict[str, set[str]] = {
    "CADASTRADOR": {
        "mobile.access",
        "mobile.sync",
        "projects.view",
        "lots.view",
        "seals.view",
        "seals.create",
        "seals.edit",
        "social.view",
        "social.create",
        "social.edit",
        "physical.view",
        "physical.create",
        "physical.edit",
        "documents.view",
        "documents.upload",
        "citizen_lots.create",
        "citizen_lots.edit",
        "map.view",
    },
    "GESTOR_PROJETO": {
        "mobile.access",
        "mobile.sync",
        "projects.view",
        "lots.view",
        "seals.view",
        "social.view",
        "physical.view",
        "documents.view",
        "documents.upload",
        "map.view",
        "reports.view",
    },
    "ANALISTA_SOCIAL": {
        "mobile.access",
        "mobile.sync",
        "projects.view",
        "lots.view",
        "seals.view",
        "social.view",
        "social.edit",
        "documents.view",
        "documents.upload",
        "map.view",
    },
    "ANALISTA_TECNICO": {
        "mobile.access",
        "mobile.sync",
        "projects.view",
        "lots.view",
        "seals.view",
        "seals.edit",
        "physical.view",
        "physical.edit",
        "documents.view",
        "documents.upload",
        "citizen_lots.edit",
        "map.view",
    },
    "ANALISTA_DOCUMENTAL": {
        "mobile.access",
        "mobile.sync",
        "projects.view",
        "lots.view",
        "seals.view",
        "documents.view",
        "documents.upload",
    },
    "VISUALIZADOR": {
        "mobile.access",
        "projects.view",
        "lots.view",
        "seals.view",
        "social.view",
        "physical.view",
        "documents.view",
        "map.view",
    },
}


def _effective_permissions(
    db: Session,
    project_user: ProjectUser,
) -> list[str]:
    role_name = project_user.role.name.upper().strip()
    permissions = set(ROLE_DEFAULT_PERMISSIONS.get(role_name, {"projects.view"}))

    overrides = (
        db.query(ProjectUserPermission)
        .options(joinedload(ProjectUserPermission.permission))
        .filter(
            ProjectUserPermission.project_user_id == project_user.id,
        )
        .all()
    )

    for override in overrides:
        if override.permission is None:
            continue

        code = override.permission.code

        if override.allowed:
            permissions.add(code)
        else:
            permissions.discard(code)

    return sorted(permissions)


def _project_response(
    project: Project,
    *,
    role: str,
    permissions: list[str],
) -> MobileProjectResponse:
    return MobileProjectResponse(
        id=str(project.id),
        name=project.name,
        municipality=project.municipality,
        state=project.state,
        neighborhood=project.neighborhood,
        reurb_type=project.reurb_type,
        status=project.status,
        role=role,
        permissions=permissions,
    )


@router.get("/session", response_model=MobileSessionResponse)
def get_mobile_session(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MobileSessionResponse:
    user_response = MobileUserResponse(
        id=str(current_user.id),
        name=current_user.name,
        email=current_user.email,
        is_global_admin=current_user.is_global_admin,
        active=current_user.active,
    )

    if current_user.is_global_admin:
        projects = (
            db.query(Project)
            .order_by(Project.created_at.desc())
            .all()
        )

        return MobileSessionResponse(
            user=user_response,
            projects=[
                _project_response(
                    project,
                    role="ADMIN_BIOME",
                    permissions=["*"],
                )
                for project in projects
            ],
        )

    links = (
        db.query(ProjectUser)
        .options(
            joinedload(ProjectUser.project),
            joinedload(ProjectUser.role),
        )
        .filter(
            ProjectUser.user_id == current_user.id,
            ProjectUser.active.is_(True),
        )
        .order_by(ProjectUser.created_at.desc())
        .all()
    )

    projects: list[MobileProjectResponse] = []

    for link in links:
        if link.project is None or link.role is None:
            continue

        projects.append(
            _project_response(
                link.project,
                role=link.role.name,
                permissions=_effective_permissions(db, link),
            )
        )

    return MobileSessionResponse(
        user=user_response,
        projects=projects,
    )
