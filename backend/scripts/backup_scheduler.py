#!/usr/bin/env python3
"""
데이터베이스 백업 스케줄러
cron 작업 또는 독립 실행을 위한 백업 자동화 스크립트
"""
import asyncio
import sys
import os
import logging
import signal
from datetime import datetime, time
from pathlib import Path
from typing import Optional

# 프로젝트 루트를 Python 경로에 추가
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from app.core.backup_manager import backup_manager, BackupType, BackupStatus
from app.core.config import settings

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('backup_scheduler.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class BackupScheduler:
    """백업 스케줄러"""
    
    def __init__(self):
        self.running = False
        self.backup_hour = 2  # 새벽 2시에 백업 실행
        self.backup_minute = 0
        self.cleanup_enabled = True
        self.max_retries = 3
        
    async def run_scheduled_backup(self) -> bool:
        """예약된 백업 실행"""
        try:
            logger.info("Starting scheduled backup...")
            
            # 백업 실행
            backup_info = await backup_manager.create_full_backup(compress=True)
            
            if backup_info.status in [BackupStatus.COMPLETED, BackupStatus.VERIFIED]:
                logger.info(f"Scheduled backup completed successfully: {backup_info.backup_id}")
                
                # 오래된 백업 정리
                if self.cleanup_enabled:
                    cleanup_count = backup_manager.cleanup_old_backups()
                    logger.info(f"Cleaned up {cleanup_count} old backups")
                
                # 백업 통계 로깅
                stats = backup_manager.get_backup_statistics()
                logger.info(f"Backup statistics: {stats['total_backups']} total, "
                           f"{stats['success_rate']:.1f}% success rate, "
                           f"{stats['total_backup_size_gb']:.2f}GB total size")
                
                return True
            else:
                logger.error(f"Scheduled backup failed: {backup_info.status}")
                return False
                
        except Exception as e:
            logger.error(f"Scheduled backup failed with exception: {e}")
            return False
    
    async def run_with_retry(self) -> bool:
        """재시도 로직을 포함한 백업 실행"""
        for attempt in range(1, self.max_retries + 1):
            try:
                logger.info(f"Backup attempt {attempt}/{self.max_retries}")
                success = await self.run_scheduled_backup()
                
                if success:
                    return True
                    
                if attempt < self.max_retries:
                    logger.warning(f"Backup attempt {attempt} failed, retrying in 5 minutes...")
                    await asyncio.sleep(300)  # 5분 대기
                    
            except Exception as e:
                logger.error(f"Backup attempt {attempt} failed with exception: {e}")
                if attempt < self.max_retries:
                    await asyncio.sleep(300)  # 5분 대기
        
        logger.error(f"All {self.max_retries} backup attempts failed")
        return False
    
    async def schedule_daemon(self):
        """백업 스케줄 데몬"""
        logger.info("Starting backup scheduler daemon...")
        self.running = True
        
        while self.running:
            try:
                now = datetime.now()
                target_time = now.replace(hour=self.backup_hour, minute=self.backup_minute, second=0, microsecond=0)
                
                # 오늘의 백업 시간이 이미 지났다면 내일로 설정
                if now > target_time:
                    target_time = target_time.replace(day=target_time.day + 1)
                
                # 다음 백업까지의 시간 계산
                time_until_backup = (target_time - now).total_seconds()
                logger.info(f"Next backup scheduled for: {target_time}")
                logger.info(f"Time until next backup: {time_until_backup/3600:.1f} hours")
                
                # 백업 시간까지 대기
                await asyncio.sleep(time_until_backup)
                
                # 백업 실행
                await self.run_with_retry()
                
            except asyncio.CancelledError:
                logger.info("Backup scheduler cancelled")
                break
            except Exception as e:
                logger.error(f"Backup scheduler error: {e}")
                await asyncio.sleep(3600)  # 1시간 대기 후 재시도
    
    def stop(self):
        """스케줄러 중지"""
        logger.info("Stopping backup scheduler...")
        self.running = False

# 전역 스케줄러 인스턴스
scheduler = BackupScheduler()

async def manual_backup():
    """수동 백업 실행"""
    logger.info("Starting manual backup...")
    return await scheduler.run_with_retry()

async def restore_backup_command(backup_id: str, target_database: Optional[str] = None):
    """백업 복원 명령"""
    logger.info(f"Starting restore: {backup_id} -> {target_database or 'current database'}")
    success = await backup_manager.restore_backup(backup_id, target_database)
    
    if success:
        logger.info("Restore completed successfully")
    else:
        logger.error("Restore failed")
    
    return success

def show_backup_status():
    """백업 상태 출력"""
    stats = backup_manager.get_backup_statistics()
    
    print("=== Backup Statistics ===")
    print(f"Total backups: {stats['total_backups']}")
    print(f"Successful backups: {stats['successful_backups']}")
    print(f"Failed backups: {stats['failed_backups']}")
    print(f"Success rate: {stats['success_rate']:.1f}%")
    print(f"Total backup size: {stats['total_backup_size_gb']:.2f} GB")
    
    if stats['latest_backup']:
        latest = stats['latest_backup']
        print(f"\nLatest backup:")
        print(f"  ID: {latest['backup_id']}")
        print(f"  Time: {latest['timestamp']}")
        print(f"  Status: {latest['status']}")
        print(f"  Size: {latest['file_size_mb']:.1f} MB")
    
    print(f"\nDisk usage:")
    disk = stats['disk_usage']
    print(f"  Directory: {disk['backup_directory']}")
    print(f"  Total: {disk['total_gb']:.1f} GB")
    print(f"  Used: {disk['used_gb']:.1f} GB")
    print(f"  Free: {disk['free_gb']:.1f} GB")
    
    print(f"\nRetention: {stats['retention_days']} days")
    print(f"Current backup running: {stats['current_backup_running']}")

def list_backups(limit: int = 10):
    """백업 목록 출력"""
    backups = backup_manager.list_backups(limit)
    
    print(f"=== Recent Backups (last {limit}) ===")
    if not backups:
        print("No backups found")
        return
    
    print(f"{'ID':<25} {'Time':<20} {'Status':<12} {'Size (MB)':<10} {'Type'}")
    print("-" * 80)
    
    for backup in backups:
        print(f"{backup['backup_id']:<25} "
              f"{backup['timestamp'][:19]:<20} "
              f"{backup['status']:<12} "
              f"{backup['file_size_mb']:<10.1f} "
              f"{backup['backup_type']}")

async def cleanup_old_backups():
    """오래된 백업 정리"""
    logger.info("Starting backup cleanup...")
    cleanup_count = backup_manager.cleanup_old_backups()
    logger.info(f"Cleaned up {cleanup_count} old backups")
    return cleanup_count

def setup_signal_handlers():
    """시그널 핸들러 설정"""
    def signal_handler(signum, frame):
        logger.info(f"Received signal {signum}, shutting down...")
        scheduler.stop()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

async def main():
    """메인 함수"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Database backup scheduler")
    parser.add_argument("--backup", action="store_true", help="Run manual backup")
    parser.add_argument("--restore", type=str, help="Restore backup by ID")
    parser.add_argument("--target-db", type=str, help="Target database for restore")
    parser.add_argument("--status", action="store_true", help="Show backup status")
    parser.add_argument("--list", type=int, default=10, help="List recent backups")
    parser.add_argument("--cleanup", action="store_true", help="Cleanup old backups")
    parser.add_argument("--daemon", action="store_true", help="Run as backup daemon")
    parser.add_argument("--schedule-time", type=str, help="Backup time in HH:MM format")
    
    args = parser.parse_args()
    
    # 백업 시간 설정
    if args.schedule_time:
        try:
            hour, minute = map(int, args.schedule_time.split(':'))
            scheduler.backup_hour = hour
            scheduler.backup_minute = minute
            logger.info(f"Backup scheduled for {hour:02d}:{minute:02d}")
        except ValueError:
            logger.error("Invalid time format. Use HH:MM format")
            return
    
    try:
        if args.backup:
            # 수동 백업
            success = await manual_backup()
            sys.exit(0 if success else 1)
            
        elif args.restore:
            # 백업 복원
            success = await restore_backup_command(args.restore, args.target_db)
            sys.exit(0 if success else 1)
            
        elif args.status:
            # 백업 상태 출력
            show_backup_status()
            
        elif args.list:
            # 백업 목록 출력
            list_backups(args.list)
            
        elif args.cleanup:
            # 백업 정리
            await cleanup_old_backups()
            
        elif args.daemon:
            # 데몬 모드
            setup_signal_handlers()
            await scheduler.schedule_daemon()
            
        else:
            # 기본: 상태 출력
            show_backup_status()
            
    except KeyboardInterrupt:
        logger.info("Operation interrupted by user")
    except Exception as e:
        logger.error(f"Operation failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())