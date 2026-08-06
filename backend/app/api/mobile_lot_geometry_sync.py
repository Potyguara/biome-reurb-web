import csv
import io
import json
import zipfile
from datetime import datetime, timezone
from html import escape
from uuid import UUID

import shapefile

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from geoalchemy2.functions import ST_GeomFromGeoJSON, ST_Multi, ST_SetSRID
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.access import ProjectUser
from app.models.lot_geometry import LotGeometry
from app.models.project import Project
from app.models.reurb import Lot, Seal, SocialRegistration
from app.models.user import User
from app.schemas.mobile_lot_geometry_sync import (
    LotGeometryLinkRequest,
    LotGeometryLinkResponse,
    LotGeometryListResponse,
    LotGeometryReviewRequest,
    MobileLotGeometryAcceptedItem,
    MobileLotGeometryConflictItem,
    MobileLotGeometryPullItem,
    MobileLotGeometryPullResponse,
    MobileLotGeometryPushRequest,
    MobileLotGeometryPushResponse,
    MobileLotGeometryRejectedItem,
)

router = APIRouter(tags=["BIOME REURB Geoespacial"])


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
            detail="Projeto REURB não encontrado.",
        )

    if current_user.is_global_admin:
        return project

    link = (
        db.query(ProjectUser)
        .filter(
            ProjectUser.project_id == project_id,
            ProjectUser.user_id == current_user.id,
            ProjectUser.active.is_(True),
        )
        .first()
    )

    if link is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário não possui acesso ativo a este projeto.",
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
        exists = (
            db.query(Lot.id)
            .filter(
                Lot.id == lot_id,
                Lot.project_id == project_id,
            )
            .first()
        )
        if exists is None:
            raise ValueError("O lote informado não pertence ao projeto.")

    if seal_id is not None:
        exists = (
            db.query(Seal.id)
            .filter(
                Seal.id == seal_id,
                Seal.project_id == project_id,
            )
            .first()
        )
        if exists is None:
            raise ValueError("A selagem informada não pertence ao projeto.")

    if social_registration_id is not None:
        exists = (
            db.query(SocialRegistration.id)
            .filter(
                SocialRegistration.id == social_registration_id,
                SocialRegistration.project_id == project_id,
            )
            .first()
        )
        if exists is None:
            raise ValueError("O cadastro social informado não pertence ao projeto.")


def _apply_geometry(record: LotGeometry, geometry_geojson: dict | None) -> None:
    record.geometry_geojson = geometry_geojson

    if geometry_geojson is None:
        record.geom = None
        record.geometry_type = "MultiPolygon"
        return

    record.geometry_type = geometry_geojson.get("type", "MultiPolygon")
    record.geom = ST_SetSRID(
        ST_Multi(ST_GeomFromGeoJSON(json.dumps(geometry_geojson))),
        4326,
    )


def _assert_valid_geometry(db: Session, geometry_id: UUID) -> None:
    result = (
        db.execute(
            text("""
            SELECT
                CASE WHEN geom IS NULL THEN TRUE ELSE ST_IsValid(geom) END AS is_valid,
                CASE WHEN geom IS NULL THEN NULL ELSE ST_IsValidReason(geom) END AS reason
            FROM lot_geometries
            WHERE id = :geometry_id
            """),
            {"geometry_id": geometry_id},
        )
        .mappings()
        .one()
    )

    if not result["is_valid"]:
        raise ValueError(
            f"Geometria inválida: {result['reason'] or 'motivo desconhecido'}."
        )


