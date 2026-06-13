import shutil
import uuid
import zipfile
from pathlib import Path
from typing import Any
from uuid import UUID

import geopandas as gpd
from geoalchemy2.shape import from_shape
from shapely.geometry import MultiPolygon, mapping
from shapely.ops import transform
from sqlalchemy.orm import Session

from app.models.reurb import Lot, Seal

GEOSPATIAL_STORAGE_DIR = Path("storage/geospatial")


def force_2d_shape(geom):
    if geom is None:
        return None

    return transform(lambda x, y, z=None: (x, y), geom)


def strip_z_from_coordinates(coords):
    if not isinstance(coords, list):
        return coords

    if coords and isinstance(coords[0], (int, float)):
        return coords[:2]

    return [strip_z_from_coordinates(item) for item in coords]


def force_2d_geojson_geometry(geometry: dict | None) -> dict | None:
    if not geometry:
        return None

    geom_type = geometry.get("type")
    coordinates = geometry.get("coordinates")

    if not geom_type or coordinates is None:
        return geometry

    return {
        "type": geom_type,
        "coordinates": strip_z_from_coordinates(coordinates),
    }


def _safe_text(value: Any) -> str | None:
    if value is None:
        return None

    text = str(value).strip()

    if not text or text.lower() in {"nan", "none", "null"}:
        return None

    return text


def _safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None

        text = str(value).strip().replace(",", ".")

        if not text or text.lower() in {"nan", "none", "null"}:
            return None

        return float(text)
    except Exception:
        return None


def _normalize_lot_code(value: Any) -> str | None:
    text = _safe_text(value)

    if not text:
        return None

    text = text.strip()

    if text.endswith(".0"):
        text = text[:-2]

    return text.zfill(2) if text.isdigit() and len(text) <= 2 else text


def _extract_zip(zip_path: Path, target_dir: Path) -> Path:
    target_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(zip_path, "r") as zip_ref:
        zip_ref.extractall(target_dir)

    return target_dir


def _find_shp_file(folder: Path) -> Path | None:
    shp_files = list(folder.rglob("*.shp"))
    return shp_files[0] if shp_files else None


def _load_geodata(file_path: Path) -> gpd.GeoDataFrame:
    suffix = file_path.suffix.lower()

    if suffix == ".zip":
        extracted_dir = file_path.with_suffix("")

        if extracted_dir.exists():
            shutil.rmtree(extracted_dir)

        _extract_zip(file_path, extracted_dir)

        shp_file = _find_shp_file(extracted_dir)

        if shp_file is None:
            raise ValueError("O ZIP enviado não contém arquivo .shp.")

        gdf = gpd.read_file(shp_file)

    elif suffix in {".geojson", ".json", ".kml", ".shp"}:
        gdf = gpd.read_file(file_path)

    else:
        raise ValueError(
            "Formato não suportado. Envie GeoJSON, KML, SHP ou ZIP com Shapefile."
        )

    if gdf.empty:
        raise ValueError("O arquivo geoespacial não possui feições.")

    if gdf.crs is None:
        raise ValueError(
            "O arquivo geoespacial não possui sistema de referência definido. "
            "Informe/garanta o SRC no arquivo, preferencialmente SIRGAS 2000 ou WGS84."
        )

    gdf = gdf.to_crs(epsg=4326)
    gdf = gdf[gdf.geometry.notnull()].copy()

    if gdf.empty:
        raise ValueError("Nenhuma geometria válida encontrada no arquivo.")

    return gdf


def _geometry_to_multipolygon(geom):
    if geom is None or geom.is_empty:
        return None

    if geom.geom_type == "Polygon":
        return MultiPolygon([geom])

    if geom.geom_type == "MultiPolygon":
        return geom

    if geom.geom_type == "GeometryCollection":
        polygons = []

        for item in geom.geoms:
            if item.geom_type == "Polygon":
                polygons.append(item)
            elif item.geom_type == "MultiPolygon":
                polygons.extend(list(item.geoms))

        if polygons:
            return MultiPolygon(polygons)

    return None


def _guess_lot_code(row: Any) -> str | None:
    candidates = [
        "code",
        "codigo",
        "cod_lote",
        "codigo_lote",
        "lote",
        "lot",
        "name",
        "Name",
        "nome",
        "NOME",
        "LOT",
        "LOTE",
        "CODIGO",
        "COD_LOTE",
        "id_lote",
        "ID_LOTE",
    ]

    for field in candidates:
        if field in row:
            value = _normalize_lot_code(row[field])
            if value:
                return value

    return None


def _guess_block(row: Any) -> str | None:
    candidates = [
        "block",
        "quadra",
        "QUADRA",
        "setor",
        "SETOR",
    ]

    for field in candidates:
        if field in row:
            value = _safe_text(row[field])
            if value:
                return value

    return None


def _guess_area_m2(row: Any) -> float | None:
    candidates = [
        "area_m2",
        "AREA_M2",
        "area",
        "AREA",
        "Area",
        "shape_area",
        "SHAPE_AREA",
    ]

    for field in candidates:
        if field in row:
            value = _safe_float(row[field])
            if value is not None and value > 0:
                return value

    return None


