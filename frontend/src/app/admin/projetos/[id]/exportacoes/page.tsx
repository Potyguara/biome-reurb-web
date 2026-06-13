"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Download,
  FileArchive,
  FileSpreadsheet,
  FileText,
  FolderDown,
  Layers,
  Loader2,
  Map,
  PackageCheck,
  RefreshCw,
  X,
} from "lucide-react";

import { api, clearToken, getStoredToken, setAuthToken } from "@/lib/api";

type ExportSummary = {
  project_id: string;
  project_name: string;
  municipality?: string | null;
  state?: string | null;
  neighborhood?: string | null;

  total_lots: number;
  lots_with_geometry: number;
  ready_lots: number;
  pending_lots: number;

  total_seals: number;
  total_social_registrations: number;
  total_physical_registrations: number;

  total_documents: number;
  validated_documents: number;

  can_export_metricatopo: boolean;
  generated_at: string;
};

type ModalState = {
  open: boolean;
  type: "loading" | "success" | "error";
  title: string;
  message: string;
};



function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    maximumFractionDigits: 1,
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
            const msg =
              typeof obj.msg === "string" ? obj.msg : "valor inválido";

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

function getFilenameFromContentDisposition(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].replaceAll('"', "").trim());
    } catch {
      return utf8Match[1].replaceAll('"', "").trim();
    }
  }

  const normalMatch = value.match(/filename="?([^"]+)"?/i);
  if (normalMatch?.[1]) {
    return normalMatch[1].replaceAll('"', "").trim();
  }

  return null;
}

