"""
데이터베이스 모니터링 API 엔드포인트
실시간 성능 모니터링, 알림, 대시보드 데이터 제공
"""
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from fastapi import APIRouter, HTTPException, Depends, status, BackgroundTasks
from pydantic import BaseModel, Field

from ....core.db_monitoring import db_monitor
from ....core.database import AsyncSessionLocal
from ....core.auth import get_current_admin_user
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# Pydantic 모델들
class QueryStatsResponse(BaseModel):
    query: str
    calls: int
    total_time: float
    mean_time: float
    stddev_time: float
    rows: int
    hit_percent: float
    query_hash: str

class ConnectionStatsResponse(BaseModel):
    total_connections: int
    active_connections: int
    idle_connections: int
    idle_in_transaction: int
    waiting_connections: int
    max_connections: int
    usage_percent: float

class DatabaseStatsResponse(BaseModel):
    database_name: str
    database_size_gb: float
    cache_hit_ratio: float
    commits_per_second: float
    rollbacks_per_second: float
    blocks_read_per_second: float
    blocks_hit_per_second: float
    tuples_inserted_per_second: float
    tuples_updated_per_second: float
    tuples_deleted_per_second: float

class AlertResponse(BaseModel):
    severity: str
    type: str
    message: str
    value: float
    threshold: float
    timestamp: str

class MonitoringReportResponse(BaseModel):
    report_timestamp: str
    database_overview: Dict[str, Any]
    connections: ConnectionStatsResponse
    query_performance: Dict[str, Any]
    locks_and_waits: Dict[str, Any]
    system_resources: Dict[str, Any]
    alerts: List[AlertResponse]
    health_score: int

class SystemMetricsResponse(BaseModel):
    timestamp: str
    cpu: Dict[str, Any]
    memory: Dict[str, Any]
    disk: Dict[str, Any]
    network: Dict[str, Any]

# 의존성: 관리자 권한 필요
async def require_admin_user(current_user: dict = Depends(get_current_admin_user)):
    return current_user

