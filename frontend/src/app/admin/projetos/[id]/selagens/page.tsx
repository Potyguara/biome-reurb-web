"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Eye,
  Filter,
  Link2,
  Loader2,
  MapPin,
  Pencil,
  Phone,
  RefreshCw,
  Search,
  Trash2,
  Unlink,
  User,
  X,
} from "lucide-react";

import { api, clearToken, getStoredToken, setAuthToken } from "@/lib/api";

type Project = {
  id: string;
  name: string;
  municipality?: string | null;
  state?: string | null;
  neighborhood?: string | null;
  reurb_type?: string | null;
  status?: string | null;
};

type ProjectSeal = {
  id: string;
  project_id: string;
  lot_id?: string | null;

  seal_code: string;
  lot_code?: string | null;
  situation: string;

  geo_link_status: string;
  needs_rtk_validation: boolean;
  geospatial_note?: string | null;

  latitude?: number | null;
  longitude?: number | null;
  gps_accuracy?: number | null;

  informant_name?: string | null;
  informant_phone?: string | null;
  responsible_name?: string | null;
  responsible_cpf?: string | null;
  phone?: string | null;

  address?: string | null;
  notes?: string | null;

  property_type?: string | null;
  property_use?: string | null;

  morador_presente?: boolean | null;
  moradia_ocupada?: boolean | null;
  revisita_necessaria?: boolean | null;
  tipo_unidade?: string | null;
  uso_imovel?: string | null;

  social_count?: number | null;
  physical_count?: number | null;
  documents_count?: number | null;

  created_at?: string | null;
  updated_at?: string | null;
};

type SealDeleteCheckResponse = {
  can_delete: boolean;
  seal_id: string;
  seal_code: string;
  links: {
    lot?: number;
    social_registrations?: number;
    physical_registrations?: number;
    documents?: number;
  };
  message: string;
};

type ModalState = {
  open: boolean;
  type: "loading" | "success" | "error" | "confirm";
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
};

type GeoStatusFilter = "todos" | "confirmado" | "nao_validado" | "pendente";
type RtkFilter = "todos" | "sim" | "nao";
type LinkFilter = "todos" | "vinculadas" | "sem_lote";

function safeText(value: unknown, fallback = "-"): string {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();

  return text.length > 0 ? text : fallback;
}

function normalizeLabel(value: string | null | undefined): string {
  if (!value) return "-";

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";

  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 8,
  }).format(value);
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  const responseData = (
    error as {
      response?: {
        data?: unknown;
        status?: number;
      };
    }
  ).response?.data;

  if (!responseData) return fallback;

  if (typeof responseData === "string") return responseData;

  if (typeof responseData === "object" && responseData !== null) {
    const data = responseData as Record<string, unknown>;

    if (typeof data.detail === "string") return data.detail;

    if (Array.isArray(data.detail)) {
      return data.detail
        .map((item) => {
          if (typeof item === "object" && item !== null) {
            const obj = item as Record<string, unknown>;
            const loc = Array.isArray(obj.loc) ? obj.loc.join(".") : "campo";
            const msg = safeText(obj.msg, "inválido");

            return `${loc}: ${msg}`;
          }

          return String(item);
        })
        .join("\n");
    }

    if (typeof data.message === "string") return data.message;
    if (typeof data.error === "string") return data.error;
  }

  return fallback;
}

function getResponsibleName(seal: ProjectSeal): string {
  return (
    seal.responsible_name?.trim() ||
    seal.informant_name?.trim() ||
    "Não informado"
  );
}

function getPhone(seal: ProjectSeal): string {
  return (
    seal.phone?.trim() ||
    seal.informant_phone?.trim() ||
    "Não informado"
  );
}

function getAddress(seal: ProjectSeal): string {
  return (
    seal.address?.trim() ||
    seal.geospatial_note?.trim() ||
    seal.notes?.trim() ||
    "Não informado"
  );
}

