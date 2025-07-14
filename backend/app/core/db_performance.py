"""
데이터베이스 성능 모니터링 및 최적화 유틸리티
"""
import time
import logging
from typing import Dict, List, Any, Optional
from contextlib import asynccontextmanager
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.engine import Result
import asyncio

logger = logging.getLogger(__name__)

class DatabasePerformanceMonitor:
    """데이터베이스 성능 모니터링 클래스"""
    
    def __init__(self):
        self.slow_query_threshold = 1.0  # 1초 이상 소요되는 쿼리를 slow query로 분류
        self.query_stats: Dict[str, Dict[str, Any]] = {}
    
    @asynccontextmanager
    async def monitor_query(self, query_name: str, session: AsyncSession):
        """쿼리 실행 시간을 모니터링하는 컨텍스트 매니저"""
        start_time = time.time()
        try:
            yield
        finally:
            execution_time = time.time() - start_time
            
            # 통계 업데이트
            if query_name not in self.query_stats:
                self.query_stats[query_name] = {
                    "total_calls": 0,
                    "total_time": 0.0,
                    "max_time": 0.0,
                    "min_time": float('inf'),
                    "slow_queries": 0
                }
            
            stats = self.query_stats[query_name]
            stats["total_calls"] += 1
            stats["total_time"] += execution_time
            stats["max_time"] = max(stats["max_time"], execution_time)
            stats["min_time"] = min(stats["min_time"], execution_time)
            
            if execution_time > self.slow_query_threshold:
                stats["slow_queries"] += 1
                logger.warning(
                    f"Slow query detected: {query_name} took {execution_time:.3f}s"
                )
    
    async def analyze_query_performance(self, session: AsyncSession, query: str) -> Dict[str, Any]:
        """EXPLAIN ANALYZE를 사용하여 쿼리 성능 분석"""
        try:
            # EXPLAIN ANALYZE 실행
            explain_query = f"EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) {query}"
            result = await session.execute(text(explain_query))
            explain_result = result.fetchone()[0]
            
            return {
                "query": query,
                "execution_plan": explain_result,
                "analysis_timestamp": time.time()
            }
        except Exception as e:
            logger.error(f"Failed to analyze query: {e}")
            return {"error": str(e)}
    
    def get_query_statistics(self) -> Dict[str, Any]:
        """쿼리 통계 반환"""
        stats = {}
        for query_name, data in self.query_stats.items():
            if data["total_calls"] > 0:
                stats[query_name] = {
                    **data,
                    "avg_time": data["total_time"] / data["total_calls"],
                    "slow_query_percentage": (data["slow_queries"] / data["total_calls"]) * 100
                }
        return stats

# 전역 성능 모니터 인스턴스
performance_monitor = DatabasePerformanceMonitor()

async def create_performance_indexes(session: AsyncSession) -> None:
    """성능 최적화를 위한 추가 인덱스 생성"""
    
    indexes_to_create = [
        # JSONB 데이터 최적화를 위한 GIN 인덱스
        """
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_process_flow_data_gin 
        ON personal_test_process_flows USING GIN (flow_data);
        """,
        
        """
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mvp_module_config_gin 
        ON mvp_modules USING GIN (config);
        """,
        
        """
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workspace_settings_gin 
        ON workspaces USING GIN (settings);
        """,
        
        # 복합 인덱스로 조인 성능 최적화
        """
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workspace_parent_path 
        ON workspaces(parent_id, path) WHERE is_active = true;
        """,
        
        """
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workspace_user_composite 
        ON workspace_users(user_id, workspace_id, permission_level);
        """,
        
        """
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workspace_file_version 
        ON workspace_files(version_of, version) WHERE version_of IS NOT NULL;
        """,
        
        # 시계열 데이터 최적화
        """
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_measurement_equipment_time 
        ON personal_test_measurement_data(equipment_code, timestamp DESC);
        """,
        
        """
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_measurement_code_time 
        ON personal_test_measurement_data(measurement_code, timestamp DESC);
        """,
        
        # 모듈 로그 성능 최적화
        """
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mvp_module_log_time 
        ON mvp_module_logs(module_id, created_at DESC);
        """,
        
        # 데이터 소스 활성 상태 조회 최적화
        """
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_data_source_active 
        ON data_source_configs(workspace_id, is_active, source_type);
        """
    ]
    
    for index_sql in indexes_to_create:
        try:
            await session.execute(text(index_sql.strip()))
            await session.commit()
            logger.info(f"Successfully created index")
        except Exception as e:
            logger.warning(f"Index creation failed or already exists: {e}")
            await session.rollback()

