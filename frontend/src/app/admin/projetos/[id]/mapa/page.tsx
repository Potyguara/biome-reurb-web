"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Download,
  FileText,
  Home,
  Layers,
  Loader2,
  MapPinned,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
  User,
} from "lucide-react";

import { api } from "@/lib/api";

type MapData = {
  project: {
    id: string;
    name: string;
    municipality: string;
    state: string;
    neighborhood: string;
    reurb_type: string;
    status: string;
  };
  summary: {
    total_lots: number;
    ready_lots: number;
    pending_lots: number;
    inconsistent_lots: number;
    lots_without_geometry: number;
    lots_without_seal: number;
    seals_without_lot: number;
  };
  lots: LotMapItem[];
  lot_geometries: LotGeometryMapItem[];

  seals_without_lot: Array<{
    id: string;
    seal_code: string;
    lot_code: string | null;
    latitude: number | null;
    longitude: number | null;
    geo_link_status: string;
    needs_rtk_validation: boolean;
  }>;
};

type LotMapItem = {
  id: string;
  code: string;
  block: string | null;
  area_m2: number | null;
  perimeter_m: number | null;
  status: string;
  needs_review: boolean;

  lot_review_status: string;
  technical_status: string;
  is_ready_for_technical_documents: boolean;
  geometry_geojson: GeoJsonGeometry | null;

  centroid_latitude: number | null;
  centroid_longitude: number | null;
  geospatial_source: string | null;
  geospatial_accuracy_m: number | null;
  revision_notes: string | null;

  seal: {
    id: string;
    seal_code: string;
    lot_code: string | null;
    situation: string;
    geo_link_status: string;
    needs_rtk_validation: boolean;
    geospatial_note: string | null;
    latitude: number | null;
    longitude: number | null;
    gps_accuracy: number | null;
  } | null;

  social: {
    id: string;
    responsible_name: string;
    responsible_cpf: string | null;
    phone: string | null;
    household_members: number | null;
    family_income: number | null;
    has_conflict: boolean;
  } | null;

  physical: {
    id: string;
    property_type: string | null;
    property_use: string | null;
    wall_material: string | null;
    roof_type: string | null;
    floor_type: string | null;
    rooms: number | null;
    bathrooms: number | null;
    has_energy: boolean;
    has_water: boolean;
    has_sewage: boolean;
    has_bathroom: boolean;
    habitability_condition: string | null;
    risk_area: boolean;
    flood_prone: boolean;
  } | null;

  documents_count: number;
  pending_flags: string[];
};

type GeoJsonGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: unknown;
};

type LotGeometryMapItem = {
  id: string;
  project_id: string;

  lot_id: string | null;
  seal_id: string | null;
  social_registration_id: string | null;

  source_local_id: string;
  source_device_id: string;

  origin: string;
  workflow_status: string;

  geometry_type: string;
  geometry_geojson: GeoJsonGeometry | null;

  area_m2: number | null;
  perimeter_m: number | null;
  geospatial_accuracy_m: number | null;

  notes: string | null;
  validation_note: string | null;

  version: number;
  is_current: boolean;
  deleted: boolean;

  client_created_at: string | null;
  client_updated_at: string | null;
  server_received_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ProjectOrthomosaic = {
  id: string;
  project_id: string;
  original_filename: string;
  stored_filename: string;
  file_path: string;
  preview_path: string;
  crs: string | null;
  min_lon: number | null;
  min_lat: number | null;
  max_lon: number | null;
  max_lat: number | null;
  width: number | null;
  height: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
};

type LeafletModule = typeof import("leaflet");

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";

  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function normalizeLabel(value: string | null | undefined) {
  if (!value) return "-";

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusColor(status: string) {
  if (status === "apto") return "#15803d";
  if (status === "em_revisao") return "#ca8a04";
  if (status === "inconsistente") return "#dc2626";
  return "#2563eb";
}

function polygonToLatLngs(geometry: GeoJsonGeometry): unknown {
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    return (geometry.coordinates as number[][][]).map((ring) =>
      ring.map((coord) => [coord[1], coord[0]]),
    );
  }

  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    return (geometry.coordinates as number[][][][]).map((polygon) =>
      polygon.map((ring) => ring.map((coord) => [coord[1], coord[0]])),
    );
  }

  return [];
}

function hasGeometry(lot: LotMapItem) {
  return Boolean(lot.geometry_geojson);
}

function getLotPoint(lot: LotMapItem): [number, number] | null {
  if (lot.centroid_latitude !== null && lot.centroid_longitude !== null) {
    return [lot.centroid_latitude, lot.centroid_longitude];
  }

  if (
    lot.seal?.latitude !== null &&
    lot.seal?.latitude !== undefined &&
    lot.seal?.longitude !== null &&
    lot.seal?.longitude !== undefined
  ) {
    return [lot.seal.latitude, lot.seal.longitude];
  }

  return null;
}

