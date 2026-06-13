"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Banknote,
  Eye,
  FileText,
  Filter,
  Loader2,
  Pencil,
  Phone,
  RefreshCw,
  Search,
  Trash2,
  User,
  Users,
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

type SocialRegistration = {
  id: string;
  project_id: string;
  seal_id?: string | null;
  seal_code: string;

  lot_id?: string | null;
  lot_code?: string | null;

  responsible_name: string;
  responsible_cpf?: string | null;
  responsible_rg?: string | null;
  issuing_agency?: string | null;
  phone?: string | null;

  marital_status?: string | null;
  profession?: string | null;

  household_members?: number | null;
  family_income?: number | null;

  receives_social_program?: boolean | null;
  social_program?: string | null;

  occupation_years?: number | null;
  occupation_type?: string | null;
  possession_document?: string | null;

  owns_other_property?: boolean | null;
  has_conflict?: boolean | null;

  notes?: string | null;

  documents_count?: number | null;

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

type ConflictFilter = "todos" | "com_conflito" | "sem_conflito";
type ProgramFilter = "todos" | "sim" | "nao";

type EditSocialForm = {
  seal_code: string;
  responsible_name: string;
  responsible_cpf: string;
  responsible_rg: string;
  issuing_agency: string;
  phone: string;
  marital_status: string;
  profession: string;
  household_members: string;
  family_income: string;
  receives_social_program: boolean;
  social_program: string;
  occupation_years: string;
  occupation_type: string;
  possession_document: string;
  owns_other_property: boolean;
  has_conflict: boolean;
  notes: string;
};

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

function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";

  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  }).format(value);
}

function parseOptionalNumber(value: string): number | null {
  const text = value.trim();

  if (!text) return null;

  const number = Number(text.replace(",", "."));

  return Number.isFinite(number) ? number : null;
}