@router.get("/health", response_model=Dict[str, Any])
async def get_database_health(admin_user: dict = Depends(require_admin_user)):
    """데이터베이스 전체 건강 상태 조회"""
    try:
        report = await db_monitor.generate_comprehensive_report()
        
        return {
            "status": "healthy" if report.get("health_score", 0) > 70 else "warning" if report.get("health_score", 0) > 50 else "critical",
            "health_score": report.get("health_score", 0),
            "timestamp": report.get("report_timestamp"),
            "summary": {
                "total_alerts": len(report.get("alerts", [])),
                "critical_alerts": len([a for a in report.get("alerts", []) if a.get("severity") == "critical"]),
                "warning_alerts": len([a for a in report.get("alerts", []) if a.get("severity") == "warning"]),
                "cache_hit_ratio": report.get("database_overview", {}).get("cache_hit_ratio", 0),
                "connection_usage": report.get("connections", {}).get("usage_percent", 0),
                "database_size_gb": report.get("database_overview", {}).get("size_gb", 0)
            },
            "quick_stats": {
                "active_connections": report.get("connections", {}).get("active_connections", 0),
                "slow_queries": len(report.get("query_performance", {}).get("slow_queries", [])),
                "commits_per_second": report.get("database_overview", {}).get("commits_per_second", 0)
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to get database health: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get database health: {str(e)}"
        )

@router.get("/report", response_model=Dict[str, Any])
async def get_comprehensive_report(admin_user: dict = Depends(require_admin_user)):
    """종합 모니터링 보고서 조회"""
    try:
        report = await db_monitor.generate_comprehensive_report()
        return report
        
    except Exception as e:
        logger.error(f"Failed to generate monitoring report: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate monitoring report: {str(e)}"
        )

@router.get("/query-performance")
async def get_query_performance(
    limit: int = 20,
    admin_user: dict = Depends(require_admin_user)
):
    """쿼리 성능 통계 조회"""
    try:
        async with AsyncSessionLocal() as session:
            stats = await db_monitor.get_query_performance_stats(session, limit)
            
            return {
                "timestamp": datetime.now().isoformat(),
                "total_queries": len(stats),
                "queries": [
                    QueryStatsResponse(
                        query=stat.query,
                        calls=stat.calls,
                        total_time=stat.total_time,
                        mean_time=stat.mean_time,
                        stddev_time=stat.stddev_time,
                        rows=stat.rows,
                        hit_percent=stat.hit_percent,
                        query_hash=stat.query_hash
                    ) for stat in stats
                ]
            }
            
    except Exception as e:
        logger.error(f"Failed to get query performance: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get query performance: {str(e)}"
        )

@router.get("/slow-queries")
async def get_slow_queries(
    threshold_ms: float = 1000,
    limit: int = 10,
    admin_user: dict = Depends(require_admin_user)
):
    """느린 쿼리 조회"""
    try:
        async with AsyncSessionLocal() as session:
            slow_queries = await db_monitor.get_slow_queries(session, threshold_ms, limit)
            
            return {
                "timestamp": datetime.now().isoformat(),
                "threshold_ms": threshold_ms,
                "total_slow_queries": len(slow_queries),
                "queries": slow_queries
            }
            
    except Exception as e:
        logger.error(f"Failed to get slow queries: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get slow queries: {str(e)}"
        )

@router.get("/connections", response_model=ConnectionStatsResponse)
async def get_connection_stats(admin_user: dict = Depends(require_admin_user)):
    """연결 통계 조회"""
    try:
        async with AsyncSessionLocal() as session:
            stats = await db_monitor.get_connection_stats(session)
            return stats
            
    except Exception as e:
        logger.error(f"Failed to get connection stats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get connection stats: {str(e)}"
        )

@router.get("/database-stats", response_model=DatabaseStatsResponse)
async def get_database_stats(admin_user: dict = Depends(require_admin_user)):
    """데이터베이스 통계 조회"""
    try:
        async with AsyncSessionLocal() as session:
            stats = await db_monitor.get_database_stats(session)
            
            return DatabaseStatsResponse(
                database_name=stats.database_name,
                database_size_gb=stats.database_size_bytes / (1024**3),
                cache_hit_ratio=stats.cache_hit_ratio,
                commits_per_second=stats.commits_per_second,
                rollbacks_per_second=stats.rollbacks_per_second,
                blocks_read_per_second=stats.blocks_read_per_second,
                blocks_hit_per_second=stats.blocks_hit_per_second,
                tuples_inserted_per_second=stats.tuples_inserted_per_second,
                tuples_updated_per_second=stats.tuples_updated_per_second,
                tuples_deleted_per_second=stats.tuples_deleted_per_second
            )
            
    except Exception as e:
        logger.error(f"Failed to get database stats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get database stats: {str(e)}"
        )

@router.get("/system-metrics", response_model=SystemMetricsResponse)
async def get_system_metrics(admin_user: dict = Depends(require_admin_user)):
    """시스템 메트릭 조회"""
    try:
        metrics = await db_monitor.collect_system_metrics()
        return SystemMetricsResponse(**metrics)
        
    except Exception as e:
        logger.error(f"Failed to get system metrics: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get system metrics: {str(e)}"
        )

@router.get("/alerts")
async def get_active_alerts(admin_user: dict = Depends(require_admin_user)):
    """활성 알림 조회"""
    try:
        report = await db_monitor.generate_comprehensive_report()
        alerts = report.get("alerts", [])
        
        return {
            "timestamp": datetime.now().isoformat(),
            "total_alerts": len(alerts),
            "alerts_by_severity": {
                "critical": [a for a in alerts if a.get("severity") == "critical"],
                "warning": [a for a in alerts if a.get("severity") == "warning"],
                "info": [a for a in alerts if a.get("severity") == "info"]
            },
            "all_alerts": alerts
        }
        
    except Exception as e:
        logger.error(f"Failed to get alerts: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get alerts: {str(e)}"
        )

@router.get("/history")
async def get_metrics_history(
    hours: int = 24,
    admin_user: dict = Depends(require_admin_user)
):
    """메트릭 히스토리 조회"""
    try:
        if hours < 1 or hours > 168:  # 최대 1주일
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Hours must be between 1 and 168"
            )
        
        history = db_monitor.get_metrics_history(hours)
        
        # 시계열 데이터 요약
        timeline = []
        for metric in history:
            timeline.append({
                "timestamp": metric["report_timestamp"],
                "health_score": metric.get("health_score", 0),
                "cache_hit_ratio": metric.get("database_overview", {}).get("cache_hit_ratio", 0),
                "connection_usage": metric.get("connections", {}).get("usage_percent", 0),
                "active_connections": metric.get("connections", {}).get("active_connections", 0),
                "slow_queries": len(metric.get("query_performance", {}).get("slow_queries", [])),
                "alerts_count": len(metric.get("alerts", []))
            })
        
        return {
            "period_hours": hours,
            "total_records": len(history),
            "timeline": timeline,
            "summary": {
                "avg_health_score": sum(t["health_score"] for t in timeline) / len(timeline) if timeline else 0,
                "avg_cache_hit_ratio": sum(t["cache_hit_ratio"] for t in timeline) / len(timeline) if timeline else 0,
                "max_connection_usage": max((t["connection_usage"] for t in timeline), default=0),
                "total_alerts": sum(t["alerts_count"] for t in timeline)
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get metrics history: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get metrics history: {str(e)}"
        )

@router.post("/setup-extensions")
async def setup_monitoring_extensions(admin_user: dict = Depends(require_admin_user)):
    """모니터링 확장 설정"""
    try:
        async with AsyncSessionLocal() as session:
            extensions = await db_monitor.setup_monitoring_extensions(session)
            
            return {
                "timestamp": datetime.now().isoformat(),
                "extensions_status": extensions,
                "setup_successful": all(extensions.values()),
                "message": "Monitoring extensions setup completed"
            }
            
    except Exception as e:
        logger.error(f"Failed to setup monitoring extensions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to setup monitoring extensions: {str(e)}"
        )

@router.post("/reset-query-stats")
async def reset_query_stats(admin_user: dict = Depends(require_admin_user)):
    """쿼리 통계 초기화"""
    try:
        async with AsyncSessionLocal() as session:
            success = await db_monitor.reset_query_stats(session)
            
            if success:
                return {
                    "timestamp": datetime.now().isoformat(),
                    "message": "Query statistics reset successfully",
                    "success": True
                }
            else:
                return {
                    "timestamp": datetime.now().isoformat(),
                    "message": "Failed to reset query statistics",
                    "success": False
                }
            
    except Exception as e:
        logger.error(f"Failed to reset query stats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reset query stats: {str(e)}"
        )

@router.get("/dashboard-data")
async def get_dashboard_data(admin_user: dict = Depends(require_admin_user)):
    """대시보드용 종합 데이터 조회"""
    try:
        report = await db_monitor.generate_comprehensive_report()
        
        # 대시보드에 최적화된 데이터 구조
        dashboard_data = {
            "timestamp": report.get("report_timestamp"),
            "health": {
                "score": report.get("health_score", 0),
                "status": "healthy" if report.get("health_score", 0) > 70 else "warning" if report.get("health_score", 0) > 50 else "critical"
            },
            "database": {
                "name": report.get("database_overview", {}).get("name"),
                "size_gb": round(report.get("database_overview", {}).get("size_gb", 0), 2),
                "cache_hit_ratio": round(report.get("database_overview", {}).get("cache_hit_ratio", 0), 1),
                "commits_per_second": round(report.get("database_overview", {}).get("commits_per_second", 0), 2)
            },
            "connections": {
                "current": report.get("connections", {}).get("total_connections", 0),
                "active": report.get("connections", {}).get("active_connections", 0),
                "max": report.get("connections", {}).get("max_connections", 0),
                "usage_percent": round(report.get("connections", {}).get("usage_percent", 0), 1)
            },
            "performance": {
                "slow_queries_count": len(report.get("query_performance", {}).get("slow_queries", [])),
                "top_query_time": max(
                    [q.get("mean_time", 0) for q in report.get("query_performance", {}).get("top_queries_by_time", [])],
                    default=0
                ),
                "waiting_queries": report.get("locks_and_waits", {}).get("waiting_queries", 0)
            },
            "system": {
                "cpu_usage": report.get("system_resources", {}).get("cpu", {}).get("usage_percent", 0),
                "memory_usage": report.get("system_resources", {}).get("memory", {}).get("used_percent", 0),
                "disk_usage": report.get("system_resources", {}).get("disk", {}).get("used_percent", 0)
            },
            "alerts": {
                "total": len(report.get("alerts", [])),
                "critical": len([a for a in report.get("alerts", []) if a.get("severity") == "critical"]),
                "warning": len([a for a in report.get("alerts", []) if a.get("severity") == "warning"]),
                "recent": report.get("alerts", [])[:5]  # 최근 5개 알림
            }
        }
        
        return dashboard_data
        
    except Exception as e:
        logger.error(f"Failed to get dashboard data: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get dashboard data: {str(e)}"
        )

@router.post("/start-monitoring")
async def start_continuous_monitoring(
    background_tasks: BackgroundTasks,
    interval_minutes: int = 5,
    admin_user: dict = Depends(require_admin_user)
):
    """지속적인 모니터링 시작"""
    try:
        if interval_minutes < 1 or interval_minutes > 60:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Interval must be between 1 and 60 minutes"
            )
        
        async def monitoring_task():
            """백그라운드 모니터링 태스크"""
            try:
                await db_monitor.generate_comprehensive_report()
                logger.info("Continuous monitoring report generated")
            except Exception as e:
                logger.error(f"Continuous monitoring failed: {e}")
        
        # 백그라운드 태스크 추가
        background_tasks.add_task(monitoring_task)
        
        return {
            "timestamp": datetime.now().isoformat(),
            "message": f"Continuous monitoring started with {interval_minutes} minute intervals",
            "interval_minutes": interval_minutes,
            "monitoring_enabled": True
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to start continuous monitoring: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start continuous monitoring: {str(e)}"
        )