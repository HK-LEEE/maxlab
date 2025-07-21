"""
성능 메트릭 API 엔드포인트
OAuth 인증 시스템의 성능 모니터링을 위한 메트릭을 제공합니다.
"""
from fastapi import APIRouter, Depends
from typing import Dict, Any
import logging

from ..core.security import require_admin, performance_metrics

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/performance")
async def get_performance_metrics(
    admin_user: Dict[str, Any] = Depends(require_admin)
) -> Dict[str, Any]:
    """
    OAuth 인증 시스템 성능 메트릭 조회 (관리자 전용)
    
    Returns:
        dict: 성능 통계 데이터
    """
    try:
        stats = performance_metrics.get_stats()
        
        # Add additional system info
        response = {
            "status": "active",
            "metrics": stats,
            "performance_targets": {
                "response_time_target_ms": 200,
                "success_rate_target": 0.99
            }
        }
        
        # Add alerts based on performance
        alerts = []
        
        if 'oauth_verify' in stats:
            verify_stats = stats['oauth_verify']
            if verify_stats['avg_response_time_ms'] > 200:
                alerts.append({
                    "type": "performance",
                    "message": f"OAuth verification avg response time {verify_stats['avg_response_time_ms']:.1f}ms exceeds 200ms target"
                })
            if verify_stats['success_rate'] < 0.99:
                alerts.append({
                    "type": "reliability",
                    "message": f"OAuth verification success rate {verify_stats['success_rate']:.2%} below 99% target"
                })
        
        if 'response_times' in stats:
            rt_stats = stats['response_times']
            if rt_stats['p95'] > 200:
                alerts.append({
                    "type": "performance",
                    "message": f"95th percentile response time {rt_stats['p95']:.1f}ms exceeds 200ms target"
                })
        
        response["alerts"] = alerts
        
        logger.info(f"Performance metrics requested by admin: {admin_user.get('email', 'unknown')}")
        return response
        
    except Exception as e:
        logger.error(f"Failed to retrieve performance metrics: {e}")
        return {
            "status": "error",
            "message": "Failed to retrieve performance metrics",
            "metrics": {},
            "alerts": [{"type": "error", "message": "Metrics collection error"}]
        }


@router.post("/performance/reset")
async def reset_performance_metrics(
    admin_user: Dict[str, Any] = Depends(require_admin)
) -> Dict[str, str]:
    """
    성능 메트릭 초기화 (관리자 전용)
    
    Returns:
        dict: 초기화 결과
    """
    try:
        # Reset metrics
        performance_metrics.metrics = {
            'oauth_verify_requests': 0,
            'oauth_verify_total_time': 0,
            'oauth_verify_success': 0,
            'oauth_verify_failures': 0,
            'oauth_groups_requests': 0,
            'oauth_groups_total_time': 0,
            'oauth_groups_success': 0,
            'oauth_groups_failures': 0,
            'response_times': []
        }
        
        logger.info(f"Performance metrics reset by admin: {admin_user.get('email', 'unknown')}")
        return {
            "status": "success",
            "message": "Performance metrics have been reset"
        }
        
    except Exception as e:
        logger.error(f"Failed to reset performance metrics: {e}")
        return {
            "status": "error",
            "message": "Failed to reset performance metrics"
        }


@router.get("/health/oauth")
async def oauth_health_check() -> Dict[str, Any]:
    """
    OAuth 시스템 헬스 체크 (인증 불필요)
    
    Returns:
        dict: OAuth 시스템 상태
    """
    try:
        from ..core.security import oauth_circuit_breaker
        
        # Circuit breaker status
        circuit_status = "healthy"
        if oauth_circuit_breaker.state.value == "open":
            circuit_status = "circuit_open"
        elif oauth_circuit_breaker.state.value == "half_open":
            circuit_status = "circuit_half_open"
        
        # Basic performance summary
        stats = performance_metrics.get_stats()
        health_summary = {
            "circuit_breaker": circuit_status,
            "total_requests": 0,
            "success_rate": 1.0,
            "avg_response_time_ms": 0
        }
        
        if 'oauth_verify' in stats:
            verify_stats = stats['oauth_verify']
            health_summary.update({
                "total_requests": verify_stats['requests'],
                "success_rate": verify_stats['success_rate'],
                "avg_response_time_ms": verify_stats['avg_response_time_ms']
            })
        
        # Overall health status
        overall_status = "healthy"
        if circuit_status == "circuit_open":
            overall_status = "degraded"
        elif health_summary['success_rate'] < 0.95:
            overall_status = "unhealthy"
        elif health_summary['avg_response_time_ms'] > 500:
            overall_status = "slow"
        
        return {
            "status": overall_status,
            "timestamp": int(time.time()),
            "oauth_system": health_summary
        }
        
    except Exception as e:
        logger.error(f"OAuth health check failed: {e}")
        return {
            "status": "error",
            "timestamp": int(time.time()),
            "oauth_system": {"error": "Health check failed"}
        }