"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ClipboardList,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";

import { api, clearToken, getStoredToken, setAuthToken } from "@/lib/api";

type Project = {
  id: string;
  name: string;
};

type AuditLog = {
  id: string;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  description?: string | null;
  user_name?: string | null;
  user_email?: string | null;
  created_at?: string | null;
};

export default function ProjectAuditPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
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
      const [projectResponse, logsResponse] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get(`/audit-logs`, {
          params: {
            project_id: projectId,
          },
        }),
      ]);

      setProject(projectResponse.data);
      setLogs(logsResponse.data ?? []);
    } catch (err) {
      console.error(err);

      const status = (err as { response?: { status?: number } }).response?.status;

      if (status === 401 || status === 403) {
        clearToken();
        router.push("/login");
        return;
      }

      setError("Não foi possível carregar os logs de auditoria.");
    } finally {
      setLoading(false);
    }
  }

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return logs;

    return logs.filter((log) => {
      return (
        log.action.toLowerCase().includes(term) ||
        (log.entity_type ?? "").toLowerCase().includes(term) ||
        (log.description ?? "").toLowerCase().includes(term) ||
        (log.user_name ?? "").toLowerCase().includes(term) ||
        (log.user_email ?? "").toLowerCase().includes(term)
      );
    });
  }, [logs, search]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-2xl bg-white p-6 font-semibold text-slate-700 shadow">
          Carregando auditoria...
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
            onClick={() => router.push(`/admin/projetos/${projectId}`)}
            className="mb-5 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao projeto
          </button>

          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-green-700">
                Auditoria do Projeto
              </p>

              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                {project?.name ?? "Projeto REURB"}
              </h1>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Registro de ações, importações, alterações e operações
                realizadas no projeto.
              </p>
            </div>

            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-100"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid gap-4 md:grid-cols-2">
          <StatCard icon={ClipboardList} title="Eventos registrados" value={logs.length} />
          <StatCard icon={ShieldCheck} title="Auditoria" value="Ativa" />
        </div>

        <section className="mt-8 rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-black text-slate-900">
                Linha do tempo
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {filteredLogs.length} evento(s) encontrado(s).
              </p>
            </div>

            <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 md:w-96">
              <Search className="h-5 w-5 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por ação, usuário ou descrição"
                className="w-full bg-transparent px-3 text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          {error && (
            <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700">
              {error}
            </div>
          )}

          {filteredLogs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <ShieldCheck className="mx-auto h-12 w-12 text-slate-400" />
              <h3 className="mt-4 text-lg font-black text-slate-800">
                Nenhum log encontrado
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                As ações realizadas no projeto serão registradas aqui para
                controle administrativo e auditoria.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredLogs.map((log) => (
                <article
                  key={log.id}
                  className="rounded-2xl border border-slate-100 bg-slate-50 p-5"
                >
                  <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                    <div>
                      <h3 className="font-black text-slate-900">
                        {log.action}
                      </h3>

                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        {log.entity_type ?? "Entidade"} ·{" "}
                        {log.entity_id ?? "sem ID"}
                      </p>
                    </div>

                    {log.created_at && (
                      <span className="rounded-full bg-white px-4 py-2 text-xs font-black text-slate-500">
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    )}
                  </div>

                  {log.description && (
                    <p className="mt-4 rounded-2xl bg-white p-4 text-sm leading-6 text-slate-600">
                      {log.description}
                    </p>
                  )}

                  <p className="mt-4 text-xs font-bold text-slate-400">
                    Usuário: {log.user_name ?? "-"} · {log.user_email ?? "-"}
                  </p>
                </article>
              ))}
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
}: {
  icon: React.ElementType;
  title: string;
  value: string | number;
}) {
  return (
    <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-sm">
      <Icon className="h-7 w-7 text-green-800" />
      <p className="mt-4 text-sm font-semibold text-slate-500">{title}</p>
      <p className="mt-1 text-3xl font-black text-slate-900">{value}</p>
    </div>
  );
}