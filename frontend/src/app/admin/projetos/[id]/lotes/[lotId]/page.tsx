"use client";

import "leaflet/dist/leaflet.css";

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
  Link2,
  Loader2,
  MapPinned,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Unlink,
  UploadCloud,
  User,
  X,
} from "lucide-react";

import { api, clearToken, getStoredToken, setAuthToken } from "@/lib/api";

type GeoJsonGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: unknown;
};

type Project = {
  id: string;
  name: string;
  municipality: string;
  state: string;
  neighborhood: string;
  reurb_type: string;
  status: string;
};

type LotDocument = {
  id: string;
  project_id: string;
  seal_id: string | null;
  social_registration_id: string | null;
  seal_code: string;
  document_type: string;
  file_path: string;
  notes: string | null;
  validated: boolean;
};

type LotDetail = {
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

type DeleteCheckResponse = {
  can_delete: boolean;
  lot_id: string;
  lot_code: string;
  links: {
    seals: number;
    social_registrations: number;
    physical_registrations: number;
    documents: number;
  };
  message: string;
};

type LinkCandidate = {
  seal_id: string;
  seal_code: string;
  lot_code: string | null;
  responsible_name: string | null;
  latitude: number | null;
  longitude: number | null;
  geo_link_status: string;
  distance_m: number | null;
  has_social: boolean;
  has_physical: boolean;
  documents_count: number;
  link_status?: string;
  can_link?: boolean;
  code_match?: boolean;
  warning?: string | null;
};

type ReviewStatus = "preliminar" | "em_revisao" | "inconsistente" | "apto";

type LeafletModule = typeof import("leaflet");

type FeedbackKind = "success" | "error" | "warning" | "info";

type FeedbackModalState = {
  open: boolean;
  kind: FeedbackKind;
  title: string;
  message: string;
};

type ProgressModalState = {
  open: boolean;
  title: string;
  message: string;
};



function extractApiErrorMessage(err: unknown, fallback: string) {
  const responseData = (
    err as {
      response?: {
        data?: {
          detail?: unknown;
          message?: unknown;
        };
      };
    }
  ).response?.data;

  const detail = responseData?.detail;
  const message = responseData?.message;

  if (typeof detail === "string") return detail;
  if (typeof message === "string") return message;

  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;

        if (item && typeof item === "object") {
          const parsed = item as {
            loc?: unknown[];
            msg?: string;
            type?: string;
          };

          const loc = Array.isArray(parsed.loc)
            ? parsed.loc.join(".")
            : "campo";

          return parsed.msg ? `${loc}: ${parsed.msg}` : JSON.stringify(item);
        }

        return String(item);
      })
      .join("\n");
  }

  if (detail && typeof detail === "object") {
    try {
      return JSON.stringify(detail, null, 2);
    } catch {
      return fallback;
    }
  }

  return fallback;
}


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

