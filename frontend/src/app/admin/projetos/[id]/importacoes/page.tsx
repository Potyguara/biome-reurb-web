"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  DatabaseZap,
  FileArchive,
  RefreshCw,
  UploadCloud,
} from "lucide-react";

import { api, clearToken, getStoredToken, setAuthToken } from "@/lib/api";

type Project = {
  id: string;
  name: string;
  municipality: string;
  state: string;
  neighborhood: string;
};

type MobileImport = {
  id: string;
  project_id: string;
  original_filename?: string | null;
  status: string;
  total_records?: number | null;
  lots_count?: number | null;
  seals_count?: number | null;
  social_count?: number | null;
  physical_count?: number | null;
  documents_count?: number | null;
  error_message?: string | null;
  created_at?: string | null;
};

export default function ProjectImportsPage() {
  const params = useParams();
  const router = useRouter();

  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [imports, setImports] = useState<MobileImport[]>([]);
  const [file, setFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
      const [projectResponse, importsResponse] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get(`/mobile-imports`, {
          params: {
            project_id: projectId,
          },
        }),
      ]);

      setProject(projectResponse.data);
      setImports(importsResponse.data ?? []);
    } catch (err) {
      console.error(err);
      const status = (err as { response?: { status?: number } }).response
        ?.status;

      if (status === 401 || status === 403) {
        clearToken();
        router.push("/login");
        return;
      }

      setError("Não foi possível carregar as importações do projeto.");
    } finally {
      setLoading(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;
    setFile(selectedFile);
    setError("");
    setSuccess("");
  }

  async function handleUpload(event: FormEvent) {
    event.preventDefault();

    if (!file) {
      setError("Selecione um arquivo exportado pelo aplicativo mobile.");
      return;
    }

    setUploading(true);
    setError("");
    setSuccess("");

    try {
      const formData = new FormData();
      formData.append("project_id", projectId);
      formData.append("file", file);

      await api.post("/mobile-imports", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setFile(null);
      setSuccess("Arquivo enviado e importação registrada com sucesso.");

      const input = document.getElementById(
        "mobile-import-file"
      ) as HTMLInputElement | null;

      if (input) {
        input.value = "";
      }

      await loadData();
    } catch (err) {
      console.error(err);
      setError(
        "Não foi possível enviar o arquivo. Verifique se o backend está ativo e se o arquivo é válido."
      );
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-2xl bg-white p-6 font-semibold text-slate-700 shadow">
          Carregando importações...
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
                Importação Mobile
              </p>

              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                {project?.name ?? "Projeto REURB"}
              </h1>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Envie os arquivos exportados pelo aplicativo BIOME REURB para
                consolidar lotes, selagens, cadastros, documentos e validações.
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

      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[420px_1fr]">
        <aside className="space-y-6">
          <form
            onSubmit={handleUpload}
            className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50 text-green-800">
              <UploadCloud className="h-8 w-8" />
            </div>

            <h2 className="mt-5 text-xl font-black text-slate-900">
              Enviar exportação
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              Selecione o arquivo exportado pelo aplicativo mobile. O backend
              processará os dados e vinculará tudo ao projeto atual.
            </p>

            <label className="mt-6 block rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center transition hover:border-green-300 hover:bg-green-50">
              <FileArchive className="mx-auto h-10 w-10 text-green-800" />

              <span className="mt-3 block text-sm font-black text-slate-800">
                {file ? file.name : "Selecionar arquivo"}
              </span>

              <span className="mt-1 block text-xs font-semibold text-slate-500">
                ZIP, JSON ou pacote exportado pelo app
              </span>

              <input
                id="mobile-import-file"
                type="file"
                accept=".zip,.json,.txt"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>

            {error && (
              <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700">
                {error}
              </div>
            )}

            {success && (
              <div className="mt-5 rounded-2xl border border-green-100 bg-green-50 p-4 text-sm font-semibold leading-6 text-green-800">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={uploading}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-green-800 px-5 py-4 font-black text-white shadow-lg shadow-green-800/20 transition hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <UploadCloud className="h-5 w-5" />
              {uploading ? "Enviando..." : "Enviar e processar"}
            </button>
          </form>

          <div className="rounded-[2rem] bg-green-950 p-6 text-white shadow-xl shadow-green-950/10">
            <DatabaseZap className="h-10 w-10 text-green-200" />

            <h2 className="mt-5 text-xl font-black">
              Dados separados por projeto
            </h2>

            <p className="mt-3 text-sm leading-7 text-green-50/80">
              Cada importação será vinculada exclusivamente a este projeto,
              impedindo mistura de informações entre municípios, bairros ou
              núcleos urbanos distintos.
            </p>
          </div>
        </aside>

        <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-900">
                Histórico de importações
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Arquivos enviados e processados para este projeto.
              </p>
            </div>

            <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">
              {imports.length} registro(s)
            </span>
          </div>

          {imports.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <FileArchive className="mx-auto h-12 w-12 text-slate-400" />

              <h3 className="mt-4 text-lg font-black text-slate-800">
                Nenhuma importação realizada
              </h3>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                Envie o primeiro arquivo exportado pelo aplicativo mobile para
                iniciar a consolidação dos dados deste projeto REURB.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {imports.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-100 bg-slate-50 p-5"
                >
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-700" />
                        <h3 className="font-black text-slate-900">
                          {item.original_filename ?? "Arquivo importado"}
                        </h3>
                      </div>

                      <p className="mt-2 text-sm text-slate-500">
                        Status:{" "}
                        <span className="font-black text-slate-800">
                          {item.status}
                        </span>
                      </p>

                      {item.created_at && (
                        <p className="mt-1 text-xs font-semibold text-slate-400">
                          Criado em: {new Date(item.created_at).toLocaleString()}
                        </p>
                      )}

                      {item.error_message && (
                        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                          {item.error_message}
                        </p>
                      )}
                    </div>

                    <span className="rounded-full bg-white px-4 py-2 text-sm font-black text-slate-700">
                      {item.total_records ?? 0} registro(s)
                    </span>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-5">
                    <MiniStat label="Lotes" value={item.lots_count ?? 0} />
                    <MiniStat label="Selagens" value={item.seals_count ?? 0} />
                    <MiniStat label="Social" value={item.social_count ?? 0} />
                    <MiniStat label="Físico" value={item.physical_count ?? 0} />
                    <MiniStat
                      label="Documentos"
                      value={item.documents_count ?? 0}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-xl font-black text-slate-900">{value}</p>
    </div>
  );
}