function getLotLabel(seal: ProjectSeal): string {
  if (seal.lot_code?.trim()) return seal.lot_code.trim();
  if (seal.lot_id) return "Vinculado";
  return "Não vinculado";
}

function isLinked(seal: ProjectSeal): boolean {
  return Boolean(seal.lot_id);
}

function getGeoStatusClass(status: string): string {
  const normalized = status.toLowerCase();

  if (normalized.includes("confirm")) {
    return "bg-green-100 text-green-800";
  }

  if (normalized.includes("pend")) {
    return "bg-amber-100 text-amber-900";
  }

  if (normalized.includes("nao") || normalized.includes("não")) {
    return "bg-red-50 text-red-700";
  }

  return "bg-slate-100 text-slate-700";
}

export default function ProjectSealsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const projectId = params.id;

  const [project, setProject] = useState<Project | null>(null);
  const [records, setRecords] = useState<ProjectSeal[]>([]);

  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [geoStatusFilter, setGeoStatusFilter] =
    useState<GeoStatusFilter>("todos");
  const [rtkFilter, setRtkFilter] = useState<RtkFilter>("todos");
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("todos");

  const [modal, setModal] = useState<ModalState>({
    open: false,
    type: "loading",
    title: "",
    message: "",
  });
  const [editingSeal, setEditingSeal] = useState<ProjectSeal | null>(null);

