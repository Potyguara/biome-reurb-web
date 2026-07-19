import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.access import ProjectUser
from app.models.project import Project
from app.models.reurb import Document, Lot, Seal, SocialRegistration
from app.models.user import User
from app.schemas.mobile_document_sync import (
    MobileDocumentAcceptedItem,
    MobileDocumentConflictItem,
    MobileDocumentPullItem,
    MobileDocumentPullResponse,
    MobileDocumentPushRequest,
    MobileDocumentPushResponse,
    MobileDocumentRejectedItem,
)
from app.services.document_storage import (
    copy_mobile_document_to_project_storage,
    extract_file_extension,
    resolve_document_path,
    safe_filename,
)

router = APIRouter(
    prefix="/mobile",
    tags=["BIOME REURB Documents"],
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_project_access(
    db: Session,
    *,
    project_id: UUID,
    current_user: User,
) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Projeto não encontrado.",
        )

    if current_user.is_global_admin:
        return project

    project_user = (
        db.query(ProjectUser)
        .filter(
            ProjectUser.project_id == project_id,
            ProjectUser.user_id == current_user.id,
            ProjectUser.active.is_(True),
        )
        .first()
    )

    if project_user is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário não possui acesso ao projeto.",
        )

    return project


def _validate_references(
    db: Session,
    *,
    project_id: UUID,
    lot_id: UUID | None,
    seal_id: UUID | None,
    social_registration_id: UUID | None,
) -> None:
    if lot_id is not None:
        lot_exists = (
            db.query(Lot.id)
            .filter(
                Lot.id == lot_id,
                Lot.project_id == project_id,
            )
            .first()
        )

        if lot_exists is None:
            raise ValueError(
                "O lote informado não existe neste projeto.",
            )

    if seal_id is not None:
        seal_exists = (
            db.query(Seal.id)
            .filter(
                Seal.id == seal_id,
                Seal.project_id == project_id,
            )
            .first()
        )

        if seal_exists is None:
            raise ValueError(
                "A selagem informada não existe neste projeto.",
            )

    if social_registration_id is not None:
        registration_exists = (
            db.query(SocialRegistration.id)
            .filter(
                SocialRegistration.id == social_registration_id,
                SocialRegistration.project_id == project_id,
            )
            .first()
        )

        if registration_exists is None:
            raise ValueError(
                "O cadastro social informado não existe neste projeto.",
            )


def _find_existing_document(
    db: Session,
    *,
    project_id: UUID,
    source_local_id: UUID,
    source_device_id: UUID,
) -> Document | None:
    return (
        db.query(Document)
        .filter(
            Document.project_id == project_id,
            Document.source_local_id == source_local_id,
            Document.source_device_id == source_device_id,
        )
        .first()
    )


def _document_updated_at(document: Document) -> datetime:
    return (
        document.updated_at
        or document.server_received_at
        or document.created_at
        or _utcnow()
    )


def _to_pull_item(document: Document) -> MobileDocumentPullItem:
    return MobileDocumentPullItem(
        id=document.id,
        project_id=document.project_id,
        source_local_id=document.source_local_id,
        source_device_id=document.source_device_id,
        lot_id=document.lot_id,
        seal_id=document.seal_id,
        social_registration_id=document.social_registration_id,
        seal_code=document.seal_code,
        document_type=document.document_type,
        original_filename=document.original_filename,
        stored_filename=document.stored_filename,
        mime_type=document.mime_type,
        file_size_bytes=document.file_size_bytes,
        notes=document.notes,
        sync_version=document.sync_version or 1,
        deleted=bool(document.deleted),
        client_created_at=document.client_created_at,
        client_updated_at=document.client_updated_at,
        server_received_at=document.server_received_at,
        created_at=document.created_at,
        updated_at=_document_updated_at(document),
    )


