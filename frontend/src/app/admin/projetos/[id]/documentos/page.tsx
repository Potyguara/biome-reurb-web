"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Download,
  Eye,
  FileText,
  Filter,
  ImageIcon,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
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

type ProjectDocument = {
  id: string;
  project_id: string;
  lot_id?: string | null;
  seal_id?: string | null;
  social_registration_id?: string | null;

  seal_code: string;
  lot_code?: string | null;

  document_type: string;
  file_path: string;

  original_filename?: string | null;
  stored_filename?: string | null;
  mime_type?: string | null;
  file_size_bytes?: number | null;

  notes?: string | null;
  validated: boolean;

  document_status?: string | null;
  validation_notes?: string | null;
  validated_at?: string | null;
  validated_by_user_id?: string | null;

  responsible_name?: string | null;
  responsible_cpf?: string | null;

  created_at?: string | null;
  updated_at?: string | null;
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

type DocumentStatusFilter = "todos" | "pendente" | "validado";
type OriginFilter = "todos" | "mobile" | "admin";

function normalizeLabel(value: string | null | undefined): string {
  if (!value) return "-";

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";

  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function safeText(value: unknown, fallback = "-"): string {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();

  return text.length > 0 ? text : fallback;
}

function getDocumentFilename(document: ProjectDocument): string {
  const rawName =
    document.original_filename?.trim() ||
    document.stored_filename?.trim() ||
    document.file_path?.trim()?.split("/").pop() ||
    `documento-${document.id}`;

  return ensureFilenameExtension(rawName, document.mime_type);
}

function getExtensionFromMime(mimeType?: string | null): string {
  if (!mimeType) return "";

  const normalized = mimeType.toLowerCase();

  if (normalized.includes("pdf")) return ".pdf";
  if (normalized.includes("jpeg")) return ".jpg";
  if (normalized.includes("jpg")) return ".jpg";
  if (normalized.includes("png")) return ".png";
  if (normalized.includes("webp")) return ".webp";
  if (normalized.includes("wordprocessingml")) return ".docx";
  if (normalized.includes("msword")) return ".doc";
  if (normalized.includes("spreadsheetml")) return ".xlsx";
  if (normalized.includes("excel")) return ".xls";

  return "";
}

function ensureFilenameExtension(filename: string, mimeType?: string | null): string {
  const hasExtension = /\.[a-zA-Z0-9]{2,8}$/.test(filename);

  if (hasExtension) return filename;

  return `${filename}${getExtensionFromMime(mimeType) || ".bin"}`;
}

function isImageDocument(document: ProjectDocument): boolean {
  const filename = getDocumentFilename(document).toLowerCase();
  const mime = document.mime_type?.toLowerCase() ?? "";

  return (
    mime.startsWith("image/") ||
    filename.endsWith(".jpg") ||
    filename.endsWith(".jpeg") ||
    filename.endsWith(".png") ||
    filename.endsWith(".webp")
  );
}

function isMobileOrigin(document: ProjectDocument): boolean {
  const filePath = document.file_path?.toLowerCase() ?? "";

  return (
    filePath.includes("/imports/") ||
    filePath.includes("storage/imports") ||
    filePath.includes("mobile")
  );
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

export default function ProjectDocumentsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const projectId = params.id;

  const [project, setProject] = useState<Project | null>(null);
  const [records, setRecords] = useState<ProjectDocument[]>([]);

  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<DocumentStatusFilter>("todos");
  const [originFilter, setOriginFilter] = useState<OriginFilter>("todos");
  const [typeFilter, setTypeFilter] = useState("todos");

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
      const [projectResponse, documentsResponse] = await Promise.all([
        api.get<Project>(`/projects/${projectId}`),
        api.get<ProjectDocument[]>(`/projects/${projectId}/documents`),
      ]);

      setProject(projectResponse.data);
      setRecords(documentsResponse.data ?? []);
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;

      if (status === 401 || status === 403) {
        clearToken();
        router.push("/login");
        return;
      }

      showError(
        "Erro ao carregar documentos",
        getApiErrorMessage(error, "Não foi possível carregar os documentos do projeto."),
      );
    } finally {
      setLoading(false);
    }
  }

async function openDocument(document: ProjectDocument) {
  try {
    setActionId(document.id);

    showLoading(
      "Abrindo documento",
      "Aguarde enquanto o arquivo é recuperado do backend.",
    );

    const response = await api.get(
      `/projects/${projectId}/documents/${document.id}/file`,
      {
        responseType: "blob",
        validateStatus: (status) => status < 500,
      },
    );

    if (response.status === 404) {
      showError(
        "Arquivo não localizado",
        "O registro do documento existe, mas o arquivo físico não foi localizado no backend. Isso costuma ocorrer quando o arquivo importado do mobile ainda não foi copiado para o storage de documentos.",
      );
      return;
    }

    if (response.status !== 200) {
      showError(
        "Erro ao abrir documento",
        "Não foi possível abrir o arquivo do documento.",
      );
      return;
    }

    const contentDisposition = response.headers?.["content-disposition"];
    const headerFilename = getFilenameFromContentDisposition(contentDisposition);

    const contentTypeHeader = response.headers?.["content-type"];
    const safeContentType =
      typeof contentTypeHeader === "string"
        ? contentTypeHeader
        : document.mime_type ?? "application/octet-stream";

    const fallbackFilename = getDocumentFilename(document);

    const filename = ensureFilenameExtension(
      headerFilename || fallbackFilename,
      safeContentType,
    );

    const blob = new Blob([response.data], {
      type: safeContentType,
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

    closeModal();
  } catch (error) {
    showError(
      "Erro ao abrir documento",
      getApiErrorMessage(error, "Não foi possível abrir o documento."),
    );
  } finally {
    setActionId(null);
  }
}

async function validateDocument(document: ProjectDocument, nextValidated: boolean) {
  try {
    setActionId(document.id);

    showLoading(
      nextValidated ? "Validando documento" : "Removendo validação",
      "Aguarde enquanto o status documental é atualizado.",
    );

    await api.patch(
      `/projects/${projectId}/documents/${document.id}/validate`,
      {
        validated: nextValidated,
        document_status: nextValidated ? "validado" : "pendente",
        validation_notes: nextValidated
          ? "Documento validado pelo administrador."
          : "Validação removida pelo administrador.",
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    await load();

    showSuccess(
      nextValidated ? "Documento validado" : "Documento marcado como pendente",
      nextValidated
        ? "O documento foi validado com sucesso."
        : "A validação foi removida e o documento voltou para pendente.",
    );
  } catch (error) {
    showError(
      "Erro ao validar documento",
      getApiErrorMessage(
        error,
        "Não foi possível atualizar a validação do documento.",
      ),
    );
  } finally {
    setActionId(null);
  }
}

function askDeleteDocument(document: ProjectDocument) {
  setModal({
    open: true,
    type: "confirm",
    title: "Excluir documento",
    message: `Tem certeza que deseja excluir o documento "${getDocumentFilename(
      document,
    )}"? Essa ação removerá o registro documental do projeto e não poderá ser desfeita.`,
    confirmText: "Excluir documento",
    cancelText: "Cancelar",
    onConfirm: async () => {
      closeModal();

      setTimeout(() => {
        deleteDocument(document);
      }, 100);
    },
  });
}

  async function deleteDocument(document: ProjectDocument) {
    try {
      setActionId(document.id);
      showLoading("Excluindo documento", "Aguarde enquanto o documento é removido.");

      await api.delete(`/projects/${projectId}/documents/${document.id}`);

      await load();

      showSuccess(
        "Documento excluído",
        "O documento foi excluído do projeto com sucesso.",
      );
    } catch (error) {
      showError(
        "Erro ao excluir documento",
        getApiErrorMessage(error, "Não foi possível excluir o documento."),
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

  const documentTypes = useMemo(() => {
    const types = new Set<string>();

    records.forEach((record) => {
      if (record.document_type) types.add(record.document_type);
    });

    return Array.from(types).sort((a, b) => a.localeCompare(b));
  }, [records]);

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase();

    return records.filter((record) => {
      const filename = getDocumentFilename(record);
      const responsible = record.responsible_name ?? "";
      const cpf = record.responsible_cpf ?? "";

      const haystack = [
        filename,
        record.document_type,
        record.seal_code,
        record.lot_code,
        responsible,
        cpf,
        record.notes,
        record.file_path,
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = !term || haystack.includes(term);

      const matchesStatus =
        statusFilter === "todos" ||
        (statusFilter === "validado" && record.validated) ||
        (statusFilter === "pendente" && !record.validated);

      const origin = isMobileOrigin(record) ? "mobile" : "admin";

      const matchesOrigin = originFilter === "todos" || originFilter === origin;

      const matchesType =
        typeFilter === "todos" || record.document_type === typeFilter;

      return matchesSearch && matchesStatus && matchesOrigin && matchesType;
    });
  }, [records, search, statusFilter, originFilter, typeFilter]);

  const totalImages = records.filter(isImageDocument).length;
  const totalFiles = records.length - totalImages;
  const totalValidated = records.filter((item) => item.validated).length;
  const totalPending = records.length - totalValidated;
  const totalMobile = records.filter(isMobileOrigin).length;

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
                Documentos
              </p>

              <h1 className="mt-3 text-4xl font-black tracking-tight">
                Conferência documental
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Documentos pessoais, comprovantes, termos, imagens de campo e
                demais arquivos vinculados às selagens, cadastros e lotes do
                projeto REURB.
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
            icon={<FileText className="h-7 w-7" />}
            title="Total"
            value={String(records.length)}
          />
          <SummaryCard
            icon={<ImageIcon className="h-7 w-7" />}
            title="Imagens"
            value={String(totalImages)}
          />
          <SummaryCard
            icon={<FileText className="h-7 w-7" />}
            title="Arquivos"
            value={String(totalFiles)}
          />
          <SummaryCard
            icon={<BadgeCheck className="h-7 w-7" />}
            title="Validados"
            value={String(totalValidated)}
          />
          <SummaryCard
            icon={<AlertTriangle className="h-7 w-7" />}
            title="Pendentes"
            value={String(totalPending)}
            detail={`${totalMobile} oriundo(s) do mobile`}
          />
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-2xl font-black">Lista de documentos</h2>
              <p className="mt-1 text-sm text-slate-600">
                {loading
                  ? "Carregando documentos..."
                  : `${filteredRecords.length} documento(s) encontrado(s).`}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 md:col-span-4 xl:col-span-1">
                <Search className="h-5 w-5 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por selo, lote, tipo, arquivo ou responsável"
                  className="w-full min-w-[280px] bg-transparent text-sm font-medium outline-none placeholder:text-slate-400"
                />
              </div>

              <FilterSelect
                label="Status"
                value={statusFilter}
                onChange={(value) =>
                  setStatusFilter(value as DocumentStatusFilter)
                }
                options={[
                  ["todos", "Todos"],
                  ["pendente", "Pendentes"],
                  ["validado", "Validados"],
                ]}
              />

              <FilterSelect
                label="Origem"
                value={originFilter}
                onChange={(value) => setOriginFilter(value as OriginFilter)}
                options={[
                  ["todos", "Todas"],
                  ["mobile", "Mobile"],
                  ["admin", "Admin"],
                ]}
              />

              <FilterSelect
                label="Tipo"
                value={typeFilter}
                onChange={setTypeFilter}
                options={[
                  ["todos", "Todos"],
                  ...documentTypes.map((type) => [type, normalizeLabel(type)]),
                ]}
              />
            </div>
          </div>

          {loading && (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-10 text-center">
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-green-700" />
              <p className="mt-4 font-bold text-slate-700">
                Carregando documentos do projeto...
              </p>
            </div>
          )}

          {!loading && filteredRecords.length === 0 && (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <FileText className="mx-auto h-12 w-12 text-slate-400" />
              <p className="mt-4 font-bold text-slate-700">
                Nenhum documento encontrado.
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Ajuste os filtros, importe um pacote mobile ou envie documentos
                pelos detalhes do lote.
              </p>
            </div>
          )}

          {!loading && filteredRecords.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredRecords.map((record) => {
                const filename = getDocumentFilename(record);
                const documentType = normalizeLabel(record.document_type);
                const sealCode = safeText(record.seal_code, "Não informado");
                const lotCode = safeText(record.lot_code, "-");
                const busy = actionId === record.id;
                const mobile = isMobileOrigin(record);

                return (
                  <article
                    key={record.id}
                    className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-green-700">
                        {isImageDocument(record) ? (
                          <ImageIcon className="h-6 w-6" />
                        ) : (
                          <FileText className="h-6 w-6" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-black uppercase tracking-wider text-slate-400">
                              {documentType}
                            </p>

                            <h3 className="mt-1 line-clamp-2 text-lg font-black">
                              {filename}
                            </h3>
                          </div>

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-black ${
                              record.validated
                                ? "bg-green-100 text-green-800"
                                : "bg-amber-100 text-amber-900"
                            }`}
                          >
                            {record.validated ? "Validado" : "Pendente"}
                          </span>
                        </div>

                        <div className="mt-4 grid gap-3 text-sm font-semibold text-slate-600 md:grid-cols-2">
                          <InfoLine label="Selo" value={sealCode} />
                          <InfoLine label="Lote" value={lotCode} />
                          <InfoLine
                            label="Origem"
                            value={mobile ? "Mobile" : "Admin"}
                          />
                          <InfoLine
                            label="Tamanho"
                            value={formatBytes(record.file_size_bytes)}
                          />
                        </div>

                        {record.responsible_name && (
                          <p className="mt-3 rounded-2xl bg-white p-3 text-sm font-semibold text-slate-600">
                            Responsável:{" "}
                            <span className="font-black text-slate-900">
                              {record.responsible_name}
                            </span>
                          </p>
                        )}

                        {record.notes && (
                          <p className="mt-3 rounded-2xl bg-white p-3 text-sm font-semibold leading-6 text-slate-600">
                            {record.notes}
                          </p>
                        )}

                        <div className="mt-5 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => openDocument(record)}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                          >
                            {busy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                            Abrir/baixar
                          </button>

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              validateDocument(record, !record.validated)
                            }
                            className="inline-flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-bold text-green-800 transition hover:bg-green-100 disabled:opacity-60"
                          >
                            {busy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : record.validated ? (
                              <Eye className="h-4 w-4" />
                            ) : (
                              <BadgeCheck className="h-4 w-4" />
                            )}
                            {record.validated ? "Marcar pendente" : "Validar"}
                          </button>

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => askDeleteDocument(record)}
                            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                          >
                            <Trash2 className="h-4 w-4" />
                            Excluir
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {modal.open && (
        <FeedbackModal modal={modal} onClose={closeModal} />
      )}
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
        <p className="mt-1 text-xs font-semibold text-slate-400">{detail}</p>
      )}
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

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="text-xs font-black uppercase tracking-wider text-slate-400">
        {label}:{" "}
      </span>
      <span className="font-black text-slate-900">{value}</span>
    </p>
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
                isError
                  ? "bg-red-700 hover:bg-red-800"
                  : isConfirm
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