const [editForm, setEditForm] = useState({
  seal_code: "",
  lot_code: "",
  situation: "",
  geo_link_status: "",
  needs_rtk_validation: false,
  geospatial_note: "",
  latitude: "",
  longitude: "",
  gps_accuracy: "",
});

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function load() {
    const token = getStoredToken();

    if (!token) {
      router.push("/login");
      return;
    }

    setAuthToken(token);
    setLoading(true);

    try {
      const [projectResponse, sealsResponse] = await Promise.all([
        api.get<Project>(`/projects/${projectId}`),
        api.get<ProjectSeal[]>(`/projects/${projectId}/seals`),
      ]);

      setProject(projectResponse.data);
      setRecords(sealsResponse.data ?? []);
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response
        ?.status;

      if (status === 401 || status === 403) {
        clearToken();
        router.push("/login");
        return;
      }

      showError(
        "Erro ao carregar selagens",
        getApiErrorMessage(
          error,
          "Não foi possível carregar as selagens do projeto.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  function openLot(seal: ProjectSeal) {
    if (!seal.lot_id) {
      showError(
        "Selagem sem lote vinculado",
        "Esta selagem ainda não possui lote vinculado. Faça o vínculo pela tela de detalhe do lote ou pelo mapa núcleo.",
      );
      return;
    }

    router.push(`/admin/projetos/${projectId}/lotes/${seal.lot_id}`);
  }

  function openMap() {
    router.push(`/admin/projetos/${projectId}/mapa`);
  }

  async function askDeleteSeal(seal: ProjectSeal) {
    try {
      setActionId(seal.id);
      showLoading(
        "Verificando vínculos",
        "Aguarde enquanto verificamos se a selagem possui cadastros, documentos ou lote vinculado.",
      );

      const response = await api.get<SealDeleteCheckResponse>(
        `/projects/${projectId}/seals/${seal.id}/delete-check`,
        {
          validateStatus: (status) => status < 500,
        },
      );

      if (response.status === 404) {
        closeModal();

        setModal({
          open: true,
          type: "confirm",
          title: "Excluir selagem",
          message: `Tem certeza que deseja excluir a selagem "${seal.seal_code}"? Recomenda-se confirmar antes se não existem cadastro social, cadastro físico ou documentos vinculados.`,
          confirmText: "Excluir selagem",
          cancelText: "Cancelar",
          onConfirm: () => deleteSeal(seal),
        });

        return;
      }

      const check = response.data;

      if (!check.can_delete) {
        showError(
          "Selagem possui vínculos ativos",
          [
            "Esta selagem não pode ser excluída porque possui vínculos ativos.",
            "",
            `Lote vinculado: ${check.links.lot ?? 0}`,
            `Cadastros sociais: ${check.links.social_registrations ?? 0}`,
            `Cadastros físicos: ${check.links.physical_registrations ?? 0}`,
            `Documentos: ${check.links.documents ?? 0}`,
            "",
            "Desvincule ou exclua os registros relacionados antes de remover a selagem.",
          ].join("\n"),
        );

        return;
      }

      setModal({
        open: true,
        type: "confirm",
        title: "Excluir selagem",
        message: `Tem certeza que deseja excluir a selagem "${seal.seal_code}"? Essa ação não poderá ser desfeita.`,
        confirmText: "Excluir selagem",
        cancelText: "Cancelar",
        onConfirm: () => deleteSeal(seal),
      });
    } catch (error) {
      showError(
        "Erro ao verificar vínculos",
        getApiErrorMessage(
          error,
          "Não foi possível verificar se a selagem pode ser excluída.",
        ),
      );
    } finally {
      setActionId(null);
    }
  }

  async function deleteSeal(seal: ProjectSeal) {
    try {
      setActionId(seal.id);
      showLoading("Excluindo selagem", "Aguarde enquanto a selagem é removida.");

      await api.delete(`/projects/${projectId}/seals/${seal.id}`);

      await load();

      showSuccess(
        "Selagem excluída",
        `A selagem ${seal.seal_code} foi excluída com sucesso.`,
      );
    } catch (error) {
      showError(
        "Erro ao excluir selagem",
        getApiErrorMessage(error, "Não foi possível excluir a selagem."),
      );
    } finally {
      setActionId(null);
    }
  }

  function showLoading(title: string, message: string) {
    setModal({
      open: true,
      type: "loading",
      title,
      message,
    });
  }

  function showSuccess(title: string, message: string) {
    setModal({
      open: true,
      type: "success",
      title,
      message,
      confirmText: "Entendi",
    });
  }

  function showError(title: string, message: string) {
    setModal({
      open: true,
      type: "error",
      title,
      message,
      confirmText: "Entendi",
    });
  }

  function closeModal() {
    setModal((current) => ({
      ...current,
      open: false,
    }));
  }

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase();

    return records.filter((record) => {
      const haystack = [
        record.seal_code,
        record.lot_code,
        record.situation,
        record.geo_link_status,
        getResponsibleName(record),
        getPhone(record),
        getAddress(record),
        record.responsible_cpf,
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = !term || haystack.includes(term);

      const normalizedGeo = record.geo_link_status?.toLowerCase() ?? "";

      const matchesGeo =
        geoStatusFilter === "todos" ||
        normalizedGeo.includes(geoStatusFilter);

      const matchesRtk =
        rtkFilter === "todos" ||
        (rtkFilter === "sim" && record.needs_rtk_validation) ||
        (rtkFilter === "nao" && !record.needs_rtk_validation);

      const matchesLink =
        linkFilter === "todos" ||
        (linkFilter === "vinculadas" && isLinked(record)) ||
        (linkFilter === "sem_lote" && !isLinked(record));

      return matchesSearch && matchesGeo && matchesRtk && matchesLink;
    });
  }, [records, search, geoStatusFilter, rtkFilter, linkFilter]);

  const totalLinked = records.filter(isLinked).length;
  const totalWithoutLot = records.length - totalLinked;
  const totalRtk = records.filter((item) => item.needs_rtk_validation).length;
  const totalConfirmed = records.filter((item) =>
    item.geo_link_status?.toLowerCase().includes("confirm"),
  ).length;

  function openEditSeal(seal: ProjectSeal) {
  setEditingSeal(seal);

  setEditForm({
    seal_code: seal.seal_code ?? "",
    lot_code: seal.lot_code ?? "",
    situation: seal.situation ?? "",
    geo_link_status: seal.geo_link_status ?? "",
    needs_rtk_validation: Boolean(seal.needs_rtk_validation),
    geospatial_note: seal.geospatial_note ?? "",
    latitude: seal.latitude !== null && seal.latitude !== undefined ? String(seal.latitude) : "",
    longitude: seal.longitude !== null && seal.longitude !== undefined ? String(seal.longitude) : "",
    gps_accuracy:
      seal.gps_accuracy !== null && seal.gps_accuracy !== undefined
        ? String(seal.gps_accuracy)
        : "",
  });
}

function parseOptionalNumber(value: string): number | null {
  const text = value.trim();

  if (!text) return null;

  const number = Number(text.replace(",", "."));

  return Number.isFinite(number) ? number : null;
}

async function saveSealEdit() {
  if (!editingSeal) return;

  try {
    setActionId(editingSeal.id);

    showLoading(
      "Salvando selagem",
      "Aguarde enquanto as informações da selagem são atualizadas.",
    );

    await api.patch(
      `/projects/${projectId}/seals/${editingSeal.id}`,
      {
        seal_code: editForm.seal_code.trim(),
        lot_code: editForm.lot_code.trim() || null,
        situation: editForm.situation.trim(),
        geo_link_status: editForm.geo_link_status.trim(),
        needs_rtk_validation: editForm.needs_rtk_validation,
        geospatial_note: editForm.geospatial_note.trim() || null,
        latitude: parseOptionalNumber(editForm.latitude),
        longitude: parseOptionalNumber(editForm.longitude),
        gps_accuracy: parseOptionalNumber(editForm.gps_accuracy),
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    setEditingSeal(null);

    await load();

    showSuccess(
      "Selagem atualizada",
      `A selagem ${editForm.seal_code} foi atualizada com sucesso.`,
    );
  } catch (error) {
    showError(
      "Erro ao atualizar selagem",
      getApiErrorMessage(error, "Não foi possível atualizar a selagem."),
    );
  } finally {
    setActionId(null);
  }
}

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
          <button
            type="button"
            onClick={() => router.push(`/admin/projetos/${projectId}`)}
            className="inline-flex w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao projeto
          </button>

          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.45em] text-green-700">
                Selagens
              </p>

              <h1 className="mt-3 text-4xl font-black tracking-tight">
                Conferência de selagens
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Selagens de campo, vínculo preliminar com lotes, situação do
                atendimento, responsável, coordenadas e necessidade de validação
                geoespacial.
              </p>

              {project && (
                <p className="mt-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                  {project.name} · {project.municipality ?? "-"}
                  /{project.state ?? "-"} · {project.neighborhood ?? "-"}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Atualizar
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 grid gap-4 md:grid-cols-5">
          <SummaryCard
            icon={<Link2 className="h-7 w-7" />}
            title="Total"
            value={String(records.length)}
          />
          <SummaryCard
            icon={<BadgeCheck className="h-7 w-7" />}
            title="Vinculadas"
            value={String(totalLinked)}
          />
          <SummaryCard
            icon={<Unlink className="h-7 w-7" />}
            title="Sem lote"
            value={String(totalWithoutLot)}
          />
          <SummaryCard
            icon={<BadgeCheck className="h-7 w-7" />}
            title="Confirmadas"
            value={String(totalConfirmed)}
          />
          <SummaryCard
            icon={<AlertTriangle className="h-7 w-7" />}
            title="Necessitam RTK"
            value={String(totalRtk)}
          />
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-2xl font-black">Lista de selagens</h2>
              <p className="mt-1 text-sm text-slate-600">
                {loading
                  ? "Carregando registros..."
                  : `${filteredRecords.length} selagem(ns) encontrada(s).`}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 md:col-span-4 xl:col-span-1">
                <Search className="h-5 w-5 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por selo, lote, nome, CPF ou telefone"
                  className="w-full min-w-[280px] bg-transparent text-sm font-medium outline-none placeholder:text-slate-400"
                />
              </div>

              <FilterSelect
                label="Vínculo geo"
                value={geoStatusFilter}
                onChange={(value) =>
                  setGeoStatusFilter(value as GeoStatusFilter)
                }
                options={[
                  ["todos", "Todos"],
                  ["confirmado", "Confirmado"],
                  ["pendente", "Pendente"],
                  ["nao_validado", "Não validado"],
                ]}
              />

              <FilterSelect
                label="RTK"
                value={rtkFilter}
                onChange={(value) => setRtkFilter(value as RtkFilter)}
                options={[
                  ["todos", "Todos"],
                  ["sim", "Necessita"],
                  ["nao", "Não necessita"],
                ]}
              />

              <FilterSelect
                label="Lote"
                value={linkFilter}
                onChange={(value) => setLinkFilter(value as LinkFilter)}
                options={[
                  ["todos", "Todos"],
                  ["vinculadas", "Vinculadas"],
                  ["sem_lote", "Sem lote"],
                ]}
              />
            </div>
          </div>

          {loading && (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-10 text-center">
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-green-700" />
              <p className="mt-4 font-bold text-slate-700">
                Carregando selagens do projeto...
              </p>
            </div>
          )}

          {!loading && filteredRecords.length === 0 && (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <Link2 className="mx-auto h-12 w-12 text-slate-400" />
              <p className="mt-4 font-bold text-slate-700">
                Nenhuma selagem encontrada.
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Ajuste os filtros, importe um pacote mobile ou atualize a
                página.
              </p>
            </div>
          )}

          {!loading && filteredRecords.length > 0 && (
            <div className="space-y-5">
              {filteredRecords.map((record) => {
                const busy = actionId === record.id;
                const linked = isLinked(record);

                return (
                  <article
                    key={record.id}
                    className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-2xl font-black">
                            {record.seal_code}
                          </h3>

                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                            {normalizeLabel(record.situation)}
                          </span>

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-black ${getGeoStatusClass(
                              record.geo_link_status,
                            )}`}
                          >
                            {normalizeLabel(record.geo_link_status)}
                          </span>

                          {linked ? (
                            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-black text-green-800">
                              Lote vinculado
                            </span>
                          ) : (
                            <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700">
                              Sem lote
                            </span>
                          )}

                          {record.needs_rtk_validation && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">
                              <AlertTriangle className="h-3 w-3" />
                              Validar RTK
                            </span>
                          )}
                        </div>

                        <p className="mt-3 text-sm font-bold text-slate-600">
                          Lote declarado/vinculado:{" "}
                          <span className="text-slate-950">
                            {getLotLabel(record)}
                          </span>
                        </p>
                      </div>

                      <div className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-600">
                        <p>Lat: {formatNumber(record.latitude)}</p>
                        <p>Lon: {formatNumber(record.longitude)}</p>
                        <p>Precisão: {formatNumber(record.gps_accuracy)} m</p>
                      </div>
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-3">
                      <InfoCard
                        icon={<User className="h-5 w-5" />}
                        title="Informante / responsável"
                        value={getResponsibleName(record)}
                      />

                      <InfoCard
                        icon={<Phone className="h-5 w-5" />}
                        title="Telefone"
                        value={getPhone(record)}
                      />

                      <InfoCard
                        icon={<MapPin className="h-5 w-5" />}
                        title="Endereço / referência"
                        value={getAddress(record)}
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {record.morador_presente && (
                        <Badge text="Morador presente" />
                      )}

                      {record.moradia_ocupada && (
                        <Badge text="Moradia ocupada" />
                      )}

                      {record.revisita_necessaria && (
                        <Badge text="Revisita necessária" variant="warning" />
                      )}

                      <Badge
                        text={normalizeLabel(
                          record.tipo_unidade ??
                            record.property_type ??
                            "unidade não informada",
                        )}
                      />

                      <Badge
                        text={normalizeLabel(
                          record.uso_imovel ??
                            record.property_use ??
                            "uso não informado",
                        )}
                      />
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
  type="button"
  disabled={busy}
  onClick={() => openEditSeal(record)}
  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
>
  <Pencil className="h-4 w-4" />
  Editar
</button>
                      <button
                        type="button"
                        disabled={busy || !linked}
                        onClick={() => openLot(record)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Eye className="h-4 w-4" />
                        Ver lote
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={openMap}
                        className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-800 transition hover:bg-blue-100 disabled:opacity-60"
                      >
                        <MapPin className="h-4 w-4" />
                        Ver mapa
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => askDeleteSeal(record)}
                        className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        Excluir
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {editingSeal && (
  <SealEditModal
    form={editForm}
    onChange={setEditForm}
    onClose={() => setEditingSeal(null)}
    onSave={saveSealEdit}
    saving={actionId === editingSeal.id}
  />
)}

{modal.open && <FeedbackModal modal={modal} onClose={closeModal} />}
    </main>
  );
}

function SummaryCard({
  icon,
  title,
  value,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-green-700">{icon}</div>
      <p className="mt-5 text-sm font-bold text-slate-500">{title}</p>
      <p className="mt-2 text-4xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <label className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2">
      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
        {label}
      </span>

      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-slate-400" />

        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none"
        >
          {options.map(([optionValue, optionLabel]) => (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}

function InfoCard({
  icon,
  title,
  value,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-5">
      <div className="text-green-700">{icon}</div>

      <p className="mt-4 text-xs font-black uppercase tracking-wider text-slate-400">
        {title}
      </p>

      <p className="mt-2 break-words text-base font-black text-slate-950">
        {value}
      </p>
    </div>
  );
}

function Badge({
  text,
  variant = "success",
}: {
  text: string;
  variant?: "success" | "warning";
}) {
  const className =
    variant === "warning"
      ? "bg-amber-100 text-amber-800"
      : "bg-green-100 text-green-800";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black ${className}`}>
      {text}
    </span>
  );
}



function FeedbackModal({
  modal,
  onClose,
}: {
  modal: ModalState;
  onClose: () => void;
}) {
  const isLoading = modal.type === "loading";
  const isError = modal.type === "error";
  const isSuccess = modal.type === "success";
  const isConfirm = modal.type === "confirm";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 px-4">
      <div className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl">
        <div
          className={`rounded-3xl p-5 ${
            isError
              ? "bg-red-50 text-red-800"
              : isSuccess
                ? "bg-green-50 text-green-800"
                : isConfirm
                  ? "bg-amber-50 text-amber-900"
                  : "bg-slate-50 text-slate-800"
          }`}
        >
          <div className="flex items-start gap-4">
            <div className="mt-1">
              {isLoading && <Loader2 className="h-7 w-7 animate-spin" />}
              {isError && <AlertTriangle className="h-7 w-7" />}
              {isSuccess && <BadgeCheck className="h-7 w-7" />}
              {isConfirm && <AlertTriangle className="h-7 w-7" />}
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="text-xl font-black">{modal.title}</h3>
              <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6">
                {modal.message}
              </p>
            </div>

            {!isLoading && !isConfirm && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-full bg-white/70 p-2"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {!isLoading && (
          <div className="mt-6 flex justify-end gap-3">
            {isConfirm && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                {modal.cancelText ?? "Cancelar"}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (isConfirm && modal.onConfirm) {
                  modal.onConfirm();
                  return;
                }

                onClose();
              }}
              className={`rounded-2xl px-5 py-3 text-sm font-black text-white transition ${
                isError || isConfirm
                  ? "bg-red-700 hover:bg-red-800"
                  : "bg-slate-950 hover:bg-slate-800"
              }`}
            >
              {modal.confirmText ?? "Entendi"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
function SealEditModal({
  form,
  onChange,
  onClose,
  onSave,
  saving,
}: {
  form: {
    seal_code: string;
    lot_code: string;
    situation: string;
    geo_link_status: string;
    needs_rtk_validation: boolean;
    geospatial_note: string;
    latitude: string;
    longitude: string;
    gps_accuracy: string;
  };
  onChange: React.Dispatch<
    React.SetStateAction<{
      seal_code: string;
      lot_code: string;
      situation: string;
      geo_link_status: string;
      needs_rtk_validation: boolean;
      geospatial_note: string;
      latitude: string;
      longitude: string;
      gps_accuracy: string;
    }>
  >;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  function updateField(field: keyof typeof form, value: string | boolean) {
    onChange((current) => ({
      ...current,
      [field]: value,
    }));
  }

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center overflow-y-auto bg-slate-950/50 px-4 py-8">
      <div className="w-full max-w-4xl rounded-[2rem] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-green-700">
              Edição administrativa
            </p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">
              Editar selagem
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Corrija as informações coletadas em campo antes da validação final.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200 disabled:opacity-60"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <TextField
            label="Código da selagem"
            value={form.seal_code}
            onChange={(value) => updateField("seal_code", value)}
          />

          <TextField
            label="Código do lote declarado"
            value={form.lot_code}
            onChange={(value) => updateField("lot_code", value)}
          />

          <SelectField
            label="Situação"
            value={form.situation}
            onChange={(value) => updateField("situation", value)}
            options={[
              ["ocupado", "Ocupado"],
              ["ausente", "Morador ausente"],
              ["fechado", "Imóvel fechado"],
              ["vazio", "Vazio"],
              ["construcao", "Em construção"],
              ["recusa", "Recusa"],
              ["revisita", "Revisita"],
            ]}
          />

          <SelectField
            label="Status do vínculo geográfico"
            value={form.geo_link_status}
            onChange={(value) => updateField("geo_link_status", value)}
            options={[
              ["nao_validado", "Não validado"],
              ["pendente", "Pendente"],
              ["confirmado", "Confirmado"],
              ["divergente", "Divergente"],
            ]}
          />

          <TextField
            label="Latitude"
            value={form.latitude}
            onChange={(value) => updateField("latitude", value)}
            placeholder="-0.034..."
          />

          <TextField
            label="Longitude"
            value={form.longitude}
            onChange={(value) => updateField("longitude", value)}
            placeholder="-51.07..."
          />

          <TextField
            label="Precisão GPS estimada (m)"
            value={form.gps_accuracy}
            onChange={(value) => updateField("gps_accuracy", value)}
          />

          <label className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <input
              type="checkbox"
              checked={form.needs_rtk_validation}
              onChange={(event) =>
                updateField("needs_rtk_validation", event.target.checked)
              }
              className="h-5 w-5 accent-green-700"
            />
            <span className="text-sm font-black text-slate-700">
              Necessita validação RTK
            </span>
          </label>

          <div className="md:col-span-2">
            <label className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Observação geoespacial
              </span>

              <textarea
                value={form.geospatial_note}
                onChange={(event) =>
                  updateField("geospatial_note", event.target.value)
                }
                rows={4}
                className="mt-2 w-full resize-none bg-transparent text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400"
                placeholder="Informe divergências, necessidade de retorno a campo, problema de GPS ou observação técnica."
              />
            </label>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 md:flex-row md:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-green-700 px-5 py-3 text-sm font-black text-white transition hover:bg-green-800 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar alterações
          </button>
        </div>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
        {label}
      </span>

      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full bg-transparent text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <label className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
        {label}
      </span>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full bg-transparent text-sm font-bold text-slate-800 outline-none"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}