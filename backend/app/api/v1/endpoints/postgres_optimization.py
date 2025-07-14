"""
PostgreSQL 최적화 API 엔드포인트
데이터베이스 설정 최적화 및 튜닝을 위한 REST API
"""
from datetime import datetime
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel

from ....core.postgres_optimizer import postgres_optimizer
from ....core.auth import get_current_admin_user
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# Pydantic 모델들
class SystemInfoResponse(BaseModel):
    total_memory_gb: float
    available_memory_gb: float
    cpu_cores: int
    cpu_threads: int
    platform: str
    disk_io_type: str
    postgres_version: str
    analysis_timestamp: datetime

class OptimizationSettings(BaseModel):
    shared_buffers: str
    work_mem: str
    maintenance_work_mem: str
    effective_cache_size: str
    max_connections: int
    random_page_cost: float
    checkpoint_completion_target: float
    wal_buffers: str
    min_wal_size: str
    max_wal_size: str

class TuningReportResponse(BaseModel):
    system_info: Dict[str, Any]
    optimized_settings: Dict[str, Any]
    recommendations: list
    tuning_rationale: Dict[str, str]
    generated_at: datetime

class ConfigurationResponse(BaseModel):
    configuration_content: str
    file_size_bytes: int
    settings_count: int
    generated_at: datetime
    installation_instructions: list

# 의존성: 관리자 권한 필요
async def require_admin_user(current_user: dict = Depends(get_current_admin_user)):
    return current_user

@router.get("/system-info", response_model=SystemInfoResponse)
async def get_system_info(admin_user: dict = Depends(require_admin_user)):
    """시스템 리소스 정보 조회"""
    try:
        system_info = postgres_optimizer.system_info
        
        return SystemInfoResponse(
            total_memory_gb=system_info.total_memory_gb,
            available_memory_gb=system_info.available_memory_gb,
            cpu_cores=system_info.cpu_cores,
            cpu_threads=system_info.cpu_threads,
            platform=system_info.platform,
            disk_io_type=system_info.disk_io_type,
            postgres_version=system_info.postgres_version,
            analysis_timestamp=datetime.now()
        )
        
    except Exception as e:
        logger.error(f"Failed to get system info: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to analyze system: {str(e)}"
        )

@router.get("/optimal-settings", response_model=OptimizationSettings)
async def get_optimal_settings(admin_user: dict = Depends(require_admin_user)):
    """최적화된 PostgreSQL 설정 조회"""
    try:
        settings = postgres_optimizer.calculate_optimal_settings()
        
        return OptimizationSettings(
            shared_buffers=settings["shared_buffers"],
            work_mem=settings["work_mem"],
            maintenance_work_mem=settings["maintenance_work_mem"],
            effective_cache_size=settings["effective_cache_size"],
            max_connections=settings["max_connections"],
            random_page_cost=settings["random_page_cost"],
            checkpoint_completion_target=settings["checkpoint_completion_target"],
            wal_buffers=settings["wal_buffers"],
            min_wal_size=settings["min_wal_size"],
            max_wal_size=settings["max_wal_size"]
        )
        
    except Exception as e:
        logger.error(f"Failed to calculate optimal settings: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to calculate optimal settings: {str(e)}"
        )

@router.get("/tuning-report", response_model=TuningReportResponse)
async def get_tuning_report(admin_user: dict = Depends(require_admin_user)):
    """PostgreSQL 튜닝 보고서 생성"""
    try:
        report = postgres_optimizer.generate_tuning_report()
        
        return TuningReportResponse(
            system_info=report["system_info"],
            optimized_settings=report["optimized_settings"],
            recommendations=report["recommendations"],
            tuning_rationale=report["tuning_rationale"],
            generated_at=datetime.now()
        )
        
    except Exception as e:
        logger.error(f"Failed to generate tuning report: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate tuning report: {str(e)}"
        )

@router.get("/configuration-file", response_model=ConfigurationResponse)
async def generate_configuration_file(admin_user: dict = Depends(require_admin_user)):
    """최적화된 PostgreSQL 설정 파일 생성"""
    try:
        # 설정 파일 내용 생성
        config_content = postgres_optimizer.generate_postgresql_conf()
        
        # 설정 개수 계산
        settings_count = len([line for line in config_content.split('\n') 
                            if line.strip() and not line.strip().startswith('#') and '=' in line])
        
        # 설치 지침
        installation_instructions = [
            "1. Stop PostgreSQL service: sudo systemctl stop postgresql",
            "2. Backup current configuration: sudo cp /etc/postgresql/*/main/postgresql.conf /etc/postgresql/*/main/postgresql.conf.backup",
            "3. Apply new configuration by copying the generated content to postgresql.conf",
            "4. Verify configuration syntax: sudo -u postgres postgres --check-config",
            "5. Start PostgreSQL service: sudo systemctl start postgresql",
            "6. Verify settings: sudo -u postgres psql -c \"SHOW ALL;\" | grep -E '(shared_buffers|work_mem|max_connections)'"
        ]
        
        return ConfigurationResponse(
            configuration_content=config_content,
            file_size_bytes=len(config_content.encode('utf-8')),
            settings_count=settings_count,
            generated_at=datetime.now(),
            installation_instructions=installation_instructions
        )
        
    except Exception as e:
        logger.error(f"Failed to generate configuration file: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate configuration file: {str(e)}"
        )

