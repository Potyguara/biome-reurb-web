"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ClipboardList,
  Database,
  FileText,
  FolderDown,
  Home,
  Layers,
  MapPinned,
  ShieldAlert,
  UploadCloud,
  Users,
} from "lucide-react";

import { api, clearToken, getStoredToken, setAuthToken } from "@/lib/api";

type Project = {
  id: string;
  name: string;
  municipality: string;
  state: string;
  neighborhood: string;
  reurb_type: string;
  status: string;
  administrative_process_number?: string | null;
  legal_basis?: string | null;
  estimated_area_ha?: number | null;
  estimated_lots?: number | null;
  promoter?: string | null;
  technical_responsible?: string | null;
  notes?: string | null;
};

type Dashboard = {
  project_id: string;
  project_name: string;
  total_lots: number;
  total_seals: number;
  total_social_registrations: number;
  total_physical_registrations: number;
  total_documents: number;
  lots_without_seal: number;
  seals_without_social: number;
  seals_without_physical: number;
  social_without_documents: number;
  seals_needing_rtk: number;
};

export default function ProjectDetailsPage() {
  const params = useParams();
  const router = useRouter();

  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const token = getStoredToken();

      if (!token) {
        router.push("/login");
        return;
      }

      setAuthToken(token);

      try {
        const [projectResponse, dashboardResponse] = await Promise.all([
          api.get(`/projects/${projectId}`),
          api.get(`/projects/${projectId}/dashboard`),
        ]);

        setProject(projectResponse.data);
        setDashboard(dashboardResponse.data);
      } catch (error) {
        console.error(error);
        clearToken();
        router.push("/login");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [projectId, router]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-2xl bg-white p-6 font-semibold text-slate-700 shadow">
          Carregando projeto...
        </div>
      </main>
    );
  }

  if (!project || !dashboard) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-2xl bg-white p-6 font-semibold text-slate-700 shadow">
          Projeto não encontrado.
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-7xl px-6 py-5">
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="mb-5 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao painel
          </button>

          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-green-700">
                Projeto REURB
              </p>

              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                {project.name}
              </h1>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                {project.municipality}/{project.state} · {project.neighborhood}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-green-100 px-4 py-2 text-sm font-black text-green-800">
                {project.reurb_type}
              </span>

              <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">
                {project.status}
              </span>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid gap-4 md:grid-cols-5">
          <StatCard icon={MapPinned} title="Lotes" value={dashboard.total_lots} />
          <StatCard
            icon={ClipboardList}
            title="Selagens"
            value={dashboard.total_seals}
          />
          <StatCard
            icon={Users}
            title="Cad. Social"
            value={dashboard.total_social_registrations}
          />
          <StatCard
            icon={Home}
            title="Cad. Físico"
            value={dashboard.total_physical_registrations}
          />
          <StatCard
            icon={FileText}
            title="Documentos"
            value={dashboard.total_documents}
          />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
          <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-50 text-green-800">
                <Database className="h-6 w-6" />
              </div>

              <div>
                <h2 className="text-xl font-black text-slate-900">
                  Informações do projeto
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Dados administrativos, legais e técnicos do projeto.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <InfoItem
                label="Processo administrativo"
                value={project.administrative_process_number || "-"}
              />
              <InfoItem label="Promotor" value={project.promoter || "-"} />
              <InfoItem
                label="Responsável técnico"
                value={project.technical_responsible || "-"}
              />
              <InfoItem
                label="Área estimada"
                value={
                  project.estimated_area_ha
                    ? `${project.estimated_area_ha} ha`
                    : "-"
                }
              />
              <InfoItem
                label="Lotes estimados"
                value={project.estimated_lots?.toString() || "-"}
              />
              <InfoItem label="Base legal" value={project.legal_basis || "-"} />
            </div>

            {project.notes && (
              <div className="mt-6 rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-black text-slate-700">
                  Observações
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  {project.notes}
                </p>
              </div>
            )}

            <div className="mt-8 grid gap-3 md:grid-cols-3">
              <ModuleButton
                icon={MapPinned}
                label="Mapa Núcleo"
                onClick={() => router.push(`/admin/projetos/${project.id}/mapa`)}
              />

              <ModuleButton
                icon={Layers}
                label="Lotes"
                onClick={() => router.push(`/admin/projetos/${project.id}/lotes`)}
              />

              <ModuleButton
                icon={ClipboardList}
                label="Selagens"
                onClick={() =>
                  router.push(`/admin/projetos/${project.id}/selagens`)
                }
              />

              <ModuleButton
                icon={Users}
                label="Cad. sociais"
                onClick={() =>
                  router.push(`/admin/projetos/${project.id}/sociais`)
                }
              />

              <ModuleButton
                icon={Home}
                label="Cad. físicos"
                onClick={() =>
                  router.push(`/admin/projetos/${project.id}/fisicos`)
                }
              />

              <ModuleButton
                icon={FileText}
                label="Documentos"
                onClick={() =>
                  router.push(`/admin/projetos/${project.id}/documentos`)
                }
              />

              <ModuleButton
                icon={UploadCloud}
                label="Importações"
                onClick={() =>
                  router.push(`/admin/projetos/${project.id}/importacoes`)
                }
              />

              <ModuleButton
                icon={FolderDown}
                label="Exportações REURB"
                featured
                onClick={() =>
                  router.push(`/admin/projetos/${project.id}/exportacoes`)
                }
              />
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-[2rem] bg-green-950 p-6 text-white shadow-xl shadow-green-950/10">
              <ShieldAlert className="h-10 w-10 text-green-200" />

              <h2 className="mt-5 text-xl font-black">Pendências do projeto</h2>

              <p className="mt-2 text-sm leading-6 text-green-50/75">
                Indicadores automáticos para apoiar validação técnica,
                documental, social e geoespacial.
              </p>

              <div className="mt-6 space-y-3">
                <PendingItem
                  label="Lotes sem selagem"
                  value={dashboard.lots_without_seal}
                />
                <PendingItem
                  label="Selagens sem cadastro social"
                  value={dashboard.seals_without_social}
                />
                <PendingItem
                  label="Selagens sem cadastro físico"
                  value={dashboard.seals_without_physical}
                />
                <PendingItem
                  label="Sociais sem documentos"
                  value={dashboard.social_without_documents}
                />
                <PendingItem
                  label="Necessitam RTK"
                  value={dashboard.seals_needing_rtk}
                />
              </div>
            </section>

            <button
              type="button"
              onClick={() =>
                router.push(`/admin/projetos/${project.id}/auditoria`)
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left font-black text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              Ver auditoria e logs
            </button>
          </aside>
        </div>
      </section>
    </main>
  );
}

