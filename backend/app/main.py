from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models  # noqa: F401
from app.api import public_reurb
from app.api.access import router as access_router
from app.api.audit import router as audit_router
from app.api.auth import router as auth_router
from app.api.imports import router as imports_router
from app.api.mobile import router as mobile_router
from app.api.mobile_lot_geometry_sync import (
    router as mobile_lot_geometry_sync_router,
)
from app.api.mobile_seal_sync import router as mobile_seal_sync_router
from app.api.projects import router as projects_router
from app.api.reurb import router as reurb_router
from app.api.users import router as users_router
from app.core.config import get_settings
from app.db.session import Base, engine
from app.api.mobile_field_sync import (
    router as mobile_field_sync_router,
)

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "app": settings.app_name,
        "env": settings.app_env,
        "database": "connected",
    }


app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(users_router)
app.include_router(access_router)
app.include_router(audit_router)
app.include_router(imports_router)
app.include_router(reurb_router)
app.include_router(mobile_router)
app.include_router(mobile_seal_sync_router)
app.include_router(mobile_lot_geometry_sync_router)
app.include_router(public_reurb.router)
app.include_router(mobile_field_sync_router)