@router.post("/analyze-performance")
async def analyze_current_performance(admin_user: dict = Depends(require_admin_user)):
    """현재 PostgreSQL 성능 분석"""
    try:
        from ....core.database import AsyncSessionLocal
        from sqlalchemy import text
        
        performance_data = {}
        
        async with AsyncSessionLocal() as session:
            # 현재 설정 조회
            current_settings_query = """
            SELECT name, setting, unit, context, source 
            FROM pg_settings 
            WHERE name IN (
                'shared_buffers', 'work_mem', 'maintenance_work_mem',
                'effective_cache_size', 'max_connections', 'random_page_cost',
                'checkpoint_completion_target', 'wal_buffers'
            )
            ORDER BY name;
            """
            
            result = await session.execute(text(current_settings_query))
            current_settings = [dict(row._mapping) for row in result.fetchall()]
            
            # 데이터베이스 통계
            stats_query = """
            SELECT 
                pg_size_pretty(pg_database_size(current_database())) as database_size,
                (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
                (SELECT count(*) FROM pg_stat_activity) as total_connections
            """
            
            result = await session.execute(text(stats_query))
            db_stats = dict(result.fetchone()._mapping)
            
            # 캐시 히트율
            cache_hit_query = """
            SELECT 
                round(
                    sum(blks_hit) * 100.0 / (sum(blks_hit) + sum(blks_read)), 2
                ) as cache_hit_ratio
            FROM pg_stat_database
            WHERE datname = current_database()
            """
            
            result = await session.execute(text(cache_hit_query))
            cache_hit_ratio = result.scalar()
            
        # 최적화 권장사항 생성
        optimal_settings = postgres_optimizer.calculate_optimal_settings()
        
        recommendations = []
        for setting in current_settings:
            setting_name = setting['name']
            current_value = setting['setting']
            optimal_value = optimal_settings.get(setting_name)
            
            if optimal_value and str(optimal_value) != current_value:
                recommendations.append({
                    "setting": setting_name,
                    "current": current_value,
                    "recommended": str(optimal_value),
                    "priority": "high" if setting_name in ['shared_buffers', 'work_mem', 'max_connections'] else "medium"
                })
        
        performance_data = {
            "current_settings": current_settings,
            "database_stats": db_stats,
            "cache_hit_ratio": cache_hit_ratio,
            "recommendations": recommendations,
            "analysis_timestamp": datetime.now().isoformat(),
            "overall_assessment": {
                "cache_performance": "excellent" if cache_hit_ratio > 95 else "good" if cache_hit_ratio > 90 else "needs_improvement",
                "settings_optimization": f"{len(recommendations)} settings can be optimized",
                "total_recommendations": len(recommendations)
            }
        }
        
        return performance_data
        
    except Exception as e:
        logger.error(f"Failed to analyze performance: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to analyze performance: {str(e)}"
        )

@router.get("/optimization-summary")
async def get_optimization_summary(admin_user: dict = Depends(require_admin_user)):
    """PostgreSQL 최적화 요약 정보"""
    try:
        system_info = postgres_optimizer.system_info
        optimal_settings = postgres_optimizer.calculate_optimal_settings()
        
        # 메모리 사용량 계산
        shared_buffers_mb = int(optimal_settings["shared_buffers"].replace("MB", ""))
        work_mem_mb = int(optimal_settings["work_mem"].replace("MB", ""))
        maintenance_work_mem_mb = int(optimal_settings["maintenance_work_mem"].replace("MB", ""))
        
        total_pg_memory_mb = shared_buffers_mb + (work_mem_mb * optimal_settings["max_connections"]) + maintenance_work_mem_mb
        total_system_memory_mb = system_info.total_memory_gb * 1024
        
        memory_utilization = (total_pg_memory_mb / total_system_memory_mb) * 100
        
        summary = {
            "system_overview": {
                "total_memory_gb": system_info.total_memory_gb,
                "cpu_cores": system_info.cpu_cores,
                "cpu_threads": system_info.cpu_threads,
                "disk_type": system_info.disk_io_type,
                "postgres_version": system_info.postgres_version
            },
            "optimization_impact": {
                "memory_utilization_percent": round(memory_utilization, 1),
                "max_connections": optimal_settings["max_connections"],
                "shared_buffers_mb": shared_buffers_mb,
                "work_mem_mb": work_mem_mb,
                "cache_size_gb": round(int(optimal_settings["effective_cache_size"].replace("MB", "")) / 1024, 1)
            },
            "performance_expectations": [
                f"Memory cache efficiency improved with {shared_buffers_mb}MB shared buffers",
                f"Concurrent query performance optimized for {optimal_settings['max_connections']} connections",
                f"Disk I/O optimized for {system_info.disk_io_type} storage with random_page_cost = {optimal_settings['random_page_cost']}",
                "WAL configuration optimized for write performance and crash recovery",
                "Background writer tuned for optimal checkpoint performance"
            ],
            "next_steps": [
                "Review and test configuration in development environment",
                "Plan maintenance window for PostgreSQL restart",
                "Monitor performance metrics after configuration changes",
                "Set up automated performance monitoring",
                "Schedule regular VACUUM and ANALYZE operations"
            ],
            "generated_at": datetime.now().isoformat()
        }
        
        return summary
        
    except Exception as e:
        logger.error(f"Failed to generate optimization summary: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate optimization summary: {str(e)}"
        )