function StatCard({
  icon: Icon,
  title,
  value,
}: {
  icon: React.ElementType;
  title: string;
  value: number;
}) {
  return (
    <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-sm">
      <Icon className="h-7 w-7 text-green-800" />
      <p className="mt-4 text-sm font-semibold text-slate-500">{title}</p>
      <p className="mt-1 text-3xl font-black text-slate-900">{value}</p>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-slate-800">{value}</p>
    </div>
  );
}

function PendingItem({ label, value }: { label: string; value: number }) {
  const active = value > 0;

  return (
    <div
      className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm ${
        active ? "bg-amber-100 text-amber-950" : "bg-white/10 text-green-50"
      }`}
    >
      <span className="font-bold">{label}</span>
      <span className="text-lg font-black">{value}</span>
    </div>
  );
}

function ModuleButton({
  icon: Icon,
  label,
  onClick,
  featured = false,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  featured?: boolean;
}) {
  if (featured) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-3 rounded-2xl border border-green-300 bg-green-50 px-4 py-4 text-left font-black text-green-900 transition hover:border-green-400 hover:bg-green-100"
      >
        <Icon className="h-5 w-5" />
        <span className="flex-1">{label}</span>
        <span className="rounded-full bg-green-700 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-white">
          Novo
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left font-black text-slate-700 transition hover:border-green-300 hover:bg-green-50 hover:text-green-900"
    >
      <Icon className="h-5 w-5" />
      {label}
    </button>
  );
}