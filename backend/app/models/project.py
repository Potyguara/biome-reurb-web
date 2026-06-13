from sqlalchemy import Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.base import TimestampMixin, UUIDMixin


class Project(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "projects"

    name: Mapped[str] = mapped_column(String(255), nullable=False)

    municipality: Mapped[str] = mapped_column(String(255), nullable=False)

    state: Mapped[str] = mapped_column(String(2), nullable=False)

    neighborhood: Mapped[str] = mapped_column(String(255), nullable=False)

    reurb_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        default="em_execucao",
        nullable=False,
    )

    administrative_process_number: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    legal_basis: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    estimated_area_ha: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    estimated_lots: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    promoter: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    technical_responsible: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    users = relationship(
        "ProjectUser",
        back_populates="project",
    )