function statusColor(status: string | null | undefined) {
  if (status === "apto") return "#15803d";
  if (status === "em_revisao") return "#ca8a04";
  if (status === "inconsistente") return "#dc2626";
  return "#2563eb";
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function isValidLatLng(point: unknown): point is [number, number] {
  if (!Array.isArray(point) || point.length < 2) return false;

  const lat = toFiniteNumber(point[0]);
  const lng = toFiniteNumber(point[1]);

  if (lat === null || lng === null) return false;

  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function geoCoordToLatLng(coord: unknown): [number, number] | null {
  if (!Array.isArray(coord) || coord.length < 2) return null;

  const lng = toFiniteNumber(coord[0]);
  const lat = toFiniteNumber(coord[1]);

  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return [lat, lng];
}

function polygonToLatLngs(geometry: GeoJsonGeometry): unknown {
  if (!geometry || !Array.isArray(geometry.coordinates)) {
    return [];
  }

  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates as unknown[];

    return rings
      .map((ring) => {
        if (!Array.isArray(ring)) return [];

        return ring
          .map((coord) => geoCoordToLatLng(coord))
          .filter((coord): coord is [number, number] => coord !== null);
      })
      .filter((ring) => ring.length >= 3);
  }

  if (geometry.type === "MultiPolygon") {
    const polygons = geometry.coordinates as unknown[];

    return polygons
      .map((polygon) => {
        if (!Array.isArray(polygon)) return [];

        return polygon
          .map((ring) => {
            if (!Array.isArray(ring)) return [];

            return ring
              .map((coord) => geoCoordToLatLng(coord))
              .filter((coord): coord is [number, number] => coord !== null);
          })
          .filter((ring) => ring.length >= 3);
      })
      .filter((polygon) => polygon.length > 0);
  }

  return [];
}
function hasGeometry(lot: LotDetail | null) {
  return Boolean(lot?.geometry_geojson);
}

function getLotPoint(lot: LotDetail): [number, number] | null {
  const centroidLat = toFiniteNumber(lot.centroid_latitude);
  const centroidLng = toFiniteNumber(lot.centroid_longitude);

  if (
    centroidLat !== null &&
    centroidLng !== null &&
    centroidLat >= -90 &&
    centroidLat <= 90 &&
    centroidLng >= -180 &&
    centroidLng <= 180
  ) {
    return [centroidLat, centroidLng];
  }

  const seal = lot.seal;

  const sealLat = toFiniteNumber(seal?.latitude);
  const sealLng = toFiniteNumber(seal?.longitude);

  if (
    sealLat !== null &&
    sealLng !== null &&
    sealLat >= -90 &&
    sealLat <= 90 &&
    sealLng >= -180 &&
    sealLng <= 180
  ) {
    return [sealLat, sealLng];
  }

  return null;
}

function getDocumentName(path: string) {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export default function LotDetailsPage() {
  const params = useParams<{ id: string; lotId: string }>();
  const router = useRouter();

  const projectId = params.id;
  const lotId = params.lotId;

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);

  const [project, setProject] = useState<Project | null>(null);
  const [lot, setLot] = useState<LotDetail | null>(null);
  const [documents, setDocuments] = useState<LotDocument[]>([]);

  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [downloadingDossier, setDownloadingDossier] = useState(false);

  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState("documento_lote");
  const [documentNotes, setDocumentNotes] = useState("");
  const [documentActionId, setDocumentActionId] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<FeedbackModalState>({
    open: false,
    kind: "info",
    title: "",
    message: "",
  });

  const [progress, setProgress] = useState<ProgressModalState>({
    open: false,
    title: "",
    message: "",
  });

  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [linkingSealId, setLinkingSealId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<LinkCandidate[]>([]);

  const [mapVersion, setMapVersion] = useState(0);

  const summaryCards = useMemo(() => {
    if (!lot) return [];

    return [
      {
        title: "Área vetorizada",
        value: `${formatNumber(lot.area_m2)} m²`,
        icon: Layers,
      },
      {
        title: "Perímetro",
        value: `${formatNumber(lot.perimeter_m)} m`,
        icon: MapPinned,
      },
      {
        title: "Geometria",
        value: hasGeometry(lot) ? "Disponível" : "Sem geometria",
        icon: MapPinned,
      },
      {
        title: "Documentos",
        value: String(documents.length),
        icon: FileText,
      },
    ];
  }, [lot, documents.length]);

  function destroyMap() {
  if (layerRef.current) {
    layerRef.current.clearLayers();
    layerRef.current = null;
  }

  if (mapRef.current) {
    mapRef.current.remove();
    mapRef.current = null;
  }
}

  function showFeedback(kind: FeedbackKind, title: string, message: string) {
  setFeedback({
    open: true,
    kind,
    title,
    message,
  });
}

function closeFeedback() {
  setFeedback((current) => ({
    ...current,
    open: false,
  }));
}

function showProgress(title: string, message: string) {
  setProgress({
    open: true,
    title,
    message,
  });
}

function closeProgress() {
  setProgress((current) => ({
    ...current,
    open: false,
  }));
}

useEffect(() => {
  destroyMap();
  loadData({ fullLoading: true });

  return () => {
    destroyMap();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [projectId, lotId]);

  useEffect(() => {
    if (!lot || !mapContainerRef.current) return;

    let cancelled = false;

    async function drawMap() {
      const L: LeafletModule = await import("leaflet");

      if (cancelled || !mapContainerRef.current || !lot) return;

      if (!mapRef.current) {
        mapRef.current = L.map(mapContainerRef.current, {
          center: [0.034, -51.069],
          zoom: 18,
          zoomControl: true,
          preferCanvas: true,
        });

        const claroTecnico = L.tileLayer(
          "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
          {
            maxZoom: 22,
            attribution: "&copy; OpenStreetMap &copy; CARTO",
          },
        );

        const mapaPadrao = L.tileLayer(
          "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            maxZoom: 22,
            attribution: "&copy; OpenStreetMap",
          },
        );

        const satelite = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            maxZoom: 22,
            attribution: "Tiles &copy; Esri",
          },
        );

        claroTecnico.addTo(mapRef.current);

        L.control
          .layers(
            {
              "Claro técnico": claroTecnico,
              "Mapa padrão": mapaPadrao,
              Satélite: satelite,
            },
            {},
            {
              collapsed: false,
              position: "topright",
            },
          )
          .addTo(mapRef.current);

        layerRef.current = L.layerGroup().addTo(mapRef.current);
      }

      const map = mapRef.current;
      const layer = layerRef.current;

      if (!map || !layer) return;

      layer.clearLayers();

      const bounds = L.latLngBounds([]);
      const color = statusColor(lot.lot_review_status);

if (lot.geometry_geojson) {
  const latLngs = polygonToLatLngs(lot.geometry_geojson);

  if (Array.isArray(latLngs) && latLngs.length > 0) {
    const polygon = L.polygon(
      latLngs as L.LatLngExpression[][] | L.LatLngExpression[][][],
      {
        color,
        weight: 4,
        fillColor: color,
        fillOpacity: 0.28,
      },
    );

    polygon.bindTooltip(`Lote ${lot.code}`, {
      permanent: true,
      direction: "center",
      className: "lot-label",
    });

    polygon.addTo(layer);

    const polygonBounds = polygon.getBounds();

    if (polygonBounds.isValid()) {
      bounds.extend(polygonBounds);
    }
  }
}

const currentSeal = lot.seal;

const sealLat = toFiniteNumber(currentSeal?.latitude);
const sealLng = toFiniteNumber(currentSeal?.longitude);

if (
  currentSeal &&
  sealLat !== null &&
  sealLng !== null &&
  sealLat >= -90 &&
  sealLat <= 90 &&
  sealLng >= -180 &&
  sealLng <= 180
) {
  const sealPoint: [number, number] = [sealLat, sealLng];

  const marker = L.circleMarker(sealPoint, {
    radius: 8,
    color: "#111827",
    fillColor: "#ffffff",
    fillOpacity: 1,
    weight: 3,
  });

  marker.bindTooltip(currentSeal.seal_code);
  marker.addTo(layer);
  bounds.extend(sealPoint);
}

      const point = getLotPoint(lot);

      if (!lot.geometry_geojson && point) {
        const marker = L.circleMarker(point, {
          radius: 10,
          color,
          fillColor: color,
          fillOpacity: 0.9,
          weight: 3,
        });

        marker.bindTooltip(`Lote ${lot.code}`, {
          permanent: true,
          direction: "top",
        });

        marker.addTo(layer);
        bounds.extend(point);
      }

      requestAnimationFrame(() => {
setTimeout(() => {
  if (!mapRef.current) return;

  try {
    mapRef.current.invalidateSize();

    if (bounds.isValid()) {
      const southWest = bounds.getSouthWest();
      const northEast = bounds.getNorthEast();

      const validBounds =
        Number.isFinite(southWest.lat) &&
        Number.isFinite(southWest.lng) &&
        Number.isFinite(northEast.lat) &&
        Number.isFinite(northEast.lng);

requestAnimationFrame(() => {
  setTimeout(() => {
    const currentMap = mapRef.current;

    if (!currentMap) return;

    try {
      currentMap.invalidateSize();

      if (bounds.isValid()) {
        const southWest = bounds.getSouthWest();
        const northEast = bounds.getNorthEast();

        const validBounds =
          Number.isFinite(southWest.lat) &&
          Number.isFinite(southWest.lng) &&
          Number.isFinite(northEast.lat) &&
          Number.isFinite(northEast.lng);

        if (validBounds) {
          currentMap.flyToBounds(bounds, {
            padding: [50, 50],
            maxZoom: lot.geometry_geojson ? 20 : 19,
            duration: 0.8,
          });
          return;
        }
      }

      const point = getLotPoint(lot);

      if (point && isValidLatLng(point)) {
        currentMap.setView(point, 19);
      }
    } catch (err) {
      console.warn("Erro ao ajustar zoom do lote:", err);

      const point = getLotPoint(lot);

      if (point && isValidLatLng(point) && mapRef.current) {
        mapRef.current.setView(point, 19);
      }
    }
  }, 250);
});
    }

    const point = getLotPoint(lot);

    if (point && isValidLatLng(point)) {
      mapRef.current.setView(point, 19);
    }
  } catch {
    const point = getLotPoint(lot);

    if (point && isValidLatLng(point) && mapRef.current) {
      mapRef.current.setView(point, 19);
    }
  }
}, 250);
      });
    }

    drawMap();

    return () => {
      cancelled = true;
    };
  }, [lot, mapVersion]);

async function loadData(options?: { fullLoading?: boolean }) {
  const token = getStoredToken();

  if (!token) {
    router.push("/login");
    return;
  }

  const fullLoading = options?.fullLoading ?? false;

  setAuthToken(token);

  if (fullLoading) {
    setLoading(true);
  }

  try {
    const [projectResponse, lotResponse, documentsResponse] =
      await Promise.all([
        api.get<Project>(`/projects/${projectId}`),
        api.get<LotDetail>(`/projects/${projectId}/lots/${lotId}/detail`),
        api.get<LotDocument[]>(
          `/projects/${projectId}/lots/${lotId}/documents`,
        ),
      ]);

    const nextDocuments = documentsResponse.data ?? [];

    setProject(projectResponse.data);
    setLot({
      ...lotResponse.data,
      documents_count: nextDocuments.length,
    });
    setDocuments(nextDocuments);

    setMapVersion((current) => current + 1);
  } catch (err) {
    console.warn(err);

    const status = (err as { response?: { status?: number } }).response
      ?.status;

    if (status === 401 || status === 403) {
      clearToken();
      router.push("/login");
      return;
    }

    if (status === 404) {
      setLot(null);
      showFeedback(
        "error",
        "Lote não encontrado",
        "Não foi possível localizar o lote solicitado neste projeto.",
      );
      return;
    }

    showFeedback(
      "error",
      "Erro ao carregar lote",
      extractApiErrorMessage(
        err,
        "Não foi possível carregar os detalhes do lote.",
      ),
    );
  } finally {
    if (fullLoading) {
      setLoading(false);
    }
  }
}

async function refreshAfterAction() {
  await loadData({ fullLoading: false });

  requestAnimationFrame(() => {
    setTimeout(() => {
      mapRef.current?.invalidateSize();
      setMapVersion((current) => current + 1);
    }, 250);
  });
}


  async function updateLotStatus(reviewStatus: ReviewStatus) {
    if (!lot) return;

    try {
      setSavingStatus(true);
closeFeedback();

      await api.patch(`/projects/${projectId}/lots/${lot.id}/review`, {
        lot_review_status: reviewStatus,
        revision_notes:
          reviewStatus === "apto"
            ? "Lote marcado como apto para geração de planta e memorial descritivo."
            : `Lote marcado como ${reviewStatus}.`,
      });

      showFeedback("success", "Sucesso", "mensagem");
      await refreshAfterAction();
    } catch (err) {
      console.warn(err);
      showFeedback("error", "Erro", "mensagem");
    } finally {
      setSavingStatus(false);
    }
  }

  async function openLinkModal() {
    if (!lot) return;

    try {
      setLinkModalOpen(true);
      setLoadingCandidates(true);
      setCandidates([]);
closeFeedback();

      const response = await api.get<LinkCandidate[]>(
        `/projects/${projectId}/lots/${lot.id}/link-candidates`,
      );

      setCandidates(response.data ?? []);
    } catch (err) {
      console.warn(err);
      showFeedback("error", "Erro", "mensagem");
    } finally {
      setLoadingCandidates(false);
    }
  }

  async function linkSeal(sealId: string) {
    if (!lot) return;

    try {
      setLinkingSealId(sealId);
    closeFeedback();

      await api.patch(`/projects/${projectId}/lots/${lot.id}/link-seal`, {
        seal_id: sealId,
      });

     showFeedback("success", "Sucesso", "mensagem");
      setLinkModalOpen(false);
      setCandidates([]);

     await refreshAfterAction();

      setTimeout(() => {
        setMapVersion((current) => current + 1);
      }, 350);
    } catch (err) {
      console.warn(err);
      showFeedback("error", "Erro", "mensagem");
    } finally {
      setLinkingSealId(null);
    }
  }

  async function unlinkSeal() {
    if (!lot || !lot.seal) return;

    const confirmed = window.confirm(
      `Deseja desvincular a selagem ${lot.seal.seal_code} do lote ${lot.code}? Os cadastros continuarão salvos, mas deixarão de estar associados a este lote.`,
    );

    if (!confirmed) return;

    try {
      setUnlinking(true);
    closeFeedback();

      await api.patch(`/projects/${projectId}/lots/${lot.id}/unlink-seal`);

      setLot((current) => {
        if (!current) return current;

        return {
          ...current,
          seal: null,
          social: null,
          physical: null,
          documents_count: 0,
          is_ready_for_technical_documents: false,
          lot_review_status: "preliminar",
          technical_status: "pendente",
          pending_flags: [
            ...new Set([
              ...current.pending_flags,
              "sem_selagem",
              "sem_cadastro_social",
              "sem_cadastro_fisico",
              "sem_documentos",
            ]),
          ],
        };
      });

      setDocuments([]);
      showFeedback("success", "Sucesso", "mensagem");

      await refreshAfterAction();

      setTimeout(() => {
        setMapVersion((current) => current + 1);
      }, 350);
    } catch (err) {
      console.warn(err);
      showFeedback("error", "Erro", "mensagem");
    } finally {
      setUnlinking(false);
    }
  }

  async function deleteLot() {
    if (!lot) return;

    try {
      setDeleting(true);
   closeFeedback();

      const checkResponse = await api.get<DeleteCheckResponse>(
        `/projects/${projectId}/lots/${lot.id}/delete-check`,
      );

      const check = checkResponse.data;

      if (!check.can_delete) {
        window.alert(
          [
            "Este lote não pode ser excluído porque possui vínculos ativos.",
            "",
            `Selagens: ${check.links.seals}`,
            `Cadastros sociais: ${check.links.social_registrations}`,
            `Cadastros físicos: ${check.links.physical_registrations}`,
            `Documentos: ${check.links.documents}`,
            "",
            "Desvincule a selagem/cadastro antes de excluir o lote.",
          ].join("\n"),
        );

        return;
      }

      const confirmed = window.confirm(
        `Tem certeza que deseja excluir o lote ${lot.code}? Essa ação removerá a geometria do mapa núcleo e não poderá ser desfeita.`,
      );

      if (!confirmed) return;

      await api.delete(`/projects/${projectId}/lots/${lot.id}`);

      router.push(`/admin/projetos/${projectId}/lotes`);
    } catch (err) {
      console.warn(err);

      const detail = (err as { response?: { data?: { detail?: string } } })
        .response?.data?.detail;

      showFeedback("error", "Erro", "mensagem");
    } finally {
      setDeleting(false);
    }
  }

async function uploadDocument() {
  if (!documentFile) {
    showFeedback(
      "error",
      "Arquivo obrigatório",
      "Selecione um arquivo antes de enviar.",
    );
    return;
  }

  try {
    setUploadingDocument(true);
    closeFeedback();

    showProgress(
      "Enviando documento",
      "Aguarde enquanto o arquivo é enviado e vinculado ao lote.",
    );

    const formData = new FormData();
    formData.append("file", documentFile);
    formData.append("document_type", documentType);
    formData.append("notes", documentNotes);

    await api.post(
      `/projects/${projectId}/lots/${lotId}/documents/upload`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );

    setDocumentFile(null);
    setDocumentType("documento_lote");
    setDocumentNotes("");

    closeProgress();

    showFeedback(
      "success",
      "Documento enviado",
      "Documento enviado e vinculado ao lote com sucesso.",
    );

    await refreshAfterAction();
  } catch (err) {
    closeProgress();

    showFeedback(
      "error",
      "Erro ao enviar documento",
      extractApiErrorMessage(err, "Não foi possível enviar o documento."),
    );
  } finally {
    setUploadingDocument(false);
  }
}

async function validateDocument(documentId: string, validated: boolean) {
  try {
    setDocumentActionId(documentId);
    closeFeedback();

    showProgress(
      validated ? "Validando documento" : "Removendo validação",
      "Aguarde enquanto o sistema atualiza a situação documental do lote.",
    );

    await api.patch(`/projects/${projectId}/documents/${documentId}/validate`, {
      validated,
    });

    closeProgress();

    showFeedback(
      "success",
      "Documento atualizado",
      validated
        ? "Documento validado com sucesso."
        : "Documento marcado como pendente.",
    );

    await refreshAfterAction();
  } catch (err) {
    closeProgress();

    showFeedback(
      "error",
      "Erro ao validar documento",
      extractApiErrorMessage(
        err,
        "Não foi possível atualizar a validação do documento.",
      ),
    );
  } finally {
    setDocumentActionId(null);
  }
}
async function deleteDocument(documentId: string) {
  const confirmed = window.confirm(
    "Tem certeza que deseja excluir este documento? Essa ação não poderá ser desfeita.",
  );

  if (!confirmed) return;

  try {
    setDocumentActionId(documentId);
    closeFeedback();

    showProgress(
      "Excluindo documento",
      "Aguarde enquanto o documento é removido do lote.",
    );

    await api.delete(`/projects/${projectId}/documents/${documentId}`);

    closeProgress();

    showFeedback(
      "success",
      "Documento excluído",
      "Documento excluído com sucesso.",
    );

    await refreshAfterAction();
  } catch (err) {
    closeProgress();

    showFeedback(
      "error",
      "Erro ao excluir documento",
      extractApiErrorMessage(err, "Não foi possível excluir o documento."),
    );
  } finally {
    setDocumentActionId(null);
  }
}

function getFilenameFromContentDisposition(header: string | undefined) {
  if (!header) return null;

  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);

  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const normalMatch = header.match(/filename="?([^"]+)"?/i);

  if (normalMatch?.[1]) {
    return normalMatch[1];
  }

  return null;
}



