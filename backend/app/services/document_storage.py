import mimetypes
import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

from app.models.reurb import Document

DOCUMENT_STORAGE_DIR = Path("storage/documents")
IMPORT_STORAGE_DIR = Path("storage/imports")


@dataclass(frozen=True)
class StoredDocumentFile:
    file_path: str
    stored_filename: str
    file_size_bytes: int


def safe_filename(filename: str) -> str:
    filename = filename.replace("\\", "/").split("/")[-1].strip()

    if not filename:
        return "documento"

    for value in ("..", "/", "\\"):
        filename = filename.replace(value, "")

    return filename or "documento"


def extract_file_extension(
    filename: str,
    content_type: str | None = None,
) -> str:
    suffix = Path(filename).suffix.lower()

    if suffix:
        return suffix

    if content_type:
        guessed = mimetypes.guess_extension(
            content_type.split(";")[0].strip(),
        )

        if guessed:
            return guessed

    return ""


def resolve_document_path(document: Document) -> Path | None:
    raw_path = (document.file_path or "").strip()

    if not raw_path:
        return None

    candidates: list[Path] = []

    direct = Path(raw_path)

    if direct.is_absolute():
        candidates.append(direct)
    else:
        candidates.append(direct)
        candidates.append(Path("storage") / direct)

    filename = Path(raw_path.replace("\\", "/")).name

    if filename:
        candidates.append(
            DOCUMENT_STORAGE_DIR / str(document.project_id) / filename,
        )

        if IMPORT_STORAGE_DIR.exists():
            candidates.extend(IMPORT_STORAGE_DIR.rglob(filename))

    for candidate in candidates:
        try:
            if candidate.exists() and candidate.is_file():
                return candidate
        except OSError:
            continue

    return None


def copy_mobile_document_to_project_storage(
    *,
    project_id: UUID,
    source_path: Path,
    fallback_filename: str,
) -> StoredDocumentFile:
    if not source_path.exists() or not source_path.is_file():
        raise FileNotFoundError(
            f"Arquivo de origem não encontrado: {source_path}",
        )

    project_dir = DOCUMENT_STORAGE_DIR / str(project_id)

    project_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    original_name = safe_filename(
        fallback_filename or source_path.name,
    )

    suffix = Path(original_name).suffix.lower()

    if not suffix:
        suffix = source_path.suffix.lower()

    stored_filename = f"{uuid.uuid4()}{suffix}"
    target_path = project_dir / stored_filename

    shutil.copyfile(
        source_path,
        target_path,
    )

    return StoredDocumentFile(
        file_path=str(target_path),
        stored_filename=stored_filename,
        file_size_bytes=target_path.stat().st_size,
    )