def _to_pull_item(record: LotGeometry) -> MobileLotGeometryPullItem:
    return MobileLotGeometryPullItem(
        id=record.id,
        project_id=record.project_id,
        lot_id=record.lot_id,
        seal_id=record.seal_id,
        social_registration_id=record.social_registration_id,
        source_local_id=record.source_local_id,
        source_device_id=record.source_device_id,
        origin=record.origin,
        workflow_status=record.workflow_status,
        geometry_geojson=record.geometry_geojson,
        area_m2=record.area_m2,
        perimeter_m=record.perimeter_m,
        geospatial_accuracy_m=record.geospatial_accuracy_m,
        notes=record.notes,
        validation_note=record.validation_note,
        validated_at=record.validated_at,
        validated_by_user_id=record.validated_by_user_id,
        parent_geometry_id=record.parent_geometry_id,
        superseded_by_geometry_id=record.superseded_by_geometry_id,
        version=record.version,
        is_current=record.is_current,
        deleted=record.deleted,
        client_created_at=record.client_created_at,
        client_updated_at=record.client_updated_at,
        server_received_at=record.server_received_at,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def _new_version_from_current(
    *,
    current: LotGeometry,
    now: datetime,
    current_user: User,
) -> LotGeometry:
    next_record = LotGeometry(
        project_id=current.project_id,
        lot_id=current.lot_id,
        seal_id=current.seal_id,
        social_registration_id=current.social_registration_id,
        source_local_id=current.source_local_id,
        source_device_id=current.source_device_id,
        origin=current.origin,
        workflow_status=current.workflow_status,
        geometry_type=current.geometry_type,
        geometry_geojson=current.geometry_geojson,
        geom=current.geom,
        area_m2=current.area_m2,
        perimeter_m=current.perimeter_m,
        geospatial_accuracy_m=current.geospatial_accuracy_m,
        notes=current.notes,
        validation_note=current.validation_note,
        validated_at=current.validated_at,
        created_by_user_id=current_user.id,
        validated_by_user_id=current.validated_by_user_id,
        parent_geometry_id=current.id,
        version=current.version + 1,
        is_current=True,
        client_created_at=current.client_created_at,
        client_updated_at=current.client_updated_at,
        server_received_at=now,
        deleted=current.deleted,
        created_at=now,
        updated_at=now,
    )

    current.is_current = False
    current.updated_at = now

    return next_record


@router.post(
    "/mobile/sync/lot-geometries",
    response_model=MobileLotGeometryPushResponse,
)
def push_mobile_lot_geometries(
    payload: MobileLotGeometryPushRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MobileLotGeometryPushResponse:
    _ensure_project_access(
        db,
        project_id=payload.project_id,
        current_user=current_user,
    )

    accepted: list[MobileLotGeometryAcceptedItem] = []
    rejected: list[MobileLotGeometryRejectedItem] = []
    conflicts: list[MobileLotGeometryConflictItem] = []
    now = _utcnow()

    for item in payload.records:
        savepoint = db.begin_nested()

        try:
            allowed_mobile_origins = {
                "cidadao_declarado",
                "cidadao_vetorizado",
            }

            if item.origin not in allowed_mobile_origins:
                raise ValueError(
                    "O aplicativo móvel não possui permissão para "
                    f"criar geometria com origem '{item.origin}'."
                )
            _validate_references(
                db,
                project_id=payload.project_id,
                lot_id=item.lot_id,
                seal_id=item.seal_id,
                social_registration_id=item.social_registration_id,
            )

            current = (
                db.query(LotGeometry)
                .filter(
                    LotGeometry.project_id == payload.project_id,
                    LotGeometry.source_device_id == item.source_device_id,
                    LotGeometry.source_local_id == item.source_local_id,
                    LotGeometry.is_current.is_(True),
                )
                .with_for_update()
                .first()
            )

            if current is None:
                if item.expected_version not in (None, 1):
                    rejected.append(
                        MobileLotGeometryRejectedItem(
                            source_local_id=item.source_local_id,
                            reason=(
                                "A geometria ainda não existe no servidor, "
                                "mas foi enviada com versão esperada diferente de 1."
                            ),
                        )
                    )
                    savepoint.rollback()
                    continue

                record = LotGeometry(
                    project_id=payload.project_id,
                    source_local_id=item.source_local_id,
                    source_device_id=item.source_device_id,
                    version=1,
                    is_current=True,
                    created_by_user_id=current_user.id,
                    server_received_at=now,
                    created_at=now,
                    updated_at=now,
                )
            else:
                if (
                    item.expected_version is not None
                    and item.expected_version != current.version
                ):
                    conflicts.append(
                        MobileLotGeometryConflictItem(
                            source_local_id=item.source_local_id,
                            server_id=current.id,
                            expected_version=item.expected_version,
                            current_version=current.version,
                            reason="A geometria foi alterada no servidor.",
                        )
                    )
                    savepoint.rollback()
                    continue

                record = _new_version_from_current(
                    current=current,
                    now=now,
                    current_user=current_user,
                )

            record.lot_id = item.lot_id
            record.seal_id = item.seal_id
            record.social_registration_id = item.social_registration_id
            record.origin = item.origin
            record.workflow_status = item.workflow_status
            record.area_m2 = item.area_m2
            record.perimeter_m = item.perimeter_m
            record.geospatial_accuracy_m = item.geospatial_accuracy_m
            record.notes = item.notes
            record.client_created_at = item.client_created_at
            record.client_updated_at = item.client_updated_at
            record.server_received_at = now
            record.deleted = item.deleted
            record.updated_at = now

            _apply_geometry(record, item.geometry_geojson)

            db.add(record)
            db.flush()

            _assert_valid_geometry(db, record.id)

            if current is not None:
                current.superseded_by_geometry_id = record.id

            savepoint.commit()

            accepted.append(
                MobileLotGeometryAcceptedItem(
                    source_local_id=item.source_local_id,
                    server_id=record.id,
                    version=record.version,
                    workflow_status=record.workflow_status,
                    status="deleted" if record.deleted else "synced",
                    server_updated_at=record.updated_at or now,
                )
            )

        except IntegrityError:
            savepoint.rollback()
            rejected.append(
                MobileLotGeometryRejectedItem(
                    source_local_id=item.source_local_id,
                    reason="Conflito de unicidade ao gravar a geometria.",
                )
            )
        except Exception as exc:
            savepoint.rollback()
            rejected.append(
                MobileLotGeometryRejectedItem(
                    source_local_id=item.source_local_id,
                    reason=str(exc),
                )
            )

    db.commit()

    return MobileLotGeometryPushResponse(
        batch_id=payload.batch_id,
        accepted=accepted,
        rejected=rejected,
        conflicts=conflicts,
        server_time=_utcnow(),
    )


@router.get(
    "/mobile/sync/lot-geometries",
    response_model=MobileLotGeometryPullResponse,
)
def pull_mobile_lot_geometries(
    project_id: UUID,
    since: datetime | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=1000),
    include_history: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MobileLotGeometryPullResponse:
    _ensure_project_access(
        db,
        project_id=project_id,
        current_user=current_user,
    )

    query = db.query(LotGeometry).filter(LotGeometry.project_id == project_id)

    if not include_history:
        query = query.filter(LotGeometry.is_current.is_(True))

    if since is not None:
        query = query.filter(LotGeometry.updated_at > since)

    records = query.order_by(LotGeometry.updated_at.asc()).limit(limit).all()

    now = _utcnow()
    next_cursor = records[-1].updated_at if records else (since or now)

    return MobileLotGeometryPullResponse(
        project_id=project_id,
        records=[_to_pull_item(record) for record in records],
        next_cursor=next_cursor,
        server_time=now,
    )


@router.get(
    "/projects/{project_id}/lot-geometries",
    response_model=LotGeometryListResponse,
)
def list_project_lot_geometries(
    project_id: UUID,
    origin: str | None = Query(default=None),
    workflow_status: str | None = Query(default=None),
    include_history: bool = Query(default=False),
    include_deleted: bool = Query(default=False),
    limit: int = Query(default=1000, ge=1, le=5000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LotGeometryListResponse:
    _ensure_project_access(
        db,
        project_id=project_id,
        current_user=current_user,
    )

    query = db.query(LotGeometry).filter(LotGeometry.project_id == project_id)

    if not include_history:
        query = query.filter(LotGeometry.is_current.is_(True))

    if not include_deleted:
        query = query.filter(LotGeometry.deleted.is_(False))

    if origin is not None:
        query = query.filter(LotGeometry.origin == origin)

    if workflow_status is not None:
        query = query.filter(LotGeometry.workflow_status == workflow_status)

    records = (
        query.order_by(
            LotGeometry.updated_at.desc(),
            LotGeometry.version.desc(),
        )
        .limit(limit)
        .all()
    )

    return LotGeometryListResponse(
        project_id=project_id,
        records=[_to_pull_item(record) for record in records],
    )


def _get_exportable_lot_geometry(
    db: Session,
    *,
    project_id: UUID,
    geometry_id: UUID,
) -> LotGeometry:
    geometry = (
        db.query(LotGeometry)
        .filter(
            LotGeometry.id == geometry_id,
            LotGeometry.project_id == project_id,
            LotGeometry.is_current.is_(True),
            LotGeometry.deleted.is_(False),
        )
        .first()
    )

    if geometry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Geometria de campo não encontrada.",
        )

    if geometry.origin not in {
        "cidadao_vetorizado",
        "cidadao_declarado",
    }:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Esta operação é destinada às geometrias levantadas "
                "pelo cidadão em campo."
            ),
        )

    if not geometry.geometry_geojson:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A geometria selecionada não possui dados geoespaciais.",
        )

    return geometry


