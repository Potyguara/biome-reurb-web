import json
import shutil
import zipfile
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.models.project import Project
from app.models.reurb import (
    Document,
    Lot,
    PhysicalRegistration,
    Seal,
    SocialRegistration,
)

BASE_STORAGE_DIR = Path("storage")
IMPORTS_DIR = BASE_STORAGE_DIR / "imports"


def _payload(data: dict[str, Any]) -> dict[str, Any]:
    """
    O app Flutter exporta os dados neste formato:

    {
        "app": "BIOME REURB",
        "resumo": {...},
        "dados": {
            "projetos": [],
            "selagens": [],
            "cadastros_fisicos": [],
            "cadastros_sociais": [],
            "documentos": []
        }
    }

    Esta função devolve data["dados"] quando existir.
    Caso contrário, devolve o próprio data.
    """
    inner = data.get("dados")

    if isinstance(inner, dict):
        return inner

    return data


def _list(data: dict, key: str) -> list:
    payload = _payload(data)
    value = payload.get(key)

    if isinstance(value, list):
        return value

    return []


def _safe_filename(filename: str) -> str:
    cleaned = filename.replace("\\", "_").replace("/", "_").strip()
    return cleaned or "mobile_import.zip"


def ensure_import_dirs() -> None:
    IMPORTS_DIR.mkdir(parents=True, exist_ok=True)


async def save_uploaded_zip(file: UploadFile) -> tuple[Path, Path]:
    ensure_import_dirs()

    import_id = uuid4().hex
    original_name = _safe_filename(file.filename or "mobile_import.zip")

    import_dir = IMPORTS_DIR / import_id
    import_dir.mkdir(parents=True, exist_ok=True)

    zip_path = import_dir / original_name

    with zip_path.open("wb") as buffer:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            buffer.write(chunk)

    return zip_path, import_dir


def extract_zip(zip_path: Path, import_dir: Path) -> Path:
    extracted_dir = import_dir / "extracted"

    if extracted_dir.exists():
        shutil.rmtree(extracted_dir)

    extracted_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(zip_path, "r") as zip_ref:
        zip_ref.extractall(extracted_dir)

    return extracted_dir


def find_export_json(extracted_dir: Path) -> Path | None:
    json_files = []

    for path in extracted_dir.rglob("*.json"):
        path_text = str(path)

        # Ignora lixo criado pelo macOS dentro de ZIP.
        if "__MACOSX" in path_text:
            continue

        # Ignora arquivos AppleDouble: ._dados.json
        if path.name.startswith("._"):
            continue

        json_files.append(path)

    if not json_files:
        return None

    # Prioriza dados.json, que é o arquivo real do BIOME REURB.
    for path in json_files:
        if path.name.lower() == "dados.json":
            return path

    return json_files[0]


def load_json_file(json_path: Path) -> dict[str, Any]:
    with json_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, dict):
        raise ValueError("O JSON da exportação precisa ser um objeto principal.")

    return data


def _list_from_any(data: dict[str, Any], *keys: str) -> list[dict[str, Any]]:
    payload = _payload(data)

    for key in keys:
        value = payload.get(key)

        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]

    return []


def count_items(data: dict[str, Any]) -> dict[str, int]:
    return {
        "total_projects": len(_list_from_any(data, "projetos", "projects")),
        "total_lots": len(_list_from_any(data, "lotes", "lotes_preliminares", "lots")),
        "total_seals": len(_list_from_any(data, "selagens", "seals")),
        "total_social_registrations": len(
            _list_from_any(
                data,
                "cadastros_sociais",
                "cadastrosSociais",
                "social_registrations",
            )
        ),
        "total_physical_registrations": len(
            _list_from_any(
                data,
                "cadastros_fisicos",
                "cadastrosFisicos",
                "physical_registrations",
            )
        ),
        "total_documents": len(
            _list_from_any(data, "documentos", "documentos_reurb", "documents")
        ),
    }


