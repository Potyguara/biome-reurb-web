from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from app.api.deps import get_current_global_admin
from app.db.session import get_db
from app.models.reurb import MobileImport
from app.models.user import User
from app.schemas.imports import MobileImportResponse
from app.services.audit_service import register_audit_log
from app.services.mobile_import_service import (
    count_items,
    extract_zip,
    find_export_json,
    import_mobile_json_to_database,
    load_json_file,
    save_uploaded_zip,
)

router = APIRouter(prefix="/mobile-imports", tags=["Importação Mobile"])


def _import_to_response(item: MobileImport) -> MobileImportResponse:
    total_records = (
        (item.total_lots or 0)
        + (item.total_seals or 0)
        + (item.total_social_registrations or 0)
        + (item.total_physical_registrations or 0)
        + (item.total_documents or 0)
    )

    return MobileImportResponse(
        id=str(item.id),
        project_id=str(item.project_id) if item.project_id else None,
        original_filename=item.original_filename,
        stored_zip_path=item.stored_zip_path,
        extracted_dir_path=item.extracted_dir_path,
        json_path=item.json_path,
        status=item.status,
        total_projects=item.total_projects or 0,
        total_lots=item.total_lots or 0,
        total_seals=item.total_seals or 0,
        total_social_registrations=item.total_social_registrations or 0,
        total_physical_registrations=item.total_physical_registrations or 0,
        total_documents=item.total_documents or 0,
        total_records=total_records,
        lots_count=item.total_lots or 0,
        seals_count=item.total_seals or 0,
        social_count=item.total_social_registrations or 0,
        physical_count=item.total_physical_registrations or 0,
        documents_count=item.total_documents or 0,
        errors=item.errors,
        created_at=item.created_at,
    )


@router.get("", response_model=list[MobileImportResponse])
def list_mobile_imports(
    project_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_global_admin),
) -> list[MobileImportResponse]:
    query = db.query(MobileImport)

    if project_id is not None:
        query = query.filter(MobileImport.project_id == project_id)

    items = query.order_by(MobileImport.created_at.desc()).limit(100).all()

    return [_import_to_response(item) for item in items]


@router.post(
    "", response_model=MobileImportResponse, status_code=status.HTTP_201_CREATED
)
async def upload_mobile_import(
    request: Request,
    project_id: UUID | None = Form(default=None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_global_admin),
) -> MobileImportResponse:
    filename = file.filename or ""

    if not filename.lower().endswith(".zip"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Envie um arquivo .zip exportado pelo app mobile.",
        )

    zip_path = None
    extracted_dir = None
    json_path = None

    item = MobileImport(
        project_id=project_id,
        original_filename=filename,
        stored_zip_path="",
        status="received",
    )

    try:
        zip_path, import_dir = await save_uploaded_zip(file)
        extracted_dir = extract_zip(zip_path, import_dir)
        json_path = find_export_json(extracted_dir)

        if json_path is None:
            raise ValueError("Nenhum arquivo JSON foi encontrado dentro do ZIP.")

        data = load_json_file(json_path)
        totals = count_items(data)
        import_result = import_mobile_json_to_database(
            db,
            data,
            forced_project_id=project_id,
            extracted_dir_path=str(extracted_dir),
        )

        item.stored_zip_path = str(zip_path)
        item.extracted_dir_path = str(extracted_dir)
        item.json_path = str(json_path)
        item.status = "imported"
        item.total_projects = totals["total_projects"]
        item.total_lots = totals["total_lots"]
        item.total_seals = totals["total_seals"]
        item.total_social_registrations = totals["total_social_registrations"]
        item.total_physical_registrations = totals["total_physical_registrations"]
        item.total_documents = totals["total_documents"]
        item.errors = None

        db.add(item)
        db.commit()
        db.refresh(item)

        register_audit_log(
            db,
            user=current_user,
            action="CREATE",
            entity_type="mobile_import",
            entity_id=item.id,
            project_id=project_id,
            description=f"Importou pacote mobile: {filename}.",
            new_data={
                "filename": filename,
                "stored_zip_path": str(zip_path),
                "json_path": str(json_path),
                **totals,
                "import_result": import_result,
            },
            request=request,
            severity="INFO",
        )

        return _import_to_response(item)

    except Exception as e:
        item.stored_zip_path = str(zip_path) if zip_path else ""
        item.extracted_dir_path = str(extracted_dir) if extracted_dir else None
        item.json_path = str(json_path) if json_path else None
        item.status = "error"
        item.errors = {
            "message": str(e),
        }

        db.add(item)
        db.commit()
        db.refresh(item)

        register_audit_log(
            db,
            user=current_user,
            action="ERROR",
            entity_type="mobile_import",
            entity_id=item.id,
            project_id=project_id,
            description=f"Erro ao importar pacote mobile: {filename}.",
            new_data=item.errors,
            request=request,
            severity="ERROR",
        )

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Erro ao processar ZIP: {e}",
        )
