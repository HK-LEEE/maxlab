"""
Max Lab MVP Platform - 메인 애플리케이션
동적 MVP 페이지 관리 플랫폼의 FastAPI 애플리케이션 진입점입니다.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from contextlib import asynccontextmanager
import os
import logging
from pathlib import Path

from .core.config import settings
from .core.database import get_db, close_db, create_tables
from .utils.auto_create_tables import ensure_tables_exist
from .routers.workspaces import router as workspaces_router
from .routers.health import router as health_router
from .routers.auth_proxy import router as auth_proxy_router
from .routers.files import router as files_router
from .routers.mvp_modules import router as mvp_modules_router
from .routers.personal_test_process_flow import router as personal_test_process_flow_router
from .routers.external import router as external_router

# 동적 MVP 로더 임포트
import sys
backend_path = Path(__file__).parent.parent
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from workspaces.dynamic_loader import mvp_loader

# 로깅 설정
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper()),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """애플리케이션 라이프사이클 관리"""
    logger.info("🚀 Starting Max Lab MVP Platform...")
    
    try:
        # 개발 환경에서 테이블 자동 생성
        if settings.ENVIRONMENT == "development":
            await create_tables()
            
        # Ensure data source management tables exist
        from sqlalchemy.ext.asyncio import AsyncSession
        async for db in get_db():
            await ensure_tables_exist(db)
            break
        
        # MVP 모듈 동적 로딩
        if settings.AUTO_LOAD_MODULES:
            async for db in get_db():
                try:
                    mvp_routers = await mvp_loader.scan_and_load_mvp_modules(db)
                    for router in mvp_routers:
                        app.include_router(router)
                    logger.info(f"✅ Loaded {len(mvp_routers)} MVP modules")
                except Exception as e:
                    logger.error(f"❌ Error loading MVP modules: {e}")
                finally:
                    await db.close()
                break
        
        logger.info("✅ Max Lab MVP Platform started successfully")
        
    except Exception as e:
        logger.error(f"❌ Failed to start application: {e}")
        raise
    
    yield
    
    # 종료시 정리
    logger.info("🔄 Shutting down Max Lab MVP Platform...")
    try:
        await close_db()
        logger.info("✅ Database connections closed")
    except Exception as e:
        logger.error(f"❌ Error during shutdown: {e}")
    
    logger.info("👋 Max Lab MVP Platform shutdown complete")


# FastAPI 애플리케이션 인스턴스 생성
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=settings.APP_DESCRIPTION,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
    lifespan=lifespan
)

# CORS 미들웨어 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# 기본 API 라우터 포함
app.include_router(health_router, prefix="/api/v1", tags=["Health"])
app.include_router(workspaces_router, prefix="/api/v1")
app.include_router(auth_proxy_router, prefix="/api/v1")
app.include_router(files_router, prefix="/api/v1")
app.include_router(mvp_modules_router, prefix="/api/v1")
app.include_router(personal_test_process_flow_router)
app.include_router(external_router, prefix="/api/v1")

# 정적 파일 서빙 설정
static_dir = Path(settings.STATIC_FILES_DIR)
if settings.SERVE_STATIC_FILES and static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
    logger.info(f"📁 Static files mounted from: {static_dir}")
    
    @app.get("/favicon.ico")
    async def favicon():
        """파비콘 서빙"""
        favicon_path = static_dir / "favicon.ico"
        if favicon_path.exists():
            return FileResponse(str(favicon_path))
        return HTMLResponse("<h1>404</h1>", status_code=404)
    
    @app.get("/{path:path}")
    async def serve_spa(path: str):
        """React SPA를 위한 catch-all 라우트"""
        # API 경로는 제외
        if path.startswith("api/") or path.startswith("docs") or path.startswith("redoc"):
            return HTMLResponse("<h1>404 - API endpoint not found</h1>", status_code=404)
        
        # 실제 파일이 존재하면 해당 파일 반환
        file_path = static_dir / path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        
        # 그렇지 않으면 index.html 반환 (SPA 라우팅)
        index_file = static_dir / "index.html"
        if index_file.exists():
            return FileResponse(str(index_file))
        
        # index.html도 없으면 기본 응답
        return HTMLResponse("""
            <h1>Max Lab MVP Platform</h1>
            <p>Frontend not built yet. Please build the React application.</p>
            <a href="/docs">API Documentation</a>
        """)


@app.get("/")
async def root():
    """루트 엔드포인트"""
    if settings.SERVE_STATIC_FILES and (static_dir / "index.html").exists():
        return FileResponse(str(static_dir / "index.html"))
    
    return {
        "message": "Max Lab MVP Platform",
        "version": settings.APP_VERSION,
        "docs": "/docs" if settings.DEBUG else "Not available",
        "health": "/api/v1/health",
        "environment": settings.ENVIRONMENT
    }


@app.get("/api/v1/info")
async def get_app_info():
    """애플리케이션 정보 조회"""
    loaded_modules = mvp_loader.get_all_loaded_modules()
    available_modules = mvp_loader.scan_available_modules()
    
    return {
        "app_name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "description": settings.APP_DESCRIPTION,
        "environment": settings.ENVIRONMENT,
        "debug": settings.DEBUG,
        "mvp_modules": {
            "available": len(available_modules),
            "loaded": len(loaded_modules),
            "available_list": available_modules,
            "loaded_list": [
                {
                    "module_name": info.module_name,
                    "workspace_id": info.workspace_id,
                    "display_name": info.display_name,
                    "is_loaded": info.is_loaded
                }
                for info in loaded_modules.values()
            ]
        },
        "features": {
            "static_files": settings.SERVE_STATIC_FILES,
            "auto_load_modules": settings.AUTO_LOAD_MODULES,
            "cors_enabled": bool(settings.BACKEND_CORS_ORIGINS)
        }
    }


@app.get("/api/v1/modules/reload")
async def reload_mvp_modules():
    """MVP 모듈 재로딩 (개발용)"""
    if not settings.DEBUG:
        return {"error": "Module reloading is only available in debug mode"}
    
    try:
        async for db in get_db():
            try:
                # 기존 모듈 언로드 (개발 환경에서만)
                loaded_modules = mvp_loader.get_all_loaded_modules()
                for module_key in list(loaded_modules.keys()):
                    workspace_id, module_name = module_key.split('_', 1)
                    mvp_loader.unload_module(int(workspace_id), module_name)
                
                # 새로 로드
                mvp_routers = await mvp_loader.scan_and_load_mvp_modules(db)
                
                # 새 라우터들을 앱에 추가 (실제로는 재시작이 필요)
                logger.info(f"Reloaded {len(mvp_routers)} MVP modules")
                
                return {
                    "success": True,
                    "message": f"Reloaded {len(mvp_routers)} MVP modules",
                    "note": "Application restart may be required for full reload"
                }
                
            finally:
                await db.close()
            break
            
    except Exception as e:
        logger.error(f"Failed to reload modules: {e}")
        return {
            "success": False,
            "error": str(e)
        }


# 개발 환경에서의 직접 실행
if __name__ == "__main__":
    import uvicorn
    
    logger.info("🔧 Starting in development mode...")
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower(),
        access_log=settings.DEBUG
    )