function parseOptionalInteger(value: string): number | null {
  const number = parseOptionalNumber(value);

  if (number === null) return null;

  return Math.trunc(number);
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

function getLotLabel(record: SocialRegistration): string {
  if (record.lot_code?.trim()) return record.lot_code.trim();
  if (record.lot_id) return "Vinculado";
  return "Não vinculado";
}

function emptyForm(): EditSocialForm {
  return {
    seal_code: "",
    responsible_name: "",
    responsible_cpf: "",
    responsible_rg: "",
    issuing_agency: "",
    phone: "",
    marital_status: "",
    profession: "",
    household_members: "",
    family_income: "",
    receives_social_program: false,
    social_program: "",
    occupation_years: "",
    occupation_type: "",
    possession_document: "",
    owns_other_property: false,
    has_conflict: false,
    notes: "",
  };
}

export default function ProjectSocialsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const projectId = params.id;

  const [project, setProject] = useState<Project | null>(null);
  const [records, setRecords] = useState<SocialRegistration[]>([]);

  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [conflictFilter, setConflictFilter] =
    useState<ConflictFilter>("todos");
  const [programFilter, setProgramFilter] = useState<ProgramFilter>("todos");

  const [editingSocial, setEditingSocial] =
    useState<SocialRegistration | null>(null);
  const [editForm, setEditForm] = useState<EditSocialForm>(emptyForm());

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
      const [projectResponse, socialsResponse] = await Promise.all([
        api.get<Project>(`/projects/${projectId}`),
        api.get<SocialRegistration[]>(
          `/projects/${projectId}/social-registrations`,
        ),
      ]);

      setProject(projectResponse.data);
      setRecords(socialsResponse.data ?? []);
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response
        ?.status;

      if (status === 401 || status === 403) {
        clearToken();
        router.push("/login");
        return;
      }

      showError(
        "Erro ao carregar cadastros sociais",
        getApiErrorMessage(
          error,
          "Não foi possível carregar os cadastros sociais do projeto.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  function openLot(record: SocialRegistration) {
    if (!record.lot_id) {
      showError(
        "Cadastro sem lote vinculado",
        "Este cadastro social ainda não possui lote vinculado por meio da selagem.",
      );
      return;
    }

    router.push(`/admin/projetos/${projectId}/lotes/${record.lot_id}`);
  }

  function openDocuments() {
    router.push(`/admin/projetos/${projectId}/documentos`);
  }

  function openEditSocial(record: SocialRegistration) {
    setEditingSocial(record);

    setEditForm({
      seal_code: record.seal_code ?? "",
      responsible_name: record.responsible_name ?? "",
      responsible_cpf: record.responsible_cpf ?? "",
      responsible_rg: record.responsible_rg ?? "",
      issuing_agency: record.issuing_agency ?? "",
      phone: record.phone ?? "",
      marital_status: record.marital_status ?? "",
      profession: record.profession ?? "",
      household_members:
        record.household_members !== null && record.household_members !== undefined
          ? String(record.household_members)
          : "",
      family_income:
        record.family_income !== null && record.family_income !== undefined
          ? String(record.family_income)
          : "",
      receives_social_program: Boolean(record.receives_social_program),
      social_program: record.social_program ?? "",
      occupation_years:
        record.occupation_years !== null && record.occupation_years !== undefined
          ? String(record.occupation_years)
          : "",
      occupation_type: record.occupation_type ?? "",
      possession_document: record.possession_document ?? "",
      owns_other_property: Boolean(record.owns_other_property),
      has_conflict: Boolean(record.has_conflict),
      notes: record.notes ?? "",
    });
  }

  async function saveSocialEdit() {
    if (!editingSocial) return;

    try {
      setActionId(editingSocial.id);

      showLoading(
        "Salvando cadastro social",
        "Aguarde enquanto as informações sociais são atualizadas.",
      );

      await api.patch(
        `/projects/${projectId}/social-registrations/${editingSocial.id}`,
        {
          seal_code: editForm.seal_code.trim(),
          responsible_name: editForm.responsible_name.trim(),
          responsible_cpf: editForm.responsible_cpf.trim() || null,
          responsible_rg: editForm.responsible_rg.trim() || null,
          issuing_agency: editForm.issuing_agency.trim() || null,
          phone: editForm.phone.trim() || null,
          marital_status: editForm.marital_status.trim() || null,
          profession: editForm.profession.trim() || null,
          household_members: parseOptionalInteger(editForm.household_members),
          family_income: parseOptionalNumber(editForm.family_income),
          receives_social_program: editForm.receives_social_program,
          social_program: editForm.social_program.trim() || null,
          occupation_years: parseOptionalInteger(editForm.occupation_years),
          occupation_type: editForm.occupation_type.trim() || null,
          possession_document: editForm.possession_document.trim() || null,
          owns_other_property: editForm.owns_other_property,
          has_conflict: editForm.has_conflict,
          notes: editForm.notes.trim() || null,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      setEditingSocial(null);

      await load();

      showSuccess(
        "Cadastro social atualizado",
        `O cadastro social de ${editForm.responsible_name} foi atualizado com sucesso.`,
      );
    } catch (error) {
      showError(
        "Erro ao atualizar cadastro social",
        getApiErrorMessage(
          error,
          "Não foi possível atualizar o cadastro social.",
        ),
      );
    } finally {
      setActionId(null);
    }
  }

  function askDeleteSocial(record: SocialRegistration) {
    setModal({
      open: true,
      type: "confirm",
      title: "Excluir cadastro social",
      message: `Tem certeza que deseja excluir o cadastro social de "${record.responsible_name}"? Essa ação não poderá ser desfeita. Se houver documentos vinculados, a exclusão será bloqueada pelo sistema.`,
      confirmText: "Excluir cadastro",
      cancelText: "Cancelar",
      onConfirm: () => {
        closeModal();

        setTimeout(() => {
          deleteSocial(record);
        }, 100);
      },
    });
  }

  async function deleteSocial(record: SocialRegistration) {
    try {
      setActionId(record.id);

      showLoading(
        "Excluindo cadastro social",
        "Aguarde enquanto o cadastro social é removido.",
      );

      await api.delete(
        `/projects/${projectId}/social-registrations/${record.id}`,
      );

      await load();

      showSuccess(
        "Cadastro social excluído",
        `O cadastro social de ${record.responsible_name} foi excluído com sucesso.`,
      );
    } catch (error) {
      showError(
        "Erro ao excluir cadastro social",
        getApiErrorMessage(
          error,
          "Não foi possível excluir o cadastro social.",
        ),
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
        record.responsible_name,
        record.responsible_cpf,
        record.responsible_rg,
        record.phone,
        record.seal_code,
        record.lot_code,
        record.occupation_type,
        record.profession,
        record.marital_status,
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = !term || haystack.includes(term);

      const matchesConflict =
        conflictFilter === "todos" ||
        (conflictFilter === "com_conflito" && record.has_conflict) ||
        (conflictFilter === "sem_conflito" && !record.has_conflict);

      const matchesProgram =
        programFilter === "todos" ||
        (programFilter === "sim" && record.receives_social_program) ||
        (programFilter === "nao" && !record.receives_social_program);

      return matchesSearch && matchesConflict && matchesProgram;
    });
  }, [records, search, conflictFilter, programFilter]);

  const totalPrograms = records.filter(
    (item) => item.receives_social_program,
  ).length;
  const totalConflicts = records.filter((item) => item.has_conflict).length;
  const totalOtherProperty = records.filter(
    (item) => item.owns_other_property,
  ).length;

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
                Cadastro social
              </p>

              <h1 className="mt-3 text-4xl font-black tracking-tight">
                Conferência social
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Responsáveis, composição familiar, renda, ocupação, posse,
                conflitos e dados sociais coletados em campo.
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
        <div className="mb-8 grid gap-4 md:grid-cols-4">
          <SummaryCard
            icon={<User className="h-7 w-7" />}
            title="Total"
            value={String(records.length)}
          />
          <SummaryCard
            icon={<BadgeCheck className="h-7 w-7" />}
            title="Programa social"
            value={String(totalPrograms)}
          />
          <SummaryCard
            icon={<AlertTriangle className="h-7 w-7" />}
            title="Conflitos"
            value={String(totalConflicts)}
          />
          <SummaryCard
            icon={<FileText className="h-7 w-7" />}
            title="Outro imóvel"
            value={String(totalOtherProperty)}
          />
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-2xl font-black">
                Lista de cadastros sociais
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {loading
                  ? "Carregando registros..."
                  : `${filteredRecords.length} registro(s) encontrado(s).`}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 md:col-span-3 xl:col-span-1">
                <Search className="h-5 w-5 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por nome, CPF, RG, selo ou telefone"
                  className="w-full min-w-[280px] bg-transparent text-sm font-medium outline-none placeholder:text-slate-400"
                />
              </div>

              <FilterSelect
                label="Conflito"
                value={conflictFilter}
                onChange={(value) =>
                  setConflictFilter(value as ConflictFilter)
                }
                options={[
                  ["todos", "Todos"],
                  ["com_conflito", "Com conflito"],
                  ["sem_conflito", "Sem conflito"],
                ]}
              />

              <FilterSelect
                label="Programa"
                value={programFilter}
                onChange={(value) => setProgramFilter(value as ProgramFilter)}
                options={[
                  ["todos", "Todos"],
                  ["sim", "Recebe"],
                  ["nao", "Não recebe"],
                ]}
              />
            </div>
          </div>

          {loading && (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-10 text-center">
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-green-700" />
              <p className="mt-4 font-bold text-slate-700">
                Carregando cadastros sociais do projeto...
              </p>
            </div>
          )}

          {!loading && filteredRecords.length === 0 && (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <Users className="mx-auto h-12 w-12 text-slate-400" />
              <p className="mt-4 font-bold text-slate-700">
                Nenhum cadastro social encontrado.
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

                return (
                  <article
                    key={record.id}
                    className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-2xl font-black">
                            {record.responsible_name}
                          </h3>

                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                            Selo {record.seal_code}
                          </span>

                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-800">
                            Lote {getLotLabel(record)}
                          </span>

                          {record.receives_social_program && (
                            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-black text-green-800">
                              <BadgeCheck className="h-3 w-3" />
                              Programa social
                            </span>
                          )}

                          {record.has_conflict && (
                            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700">
                              <AlertTriangle className="h-3 w-3" />
                              Conflito
                            </span>
                          )}
                        </div>

                        <p className="mt-3 text-sm font-bold text-slate-600">
                          CPF:{" "}
                          <span className="text-slate-950">
                            {safeText(record.responsible_cpf, "Não informado")}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-4">
                      <InfoCard
                        icon={<User className="h-5 w-5" />}
                        title="RG / órgão"
                        value={`${safeText(record.responsible_rg)} / ${safeText(
                          record.issuing_agency,
                        )}`}
                      />
                      <InfoCard
                        icon={<Users className="h-5 w-5" />}
                        title="Moradores"
                        value={formatNumber(record.household_members)}
                      />
                      <InfoCard
                        icon={<Banknote className="h-5 w-5" />}
                        title="Renda familiar"
                        value={formatMoney(record.family_income)}
                      />
                      <InfoCard
                        icon={<FileText className="h-5 w-5" />}
                        title="Ocupação"
                        value={normalizeLabel(record.occupation_type)}
                      />
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                      <InfoCard
                        icon={<Phone className="h-5 w-5" />}
                        title="Telefone"
                        value={safeText(record.phone, "Não informado")}
                      />
                      <InfoCard
                        icon={<User className="h-5 w-5" />}
                        title="Profissão"
                        value={normalizeLabel(record.profession)}
                      />
                      <InfoCard
                        icon={<FileText className="h-5 w-5" />}
                        title="Estado civil"
                        value={normalizeLabel(record.marital_status)}
                      />
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                      <InfoCard
                        icon={<FileText className="h-5 w-5" />}
                        title="Tempo de ocupação"
                        value={`${formatNumber(record.occupation_years)} ano(s)`}
                      />
                      <InfoCard
                        icon={<FileText className="h-5 w-5" />}
                        title="Documento de posse"
                        value={normalizeLabel(record.possession_document)}
                      />
                      <InfoCard
                        icon={<FileText className="h-5 w-5" />}
                        title="Programa social"
                        value={
                          record.receives_social_program
                            ? safeText(record.social_program, "Sim")
                            : "Não"
                        }
                      />
                    </div>

                    {record.notes && (
                      <div className="mt-4 rounded-2xl bg-white p-4 text-sm font-semibold leading-6 text-slate-600">
                        {record.notes}
                      </div>
                    )}

                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => openEditSocial(record)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                      >
                        <Pencil className="h-4 w-4" />
                        Editar
                      </button>

                      <button
                        type="button"
                        disabled={busy || !record.lot_id}
                        onClick={() => openLot(record)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Eye className="h-4 w-4" />
                        Ver lote
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={openDocuments}
                        className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-800 transition hover:bg-blue-100 disabled:opacity-60"
                      >
                        <FileText className="h-4 w-4" />
                        Documentos
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => askDeleteSocial(record)}
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

      {editingSocial && (
        <SocialEditModal
          form={editForm}
          onChange={setEditForm}
          onClose={() => setEditingSocial(null)}
          onSave={saveSocialEdit}
          saving={actionId === editingSocial.id}
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

function SocialEditModal({
  form,
  onChange,
  onClose,
  onSave,
  saving,
}: {
  form: EditSocialForm;
  onChange: React.Dispatch<React.SetStateAction<EditSocialForm>>;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  function updateField(field: keyof EditSocialForm, value: string | boolean) {
    onChange((current) => ({
      ...current,
      [field]: value,
    }));
  }

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center overflow-y-auto bg-slate-950/50 px-4 py-8">
      <div className="w-full max-w-5xl rounded-[2rem] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-green-700">
              Edição administrativa
            </p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">
              Editar cadastro social
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Corrija as informações sociais coletadas em campo antes da
              validação final.
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

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <TextField
            label="Código do selo"
            value={form.seal_code}
            onChange={(value) => updateField("seal_code", value)}
          />

          <TextField
            label="Nome do responsável"
            value={form.responsible_name}
            onChange={(value) => updateField("responsible_name", value)}
          />

          <TextField
            label="CPF"
            value={form.responsible_cpf}
            onChange={(value) => updateField("responsible_cpf", value)}
          />

          <TextField
            label="RG"
            value={form.responsible_rg}
            onChange={(value) => updateField("responsible_rg", value)}
          />

          <TextField
            label="Órgão emissor"
            value={form.issuing_agency}
            onChange={(value) => updateField("issuing_agency", value)}
          />

          <TextField
            label="Telefone"
            value={form.phone}
            onChange={(value) => updateField("phone", value)}
          />

          <TextField
            label="Estado civil"
            value={form.marital_status}
            onChange={(value) => updateField("marital_status", value)}
          />

          <TextField
            label="Profissão"
            value={form.profession}
            onChange={(value) => updateField("profession", value)}
          />

          <TextField
            label="Quantidade de moradores"
            value={form.household_members}
            onChange={(value) => updateField("household_members", value)}
          />

          <TextField
            label="Renda familiar"
            value={form.family_income}
            onChange={(value) => updateField("family_income", value)}
          />

          <TextField
            label="Tempo de ocupação em anos"
            value={form.occupation_years}
            onChange={(value) => updateField("occupation_years", value)}
          />

          <TextField
            label="Forma de ocupação"
            value={form.occupation_type}
            onChange={(value) => updateField("occupation_type", value)}
          />

          <TextField
            label="Documento de posse"
            value={form.possession_document}
            onChange={(value) => updateField("possession_document", value)}
          />

          <TextField
            label="Programa social"
            value={form.social_program}
            onChange={(value) => updateField("social_program", value)}
          />

          <label className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <input
              type="checkbox"
              checked={form.receives_social_program}
              onChange={(event) =>
                updateField("receives_social_program", event.target.checked)
              }
              className="h-5 w-5 accent-green-700"
            />
            <span className="text-sm font-black text-slate-700">
              Recebe programa social
            </span>
          </label>

          <label className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <input
              type="checkbox"
              checked={form.owns_other_property}
              onChange={(event) =>
                updateField("owns_other_property", event.target.checked)
              }
              className="h-5 w-5 accent-green-700"
            />
            <span className="text-sm font-black text-slate-700">
              Possui outro imóvel
            </span>
          </label>

          <label className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <input
              type="checkbox"
              checked={form.has_conflict}
              onChange={(event) =>
                updateField("has_conflict", event.target.checked)
              }
              className="h-5 w-5 accent-red-700"
            />
            <span className="text-sm font-black text-slate-700">
              Possui conflito
            </span>
          </label>

          <div className="md:col-span-3">
            <label className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Observações
              </span>

              <textarea
                value={form.notes}
                onChange={(event) => updateField("notes", event.target.value)}
                rows={4}
                className="mt-2 w-full resize-none bg-transparent text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400"
                placeholder="Informe observações, divergências, pendências ou justificativas técnicas."
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