def _get(row: dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        if key in row and row[key] is not None:
            return row[key]
    return default


def _text(row: dict[str, Any], *keys: str, default: str | None = None) -> str | None:
    value = _get(row, *keys, default=default)
    if value is None:
        return default
    text = str(value).strip()
    return text if text else default


def _int(row: dict[str, Any], *keys: str) -> int | None:
    value = _get(row, *keys)
    if value is None or value == "":
        return None
    try:
        return int(float(str(value).replace(",", ".")))
    except Exception:
        return None


def _float(row: dict[str, Any], *keys: str) -> float | None:
    value = _get(row, *keys)
    if value is None or value == "":
        return None
    try:
        return float(str(value).replace(",", "."))
    except Exception:
        return None


def _bool(row: dict[str, Any], *keys: str, default: bool = False) -> bool:
    value = _get(row, *keys)
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    return text in {"1", "true", "sim", "yes", "y"}


def _first_project_id(data: dict[str, Any]) -> str | None:
    projetos = _list_from_any(data, "projetos", "projects")

    if not projetos:
        return None

    return _text(projetos[0], "id")


def import_mobile_json_to_database(
    db: Session,
    data: dict[str, Any],
    *,
    forced_project_id=None,
    extracted_dir_path: str | None = None,
) -> dict[str, Any]:
    """
    Importa os dados do JSON exportado pelo app mobile para o banco web.

    Se forced_project_id vier preenchido, todos os dados serão associados a esse projeto web.
    Caso contrário, tenta criar/atualizar projeto vindo do pacote mobile.

    Regra importante:
    - O JSON do Flutter guarda os registros dentro da chave "dados".
    - Portanto, todas as listas devem ser obtidas por _list_from_any(), que já entra em data["dados"].
    """

    projetos = _list_from_any(data, "projetos", "projects")
    lotes = _list_from_any(data, "lotes", "lotes_preliminares", "lots")
    selagens = _list_from_any(data, "selagens", "seals")
    sociais = _list_from_any(
        data,
        "cadastros_sociais",
        "cadastrosSociais",
        "social_registrations",
    )
    fisicos = _list_from_any(
        data,
        "cadastros_fisicos",
        "cadastrosFisicos",
        "physical_registrations",
    )
    documentos = _list_from_any(
        data,
        "documentos",
        "documentos_reurb",
        "documents",
    )

    created = {
        "projects": 0,
        "lots": 0,
        "seals": 0,
        "social_registrations": 0,
        "physical_registrations": 0,
        "documents": 0,
    }

    updated = {
        "projects": 0,
        "lots": 0,
        "seals": 0,
        "social_registrations": 0,
        "physical_registrations": 0,
        "documents": 0,
    }

    mobile_project_to_web_id: dict[str, Any] = {}
    mobile_lot_to_web_id: dict[str, Any] = {}
    mobile_seal_to_web_id: dict[str, Any] = {}
    mobile_social_to_web_id: dict[str, Any] = {}

    # -------------------------------------------------------------------------
    # 1. Projeto
    # -------------------------------------------------------------------------
    if forced_project_id is not None:
        project = db.query(Project).filter(Project.id == forced_project_id).first()

        if project is None:
            raise ValueError(
                "Projeto informado no parâmetro project_id não foi encontrado."
            )

        mobile_id = _first_project_id(data)

        if mobile_id:
            mobile_project_to_web_id[mobile_id] = project.id

    else:
        for row in projetos:
            mobile_id = _text(row, "id")
            name = _text(row, "nome", "name", default="Projeto REURB Importado")
            municipality = _text(
                row,
                "municipio",
                "municipality",
                default="Não informado",
            )
            state = _text(row, "estado", "state", default="AP")
            neighborhood = _text(
                row,
                "bairro",
                "neighborhood",
                default="Não informado",
            )

            project = (
                db.query(Project)
                .filter(
                    Project.name == name,
                    Project.municipality == municipality,
                    Project.neighborhood == neighborhood,
                )
                .first()
            )

            if project is None:
                project = Project(
                    name=name,
                    municipality=municipality,
                    state=state[:2].upper(),
                    neighborhood=neighborhood,
                    reurb_type=_text(
                        row,
                        "modalidade_reurb",
                        "reurb_type",
                        default="REURB-S",
                    ),
                    status=_text(row, "status", default="em_execucao"),
                    estimated_area_ha=_float(
                        row,
                        "area_ha",
                        "estimated_area_ha",
                    ),
                    estimated_lots=_int(
                        row,
                        "lotes_estimados",
                        "estimated_lots",
                    ),
                    notes="Criado por importação do app mobile.",
                )

                db.add(project)
                db.flush()
                created["projects"] += 1

            else:
                project.state = state[:2].upper()
                project.reurb_type = _text(
                    row,
                    "modalidade_reurb",
                    "reurb_type",
                    default=project.reurb_type,
                )
                project.status = _text(row, "status", default=project.status)
                project.estimated_area_ha = (
                    _float(row, "area_ha", "estimated_area_ha")
                    or project.estimated_area_ha
                )
                project.estimated_lots = (
                    _int(row, "lotes_estimados", "estimated_lots")
                    or project.estimated_lots
                )
                updated["projects"] += 1

            if mobile_id:
                mobile_project_to_web_id[mobile_id] = project.id

    def resolve_project_id(row: dict[str, Any]):
        if forced_project_id is not None:
            return forced_project_id

        mobile_project_id = _text(row, "projeto_id", "project_id")

        if mobile_project_id and mobile_project_id in mobile_project_to_web_id:
            return mobile_project_to_web_id[mobile_project_id]

        if mobile_project_to_web_id:
            return next(iter(mobile_project_to_web_id.values()))

        raise ValueError("Não foi possível resolver o projeto dos dados importados.")

    # -------------------------------------------------------------------------
    # 1.1. Lotes preliminares derivados das selagens
    # -------------------------------------------------------------------------
    # O app mobile atual não exporta coleção "lotes" nem "lotes_preliminares".
    # Porém cada selagem traz "codigo_lote_preliminar".
    # Portanto criamos lotes básicos automaticamente para permitir vínculo,
    # auditoria e organização posterior pelo administrador.
    if not lotes and selagens:
        lotes_por_codigo: dict[str, dict[str, Any]] = {}

        for row in selagens:
            codigo_lote = _text(
                row,
                "codigo_lote_preliminar",
                "codigo_lote",
                "lot_code",
            )

            if not codigo_lote:
                continue

            if codigo_lote not in lotes_por_codigo:
                lotes_por_codigo[codigo_lote] = {
                    "id": _text(row, "lote_preliminar_id", "lote_id", "lot_id"),
                    "projeto_id": _text(row, "projeto_id", "project_id"),
                    "codigo_lote": codigo_lote,
                    "quadra": None,
                    "status_lote": "preliminar",
                    "observacoes": "Lote preliminar criado automaticamente a partir da selagem mobile.",
                }

        lotes = list(lotes_por_codigo.values())

    # -------------------------------------------------------------------------
    # 2. Lotes
    # -------------------------------------------------------------------------
    for row in lotes:
        project_id = resolve_project_id(row)

        mobile_id = _text(row, "id")
        code = _text(
            row,
            "codigo_lote",
            "codigo_lote_preliminar",
            "codigo",
            "code",
            default="SEM-CODIGO",
        )

        lot = (
            db.query(Lot)
            .filter(
                Lot.project_id == project_id,
                Lot.code == code,
            )
            .first()
        )

        if lot is None:
            lot = Lot(
                project_id=project_id,
                code=code,
                block=_text(row, "quadra", "block"),
                area_m2=_float(row, "area_m2", "areaM2"),
                perimeter_m=_float(row, "perimetro_m", "perimeter_m"),
                status=_text(row, "status_lote", "status", default="preliminar"),
                needs_review=_bool(row, "necessita_revisao", "needs_review"),
                source_file=_text(row, "origem_arquivo", "source_file"),
                notes=_text(row, "observacoes", "notes"),
            )

            db.add(lot)
            db.flush()
            created["lots"] += 1

        else:
            lot.block = _text(row, "quadra", "block", default=lot.block)
            lot.area_m2 = _float(row, "area_m2", "areaM2") or lot.area_m2
            lot.perimeter_m = (
                _float(row, "perimetro_m", "perimeter_m") or lot.perimeter_m
            )
            lot.status = _text(row, "status_lote", "status", default=lot.status)
            lot.needs_review = _bool(
                row,
                "necessita_revisao",
                "needs_review",
                default=lot.needs_review,
            )
            lot.notes = _text(row, "observacoes", "notes", default=lot.notes)
            updated["lots"] += 1

        if mobile_id:
            mobile_lot_to_web_id[mobile_id] = lot.id

    # -------------------------------------------------------------------------
    # 3. Selagens
    # -------------------------------------------------------------------------
    for row in selagens:
        project_id = resolve_project_id(row)

        mobile_id = _text(row, "id")
        seal_code = _text(
            row,
            "codigo_selo",
            "seal_code",
            default="SEM-SELO",
        )

        mobile_lot_id = _text(row, "lote_preliminar_id", "lote_id", "lot_id")
        lot_id = mobile_lot_to_web_id.get(mobile_lot_id) if mobile_lot_id else None

        lot_code = _text(
            row,
            "codigo_lote_preliminar",
            "codigo_lote",
            "lot_code",
        )

        seal = (
            db.query(Seal)
            .filter(
                Seal.project_id == project_id,
                Seal.seal_code == seal_code,
            )
            .first()
        )

        if seal is None:
            seal = Seal(
                project_id=project_id,
                lot_id=lot_id,
                seal_code=seal_code,
                lot_code=lot_code,
                situation=_text(row, "situacao", "situation", default="ocupado"),
                geo_link_status=_text(
                    row,
                    "status_vinculo_geografico",
                    "geo_link_status",
                    default="nao_validado",
                ),
                needs_rtk_validation=_bool(
                    row,
                    "necessita_validacao_rtk",
                    "needs_rtk_validation",
                ),
                geospatial_note=_text(
                    row,
                    "observacao_geoespacial",
                    "geospatial_note",
                ),
                latitude=_float(row, "latitude"),
                longitude=_float(row, "longitude"),
                gps_accuracy=_float(row, "precisao_gps", "gps_accuracy"),
            )

            db.add(seal)
            db.flush()
            created["seals"] += 1

        else:
            seal.lot_id = lot_id or seal.lot_id
            seal.lot_code = lot_code or seal.lot_code
            seal.situation = _text(
                row,
                "situacao",
                "situation",
                default=seal.situation,
            )
            seal.geo_link_status = _text(
                row,
                "status_vinculo_geografico",
                "geo_link_status",
                default=seal.geo_link_status,
            )
            seal.needs_rtk_validation = _bool(
                row,
                "necessita_validacao_rtk",
                "needs_rtk_validation",
                default=seal.needs_rtk_validation,
            )
            seal.geospatial_note = _text(
                row,
                "observacao_geoespacial",
                "geospatial_note",
                default=seal.geospatial_note,
            )
            seal.latitude = _float(row, "latitude") or seal.latitude
            seal.longitude = _float(row, "longitude") or seal.longitude
            seal.gps_accuracy = (
                _float(row, "precisao_gps", "gps_accuracy") or seal.gps_accuracy
            )
            updated["seals"] += 1

        if mobile_id:
            mobile_seal_to_web_id[mobile_id] = seal.id

    # -------------------------------------------------------------------------
    # 4. Cadastros sociais
    # -------------------------------------------------------------------------
    for row in sociais:
        project_id = resolve_project_id(row)

        mobile_id = _text(row, "id")
        seal_code = _text(
            row,
            "codigo_selo",
            "seal_code",
            default="SEM-SELO",
        )
        mobile_seal_id = _text(row, "selagem_id", "seal_id")
        seal_id = mobile_seal_to_web_id.get(mobile_seal_id) if mobile_seal_id else None

        if seal_id is None and seal_code:
            seal = (
                db.query(Seal)
                .filter(
                    Seal.project_id == project_id,
                    Seal.seal_code == seal_code,
                )
                .first()
            )

            if seal:
                seal_id = seal.id

        cpf = _text(row, "cpf_responsavel", "responsible_cpf", "cpf")
        responsible_name = _text(
            row,
            "nome_responsavel",
            "responsible_name",
            "nome",
            default="Não informado",
        )

        if cpf:
            social = (
                db.query(SocialRegistration)
                .filter(
                    SocialRegistration.project_id == project_id,
                    SocialRegistration.responsible_cpf == cpf,
                )
                .first()
            )
        else:
            social = (
                db.query(SocialRegistration)
                .filter(
                    SocialRegistration.project_id == project_id,
                    SocialRegistration.seal_code == seal_code,
                )
                .first()
            )

        if social is None:
            social = SocialRegistration(
                project_id=project_id,
                seal_id=seal_id,
                seal_code=seal_code,
                responsible_name=responsible_name,
                responsible_cpf=cpf,
                responsible_rg=_text(row, "rg_responsavel", "responsible_rg", "rg"),
                issuing_agency=_text(row, "orgao_emissor", "issuing_agency"),
                phone=_text(row, "telefone", "phone"),
                marital_status=_text(row, "estado_civil", "marital_status"),
                profession=_text(row, "profissao", "profession"),
                household_members=_int(
                    row,
                    "quantidade_moradores",
                    "household_members",
                ),
                family_income=_float(row, "renda_familiar", "family_income"),
                receives_social_program=_bool(
                    row,
                    "recebe_programa_social",
                    "receives_social_program",
                ),
                social_program=_text(row, "programa_social", "social_program"),
                occupation_years=_int(
                    row,
                    "tempo_ocupacao_anos",
                    "occupation_years",
                ),
                occupation_type=_text(row, "forma_ocupacao", "occupation_type"),
                possession_document=_text(
                    row,
                    "documento_posse",
                    "possession_document",
                ),
                owns_other_property=_bool(
                    row,
                    "possui_outro_imovel",
                    "owns_other_property",
                ),
                has_conflict=_bool(row, "possui_conflito", "has_conflict"),
                notes=_text(row, "observacoes", "notes"),
            )

            db.add(social)
            db.flush()
            created["social_registrations"] += 1

        else:
            social.seal_id = seal_id or social.seal_id
            social.seal_code = seal_code or social.seal_code
            social.responsible_name = responsible_name or social.responsible_name
            social.responsible_cpf = cpf or social.responsible_cpf
            social.responsible_rg = _text(
                row,
                "rg_responsavel",
                "responsible_rg",
                "rg",
                default=social.responsible_rg,
            )
            social.issuing_agency = _text(
                row,
                "orgao_emissor",
                "issuing_agency",
                default=social.issuing_agency,
            )
            social.phone = _text(row, "telefone", "phone", default=social.phone)
            social.marital_status = _text(
                row,
                "estado_civil",
                "marital_status",
                default=social.marital_status,
            )
            social.profession = _text(
                row,
                "profissao",
                "profession",
                default=social.profession,
            )
            social.household_members = (
                _int(row, "quantidade_moradores", "household_members")
                or social.household_members
            )
            social.family_income = (
                _float(row, "renda_familiar", "family_income") or social.family_income
            )
            social.receives_social_program = _bool(
                row,
                "recebe_programa_social",
                "receives_social_program",
                default=social.receives_social_program,
            )
            social.social_program = _text(
                row,
                "programa_social",
                "social_program",
                default=social.social_program,
            )
            social.occupation_years = (
                _int(row, "tempo_ocupacao_anos", "occupation_years")
                or social.occupation_years
            )
            social.occupation_type = _text(
                row,
                "forma_ocupacao",
                "occupation_type",
                default=social.occupation_type,
            )
            social.possession_document = _text(
                row,
                "documento_posse",
                "possession_document",
                default=social.possession_document,
            )
            social.owns_other_property = _bool(
                row,
                "possui_outro_imovel",
                "owns_other_property",
                default=social.owns_other_property,
            )
            social.has_conflict = _bool(
                row,
                "possui_conflito",
                "has_conflict",
                default=social.has_conflict,
            )
            social.notes = _text(row, "observacoes", "notes", default=social.notes)
            updated["social_registrations"] += 1

        if mobile_id:
            mobile_social_to_web_id[mobile_id] = social.id

    # -------------------------------------------------------------------------
    # 5. Cadastros físicos
    # -------------------------------------------------------------------------
    for row in fisicos:
        project_id = resolve_project_id(row)

        seal_code = _text(
            row,
            "codigo_selo",
            "seal_code",
            default="SEM-SELO",
        )
        mobile_seal_id = _text(row, "selagem_id", "seal_id")
        seal_id = mobile_seal_to_web_id.get(mobile_seal_id) if mobile_seal_id else None

        if seal_id is None and seal_code:
            seal = (
                db.query(Seal)
                .filter(
                    Seal.project_id == project_id,
                    Seal.seal_code == seal_code,
                )
                .first()
            )

            if seal:
                seal_id = seal.id

        physical = (
            db.query(PhysicalRegistration)
            .filter(
                PhysicalRegistration.project_id == project_id,
                PhysicalRegistration.seal_code == seal_code,
            )
            .first()
        )

        if physical is None:
            physical = PhysicalRegistration(
                project_id=project_id,
                seal_id=seal_id,
                seal_code=seal_code,
                property_type=_text(row, "tipo_imovel", "property_type"),
                property_use=_text(row, "uso_imovel", "property_use"),
                wall_material=_text(row, "material_paredes", "wall_material"),
                roof_type=_text(row, "tipo_cobertura", "roof_type"),
                floor_type=_text(row, "tipo_piso", "floor_type"),
                floors=_int(row, "numero_pavimentos", "floors"),
                rooms=_int(row, "numero_comodos", "rooms"),
                bathrooms=_int(row, "numero_banheiros", "bathrooms"),
                has_energy=_bool(row, "possui_energia", "has_energy"),
                has_water=_bool(row, "possui_agua", "has_water"),
                has_sewage=_bool(row, "possui_esgoto", "has_sewage"),
                has_bathroom=_bool(row, "possui_banheiro", "has_bathroom"),
                habitability_condition=_text(
                    row,
                    "condicao_habitabilidade",
                    "habitability_condition",
                ),
                risk_area=_bool(row, "area_risco", "risk_area"),
                flood_prone=_bool(row, "sujeito_inundacao", "flood_prone"),
                notes=_text(row, "observacoes", "notes"),
            )

            db.add(physical)
            db.flush()
            created["physical_registrations"] += 1

        else:
            physical.seal_id = seal_id or physical.seal_id
            physical.property_type = _text(
                row,
                "tipo_imovel",
                "property_type",
                default=physical.property_type,
            )
            physical.property_use = _text(
                row,
                "uso_imovel",
                "property_use",
                default=physical.property_use,
            )
            physical.wall_material = _text(
                row,
                "material_paredes",
                "wall_material",
                default=physical.wall_material,
            )
            physical.roof_type = _text(
                row,
                "tipo_cobertura",
                "roof_type",
                default=physical.roof_type,
            )
            physical.floor_type = _text(
                row,
                "tipo_piso",
                "floor_type",
                default=physical.floor_type,
            )
            physical.floors = (
                _int(row, "numero_pavimentos", "floors") or physical.floors
            )
            physical.rooms = _int(row, "numero_comodos", "rooms") or physical.rooms
            physical.bathrooms = (
                _int(row, "numero_banheiros", "bathrooms") or physical.bathrooms
            )
            physical.has_energy = _bool(
                row,
                "possui_energia",
                "has_energy",
                default=physical.has_energy,
            )
            physical.has_water = _bool(
                row,
                "possui_agua",
                "has_water",
                default=physical.has_water,
            )
            physical.has_sewage = _bool(
                row,
                "possui_esgoto",
                "has_sewage",
                default=physical.has_sewage,
            )
            physical.has_bathroom = _bool(
                row,
                "possui_banheiro",
                "has_bathroom",
                default=physical.has_bathroom,
            )
            physical.habitability_condition = _text(
                row,
                "condicao_habitabilidade",
                "habitability_condition",
                default=physical.habitability_condition,
            )
            physical.risk_area = _bool(
                row,
                "area_risco",
                "risk_area",
                default=physical.risk_area,
            )
            physical.flood_prone = _bool(
                row,
                "sujeito_inundacao",
                "flood_prone",
                default=physical.flood_prone,
            )
            physical.notes = _text(
                row,
                "observacoes",
                "notes",
                default=physical.notes,
            )
            updated["physical_registrations"] += 1

    # -------------------------------------------------------------------------
    # 6. Documentos
    # -------------------------------------------------------------------------
    for row in documentos:
        project_id = resolve_project_id(row)

        seal_code = _text(
            row,
            "codigo_selo",
            "seal_code",
            default="SEM-SELO",
        )
        mobile_seal_id = _text(row, "selagem_id", "seal_id")
        mobile_social_id = _text(
            row,
            "cadastro_social_id",
            "social_registration_id",
        )

        seal_id = mobile_seal_to_web_id.get(mobile_seal_id) if mobile_seal_id else None

        if seal_id is None and seal_code:
            seal = (
                db.query(Seal)
                .filter(
                    Seal.project_id == project_id,
                    Seal.seal_code == seal_code,
                )
                .first()
            )

            if seal:
                seal_id = seal.id

        social_id = (
            mobile_social_to_web_id.get(mobile_social_id) if mobile_social_id else None
        )

        lot_id = None

        if seal_id:
            seal = (
                db.query(Seal)
                .filter(
                    Seal.id == seal_id,
                    Seal.project_id == project_id,
                )
                .first()
            )

            if seal and seal.lot_id:
                lot_id = seal.lot_id

        if seal_id is None and seal_code:
            seal = (
                db.query(Seal)
                .filter(
                    Seal.project_id == project_id,
                    Seal.seal_code == seal_code,
                )
                .first()
            )

            if seal:
                seal_id = seal.id
        social_id = (
            mobile_social_to_web_id.get(mobile_social_id) if mobile_social_id else None
        )

        file_path = _text(row, "arquivo_path", "file_path", default="")
        document_type = _text(
            row,
            "tipo_documento",
            "document_type",
            default="documento",
        )

        if extracted_dir_path and file_path:
            possible = Path(extracted_dir_path) / file_path
            if possible.exists():
                file_path = str(possible)

        document = (
            db.query(Document)
            .filter(
                Document.project_id == project_id,
                Document.seal_code == seal_code,
                Document.document_type == document_type,
                Document.file_path == file_path,
            )
            .first()
        )

        if document is None:
            document = Document(
                project_id=project_id,
                lot_id=lot_id,
                seal_id=seal_id,
                social_registration_id=social_id,
                seal_code=seal_code,
                document_type=document_type,
                file_path=file_path,
                notes=_text(row, "observacoes", "notes"),
                validated=False,
            )

            db.add(document)
            db.flush()
            created["documents"] += 1

        else:
            document.lot_id = lot_id or document.lot_id
            document.seal_id = seal_id or document.seal_id
            document.social_registration_id = (
                social_id or document.social_registration_id
            )
            document.notes = _text(row, "observacoes", "notes", default=document.notes)
            updated["documents"] += 1

            db.commit()

    return {
        "created": created,
        "updated": updated,
    }