def _get_geometry_export_context(
    db: Session,
    *,
    project_id: UUID,
    geometry: LotGeometry,
) -> dict:
    lot = None
    seal = None
    social = None

    if geometry.lot_id is not None:
        lot = (
            db.query(Lot)
            .filter(
                Lot.id == geometry.lot_id,
                Lot.project_id == project_id,
            )
            .first()
        )

    if geometry.seal_id is not None:
        seal = (
            db.query(Seal)
            .filter(
                Seal.id == geometry.seal_id,
                Seal.project_id == project_id,
            )
            .first()
        )

    if seal is None and lot is not None:
        seal = (
            db.query(Seal)
            .filter(
                Seal.project_id == project_id,
                Seal.lot_id == lot.id,
            )
            .order_by(Seal.created_at.asc())
            .first()
        )

    if geometry.social_registration_id is not None:
        social = (
            db.query(SocialRegistration)
            .filter(
                SocialRegistration.id == geometry.social_registration_id,
                SocialRegistration.project_id == project_id,
            )
            .first()
        )

    if social is None and seal is not None:
        social = (
            db.query(SocialRegistration)
            .filter(
                SocialRegistration.project_id == project_id,
                SocialRegistration.seal_code == seal.seal_code,
            )
            .first()
        )

    return {
        "lot": lot,
        "seal": seal,
        "social": social,
    }


def _safe_export_filename(value: str | None) -> str:
    if not value:
        return "sem_identificacao"

    normalized = "".join(
        char if char.isalnum() or char in {"-", "_"} else "_" for char in value.strip()
    )

    normalized = "_".join(part for part in normalized.split("_") if part)

    return normalized or "sem_identificacao"


def _geometry_export_basename(
    geometry: LotGeometry,
    context: dict,
) -> str:
    lot = context["lot"]
    seal = context["seal"]
    social = context["social"]

    if social is not None and social.responsible_cpf:
        person_ref = f"CPF_{_safe_export_filename(social.responsible_cpf)}"
    elif seal is not None:
        person_ref = _safe_export_filename(seal.seal_code)
    elif lot is not None:
        person_ref = f"LOTE_{_safe_export_filename(lot.code)}"
    else:
        person_ref = f"GEOM_{str(geometry.id)[:8]}"

    return f"vetorizacao_cidadao_" f"{person_ref}_" f"v{geometry.version}"