export default function ProjectCoreMapPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const projectId = params.id;

  const mapContainerRef = useRef<HTMLDivElement | null>(null);

  const mapRef = useRef<import("leaflet").Map | null>(null);

  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);

  const citizenGeometryLayerRef = useRef<import("leaflet").LayerGroup | null>(
    null,
  );

  const orthomosaicLayerRef = useRef<import("leaflet").ImageOverlay | null>(
    null,
  );

  const layersControlCreatedRef = useRef(false);

  const [data, setData] = useState<MapData | null>(null);
  const [selectedLot, setSelectedLot] = useState<LotMapItem | null>(null);
  const [selectedCitizenGeometry, setSelectedCitizenGeometry] =
    useState<LotGeometryMapItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingCitizenGeometryLink, setSavingCitizenGeometryLink] =
    useState(false);
  const [error, setError] = useState<string | null>(null);

  const [geospatialFile, setGeospatialFile] = useState<File | null>(null);
  const [importingGeospatial, setImportingGeospatial] = useState(false);
  const [geospatialMessage, setGeospatialMessage] = useState<string | null>(
    null,
  );

  const [orthomosaic, setOrthomosaic] = useState<ProjectOrthomosaic | null>(
    null,
  );
  const [orthomosaicFile, setOrthomosaicFile] = useState<File | null>(null);
  const [orthomosaicBlobUrl, setOrthomosaicBlobUrl] = useState<string | null>(
    null,
  );
  const [importingOrthomosaic, setImportingOrthomosaic] = useState(false);
  const [orthomosaicMessage, setOrthomosaicMessage] = useState<string | null>(
    null,
  );
  const [showOrthomosaic, setShowOrthomosaic] = useState(true);

  const [orthomosaics, setOrthomosaics] = useState<ProjectOrthomosaic[]>([]);
  const [loadingOrthomosaics, setLoadingOrthomosaics] = useState(false);
  const [orthomosaicActionId, setOrthomosaicActionId] = useState<string | null>(
    null,
  );
  const [exportingCitizenGeometry, setExportingCitizenGeometry] = useState<
    "kml" | "shapefile" | null
  >(null);

  async function exportCitizenGeometry(
    geometry: LotGeometryMapItem,
    format: "kml" | "shapefile",
  ) {
    try {
      setExportingCitizenGeometry(format);
      setError(null);

      const endpoint =
        format === "kml"
          ? `/projects/${projectId}/lot-geometries/${geometry.id}/export/kml`
          : `/projects/${projectId}/lot-geometries/${geometry.id}/export/shapefile`;

      const response = await api.get(endpoint, {
        responseType: "blob",
      });

      const contentDisposition =
        response.headers["content-disposition"] ??
        response.headers["Content-Disposition"];

      let filename =
        format === "kml"
          ? `vetorizacao_cidadao_${geometry.id}.kml`
          : `vetorizacao_cidadao_${geometry.id}_shapefile.zip`;

      if (typeof contentDisposition === "string") {
        const match = contentDisposition.match(/filename="?([^";]+)"?/i);

        if (match?.[1]) {
          filename = match[1];
        }
      }

      const contentType =
        format === "kml"
          ? "application/vnd.google-earth.kml+xml"
          : "application/zip";

      const blob = new Blob([response.data], {
        type: contentType,
      });

      const url = URL.createObjectURL(blob);

      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);
    } catch (err: unknown) {
      console.error(err);

      setError(
        format === "kml"
          ? "Não foi possível exportar a vetorização do cidadão em KML."
          : "Não foi possível exportar a vetorização do cidadão em Shapefile.",
      );
    } finally {
      setExportingCitizenGeometry(null);
    }
  }

  async function loadData() {
    try {
      setLoading(true);
      setError(null);

      const response = await api.get<MapData>(`/projects/${projectId}/map`);
      const nextData = response.data;

      setData(nextData);

      setSelectedLot((current) => {
        if (current) {
          const updatedLot = nextData.lots.find((lot) => lot.id === current.id);
          if (updatedLot) return updatedLot;
        }

        return nextData.lots[0] ?? null;
      });
    } catch (err) {
      console.error(err);
      setError("Não foi possível carregar o mapa núcleo do projeto.");
    } finally {
      setLoading(false);
    }
  }

  async function loadOrthomosaic() {
    try {
      const response = await api.get<ProjectOrthomosaic | null>(
        `/projects/${projectId}/orthomosaic`,
      );

      const item = response.data;

      setOrthomosaic(item);

      if (!item) {
        setOrthomosaicBlobUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return null;
        });

        return;
      }

      const previewResponse = await api.get(
        `/projects/${projectId}/orthomosaic/${item.id}/preview.png`,
        {
          responseType: "blob",
        },
      );

      const blob = new Blob([previewResponse.data], {
        type: "image/png",
      });

      const nextUrl = URL.createObjectURL(blob);

      setOrthomosaicBlobUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return nextUrl;
      });
    } catch (err) {
      console.error(err);
      setOrthomosaic(null);

      setOrthomosaicBlobUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
    }
  }

  async function loadOrthomosaics() {
    try {
      setLoadingOrthomosaics(true);

      const response = await api.get<ProjectOrthomosaic[]>(
        `/projects/${projectId}/orthomosaics`,
      );

      setOrthomosaics(response.data ?? []);
    } catch (err) {
      console.error(err);
      setError("Não foi possível carregar os ortomosaicos do projeto.");
    } finally {
      setLoadingOrthomosaics(false);
    }
  }

  async function updateLotStatus(
    lot: LotMapItem,
    reviewStatus: "preliminar" | "em_revisao" | "inconsistente" | "apto",
  ) {
    try {
      setSavingStatus(true);

      await api.patch(`/projects/${projectId}/lots/${lot.id}/review`, {
        lot_review_status: reviewStatus,
        revision_notes:
          reviewStatus === "apto"
            ? "Lote marcado como apto para geração de planta e memorial descritivo."
            : `Lote marcado como ${reviewStatus}.`,
      });

      await loadData();
    } catch (err) {
      console.error(err);
      alert("Não foi possível atualizar o status técnico do lote.");
    } finally {
      setSavingStatus(false);
    }
  }

  async function updateCitizenGeometryLink(
    geometry: LotGeometryMapItem,
    lotId: string | null,
  ) {
    try {
      setSavingCitizenGeometryLink(true);
      setError(null);

      const response = await api.patch(
        `/projects/${projectId}/lot-geometries/${geometry.id}/link`,
        {
          lot_id: lotId,
        },
      );

      const updatedGeometry = response.data.geometry as LotGeometryMapItem;

      setSelectedCitizenGeometry(updatedGeometry);

      if (updatedGeometry.lot_id) {
        const linkedLot =
          data?.lots.find((lot) => lot.id === updatedGeometry.lot_id) ?? null;

        setSelectedLot(linkedLot);
      } else {
        setSelectedLot(null);
      }

      await loadData();
    } catch (err: unknown) {
      console.error(err);

      let message = "Não foi possível atualizar o vínculo da geometria.";

      if (typeof err === "object" && err !== null && "response" in err) {
        const axiosError = err as {
          response?: {
            data?: {
              detail?: string;
            };
          };
        };

        message = axiosError.response?.data?.detail ?? message;
      }

      alert(message);
    } finally {
      setSavingCitizenGeometryLink(false);
    }
  }

  async function importGeospatialLots() {
    if (!geospatialFile) {
      alert(
        "Selecione um arquivo .kml, .geojson, .json ou .zip com Shapefile.",
      );
      return;
    }

    try {
      setImportingGeospatial(true);
      setGeospatialMessage(null);
      setError(null);

      const formData = new FormData();
      formData.append("file", geospatialFile);

      const response = await api.post(
        `/projects/${projectId}/geospatial/lots/import`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );

      const result = response.data;

      setGeospatialMessage(
        `Importação concluída: ${result.created ?? 0} lote(s) criado(s), ${
          result.updated ?? 0
        } atualizado(s), ${result.ignored ?? 0} ignorado(s).`,
      );

      setGeospatialFile(null);

      await loadData();
    } catch (err: unknown) {
      console.error(err);

      let message = "Erro ao importar arquivo geoespacial.";

      if (typeof err === "object" && err !== null && "response" in err) {
        const axiosError = err as {
          response?: {
            data?: {
              detail?: string;
            };
          };
        };

        message = axiosError.response?.data?.detail ?? message;
      }

      setError(message);
    } finally {
      setImportingGeospatial(false);
    }
  }

  async function importOrthomosaic() {
    if (!orthomosaicFile) {
      alert(
        "Selecione um arquivo GeoTIFF do ortomosaico: .tif, .tiff ou .geotiff.",
      );
      return;
    }

    try {
      setImportingOrthomosaic(true);
      setOrthomosaicMessage(null);
      setError(null);

      const formData = new FormData();
      formData.append("file", orthomosaicFile);

      const response = await api.post(
        `/projects/${projectId}/orthomosaic/upload`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );

      const result = response.data;

      setOrthomosaicMessage(
        result.message ?? "Ortomosaico importado com sucesso.",
      );

      setOrthomosaicFile(null);
      setShowOrthomosaic(true);

      await loadOrthomosaic();
      await loadOrthomosaics();
    } catch (err: unknown) {
      let message = "Erro ao importar ortomosaico.";

      if (typeof err === "object" && err !== null && "response" in err) {
        const axiosError = err as {
          response?: {
            data?: {
              detail?: string;
            };
          };
        };

        message = axiosError.response?.data?.detail ?? message;
      }

      setError(message);
    } finally {
      setImportingOrthomosaic(false);
    }
  }

  async function activateOrthomosaic(orthomosaicId: string) {
    try {
      setOrthomosaicActionId(orthomosaicId);
      setError(null);
      setOrthomosaicMessage(null);

      await api.patch(
        `/projects/${projectId}/orthomosaics/${orthomosaicId}/activate`,
      );

      setShowOrthomosaic(true);

      await loadOrthomosaic();
      await loadOrthomosaics();
      await loadData();

      setOrthomosaicMessage("Ortomosaico definido como ativo.");
    } catch (err) {
      console.error(err);
      setError("Não foi possível ativar o ortomosaico selecionado.");
    } finally {
      setOrthomosaicActionId(null);
    }
  }

  async function deleteOrthomosaic(item: ProjectOrthomosaic) {
    const confirmed = window.confirm(
      `Deseja excluir o ortomosaico "${item.original_filename}"?\n\nEssa ação apagará o registro e os arquivos gerados no backend.`,
    );

    if (!confirmed) return;

    try {
      setOrthomosaicActionId(item.id);
      setError(null);
      setOrthomosaicMessage(null);

      await api.delete(`/projects/${projectId}/orthomosaics/${item.id}`);

      await loadOrthomosaic();
      await loadOrthomosaics();
      await loadData();

      setOrthomosaicMessage("Ortomosaico excluído com sucesso.");
    } catch (err) {
      console.error(err);
      setError("Não foi possível excluir o ortomosaico selecionado.");
    } finally {
      setOrthomosaicActionId(null);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
      void loadOrthomosaic();
      void loadOrthomosaics();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    return () => {
      if (orthomosaicLayerRef.current) {
        orthomosaicLayerRef.current.remove();
        orthomosaicLayerRef.current = null;
      }

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;

        layerRef.current = null;
        citizenGeometryLayerRef.current = null;

        layersControlCreatedRef.current = false;
      }
    };
  }, []);

  useEffect(() => {
    if (!data || !mapContainerRef.current) return;

    const mapData = data;
    let cancelled = false;

    async function drawMap() {
      const L: LeafletModule = await import("leaflet");

      if (cancelled || !mapContainerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(mapContainerRef.current, {
          center: [0.034, -51.069],
          zoom: 15,
          zoomControl: true,
          preferCanvas: true,
        });

        const claroTecnico = L.tileLayer(
          "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
          {
            subdomains: "abcd",
            maxZoom: 22,
            attribution: "&copy; OpenStreetMap &copy; CARTO",
          },
        );

        const mapaPadrao = L.tileLayer(
          "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
          {
            subdomains: "abc",
            maxZoom: 20,
            attribution: "&copy; OpenStreetMap Humanitarian",
          },
        );

        const satelite = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            maxZoom: 22,
            attribution: "Tiles &copy; Esri",
          },
        );

        const hibridoReferencia = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          {
            maxZoom: 22,
            attribution: "Labels &copy; Esri",
          },
        );

        claroTecnico.addTo(mapRef.current);

        /*
         * Camada da geometria técnica/oficial.
         *
         * Aqui permanecem os lotes provenientes da base cartográfica,
         * importações georreferenciadas e geometrias consolidadas no
         * cadastro principal de lotes.
         */
        layerRef.current = L.layerGroup().addTo(mapRef.current);

        /*
         * Camada independente das geometrias produzidas durante
         * a vetorização assistida realizada pelo cidadão/morador.
         *
         * Ela não substitui a geometria técnica do lote.
         */
        citizenGeometryLayerRef.current = L.layerGroup().addTo(mapRef.current);

        if (!layersControlCreatedRef.current) {
          L.control
            .layers(
              {
                "Claro técnico": claroTecnico,
                "Mapa padrão": mapaPadrao,
                Satélite: satelite,
              },
              {
                "Lotes técnicos / base cartográfica": layerRef.current,
                "Vetorização do cidadão": citizenGeometryLayerRef.current,
                "Referências / nomes": hibridoReferencia,
              },
              {
                collapsed: false,
                position: "topright",
              },
            )
            .addTo(mapRef.current);

          layersControlCreatedRef.current = true;
        }
      }

      const map = mapRef.current;
      const layer = layerRef.current;
      const citizenLayer = citizenGeometryLayerRef.current;

      if (!map || !layer || !citizenLayer) return;

      layer.clearLayers();
      citizenLayer.clearLayers();

      const bounds = L.latLngBounds([]);

      if (orthomosaicLayerRef.current) {
        orthomosaicLayerRef.current.remove();
        orthomosaicLayerRef.current = null;
      }

      if (
        showOrthomosaic &&
        orthomosaic &&
        orthomosaicBlobUrl &&
        orthomosaic.min_lat !== null &&
        orthomosaic.min_lon !== null &&
        orthomosaic.max_lat !== null &&
        orthomosaic.max_lon !== null
      ) {
        const imageBounds: L.LatLngBoundsExpression = [
          [orthomosaic.min_lat, orthomosaic.min_lon],
          [orthomosaic.max_lat, orthomosaic.max_lon],
        ];

        const overlay = L.imageOverlay(orthomosaicBlobUrl, imageBounds, {
          opacity: 0.85,
          interactive: false,
        });

        overlay.addTo(map);
        overlay.bringToBack();

        orthomosaicLayerRef.current = overlay;

        bounds.extend(imageBounds);
      }

      for (const lot of mapData.lots) {
        const color = statusColor(lot.lot_review_status);
        const isLinkedToSelectedCitizenGeometry =
          selectedCitizenGeometry?.lot_id === lot.id;

        if (lot.geometry_geojson) {
          const polygon = L.polygon(
            polygonToLatLngs(lot.geometry_geojson) as L.LatLngExpression[][],
            {
              color,
              weight:
                isLinkedToSelectedCitizenGeometry || selectedLot?.id === lot.id
                  ? 5
                  : 2,
              fillColor: color,
              fillOpacity:
                isLinkedToSelectedCitizenGeometry || selectedLot?.id === lot.id
                  ? 0.38
                  : 0.18,
            },
          );

          polygon.bindTooltip(`Lote ${lot.code}`, {
            permanent: true,
            direction: "center",
            className: "lot-label",
          });

          polygon.on("click", () => {
            setSelectedCitizenGeometry(null);
            setSelectedLot(lot);
          });
          polygon.addTo(layer);

          bounds.extend(polygon.getBounds());
        } else {
          const point = getLotPoint(lot);

          if (point) {
            const marker = L.circleMarker(point, {
              radius: selectedLot?.id === lot.id ? 11 : 8,
              color,
              fillColor: color,
              fillOpacity: 0.85,
              weight:
                isLinkedToSelectedCitizenGeometry || selectedLot?.id === lot.id
                  ? 5
                  : 2,
            });

            marker.bindTooltip(`Lote ${lot.code}`, {
              permanent: true,
              direction: "top",
            });

            marker.on("click", () => {
              setSelectedCitizenGeometry(null);
              setSelectedLot(lot);
            });
            marker.addTo(layer);

            bounds.extend(point);
          }
        }

        const seal = lot.seal;

        if (
          seal?.latitude !== null &&
          seal?.latitude !== undefined &&
          seal?.longitude !== null &&
          seal?.longitude !== undefined
        ) {
          const sealPoint: [number, number] = [seal.latitude, seal.longitude];

          const sealMarker = L.circleMarker(sealPoint, {
            radius: 5,
            color: "#111827",
            fillColor: "#ffffff",
            fillOpacity: 1,
            weight: 2,
          });

          sealMarker.bindTooltip(seal.seal_code);
          sealMarker.on("click", () => setSelectedLot(lot));
          sealMarker.addTo(layer);

          bounds.extend(sealPoint);
        }
      }

      /*
       * ============================================================
       * VETORIZAÇÕES PRODUZIDAS PELO CIDADÃO / MORADOR
       * ============================================================
       *
       * Essas geometrias permanecem independentes dos lotes oficiais.
       * Isso permite ao analista comparar:
       *
       *   - geometria técnica/base cartográfica;
       *   - geometria desenhada em campo pelo cidadão;
       *
       * sem sobrescrever nenhuma das duas.
       */
      for (const geometry of mapData.lot_geometries ?? []) {
        if (geometry.deleted || !geometry.is_current) {
          continue;
        }

        if (geometry.origin !== "cidadao_vetorizado") {
          continue;
        }

        if (!geometry.geometry_geojson) {
          continue;
        }

        const latLngs = polygonToLatLngs(geometry.geometry_geojson);

        if (!Array.isArray(latLngs) || latLngs.length === 0) {
          continue;
        }

        const polygon = L.polygon(
          latLngs as L.LatLngExpression[][] | L.LatLngExpression[][][],
          {
            /*
             * Magenta/roxo para não confundir com:
             *
             * azul   = lote preliminar/técnico
             * verde  = apto
             * amarelo = revisão
             * vermelho = inconsistência
             */
            color: "#9333ea",
            weight: 4,

            fillColor: "#c084fc",
            fillOpacity: 0.16,

            /*
             * Linha tracejada deixa visualmente claro que esta
             * ainda não é a geometria técnica consolidada.
             */
            dashArray: "10 7",
          },
        );

        polygon.on("click", () => {
          setSelectedCitizenGeometry(geometry);

          if (geometry.lot_id) {
            const linkedLot =
              mapData.lots.find((lot) => lot.id === geometry.lot_id) ?? null;

            setSelectedLot(linkedLot);
          } else {
            setSelectedLot(null);
          }
        });

        const area =
          geometry.area_m2 !== null
            ? `${formatNumber(geometry.area_m2)} m²`
            : "Área não informada";

        const perimeter =
          geometry.perimeter_m !== null
            ? `${formatNumber(geometry.perimeter_m)} m`
            : "Perímetro não informado";

        const status = normalizeLabel(geometry.workflow_status);

        polygon.bindTooltip(
          [
            "Vetorização do cidadão",
            `Área: ${area}`,
            `Perímetro: ${perimeter}`,
            `Status: ${status}`,
            geometry.lot_id
              ? "Vinculada a lote técnico"
              : "Sem vínculo técnico",
          ].join("<br>"),
          {
            sticky: true,
            direction: "top",
          },
        );

        polygon.bindPopup(
          `
      <div style="min-width:220px">
        <strong style="font-size:14px">
          Vetorização do cidadão
        </strong>

        <div style="margin-top:8px">
          <strong>Status:</strong> ${status}
        </div>

        <div>
          <strong>Área:</strong> ${area}
        </div>

        <div>
          <strong>Perímetro:</strong> ${perimeter}
        </div>

        <div>
          <strong>Origem:</strong>
          ${normalizeLabel(geometry.origin)}
        </div>

        ${
          geometry.geospatial_accuracy_m !== null
            ? `
              <div>
                <strong>Precisão:</strong>
                ${formatNumber(geometry.geospatial_accuracy_m)} m
              </div>
            `
            : ""
        }

        ${
          geometry.validation_note
            ? `
              <div style="margin-top:6px">
                <strong>Observação:</strong>
                ${geometry.validation_note}
              </div>
            `
            : ""
        }
      </div>
    `,
        );

        polygon.addTo(citizenLayer);

        const polygonBounds = polygon.getBounds();

        if (polygonBounds.isValid()) {
          bounds.extend(polygonBounds);
        }
      }

      for (const seal of mapData.seals_without_lot) {
        if (seal.latitude !== null && seal.longitude !== null) {
          const sealPoint: [number, number] = [seal.latitude, seal.longitude];

          const marker = L.circleMarker(sealPoint, {
            radius: 7,
            color: "#dc2626",
            fillColor: "#fecaca",
            fillOpacity: 0.9,
            weight: 2,
          });

          marker.bindTooltip(`${seal.seal_code} sem lote`);
          marker.addTo(layer);

          bounds.extend(sealPoint);
        }
      }

      requestAnimationFrame(() => {
        map.invalidateSize();

        if (bounds.isValid()) {
          map.fitBounds(bounds, {
            padding: [40, 40],
            maxZoom: 20,
          });
        } else {
          map.setView([0.034, -51.069], 15);
        }
      });

      setTimeout(() => {
        map.invalidateSize();
      }, 350);
    }

    drawMap();

    return () => {
      cancelled = true;
    };
  }, [
    data,
    selectedLot,
    selectedCitizenGeometry,
    orthomosaic,
    orthomosaicBlobUrl,
    showOrthomosaic,
  ]);

  const filteredStatus = useMemo(() => {
    if (!data) return [];

    return [
      {
        label: "Total de lotes",
        value: data.summary.total_lots,
        icon: Layers,
      },
      {
        label: "Aptos",
        value: data.summary.ready_lots,
        icon: BadgeCheck,
      },
      {
        label: "Pendentes",
        value: data.summary.pending_lots,
        icon: AlertTriangle,
      },
      {
        label: "Sem geometria",
        value: data.summary.lots_without_geometry,
        icon: MapPinned,
      },
    ];
  }, [data]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6">
          <button
            type="button"
            onClick={() => router.push(`/admin/projetos/${projectId}`)}
            className="inline-flex w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao projeto
          </button>

          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.45em] text-green-700">
                Mapa Núcleo REURB
              </p>

              <h1 className="mt-3 text-4xl font-black tracking-tight">
                {data?.project.name ?? "Projeto REURB"}
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Visualização geral e individual dos lotes do núcleo. Esta tela é
                usada para conferência, retificação e marcação dos lotes aptos
                para planta e memorial descritivo.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                loadData();
                loadOrthomosaic();
                loadOrthomosaics();
              }}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-6">
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {loading && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando mapa núcleo...
          </div>
        )}

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          {filteredStatus.map((item) => (
            <div
              key={item.label}
              className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm"
            >
              <item.icon className="h-7 w-7 text-green-700" />
              <p className="mt-4 text-sm font-bold text-slate-500">
                {item.label}
              </p>
              <p className="mt-1 text-3xl font-black">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="mb-6 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-50 text-green-800">
                  <UploadCloud className="h-6 w-6" />
                </div>

                <div>
                  <h2 className="text-lg font-black text-slate-950">
                    Importar lotes georreferenciados
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Envie KML, GeoJSON ou ZIP contendo Shapefile para vincular
                    os polígonos aos lotes/selagens do projeto.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100">
                <input
                  type="file"
                  accept=".kml,.geojson,.json,.zip,.shp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setGeospatialFile(file);
                    setGeospatialMessage(null);
                  }}
                />

                {geospatialFile ? geospatialFile.name : "Selecionar arquivo"}
              </label>

              <button
                type="button"
                disabled={!geospatialFile || importingGeospatial}
                onClick={importGeospatialLots}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-green-800 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importingGeospatial ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UploadCloud className="h-4 w-4" />
                )}
                Importar lotes
              </button>
            </div>
          </div>

          {geospatialMessage && (
            <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-800">
              {geospatialMessage}
            </div>
          )}
        </div>

        <div className="mb-6 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-800">
                  <MapPinned className="h-6 w-6" />
                </div>

                <div>
                  <h2 className="text-lg font-black text-slate-950">
                    Importar ortomosaico drone
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Envie um GeoTIFF/COG georreferenciado para exibir o
                    ortomosaico como camada raster no mapa núcleo. O arquivo
                    deve possuir CRS válido reconhecido pelo GDAL. Para
                    Macapá/AP, recomenda-se SIRGAS 2000 EPSG:4674, SIRGAS 2000 /
                    UTM 22N EPSG:31976, SIRGAS 2000 / UTM 22S EPSG:31982, WGS84
                    EPSG:4326, WGS84 / UTM 22N EPSG:32622 ou WGS84 / UTM 22S
                    EPSG:32722.
                  </p>

                  {orthomosaic && (
                    <p className="mt-2 text-xs font-bold text-green-700">
                      Ortomosaico ativo: {orthomosaic.original_filename} ·{" "}
                      {orthomosaic.width ?? "-"} x {orthomosaic.height ?? "-"}{" "}
                      px
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {orthomosaic && (
                <label className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={showOrthomosaic}
                    onChange={(event) =>
                      setShowOrthomosaic(event.target.checked)
                    }
                  />
                  Mostrar ortomosaico
                </label>
              )}

              <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100">
                <input
                  type="file"
                  accept=".tif,.tiff,.geotiff"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setOrthomosaicFile(file);
                    setOrthomosaicMessage(null);
                  }}
                />

                {orthomosaicFile ? orthomosaicFile.name : "Selecionar GeoTIFF"}
              </label>

              <button
                type="button"
                disabled={!orthomosaicFile || importingOrthomosaic}
                onClick={importOrthomosaic}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-800 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importingOrthomosaic ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UploadCloud className="h-4 w-4" />
                )}
                Importar ortomosaico
              </button>
            </div>
          </div>

          {orthomosaicMessage && (
            <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-800">
              {orthomosaicMessage}
            </div>
          )}
        </div>

        <div className="mb-6 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-950">
                Ortomosaicos importados
              </h2>

              <p className="mt-1 text-sm leading-6 text-slate-600">
                Gerencie os ortomosaicos enviados para este projeto. Apenas um
                ortomosaico fica ativo como camada raster no mapa núcleo.
              </p>
            </div>

            <button
              type="button"
              onClick={loadOrthomosaics}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar lista
            </button>
          </div>

          {loadingOrthomosaics ? (
            <div className="mt-5 flex items-center gap-3 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando ortomosaicos...
            </div>
          ) : orthomosaics.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-semibold text-slate-500">
              Nenhum ortomosaico importado para este projeto.
            </div>
          ) : (
            <div className="mt-5 grid gap-3">
              {orthomosaics.map((item) => {
                const busy = orthomosaicActionId === item.id;

                return (
                  <div
                    key={item.id}
                    className="grid gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 md:grid-cols-[1fr_auto] md:items-center"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black text-slate-950">
                          {item.original_filename}
                        </p>

                        {item.is_active ? (
                          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-black text-green-800">
                            Ativo
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-black text-slate-700">
                            Inativo
                          </span>
                        )}
                      </div>

                      <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                        CRS: {item.crs || "-"} · Dimensão: {item.width || "-"} x{" "}
                        {item.height || "-"} px · Enviado em:{" "}
                        {item.created_at
                          ? new Date(item.created_at).toLocaleString("pt-BR")
                          : "-"}
                      </p>

                      <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                        BBOX: {item.min_lon ?? "-"}, {item.min_lat ?? "-"} /{" "}
                        {item.max_lon ?? "-"}, {item.max_lat ?? "-"}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 md:justify-end">
                      {!item.is_active && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => activateOrthomosaic(item.id)}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 py-2 text-xs font-black text-white transition hover:bg-blue-800 disabled:opacity-60"
                        >
                          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                          Ativar
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => deleteOrthomosaic(item)}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white px-4 py-2 text-xs font-black text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                      >
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                        Excluir
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-3 shadow-sm">
            <div
              ref={mapContainerRef}
              style={{
                height: "620px",
                width: "100%",
                borderRadius: "24px",
                overflow: "hidden",
                background: "#f1f5f9",
              }}
            />
          </section>

          <aside className="max-h-[620px] overflow-y-auto rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            {selectedCitizenGeometry ? (
              <CitizenGeometryDetailsPanel
                geometry={selectedCitizenGeometry}
                lots={data?.lots ?? []}
                savingLink={savingCitizenGeometryLink}
                exporting={exportingCitizenGeometry}
                onLinkChange={(lotId) =>
                  updateCitizenGeometryLink(selectedCitizenGeometry, lotId)
                }
                onExport={(format) =>
                  exportCitizenGeometry(selectedCitizenGeometry, format)
                }
              />
            ) : selectedLot ? (
              <LotDetailsPanel
                lot={selectedLot}
                saving={savingStatus}
                onStatusChange={(status) =>
                  updateLotStatus(selectedLot, status)
                }
              />
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
                <MapPinned className="mx-auto h-12 w-12 text-slate-400" />

                <h2 className="mt-4 text-lg font-black text-slate-800">
                  Nenhuma geometria selecionada
                </h2>

                <p className="mt-2 text-sm text-slate-500">
                  Clique em um lote técnico ou em uma vetorização de campo para
                  visualizar os detalhes.
                </p>
              </div>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}

function CitizenGeometryDetailsPanel({
  geometry,
  lots,
  savingLink,
  exporting,
  onLinkChange,
  onExport,
}: {
  geometry: LotGeometryMapItem;
  lots: LotMapItem[];
  savingLink: boolean;
  exporting: "kml" | "shapefile" | null;
  onLinkChange: (lotId: string | null) => void;
  onExport: (format: "kml" | "shapefile") => void;
}) {
  const linkedLot =
    geometry.lot_id !== null
      ? (lots.find((lot) => lot.id === geometry.lot_id) ?? null)
      : null;

  const linkedSeal = linkedLot?.seal ?? null;
  const linkedSocial = linkedLot?.social ?? null;

  const [selectedLotId, setSelectedLotId] = useState<string>(
    geometry.lot_id ?? "",
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSelectedLotId(geometry.lot_id ?? "");
    }, 0);

    return () => window.clearTimeout(timer);
  }, [geometry.id, geometry.lot_id]);

  const collectionDate =
    geometry.client_created_at ??
    geometry.server_received_at ??
    geometry.created_at;

  const hasChangedLink = selectedLotId !== (geometry.lot_id ?? "");

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-purple-700">
            Vetorização de campo
          </p>

          <h2 className="mt-2 text-2xl font-black text-slate-950">
            Geometria do cidadão
          </h2>

          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
            Evidência geoespacial original levantada em campo. O vínculo com um
            lote técnico não modifica esta geometria.
          </p>
        </div>

        <span className="shrink-0 rounded-full bg-purple-100 px-3 py-1 text-xs font-black text-purple-800">
          {normalizeLabel(geometry.workflow_status)}
        </span>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <InfoCard
          title="Área"
          value={
            geometry.area_m2 !== null
              ? `${formatNumber(geometry.area_m2)} m²`
              : "-"
          }
        />

        <InfoCard
          title="Perímetro"
          value={
            geometry.perimeter_m !== null
              ? `${formatNumber(geometry.perimeter_m)} m`
              : "-"
          }
        />

        <InfoCard
          title="Precisão"
          value={
            geometry.geospatial_accuracy_m !== null
              ? `${formatNumber(geometry.geospatial_accuracy_m)} m`
              : "-"
          }
        />

        <InfoCard title="Versão" value={String(geometry.version)} />
      </div>

      <section className="mt-5 rounded-3xl border border-purple-100 bg-purple-50 p-5">
        <h3 className="font-black text-purple-950">
          Identificação da evidência
        </h3>

        <div className="mt-4 space-y-2 text-sm font-semibold text-slate-600">
          <p>
            Origem:{" "}
            <span className="text-slate-950">
              {normalizeLabel(geometry.origin)}
            </span>
          </p>

          <p>
            Status:{" "}
            <span className="text-slate-950">
              {normalizeLabel(geometry.workflow_status)}
            </span>
          </p>

          <p>
            Coleta:{" "}
            <span className="text-slate-950">
              {collectionDate
                ? new Date(collectionDate).toLocaleString("pt-BR")
                : "-"}
            </span>
          </p>

          <p className="break-all">
            ID local:{" "}
            <span className="text-slate-950">{geometry.source_local_id}</span>
          </p>

          <p className="break-all">
            Dispositivo:{" "}
            <span className="text-slate-950">{geometry.source_device_id}</span>
          </p>
        </div>

        <section className="mt-5 rounded-3xl border border-purple-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-purple-100 text-purple-700">
              <Download className="h-5 w-5" />
            </div>

            <div>
              <h3 className="font-black text-slate-950">
                Exportação da evidência de campo
              </h3>

              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                Exporte exclusivamente esta vetorização original para
                conferência, sobreposição e análise em software SIG.
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-purple-100 bg-purple-50 p-4">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-purple-800">
              <ShieldCheck className="h-4 w-4" />
              Geometria de campo preservada
            </div>

            <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">
              A exportação mantém os vértices levantados pelo cidadão. O vínculo
              com lote técnico, selagem ou cadastro social não modifica a
              geometria original.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600">
                SIRGAS 2000
              </span>

              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600">
                EPSG:4674
              </span>

              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600">
                Versão {geometry.version}
              </span>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => onExport("kml")}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-purple-700 px-4 py-3 text-sm font-black text-white transition hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exporting === "kml" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Exportar KML
            </button>

            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => onExport("shapefile")}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm font-black text-purple-800 transition hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exporting === "shapefile" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Exportar SHP
            </button>
          </div>

          <p className="mt-3 text-[11px] font-semibold leading-5 text-slate-400">
            O Shapefile será baixado em arquivo ZIP contendo SHP, SHX, DBF, PRJ,
            CPG e metadados JSON da evidência.
          </p>
        </section>

        {geometry.notes && (
          <div className="mt-4 rounded-2xl bg-white/80 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-purple-700">
              Observação de campo
            </p>

            <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
              {geometry.notes}
            </p>
          </div>
        )}

        {geometry.validation_note && (
          <div className="mt-3 rounded-2xl bg-white/80 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-purple-700">
              Observação técnica
            </p>

            <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
              {geometry.validation_note}
            </p>
          </div>
        )}
      </section>

      <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-black text-slate-950">
              Vínculo com lote técnico
            </h3>

            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              Relaciona esta evidência de campo à geometria técnica preliminar
              correspondente.
            </p>
          </div>

          {linkedLot ? (
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-black text-green-800">
              Vinculada
            </span>
          ) : (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">
              Sem vínculo
            </span>
          )}
        </div>

        {linkedLot && (
          <div className="mt-4 rounded-2xl border border-green-100 bg-green-50 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-green-700">
              Vínculo atual
            </p>

            <p className="mt-2 text-lg font-black text-slate-950">
              Lote {linkedLot.code}
            </p>

            {linkedLot.block && (
              <p className="mt-1 text-sm font-semibold text-slate-600">
                Quadra: {linkedLot.block}
              </p>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600">
              <div className="rounded-xl bg-white p-3">
                <span className="block text-slate-400">Área técnica</span>
                <strong className="mt-1 block text-slate-950">
                  {formatNumber(linkedLot.area_m2)} m²
                </strong>
              </div>

              <div className="rounded-xl bg-white p-3">
                <span className="block text-slate-400">Perímetro técnico</span>
                <strong className="mt-1 block text-slate-950">
                  {formatNumber(linkedLot.perimeter_m)} m
                </strong>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4">
          <label className="text-xs font-black uppercase tracking-wide text-slate-500">
            {linkedLot ? "Alterar lote relacionado" : "Selecionar lote"}
          </label>

          <select
            value={selectedLotId}
            disabled={savingLink}
            onChange={(event) => setSelectedLotId(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none transition focus:border-purple-400 focus:ring-4 focus:ring-purple-100 disabled:opacity-60"
          >
            <option value="">Sem vínculo técnico</option>

            {lots.map((lot) => (
              <option key={lot.id} value={lot.id}>
                Lote {lot.code}
                {lot.block ? ` · Quadra ${lot.block}` : ""}
                {lot.area_m2 !== null
                  ? ` · ${formatNumber(lot.area_m2)} m²`
                  : ""}
              </option>
            ))}
          </select>
        </div>

        {hasChangedLink && (
          <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-800">
            O vínculo foi alterado na tela, mas ainda não foi salvo. A geometria
            de campo continuará exatamente com os mesmos vértices.
          </div>
        )}

        <div className="mt-4 grid gap-3">
          <button
            type="button"
            disabled={savingLink || !hasChangedLink}
            onClick={() => onLinkChange(selectedLotId || null)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-purple-700 px-5 py-3 text-sm font-black text-white transition hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingLink ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Layers className="h-4 w-4" />
            )}

            {linkedLot ? "Salvar alteração de vínculo" : "Vincular ao lote"}
          </button>

          {linkedLot && (
            <button
              type="button"
              disabled={savingLink}
              onClick={() => {
                const confirmed = window.confirm(
                  `Desvincular esta geometria de campo do Lote ${linkedLot.code}?\n\nA geometria original será preservada integralmente.`,
                );

                if (confirmed) {
                  setSelectedLotId("");
                  onLinkChange(null);
                }
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-black text-red-700 transition hover:bg-red-100 disabled:opacity-50"
            >
              Desvincular do lote
            </button>
          )}
        </div>
      </section>

      <section className="mt-5 rounded-3xl bg-slate-50 p-5">
        <h3 className="flex items-center gap-2 font-black text-slate-950">
          <MapPinned className="h-5 w-5 text-green-700" />
          Selagem relacionada
        </h3>

        {linkedSeal ? (
          <div className="mt-4 space-y-2 text-sm font-semibold text-slate-600">
            <p>
              Selo:{" "}
              <span className="text-slate-950">{linkedSeal.seal_code}</span>
            </p>

            <p>
              Situação:{" "}
              <span className="text-slate-950">
                {normalizeLabel(linkedSeal.situation)}
              </span>
            </p>

            <p>
              Vínculo geoespacial:{" "}
              <span className="text-slate-950">
                {normalizeLabel(linkedSeal.geo_link_status)}
              </span>
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm font-semibold text-slate-500">
            Nenhuma selagem relacionada ao lote selecionado.
          </p>
        )}
      </section>

      <section className="mt-4 rounded-3xl bg-slate-50 p-5">
        <h3 className="flex items-center gap-2 font-black text-slate-950">
          <User className="h-5 w-5 text-green-700" />
          Cadastro social relacionado
        </h3>

        {linkedSocial ? (
          <div className="mt-4 space-y-2 text-sm font-semibold text-slate-600">
            <p>
              Responsável:{" "}
              <span className="text-slate-950">
                {linkedSocial.responsible_name}
              </span>
            </p>

            <p>
              CPF:{" "}
              <span className="text-slate-950">
                {linkedSocial.responsible_cpf ?? "-"}
              </span>
            </p>

            <p>
              Telefone:{" "}
              <span className="text-slate-950">
                {linkedSocial.phone ?? "-"}
              </span>
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm font-semibold text-slate-500">
            Nenhum cadastro social relacionado ao lote selecionado.
          </p>
        )}
      </section>

      <section className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-5">
        <h3 className="flex items-center gap-2 font-black text-amber-950">
          <ShieldCheck className="h-5 w-5" />
          Preservação da evidência de campo
        </h3>

        <p className="mt-3 text-sm font-semibold leading-6 text-amber-900/80">
          Esta vetorização representa o levantamento realizado em campo e não
          será sobrescrita pelo vínculo, pela geometria técnica preliminar ou
          pela futura geometria consolidada. Alterações administrativas geram
          uma nova versão do registro mantendo a rastreabilidade da evidência.
        </p>
      </section>
    </div>
  );
}

function LotDetailsPanel({
  lot,
  saving,
  onStatusChange,
}: {
  lot: LotMapItem;
  saving: boolean;
  onStatusChange: (
    status: "preliminar" | "em_revisao" | "inconsistente" | "apto",
  ) => void;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-green-700">
            Lote selecionado
          </p>

          <h2 className="mt-2 text-3xl font-black">Lote {lot.code}</h2>

          <p className="mt-2 text-sm font-semibold text-slate-500">
            Status técnico: {normalizeLabel(lot.technical_status)}
          </p>
        </div>

        <span
          className="rounded-full px-3 py-1 text-xs font-black text-white"
          style={{ backgroundColor: statusColor(lot.lot_review_status) }}
        >
          {normalizeLabel(lot.lot_review_status)}
        </span>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <InfoCard title="Área" value={`${formatNumber(lot.area_m2)} m²`} />
        <InfoCard
          title="Perímetro"
          value={`${formatNumber(lot.perimeter_m)} m`}
        />
        <InfoCard
          title="Geometria"
          value={hasGeometry(lot) ? "Disponível" : "Sem geometria"}
        />
        <InfoCard title="Documentos" value={String(lot.documents_count)} />
      </div>

      <section className="mt-6 rounded-3xl bg-slate-50 p-5">
        <h3 className="flex items-center gap-2 font-black">
          <MapPinned className="h-5 w-5 text-green-700" />
          Selagem vinculada
        </h3>

        {lot.seal ? (
          <div className="mt-4 space-y-2 text-sm font-semibold text-slate-600">
            <p>
              Selo: <span className="text-slate-950">{lot.seal.seal_code}</span>
            </p>
            <p>
              Situação:{" "}
              <span className="text-slate-950">
                {normalizeLabel(lot.seal.situation)}
              </span>
            </p>
            <p>
              Vínculo geo:{" "}
              <span className="text-slate-950">
                {normalizeLabel(lot.seal.geo_link_status)}
              </span>
            </p>
            <p>
              GPS: {lot.seal.latitude ?? "-"}, {lot.seal.longitude ?? "-"}
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm font-semibold text-red-600">
            Nenhuma selagem vinculada.
          </p>
        )}
      </section>

      <section className="mt-4 rounded-3xl bg-slate-50 p-5">
        <h3 className="flex items-center gap-2 font-black">
          <User className="h-5 w-5 text-green-700" />
          Cadastro social
        </h3>

        {lot.social ? (
          <div className="mt-4 space-y-2 text-sm font-semibold text-slate-600">
            <p>
              Responsável:{" "}
              <span className="text-slate-950">
                {lot.social.responsible_name}
              </span>
            </p>
            <p>
              CPF:{" "}
              <span className="text-slate-950">
                {lot.social.responsible_cpf ?? "-"}
              </span>
            </p>
            <p>
              Telefone:{" "}
              <span className="text-slate-950">{lot.social.phone ?? "-"}</span>
            </p>
            <p>
              Renda:{" "}
              <span className="text-slate-950">
                {formatMoney(lot.social.family_income)}
              </span>
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm font-semibold text-red-600">
            Sem cadastro social.
          </p>
        )}
      </section>

      <section className="mt-4 rounded-3xl bg-slate-50 p-5">
        <h3 className="flex items-center gap-2 font-black">
          <Home className="h-5 w-5 text-green-700" />
          Cadastro físico
        </h3>

        {lot.physical ? (
          <div className="mt-4 space-y-2 text-sm font-semibold text-slate-600">
            <p>
              Tipo:{" "}
              <span className="text-slate-950">
                {normalizeLabel(lot.physical.property_type)}
              </span>
            </p>
            <p>
              Uso:{" "}
              <span className="text-slate-950">
                {normalizeLabel(lot.physical.property_use)}
              </span>
            </p>
            <p>
              Cômodos:{" "}
              <span className="text-slate-950">
                {lot.physical.rooms ?? "-"}
              </span>
            </p>
            <p>
              Banheiros:{" "}
              <span className="text-slate-950">
                {lot.physical.bathrooms ?? "-"}
              </span>
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm font-semibold text-red-600">
            Sem cadastro físico.
          </p>
        )}
      </section>

      <section className="mt-4 rounded-3xl bg-slate-50 p-5">
        <h3 className="flex items-center gap-2 font-black">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          Pendências
        </h3>

        {lot.pending_flags.length === 0 ? (
          <p className="mt-4 text-sm font-bold text-green-700">
            Nenhuma pendência detectada.
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {lot.pending_flags.map((flag) => (
              <span
                key={flag}
                className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800"
              >
                {normalizeLabel(flag)}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 space-y-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => onStatusChange("em_revisao")}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-black text-amber-800 transition hover:bg-amber-100 disabled:opacity-60"
        >
          <FileText className="h-4 w-4" />
          Marcar em revisão
        </button>

        <button
          type="button"
          disabled={saving}
          onClick={() => onStatusChange("inconsistente")}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-black text-red-700 transition hover:bg-red-100 disabled:opacity-60"
        >
          <AlertTriangle className="h-4 w-4" />
          Marcar inconsistente
        </button>

        <button
          type="button"
          disabled={saving || lot.pending_flags.includes("sem_geometria")}
          onClick={() => onStatusChange("apto")}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-green-800 px-5 py-3 text-sm font-black text-white transition hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShieldCheck className="h-4 w-4" />
          Marcar apto para peças técnicas
        </button>

        {lot.pending_flags.includes("sem_geometria") && (
          <p className="text-center text-xs font-semibold text-red-600">
            Este lote ainda não pode ser marcado como apto porque não possui
            geometria georreferenciada.
          </p>
        )}
      </section>
    </div>
  );
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-black uppercase tracking-wider text-slate-400">
        {title}
      </p>
      <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}