export default function ProjectExportsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const projectId = params.id;

  const [summary, setSummary] = useState<ExportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  const [modal, setModal] = useState<ModalState>({
    open: false,
    type: "loading",
    title: "",
    message: "",
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
      const response = await api.get<ExportSummary>(
        `/projects/${projectId}/exports/summary`,
      );

      setSummary(response.data);
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response
        ?.status;

      if (status === 401 || status === 403) {
        clearToken();
        router.push("/login");
        return;
      }

      showError(
        "Erro ao carregar resumo",
        getApiErrorMessage(
          error,
          "Não foi possível carregar o resumo de exportações do projeto.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  async function downloadMatrix() {
    try {
      setDownloading("matrix");

      showLoading(
        "Gerando Planilha-Matriz REURB",
        "Aguarde enquanto o sistema consolida lotes, selagens, cadastros, documentos e pendências.",
      );

      const response = await api.get(
        `/projects/${projectId}/exports/matrix`,
        {
          responseType: "blob",
          validateStatus: (status) => status < 500,
        },
      );

      if (response.status !== 200) {
        showError(
          "Erro ao exportar planilha",
          "Não foi possível gerar a Planilha-Matriz REURB.",
        );
        return;
      }

      const contentDisposition = response.headers?.["content-disposition"];
      const headerFilename =
        getFilenameFromContentDisposition(contentDisposition);

      const filename =
        headerFilename ||
        `matriz_reurb_${projectId}_${new Date()
          .toISOString()
          .slice(0, 10)}.xlsx`;

      const contentTypeHeader = response.headers?.["content-type"];
      const contentType =
        typeof contentTypeHeader === "string"
          ? contentTypeHeader
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

      const blob = new Blob([response.data], {
        type: contentType,
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

      showSuccess(
        "Planilha gerada",
        "A Planilha-Matriz REURB foi exportada com sucesso.",
      );

      await load();
    } catch (error) {
      showError(
        "Erro ao exportar planilha",
        getApiErrorMessage(
          error,
          "Não foi possível exportar a Planilha-Matriz REURB.",
        ),
      );
    } finally {
      setDownloading(null);
    }
  }

  async function downloadGeospatialPackage() {
  try {
    setDownloading("geospatial");

    showLoading(
      "Gerando pacote geoespacial",
      "Aguarde enquanto o sistema consolida lotes, selagens e atributos em arquivos GeoJSON e CSV.",
    );

    const response = await api.get(
      `/projects/${projectId}/exports/geospatial-package`,
      {
        responseType: "blob",
        validateStatus: (status) => status < 500,
      },
    );

    if (response.status !== 200) {
      showError(
        "Erro ao exportar pacote",
        "Não foi possível gerar o pacote geoespacial do núcleo.",
      );
      return;
    }

    const contentDisposition = response.headers?.["content-disposition"];
    const headerFilename =
      getFilenameFromContentDisposition(contentDisposition);

    const filename =
      headerFilename ||
      `pacote_geoespacial_reurb_${projectId}_${new Date()
        .toISOString()
        .slice(0, 10)}.zip`;

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

    showSuccess(
      "Pacote geoespacial gerado",
      "O pacote geoespacial do núcleo foi exportado com sucesso.",
    );

    await load();
  } catch (error) {
    showError(
      "Erro ao exportar pacote",
      getApiErrorMessage(
        error,
        "Não foi possível exportar o pacote geoespacial do núcleo.",
      ),
    );
  } finally {
    setDownloading(null);
  }
}

async function downloadMetricatopoPackage() {
  try {
    setDownloading("metricatopo");

    showLoading(
      "Gerando pacote Métrica TOPO",
      "Aguarde enquanto o sistema consolida os lotes aptos, vértices, atributos e confrontantes preliminares.",
    );

    const response = await api.get(
      `/projects/${projectId}/exports/metricatopo-package`,
      {
        responseType: "blob",
        validateStatus: (status) => status < 500,
      },
    );

    if (response.status !== 200) {
      showError(
        "Erro ao exportar pacote",
        "Não foi possível gerar o pacote Métrica TOPO. Verifique se existem lotes aptos com geometria.",
      );
      return;
    }

    const contentDisposition = response.headers?.["content-disposition"];
    const headerFilename =
      getFilenameFromContentDisposition(contentDisposition);

    const filename =
      headerFilename ||
      `pacote_metricatopo_reurb_${projectId}_${new Date()
        .toISOString()
        .slice(0, 10)}.zip`;

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

    showSuccess(
      "Pacote Métrica TOPO gerado",
      "O pacote com lotes aptos, atributos, vértices e confrontantes preliminares foi exportado com sucesso.",
    );

    await load();
  } catch (error) {
    showError(
      "Erro ao exportar pacote",
      getApiErrorMessage(
        error,
        "Não foi possível exportar o pacote Métrica TOPO.",
      ),
    );
  } finally {
    setDownloading(null);
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
    });
  }

  function showError(title: string, message: string) {
    setModal({
      open: true,
      type: "error",
      title,
      message,
    });
  }

  function closeModal() {
    setModal((current) => ({
      ...current,
      open: false,
    }));
  }

  async function downloadLotsDossiers() {
  try {
    setDownloading("dossiers");

    showLoading(
      "Gerando dossiês individuais",
      "Aguarde enquanto o sistema organiza fichas cadastrais, documentos, geometrias e atributos por lote.",
    );

    const response = await api.get(
      `/projects/${projectId}/exports/lots-dossiers`,
      {
        responseType: "blob",
        validateStatus: (status) => status < 500,
      },
    );

    if (response.status !== 200) {
      showError(
        "Erro ao exportar dossiês",
        "Não foi possível gerar os dossiês individuais dos lotes.",
      );
      return;
    }

    const contentDisposition = response.headers?.["content-disposition"];
    const headerFilename =
      getFilenameFromContentDisposition(contentDisposition);

    const filename =
      headerFilename ||
      `dossies_lotes_reurb_${projectId}_${new Date()
        .toISOString()
        .slice(0, 10)}.zip`;

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

    showSuccess(
      "Dossiês individuais gerados",
      "Os dossiês dos lotes foram exportados com sucesso.",
    );

    await load();
  } catch (error) {
    showError(
      "Erro ao exportar dossiês",
      getApiErrorMessage(
        error,
        "Não foi possível exportar os dossiês individuais dos lotes.",
      ),
    );
  } finally {
    setDownloading(null);
  }
}

  const readyPercent =
    summary && summary.total_lots > 0
      ? summary.ready_lots / summary.total_lots
      : 0;

  const documentPercent =
    summary && summary.total_documents > 0
      ? summary.validated_documents / summary.total_documents
      : 0;

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
                Produtos técnicos
              </p>

              <h1 className="mt-3 text-4xl font-black tracking-tight">
                Exportações REURB
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Gere produtos técnico-cadastrais consolidados para a Prefeitura,
                equipe técnica e integração com o Métrica TOPO.
              </p>

              {summary && (
                <p className="mt-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                  {summary.project_name} · {summary.municipality ?? "-"}
                  /{summary.state ?? "-"} · {summary.neighborhood ?? "-"}
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
        {loading && (
          <div className="rounded-[2rem] border border-slate-200 bg-white p-10 text-center shadow-sm">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-green-700" />
            <p className="mt-4 font-bold text-slate-700">
              Carregando produtos técnicos...
            </p>
          </div>
        )}

        {!loading && summary && (
          <>
            <div className="mb-8 grid gap-4 md:grid-cols-4">
              <SummaryCard
                icon={<Layers className="h-7 w-7" />}
                title="Total de lotes"
                value={String(summary.total_lots)}
                detail={`${summary.lots_with_geometry} com geometria`}
              />

              <SummaryCard
                icon={<BadgeCheck className="h-7 w-7" />}
                title="Lotes aptos"
                value={String(summary.ready_lots)}
                detail={formatPercent(readyPercent)}
              />

              <SummaryCard
                icon={<AlertTriangle className="h-7 w-7" />}
                title="Lotes pendentes"
                value={String(summary.pending_lots)}
                detail="Exigem saneamento"
              />

              <SummaryCard
                icon={<FileText className="h-7 w-7" />}
                title="Documentos validados"
                value={`${summary.validated_documents}/${summary.total_documents}`}
                detail={formatPercent(documentPercent)}
              />
            </div>

            <div className="mb-8 grid gap-4 md:grid-cols-3">
              <SmallInfoCard
                title="Selagens"
                value={String(summary.total_seals)}
              />
              <SmallInfoCard
                title="Cadastros sociais"
                value={String(summary.total_social_registrations)}
              />
              <SmallInfoCard
                title="Cadastros físicos"
                value={String(summary.total_physical_registrations)}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <ExportCard
                icon={<FileSpreadsheet className="h-8 w-8" />}
                title="Planilha-Matriz REURB"
                description="Exporta uma planilha Excel consolidando lote, selagem, cadastro social, cadastro físico, documentos, pendências e status de aptidão."
                status="Disponível"
                buttonText="Exportar planilha matriz"
                onClick={downloadMatrix}
                loading={downloading === "matrix"}
                enabled
              />

<ExportCard
  icon={<Map className="h-8 w-8" />}
  title="Pacote geoespacial do núcleo"
  description="Exporta lotes, selagens e atributos consolidados em GeoJSON e CSV, compatíveis com SIG, Google Earth e softwares técnicos."
  status="Disponível"
  buttonText="Exportar pacote geoespacial"
  onClick={downloadGeospatialPackage}
  loading={downloading === "geospatial"}
  enabled
/>

<ExportCard
  icon={<FileArchive className="h-8 w-8" />}
  title="Pacote Métrica TOPO"
  description="Exporta geometrias, atributos, vértices e confrontantes preliminares dos lotes aptos para subsidiar planta, memorial e conferência no Métrica TOPO."
  status={summary.can_export_metricatopo ? "Disponível" : "Sem lotes aptos"}
  buttonText={
    summary.can_export_metricatopo
      ? "Exportar pacote Métrica TOPO"
      : "Sem lotes aptos"
  }
  onClick={downloadMetricatopoPackage}
  loading={downloading === "metricatopo"}
  enabled={summary.can_export_metricatopo}
/>

      <ExportCard
  icon={<FolderDown className="h-8 w-8" />}
  title="Dossiês individuais dos lotes"
  description="Gera pacote por lote com ficha cadastral em PDF, documentos, geometria individual, atributos consolidados e metadados."
  status="Disponível"
  buttonText="Exportar dossiês dos lotes"
  onClick={downloadLotsDossiers}
  loading={downloading === "dossiers"}
  enabled
/>
            </div>

            <div className="mt-8 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-green-50 p-3 text-green-800">
                  <PackageCheck className="h-6 w-6" />
                </div>

                <div>
                  <h2 className="text-xl font-black">
                    Situação da exportação técnica
                  </h2>

                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                    A Planilha-Matriz REURB é o primeiro produto consolidado da
                    plataforma. Ela serve como base administrativa para análise
                    da Prefeitura, controle interno da equipe técnica e
                    preparação dos dados que futuramente alimentarão os pacotes
                    geoespaciais e o Métrica TOPO.
                  </p>

                  <p className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                    Última leitura do resumo:{" "}
                    {formatDateTime(summary.generated_at)}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {modal.open && <FeedbackModal modal={modal} onClose={closeModal} />}
    </main>
  );
}

function SummaryCard({
  icon,
  title,
  value,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-green-700">{icon}</div>
      <p className="mt-5 text-sm font-bold text-slate-500">{title}</p>
      <p className="mt-2 text-4xl font-black text-slate-950">{value}</p>
      {detail && (
        <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-400">
          {detail}
        </p>
      )}
    </div>
  );
}

function SmallInfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wider text-slate-400">
        {title}
      </p>
      <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function ExportCard({
  icon,
  title,
  description,
  status,
  buttonText,
  onClick,
  loading,
  enabled,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  status: string;
  buttonText: string;
  onClick: () => void;
  loading: boolean;
  enabled: boolean;
}) {
  return (
    <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="rounded-2xl bg-green-50 p-4 text-green-800">
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-xl font-black text-slate-950">{title}</h2>

            <span
              className={`rounded-full px-3 py-1 text-xs font-black ${
                enabled
                  ? "bg-green-100 text-green-800"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {status}
            </span>
          </div>

          <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
            {description}
          </p>

          <button
            type="button"
            disabled={!enabled || loading}
            onClick={onClick}
            className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-green-700 px-5 py-3 text-sm font-black text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {buttonText}
          </button>
        </div>
      </div>
    </article>
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

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 px-4">
      <div className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl">
        <div
          className={`rounded-3xl p-5 ${
            isError
              ? "bg-red-50 text-red-800"
              : isSuccess
                ? "bg-green-50 text-green-800"
                : "bg-slate-50 text-slate-800"
          }`}
        >
          <div className="flex items-start gap-4">
            <div className="mt-1">
              {isLoading && <Loader2 className="h-7 w-7 animate-spin" />}
              {isError && <AlertTriangle className="h-7 w-7" />}
              {isSuccess && <BadgeCheck className="h-7 w-7" />}
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="text-xl font-black">{modal.title}</h3>
              <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6">
                {modal.message}
              </p>
            </div>

            {!isLoading && (
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
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className={`rounded-2xl px-5 py-3 text-sm font-black text-white transition ${
                isError
                  ? "bg-red-700 hover:bg-red-800"
                  : "bg-slate-950 hover:bg-slate-800"
              }`}
            >
              Entendi
            </button>
          </div>
        )}
      </div>
    </div>
  );
}