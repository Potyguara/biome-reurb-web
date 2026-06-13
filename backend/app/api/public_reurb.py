import re
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.project import Project
from app.models.reurb import (
    Document,
    Lot,
    PhysicalRegistration,
    Seal,
    SocialRegistration,
)

router = APIRouter(prefix="/public/reurb", tags=["Consulta Pública REURB"])


class PublicReurbConsultationRequest(BaseModel):
    cpf: str = Field(..., min_length=5)
    seal_code: str = Field(..., min_length=2)


class PublicDocumentResponse(BaseModel):
    document_type: str
    document_name: str
    status: str


class PublicReurbConsultationResponse(BaseModel):
    found: bool
    project_name: str | None = None
    municipality: str | None = None
    state: str | None = None
    neighborhood: str | None = None

    seal_code: str | None = None
    lot_code: str | None = None

    responsible_name: str | None = None
    responsible_cpf_masked: str | None = None

    attendance_status: str | None = None
    technical_status: str | None = None
    lot_review_status: str | None = None

    has_social_registration: bool = False
    has_physical_registration: bool = False
    documents_count: int = 0
    documents: list[PublicDocumentResponse] = []

    pending_items: list[str] = []
    citizen_message: str | None = None


def _only_digits(value: str | None) -> str:
    if not value:
        return ""

    return re.sub(r"\D", "", value)


def _mask_cpf(value: str | None) -> str | None:
    digits = _only_digits(value)

    if len(digits) != 11:
        return None

    return f"***.{digits[3:6]}.{digits[6:9]}-**"


def _normalize_text(value: str | None) -> str:
    if not value:
        return ""

    return value.strip().lower()


def _label(value: str | None) -> str:
    if not value:
        return "-"

    return value.replace("_", " ").title()


def _document_type_label(value: str | None) -> str:
    normalized = _normalize_text(value)

    labels = {
        "foto_fachada": "Foto da fachada",
        "fachada": "Foto da fachada",
        "foto_imovel": "Foto do imóvel",
        "imagem_campo": "Imagem de campo",
        "rg_frente": "RG frente",
        "rg_verso": "RG verso",
        "rg": "RG",
        "cpf": "CPF",
        "cnh": "CNH",
        "comprovante_residencia": "Comprovante de residência",
        "comprovante_de_residencia": "Comprovante de residência",
        "certidao_nascimento": "Certidão de nascimento",
        "certidao_casamento": "Certidão de casamento",
        "documento_imovel": "Documento do imóvel",
        "documento_posse": "Documento do imóvel",
        "matricula": "Matrícula do imóvel",
        "escritura_publica": "Escritura pública",
        "titulo_definitivo": "Título definitivo",
        "titulo_nao_registrado": "Título não registrado",
        "contrato_compra_venda": "Contrato de compra e venda",
        "recibo_compra_venda": "Recibo de compra e venda",
        "cessao_direitos": "Cessão de direitos",
        "declaracao_posse": "Declaração de posse",
        "formal_partilha": "Formal de partilha/inventário",
        "termo_doacao": "Termo de doação",
        "iptu": "IPTU/cadastro municipal",
        "conta_energia": "Conta de energia",
        "conta_agua": "Conta de água",
        "termo_declaracao": "Termo/declaração",
        "comprovante_selagem": "Comprovante de atendimento REURB",
        "outro": "Outro documento",
    }

    return labels.get(normalized, _label(value))


def _document_display_name(document: Document) -> str:
    if document.notes and document.notes.strip():
        return document.notes.strip()

    if document.original_filename and document.original_filename.strip():
        return document.original_filename.strip()

    if document.stored_filename and document.stored_filename.strip():
        return document.stored_filename.strip()

    return _document_type_label(document.document_type)


