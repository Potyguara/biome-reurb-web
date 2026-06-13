from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models.access import Permission, Role
from app.models.user import User

ROLES = [
    {
        "name": "ADMIN_GERAL",
        "description": "Acesso total a todos os projetos, usuários, permissões e auditoria.",
    },
    {
        "name": "GESTOR_PROJETO",
        "description": "Gerencia projetos REURB, importações, validações, usuários do projeto e relatórios.",
    },
    {
        "name": "ANALISTA_SOCIAL",
        "description": "Valida cadastro social, composição familiar, renda e pendências sociais.",
    },
    {
        "name": "ANALISTA_TECNICO",
        "description": "Valida lotes, mapa, vínculo geoespacial, RTK e inconsistências territoriais.",
    },
    {
        "name": "ANALISTA_DOCUMENTAL",
        "description": "Valida documentos, fotos, dossiês e pendências documentais.",
    },
    {
        "name": "CADASTRADOR",
        "description": "Consulta e corrige cadastros autorizados no projeto.",
    },
    {
        "name": "VISUALIZADOR",
        "description": "Acesso somente leitura aos dados autorizados.",
    },
]


PERMISSIONS = [
    ("projects.view", "Visualizar projetos REURB."),
    ("projects.create", "Criar projetos REURB."),
    ("projects.edit", "Editar projetos REURB."),
    ("projects.delete", "Excluir projetos REURB."),
    ("users.view", "Visualizar usuários."),
    ("users.create", "Criar usuários."),
    ("users.edit", "Editar usuários."),
    ("users.disable", "Desativar usuários."),
    ("users.manage_permissions", "Gerenciar perfis e permissões."),
    ("project_users.view", "Visualizar usuários vinculados ao projeto."),
    ("project_users.manage", "Vincular/remover usuários de projetos."),
    ("imports.view", "Visualizar importações."),
    ("imports.create", "Importar pacote ZIP do app mobile."),
    ("imports.delete", "Excluir importação."),
    ("lots.view", "Visualizar lotes."),
    ("lots.edit", "Editar lotes."),
    ("lots.validate_geo", "Validar vínculo geoespacial e RTK."),
    ("seals.view", "Visualizar selagens."),
    ("seals.edit", "Editar selagens."),
    ("seals.delete", "Excluir selagens."),
    ("social.view", "Visualizar cadastros sociais."),
    ("social.edit", "Editar cadastros sociais."),
    ("social.validate", "Validar cadastros sociais."),
    ("physical.view", "Visualizar cadastros físicos."),
    ("physical.edit", "Editar cadastros físicos."),
    ("physical.validate", "Validar cadastros físicos."),
    ("documents.view", "Visualizar documentos."),
    ("documents.upload", "Enviar documentos."),
    ("documents.delete", "Excluir documentos."),
    ("documents.validate", "Validar documentos."),
    ("map.view", "Visualizar mapa."),
    ("map.manage_layers", "Gerenciar camadas, lotes e ortomosaicos."),
    ("issues.view", "Visualizar pendências."),
    ("issues.resolve", "Resolver pendências."),
    ("reports.view", "Visualizar relatórios."),
    ("reports.export", "Exportar relatórios, planilhas e dossiês."),
    ("audit.view", "Visualizar logs/auditoria."),
]


def seed_roles(db: Session) -> None:
    for role_data in ROLES:
        exists = db.query(Role).filter(Role.name == role_data["name"]).first()

        if exists:
            continue

        db.add(
            Role(
                name=role_data["name"],
                description=role_data["description"],
            )
        )

    db.commit()


def seed_permissions(db: Session) -> None:
    for code, description in PERMISSIONS:
        exists = db.query(Permission).filter(Permission.code == code).first()

        if exists:
            continue

        db.add(
            Permission(
                code=code,
                description=description,
            )
        )

    db.commit()


def seed_admin_user(db: Session) -> None:
    email = "admin@biomereurb.com.br"

    exists = db.query(User).filter(User.email == email).first()

    if exists:
        return

    admin = User(
        name="Administrador Geral",
        email=email,
        password_hash=get_password_hash("Admin@123456"),
        is_global_admin=True,
        active=True,
    )

    db.add(admin)
    db.commit()


def main() -> None:
    db = SessionLocal()

    try:
        seed_roles(db)
        seed_permissions(db)
        seed_admin_user(db)

        print("Seed inicial executado com sucesso.")
        print("Usuário Admin Geral:")
        print("E-mail: admin@biomereurb.com.br")
        print("Senha: Admin@123456")
    finally:
        db.close()


if __name__ == "__main__":
    main()
