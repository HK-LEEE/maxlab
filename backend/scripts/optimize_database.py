#!/usr/bin/env python3
"""
데이터베이스 성능 최적화 스크립트
"""
import asyncio
import sys
import os
from pathlib import Path

# 프로젝트 루트를 Python 경로에 추가
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from app.core.database import AsyncSessionLocal
from app.core.db_performance import (
    create_performance_indexes,
    analyze_database_performance,
    optimize_database_settings,
    optimize_workspace_queries,
    performance_monitor
)
import logging

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

async def main():
    """메인 최적화 함수"""
    logger.info("Starting database optimization...")
    
    async with AsyncSessionLocal() as session:
        try:
            # 1. 성능 인덱스 생성
            logger.info("Creating performance indexes...")
            await create_performance_indexes(session)
            
            # 2. 워크스페이스 쿼리 최적화
            logger.info("Optimizing workspace queries...")
            await optimize_workspace_queries(session)
            
            # 3. 데이터베이스 설정 최적화
            logger.info("Optimizing database settings...")
            optimization_results = await optimize_database_settings(session)
            logger.info(f"Optimization results: {optimization_results}")
            
            # 4. 성능 분석 실행
            logger.info("Analyzing database performance...")
            performance_analysis = await analyze_database_performance(session)
            
            # 결과 출력
            logger.info("=== Database Performance Analysis ===")
            
            # 데이터베이스 통계
            if "database_stats" in performance_analysis:
                db_stats = performance_analysis["database_stats"]
                if db_stats and len(db_stats) > 0:
                    stats = db_stats[0]
                    logger.info(f"Active connections: {stats.get('numbackends', 'N/A')}")
                    logger.info(f"Committed transactions: {stats.get('xact_commit', 'N/A')}")
                    logger.info(f"Rolled back transactions: {stats.get('xact_rollback', 'N/A')}")
                    logger.info(f"Cache hit ratio: {calculate_cache_hit_ratio(stats):.2%}")
            
            # 느린 쿼리 (pg_stat_statements가 활성화된 경우)
            if "slow_queries" in performance_analysis:
                slow_queries = performance_analysis["slow_queries"]
                if isinstance(slow_queries, list) and len(slow_queries) > 0:
                    logger.info(f"Found {len(slow_queries)} slow queries")
                    for i, query in enumerate(slow_queries[:3], 1):  # 상위 3개만 표시
                        logger.info(f"Slow Query #{i}: {query.get('mean_time', 'N/A'):.2f}ms avg")
                else:
                    logger.info("No slow queries found or pg_stat_statements not available")
            
            # 인덱스 사용률
            if "index_usage" in performance_analysis:
                index_usage = performance_analysis["index_usage"]
                if isinstance(index_usage, list):
                    total_reads = sum(idx.get('idx_tup_read', 0) for idx in index_usage)
                    logger.info(f"Total index reads: {total_reads:,}")
            
            logger.info("Database optimization completed successfully!")
            
        except Exception as e:
            logger.error(f"Database optimization failed: {e}")
            raise

def calculate_cache_hit_ratio(stats: dict) -> float:
    """캐시 히트 비율 계산"""
    blks_hit = stats.get('blks_hit', 0)
    blks_read = stats.get('blks_read', 0)
    
    if blks_hit + blks_read == 0:
        return 0.0
    
    return blks_hit / (blks_hit + blks_read)

async def run_performance_test():
    """성능 테스트 실행"""
    logger.info("Running performance test...")
    
    async with AsyncSessionLocal() as session:
        # 테스트 쿼리들
        test_queries = [
            ("workspace_list", "SELECT id, name FROM workspaces WHERE is_active = true LIMIT 10"),
            ("file_count", "SELECT COUNT(*) FROM workspace_files WHERE is_deleted = false"),
            ("module_stats", "SELECT workspace_id, COUNT(*) FROM mvp_modules GROUP BY workspace_id"),
        ]
        
        for query_name, query in test_queries:
            async with performance_monitor.monitor_query(query_name, session):
                try:
                    from sqlalchemy import text
                    result = await session.execute(text(query))
                    rows = result.fetchall()
                    logger.info(f"Query '{query_name}' returned {len(rows)} rows")
                except Exception as e:
                    logger.error(f"Query '{query_name}' failed: {e}")
        
        # 통계 출력
        stats = performance_monitor.get_query_statistics()
        logger.info("=== Query Performance Statistics ===")
        for query_name, stat in stats.items():
            logger.info(f"{query_name}:")
            logger.info(f"  Calls: {stat['total_calls']}")
            logger.info(f"  Avg time: {stat['avg_time']:.3f}s")
            logger.info(f"  Max time: {stat['max_time']:.3f}s")
            logger.info(f"  Slow queries: {stat['slow_queries']} ({stat['slow_query_percentage']:.1f}%)")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Database optimization script")
    parser.add_argument("--test", action="store_true", help="Run performance test")
    args = parser.parse_args()
    
    if args.test:
        asyncio.run(run_performance_test())
    else:
        asyncio.run(main())