def _geometry_properties(
    geometry: LotGeometry,
    context: dict,
) -> dict[str, str | int | float | None]:
    lot = context["lot"]
    seal = context["seal"]
    social = context["social"]

    return {
        "geometry_id": str(geometry.id),
        "project_id": str(geometry.project_id),
        "source_local_id": str(geometry.source_local_id),
        "source_device_id": str(geometry.source_device_id),
        "origin": geometry.origin,
        "workflow_status": geometry.workflow_status,
        "version": geometry.version,
        "lot_id": str(geometry.lot_id) if geometry.lot_id else None,
        "lot_code": lot.code if lot else None,
        "seal_id": str(seal.id) if seal else None,
        "seal_code": seal.seal_code if seal else None,
        "responsible_name": (social.responsible_name if social else None),
        "responsible_cpf": (social.responsible_cpf if social else None),
        "area_m2": geometry.area_m2,
        "perimeter_m": geometry.perimeter_m,
        "accuracy_m": geometry.geospatial_accuracy_m,
        "notes": geometry.notes,
        "validation_note": geometry.validation_note,
        "client_created_at": (
            geometry.client_created_at.isoformat()
            if geometry.client_created_at
            else None
        ),
        "server_received_at": (
            geometry.server_received_at.isoformat()
            if geometry.server_received_at
            else None
        ),
    }


def _geojson_polygon_parts(
    geometry_geojson: dict,
) -> list[list[list[float]]]:
    geometry_type = geometry_geojson.get("type")
    coordinates = geometry_geojson.get("coordinates")

    if geometry_type == "Polygon":
        polygons = [coordinates]
    elif geometry_type == "MultiPolygon":
        polygons = coordinates
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Somente geometrias Polygon ou MultiPolygon "
                "podem ser exportadas nesta etapa."
            ),
        )

    if not isinstance(polygons, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Coordenadas geoespaciais inválidas.",
        )

    parts: list[list[list[float]]] = []

    for polygon in polygons:
        if not isinstance(polygon, list):
            continue

        for ring in polygon:
            if not isinstance(ring, list):
                continue

            normalized_ring: list[list[float]] = []

            for coordinate in ring:
                if isinstance(coordinate, list) and len(coordinate) >= 2:
                    normalized_ring.append(
                        [
                            float(coordinate[0]),
                            float(coordinate[1]),
                        ]
                    )

            if len(normalized_ring) >= 3:
                if normalized_ring[0] != normalized_ring[-1]:
                    normalized_ring.append(normalized_ring[0])

                parts.append(normalized_ring)

    if not parts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A geometria não possui anéis válidos para exportação.",
        )

    return parts


def _kml_coordinates_from_geometry(
    geometry_geojson: dict,
) -> str:
    geometry_type = geometry_geojson.get("type")
    coordinates = geometry_geojson.get("coordinates")

    def ring_coordinates(ring: list) -> str:
        return " ".join(
            f"{float(coord[0])},{float(coord[1])},0"
            for coord in ring
            if isinstance(coord, list) and len(coord) >= 2
        )

    def polygon_xml(polygon: list) -> str:
        if not polygon:
            return ""

        outer = ring_coordinates(polygon[0])

        inner_xml = ""

        for inner_ring in polygon[1:]:
            inner = ring_coordinates(inner_ring)

            inner_xml += f"""
              <innerBoundaryIs>
                <LinearRing>
                  <coordinates>{inner}</coordinates>
                </LinearRing>
              </innerBoundaryIs>
            """

        return f"""
          <Polygon>
            <tessellate>1</tessellate>
            <outerBoundaryIs>
              <LinearRing>
                <coordinates>{outer}</coordinates>
              </LinearRing>
            </outerBoundaryIs>
            {inner_xml}
          </Polygon>
        """

    if geometry_type == "Polygon":
        return polygon_xml(coordinates)

    if geometry_type == "MultiPolygon":
        polygons = "".join(polygon_xml(polygon) for polygon in coordinates)

        return f"""
          <MultiGeometry>
            {polygons}
          </MultiGeometry>
        """

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Geometria incompatível com a exportação KML.",
    )


