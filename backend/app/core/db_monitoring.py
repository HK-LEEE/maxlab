"""
데이터베이스 모니터링 및 성능 추적 시스템
PostgreSQL 쿼리 성능, 연결 상태, 시스템 메트릭 모니터링
"""
import asyncio
import logging
import json
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from pathlib import Path
import psutil
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .database import AsyncSessionLocal
from .config import settings

logger = logging.getLogger(__name__)

@dataclass
class QueryStats:
    """쿼리 통계 정보"""
    query: str
    calls: int
    total_time: float
    mean_time: float
    stddev_time: float
    rows: int
    hit_percent: float
    query_hash: str

@dataclass
class ConnectionStats:
    """연결 통계 정보"""
    total_connections: int
    active_connections: int
    idle_connections: int
    idle_in_transaction: int
    waiting_connections: int
    max_connections: int
    usage_percent: float

@dataclass
class DatabaseStats:
    """데이터베이스 전체 통계"""
    database_name: str
    database_size_bytes: int
    cache_hit_ratio: float
    commits_per_second: float
    rollbacks_per_second: float
    blocks_read_per_second: float
    blocks_hit_per_second: float
    tuples_inserted_per_second: float
    tuples_updated_per_second: float
    tuples_deleted_per_second: float

@dataclass
class LockStats:
    """락 통계 정보"""
    waiting_queries: int
    lock_waits_per_second: float
    deadlocks_per_second: float
    blocking_queries: List[Dict[str, Any]]

