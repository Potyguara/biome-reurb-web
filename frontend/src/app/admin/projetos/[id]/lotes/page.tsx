"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  Layers,
  MapPinned,
  RefreshCw,
  Search,
  TriangleAlert,
} from "lucide-react";

import { api, clearToken, getStoredToken, setAuthToken } from "@/lib/api";

type Project = {
  id: string;
  name: string;
  municipality: string;
  state: string;
  neighborhood: string;
};

type Lot = {
  id: string;
  project_id: string;

  code: string;
  block: string | null;

  area_m2: number | null;
  perimeter_m: number | null;

  status: string;
  needs_review: boolean;

  source_file: string | null;
  notes: string | null;

  lot_review_status: string | null;
  technical_status: string | null;
  is_ready_for_technical_documents: boolean | null;

  geometry_geojson: Record<string, unknown> | null;
  centroid_latitude: number | null;
  centroid_longitude: number | null;

  geospatial_source: string | null;
  geospatial_accuracy_m: number | null;
  revision_notes: string | null;
};

export default function ProjectLotsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const projectId = params.id;

  const [project, setProject] = useState<Project | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function loadData() {
    const token = getStoredToken();

    if (!token) {
      router.push("/login");
      return;
    }

    setAuthToken(token);
    setLoading(true);
    setError("");

    try {
      const [projectResponse, lotsResponse] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get(`/projects/${projectId}/lots`),
      ]);

      setProject(projectResponse.data);
      setLots(lotsResponse.data ?? []);
    } catch (err) {
      console.error(err);

      const status = (err as { response?: { status?: number } }).response
        ?.status;

      if (status === 401 || status === 403) {
        clearToken();
        router.push("/login");
        return;
      }

      setError("Não foi possível carregar os lotes do projeto.");
    } finally {
      setLoading(false);
    }
  }

  const filteredLots = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return lots;

    return lots.filter((lot) => {
      const code = lot.code?.toLowerCase() ?? "";
      const block = lot.block?.toLowerCase() ?? "";
      const status = normalizeLabel(
        lot.lot_review_status ?? lot.technical_status ?? lot.status,
      ).toLowerCase();

      return (
        code.includes(term) ||
        block.includes(term) ||
        status.includes(term)
      );
    });
  }, [lots, search]);

  const totalArea = useMemo(() => {
    return lots.reduce((sum, lot) => sum + (lot.area_m2 ?? 0), 0);
  }, [lots]);

  const lotsWithGeometry = useMemo(() => {
    return lots.filter((lot) => Boolean(lot.geometry_geojson)).length;
  }, [lots]);

  const lotsWithReview = useMemo(() => {
    return lots.filter((lot) => {
      const reviewStatus = lot.lot_review_status ?? "";
      const technicalStatus = lot.technical_status ?? "";

      return (
        lot.needs_review ||
        reviewStatus === "preliminar" ||
        reviewStatus === "em_revisao" ||
        technicalStatus === "pendente" ||
        technicalStatus === "em_revisao"
      );
    }).length;
  }, [lots]);

  const readyLots = useMemo(() => {
    return lots.filter((lot) => lot.is_ready_for_technical_documents).length;
  }, [lots]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-2xl bg-white p-6 font-semibold text-slate-700 shadow">
          Carregando lotes...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <button
            type="button"
            onClick={() => router.push(`/admin/projetos/${projectId}`)}
            className="mb-5 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao projeto
          </button>

          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-green-700">
                Lotes do núcleo
              </p>

              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                {project?.name ?? "Projeto REURB"}
              </h1>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Visualização dos lotes importados da base cartográfica,
                conferência de área/perímetro e controle de aptidão para peças
                técnicas.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => router.push(`/admin/projetos/${projectId}/mapa`)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-black text-green-800 transition hover:bg-green-100"
              >
                <MapPinned className="h-4 w-4" />
                Abrir mapa núcleo
              </button>

              <button
                type="button"
                onClick={loadData}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <RefreshCw className="h-4 w-4" />
                Atualizar
              </button>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        {error && (
          <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard icon={Layers} title="Total de lotes" value={lots.length} />

          <StatCard
            icon={MapPinned}
            title="Com geometria"
            value={lotsWithGeometry}
          />

          <StatCard
            icon={TriangleAlert}
            title="Em revisão"
            value={lotsWithReview}
          />

          <StatCard
            icon={CheckCircle2}
            title="Área total m²"
            value={formatNumber(totalArea)}
            subtitle={`${readyLots} lote(s) apto(s)`}
          />
        </div>

        <section className="mt-8 rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-black text-slate-900">
                Lista de lotes
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {filteredLots.length} lote(s) encontrado(s).
              </p>
            </div>

            <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 md:w-96">
              <Search className="h-5 w-5 text-slate-400" />

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por lote, quadra ou status"
                className="w-full bg-transparent px-3 text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          {filteredLots.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <Layers className="mx-auto h-12 w-12 text-slate-400" />

              <h3 className="mt-4 text-lg font-black text-slate-800">
                Nenhum lote encontrado
              </h3>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                Importe a base mobile ou os dados cartográficos para visualizar
                os lotes preliminares deste projeto.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-100">
              <div className="hidden grid-cols-[1fr_0.8fr_0.9fr_0.9fr_1.2fr_0.8fr] bg-slate-50 px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-400 md:grid">
                <div>Lote</div>
                <div>Quadra</div>
                <div>Área m²</div>
                <div>Perímetro m</div>
                <div>Status</div>
                <div>Ação</div>
              </div>

              <div className="divide-y divide-slate-100">
                {filteredLots.map((lot) => (
                  <button
                    key={lot.id}
                    type="button"
                    onClick={() =>
                      router.push(
                        `/admin/projetos/${projectId}/lotes/${lot.id}`,
                      )
                    }
                    className="grid w-full gap-3 px-5 py-4 text-left text-sm transition hover:bg-slate-50 md:grid-cols-[1fr_0.8fr_0.9fr_0.9fr_1.2fr_0.8fr] md:items-center"
                  >
                    <div>
                      <p className="font-black text-slate-900">
                        Lote {lot.code ?? "Sem código"}
                      </p>

                      <p className="mt-1 max-w-[220px] truncate text-xs font-semibold text-slate-400">
                        ID: {lot.id}
                      </p>

                      {lot.geospatial_source && (
                        <p className="mt-1 max-w-[220px] truncate text-xs font-semibold text-slate-400">
                          Fonte: {lot.geospatial_source}
                        </p>
                      )}
                    </div>

                    <div className="font-semibold text-slate-700">
                      {lot.block ?? "-"}
                    </div>

                    <div className="font-semibold text-slate-700">
                      {formatNumber(lot.area_m2)}
                    </div>

                    <div className="font-semibold text-slate-700">
                      {formatNumber(lot.perimeter_m)}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <StatusBadge value={lot.lot_review_status ?? lot.status} />

                      <TechnicalBadge value={lot.technical_status} />

                      {lot.geometry_geojson && (
                        <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-black text-green-800">
                          Geometria
                        </span>
                      )}

                      {lot.is_ready_for_technical_documents && (
                        <span className="rounded-full bg-green-700 px-3 py-1 text-xs font-black text-white">
                          Apto
                        </span>
                      )}
                    </div>

                    <div>
                      <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm">
                        <Eye className="h-4 w-4" />
                        Detalhes
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function StatCard({
  icon: Icon,
  title,
  value,
  subtitle,
}: {
  icon: React.ElementType;
  title: string;
  value: string | number;
  subtitle?: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-sm">
      <Icon className="h-7 w-7 text-green-800" />
      <p className="mt-4 text-sm font-semibold text-slate-500">{title}</p>
      <p className="mt-1 text-3xl font-black text-slate-900">{value}</p>

      {subtitle && (
        <p className="mt-2 text-xs font-bold text-slate-400">{subtitle}</p>
      )}
    </div>
  );
}

function StatusBadge({ value }: { value: string | null | undefined }) {
  const normalized = value ?? "preliminar";

  const classes =
    normalized === "apto"
      ? "bg-green-100 text-green-800"
      : normalized === "em_revisao"
        ? "bg-amber-100 text-amber-900"
        : normalized === "inconsistente"
          ? "bg-red-100 text-red-700"
          : "bg-slate-100 text-slate-700";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black ${classes}`}>
      {normalizeLabel(normalized)}
    </span>
  );
}

function TechnicalBadge({ value }: { value: string | null | undefined }) {
  if (!value) return null;

  const classes =
    value === "apto_para_pecas"
      ? "bg-green-700 text-white"
      : value === "pendente" || value === "em_revisao"
        ? "bg-amber-100 text-amber-900"
        : value === "inconsistente" || value === "sem_geometria"
          ? "bg-red-100 text-red-700"
          : "bg-slate-100 text-slate-700";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black ${classes}`}>
      {normalizeLabel(value)}
    </span>
  );
}

function normalizeLabel(value: string | null | undefined) {
  if (!value) return "-";

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatNumber(value?: number | null) {
  if (value === null || value === undefined) return "-";

  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  }).format(value);
}