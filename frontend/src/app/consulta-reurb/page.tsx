"use client";

import { useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  FileText,
  Loader2,
  MapPinned,
  Search,
  ShieldCheck,
  User,
} from "lucide-react";

import { api } from "@/lib/api";

type PublicDocument = {
  document_type: string;
  document_name: string;
  status: string;
};

type ConsultationResponse = {
  found: boolean;
  project_name: string | null;
  municipality: string | null;
  state: string | null;
  neighborhood: string | null;

  seal_code: string | null;
  lot_code: string | null;

  responsible_name: string | null;
  responsible_cpf_masked: string | null;

  attendance_status: string | null;
  technical_status: string | null;
  lot_review_status: string | null;

  has_social_registration: boolean;
  has_physical_registration: boolean;
  documents_count: number;
  documents: PublicDocument[];

  pending_items: string[];
  citizen_message: string | null;
};

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeLabel(value: string | null | undefined) {
  if (!value) return "-";

  const normalized = value.trim().toLowerCase();

  const labels: Record<string, string> = {
    apto: "Apto",
    apto_para_pecas: "Apto para Peças",
    apto_para_peças: "Apto para Peças",
    pronto_para_pecas: "Apto para Peças",
    pronto_para_peças: "Apto para Peças",
    preliminar: "Preliminar",
    em_revisao: "Em revisão",
    inconsistente: "Inconsistente",
    sem_geometria: "Sem geometria",
    pendente: "Pendente",
    aprovado: "Aprovado",
    validado: "Validado",
    ocupado: "Ocupado",
    vazio: "Vazio",
    ausente: "Ausente",
    recusado: "Recusado",
    cadastro_social_localizado: "Cadastro social localizado",
  };

  if (labels[normalized]) {
    return labels[normalized];
  }

  return normalized
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11);

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }

  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(
    6,
    9,
  )}-${digits.slice(9, 11)}`;
}

function getApiErrorMessage(error: unknown, fallback: string) {
  const detail = (
    error as {
      response?: {
        data?: {
          detail?: unknown;
        };
      };
    }
  ).response?.data?.detail;

  if (typeof detail === "string") return detail;

  return fallback;
}

function openWhatsAppSupport(result?: ConsultationResponse | null) {
  const phone = "5596988036439";

  const sealCode = result?.seal_code ?? "";
  const lotCode = result?.lot_code ?? "";
  const cpf = result?.responsible_cpf_masked ?? "";

  const message = [
    "Olá, preciso de suporte sobre minha consulta REURB.",
    sealCode ? `Código da selagem: ${sealCode}` : "",
    lotCode ? `Lote: ${lotCode}` : "",
    cpf ? `CPF: ${cpf}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  window.open(url, "_blank", "noopener,noreferrer");
}

