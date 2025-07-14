"""
헬스 체크 라우터
시스템 상태, 데이터베이스 연결, 리소스 모니터링을 위한 엔드포인트
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from ..core.database import get_db
from ..core.config import settings
import asyncio
from typing import Dict, Any, Optional

# psutil을 선택적으로 import (시스템 모니터링용)
try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False
    psutil = None

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/")
async def health_check():
    """기본 헬스 체크"""
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT
    }


@router.get("/detailed")
async def detailed_health_check(db: AsyncSession = Depends(get_db)):
    """상세 헬스 체크 (데이터베이스 포함)"""
    health_status = {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "timestamp": asyncio.get_event_loop().time(),
        "checks": {}
    }
    
    # 데이터베이스 연결 체크
    try:
        await db.execute(text("SELECT 1"))
        health_status["checks"]["database"] = {
            "status": "healthy",
            "message": "Database connection successful"
        }
    except Exception as e:
        health_status["status"] = "unhealthy"
        health_status["checks"]["database"] = {
            "status": "unhealthy",
            "message": f"Database connection failed: {str(e)}"
        }
    
    # 시스템 리소스 체크 (psutil이 있을 때만)
    if PSUTIL_AVAILABLE:
        try:
            health_status["checks"]["system"] = {
                "status": "healthy",
                "cpu_percent": psutil.cpu_percent(interval=1),
                "memory_percent": psutil.virtual_memory().percent,
                "disk_percent": psutil.disk_usage("/").percent
            }
        except Exception as e:
            health_status["checks"]["system"] = {
                "status": "warning",
                "message": f"System monitoring unavailable: {str(e)}"
            }
    else:
        health_status["checks"]["system"] = {
            "status": "warning",
            "message": "System monitoring unavailable (psutil not installed)"
        }
    
    return health_status


@router.get("/readiness")
async def readiness_check(db: AsyncSession = Depends(get_db)):
    """Kubernetes용 Readiness 체크"""
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "ready"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Service not ready: {str(e)}"
        )


@router.get("/liveness")
async def liveness_check():
    """Kubernetes용 Liveness 체크"""
    return {"status": "alive"}


@router.get("/metrics")
async def metrics_endpoint():
    """기본 메트릭스 정보"""
    metrics = {
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "uptime_seconds": asyncio.get_event_loop().time(),
    }
    
    # 시스템 메트릭스 (psutil이 있을 때만)
    if PSUTIL_AVAILABLE:
        try:
            metrics.update({
                "cpu_count": psutil.cpu_count(),
                "cpu_percent": psutil.cpu_percent(),
                "memory_total": psutil.virtual_memory().total,
                "memory_available": psutil.virtual_memory().available,
                "memory_percent": psutil.virtual_memory().percent,
                "disk_total": psutil.disk_usage("/").total,
                "disk_free": psutil.disk_usage("/").free,
                "disk_percent": psutil.disk_usage("/").percent,
            })
        except Exception as e:
            metrics["system_metrics_error"] = str(e)
    else:
        metrics["system_metrics"] = "unavailable (psutil not installed)"
    
    return metrics