@router.get(
    "/projects/{project_id}/lot-geometries/{geometry_id}/export/kml",
)
def export_project_lot_geometry_kml(
    project_id: UUID,
    geometry_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    _ensure_project_access(
        db,
        project_id=project_id,
        current_user=current_user,
    )

    geometry = _get_exportable_lot_geometry(
        db,
        project_id=project_id,
        geometry_id=geometry_id,
    )

    context = _get_geometry_export_context(
        db,
        project_id=project_id,
        geometry=geometry,
    )

    properties = _geometry_properties(
        geometry,
        context,
    )

    basename = _geometry_export_basename(
        geometry,
        context,
    )

    extended_data = "\n".join(f"""
        <Data name="{escape(str(key))}">
          <value>{escape("" if value is None else str(value))}</value>
        </Data>
        """ for key, value in properties.items())

    geometry_xml = _kml_coordinates_from_geometry(geometry.geometry_geojson)

    kml = f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>{escape(basename)}</name>

    <Style id="cidadao">
      <LineStyle>
        <color>ffff3399</color>
        <width>4</width>
      </LineStyle>
      <PolyStyle>
        <color>3340a0c0</color>
      </PolyStyle>
    </Style>

    <Placemark>
      <name>{escape(basename)}</name>

      <description>
        Geometria original vetorizada pelo cidadão em campo.
        A exportação não altera nem consolida seus vértices.
      </description>

      <styleUrl>#cidadao</styleUrl>

      <ExtendedData>
        {extended_data}
      </ExtendedData>

      {geometry_xml}
    </Placemark>
  </Document>
</kml>
"""

    return Response(
        content=kml.encode("utf-8"),
        media_type="application/vnd.google-earth.kml+xml",
        headers={
            "Content-Disposition": (f'attachment; filename="{basename}.kml"'),
            "Cache-Control": "no-store",
        },
    )


@router.get(
    "/projects/{project_id}/lot-geometries/{geometry_id}/export/shapefile",
)
def export_project_lot_geometry_shapefile(
    project_id: UUID,
    geometry_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    _ensure_project_access(
        db,
        project_id=project_id,
        current_user=current_user,
    )

    geometry = _get_exportable_lot_geometry(
        db,
        project_id=project_id,
        geometry_id=geometry_id,
    )

    context = _get_geometry_export_context(
        db,
        project_id=project_id,
        geometry=geometry,
    )

    basename = _geometry_export_basename(
        geometry,
        context,
    )

    properties = _geometry_properties(
        geometry,
        context,
    )

    parts = _geojson_polygon_parts(geometry.geometry_geojson)

    shp_buffer = io.BytesIO()
    shx_buffer = io.BytesIO()
    dbf_buffer = io.BytesIO()

    writer = shapefile.Writer(
        shp=shp_buffer,
        shx=shx_buffer,
        dbf=dbf_buffer,
        shapeType=shapefile.POLYGON,
        encoding="utf-8",
    )

    writer.field("GEOM_ID", "C", size=36)
    writer.field("ORIGEM", "C", size=50)
    writer.field("STATUS", "C", size=50)
    writer.field("VERSAO", "N", size=8, decimal=0)
    writer.field("LOTE", "C", size=50)
    writer.field("SELO", "C", size=50)
    writer.field("RESPONS", "C", size=120)
    writer.field("CPF", "C", size=20)
    writer.field("AREA_M2", "F", size=18, decimal=4)
    writer.field("PERIM_M", "F", size=18, decimal=4)
    writer.field("PREC_M", "F", size=18, decimal=4)
    writer.field("SRC_LOCAL", "C", size=36)
    writer.field("SRC_DEV", "C", size=36)

    writer.poly(parts)

    writer.record(
        properties["geometry_id"],
        properties["origin"],
        properties["workflow_status"],
        properties["version"],
        properties["lot_code"] or "",
        properties["seal_code"] or "",
        properties["responsible_name"] or "",
        properties["responsible_cpf"] or "",
        properties["area_m2"] or 0,
        properties["perimeter_m"] or 0,
        properties["accuracy_m"] or 0,
        properties["source_local_id"],
        properties["source_device_id"],
    )

    writer.close()

    prj = (
        'GEOGCS["SIRGAS 2000",'
        'DATUM["Sistema_de_Referencia_Geocentrico_para_las_AmericaS_2000",'
        'SPHEROID["GRS 1980",6378137,298.257222101]],'
        'PRIMEM["Greenwich",0],'
        'UNIT["degree",0.0174532925199433],'
        'AUTHORITY["EPSG","4674"]]'
    )

    metadata_json = json.dumps(
        properties,
        ensure_ascii=False,
        indent=2,
        default=str,
    )

    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(
        zip_buffer,
        mode="w",
        compression=zipfile.ZIP_DEFLATED,
    ) as archive:
        archive.writestr(
            f"{basename}.shp",
            shp_buffer.getvalue(),
        )
        archive.writestr(
            f"{basename}.shx",
            shx_buffer.getvalue(),
        )
        archive.writestr(
            f"{basename}.dbf",
            dbf_buffer.getvalue(),
        )
        archive.writestr(
            f"{basename}.prj",
            prj,
        )
        archive.writestr(
            f"{basename}.cpg",
            "UTF-8",
        )
        archive.writestr(
            f"{basename}_metadados.json",
            metadata_json,
        )

    return Response(
        content=zip_buffer.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": (f'attachment; filename="{basename}_shapefile.zip"'),
            "Cache-Control": "no-store",
        },
    )


@router.get(
    "/projects/{project_id}/lot-geometries/export/field-package",
)
def export_project_citizen_geometry_field_package(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    project = _ensure_project_access(
        db,
        project_id=project_id,
        current_user=current_user,
    )

    current_geometries = (
        db.query(LotGeometry)
        .filter(
            LotGeometry.project_id == project_id,
            LotGeometry.is_current.is_(True),
            LotGeometry.deleted.is_(False),
            LotGeometry.origin.in_(
                [
                    "cidadao_vetorizado",
                    "cidadao_declarado",
                ]
            ),
        )
        .order_by(
            LotGeometry.created_at.asc(),
            LotGeometry.version.asc(),
        )
        .all()
    )

    current_geometries = [item for item in current_geometries if item.geometry_geojson]

    if not current_geometries:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "Não existem geometrias atuais do cidadão "
                "disponíveis para exportação."
            ),
        )

    history = (
        db.query(LotGeometry)
        .filter(
            LotGeometry.project_id == project_id,
            LotGeometry.origin.in_(
                [
                    "cidadao_vetorizado",
                    "cidadao_declarado",
                ]
            ),
        )
        .order_by(
            LotGeometry.source_local_id.asc(),
            LotGeometry.version.asc(),
        )
        .all()
    )

    export_items: list[dict] = []

    for geometry in current_geometries:
        context = _get_geometry_export_context(
            db,
            project_id=project_id,
            geometry=geometry,
        )

        export_items.append(
            {
                "geometry": geometry,
                "context": context,
                "properties": _geometry_properties(
                    geometry,
                    context,
                ),
            }
        )

    # =========================================================
    # GEOJSON
    # =========================================================

    feature_collection = {
        "type": "FeatureCollection",
        "name": "vetorizacoes_cidadao",
        "crs": {
            "type": "name",
            "properties": {
                "name": "urn:ogc:def:crs:EPSG::4674",
            },
        },
        "features": [
            {
                "type": "Feature",
                "id": item["properties"]["geometry_id"],
                "properties": item["properties"],
                "geometry": item["geometry"].geometry_geojson,
            }
            for item in export_items
        ],
    }

    geojson_content = json.dumps(
        feature_collection,
        ensure_ascii=False,
        indent=2,
        default=str,
    )

    # =========================================================
    # KML
    # =========================================================

    kml_placemarks: list[str] = []

    for item in export_items:
        geometry = item["geometry"]
        properties = item["properties"]
        context = item["context"]

        basename = _geometry_export_basename(
            geometry,
            context,
        )

        extended_data = "\n".join(f"""
            <Data name="{escape(str(key))}">
              <value>{escape("" if value is None else str(value))}</value>
            </Data>
            """ for key, value in properties.items())

        geometry_xml = _kml_coordinates_from_geometry(geometry.geometry_geojson)

        kml_placemarks.append(f"""
            <Placemark>
              <name>{escape(basename)}</name>
              <description>
                Geometria original vetorizada pelo cidadão em campo.
                Registro corrente para análise técnica.
              </description>
              <styleUrl>#cidadao</styleUrl>
              <ExtendedData>
                {extended_data}
              </ExtendedData>
              {geometry_xml}
            </Placemark>
            """)

    kml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Vetorizacoes do cidadao - {escape(project.name)}</name>

    <Style id="cidadao">
      <LineStyle>
        <color>ffff3399</color>
        <width>4</width>
      </LineStyle>
      <PolyStyle>
        <color>3340a0c0</color>
      </PolyStyle>
    </Style>

    {''.join(kml_placemarks)}
  </Document>
</kml>
"""

    # =========================================================
    # SHAPEFILE
    # =========================================================

    shp_buffer = io.BytesIO()
    shx_buffer = io.BytesIO()
    dbf_buffer = io.BytesIO()

    writer = shapefile.Writer(
        shp=shp_buffer,
        shx=shx_buffer,
        dbf=dbf_buffer,
        shapeType=shapefile.POLYGON,
        encoding="utf-8",
    )

    writer.field("GEOM_ID", "C", size=36)
    writer.field("ORIGEM", "C", size=50)
    writer.field("STATUS", "C", size=50)
    writer.field("VERSAO", "N", size=8, decimal=0)
    writer.field("LOTE", "C", size=50)
    writer.field("SELO", "C", size=50)
    writer.field("RESPONS", "C", size=120)
    writer.field("CPF", "C", size=20)
    writer.field("AREA_M2", "F", size=18, decimal=4)
    writer.field("PERIM_M", "F", size=18, decimal=4)
    writer.field("PREC_M", "F", size=18, decimal=4)
    writer.field("SRC_LOCAL", "C", size=36)
    writer.field("SRC_DEV", "C", size=36)

    for item in export_items:
        geometry = item["geometry"]
        properties = item["properties"]

        parts = _geojson_polygon_parts(geometry.geometry_geojson)

        writer.poly(parts)

        writer.record(
            properties["geometry_id"],
            properties["origin"],
            properties["workflow_status"],
            properties["version"],
            properties["lot_code"] or "",
            properties["seal_code"] or "",
            properties["responsible_name"] or "",
            properties["responsible_cpf"] or "",
            properties["area_m2"] or 0,
            properties["perimeter_m"] or 0,
            properties["accuracy_m"] or 0,
            properties["source_local_id"],
            properties["source_device_id"],
        )

    writer.close()

    prj_content = (
        'GEOGCS["SIRGAS 2000",'
        'DATUM["Sistema_de_Referencia_Geocentrico_para_las_AmericaS_2000",'
        'SPHEROID["GRS 1980",6378137,298.257222101]],'
        'PRIMEM["Greenwich",0],'
        'UNIT["degree",0.0174532925199433],'
        'AUTHORITY["EPSG","4674"]]'
    )

    # =========================================================
    # CSV DE VÍNCULOS
    # =========================================================

    links_buffer = io.StringIO()

    links_writer = csv.writer(
        links_buffer,
        delimiter=";",
        lineterminator="\n",
    )

    links_writer.writerow(
        [
            "geometry_id",
            "source_local_id",
            "version",
            "origin",
            "workflow_status",
            "lot_id",
            "lot_code",
            "seal_id",
            "seal_code",
            "responsible_name",
            "responsible_cpf",
            "area_m2",
            "perimeter_m",
            "accuracy_m",
        ]
    )

    for item in export_items:
        properties = item["properties"]

        links_writer.writerow(
            [
                properties["geometry_id"],
                properties["source_local_id"],
                properties["version"],
                properties["origin"],
                properties["workflow_status"],
                properties["lot_id"] or "",
                properties["lot_code"] or "",
                properties["seal_id"] or "",
                properties["seal_code"] or "",
                properties["responsible_name"] or "",
                properties["responsible_cpf"] or "",
                properties["area_m2"] or "",
                properties["perimeter_m"] or "",
                properties["accuracy_m"] or "",
            ]
        )

    # =========================================================
    # CSV DE HISTÓRICO / CADEIA DE CUSTÓDIA
    # =========================================================

    history_buffer = io.StringIO()

    history_writer = csv.writer(
        history_buffer,
        delimiter=";",
        lineterminator="\n",
    )

    history_writer.writerow(
        [
            "geometry_id",
            "source_local_id",
            "source_device_id",
            "origin",
            "workflow_status",
            "version",
            "is_current",
            "deleted",
            "lot_id",
            "seal_id",
            "social_registration_id",
            "parent_geometry_id",
            "superseded_by_geometry_id",
            "area_m2",
            "perimeter_m",
            "accuracy_m",
            "client_created_at",
            "client_updated_at",
            "server_received_at",
            "created_at",
            "updated_at",
        ]
    )

    for geometry in history:
        history_writer.writerow(
            [
                str(geometry.id),
                str(geometry.source_local_id),
                str(geometry.source_device_id),
                geometry.origin,
                geometry.workflow_status,
                geometry.version,
                geometry.is_current,
                geometry.deleted,
                str(geometry.lot_id) if geometry.lot_id else "",
                str(geometry.seal_id) if geometry.seal_id else "",
                (
                    str(geometry.social_registration_id)
                    if geometry.social_registration_id
                    else ""
                ),
                (
                    str(geometry.parent_geometry_id)
                    if geometry.parent_geometry_id
                    else ""
                ),
                (
                    str(geometry.superseded_by_geometry_id)
                    if geometry.superseded_by_geometry_id
                    else ""
                ),
                geometry.area_m2 or "",
                geometry.perimeter_m or "",
                geometry.geospatial_accuracy_m or "",
                (
                    geometry.client_created_at.isoformat()
                    if geometry.client_created_at
                    else ""
                ),
                (
                    geometry.client_updated_at.isoformat()
                    if geometry.client_updated_at
                    else ""
                ),
                (
                    geometry.server_received_at.isoformat()
                    if geometry.server_received_at
                    else ""
                ),
                geometry.created_at.isoformat() if geometry.created_at else "",
                geometry.updated_at.isoformat() if geometry.updated_at else "",
            ]
        )

    # =========================================================
    # MANIFEST
    # =========================================================

    linked_count = sum(
        1 for item in export_items if item["geometry"].lot_id is not None
    )

    manifest = {
        "package_type": "BIOME_REURB_FIELD_GEOMETRIES",
        "project_id": str(project.id),
        "project_name": project.name,
        "generated_at": _utcnow().isoformat(),
        "crs": "SIRGAS 2000 / EPSG:4674",
        "current_geometries": len(export_items),
        "linked_geometries": linked_count,
        "unlinked_geometries": (len(export_items) - linked_count),
        "historical_records": len(history),
        "rules": {
            "operational_layer": (
                "is_current=true; deleted=false; "
                "origin=cidadao_vetorizado/cidadao_declarado"
            ),
            "citizen_geometry_is_preserved": True,
            "administrative_link_does_not_modify_vertices": True,
        },
    }

    # =========================================================
    # ZIP FINAL
    # =========================================================

    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(
        zip_buffer,
        mode="w",
        compression=zipfile.ZIP_DEFLATED,
    ) as archive:
        base = "01_VETORIZACOES_CIDADAO"

        archive.writestr(
            f"{base}/vetorizacoes_cidadao.geojson",
            geojson_content.encode("utf-8"),
        )

        archive.writestr(
            f"{base}/vetorizacoes_cidadao.kml",
            kml_content.encode("utf-8"),
        )

        archive.writestr(
            f"{base}/vetorizacoes_cidadao.shp",
            shp_buffer.getvalue(),
        )

        archive.writestr(
            f"{base}/vetorizacoes_cidadao.shx",
            shx_buffer.getvalue(),
        )

        archive.writestr(
            f"{base}/vetorizacoes_cidadao.dbf",
            dbf_buffer.getvalue(),
        )

        archive.writestr(
            f"{base}/vetorizacoes_cidadao.prj",
            prj_content.encode("utf-8"),
        )

        archive.writestr(
            f"{base}/vetorizacoes_cidadao.cpg",
            b"UTF-8",
        )

        archive.writestr(
            "02_VINCULOS/correspondencia_lote_cidadao.csv",
            ("\ufeff" + links_buffer.getvalue()).encode("utf-8"),
        )

        archive.writestr(
            "03_HISTORICO/historico_geometrias.csv",
            ("\ufeff" + history_buffer.getvalue()).encode("utf-8"),
        )

        archive.writestr(
            "04_METADADOS/manifest.json",
            json.dumps(
                manifest,
                ensure_ascii=False,
                indent=2,
                default=str,
            ).encode("utf-8"),
        )

    safe_project = _safe_export_filename(project.name)

    filename = (
        f"pacote_campo_reurb_{safe_project}_" f"{_utcnow().date().isoformat()}.zip"
    )

    return Response(
        content=zip_buffer.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": (f'attachment; filename="{filename}"'),
            "Cache-Control": "no-store",
        },
    )


