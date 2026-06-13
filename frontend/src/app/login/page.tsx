"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  FileSearch,
  Lock,
  Mail,
  MapPinned,
  ShieldCheck,
  Eye,
  EyeOff,
} from "lucide-react";

import { api, setAuthToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("admin@biomereurb.com.br");
  const [password, setPassword] = useState("Admin@123456");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
async function handleSubmit(event: FormEvent) {
  event.preventDefault();

  if (!email.trim()) {
    setError("Informe o e-mail.");
    return;
  }

  if (!password.trim()) {
    setError("Informe a senha.");
    return;
  }

  setError("");
  setLoading(true);

  try {
    const response = await api.post("/auth/login", {
      email: email.trim().toLowerCase(),
      password,
    });

    setAuthToken(response.data.access_token);

    router.push("/admin");
  } catch (err) {
    console.error(err);
    setError("E-mail ou senha inválidos. Verifique os dados e tente novamente.");
  } finally {
    setLoading(false);
  }
}

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#2e7d32_0%,#0b3d16_38%,#061f0d_100%)] text-white">
      <div className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 px-6 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-12">
        <section className="hidden lg:block">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-green-50 backdrop-blur transition hover:bg-white/20"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para a página inicial
          </Link>

          <div className="mt-20 max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.45em] text-green-200">
              BIOME REURB
            </p>

            <h1 className="mt-5 text-5xl font-black leading-tight tracking-tight">
              Regularização fundiária com gestão técnica, social, documental e
              geoespacial.
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-green-50/85">
              Plataforma integrada para organizar projetos REURB, importar dados
              coletados em campo, validar cadastros, acompanhar pendências e
              controlar acessos por projeto.
            </p>

            <div className="mt-10 grid max-w-xl gap-4">
              <FeatureItem
                icon={MapPinned}
                title="Base geoespacial"
                text="Lotes, selagens, ortomosaicos, coordenadas e validação do vínculo territorial."
              />
              <FeatureItem
                icon={BadgeCheck}
                title="Validação REURB"
                text="Controle de pendências sociais, físicas, documentais e técnicas por projeto."
              />
              <FeatureItem
                icon={ShieldCheck}
                title="Auditoria e permissões"
                text="Usuários vinculados a projetos, perfis de acesso e logs das ações realizadas."
              />
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center">
          <div className="w-full max-w-md">
            <div className="mb-6 flex items-center justify-between lg:hidden">
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-green-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Início
              </Link>

              <Link
                href="/consulta-reurb"
                className="rounded-full bg-white px-4 py-2 text-sm font-bold text-green-950"
              >
                Consulta cidadão
              </Link>
            </div>

            <div className="overflow-hidden rounded-[2rem] border border-white/15 bg-white shadow-2xl shadow-black/30">
              <div className="bg-gradient-to-br from-green-50 to-white px-8 pb-6 pt-8 text-center text-slate-900">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-green-900 text-white shadow-lg shadow-green-900/30">
                  <ShieldCheck className="h-7 w-7" />
                </div>

                <p className="mt-5 text-xs font-black uppercase tracking-[0.35em] text-green-700">
                  BIOME REURB
                </p>

                <h2 className="mt-2 text-3xl font-black tracking-tight">
                  Acesso administrativo
                </h2>

                <p className="mt-3 text-sm leading-6 text-slate-500">
                  Entre para gerenciar projetos, usuários, importações,
                  cadastros, documentos e validações.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5 px-8 pb-8">
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">
                    E-mail
                  </span>

                  <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 transition focus-within:border-green-700 focus-within:bg-white focus-within:ring-4 focus-within:ring-green-100">
                    <Mail className="h-5 w-5 text-slate-400" />
                    <input
                      className="w-full bg-transparent px-3 py-4 text-slate-900 outline-none placeholder:text-slate-400"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      type="email"
                      placeholder="seuemail@exemplo.com"
                      required
                    />
                  </div>
                </label>

<label className="block">
  <span className="mb-2 block text-sm font-bold text-slate-700">
    Senha
  </span>

  <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 transition focus-within:border-green-700 focus-within:bg-white focus-within:ring-4 focus-within:ring-green-100">
    <div className="flex w-14 items-center justify-center border-r border-slate-100 text-slate-400">
      <Lock className="h-5 w-5" />
    </div>

    <input
      type={showPassword ? "text" : "password"}
      value={password}
      onChange={(event) => setPassword(event.target.value)}
      className="min-w-0 flex-1 bg-transparent px-4 py-4 text-base font-bold text-slate-900 outline-none placeholder:text-slate-400"
      placeholder="Digite sua senha"
      autoComplete="current-password"
      required
    />

    <button
      type="button"
      onClick={() => setShowPassword((current) => !current)}
      className="flex w-14 items-center justify-center text-slate-500 transition hover:text-green-800"
      title={showPassword ? "Ocultar senha" : "Mostrar senha"}
      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
    >
      {showPassword ? (
        <EyeOff className="h-5 w-5" />
      ) : (
        <Eye className="h-5 w-5" />
      )}
    </button>
  </div>
</label>

                {error && (
                  <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-2xl bg-green-800 px-5 py-4 font-black text-white shadow-lg shadow-green-800/25 transition hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Entrando..." : "Entrar no painel"}
                </button>

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-white px-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                      Cidadão
                    </span>
                  </div>
                </div>

                <Link
                  href="/consulta-reurb"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-center font-black text-green-900 transition hover:border-green-300 hover:bg-green-100"
                >
                  <FileSearch className="h-5 w-5" />
                  Consultar andamento do cadastro
                </Link>

                <p className="text-center text-xs leading-5 text-slate-400">
                  Área administrativa restrita. O acesso é permitido somente a
                  usuários autorizados e vinculados aos projetos REURB.
                </p>
              </form>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function FeatureItem({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ElementType;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-4 rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-green-900">
        <Icon className="h-6 w-6" />
      </div>

      <div>
        <h3 className="font-black text-white">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-green-50/80">{text}</p>
      </div>
    </div>
  );
}