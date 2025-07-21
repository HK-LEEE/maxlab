"""
성능 모니터링 서비스
API 응답 시간, 쿼리 성능, 캐시 효율성 등을 모니터링
"""
import time
import asyncio
from typing import Dict, Any, List, Optional, Callable
from datetime import datetime, timedelta
from collections import deque, defaultdict
import logging
from contextlib import asynccontextmanager
from functools import wraps
import statistics

logger = logging.getLogger(__name__)


class PerformanceMetrics:
    """성능 메트릭 데이터 클래스"""
    
    def __init__(self, max_history: int = 1000):
        self.max_history = max_history
        self.response_times: deque = deque(maxlen=max_history)
        self.query_times: deque = deque(maxlen=max_history)
        self.cache_operations = {
            "hits": 0,
            "misses": 0,
            "sets": 0,
            "invalidations": 0
        }
        self.endpoint_metrics: Dict[str, deque] = defaultdict(lambda: deque(maxlen=100))
        self.error_counts: Dict[str, int] = defaultdict(int)
        self.start_time = datetime.now()
    
    def add_response_time(self, endpoint: str, duration_ms: float):
        """응답 시간 추가"""
        self.response_times.append(duration_ms)
        self.endpoint_metrics[endpoint].append(duration_ms)
    
    def add_query_time(self, query_type: str, duration_ms: float):
        """쿼리 시간 추가"""
        self.query_times.append({
            "type": query_type,
            "duration_ms": duration_ms,
            "timestamp": datetime.now()
        })
    
    def record_cache_hit(self):
        """캐시 히트 기록"""
        self.cache_operations["hits"] += 1
    
    def record_cache_miss(self):
        """캐시 미스 기록"""
        self.cache_operations["misses"] += 1
    
    def record_cache_set(self):
        """캐시 설정 기록"""
        self.cache_operations["sets"] += 1
    
    def record_cache_invalidation(self):
        """캐시 무효화 기록"""
        self.cache_operations["invalidations"] += 1
    
    def record_error(self, error_type: str):
        """에러 기록"""
        self.error_counts[error_type] += 1
    
    def get_statistics(self) -> Dict[str, Any]:
        """통계 정보 반환"""
        uptime = datetime.now() - self.start_time
        
        # 응답 시간 통계
        response_stats = {}
        if self.response_times:
            response_stats = {
                "count": len(self.response_times),
                "mean": statistics.mean(self.response_times),
                "median": statistics.median(self.response_times),
                "p95": self._calculate_percentile(list(self.response_times), 95),
                "p99": self._calculate_percentile(list(self.response_times), 99),
                "min": min(self.response_times),
                "max": max(self.response_times)
            }
        
        # 캐시 효율성
        total_cache_ops = self.cache_operations["hits"] + self.cache_operations["misses"]
        cache_hit_rate = (
            self.cache_operations["hits"] / total_cache_ops * 100 
            if total_cache_ops > 0 else 0
        )
        
        # 엔드포인트별 통계
        endpoint_stats = {}
        for endpoint, times in self.endpoint_metrics.items():
            if times:
                endpoint_stats[endpoint] = {
                    "count": len(times),
                    "mean": statistics.mean(times),
                    "p95": self._calculate_percentile(list(times), 95)
                }
        
        return {
            "uptime_seconds": uptime.total_seconds(),
            "response_times": response_stats,
            "cache": {
                **self.cache_operations,
                "hit_rate_percentage": cache_hit_rate
            },
            "endpoints": endpoint_stats,
            "errors": dict(self.error_counts),
            "query_performance": self._get_query_statistics()
        }
    
    def _calculate_percentile(self, data: List[float], percentile: int) -> float:
        """백분위수 계산"""
        if not data:
            return 0
        sorted_data = sorted(data)
        index = int(len(sorted_data) * percentile / 100)
        return sorted_data[min(index, len(sorted_data) - 1)]
    
    def _get_query_statistics(self) -> Dict[str, Any]:
        """쿼리 통계 정보"""
        if not self.query_times:
            return {}
        
        query_stats = defaultdict(list)
        for query in self.query_times:
            query_stats[query["type"]].append(query["duration_ms"])
        
        result = {}
        for query_type, times in query_stats.items():
            result[query_type] = {
                "count": len(times),
                "mean": statistics.mean(times),
                "p95": self._calculate_percentile(times, 95)
            }
        
        return result


class PerformanceMonitor:
    """성능 모니터링 서비스"""
    
    def __init__(self):
        self.metrics = PerformanceMetrics()
        self._monitoring_enabled = True
    
    @asynccontextmanager
    async def monitor_request(self, endpoint: str):
        """요청 성능 모니터링 컨텍스트 매니저"""
        if not self._monitoring_enabled:
            yield
            return
        
        start_time = time.time()
        try:
            yield
        finally:
            duration_ms = (time.time() - start_time) * 1000
            self.metrics.add_response_time(endpoint, duration_ms)
            
            if duration_ms > 1000:  # 1초 이상 걸린 경우 경고
                logger.warning(f"Slow request detected: {endpoint} took {duration_ms:.1f}ms")
    
    @asynccontextmanager
    async def monitor_query(self, query_type: str):
        """쿼리 성능 모니터링 컨텍스트 매니저"""
        if not self._monitoring_enabled:
            yield
            return
        
        start_time = time.time()
        try:
            yield
        finally:
            duration_ms = (time.time() - start_time) * 1000
            self.metrics.add_query_time(query_type, duration_ms)
            
            if duration_ms > 200:  # 200ms 이상 걸린 경우 경고
                logger.warning(f"Slow query detected: {query_type} took {duration_ms:.1f}ms")
    
    def monitor_cache_operation(self, operation: str):
        """캐시 작업 모니터링"""
        if not self._monitoring_enabled:
            return
        
        if operation == "hit":
            self.metrics.record_cache_hit()
        elif operation == "miss":
            self.metrics.record_cache_miss()
        elif operation == "set":
            self.metrics.record_cache_set()
        elif operation == "invalidate":
            self.metrics.record_cache_invalidation()
    
    def record_error(self, error_type: str):
        """에러 기록"""
        if self._monitoring_enabled:
            self.metrics.record_error(error_type)
            logger.error(f"Error recorded: {error_type}")
    
    def get_statistics(self) -> Dict[str, Any]:
        """통계 정보 반환"""
        return self.metrics.get_statistics()
    
    def reset_metrics(self):
        """메트릭 초기화"""
        self.metrics = PerformanceMetrics()
        logger.info("Performance metrics reset")
    
    def enable_monitoring(self):
        """모니터링 활성화"""
        self._monitoring_enabled = True
    
    def disable_monitoring(self):
        """모니터링 비활성화"""
        self._monitoring_enabled = False


def monitor_performance(monitor: PerformanceMonitor, endpoint: str):
    """성능 모니터링 데코레이터"""
    def decorator(func: Callable):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            async with monitor.monitor_request(endpoint):
                return await func(*args, **kwargs)
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                result = func(*args, **kwargs)
                return result
            finally:
                duration_ms = (time.time() - start_time) * 1000
                monitor.metrics.add_response_time(endpoint, duration_ms)
        
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator


# 싱글톤 인스턴스
performance_monitor = PerformanceMonitor()