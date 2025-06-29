# MAX Lab MVP Platform 라우터들
from app.routers.health import router as health_router
from app.routers.workspaces import router as workspaces_router
from app.routers.external import router as external_router
from app.routers.auth_proxy import router as auth_proxy_router

__all__ = [
    "health_router",
    "workspaces_router",
    "external_router",
    "auth_proxy_router"
]