class DatabaseMonitor:
    """데이터베이스 모니터링 클래스"""
    
    def __init__(self):
        self.monitoring_enabled = True
        self.alert_thresholds = {
            "slow_query_threshold_ms": 1000,
            "high_connection_usage_percent": 80,
            "low_cache_hit_ratio_percent": 90,
            "high_lock_wait_time_ms": 5000,
            "max_database_size_gb": 100
        }
        self.metrics_history: List[Dict[str, Any]] = []
        self.max_history_entries = 1000
    
    async def setup_monitoring_extensions(self, session: AsyncSession) -> Dict[str, bool]:
        """모니터링 확장 설정"""
        extensions_status = {}
        
        # pg_stat_statements 확장 설치/활성화
        try:
            await session.execute(text("CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"))
            await session.commit()
            extensions_status["pg_stat_statements"] = True
            logger.info("pg_stat_statements extension enabled")
        except Exception as e:
            logger.error(f"Failed to enable pg_stat_statements: {e}")
            extensions_status["pg_stat_statements"] = False
        
        # pg_buffercache 확장 설치/활성화 (선택적)
        try:
            await session.execute(text("CREATE EXTENSION IF NOT EXISTS pg_buffercache;"))
            await session.commit()
            extensions_status["pg_buffercache"] = True
            logger.info("pg_buffercache extension enabled")
        except Exception as e:
            logger.warning(f"pg_buffercache extension not available: {e}")
            extensions_status["pg_buffercache"] = False
        
        return extensions_status
    
    async def get_query_performance_stats(self, session: AsyncSession, limit: int = 20) -> List[QueryStats]:
        """쿼리 성능 통계 조회"""
        try:
            query = """
            SELECT 
                query,
                calls,
                total_exec_time as total_time,
                mean_exec_time as mean_time,
                stddev_exec_time as stddev_time,
                rows,
                100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) as hit_percent,
                queryid::text as query_hash
            FROM pg_stat_statements
            WHERE calls > 1
            ORDER BY total_exec_time DESC
            LIMIT :limit
            """
            
            result = await session.execute(text(query), {"limit": limit})
            stats = []
            
            for row in result.fetchall():
                stat = QueryStats(
                    query=row.query[:200] + "..." if len(row.query) > 200 else row.query,
                    calls=row.calls,
                    total_time=float(row.total_time),
                    mean_time=float(row.mean_time),
                    stddev_time=float(row.stddev_time or 0),
                    rows=row.rows,
                    hit_percent=float(row.hit_percent or 0),
                    query_hash=row.query_hash
                )
                stats.append(stat)
            
            return stats
            
        except Exception as e:
            logger.error(f"Failed to get query performance stats: {e}")
            return []
    
    async def get_connection_stats(self, session: AsyncSession) -> ConnectionStats:
        """연결 통계 조회"""
        try:
            query = """
            SELECT 
                (SELECT count(*) FROM pg_stat_activity) as total_connections,
                (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
                (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle') as idle_connections,
                (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle in transaction') as idle_in_transaction,
                (SELECT count(*) FROM pg_stat_activity WHERE wait_event_type IS NOT NULL) as waiting_connections,
                (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections
            """
            
            result = await session.execute(text(query))
            row = result.fetchone()
            
            usage_percent = (row.total_connections / row.max_connections) * 100
            
            return ConnectionStats(
                total_connections=row.total_connections,
                active_connections=row.active_connections,
                idle_connections=row.idle_connections,
                idle_in_transaction=row.idle_in_transaction,
                waiting_connections=row.waiting_connections,
                max_connections=row.max_connections,
                usage_percent=usage_percent
            )
            
        except Exception as e:
            logger.error(f"Failed to get connection stats: {e}")
            return ConnectionStats(0, 0, 0, 0, 0, 0, 0.0)
    
    async def get_database_stats(self, session: AsyncSession) -> DatabaseStats:
        """데이터베이스 통계 조회"""
        try:
            query = """
            SELECT 
                current_database() as database_name,
                pg_database_size(current_database()) as database_size_bytes,
                round(
                    sum(blks_hit) * 100.0 / (sum(blks_hit) + sum(blks_read)), 2
                ) as cache_hit_ratio,
                round(sum(xact_commit) / 60.0, 2) as commits_per_second,
                round(sum(xact_rollback) / 60.0, 2) as rollbacks_per_second,
                round(sum(blks_read) / 60.0, 2) as blocks_read_per_second,
                round(sum(blks_hit) / 60.0, 2) as blocks_hit_per_second,
                round(sum(tup_inserted) / 60.0, 2) as tuples_inserted_per_second,
                round(sum(tup_updated) / 60.0, 2) as tuples_updated_per_second,
                round(sum(tup_deleted) / 60.0, 2) as tuples_deleted_per_second
            FROM pg_stat_database
            WHERE datname = current_database()
            """
            
            result = await session.execute(text(query))
            row = result.fetchone()
            
            return DatabaseStats(
                database_name=row.database_name,
                database_size_bytes=row.database_size_bytes,
                cache_hit_ratio=float(row.cache_hit_ratio or 0),
                commits_per_second=float(row.commits_per_second or 0),
                rollbacks_per_second=float(row.rollbacks_per_second or 0),
                blocks_read_per_second=float(row.blocks_read_per_second or 0),
                blocks_hit_per_second=float(row.blocks_hit_per_second or 0),
                tuples_inserted_per_second=float(row.tuples_inserted_per_second or 0),
                tuples_updated_per_second=float(row.tuples_updated_per_second or 0),
                tuples_deleted_per_second=float(row.tuples_deleted_per_second or 0)
            )
            
        except Exception as e:
            logger.error(f"Failed to get database stats: {e}")
            return DatabaseStats("unknown", 0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    
    async def get_lock_stats(self, session: AsyncSession) -> LockStats:
        """락 통계 조회"""
        try:
            # 현재 락 대기 상황
            blocking_query = """
            SELECT 
                blocked_locks.pid AS blocked_pid,
                blocked_activity.usename AS blocked_user,
                blocking_locks.pid AS blocking_pid,
                blocking_activity.usename AS blocking_user,
                blocked_activity.query AS blocked_statement,
                blocking_activity.query AS blocking_statement,
                blocked_activity.state AS blocked_state,
                blocking_activity.state AS blocking_state
            FROM pg_catalog.pg_locks blocked_locks
            JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
            JOIN pg_catalog.pg_locks blocking_locks 
                ON blocking_locks.locktype = blocked_locks.locktype
                AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
                AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
                AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
                AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
                AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
                AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
                AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
                AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
                AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
                AND blocking_locks.pid != blocked_locks.pid
            JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
            WHERE NOT blocked_locks.granted;
            """
            
            result = await session.execute(text(blocking_query))
            blocking_queries = [dict(row._mapping) for row in result.fetchall()]
            
            # 락 대기 통계
            lock_wait_query = """
            SELECT 
                count(*) as waiting_queries
            FROM pg_stat_activity 
            WHERE wait_event_type = 'Lock';
            """
            
            result = await session.execute(text(lock_wait_query))
            waiting_queries = result.scalar() or 0
            
            return LockStats(
                waiting_queries=waiting_queries,
                lock_waits_per_second=0.0,  # 시계열 데이터에서 계산 필요
                deadlocks_per_second=0.0,   # 시계열 데이터에서 계산 필요
                blocking_queries=blocking_queries
            )
            
        except Exception as e:
            logger.error(f"Failed to get lock stats: {e}")
            return LockStats(0, 0.0, 0.0, [])
    
    async def get_slow_queries(self, session: AsyncSession, 
                              threshold_ms: float = None, 
                              limit: int = 10) -> List[Dict[str, Any]]:
        """느린 쿼리 조회"""
        if threshold_ms is None:
            threshold_ms = self.alert_thresholds["slow_query_threshold_ms"]
        
        try:
            query = """
            SELECT 
                query,
                calls,
                total_exec_time,
                mean_exec_time,
                max_exec_time,
                rows,
                100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) as hit_percent
            FROM pg_stat_statements
            WHERE mean_exec_time > :threshold
            ORDER BY mean_exec_time DESC
            LIMIT :limit
            """
            
            result = await session.execute(text(query), {
                "threshold": threshold_ms,
                "limit": limit
            })
            
            slow_queries = []
            for row in result.fetchall():
                slow_queries.append({
                    "query": row.query[:500] + "..." if len(row.query) > 500 else row.query,
                    "calls": row.calls,
                    "total_time_ms": round(row.total_exec_time, 2),
                    "mean_time_ms": round(row.mean_exec_time, 2),
                    "max_time_ms": round(row.max_exec_time, 2),
                    "rows": row.rows,
                    "cache_hit_percent": round(row.hit_percent or 0, 2)
                })
            
            return slow_queries
            
        except Exception as e:
            logger.error(f"Failed to get slow queries: {e}")
            return []
    
    async def collect_system_metrics(self) -> Dict[str, Any]:
        """시스템 메트릭 수집"""
        try:
            # CPU 사용률
            cpu_percent = psutil.cpu_percent(interval=1)
            
            # 메모리 사용률
            memory = psutil.virtual_memory()
            
            # 디스크 사용률
            disk = psutil.disk_usage('/')
            
            # 네트워크 I/O
            network = psutil.net_io_counters()
            
            return {
                "timestamp": datetime.now().isoformat(),
                "cpu": {
                    "usage_percent": cpu_percent,
                    "cores": psutil.cpu_count()
                },
                "memory": {
                    "total_gb": memory.total / (1024**3),
                    "available_gb": memory.available / (1024**3),
                    "used_percent": memory.percent
                },
                "disk": {
                    "total_gb": disk.total / (1024**3),
                    "used_gb": disk.used / (1024**3),
                    "free_gb": disk.free / (1024**3),
                    "used_percent": (disk.used / disk.total) * 100
                },
                "network": {
                    "bytes_sent": network.bytes_sent,
                    "bytes_recv": network.bytes_recv,
                    "packets_sent": network.packets_sent,
                    "packets_recv": network.packets_recv
                }
            }
            
        except Exception as e:
            logger.error(f"Failed to collect system metrics: {e}")
            return {}
    
    async def generate_comprehensive_report(self) -> Dict[str, Any]:
        """종합 모니터링 보고서 생성"""
        try:
            async with AsyncSessionLocal() as session:
                # 각종 통계 수집
                query_stats = await self.get_query_performance_stats(session, limit=10)
                connection_stats = await self.get_connection_stats(session)
                database_stats = await self.get_database_stats(session)
                lock_stats = await self.get_lock_stats(session)
                slow_queries = await self.get_slow_queries(session, limit=5)
                system_metrics = await self.collect_system_metrics()
                
                # 알림 상태 확인
                alerts = await self.check_alerts(connection_stats, database_stats, slow_queries)
                
                report = {
                    "report_timestamp": datetime.now().isoformat(),
                    "database_overview": {
                        "name": database_stats.database_name,
                        "size_gb": database_stats.database_size_bytes / (1024**3),
                        "cache_hit_ratio": database_stats.cache_hit_ratio,
                        "commits_per_second": database_stats.commits_per_second,
                        "rollbacks_per_second": database_stats.rollbacks_per_second
                    },
                    "connections": asdict(connection_stats),
                    "query_performance": {
                        "top_queries_by_time": [asdict(q) for q in query_stats[:5]],
                        "slow_queries": slow_queries,
                        "total_queries_analyzed": len(query_stats)
                    },
                    "locks_and_waits": asdict(lock_stats),
                    "system_resources": system_metrics,
                    "alerts": alerts,
                    "health_score": await self.calculate_health_score(
                        connection_stats, database_stats, len(slow_queries)
                    )
                }
                
                # 히스토리에 추가
                self.metrics_history.append(report)
                if len(self.metrics_history) > self.max_history_entries:
                    self.metrics_history.pop(0)
                
                return report
                
        except Exception as e:
            logger.error(f"Failed to generate comprehensive report: {e}")
            return {"error": str(e), "report_timestamp": datetime.now().isoformat()}
    
    async def check_alerts(self, connection_stats: ConnectionStats, 
                          database_stats: DatabaseStats, 
                          slow_queries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """알림 조건 확인"""
        alerts = []
        
        # 연결 사용률 높음
        if connection_stats.usage_percent > self.alert_thresholds["high_connection_usage_percent"]:
            alerts.append({
                "severity": "warning",
                "type": "high_connection_usage",
                "message": f"Connection usage is {connection_stats.usage_percent:.1f}% ({connection_stats.total_connections}/{connection_stats.max_connections})",
                "value": connection_stats.usage_percent,
                "threshold": self.alert_thresholds["high_connection_usage_percent"],
                "timestamp": datetime.now().isoformat()
            })
        
        # 캐시 히트율 낮음
        if database_stats.cache_hit_ratio < self.alert_thresholds["low_cache_hit_ratio_percent"]:
            alerts.append({
                "severity": "warning",
                "type": "low_cache_hit_ratio",
                "message": f"Cache hit ratio is {database_stats.cache_hit_ratio:.1f}%",
                "value": database_stats.cache_hit_ratio,
                "threshold": self.alert_thresholds["low_cache_hit_ratio_percent"],
                "timestamp": datetime.now().isoformat()
            })
        
        # 느린 쿼리 많음
        if len(slow_queries) > 5:
            alerts.append({
                "severity": "info",
                "type": "many_slow_queries",
                "message": f"Found {len(slow_queries)} slow queries",
                "value": len(slow_queries),
                "threshold": 5,
                "timestamp": datetime.now().isoformat()
            })
        
        # 데이터베이스 크기 경고
        db_size_gb = database_stats.database_size_bytes / (1024**3)
        if db_size_gb > self.alert_thresholds["max_database_size_gb"]:
            alerts.append({
                "severity": "warning",
                "type": "large_database_size",
                "message": f"Database size is {db_size_gb:.1f} GB",
                "value": db_size_gb,
                "threshold": self.alert_thresholds["max_database_size_gb"],
                "timestamp": datetime.now().isoformat()
            })
        
        return alerts
    
    async def calculate_health_score(self, connection_stats: ConnectionStats,
                                   database_stats: DatabaseStats,
                                   slow_query_count: int) -> int:
        """데이터베이스 건강도 점수 계산 (0-100)"""
        score = 100
        
        # 연결 사용률 기반 감점
        if connection_stats.usage_percent > 90:
            score -= 20
        elif connection_stats.usage_percent > 70:
            score -= 10
        
        # 캐시 히트율 기반 감점
        if database_stats.cache_hit_ratio < 80:
            score -= 25
        elif database_stats.cache_hit_ratio < 90:
            score -= 15
        elif database_stats.cache_hit_ratio < 95:
            score -= 5
        
        # 느린 쿼리 기반 감점
        if slow_query_count > 10:
            score -= 15
        elif slow_query_count > 5:
            score -= 10
        elif slow_query_count > 2:
            score -= 5
        
        # 롤백률 기반 감점
        if database_stats.rollbacks_per_second > database_stats.commits_per_second * 0.1:
            score -= 10
        
        return max(0, score)
    
    def get_metrics_history(self, hours: int = 24) -> List[Dict[str, Any]]:
        """메트릭 히스토리 조회"""
        cutoff_time = datetime.now() - timedelta(hours=hours)
        
        return [
            metric for metric in self.metrics_history
            if datetime.fromisoformat(metric["report_timestamp"]) > cutoff_time
        ]
    
    async def reset_query_stats(self, session: AsyncSession) -> bool:
        """쿼리 통계 초기화"""
        try:
            await session.execute(text("SELECT pg_stat_statements_reset();"))
            await session.commit()
            logger.info("Query statistics reset successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to reset query statistics: {e}")
            return False

# 전역 모니터 인스턴스
db_monitor = DatabaseMonitor()