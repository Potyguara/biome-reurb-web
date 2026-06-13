"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Bath,
  Droplets,
  Eye,
  FileText,
  Filter,
  Home,
  Layers,
  Loader2,
  Pencil,
  RefreshCw,
  Ruler,
  Search,
  ShieldAlert,
  Trash2,
  X,
  Zap,
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

type PhysicalRegistration = {
  id: string;
  project_id: string;
  seal_id?: string | null;
  seal_code: string;

  lot_id?: string | null;
  lot_code?: string | null;

  property_type?: string | null;
  property_use?: string | null;

  wall_material?: string | null;
  roof_type?: string | null;
  floor_type?: string | null;

  floors?: number | null;
  rooms?: number | null;
  bathrooms?: number | null;

  has_energy?: boolean | null;
  has_water?: boolean | null;
  has_sewage?: boolean | null;
  has_bathroom?: boolean | null;

  habitability_condition?: string | null;

  risk_area?: boolean | null;
  flood_prone?: boolean | null;

  notes?: string | null;

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

type RiskFilter = "todos" | "com_risco" | "sem_risco";
type InfraFilter = "todos" | "com_agua" | "com_energia" | "com_esgoto";

type EditPhysicalForm = {
  seal_code: string;
  property_type: string;
  property_use: string;
  wall_material: string;
  roof_type: string;
  floor_type: string;
  floors: string;
  rooms: string;
  bathrooms: string;
  has_energy: boolean;
  has_water: boolean;
  has_sewage: boolean;
  has_bathroom: boolean;
  habitability_condition: string;
  risk_area: boolean;
  flood_prone: boolean;
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

function getLotLabel(record: PhysicalRegistration): string {
  if (record.lot_code?.trim()) return record.lot_code.trim();
  if (record.lot_id) return "Vinculado";
  return "Não vinculado";
}

function emptyForm(): EditPhysicalForm {
  return {
    seal_code: "",
    property_type: "",
    property_use: "",
    wall_material: "",
    roof_type: "",
    floor_type: "",
    floors: "",
    rooms: "",
    bathrooms: "",
    has_energy: false,
    has_water: false,
    has_sewage: false,
    has_bathroom: false,
    habitability_condition: "",
    risk_area: false,
    flood_prone: false,
    notes: "",
  };
}

export default function ProjectPhysicalsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const projectId = params.id;

  const [project, setProject] = useState<Project | null>(null);
  const [records, setRecords] = useState<PhysicalRegistration[]>([]);

  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("todos");
  const [infraFilter, setInfraFilter] = useState<InfraFilter>("todos");

  const [editingPhysical, setEditingPhysical] =
    useState<PhysicalRegistration | null>(null);
  const [editForm, setEditForm] = useState<EditPhysicalForm>(emptyForm());

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
      const [projectResponse, physicalsResponse] = await Promise.all([
        api.get<Project>(`/projects/${projectId}`),
        api.get<PhysicalRegistration[]>(
          `/projects/${projectId}/physical-registrations`,
        ),
      ]);

      setProject(projectResponse.data);
      setRecords(physicalsResponse.data ?? []);
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response
        ?.status;

      if (status === 401 || status === 403) {
        clearToken();
        router.push("/login");
        return;
      }

      showError(
        "Erro ao carregar cadastros físicos",
        getApiErrorMessage(
          error,
          "Não foi possível carregar os cadastros físicos do projeto.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  function openLot(record: PhysicalRegistration) {
    if (!record.lot_id) {
      showError(
        "Cadastro sem lote vinculado",
        "Este cadastro físico ainda não possui lote vinculado por meio da selagem.",
      );
      return;
    }

    router.push(`/admin/projetos/${projectId}/lotes/${record.lot_id}`);
  }

  function openDocuments() {
    router.push(`/admin/projetos/${projectId}/documentos`);
  }

  function openEditPhysical(record: PhysicalRegistration) {
    setEditingPhysical(record);

    setEditForm({
      seal_code: record.seal_code ?? "",
      property_type: record.property_type ?? "",
      property_use: record.property_use ?? "",
      wall_material: record.wall_material ?? "",
      roof_type: record.roof_type ?? "",
      floor_type: record.floor_type ?? "",
      floors:
        record.floors !== null && record.floors !== undefined
          ? String(record.floors)
          : "",
      rooms:
        record.rooms !== null && record.rooms !== undefined
          ? String(record.rooms)
          : "",
      bathrooms:
        record.bathrooms !== null && record.bathrooms !== undefined
          ? String(record.bathrooms)
          : "",
      has_energy: Boolean(record.has_energy),
      has_water: Boolean(record.has_water),
      has_sewage: Boolean(record.has_sewage),
      has_bathroom: Boolean(record.has_bathroom),
      habitability_condition: record.habitability_condition ?? "",
      risk_area: Boolean(record.risk_area),
      flood_prone: Boolean(record.flood_prone),
      notes: record.notes ?? "",
    });
  }

  async function savePhysicalEdit() {
    if (!editingPhysical) return;

    try {
      setActionId(editingPhysical.id);

      showLoading(
        "Salvando cadastro físico",
        "Aguarde enquanto as informações físicas do imóvel são atualizadas.",
      );

      await api.patch(
        `/projects/${projectId}/physical-registrations/${editingPhysical.id}`,
        {
          seal_code: editForm.seal_code.trim(),
          property_type: editForm.property_type.trim() || null,
          property_use: editForm.property_use.trim() || null,
          wall_material: editForm.wall_material.trim() || null,
          roof_type: editForm.roof_type.trim() || null,
          floor_type: editForm.floor_type.trim() || null,
          floors: parseOptionalInteger(editForm.floors),
          rooms: parseOptionalInteger(editForm.rooms),
          bathrooms: parseOptionalInteger(editForm.bathrooms),
          has_energy: editForm.has_energy,
          has_water: editForm.has_water,
          has_sewage: editForm.has_sewage,
          has_bathroom: editForm.has_bathroom,
          habitability_condition: editForm.habitability_condition.trim() || null,
          risk_area: editForm.risk_area,
          flood_prone: editForm.flood_prone,
          notes: editForm.notes.trim() || null,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      setEditingPhysical(null);

      await load();

      showSuccess(
        "Cadastro físico atualizado",
        `O cadastro físico do selo ${editForm.seal_code} foi atualizado com sucesso.`,
      );
    } catch (error) {
      showError(
        "Erro ao atualizar cadastro físico",
        getApiErrorMessage(
          error,
          "Não foi possível atualizar o cadastro físico.",
        ),
      );
    } finally {
      setActionId(null);
    }
  }

  function askDeletePhysical(record: PhysicalRegistration) {
    setModal({
      open: true,
      type: "confirm",
      title: "Excluir cadastro físico",
      message: `Tem certeza que deseja excluir o cadastro físico do selo "${record.seal_code}"? Essa ação não poderá ser desfeita.`,
      confirmText: "Excluir cadastro",
      cancelText: "Cancelar",
      onConfirm: () => {
        closeModal();

        setTimeout(() => {
          deletePhysical(record);
        }, 100);
      },
    });
  }

  async function deletePhysical(record: PhysicalRegistration) {
    try {
      setActionId(record.id);

      showLoading(
        "Excluindo cadastro físico",
        "Aguarde enquanto o cadastro físico é removido.",
      );

      await api.delete(
        `/projects/${projectId}/physical-registrations/${record.id}`,
      );

      await load();

      showSuccess(
        "Cadastro físico excluído",
        `O cadastro físico do selo ${record.seal_code} foi excluído com sucesso.`,
      );
    } catch (error) {
      showError(
        "Erro ao excluir cadastro físico",
        getApiErrorMessage(
          error,
          "Não foi possível excluir o cadastro físico.",
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
        record.seal_code,
        record.lot_code,
        record.property_type,
        record.property_use,
        record.wall_material,
        record.roof_type,
        record.floor_type,
        record.habitability_condition,
        record.notes,
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = !term || haystack.includes(term);

      const matchesRisk =
        riskFilter === "todos" ||
        (riskFilter === "com_risco" &&
          (record.risk_area || record.flood_prone)) ||
        (riskFilter === "sem_risco" &&
          !record.risk_area &&
          !record.flood_prone);

      const matchesInfra =
        infraFilter === "todos" ||
        (infraFilter === "com_agua" && record.has_water) ||
        (infraFilter === "com_energia" && record.has_energy) ||
        (infraFilter === "com_esgoto" && record.has_sewage);

      return matchesSearch && matchesRisk && matchesInfra;
    });
  }, [records, search, riskFilter, infraFilter]);

  const totalWithWater = records.filter((item) => item.has_water).length;
  const totalWithEnergy = records.filter((item) => item.has_energy).length;
  const totalWithSewage = records.filter((item) => item.has_sewage).length;
  const totalRisk = records.filter(
    (item) => item.risk_area || item.flood_prone,
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
                Cadastro físico
              </p>

              <h1 className="mt-3 text-4xl font-black tracking-tight">
                Conferência física
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Características construtivas, uso, infraestrutura, conservação,
                risco e condições físicas dos imóveis cadastrados.
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
            icon={<Home className="h-7 w-7" />}
            title="Total"
            value={String(records.length)}
          />
          <SummaryCard
            icon={<Droplets className="h-7 w-7" />}
            title="Com água"
            value={String(totalWithWater)}
          />
          <SummaryCard
            icon={<Zap className="h-7 w-7" />}
            title="Com energia"
            value={String(totalWithEnergy)}
          />
          <SummaryCard
            icon={<Bath className="h-7 w-7" />}
            title="Com esgoto"
            value={String(totalWithSewage)}
          />
          <SummaryCard
            icon={<ShieldAlert className="h-7 w-7" />}
            title="Risco/inundação"
            value={String(totalRisk)}
          />
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-2xl font-black">
                Lista de cadastros físicos
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
                  placeholder="Buscar por selo, uso, construção ou conservação"
                  className="w-full min-w-[280px] bg-transparent text-sm font-medium outline-none placeholder:text-slate-400"
                />
              </div>

              <FilterSelect
                label="Risco"
                value={riskFilter}
                onChange={(value) => setRiskFilter(value as RiskFilter)}
                options={[
                  ["todos", "Todos"],
                  ["com_risco", "Com risco"],
                  ["sem_risco", "Sem risco"],
                ]}
              />

              <FilterSelect
                label="Infraestrutura"
                value={infraFilter}
                onChange={(value) => setInfraFilter(value as InfraFilter)}
                options={[
                  ["todos", "Todos"],
                  ["com_agua", "Com água"],
                  ["com_energia", "Com energia"],
                  ["com_esgoto", "Com esgoto"],
                ]}
              />
            </div>
          </div>

          {loading && (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-10 text-center">
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-green-700" />
              <p className="mt-4 font-bold text-slate-700">
                Carregando cadastros físicos do projeto...
              </p>
            </div>
          )}

          {!loading && filteredRecords.length === 0 && (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <Home className="mx-auto h-12 w-12 text-slate-400" />
              <p className="mt-4 font-bold text-slate-700">
                Nenhum cadastro físico encontrado.
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
                            Selo {record.seal_code}
                          </h3>

                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                            Lote {getLotLabel(record)}
                          </span>

                          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-black text-green-800">
                            {normalizeLabel(record.habitability_condition)}
                          </span>

                          {(record.risk_area || record.flood_prone) && (
                            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">
                              <AlertTriangle className="h-3 w-3" />
                              Risco/inundação
                            </span>
                          )}
                        </div>

                        <p className="mt-3 text-sm font-bold text-slate-600">
                          {normalizeLabel(record.property_type)} ·{" "}
                          {normalizeLabel(record.property_use)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-4">
                      <InfoCard
                        icon={<Layers className="h-5 w-5" />}
                        title="Pavimentos"
                        value={formatNumber(record.floors)}
                      />
                      <InfoCard
                        icon={<Home className="h-5 w-5" />}
                        title="Cômodos"
                        value={formatNumber(record.rooms)}
                      />
                      <InfoCard
                        icon={<Bath className="h-5 w-5" />}
                        title="Banheiros"
                        value={formatNumber(record.bathrooms)}
                      />
                      <InfoCard
                        icon={<Droplets className="h-5 w-5" />}
                        title="Esgotamento"
                        value={record.has_sewage ? "Possui esgoto" : "Não informado"}
                      />
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                      <InfoCard
                        icon={<Layers className="h-5 w-5" />}
                        title="Paredes"
                        value={normalizeLabel(record.wall_material)}
                      />
                      <InfoCard
                        icon={<Layers className="h-5 w-5" />}
                        title="Cobertura"
                        value={normalizeLabel(record.roof_type)}
                      />
                      <InfoCard
                        icon={<Layers className="h-5 w-5" />}
                        title="Piso"
                        value={normalizeLabel(record.floor_type)}
                      />
                    </div>

                    {record.notes && (
                      <div className="mt-4 rounded-2xl bg-white p-4 text-sm font-semibold leading-6 text-slate-600">
                        {record.notes}
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {record.has_water && <Badge text="Água" />}
                      {record.has_energy && <Badge text="Energia" />}
                      {record.has_bathroom && <Badge text="Banheiro" />}
                      {record.has_sewage && <Badge text="Esgoto" />}
                      {record.risk_area && (
                        <Badge text="Área de risco" variant="warning" />
                      )}
                      {record.flood_prone && (
                        <Badge text="Sujeito à inundação" variant="warning" />
                      )}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => openEditPhysical(record)}
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
                        onClick={() => askDeletePhysical(record)}
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

      {editingPhysical && (
        <PhysicalEditModal
          form={editForm}
          onChange={setEditForm}
          onClose={() => setEditingPhysical(null)}
          onSave={savePhysicalEdit}
          saving={actionId === editingPhysical.id}
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

function PhysicalEditModal({
  form,
  onChange,
  onClose,
  onSave,
  saving,
}: {
  form: EditPhysicalForm;
  onChange: React.Dispatch<React.SetStateAction<EditPhysicalForm>>;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  function updateField(field: keyof EditPhysicalForm, value: string | boolean) {
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
              Editar cadastro físico
            </h2>

            <p className="mt-1 text-sm font-semibold text-slate-500">
              Corrija as informações físicas coletadas em campo antes da
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
            label="Tipo do imóvel"
            value={form.property_type}
            onChange={(value) => updateField("property_type", value)}
          />

          <TextField
            label="Uso do imóvel"
            value={form.property_use}
            onChange={(value) => updateField("property_use", value)}
          />

          <TextField
            label="Material das paredes"
            value={form.wall_material}
            onChange={(value) => updateField("wall_material", value)}
          />

          <TextField
            label="Tipo de cobertura"
            value={form.roof_type}
            onChange={(value) => updateField("roof_type", value)}
          />

          <TextField
            label="Tipo de piso"
            value={form.floor_type}
            onChange={(value) => updateField("floor_type", value)}
          />

          <TextField
            label="Pavimentos"
            value={form.floors}
            onChange={(value) => updateField("floors", value)}
          />

          <TextField
            label="Cômodos"
            value={form.rooms}
            onChange={(value) => updateField("rooms", value)}
          />

          <TextField
            label="Banheiros"
            value={form.bathrooms}
            onChange={(value) => updateField("bathrooms", value)}
          />

          <TextField
            label="Condição de habitabilidade"
            value={form.habitability_condition}
            onChange={(value) => updateField("habitability_condition", value)}
          />

          <CheckField
            label="Possui energia"
            checked={form.has_energy}
            onChange={(checked) => updateField("has_energy", checked)}
          />

          <CheckField
            label="Possui água"
            checked={form.has_water}
            onChange={(checked) => updateField("has_water", checked)}
          />

          <CheckField
            label="Possui esgoto"
            checked={form.has_sewage}
            onChange={(checked) => updateField("has_sewage", checked)}
          />

          <CheckField
            label="Possui banheiro"
            checked={form.has_bathroom}
            onChange={(checked) => updateField("has_bathroom", checked)}
          />

          <CheckField
            label="Área de risco"
            checked={form.risk_area}
            onChange={(checked) => updateField("risk_area", checked)}
          />

          <CheckField
            label="Sujeito à inundação"
            checked={form.flood_prone}
            onChange={(checked) => updateField("flood_prone", checked)}
          />

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
                placeholder="Informe observações físicas, pendências, risco, conservação ou divergências de campo."
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

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-green-700"
      />

      <span className="text-sm font-black text-slate-700">{label}</span>
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