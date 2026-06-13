"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  FileText,
  FolderPlus,
  Landmark,
  MapPinned,
  Save,
} from "lucide-react";

import { api, clearToken, getStoredToken, setAuthToken } from "@/lib/api";

type FormState = {
  name: string;
  municipality: string;
  state: string;
  neighborhood: string;
  reurb_type: string;
  status: string;
  administrative_process_number: string;
  legal_basis: string;
  estimated_area_ha: string;
  estimated_lots: string;
  promoter: string;
  technical_responsible: string;
  notes: string;
};

const initialForm: FormState = {
  name: "",
  municipality: "Macapá",
  state: "AP",
  neighborhood: "",
  reurb_type: "REURB-S",
  status: "em_execucao",
  administrative_process_number: "",
  legal_basis: "Lei Federal nº 13.465/2017 e Decreto Federal nº 9.310/2018",
  estimated_area_ha: "",
  estimated_lots: "",
  promoter: "",
  technical_responsible: "",
  notes: "",
};

export default function NewProjectPage() {
  const router = useRouter();

  const [form, setForm] = useState<FormState>(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getStoredToken();

    if (!token) {
      router.push("/login");
      return;
    }

    setAuthToken(token);
  }, [router]);

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const payload = {
        name: form.name.trim(),
        municipality: form.municipality.trim(),
        state: form.state.trim().toUpperCase(),
        neighborhood: form.neighborhood.trim(),
        reurb_type: form.reurb_type,
        status: form.status,
        administrative_process_number:
          form.administrative_process_number.trim() || null,
        legal_basis: form.legal_basis.trim() || null,
        estimated_area_ha: form.estimated_area_ha.trim()
          ? Number(form.estimated_area_ha.replace(",", "."))
          : null,
        estimated_lots: form.estimated_lots.trim()
          ? Number.parseInt(form.estimated_lots, 10)
          : null,
        promoter: form.promoter.trim() || null,
        technical_responsible: form.technical_responsible.trim() || null,
        notes: form.notes.trim() || null,
      };

      await api.post("/projects", payload);

      router.push("/admin");
    } catch (err) {
      console.error(err);
      setError(
        "Não foi possível cadastrar o projeto. Verifique os dados e tente novamente."
      );

      const maybeStatus = (err as { response?: { status?: number } }).response
        ?.status;

      if (maybeStatus === 401 || maybeStatus === 403) {
        clearToken();
        router.push("/login");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-7xl px-6 py-5">
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="mb-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao painel
          </button>

          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-green-700">
                BIOME REURB
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Novo Projeto REURB
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Cadastre um novo projeto de regularização fundiária urbana,
                definindo município, bairro, modalidade, responsáveis e dados
                administrativos.
              </p>
            </div>

            <div className="rounded-2xl bg-green-50 px-5 py-4 text-sm font-semibold text-green-900">
              Lei Federal nº 13.465/2017
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <SectionCard
              icon={FolderPlus}
              title="Identificação do projeto"
              description="Dados básicos para individualizar o projeto REURB."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  label="Nome do projeto"
                  value={form.name}
                  onChange={(value) => updateField("name", value)}
                  placeholder="Ex.: REURB Perpétuo Socorro"
                  required
                />

                <TextField
                  label="Bairro / Núcleo urbano informal"
                  value={form.neighborhood}
                  onChange={(value) => updateField("neighborhood", value)}
                  placeholder="Ex.: Perpétuo Socorro"
                  required
                />

                <TextField
                  label="Município"
                  value={form.municipality}
                  onChange={(value) => updateField("municipality", value)}
                  required
                />

                <TextField
                  label="UF"
                  value={form.state}
                  onChange={(value) => updateField("state", value)}
                  maxLength={2}
                  required
                />

                <SelectField
                  label="Modalidade REURB"
                  value={form.reurb_type}
                  onChange={(value) => updateField("reurb_type", value)}
                  options={[
                    { value: "REURB-S", label: "REURB-S — Interesse Social" },
                    { value: "REURB-E", label: "REURB-E — Interesse Específico" },
                    { value: "MISTA", label: "Mista" },
                  ]}
                />

                <SelectField
                  label="Status"
                  value={form.status}
                  onChange={(value) => updateField("status", value)}
                  options={[
                    { value: "planejamento", label: "Planejamento" },
                    { value: "em_execucao", label: "Em execução" },
                    { value: "validacao", label: "Validação" },
                    { value: "concluido", label: "Concluído" },
                    { value: "suspenso", label: "Suspenso" },
                  ]}
                />
              </div>
            </SectionCard>

            <SectionCard
              icon={Landmark}
              title="Dados administrativos e legais"
              description="Informações institucionais, processo e fundamento legal."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  label="Processo administrativo"
                  value={form.administrative_process_number}
                  onChange={(value) =>
                    updateField("administrative_process_number", value)
                  }
                  placeholder="Ex.: Processo nº 0000/2026"
                />

                <TextField
                  label="Promotor / Município / Contratante"
                  value={form.promoter}
                  onChange={(value) => updateField("promoter", value)}
                  placeholder="Ex.: Prefeitura Municipal de ..."
                />

                <TextField
                  label="Responsável técnico"
                  value={form.technical_responsible}
                  onChange={(value) =>
                    updateField("technical_responsible", value)
                  }
                  placeholder="Ex.: Equipe Técnica BIOME"
                />

                <TextField
                  label="Base legal"
                  value={form.legal_basis}
                  onChange={(value) => updateField("legal_basis", value)}
                />
              </div>
            </SectionCard>

            <SectionCard
              icon={MapPinned}
              title="Estimativas territoriais"
              description="Dados preliminares de área e quantidade de lotes."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  label="Área estimada em hectares"
                  value={form.estimated_area_ha}
                  onChange={(value) => updateField("estimated_area_ha", value)}
                  placeholder="Ex.: 15,25"
                  inputMode="decimal"
                />

                <TextField
                  label="Lotes estimados"
                  value={form.estimated_lots}
                  onChange={(value) => updateField("estimated_lots", value)}
                  placeholder="Ex.: 250"
                  inputMode="numeric"
                />
              </div>
            </SectionCard>

            <SectionCard
              icon={FileText}
              title="Observações"
              description="Anotações gerais sobre o projeto."
            >
              <textarea
                value={form.notes}
                onChange={(event) => updateField("notes", event.target.value)}
                rows={5}
                placeholder="Insira observações relevantes sobre o projeto, etapa atual, origem dos dados, equipe responsável ou condicionantes."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-green-700 focus:bg-white focus:ring-4 focus:ring-green-100"
              />
            </SectionCard>
          </div>

          <aside className="space-y-6">
            <div className="rounded-[2rem] bg-green-950 p-6 text-white shadow-xl shadow-green-950/15">
              <Building2 className="h-10 w-10 text-green-200" />

              <h2 className="mt-5 text-xl font-black">
                Cadastro estruturado do projeto
              </h2>

              <p className="mt-3 text-sm leading-7 text-green-50/80">
                Após salvar, o projeto ficará disponível no painel
                administrativo para importação dos dados mobile, vinculação de
                usuários, controle de permissões, auditoria e acompanhamento das
                etapas REURB.
              </p>

              <div className="mt-6 rounded-2xl bg-white/10 p-4 text-sm leading-6 text-green-50">
                Cada projeto manterá seus dados separados, evitando mistura de
                beneficiários, lotes, documentos e cadastros entre municípios ou
                núcleos distintos.
              </div>
            </div>

            {error && (
              <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-green-800 px-5 py-4 font-black text-white shadow-lg shadow-green-800/20 transition hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-5 w-5" />
              {loading ? "Salvando projeto..." : "Salvar projeto REURB"}
            </button>

            <button
              type="button"
              onClick={() => router.push("/admin")}
              className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 font-black text-slate-700 transition hover:bg-slate-100"
            >
              Cancelar
            </button>
          </aside>
        </form>
      </section>
    </main>
  );
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-green-50 text-green-800">
          <Icon className="h-6 w-6" />
        </div>

        <div>
          <h2 className="text-xl font-black text-slate-900">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {description}
          </p>
        </div>
      </div>

      {children}
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  required,
  maxLength,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  inputMode?: "text" | "numeric" | "decimal";
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>

      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        inputMode={inputMode}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-green-700 focus:bg-white focus:ring-4 focus:ring-green-100"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-700">
        {label}
      </span>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-green-700 focus:bg-white focus:ring-4 focus:ring-green-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}