@router.patch(
    "/projects/{project_id}/lot-geometries/{geometry_id}/link",
    response_model=LotGeometryLinkResponse,
)
def link_project_lot_geometry(
    project_id: UUID,
    geometry_id: UUID,
    payload: LotGeometryLinkRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LotGeometryLinkResponse:
    _ensure_project_access(
        db,
        project_id=project_id,
        current_user=current_user,
    )

    current = (
        db.query(LotGeometry)
        .filter(
            LotGeometry.id == geometry_id,
            LotGeometry.project_id == project_id,
            LotGeometry.is_current.is_(True),
            LotGeometry.deleted.is_(False),
        )
        .with_for_update()
        .first()
    )

    if current is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Geometria de campo não encontrada.",
        )

    lot = None
    seal = None
    social = None

    if payload.lot_id is not None:
        lot = (
            db.query(Lot)
            .filter(
                Lot.id == payload.lot_id,
                Lot.project_id == project_id,
            )
            .first()
        )

        if lot is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="O lote informado não pertence ao projeto.",
            )

        seal = (
            db.query(Seal)
            .filter(
                Seal.project_id == project_id,
                Seal.lot_id == lot.id,
            )
            .order_by(Seal.created_at.asc())
            .first()
        )

        if seal is not None:
            social = (
                db.query(SocialRegistration)
                .filter(
                    SocialRegistration.project_id == project_id,
                    SocialRegistration.seal_code == seal.seal_code,
                )
                .first()
            )

    now = _utcnow()

    linked = _new_version_from_current(
        current=current,
        now=now,
        current_user=current_user,
    )

    linked.lot_id = lot.id if lot else None
    linked.seal_id = seal.id if seal else None
    linked.social_registration_id = social.id if social else None

    # A geometria propriamente dita NÃO é modificada.
    # Apenas seus vínculos administrativos são versionados.
    linked.server_received_at = now
    linked.updated_at = now

    db.add(linked)
    db.flush()

    current.superseded_by_geometry_id = linked.id

    db.commit()
    db.refresh(linked)

    return LotGeometryLinkResponse(
        geometry=_to_pull_item(linked),
        lot_code=lot.code if lot else None,
        seal_code=seal.seal_code if seal else None,
        responsible_name=social.responsible_name if social else None,
    )