export default function ConsultaReurbPage() {
  const [cpf, setCpf] = useState("");
  const [sealCode, setSealCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConsultationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function consult() {
    setError(null);
    setResult(null);

    const cpfDigits = onlyDigits(cpf);
    const seal = sealCode.trim();

    if (cpfDigits.length !== 11) {
      setError("Informe um CPF válido com 11 dígitos.");
      return;
    }

    if (!seal) {
      setError("Informe o código da selagem.");
      return;
    }

    try {
      setLoading(true);

      const response = await api.post<ConsultationResponse>(
        "/public/reurb/consulta",
        {
          cpf: cpfDigits,
          seal_code: seal,
        },
      );

      setResult(response.data);
    } catch (err) {
      setError(
        getApiErrorMessage(
          err,
          "Não foi possível consultar o cadastro REURB.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <p className="text-xs font-black uppercase tracking-[0.45em] text-green-700">
            Consulta Pública
          </p>

          <h1 className="mt-3 text-4xl font-black tracking-tight">
            Consulta REURB
          </h1>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            Consulte a situação do seu atendimento de Regularização Fundiária
            Urbana utilizando o CPF do responsável e o código da selagem
            informado no comprovante entregue pela equipe.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-8">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_180px]">
            <label className="rounded-2xl bg-slate-50 p-4">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                CPF do responsável
              </span>
              <input
                value={cpf}
                onChange={(event) => setCpf(formatCpf(event.target.value))}
                placeholder="000.000.000-00"
                className="mt-2 w-full bg-transparent text-base font-bold text-slate-800 outline-none placeholder:text-slate-400"
              />
            </label>

            <label className="rounded-2xl bg-slate-50 p-4">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                Código da selagem
              </span>
              <input
                value={sealCode}
                onChange={(event) =>
                  setSealCode(event.target.value.toUpperCase())
                }
                placeholder="Ex.: PS-0001"
                className="mt-2 w-full bg-transparent text-base font-bold text-slate-800 outline-none placeholder:text-slate-400"
              />
            </label>

            <button
              type="button"
              disabled={loading}
              onClick={consult}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-green-800 px-5 py-4 text-sm font-black text-white transition hover:bg-green-900 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Consultar
            </button>
          </div>

          {error && (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              {error}
            </div>
          )}

          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-green-100 bg-green-50 p-4 md:flex-row md:items-center md:justify-between">
  <div>
    <p className="text-sm font-black text-green-950">
      Precisa de ajuda com sua consulta?
    </p>
    <p className="mt-1 text-xs font-semibold leading-5 text-green-800">
      Fale com a equipe de suporte informando seu CPF e o código da selagem.
    </p>
  </div>

  <button
    type="button"
    onClick={() => openWhatsAppSupport(result)}
    className="inline-flex items-center justify-center rounded-2xl bg-green-700 px-5 py-3 text-sm font-black text-white transition hover:bg-green-800"
  >
    Suporte via WhatsApp
  </button>
</div>
        </div>

        {result && !result.found && (
          <div className="mt-6 rounded-[2rem] border border-amber-200 bg-amber-50 p-6 text-amber-900">
            <div className="flex items-start gap-4">
              <AlertTriangle className="h-7 w-7" />
              <div>
                <h2 className="text-xl font-black">Cadastro não localizado</h2>
                <p className="mt-2 text-sm font-semibold leading-6">
                  {result.citizen_message}
                </p>
              </div>
            </div>
          </div>
        )}

        {result && result.found && (
          <div className="mt-6 space-y-6">
            <section className="rounded-[2rem] border border-green-200 bg-green-50 p-6">
              <div className="flex items-start gap-4">
                <BadgeCheck className="h-8 w-8 text-green-800" />
                <div>
                  <h2 className="text-2xl font-black text-green-950">
                    Cadastro localizado
                  </h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-green-900">
                    {result.citizen_message}
                  </p>
                </div>
                
              </div>
            </section>


            <section className="grid gap-4 md:grid-cols-4">
              <StatusCard
                icon={MapPinned}
                title="Selagem"
                value={result.seal_code ?? "-"}
              />
              <StatusCard
                icon={MapPinned}
                title="Lote"
                value={result.lot_code ?? "-"}
              />
              <StatusCard
                icon={ShieldCheck}
                title="Status técnico"
                value={normalizeLabel(result.technical_status)}
              />
              <StatusCard
                icon={FileText}
                title="Documentos"
                value={String(result.documents_count)}
              />
            </section>

            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="flex items-center gap-2 text-xl font-black">
                <User className="h-5 w-5 text-green-800" />
                Dados do atendimento
              </h2>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <InfoItem label="Projeto/Núcleo" value={result.project_name} />
                <InfoItem
                  label="Município/UF"
                  value={
                    result.municipality && result.state
                      ? `${result.municipality}/${result.state}`
                      : "-"
                  }
                />
                <InfoItem label="Bairro" value={result.neighborhood} />
                <InfoItem
                  label="Responsável"
                  value={result.responsible_name}
                />
                <InfoItem
                  label="CPF"
                  value={result.responsible_cpf_masked}
                />
                <InfoItem
                  label="Situação do atendimento"
                  value={normalizeLabel(result.attendance_status)}
                />
              </div>
            </section>

            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black">Pendências e andamento</h2>

              {result.pending_items.length === 0 ? (
                <p className="mt-4 rounded-2xl bg-green-50 p-4 text-sm font-bold text-green-800">
                  Nenhuma pendência básica localizada no momento da consulta.
                </p>
              ) : (
                <div className="mt-4 space-y-2">
                  {result.pending_items.map((item) => (
                    <div
                      key={item}
                      className="rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-900"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black">Documentos registrados</h2>

              {result.documents.length === 0 ? (
                <p className="mt-4 text-sm font-semibold text-slate-500">
                  Nenhum documento anexado localizado para esta consulta.
                </p>
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {result.documents.map((document, index) => (
                    <div
                      key={`${document.document_name}-${index}`}
                      className="rounded-2xl bg-slate-50 p-4"
                    >
                      <p className="text-sm font-black text-slate-900">
                        {document.document_name}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        Tipo: {document.document_type} · {document.status}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-[2rem] border border-blue-200 bg-blue-50 p-6 text-blue-950">
              <h2 className="text-xl font-black">Orientação ao cidadão</h2>
              <p className="mt-3 text-sm font-semibold leading-6">
                Esta consulta possui caráter informativo. O acompanhamento
                apresentado não constitui título de propriedade, certidão de
                posse ou promessa de regularização. Em caso de divergência ou
                pendência documental, procure a equipe responsável pelo projeto
                REURB.
              </p>
            </section>
                        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
    <div>
      <h2 className="text-lg font-black text-slate-950">
        Atendimento e suporte
      </h2>
      <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
        Em caso de dúvida, inconsistência ou pendência documental, entre em
        contato com a equipe responsável pelo projeto.
      </p>
    </div>

    <button
      type="button"
      onClick={() => openWhatsAppSupport(result)}
      className="inline-flex items-center justify-center rounded-2xl bg-green-700 px-5 py-3 text-sm font-black text-white transition hover:bg-green-800"
    >
      Chamar no WhatsApp
    </button>
  </div>
</section>
          </div>
        )}
      </section>
    </main>
  );
}

function StatusCard({
  icon: Icon,
  title,
  value,
}: {
  icon: React.ElementType;
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
      <Icon className="h-7 w-7 text-green-800" />
      <p className="mt-4 text-sm font-bold text-slate-500">{title}</p>
      <p className="mt-1 text-xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-black uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-black text-slate-900">
        {value || "-"}
      </p>
    </div>
  );
}