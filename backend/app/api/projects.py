from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_global_admin, get_current_user
from app.db.session import get_db
from app.models.project import Project
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate
from app.services.audit_service import register_audit_log

router = APIRouter(prefix="/projects", tags=["Projetos REURB"])


def _project_to_response(project: Project) -> ProjectResponse:
    return ProjectResponse(
        id=str(project.id),
        name=project.name,
        municipality=project.municipality,
        state=project.state,
        neighborhood=project.neighborhood,
        reurb_type=project.reurb_type,
        status=project.status,
        administrative_process_number=project.administrative_process_number,
        legal_basis=project.legal_basis,
        estimated_area_ha=project.estimated_area_ha,
        estimated_lots=project.estimated_lots,
        promoter=project.promoter,
        technical_responsible=project.technical_responsible,
        notes=project.notes,
    )


def _project_snapshot(project: Project) -> dict:
    return {
        "id": str(project.id),
        "name": project.name,
        "municipality": project.municipality,
        "state": project.state,
        "neighborhood": project.neighborhood,
        "reurb_type": project.reurb_type,
        "status": project.status,
        "administrative_process_number": project.administrative_process_number,
        "legal_basis": project.legal_basis,
        "estimated_area_ha": project.estimated_area_ha,
        "estimated_lots": project.estimated_lots,
        "promoter": project.promoter,
        "technical_responsible": project.technical_responsible,
        "notes": project.notes,
    }


@router.get("", response_model=list[ProjectResponse])
def list_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ProjectResponse]:
    if current_user.is_global_admin:
        projects = db.query(Project).order_by(Project.created_at.desc()).all()
    else:
        projects = (
            db.query(Project)
            .join(Project.users)
            .filter_by(user_id=current_user.id, active=True)
            .order_by(Project.created_at.desc())
            .all()
        )

    return [_project_to_response(project) for project in projects]


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_global_admin),
) -> ProjectResponse:
    project = Project(
        name=payload.name,
        municipality=payload.municipality,
        state=payload.state.upper(),
        neighborhood=payload.neighborhood,
        reurb_type=payload.reurb_type,
        status=payload.status,
        administrative_process_number=payload.administrative_process_number,
        legal_basis=payload.legal_basis,
        estimated_area_ha=payload.estimated_area_ha,
        estimated_lots=payload.estimated_lots,
        promoter=payload.promoter,
        technical_responsible=payload.technical_responsible,
        notes=payload.notes,
    )

    db.add(project)
    db.commit()
    db.refresh(project)

    register_audit_log(
        db,
        user=current_user,
        action="CREATE",
        entity_type="project",
        entity_id=project.id,
        project_id=project.id,
        description=f"Criou o projeto REURB: {project.name}.",
        new_data=_project_snapshot(project),
        request=request,
        severity="INFO",
    )

    return _project_to_response(project)


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectResponse:
    project = db.query(Project).filter(Project.id == project_id).first()

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Projeto não encontrado.",
        )

    if not current_user.is_global_admin:
        has_access = any(
            link.user_id == current_user.id and link.active for link in project.users
        )

        if not has_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Você não possui acesso a este projeto.",
            )

    return _project_to_response(project)


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: UUID,
    payload: ProjectUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_global_admin),
) -> ProjectResponse:
    project = db.query(Project).filter(Project.id == project_id).first()

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Projeto não encontrado.",
        )

    old_data = _project_snapshot(project)

    update_data = payload.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        if field == "state" and value is not None:
            value = value.upper()
        setattr(project, field, value)

    db.commit()
    db.refresh(project)

    register_audit_log(
        db,
        user=current_user,
        action="UPDATE",
        entity_type="project",
        entity_id=project.id,
        project_id=project.id,
        description=f"Atualizou o projeto REURB: {project.name}.",
        old_data=old_data,
        new_data=_project_snapshot(project),
        request=request,
        severity="WARNING",
    )

    return _project_to_response(project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_global_admin),
) -> None:
    project = db.query(Project).filter(Project.id == project_id).first()

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Projeto não encontrado.",
        )

    old_data = _project_snapshot(project)

    db.delete(project)
    db.commit()

    register_audit_log(
        db,
        user=current_user,
        action="DELETE",
        entity_type="project",
        entity_id=project_id,
        project_id=project_id,
        description=f"Excluiu o projeto REURB: {old_data['name']}.",
        old_data=old_data,
        request=request,
        severity="CRITICAL",
    )
