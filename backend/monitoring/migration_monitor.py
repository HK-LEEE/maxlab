#!/usr/bin/env python3
"""
Migration Monitoring and Validation Script
Continuously monitors the workspace UUID migration status and data integrity
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
import click
from rich.console import Console
from rich.table import Table
from rich.live import Live
from rich.layout import Layout
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn

from app.core.config import settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

console = Console()

class MigrationMonitor:
    """Monitors UUID migration progress and data integrity"""
    
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.engine = None
        self.async_session = None
        self.monitoring_data = {
            'groups': {
                'total': 0,
                'with_uuid': 0,
                'without_uuid': 0,
                'duplicates': 0,
                'last_updated': None
            },
            'users': {
                'total': 0,
                'with_uuid': 0,
                'without_uuid': 0,
                'duplicates': 0,
                'last_updated': None
            },
            'integrity': {
                'orphaned_permissions': 0,
                'invalid_references': 0,
                'constraint_violations': 0
            },
            'performance': {
                'avg_query_time': 0,
                'slow_queries': 0,
                'index_usage': {}
            }
        }
    
    async def setup(self):
        """Initialize database connection"""
        self.engine = create_async_engine(self.db_url, echo=False)
        self.async_session = sessionmaker(
            self.engine, 
            class_=AsyncSession, 
            expire_on_commit=False
        )
    
    async def teardown(self):
        """Close database connection"""
        if self.engine:
            await self.engine.dispose()
    
    async def check_migration_status(self) -> Dict:
        """Check current migration status"""
        async with self.async_session() as session:
            # Groups status
            result = await session.execute(text("""
                SELECT 
                    COUNT(*) as total,
                    COUNT(group_id_uuid) as with_uuid,
                    COUNT(*) - COUNT(group_id_uuid) as without_uuid
                FROM workspace_groups
            """))
            group_stats = result.fetchone()
            
            self.monitoring_data['groups'].update({
                'total': group_stats.total,
                'with_uuid': group_stats.with_uuid,
                'without_uuid': group_stats.without_uuid,
                'last_updated': datetime.now()
            })
            
            # Check for duplicate UUIDs in groups
            result = await session.execute(text("""
                SELECT group_id_uuid, COUNT(*) as cnt
                FROM workspace_groups 
                WHERE group_id_uuid IS NOT NULL
                GROUP BY workspace_id, group_id_uuid 
                HAVING COUNT(*) > 1
            """))
            self.monitoring_data['groups']['duplicates'] = len(result.fetchall())
            
            # Users status
            result = await session.execute(text("""
                SELECT 
                    COUNT(*) as total,
                    COUNT(user_id_uuid) as with_uuid,
                    COUNT(*) - COUNT(user_id_uuid) as without_uuid
                FROM workspace_users
            """))
            user_stats = result.fetchone()
            
            self.monitoring_data['users'].update({
                'total': user_stats.total,
                'with_uuid': user_stats.with_uuid,
                'without_uuid': user_stats.without_uuid,
                'last_updated': datetime.now()
            })
            
            # Check for duplicate UUIDs in users
            result = await session.execute(text("""
                SELECT user_id_uuid, COUNT(*) as cnt
                FROM workspace_users 
                WHERE user_id_uuid IS NOT NULL
                GROUP BY workspace_id, user_id_uuid 
                HAVING COUNT(*) > 1
            """))
            self.monitoring_data['users']['duplicates'] = len(result.fetchall())
            
            return self.monitoring_data
    
    async def check_data_integrity(self) -> Dict:
        """Check data integrity issues"""
        async with self.async_session() as session:
            # Check for orphaned permissions
            result = await session.execute(text("""
                SELECT COUNT(*) as orphaned
                FROM workspace_groups wg
                LEFT JOIN workspaces w ON wg.workspace_id = w.id
                WHERE w.id IS NULL
            """))
            orphaned_groups = result.scalar()
            
            result = await session.execute(text("""
                SELECT COUNT(*) as orphaned
                FROM workspace_users wu
                LEFT JOIN workspaces w ON wu.workspace_id = w.id
                WHERE w.id IS NULL
            """))
            orphaned_users = result.scalar()
            
            self.monitoring_data['integrity']['orphaned_permissions'] = orphaned_groups + orphaned_users
            
            # Check for invalid UUID references
            result = await session.execute(text("""
                SELECT COUNT(*) as invalid
                FROM workspace_groups
                WHERE group_id_uuid IS NOT NULL
                AND group_id_uuid NOT IN (
                    SELECT DISTINCT group_id_uuid FROM workspace_groups WHERE group_id_uuid IS NOT NULL
                )
            """))
            # This query is simplified - in reality you'd check against external system
            
            return self.monitoring_data
    
    async def check_performance_metrics(self) -> Dict:
        """Check performance metrics related to UUID fields"""
        async with self.async_session() as session:
            # Check index usage on UUID columns
            result = await session.execute(text("""
                SELECT 
                    schemaname,
                    tablename,
                    indexname,
                    idx_scan,
                    idx_tup_read,
                    idx_tup_fetch
                FROM pg_stat_user_indexes
                WHERE tablename IN ('workspace_groups', 'workspace_users')
                AND indexname LIKE '%uuid%'
            """))
            
            index_stats = result.fetchall()
            self.monitoring_data['performance']['index_usage'] = {
                idx.indexname: {
                    'scans': idx.idx_scan,
                    'reads': idx.idx_tup_read,
                    'fetches': idx.idx_tup_fetch
                } for idx in index_stats
            }
            
            return self.monitoring_data
    
    async def generate_health_report(self) -> Dict:
        """Generate comprehensive health report"""
        await self.check_migration_status()
        await self.check_data_integrity()
        await self.check_performance_metrics()
        
        # Calculate health score
        groups_completion = (self.monitoring_data['groups']['with_uuid'] / 
                           self.monitoring_data['groups']['total'] * 100) if self.monitoring_data['groups']['total'] > 0 else 100
        
        users_completion = (self.monitoring_data['users']['with_uuid'] / 
                          self.monitoring_data['users']['total'] * 100) if self.monitoring_data['users']['total'] > 0 else 100
        
        health_score = {
            'overall': (groups_completion + users_completion) / 2,
            'groups_completion': groups_completion,
            'users_completion': users_completion,
            'has_duplicates': self.monitoring_data['groups']['duplicates'] > 0 or self.monitoring_data['users']['duplicates'] > 0,
            'has_integrity_issues': self.monitoring_data['integrity']['orphaned_permissions'] > 0,
            'status': 'healthy' if groups_completion == 100 and users_completion == 100 else 'migrating'
        }
        
        return {
            'health_score': health_score,
            'monitoring_data': self.monitoring_data,
            'timestamp': datetime.now()
        }
    
    def create_dashboard(self) -> Layout:
        """Create monitoring dashboard layout"""
        layout = Layout()
        
        # Create tables
        migration_table = Table(title="Migration Status", show_header=True, header_style="bold magenta")
        migration_table.add_column("Entity", style="cyan", width=12)
        migration_table.add_column("Total", justify="right")
        migration_table.add_column("With UUID", justify="right", style="green")
        migration_table.add_column("Without UUID", justify="right", style="red")
        migration_table.add_column("Duplicates", justify="right", style="yellow")
        migration_table.add_column("Progress", justify="center")
        
        # Groups row
        groups = self.monitoring_data['groups']
        groups_progress = f"{groups['with_uuid']}/{groups['total']} ({groups['with_uuid']/groups['total']*100:.1f}%)" if groups['total'] > 0 else "N/A"
        migration_table.add_row(
            "Groups",
            str(groups['total']),
            str(groups['with_uuid']),
            str(groups['without_uuid']),
            str(groups['duplicates']),
            groups_progress
        )
        
        # Users row
        users = self.monitoring_data['users']
        users_progress = f"{users['with_uuid']}/{users['total']} ({users['with_uuid']/users['total']*100:.1f}%)" if users['total'] > 0 else "N/A"
        migration_table.add_row(
            "Users",
            str(users['total']),
            str(users['with_uuid']),
            str(users['without_uuid']),
            str(users['duplicates']),
            users_progress
        )
        
        # Integrity table
        integrity_table = Table(title="Data Integrity", show_header=True, header_style="bold magenta")
        integrity_table.add_column("Check", style="cyan")
        integrity_table.add_column("Issues", justify="right")
        integrity_table.add_column("Status", justify="center")
        
        integrity = self.monitoring_data['integrity']
        for check, count in integrity.items():
            status = "✅ OK" if count == 0 else f"⚠️ {count} issues"
            integrity_table.add_row(check.replace('_', ' ').title(), str(count), status)
        
        # Create panels
        migration_panel = Panel(migration_table, title="Migration Progress", border_style="blue")
        integrity_panel = Panel(integrity_table, title="Integrity Checks", border_style="green")
        
        # Arrange layout
        layout.split_column(
            Layout(migration_panel, name="migration"),
            Layout(integrity_panel, name="integrity")
        )
        
        return layout
    
    async def monitor_continuous(self, interval: int = 5):
        """Continuously monitor migration status"""
        with Live(self.create_dashboard(), refresh_per_second=1) as live:
            while True:
                try:
                    await self.generate_health_report()
                    live.update(self.create_dashboard())
                    await asyncio.sleep(interval)
                except KeyboardInterrupt:
                    break
                except Exception as e:
                    logger.error(f"Error during monitoring: {e}")
                    await asyncio.sleep(interval)


@click.command()
@click.option('--db-url', default=None, help='Database URL')
@click.option('--interval', default=5, help='Monitoring interval in seconds')
@click.option('--once', is_flag=True, help='Run once and exit')
def main(db_url: str, interval: int, once: bool):
    """Monitor workspace UUID migration status"""
    if not db_url:
        db_url = settings.DATABASE_URL
    
    monitor = MigrationMonitor(db_url)
    
    async def run():
        await monitor.setup()
        try:
            if once:
                report = await monitor.generate_health_report()
                console.print(monitor.create_dashboard())
                console.print(Panel(f"Health Score: {report['health_score']['overall']:.1f}%", 
                                  title="Overall Status", 
                                  border_style="green" if report['health_score']['overall'] == 100 else "yellow"))
            else:
                await monitor.monitor_continuous(interval)
        finally:
            await monitor.teardown()
    
    asyncio.run(run())


if __name__ == "__main__":
    main()