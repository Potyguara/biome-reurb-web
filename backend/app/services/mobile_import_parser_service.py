import json
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import MetaData, Table, insert, select, update
from sqlalchemy.orm import Session


class MobileImportParserService:
    """
    Parser incremental para pacotes exportados pelo app mobile BIOME REURB.

    Regras:
    - Não apaga registros anteriores.
    - Cada registro importado recebe project_id e mobile_import_id quando as colunas existirem.
    - Se houver source_local_id, tenta evitar duplicidade no mesmo projeto.
    - Insere somente colunas existentes na tabela, para tolerar mudanças de schema.
    - Atualiza contadores da tabela mobile_imports ao final.
    """

    def __init__(self, db: Session):
        self.db = db
        self.metadata = MetaData()
        self.metadata.reflect(bind=self.db.bind)

    def process_import_file(
        self,
        *,
        project_id: str,
        mobile_import_id: str,
        file_path: str,
    ) -> dict[str, int]:
        path = Path(file_path)

        counters = {
            "total_records": 0,
            "lots_count": 0,
            "seals_count": 0,
            "social_count": 0,
            "physical_count": 0,
            "documents_count": 0,
        }

        try:
            payloads = self._load_payloads(path)

            for payload in payloads:
                counters["lots_count"] += self._process_collection(
                    table_name="lots",
                    records=self._extract_records(
                        payload,
                        [
                            "lots",
                            "lotes",
                            "lotes_preliminares",
                            "lotesPreliminares",
                        ],
                    ),
                    project_id=project_id,
                    mobile_import_id=mobile_import_id,
                    mapper=self._map_lot,
                )

                counters["seals_count"] += self._process_collection(
                    table_name="seals",
                    records=self._extract_records(
                        payload,
                        [
                            "seals",
                            "selagens",
                            "selagem",
                        ],
                    ),
                    project_id=project_id,
                    mobile_import_id=mobile_import_id,
                    mapper=self._map_seal,
                )

                counters["social_count"] += self._process_collection(
                    table_name="social_registrations",
                    records=self._extract_records(
                        payload,
                        [
                            "social_registrations",
                            "cadastros_sociais",
                            "cadastrosSociais",
                            "cadastro_social",
                        ],
                    ),
                    project_id=project_id,
                    mobile_import_id=mobile_import_id,
                    mapper=self._map_social_registration,
                )

                counters["physical_count"] += self._process_collection(
                    table_name="physical_registrations",
                    records=self._extract_records(
                        payload,
                        [
                            "physical_registrations",
                            "cadastros_fisicos",
                            "cadastrosFisicos",
                            "cadastro_fisico",
                        ],
                    ),
                    project_id=project_id,
                    mobile_import_id=mobile_import_id,
                    mapper=self._map_physical_registration,
                )

                counters["documents_count"] += self._process_collection(
                    table_name="documents",
                    records=self._extract_records(
                        payload,
                        [
                            "documents",
                            "documentos",
                            "fotos",
                            "photos",
                            "files",
                            "arquivos",
                        ],
                    ),
                    project_id=project_id,
                    mobile_import_id=mobile_import_id,
                    mapper=self._map_document,
                )

            counters["total_records"] = (
                counters["lots_count"]
                + counters["seals_count"]
                + counters["social_count"]
                + counters["physical_count"]
                + counters["documents_count"]
            )

            self._update_mobile_import(
                mobile_import_id=mobile_import_id,
                status="imported",
                error_message=None,
                counters=counters,
            )

            self.db.commit()
            return counters

        except Exception as exc:
            self.db.rollback()

            self._update_mobile_import(
                mobile_import_id=mobile_import_id,
                status="error",
                error_message=str(exc),
                counters=counters,
            )

            self.db.commit()
            raise

    def _load_payloads(self, path: Path) -> list[dict[str, Any]]:
        if not path.exists():
            raise FileNotFoundError(f"Arquivo não encontrado: {path}")

        suffix = path.suffix.lower()

        if suffix == ".json":
            return [self._load_json_file(path)]

        if suffix == ".zip":
            return self._load_zip_payloads(path)

        raise ValueError("Formato não suportado. Envie arquivo .zip ou .json.")

    def _load_json_file(self, path: Path) -> dict[str, Any]:
        with path.open("r", encoding="utf-8") as file:
            data = json.load(file)

        if not isinstance(data, dict):
            raise ValueError("O JSON principal precisa ser um objeto.")

        return data

    def _load_zip_payloads(self, path: Path) -> list[dict[str, Any]]:
        payloads: list[dict[str, Any]] = []

        with zipfile.ZipFile(path, "r") as zip_file:
            names = zip_file.namelist()

            json_names = [
                name
                for name in names
                if name.lower().endswith(".json") and not name.endswith("/")
            ]

            if not json_names:
                raise ValueError("Nenhum arquivo JSON encontrado dentro do ZIP.")

            for name in json_names:
                with zip_file.open(name) as file:
                    raw = file.read().decode("utf-8")
                    data = json.loads(raw)

                    if isinstance(data, dict):
                        payloads.append(data)

                    elif isinstance(data, list):
                        payloads.append({"records": data, "source_file": name})

        if not payloads:
            raise ValueError("Nenhum payload JSON válido encontrado no ZIP.")

        return payloads

    def _extract_records(
        self,
        payload: dict[str, Any],
        candidate_keys: list[str],
    ) -> list[dict[str, Any]]:
        for key in candidate_keys:
            value = payload.get(key)

            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]

            if isinstance(value, dict):
                nested = value.get("items") or value.get("data") or value.get("records")
                if isinstance(nested, list):
                    return [item for item in nested if isinstance(item, dict)]

        # fallback para JSON do tipo:
        # {"table": "selagens", "records": [...]}
        table = str(payload.get("table") or payload.get("entity") or "").lower()
        records = payload.get("records")

        if isinstance(records, list):
            for key in candidate_keys:
                if key.lower() in table:
                    return [item for item in records if isinstance(item, dict)]

        return []

    def _process_collection(
        self,
        *,
        table_name: str,
        records: list[dict[str, Any]],
        project_id: str,
        mobile_import_id: str,
        mapper,
    ) -> int:
        if not records:
            return 0

        table = self._get_table(table_name)

        if table is None:
            return 0

        inserted_or_updated = 0

        for record in records:
            mapped = mapper(record)

            mapped = self._with_import_metadata(
                table=table,
                data=mapped,
                project_id=project_id,
                mobile_import_id=mobile_import_id,
                source_record=record,
            )

            mapped = self._filter_existing_columns(table, mapped)

            if not mapped:
                continue

            self._upsert_by_source_local_id(
                table=table,
                data=mapped,
                project_id=project_id,
            )

            inserted_or_updated += 1

        return inserted_or_updated

    def _get_table(self, table_name: str) -> Table | None:
        return self.metadata.tables.get(table_name)

    def _with_import_metadata(
        self,
        *,
        table: Table,
        data: dict[str, Any],
        project_id: str,
        mobile_import_id: str,
        source_record: dict[str, Any],
    ) -> dict[str, Any]:
        result = dict(data)

        if "id" in table.columns and not result.get("id"):
            result["id"] = str(uuid.uuid4())

        if "project_id" in table.columns:
            result["project_id"] = project_id

        if "projeto_id" in table.columns:
            result["projeto_id"] = project_id

        if "mobile_import_id" in table.columns:
            result["mobile_import_id"] = mobile_import_id

        source_local_id = (
            source_record.get("id")
            or source_record.get("local_id")
            or source_record.get("source_local_id")
            or source_record.get("uuid")
        )

        if "source_local_id" in table.columns and source_local_id:
            result["source_local_id"] = str(source_local_id)

        source_device_id = (
            source_record.get("device_id")
            or source_record.get("source_device_id")
            or source_record.get("dispositivo_id")
        )

        if "source_device_id" in table.columns and source_device_id:
            result["source_device_id"] = str(source_device_id)

        now = datetime.now(timezone.utc)

        if "created_at" in table.columns and not result.get("created_at"):
            result["created_at"] = now

        if "updated_at" in table.columns:
            result["updated_at"] = now

        if "imported_at" in table.columns:
            result["imported_at"] = now

        return result

    def _filter_existing_columns(
        self,
        table: Table,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        columns = set(table.columns.keys())

        return {
            key: value
            for key, value in data.items()
            if key in columns and value is not None
        }

    def _upsert_by_source_local_id(
        self,
        *,
        table: Table,
        data: dict[str, Any],
        project_id: str,
    ) -> None:
        source_local_id = data.get("source_local_id")

        if (
            source_local_id
            and "source_local_id" in table.columns
            and "project_id" in table.columns
        ):
            existing = self.db.execute(
                select(table.c.id).where(
                    table.c.project_id == project_id,
                    table.c.source_local_id == source_local_id,
                )
            ).first()

            if existing:
                update_data = dict(data)
                update_data.pop("id", None)

                self.db.execute(
                    update(table).where(table.c.id == existing[0]).values(**update_data)
                )
                return

        self.db.execute(insert(table).values(**data))

    def _update_mobile_import(
        self,
        *,
        mobile_import_id: str,
        status: str,
        error_message: str | None,
        counters: dict[str, int],
    ) -> None:
        table = self._get_table("mobile_imports")

        if table is None:
            return

        data: dict[str, Any] = {}

        for key, value in counters.items():
            if key in table.columns:
                data[key] = value

        if "status" in table.columns:
            data["status"] = status

        if "error_message" in table.columns:
            data["error_message"] = error_message

        if "processed_at" in table.columns:
            data["processed_at"] = datetime.now(timezone.utc)

        if "updated_at" in table.columns:
            data["updated_at"] = datetime.now(timezone.utc)

        if not data:
            return

        self.db.execute(
            update(table).where(table.c.id == mobile_import_id).values(**data)
        )

    # -------------------------------------------------------------------------
    # MAPEAMENTOS
    # -------------------------------------------------------------------------

    def _map_lot(self, item: dict[str, Any]) -> dict[str, Any]:
        return {
            "code": self._pick(item, "code", "codigo_lote", "codigo"),
            "codigo_lote": self._pick(item, "codigo_lote", "code", "codigo"),
            "block": self._pick(item, "block", "quadra", "codigo_quadra"),
            "quadra": self._pick(item, "quadra", "block", "codigo_quadra"),
            "area_m2": self._to_float(
                self._pick(item, "area_m2", "area", "area_lote_m2")
            ),
            "perimeter_m": self._to_float(
                self._pick(item, "perimeter_m", "perimetro_m", "perimeter")
            ),
            "perimetro_m": self._to_float(
                self._pick(item, "perimetro_m", "perimeter_m", "perimeter")
            ),
            "status": self._pick(item, "status", "status_lote") or "preliminar",
            "status_lote": self._pick(item, "status_lote", "status") or "preliminar",
            "geometry": self._normalize_geometry(
                self._pick(item, "geometry", "geometria", "geojson")
            ),
            "geometria_geojson": self._geometry_to_text(
                self._pick(
                    item, "geometria_geojson", "geometry", "geometria", "geojson"
                )
            ),
        }

    def _map_seal(self, item: dict[str, Any]) -> dict[str, Any]:
        return {
            "code": self._pick(item, "code", "codigo_selo", "codigo"),
            "codigo_selo": self._pick(item, "codigo_selo", "code", "codigo"),
            "lot_code": self._pick(
                item,
                "lot_code",
                "codigo_lote_preliminar",
                "codigo_lote",
            ),
            "codigo_lote_preliminar": self._pick(
                item,
                "codigo_lote_preliminar",
                "lot_code",
                "codigo_lote",
            ),
            "informant_name": self._pick(
                item,
                "informant_name",
                "nome_informante",
                "nome_responsavel",
            ),
            "nome_informante": self._pick(
                item,
                "nome_informante",
                "informant_name",
                "nome_responsavel",
            ),
            "informant_phone": self._pick(
                item,
                "informant_phone",
                "telefone_informante",
                "telefone",
            ),
            "telefone_informante": self._pick(
                item,
                "telefone_informante",
                "informant_phone",
                "telefone",
            ),
            "address": self._pick(item, "address", "endereco", "referencia"),
            "endereco": self._pick(item, "endereco", "address", "referencia"),
            "geospatial_status": self._pick(
                item,
                "geospatial_status",
                "status_vinculo_geografico",
            ),
            "status_vinculo_geografico": self._pick(
                item,
                "status_vinculo_geografico",
                "geospatial_status",
            ),
            "needs_rtk_validation": self._to_bool(
                self._pick(
                    item,
                    "needs_rtk_validation",
                    "necessita_validacao_rtk",
                )
            ),
            "necessita_validacao_rtk": self._to_bool(
                self._pick(
                    item,
                    "necessita_validacao_rtk",
                    "needs_rtk_validation",
                )
            ),
            "latitude": self._to_float(self._pick(item, "latitude", "lat")),
            "longitude": self._to_float(self._pick(item, "longitude", "lon", "lng")),
        }

    def _map_social_registration(self, item: dict[str, Any]) -> dict[str, Any]:
        return {
            "seal_code": self._pick(item, "seal_code", "codigo_selo"),
            "codigo_selo": self._pick(item, "codigo_selo", "seal_code"),
            "responsible_name": self._pick(
                item,
                "responsible_name",
                "nome_responsavel",
                "nome",
            ),
            "nome_responsavel": self._pick(
                item,
                "nome_responsavel",
                "responsible_name",
                "nome",
            ),
            "cpf": self._pick(item, "cpf", "cpf_responsavel"),
            "cpf_responsavel": self._pick(item, "cpf_responsavel", "cpf"),
            "phone": self._pick(item, "phone", "telefone"),
            "telefone": self._pick(item, "telefone", "phone"),
            "civil_status": self._pick(item, "civil_status", "estado_civil"),
            "estado_civil": self._pick(item, "estado_civil", "civil_status"),
            "family_income": self._to_float(
                self._pick(item, "family_income", "renda_familiar")
            ),
            "renda_familiar": self._to_float(
                self._pick(item, "renda_familiar", "family_income")
            ),
            "residents_count": self._to_int(
                self._pick(item, "residents_count", "quantidade_moradores")
            ),
            "quantidade_moradores": self._to_int(
                self._pick(item, "quantidade_moradores", "residents_count")
            ),
            "social_program": self._pick(item, "social_program", "programa_social"),
            "programa_social": self._pick(item, "programa_social", "social_program"),
            "receives_social_program": self._to_bool(
                self._pick(
                    item,
                    "receives_social_program",
                    "recebe_programa_social",
                )
            ),
            "recebe_programa_social": self._to_bool(
                self._pick(
                    item,
                    "recebe_programa_social",
                    "receives_social_program",
                )
            ),
            "has_conflict": self._to_bool(
                self._pick(item, "has_conflict", "possui_conflito")
            ),
            "possui_conflito": self._to_bool(
                self._pick(item, "possui_conflito", "has_conflict")
            ),
            "occupation_form": self._pick(item, "occupation_form", "forma_ocupacao"),
            "forma_ocupacao": self._pick(item, "forma_ocupacao", "occupation_form"),
        }

    def _map_physical_registration(self, item: dict[str, Any]) -> dict[str, Any]:
        return {
            "seal_code": self._pick(item, "seal_code", "codigo_selo"),
            "codigo_selo": self._pick(item, "codigo_selo", "seal_code"),
            "construction_type": self._pick(
                item,
                "construction_type",
                "tipo_construcao",
            ),
            "tipo_construcao": self._pick(
                item,
                "tipo_construcao",
                "construction_type",
            ),
            "use_type": self._pick(item, "use_type", "tipo_uso"),
            "tipo_uso": self._pick(item, "tipo_uso", "use_type"),
            "rooms_count": self._to_int(
                self._pick(item, "rooms_count", "quantidade_comodos")
            ),
            "quantidade_comodos": self._to_int(
                self._pick(item, "quantidade_comodos", "rooms_count")
            ),
            "bathrooms_count": self._to_int(
                self._pick(item, "bathrooms_count", "quantidade_banheiros")
            ),
            "quantidade_banheiros": self._to_int(
                self._pick(item, "quantidade_banheiros", "bathrooms_count")
            ),
            "built_area_m2": self._to_float(
                self._pick(item, "built_area_m2", "area_construida_m2")
            ),
            "area_construida_m2": self._to_float(
                self._pick(item, "area_construida_m2", "built_area_m2")
            ),
            "has_water": self._to_bool(self._pick(item, "has_water", "possui_agua")),
            "possui_agua": self._to_bool(self._pick(item, "possui_agua", "has_water")),
            "has_energy": self._to_bool(
                self._pick(item, "has_energy", "possui_energia")
            ),
            "possui_energia": self._to_bool(
                self._pick(item, "possui_energia", "has_energy")
            ),
            "sewage_type": self._pick(item, "sewage_type", "tipo_esgotamento"),
            "tipo_esgotamento": self._pick(item, "tipo_esgotamento", "sewage_type"),
            "conservation_status": self._pick(
                item,
                "conservation_status",
                "estado_conservacao",
            ),
            "estado_conservacao": self._pick(
                item,
                "estado_conservacao",
                "conservation_status",
            ),
        }

    def _map_document(self, item: dict[str, Any]) -> dict[str, Any]:
        return {
            "seal_code": self._pick(item, "seal_code", "codigo_selo"),
            "codigo_selo": self._pick(item, "codigo_selo", "seal_code"),
            "document_type": self._pick(
                item,
                "document_type",
                "tipo_documento",
                "type",
            ),
            "tipo_documento": self._pick(
                item,
                "tipo_documento",
                "document_type",
                "type",
            ),
            "filename": self._pick(item, "filename", "nome_arquivo", "file_name"),
            "nome_arquivo": self._pick(item, "nome_arquivo", "filename", "file_name"),
            "file_path": self._pick(item, "file_path", "arquivo_path", "path"),
            "arquivo_path": self._pick(item, "arquivo_path", "file_path", "path"),
            "mime_type": self._pick(item, "mime_type", "content_type"),
        }

    # -------------------------------------------------------------------------
    # HELPERS
    # -------------------------------------------------------------------------

    def _pick(self, data: dict[str, Any], *keys: str) -> Any:
        for key in keys:
            if key in data and data[key] is not None:
                return data[key]
        return None

    def _to_int(self, value: Any) -> int | None:
        if value is None or value == "":
            return None

        try:
            return int(value)
        except Exception:
            return None

    def _to_float(self, value: Any) -> float | None:
        if value is None or value == "":
            return None

        if isinstance(value, (int, float)):
            return float(value)

        try:
            return float(str(value).replace(",", "."))
        except Exception:
            return None

    def _to_bool(self, value: Any) -> bool | None:
        if value is None or value == "":
            return None

        if isinstance(value, bool):
            return value

        text = str(value).strip().lower()

        if text in {"1", "true", "sim", "yes", "y"}:
            return True

        if text in {"0", "false", "nao", "não", "no", "n"}:
            return False

        return None

    def _normalize_geometry(self, value: Any) -> Any:
        if value is None:
            return None

        if isinstance(value, dict):
            return value

        if isinstance(value, str):
            try:
                return json.loads(value)
            except Exception:
                return None

        return None

    def _geometry_to_text(self, value: Any) -> str | None:
        if value is None:
            return None

        if isinstance(value, str):
            return value

        try:
            return json.dumps(value, ensure_ascii=False)
        except Exception:
            return None