def _review_geometry(
    *,
    geometry_id: UUID,
    project_id: UUID,
    workflow_status: str,
    payload: LotGeometryReviewRequest,
    db: Session,
    current_user: User,
) -> MobileLotGeometryPullItem:
    _ensure_project_access(
        db,
        project_id=project_id,
        current_user=current_user,
    )

    current = (
        db.query(LotGeometry)
        .filter(
            LotGeometry.id == geometry_id,
            LotGeometry.project_id == project_id,
            LotGeometry.is_current.is_(True),
        )
        .with_for_update()
        .first()
    )

    if current is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Geometria atual não encontrada.",
        )

    now = _utcnow()
    reviewed = _new_version_from_current(
        current=current,
        now=now,
        current_user=current_user,
    )

    reviewed.workflow_status = workflow_status
    reviewed.validation_note = payload.note
    reviewed.validated_at = now
    reviewed.validated_by_user_id = current_user.id

    db.add(reviewed)
    db.flush()

    current.superseded_by_geometry_id = reviewed.id

    db.commit()
    db.refresh(reviewed)

    return _to_pull_item(reviewed)


@router.post(
    "/projects/{project_id}/lot-geometries/{geometry_id}/validate",
    response_model=MobileLotGeometryPullItem,
)
def validate_project_lot_geometry(
    project_id: UUID,
    geometry_id: UUID,
    payload: LotGeometryReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MobileLotGeometryPullItem:
    return _review_geometry(
        geometry_id=geometry_id,
        project_id=project_id,
        workflow_status="validado",
        payload=payload,
        db=db,
        current_user=current_user,
    )


@router.post(
    "/projects/{project_id}/lot-geometries/{geometry_id}/reject",
    response_model=MobileLotGeometryPullItem,
)
def reject_project_lot_geometry(
    project_id: UUID,
    geometry_id: UUID,
    payload: LotGeometryReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MobileLotGeometryPullItem:
    return _review_geometry(
        geometry_id=geometry_id,
        project_id=project_id,
        workflow_status="rejeitado",
        payload=payload,
        db=db,
        current_user=current_user,
    )