@router.post(
    "/sync/documents",
    response_model=MobileDocumentPushResponse,
)
def push_documents(
    payload: MobileDocumentPushRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MobileDocumentPushResponse:
    _ensure_project_access(
        db,
        project_id=payload.project_id,
        current_user=current_user,
    )

    accepted: list[MobileDocumentAcceptedItem] = []
    rejected: list[MobileDocumentRejectedItem] = []
    conflicts: list[MobileDocumentConflictItem] = []

    for item in payload.records:
        try:
            with db.begin_nested():
                _validate_references(
                    db,
                    project_id=payload.project_id,
                    lot_id=item.lot_id,
                    seal_id=item.seal_id,
                    social_registration_id=item.social_registration_id,
                )

                existing = _find_existing_document(
                    db,
                    project_id=payload.project_id,
                    source_local_id=item.source_local_id,
                    source_device_id=item.source_device_id,
                )

                now = _utcnow()

                if existing is None:
                    document = Document(
                        project_id=payload.project_id,
                        source_local_id=item.source_local_id,
                        source_device_id=item.source_device_id,
                        lot_id=item.lot_id,
                        seal_id=item.seal_id,
                        social_registration_id=item.social_registration_id,
                        seal_code=item.seal_code.strip(),
                        document_type=item.document_type.strip(),
                        file_path=None,
                        original_filename=item.original_filename,
                        stored_filename=item.stored_filename,
                        mime_type=item.mime_type,
                        file_size_bytes=item.file_size_bytes,
                        notes=item.notes,
                        validated=False,
                        document_status="pendente",
                        client_created_at=item.client_created_at,
                        client_updated_at=item.client_updated_at,
                        server_received_at=now,
                        sync_version=1,
                        deleted=item.deleted,
                        updated_at=now,
                    )

                    db.add(document)
                    db.flush()

                    accepted.append(
                        MobileDocumentAcceptedItem(
                            source_local_id=item.source_local_id,
                            server_id=document.id,
                            sync_version=document.sync_version,
                            status="created",
                            server_updated_at=now,
                        )
                    )

                    continue

                current_version = existing.sync_version or 1
                incoming_version = item.expected_sync_version

                if incoming_version is not None and incoming_version < current_version:
                    conflicts.append(
                        MobileDocumentConflictItem(
                            source_local_id=item.source_local_id,
                            server_id=existing.id,
                            expected_sync_version=incoming_version,
                            current_sync_version=current_version,
                            reason=(
                                "A versão local do documento está "
                                "desatualizada em relação ao servidor."
                            ),
                        )
                    )

                    continue

                existing.lot_id = item.lot_id
                existing.seal_id = item.seal_id
                existing.social_registration_id = item.social_registration_id
                existing.seal_code = item.seal_code.strip()
                existing.document_type = item.document_type.strip()

                if item.original_filename is not None:
                    existing.original_filename = item.original_filename

                if item.stored_filename is not None and existing.file_path is None:
                    existing.stored_filename = item.stored_filename

                if item.mime_type is not None:
                    existing.mime_type = item.mime_type

                if item.file_size_bytes is not None:
                    existing.file_size_bytes = item.file_size_bytes

                existing.notes = item.notes
                existing.client_created_at = (
                    item.client_created_at or existing.client_created_at
                )
                existing.client_updated_at = item.client_updated_at
                existing.server_received_at = now
                existing.deleted = item.deleted
                existing.sync_version = current_version + 1
                existing.updated_at = now

                db.flush()

                accepted.append(
                    MobileDocumentAcceptedItem(
                        source_local_id=item.source_local_id,
                        server_id=existing.id,
                        sync_version=existing.sync_version,
                        status="updated",
                        server_updated_at=now,
                    )
                )

        except ValueError as exc:
            rejected.append(
                MobileDocumentRejectedItem(
                    source_local_id=item.source_local_id,
                    reason=str(exc),
                )
            )
        except Exception as exc:
            rejected.append(
                MobileDocumentRejectedItem(
                    source_local_id=item.source_local_id,
                    reason=(
                        "Falha ao processar o documento: "
                        f"{type(exc).__name__}: {exc}"
                    ),
                )
            )

    db.commit()

    return MobileDocumentPushResponse(
        batch_id=payload.batch_id,
        accepted=accepted,
        rejected=rejected,
        conflicts=conflicts,
        server_time=_utcnow(),
    )


@router.get(
    "/sync/documents",
    response_model=MobileDocumentPullResponse,
)
def pull_mobile_documents(
    project_id: UUID,
    since: datetime | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MobileDocumentPullResponse:
    _ensure_project_access(
        db,
        project_id=project_id,
        current_user=current_user,
    )

    query = db.query(Document).filter(
        Document.project_id == project_id,
    )

    if since is not None:
        query = query.filter(
            Document.updated_at > since,
        )

    documents = (
        query.order_by(
            Document.updated_at.asc(),
            Document.id.asc(),
        )
        .limit(limit)
        .all()
    )

    now = _utcnow()
    records = [_to_pull_item(document) for document in documents]

    if documents:
        next_cursor = _document_updated_at(documents[-1])
    else:
        next_cursor = since or now

    return MobileDocumentPullResponse(
        project_id=project_id,
        records=records,
        next_cursor=next_cursor,
        server_time=now,
    )


@router.post(
    "/sync/documents/{document_id}/file",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def upload_document_file(
    document_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    document = db.query(Document).filter(Document.id == document_id).first()

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Documento não encontrado.",
        )

    _ensure_project_access(
        db,
        project_id=document.project_id,
        current_user=current_user,
    )

    if document.deleted:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Não é possível enviar arquivo para documento excluído.",
        )

    original_filename = safe_filename(
        file.filename or document.original_filename or "documento",
    )

    extension = extract_file_extension(
        original_filename,
        file.content_type,
    )

    suffix = Path(original_filename).suffix

    if not suffix and extension:
        original_filename = f"{original_filename}{extension}"

    temporary_path: Path | None = None

    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            suffix=extension,
            delete=False,
        ) as temporary_file:
            temporary_path = Path(temporary_file.name)

            while True:
                chunk = await file.read(1024 * 1024)

                if not chunk:
                    break

                temporary_file.write(chunk)

        if temporary_path.stat().st_size == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O arquivo enviado está vazio.",
            )

        stored_file = copy_mobile_document_to_project_storage(
            project_id=document.project_id,
            source_path=temporary_path,
            fallback_filename=original_filename,
        )

        previous_path = resolve_document_path(document)

        document.file_path = stored_file.file_path
        document.original_filename = original_filename
        document.stored_filename = stored_file.stored_filename
        document.mime_type = (
            file.content_type or document.mime_type or "application/octet-stream"
        )
        document.file_size_bytes = stored_file.file_size_bytes
        document.server_received_at = _utcnow()
        document.updated_at = _utcnow()

        db.commit()

        if previous_path is not None and previous_path != Path(stored_file.file_path):
            try:
                previous_path.unlink(missing_ok=True)
            except OSError:
                pass

    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Não foi possível armazenar o arquivo: {exc}",
        ) from exc
    finally:
        await file.close()

        if temporary_path is not None:
            try:
                os.unlink(temporary_path)
            except FileNotFoundError:
                pass
            except OSError:
                pass


@router.get(
    "/sync/documents/{document_id}/download",
    response_class=FileResponse,
)
def download_document_file(
    document_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    document = db.query(Document).filter(Document.id == document_id).first()

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Documento não encontrado.",
        )

    _ensure_project_access(
        db,
        project_id=document.project_id,
        current_user=current_user,
    )

    if document.deleted:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="O documento foi excluído.",
        )

    file_path = resolve_document_path(document)

    if file_path is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="O arquivo físico deste documento ainda não foi enviado.",
        )

    download_name = safe_filename(
        document.original_filename or document.stored_filename or file_path.name,
    )

    return FileResponse(
        path=file_path,
        filename=download_name,
        media_type=document.mime_type or "application/octet-stream",
    )