async function openDocument(documentId: string) {
  try {
    setDocumentActionId(documentId);
    closeFeedback();

    showProgress(
      "Abrindo documento",
      "Aguarde enquanto o arquivo é localizado e preparado.",
    );

    const response = await api.get(
      `/projects/${projectId}/documents/${documentId}/file`,
      {
        responseType: "blob",
        validateStatus: (status) => status < 500,
      },
    );

    closeProgress();

    if (response.status === 404) {
      showFeedback(
        "error",
        "Arquivo não localizado",
        "O registro do documento existe, mas o arquivo físico não foi localizado no backend. Verifique se o arquivo importado do mobile está dentro da pasta storage/imports/.../extracted.",
      );
      return;
    }

    if (response.status !== 200) {
      showFeedback(
        "error",
        "Erro ao abrir documento",
        "Não foi possível abrir o arquivo do documento.",
      );
      return;
    }

const rawContentDisposition = response.headers["content-disposition"];
const contentDisposition =
  typeof rawContentDisposition === "string" ? rawContentDisposition : undefined;

const rawContentType = response.headers["content-type"];
const contentType =
  typeof rawContentType === "string"
    ? rawContentType
    : "application/octet-stream";

const extensionFromContentType =
  contentType.includes("pdf")
    ? ".pdf"
    : contentType.includes("jpeg")
      ? ".jpg"
      : contentType.includes("png")
        ? ".png"
        : "";

const filename =
  getFilenameFromContentDisposition(contentDisposition) ??
  `documento-${documentId}${extensionFromContentType}`;

const blob = new Blob([response.data], {
  type: contentType,
});

const blobUrl = URL.createObjectURL(blob);

const anchor = document.createElement("a");
anchor.href = blobUrl;
anchor.download = filename;
anchor.target = "_blank";
document.body.appendChild(anchor);
anchor.click();
anchor.remove();

setTimeout(() => {
  URL.revokeObjectURL(blobUrl);
}, 30000);


    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 30000);
  } catch (err) {
    closeProgress();

    showFeedback(
      "error",
      "Erro ao abrir documento",
      extractApiErrorMessage(err, "Não foi possível abrir o arquivo do documento."),
    );
  } finally {
    setDocumentActionId(null);
  }
}