async def analyze_database_performance(session: AsyncSession) -> Dict[str, Any]:
    """데이터베이스 전체 성능 분석"""
    
    performance_queries = {
        "table_sizes": """
            SELECT 
                schemaname,
                tablename,
                attname,
                n_distinct,
                correlation
            FROM pg_stats 
            WHERE schemaname = 'public'
            ORDER BY n_distinct DESC;
        """,
        
        "slow_queries": """
            SELECT 
                query,
                calls,
                total_time,
                mean_time,
                stddev_time,
                rows
            FROM pg_stat_statements 
            WHERE mean_time > 100  -- 100ms 이상
            ORDER BY mean_time DESC 
            LIMIT 10;
        """,
        
        "index_usage": """
            SELECT 
                schemaname,
                tablename,
                indexname,
                idx_tup_read,
                idx_tup_fetch
            FROM pg_stat_user_indexes 
            ORDER BY idx_tup_read DESC;
        """,
        
        "database_stats": """
            SELECT 
                datname,
                numbackends,
                xact_commit,
                xact_rollback,
                blks_read,
                blks_hit,
                tup_returned,
                tup_fetched,
                tup_inserted,
                tup_updated,
                tup_deleted
            FROM pg_stat_database 
            WHERE datname = current_database();
        """
    }
    
    results = {}
    
    for analysis_name, query in performance_queries.items():
        try:
            result = await session.execute(text(query))
            results[analysis_name] = [dict(row._mapping) for row in result.fetchall()]
        except Exception as e:
            logger.error(f"Failed to execute {analysis_name} query: {e}")
            results[analysis_name] = {"error": str(e)}
    
    return results

async def optimize_database_settings(session: AsyncSession) -> Dict[str, Any]:
    """데이터베이스 설정 최적화"""
    
    optimization_queries = [
        # 통계 정보 업데이트
        "ANALYZE;",
        
        # 죽은 튜플 정리
        "VACUUM ANALYZE;",
        
        # pg_stat_statements 확장 활성화 (있는 경우)
        "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;",
    ]
    
    results = []
    
    for query in optimization_queries:
        try:
            await session.execute(text(query))
            await session.commit()
            results.append(f"Successfully executed: {query}")
        except Exception as e:
            logger.warning(f"Optimization query failed: {query} - {e}")
            results.append(f"Failed: {query} - {str(e)}")
            await session.rollback()
    
    return {"optimization_results": results}

# 쿼리 성능 최적화를 위한 헬퍼 함수들
async def optimize_workspace_queries(session: AsyncSession):
    """워크스페이스 관련 쿼리 최적화"""
    
    # 권한 확인 최적화를 위한 뷰 생성
    create_permission_view = """
    CREATE OR REPLACE VIEW workspace_permissions_view AS
    SELECT DISTINCT 
        w.id as workspace_id,
        wu.user_id,
        GREATEST(wu.permission_level, wg.permission_level) as max_permission
    FROM workspaces w
    LEFT JOIN workspace_users wu ON w.id = wu.workspace_id
    LEFT JOIN workspace_groups wg ON w.id = wg.workspace_id
    WHERE w.is_active = true;
    """
    
    try:
        await session.execute(text(create_permission_view))
        await session.commit()
        logger.info("Created workspace permissions view for optimized queries")
    except Exception as e:
        logger.warning(f"Failed to create permissions view: {e}")
        await session.rollback()

class QueryOptimizer:
    """쿼리 최적화를 위한 헬퍼 클래스"""
    
    @staticmethod
    def build_optimized_permission_query(user_id: str, user_groups: List[str]) -> str:
        """최적화된 권한 확인 쿼리 생성"""
        return f"""
        SELECT w.* 
        FROM workspaces w
        WHERE w.is_active = true 
        AND (
            EXISTS (
                SELECT 1 FROM workspace_users wu 
                WHERE wu.workspace_id = w.id AND wu.user_id = '{user_id}'
            )
            OR EXISTS (
                SELECT 1 FROM workspace_groups wg 
                WHERE wg.workspace_id = w.id AND wg.group_name = ANY(ARRAY{user_groups})
            )
            OR w.owner_id = '{user_id}'
        )
        ORDER BY w.updated_at DESC;
        """
    
    @staticmethod
    def build_optimized_file_stats_query(workspace_id: str) -> str:
        """최적화된 파일 통계 쿼리 생성"""
        return f"""
        WITH file_stats AS (
            SELECT 
                mime_type,
                COUNT(*) as file_count,
                SUM(file_size) as total_size,
                AVG(file_size) as avg_size
            FROM workspace_files 
            WHERE workspace_id = '{workspace_id}' 
            AND is_deleted = false 
            AND is_directory = false
            GROUP BY mime_type
        )
        SELECT 
            mime_type,
            file_count,
            total_size,
            avg_size,
            ROUND((total_size::numeric / SUM(total_size) OVER()) * 100, 2) as percentage
        FROM file_stats
        ORDER BY total_size DESC;
        """