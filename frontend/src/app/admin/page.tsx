"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Database,
  FileArchive,
  FolderKanban,
  LogOut,
  ShieldCheck,
  Users,
} from "lucide-react";

import { api, clearToken, getStoredToken, setAuthToken } from "@/lib/api";

type CurrentUser = {
  id: string;
  name: string;
  email: string;
  is_global_admin: boolean;
  active: boolean;
  role_label?: string;
};

type Project = {
  id: string;
  name: string;
  municipality: string;
  state: string;
  neighborhood: string;
  reurb_type: string;
  status: string;
  estimated_lots?: number | null;
  estimated_area_ha?: number | null;
};

type UserItem = {
  id: string;
  name: string;
  email: string;
  is_global_admin: boolean;
  active: boolean;
  role_label?: string;
};

export default function AdminPage() {
  const router = useRouter();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [usersCount, setUsersCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const token = getStoredToken();

      if (!token) {
        router.push("/login");
        return;
      }

      setAuthToken(token);

      try {
        const meResponse = await api.get<CurrentUser>("/auth/me");
        const currentUser = meResponse.data;

        setUser(currentUser);

        const projectsResponse = await api.get<Project[]>("/projects");
        setProjects(projectsResponse.data ?? []);

        if (currentUser.is_global_admin) {
          const usersResponse = await api.get<UserItem[]>("/users");
          setUsersCount(usersResponse.data?.length ?? 0);
        } else {
          setUsersCount(null);
        }
      } catch {
        clearToken();
        router.push("/login");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [router]);

  function logout() {
    clearToken();
    router.push("/login");
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-2xl bg-white p-6 font-bold text-slate-700 shadow">
          Carregando painel administrativo...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-green-700">
              BIOME REURB
            </p>

            <h1 className="text-2xl font-extrabold text-slate-900">
              Painel Administrativo
            </h1>

            {user && (
              <p className="mt-1 text-xs font-bold text-slate-500">
                {user.is_global_admin
                  ? "Admin BIOME · acesso global"
                  : "Analista Prefeitura · acesso por projeto vinculado"}
              </p>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="font-bold text-slate-900">{user?.name}</p>
              <p className="text-sm text-slate-500">{user?.email}</p>
            </div>

            <button
              type="button"
              onClick={logout}
              className="rounded-xl border px-4 py-2 text-sm font-bold transition hover:bg-slate-100"
            >
              <LogOut className="mr-1 inline h-4 w-4" />
              Sair
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard
            icon={FolderKanban}
            title="Projetos"
            value={projects.length.toString()}
          />

          <StatCard
            icon={Users}
            title="Usuários"
            value={user?.is_global_admin ? String(usersCount ?? "-") : "-"}
          />

          <StatCard icon={FileArchive} title="Importações" value="-" />

          <StatCard icon={ShieldCheck} title="Auditoria" value="Ativa" />
        </div>

        {user?.is_global_admin && (
          <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            <button
              type="button"
              onClick={() => router.push("/admin/usuarios")}
              className="group rounded-[2rem] border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-green-200 hover:shadow-md"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50 text-green-800 transition group-hover:bg-green-800 group-hover:text-white">
                <Users className="h-7 w-7" />
              </div>

              <h2 className="mt-5 text-xl font-black text-slate-950">
                Usuários e permissões
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Cadastre administradores e analistas. Analistas devem ser
                vinculados aos projetos REURB autorizados.
              </p>
            </button>
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">
                  Projetos REURB
                </h2>

                <p className="text-sm text-slate-500">
                  Projetos disponíveis para gestão e consulta.
                </p>
              </div>

              {user?.is_global_admin && (
                <button
                  type="button"
                  onClick={() => router.push("/admin/projetos/novo")}
                  className="rounded-xl bg-green-800 px-5 py-3 text-sm font-black text-white shadow-lg shadow-green-800/20 transition hover:bg-green-900"
                >
                  Novo Projeto
                </button>
              )}
            </div>

            <div className="space-y-4">
              {projects.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                  <FolderKanban className="mx-auto h-10 w-10 text-slate-400" />

                  <h3 className="mt-4 text-lg font-black text-slate-800">
                    Nenhum projeto disponível
                  </h3>

                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                    {user?.is_global_admin
                      ? "Cadastre o primeiro projeto REURB para iniciar a gestão de lotes, selagens, cadastros, documentos, importações mobile e auditoria."
                      : "Seu usuário ainda não está vinculado a nenhum projeto REURB. Solicite o vínculo ao administrador BIOME."}
                  </p>

                  {user?.is_global_admin && (
                    <button
                      type="button"
                      onClick={() => router.push("/admin/projetos/novo")}
                      className="mt-5 rounded-xl bg-green-800 px-5 py-3 text-sm font-black text-white transition hover:bg-green-900"
                    >
                      Cadastrar primeiro projeto
                    </button>
                  )}
                </div>
              )}

              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => router.push(`/admin/projetos/${project.id}`)}
                  className="w-full rounded-2xl border border-slate-100 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-green-200 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-black text-slate-900">
                        {project.name}
                      </h3>

                      <p className="mt-1 text-sm text-slate-500">
                        {project.municipality}/{project.state} ·{" "}
                        {project.neighborhood}
                      </p>
                    </div>

                    <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-black text-green-800">
                      {project.reurb_type}
                    </span>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3 text-xs font-semibold text-slate-500">
                    <span>Status: {project.status}</span>
                    <span>Lotes estimados: {project.estimated_lots ?? "-"}</span>
                    <span>Área ha: {project.estimated_area_ha ?? "-"}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <aside className="rounded-2xl bg-green-950 p-6 text-white shadow-sm">
            <Database className="h-10 w-10 text-green-200" />

            <h2 className="mt-4 text-xl font-extrabold">
              Integração ativa com a API
            </h2>

            <p className="mt-3 leading-7 text-green-100">
              O painel está autenticando via JWT e consumindo os projetos
              cadastrados no FastAPI/PostGIS.
            </p>

            <div className="mt-6 rounded-xl bg-white/10 p-4 text-sm leading-6">
              {user?.is_global_admin
                ? "Como Admin BIOME, você possui acesso global e pode gerenciar usuários, projetos, importações, validações, exportações e auditoria."
                : "Como Analista Prefeitura, seu acesso depende do vínculo com projetos REURB previamente autorizado pelo Admin BIOME."}
            </div>
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
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <Icon className="h-7 w-7 text-green-800" />
      <p className="mt-4 text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-1 text-3xl font-extrabold text-slate-900">{value}</p>
    </div>
  );
}