@router.post("/consulta", response_model=PublicReurbConsultationResponse)
def consult_reurb_status(
    payload: PublicReurbConsultationRequest,
    db: Session = Depends(get_db),
) -> PublicReurbConsultationResponse:
    cpf_digits = _only_digits(payload.cpf)
    seal_code = payload.seal_code.strip()

    if len(cpf_digits) != 11:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Informe um CPF válido com 11 dígitos.",
        )

    social_candidates = (
        db.query(SocialRegistration)
        .filter(SocialRegistration.seal_code == seal_code)
        .all()
    )

    social = None

    for candidate in social_candidates:
        if _only_digits(candidate.responsible_cpf) == cpf_digits:
            social = candidate
            break

    if social is None:
        return PublicReurbConsultationResponse(
            found=False,
            citizen_message=(
                "Não encontramos cadastro REURB com o CPF e código de selagem "
                "informados. Verifique os dados no comprovante entregue pela equipe."
            ),
        )

    project = db.query(Project).filter(Project.id == social.project_id).first()

    seal = None

    if social.seal_id:
        seal = db.query(Seal).filter(Seal.id == social.seal_id).first()

    if seal is None:
        seal = (
            db.query(Seal)
            .filter(
                Seal.project_id == social.project_id,
                Seal.seal_code == social.seal_code,
            )
            .first()
        )

    lot = None

    if seal and seal.lot_id:
        lot = db.query(Lot).filter(Lot.id == seal.lot_id).first()

    physical = (
        db.query(PhysicalRegistration)
        .filter(
            PhysicalRegistration.project_id == social.project_id,
            PhysicalRegistration.seal_code == social.seal_code,
        )
        .first()
    )

    documents_query = db.query(Document).filter(
        Document.project_id == social.project_id,
        Document.seal_code == social.seal_code,
    )

    if seal:
        documents_query = documents_query.filter(
            (Document.seal_id == seal.id) | (Document.seal_code == social.seal_code)
        )

    documents = documents_query.order_by(Document.created_at.asc()).all()

    public_documents = [
        PublicDocumentResponse(
            document_type=_document_type_label(document.document_type),
            document_name=_document_display_name(document),
            status="Validado" if document.validated else "Recebido",
        )
        for document in documents
        if document.document_type != "comprovante_selagem"
    ]

    pending_items: list[str] = []

    if seal is None:
        pending_items.append("Selagem ainda não vinculada ao cadastro.")

    if lot is None:
        pending_items.append("Lote ainda não vinculado à selagem.")

    if physical is None:
        pending_items.append("Cadastro físico ainda não localizado.")

    if not public_documents:
        pending_items.append("Nenhum documento anexado localizado.")

    if lot and not lot.is_ready_for_technical_documents:
        pending_items.append("Lote ainda em análise técnica.")

    if not pending_items:
        citizen_message = (
            "Seu cadastro REURB foi localizado e está com informações básicas "
            "registradas no sistema. Aguarde a continuidade da análise técnica "
            "e documental pela equipe responsável."
        )
    else:
        citizen_message = (
            "Seu cadastro REURB foi localizado, mas ainda existem etapas de "
            "conferência ou pendências técnicas/documentais."
        )

    return PublicReurbConsultationResponse(
        found=True,
        project_name=project.name if project else None,
        municipality=project.municipality if project else None,
        state=project.state if project else None,
        neighborhood=project.neighborhood if project else None,
        seal_code=social.seal_code,
        lot_code=lot.code if lot else seal.lot_code if seal else None,
        responsible_name=social.responsible_name,
        responsible_cpf_masked=_mask_cpf(social.responsible_cpf),
        attendance_status=seal.situation if seal else "cadastro_social_localizado",
        technical_status=lot.technical_status if lot else None,
        lot_review_status=lot.lot_review_status if lot else None,
        has_social_registration=True,
        has_physical_registration=physical is not None,
        documents_count=len(public_documents),
        documents=public_documents,
        pending_items=pending_items,
        citizen_message=citizen_message,
    )