async function downloadLotDossier() {
  if (!lot) return;

  try {
    setDownloadingDossier(true);
    closeFeedback();

    showProgress(
      "Gerando dossiê do lote",
      "Aguarde enquanto o sistema organiza a ficha cadastral, documentos, geometria e atributos do lote.",
    );

    const response = await api.get(
      `/projects/${projectId}/lots/${lot.id}/dossier`,
      {
        responseType: "blob",
        validateStatus: (status) => status < 500,
      },
    );

    closeProgress();

    if (response.status !== 200) {
      showFeedback(
        "error",
        "Erro ao gerar dossiê",
        "Não foi possível gerar o dossiê individual deste lote.",
      );
      return;
    }

    const rawContentDisposition = response.headers["content-disposition"];
    const contentDisposition =
      typeof rawContentDisposition === "string"
        ? rawContentDisposition
        : undefined;

    const filename =
      getFilenameFromContentDisposition(contentDisposition) ||
      `dossie_lote_${lot.code}.zip`;

    const blob = new Blob([response.data], {
      type: "application/zip",
    });

    const blobUrl = URL.createObjectURL(blob);

    const anchor = window.document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = filename;
    window.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 30000);

    showFeedback(
      "success",
      "Dossiê gerado",
      "O dossiê individual do lote foi exportado com sucesso.",
    );
  } catch (err) {
    closeProgress();

    showFeedback(
      "error",
      "Erro ao gerar dossiê",
      extractApiErrorMessage(
        err,
        "Não foi possível exportar o dossiê individual do lote.",
      ),
    );
  } finally {
    setDownloadingDossier(false);
  }
}

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 rounded-2xl bg-white p-6 font-bold text-slate-700 shadow">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando detalhes do lote...
        </div>
      </main>
    );
  }

  if (!lot) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-4xl rounded-3xl border border-red-100 bg-red-50 p-6 text-red-700">
          <h1 className="text-xl font-black">Lote não encontrado</h1>
          <p className="mt-2 text-sm font-semibold">
            Não foi possível localizar o lote solicitado neste projeto.
          </p>

          <button
            type="button"
            onClick={() => router.push(`/admin/projetos/${projectId}/lotes`)}
            className="mt-5 rounded-2xl bg-red-700 px-5 py-3 text-sm font-black text-white"
          >
            Voltar para lotes
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6">
          <button
            type="button"
            onClick={() => router.push(`/admin/projetos/${projectId}/lotes`)}
            className="inline-flex w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para lotes
          </button>

          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.45em] text-green-700">
                Detalhe do lote
              </p>

              <h1 className="mt-3 text-4xl font-black tracking-tight">
                Lote {lot.code}
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Conferência técnica da geometria vetorizada, vínculos
                cadastrais, documentos e aptidão para geração de planta e
                memorial descritivo.
              </p>

              {project && (
                <p className="mt-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                  {project.name} · {project.municipality}/{project.state} ·{" "}
                  {project.neighborhood}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={refreshAfterAction}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-6">
      
       

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          {summaryCards.map((item) => (
            <div
              key={item.title}
              className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm"
            >
              <item.icon className="h-7 w-7 text-green-700" />
              <p className="mt-4 text-sm font-bold text-slate-500">
                {item.title}
              </p>
              <p className="mt-1 text-2xl font-black">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-3 shadow-sm">
            <div
              ref={mapContainerRef}
              className="h-[680px] w-full overflow-hidden rounded-[1.5rem] bg-slate-100"
            />
          </section>

          <aside className="max-h-[680px] overflow-y-auto rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
<LotDetailsPanel
  lot={lot}
  documentsCount={documents.length}
  saving={savingStatus}
  deleting={deleting}
  unlinking={unlinking}
  downloadingDossier={downloadingDossier}
  onStatusChange={updateLotStatus}
  onOpenLinkModal={openLinkModal}
  onUnlinkSeal={unlinkSeal}
  onDeleteLot={deleteLot}
  onDownloadDossier={downloadLotDossier}
/>
          </aside>
        </div>

        <DocumentsPanel
          documents={documents}
          documentFile={documentFile}
          documentType={documentType}
          documentNotes={documentNotes}
          uploadingDocument={uploadingDocument}
          documentActionId={documentActionId}
          onFileChange={setDocumentFile}
          onTypeChange={setDocumentType}
          onNotesChange={setDocumentNotes}
          onUpload={uploadDocument}
          onOpen={openDocument}
          onValidate={validateDocument}
          onDelete={deleteDocument}
        />
      </section>

{linkModalOpen && (
  <LinkSealModal
    candidates={candidates}
    loading={loadingCandidates}
    linkingSealId={linkingSealId}
    onClose={() => setLinkModalOpen(false)}
    onLink={linkSeal}
  />
)}

<FeedbackModal state={feedback} onClose={closeFeedback} />
<ProgressModal state={progress} />
    </main>
  );
}

function LotDetailsPanel({
  lot,
  documentsCount,
  saving,
  deleting,
  unlinking,
  downloadingDossier,
  onStatusChange,
  onOpenLinkModal,
  onUnlinkSeal,
  onDeleteLot,
  onDownloadDossier,
}: {
  lot: LotDetail;
  documentsCount: number;
  saving: boolean;
  deleting: boolean;
  unlinking: boolean;
  downloadingDossier: boolean;
  onStatusChange: (status: ReviewStatus) => void;
  onOpenLinkModal: () => void;
  onUnlinkSeal: () => void;
  onDeleteLot: () => void;
  onDownloadDossier: () => void;
}) {
  const canMarkReady =
    hasGeometry(lot) &&
    Boolean(lot.seal) &&
    Boolean(lot.social) &&
    Boolean(lot.physical) &&
    documentsCount > 0;

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
        <InfoCard title="Documentos" value={String(documentsCount)} />
      </div>

      <InfoSection
        title="Selagem vinculada"
        icon={MapPinned}
        empty={!lot.seal}
        emptyText="Nenhuma selagem vinculada."
      >
        {lot.seal && (
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
        )}
      </InfoSection>

      <InfoSection
        title="Cadastro social"
        icon={User}
        empty={!lot.social}
        emptyText="Sem cadastro social."
      >
        {lot.social && (
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
        )}
      </InfoSection>

      <InfoSection
        title="Cadastro físico"
        icon={Home}
        empty={!lot.physical}
        emptyText="Sem cadastro físico."
      >
        {lot.physical && (
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
              <span className="text-slate-950">{lot.physical.rooms ?? "-"}</span>
            </p>
            <p>
              Banheiros:{" "}
              <span className="text-slate-950">
                {lot.physical.bathrooms ?? "-"}
              </span>
            </p>
          </div>
        )}
      </InfoSection>

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
  disabled={downloadingDossier}
  onClick={onDownloadDossier}
  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-green-700 px-5 py-3 text-sm font-black text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60"
>
  {downloadingDossier ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : (
    <Download className="h-4 w-4" />
  )}
  Baixar dossiê individual
</button>
        {!lot.seal && (
          <button
            type="button"
            onClick={onOpenLinkModal}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-800"
          >
            <Link2 className="h-4 w-4" />
            Vincular selagem/cadastro
          </button>
        )}

        {lot.seal && (
          <button
            type="button"
            disabled={unlinking}
            onClick={onUnlinkSeal}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            {unlinking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Unlink className="h-4 w-4" />
            )}
            Desvincular selagem
          </button>
        )}

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
          disabled={saving || !canMarkReady}
          onClick={() => onStatusChange("apto")}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-green-800 px-5 py-3 text-sm font-black text-white transition hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShieldCheck className="h-4 w-4" />
          Marcar apto para peças técnicas
        </button>

        {!canMarkReady && (
          <p className="text-center text-xs font-semibold text-red-600">
            Para marcar como apto, o lote precisa ter geometria, selagem,
            cadastro social, cadastro físico e documentos vinculados.
          </p>
        )}

        <button
          type="button"
          disabled={deleting}
          onClick={onDeleteLot}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white px-5 py-3 text-sm font-black text-red-700 transition hover:bg-red-50 disabled:opacity-60"
        >
          {deleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          Excluir lote
        </button>
      </section>
    </div>
  );
}



function DocumentsPanel({
  documents,
  documentFile,
  documentType,
  documentNotes,
  uploadingDocument,
  documentActionId,
  onFileChange,
  onTypeChange,
  onNotesChange,
  onUpload,
  onOpen,
  onValidate,
  onDelete,
}: {
  documents: LotDocument[];
  documentFile: File | null;
  documentType: string;
  documentNotes: string;
  uploadingDocument: boolean;
  documentActionId: string | null;
  onFileChange: (file: File | null) => void;
  onTypeChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onUpload: () => void;
  onOpen: (documentId: string) => void;
  onValidate: (documentId: string, validated: boolean) => void;
  onDelete: (documentId: string) => void;
}) {
  return (
    <section className="mt-8 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.35em] text-green-700">
            Documentos do lote
          </p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">
            Conferência documental
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
            Liste, abra, valide, recuse, exclua ou anexe documentos ao lote.
            Estes documentos entram na validação final para tornar o lote apto.
          </p>
        </div>

        <div className="rounded-2xl bg-slate-50 px-5 py-4">
          <p className="text-xs font-black uppercase tracking-wider text-slate-400">
            Total
          </p>
          <p className="mt-1 text-3xl font-black text-slate-950">
            {documents.length}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 rounded-3xl border border-slate-100 bg-slate-50 p-4 md:grid-cols-[1fr_220px]">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="rounded-2xl bg-white p-4">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400">
              Tipo do documento
            </span>
            <select
              value={documentType}
              onChange={(event) => onTypeChange(event.target.value)}
              className="mt-2 w-full bg-transparent text-sm font-bold text-slate-800 outline-none"
            >
              <option value="documento_lote">Documento do lote</option>
              <option value="cpf">CPF</option>
              <option value="rg">RG</option>
              <option value="comprovante_residencia">
                Comprovante de residência
              </option>
              <option value="documento_posse">Documento de posse</option>
              <option value="termo_declaracao">Termo/declaração</option>
              <option value="imagem_campo">Imagem de campo</option>
              <option value="outro">Outro</option>
            </select>
          </label>

          <label className="rounded-2xl bg-white p-4">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400">
              Arquivo
            </span>
            <input
              type="file"
              onChange={(event) =>
                onFileChange(event.target.files?.[0] ?? null)
              }
              className="mt-2 w-full text-sm font-semibold text-slate-700"
            />
            {documentFile && (
              <p className="mt-2 truncate text-xs font-bold text-green-700">
                {documentFile.name}
              </p>
            )}
          </label>

          <label className="rounded-2xl bg-white p-4 md:col-span-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400">
              Observações
            </span>
            <input
              value={documentNotes}
              onChange={(event) => onNotesChange(event.target.value)}
              placeholder="Ex.: Documento conferido com original em campo."
              className="mt-2 w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400"
            />
          </label>
        </div>

        <button
          type="button"
          disabled={uploadingDocument}
          onClick={onUpload}
          className="flex items-center justify-center gap-2 rounded-2xl bg-green-800 px-5 py-3 text-sm font-black text-white transition hover:bg-green-900 disabled:opacity-60"
        >
          {uploadingDocument ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UploadCloud className="h-4 w-4" />
          )}
          Enviar documento
        </button>
      </div>

      {documents.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
          <FileText className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-4 text-lg font-black text-slate-800">
            Nenhum documento vinculado
          </h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            Envie ou vincule documentos para concluir a validação do lote.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {documents.map((document) => {
            const busy = documentActionId === document.id;

            return (
              <article
                key={document.id}
                className="rounded-3xl border border-slate-100 bg-slate-50 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400">
                      {normalizeLabel(document.document_type)}
                    </p>
                    <h3 className="mt-1 line-clamp-2 text-base font-black text-slate-950">
                      {getDocumentName(document.file_path)}
                    </h3>
                    <p className="mt-1 text-xs font-bold text-slate-500">
                      Selo: {document.seal_code}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ${
                      document.validated
                        ? "bg-green-100 text-green-800"
                        : "bg-amber-100 text-amber-900"
                    }`}
                  >
                    {document.validated ? "Validado" : "Pendente"}
                  </span>
                </div>

                {document.notes && (
                  <p className="mt-4 rounded-2xl bg-white p-3 text-sm font-semibold leading-6 text-slate-600">
                    {document.notes}
                  </p>
                )}

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onOpen(document.id)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                  >
                    <Download className="h-4 w-4" />
                    Abrir
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                   onClick={() => onValidate(document.id, !document.validated)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-green-200 bg-green-50 px-4 py-2 text-xs font-black text-green-800 hover:bg-green-100 disabled:opacity-60"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <BadgeCheck className="h-4 w-4" />
                    )}
                    {document.validated ? "Marcar pendente" : "Validar"}
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onDelete(document.id)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-white px-4 py-2 text-xs font-black text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function LinkSealModal({
  candidates,
  loading,
  linkingSealId,
  onClose,
  onLink,
}: {
  candidates: LinkCandidate[];
  loading: boolean;
  linkingSealId: string | null;
  onClose: () => void;
  onLink: (sealId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 px-4">
      <div className="max-h-[85vh] w-full max-w-5xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-xl font-black text-slate-950">
              Vincular selagem/cadastro
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Selecione uma selagem importada do mobile para vincular a este
              lote. A vinculação trará junto cadastro social, cadastro físico e
              documentos relacionados ao selo.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-5 text-sm font-bold text-slate-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando selagens disponíveis...
            </div>
          ) : candidates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <Link2 className="mx-auto h-12 w-12 text-slate-400" />
              <h3 className="mt-4 text-lg font-black text-slate-800">
                Nenhuma selagem disponível
              </h3>
              <p className="mt-2 text-sm font-semibold text-slate-500">
                Não há selagens disponíveis para vincular neste projeto.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {candidates.map((candidate) => (
                <div
                  key={candidate.seal_id}
                  className="rounded-3xl border border-slate-100 bg-slate-50 p-5"
                >
                  <div className="grid gap-5 md:grid-cols-[1fr_180px] md:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-2xl font-black text-slate-950">
                          {candidate.seal_code}
                        </h3>

                        {candidate.lot_code && (
                          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-800">
                            Lote declarado {candidate.lot_code}
                          </span>
                        )}

                        {candidate.code_match && (
                          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-black text-green-800">
                            Código compatível
                          </span>
                        )}

                        {candidate.has_social && (
                          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-black text-green-800">
                            Social
                          </span>
                        )}

                        {candidate.has_physical && (
                          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-black text-green-800">
                            Físico
                          </span>
                        )}
                      </div>

                      <div className="mt-4 grid gap-3 text-sm font-semibold text-slate-600 md:grid-cols-4">
                        <CandidateInfo
                          title="Responsável"
                          value={candidate.responsible_name ?? "-"}
                        />
                        <CandidateInfo
                          title="Documentos"
                          value={String(candidate.documents_count)}
                        />
                        <CandidateInfo
                          title="GPS"
                          value={`${candidate.latitude ?? "-"}, ${
                            candidate.longitude ?? "-"
                          }`}
                        />
                        <CandidateInfo
                          title="Distância"
                          value={
                            candidate.distance_m !== null &&
                            candidate.distance_m !== undefined
                              ? `${formatNumber(candidate.distance_m)} m`
                              : "-"
                          }
                        />
                      </div>

                      {candidate.link_status === "vinculada_outro_lote" && (
                        <p className="mt-4 rounded-2xl bg-amber-100 px-4 py-2 text-xs font-bold text-amber-900">
                          Esta selagem já está vinculada a outro lote. Ao
                          vincular aqui, o vínculo será transferido.
                        </p>
                      )}

                      {candidate.link_status === "ja_vinculada_este_lote" && (
                        <p className="mt-4 rounded-2xl bg-green-100 px-4 py-2 text-xs font-bold text-green-800">
                          Esta selagem já está vinculada a este lote.
                        </p>
                      )}

                      {candidate.warning && (
                        <p className="mt-4 rounded-2xl bg-red-50 px-4 py-2 text-xs font-bold text-red-700">
                          {candidate.warning}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={
                        linkingSealId === candidate.seal_id ||
                        candidate.link_status === "ja_vinculada_este_lote"
                      }
                      onClick={() => onLink(candidate.seal_id)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-green-800 px-5 py-4 text-sm font-black text-white transition hover:bg-green-900 disabled:opacity-60"
                    >
                      {linkingSealId === candidate.seal_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <BadgeCheck className="h-4 w-4" />
                      )}
                      Vincular
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CandidateInfo({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-4">
      <p className="text-xs font-black uppercase tracking-wider text-slate-400">
        {title}
      </p>
      <p className="mt-1 break-words text-sm font-black text-slate-900">
        {value}
      </p>
    </div>
  );
}

function InfoSection({
  title,
  icon: Icon,
  empty,
  emptyText,
  children,
}: {
  title: string;
  icon: React.ElementType;
  empty: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4 rounded-3xl bg-slate-50 p-5">
      <h3 className="flex items-center gap-2 font-black">
        <Icon className="h-5 w-5 text-green-700" />
        {title}
      </h3>

      {empty ? (
        <p className="mt-4 text-sm font-semibold text-red-600">{emptyText}</p>
      ) : (
        children
      )}
    </section>
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
function FeedbackModal({
  state,
  onClose,
}: {
  state: FeedbackModalState;
  onClose: () => void;
}) {
  if (!state.open) return null;

  const colorClass =
    state.kind === "success"
      ? "bg-green-100 text-green-800 border-green-200"
      : state.kind === "error"
        ? "bg-red-100 text-red-800 border-red-200"
        : state.kind === "warning"
          ? "bg-amber-100 text-amber-900 border-amber-200"
          : "bg-blue-100 text-blue-800 border-blue-200";

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/50 px-4">
      <div className="w-full max-w-xl rounded-[2rem] bg-white p-6 shadow-2xl">
        <div className={`rounded-2xl border p-4 ${colorClass}`}>
          <h2 className="text-xl font-black">{state.title}</h2>
          <p className="mt-3 whitespace-pre-line text-sm font-semibold leading-6">
            {state.message}
          </p>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800"
          >
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}

function ProgressModal({ state }: { state: ProgressModalState }) {
  if (!state.open) return null;

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-950/50 px-4">
      <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl">
        <div className="flex items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-green-800" />

          <div>
            <h2 className="text-xl font-black text-slate-950">
              {state.title}
            </h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
              {state.message}
            </p>
          </div>
        </div>

        <div className="mt-6 h-3 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-green-800" />
        </div>
      </div>
    </div>
  );
}