def _guess_perimeter_m(row: Any) -> float | None:
    candidates = [
        "perimeter_m",
        "PERIMETRO",
        "perimetro",
        "perimeter",
        "PERIMETER",
        "shape_leng",
        "SHAPE_LENG",
    ]

    for field in candidates:
        if field in row:
            value = _safe_float(row[field])
            if value is not None and value > 0:
                return value

    return None


def _calculate_metric_area_and_perimeter(geom) -> tuple[float | None, float | None]:
    """
    Calcula área e perímetro em metros a partir da geometria EPSG:4326.

    A geometria é reprojetada automaticamente para UTM local estimado,
    evitando cálculo errado em graus.
    """
    try:
        if geom is None or geom.is_empty:
            return None, None

        series = gpd.GeoSeries([geom], crs="EPSG:4326")

        utm_crs = series.estimate_utm_crs()

        if utm_crs is None:
            projected = series.to_crs(epsg=3857)
        else:
            projected = series.to_crs(utm_crs)

        area_m2 = float(projected.area.iloc[0])
        perimeter_m = float(projected.length.iloc[0])

        return round(area_m2, 2), round(perimeter_m, 2)

    except Exception:
        return None, None


def import_lot_geometries_to_project(
    db: Session,
    *,
    project_id: UUID,
    file_path: Path,
    original_filename: str,
) -> dict:
    gdf = _load_geodata(file_path)

    created = 0
    updated = 0
    ignored = 0
    errors: list[dict] = []

    for index, row in gdf.iterrows():
        try:
            raw_geom = row.geometry
            raw_geom = force_2d_shape(raw_geom)

            geom = _geometry_to_multipolygon(raw_geom)

            if geom is None:
                ignored += 1
                errors.append(
                    {
                        "row": int(index),
                        "reason": "Geometria não é Polygon/MultiPolygon.",
                    }
                )
                continue

            geom = force_2d_shape(geom)

            if not geom.is_valid:
                fixed_geom = geom.buffer(0)
                fixed_geom = force_2d_shape(fixed_geom)
                fixed_geom = _geometry_to_multipolygon(fixed_geom)

                if fixed_geom is None or fixed_geom.is_empty:
                    ignored += 1
                    errors.append(
                        {
                            "row": int(index),
                            "reason": "Geometria inválida e não corrigível.",
                        }
                    )
                    continue

                geom = fixed_geom

            lot_code = _guess_lot_code(row)

            if not lot_code:
                lot_code = f"IMP-{index + 1:04d}"

            block = _guess_block(row)

            declared_area_m2 = _guess_area_m2(row)
            declared_perimeter_m = _guess_perimeter_m(row)

            calculated_area_m2, calculated_perimeter_m = (
                _calculate_metric_area_and_perimeter(geom)
            )

            area_m2 = declared_area_m2 or calculated_area_m2
            perimeter_m = declared_perimeter_m or calculated_perimeter_m

            centroid = geom.centroid

            geom_geojson = dict(mapping(geom))
            geom_geojson = force_2d_geojson_geometry(geom_geojson)

            lot = (
                db.query(Lot)
                .filter(
                    Lot.project_id == project_id,
                    Lot.code == lot_code,
                )
                .first()
            )

            if lot is None:
                lot = Lot(
                    project_id=project_id,
                    code=lot_code,
                    block=block,
                    area_m2=area_m2,
                    perimeter_m=perimeter_m,
                    status="preliminar",
                    needs_review=True,
                    source_file=original_filename,
                    notes="Lote importado por arquivo geoespacial.",
                )

                db.add(lot)
                db.flush()
                created += 1
            else:
                updated += 1

            lot.block = block or lot.block
            lot.area_m2 = area_m2
            lot.perimeter_m = perimeter_m

            lot.geom = from_shape(geom, srid=4326)
            lot.geometry_geojson = geom_geojson

            lot.centroid_latitude = centroid.y
            lot.centroid_longitude = centroid.x
            lot.geospatial_source = original_filename

            lot.lot_review_status = "preliminar"
            lot.technical_status = "pendente"
            lot.is_ready_for_technical_documents = False
            lot.needs_review = True

            seals = (
                db.query(Seal)
                .filter(
                    Seal.project_id == project_id,
                    Seal.lot_code == lot_code,
                )
                .all()
            )

            for seal in seals:
                seal.lot_id = lot.id
                seal.geo_link_status = "confirmado"

        except Exception as exc:
            ignored += 1
            errors.append(
                {
                    "row": int(index),
                    "reason": str(exc),
                }
            )

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {
        "created": created,
        "updated": updated,
        "ignored": ignored,
        "errors": errors,
    }


async def save_geospatial_upload(file) -> tuple[Path, str]:
    GEOSPATIAL_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

    original_filename = file.filename or "arquivo_geoespacial"
    suffix = Path(original_filename).suffix.lower()

    upload_id = uuid.uuid4().hex
    target_dir = GEOSPATIAL_STORAGE_DIR / upload_id
    target_dir.mkdir(parents=True, exist_ok=True)

    file_path = target_dir / f"upload{suffix}"

    content = await file.read()
    file_path.write_bytes(content)

    return file_path, original_filename
