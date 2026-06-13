import Link from "next/link";
import {
  MapPinned,
  FileCheck,
  Users,
  ShieldCheck,
  Smartphone,
  Database,
} from "lucide-react";

const features = [
  {
    icon: MapPinned,
    title: "Base cartográfica REURB",
    text: "Integração de lotes preliminares, ortomosaicos, selagens e vínculo geoespacial dos imóveis.",
  },
  {
    icon: Users,
    title: "Cadastro social e físico",
    text: "Coleta de dados dos beneficiários, composição familiar, renda, documentos e características do imóvel.",
  },
  {
    icon: Smartphone,
    title: "Coleta em campo",
    text: "Aplicativo mobile para cadastradores, com exportação do pacote ZIP e organização por CPF.",
  },
  {
    icon: Database,
    title: "Portal administrativo",
    text: "Importação, validação, auditoria, gestão de usuários e acompanhamento dos projetos por município.",
  },
  {
    icon: FileCheck,
    title: "Conformidade documental",
    text: "Organização de documentos, fotos, dossiês e pendências para apoio ao processo de regularização.",
  },
  {
    icon: ShieldCheck,
    title: "Controle de acesso e logs",
    text: "Perfis por projeto, permissões específicas e registro de auditoria de todas as ações no sistema.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-green-950 via-green-900 to-green-800 text-white">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-green-200">
            BIOME
          </p>
          <h1 className="text-2xl font-bold">REURB</h1>
        </div>

        <nav className="flex items-center gap-3">
          <Link
            href="/consulta-reurb"
            className="rounded-full border border-white/30 px-4 py-2 text-sm font-medium hover:bg-white/10"
          >
            Consulta do cidadão
          </Link>
          <Link
            href="/login"
            className="rounded-full bg-white px-4 py-2 text-sm font-bold text-green-900 hover:bg-green-100"
          >
            Acesso administrativo
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-7xl gap-10 px-6 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="mb-4 inline-flex rounded-full bg-white/10 px-4 py-2 text-sm text-green-100">
            Plataforma para Regularização Fundiária Urbana
          </p>

          <h2 className="max-w-4xl text-4xl font-extrabold leading-tight md:text-6xl">
            Gestão completa de projetos REURB, da coleta em campo à validação
            administrativa.
          </h2>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-green-100">
            O BIOME REURB organiza dados sociais, físicos, documentais e
            geoespaciais em uma plataforma integrada para municípios, equipes
            técnicas e gestores de projetos de regularização fundiária.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/login"
              className="rounded-xl bg-white px-6 py-3 font-bold text-green-950 shadow-lg hover:bg-green-100"
            >
              Entrar no sistema
            </Link>
            <Link
              href="/consulta-reurb"
              className="rounded-xl border border-white/30 px-6 py-3 font-bold text-white hover:bg-white/10"
            >
              Consultar protocolo
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur">
          <div className="rounded-2xl bg-white p-6 text-green-950">
            <p className="text-sm font-bold uppercase text-green-700">
              Fluxo operacional
            </p>

            <div className="mt-6 space-y-4">
              {[
                "Importação de lotes e ortomosaico",
                "Selagem georreferenciada do imóvel",
                "Cadastro social e físico",
                "Anexação de documentos e fotos",
                "Validação técnica e documental",
                "Geração de relatórios e auditoria",
              ].map((item, index) => (
                <div
                  key={item}
                  className="flex items-center gap-4 rounded-xl bg-green-50 p-4"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-800 font-bold text-white">
                    {index + 1}
                  </div>
                  <span className="font-medium">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-20 text-slate-900">
        <div className="mx-auto max-w-7xl px-6">
          <h3 className="text-3xl font-extrabold text-green-950">
            Módulos da plataforma
          </h3>

          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;

              return (
                <div
                  key={feature.title}
                  className="rounded-2xl border border-green-100 bg-white p-6 shadow-sm"
                >
                  <Icon className="h-9 w-9 text-green-800" />
                  <h4 className="mt-4 text-xl font-bold">{feature.title}</h4>
                  <p className="mt-3 leading-7 text-slate-600">
                    {feature.text}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}