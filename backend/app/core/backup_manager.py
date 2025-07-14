"""
데이터베이스 백업 관리 시스템
PostgreSQL 백업, 복구, 모니터링을 위한 종합 솔루션
"""
import os
import subprocess
import asyncio
import gzip
import shutil
import logging
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path
from dataclasses import dataclass, asdict
from enum import Enum
import hashlib
import psutil

from .config import settings

logger = logging.getLogger(__name__)

class BackupType(Enum):
    """백업 유형"""
    FULL = "full"           # 전체 백업 (pg_dump)
    INCREMENTAL = "incremental"  # 증분 백업 (WAL)
    POINT_IN_TIME = "point_in_time"  # 특정 시점 백업

class BackupStatus(Enum):
    """백업 상태"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    VERIFIED = "verified"
    CORRUPTED = "corrupted"

@dataclass
class BackupInfo:
    """백업 정보 구조체"""
    backup_id: str
    backup_type: BackupType
    timestamp: datetime
    file_path: str
    file_size: int
    compression: bool
    checksum: str
    status: BackupStatus
    duration_seconds: float
    database_name: str
    metadata: Dict[str, Any]

class DatabaseBackupManager:
    """데이터베이스 백업 관리자"""
    
    def __init__(self, backup_dir: str = "./backups"):
        self.backup_dir = Path(backup_dir)
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        
        # 백업 설정
        self.retention_days = 30  # 백업 보존 기간
        self.max_backup_size_gb = 10  # 최대 백업 크기 (GB)
        self.compression_enabled = True
        self.verify_after_backup = True
        
        # 백업 기록 파일
        self.backup_log_file = self.backup_dir / "backup_log.json"
        self.backup_history: List[BackupInfo] = []
        
        # 백업 상태 추적
        self.current_backup: Optional[BackupInfo] = None
        
        self._load_backup_history()
    
    def _load_backup_history(self):
        """백업 기록 로드"""
        try:
            if self.backup_log_file.exists():
                with open(self.backup_log_file, 'r') as f:
                    data = json.load(f)
                    for backup_data in data:
                        backup_info = BackupInfo(
                            backup_id=backup_data['backup_id'],
                            backup_type=BackupType(backup_data['backup_type']),
                            timestamp=datetime.fromisoformat(backup_data['timestamp']),
                            file_path=backup_data['file_path'],
                            file_size=backup_data['file_size'],
                            compression=backup_data['compression'],
                            checksum=backup_data['checksum'],
                            status=BackupStatus(backup_data['status']),
                            duration_seconds=backup_data['duration_seconds'],
                            database_name=backup_data['database_name'],
                            metadata=backup_data.get('metadata', {})
                        )
                        self.backup_history.append(backup_info)
        except Exception as e:
            logger.error(f"Failed to load backup history: {e}")
    
    def _save_backup_history(self):
        """백업 기록 저장"""
        try:
            backup_data = []
            for backup in self.backup_history:
                data = asdict(backup)
                data['backup_type'] = backup.backup_type.value
                data['status'] = backup.status.value
                data['timestamp'] = backup.timestamp.isoformat()
                backup_data.append(data)
            
            with open(self.backup_log_file, 'w') as f:
                json.dump(backup_data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save backup history: {e}")
    
    def _generate_backup_id(self) -> str:
        """고유 백업 ID 생성"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        random_suffix = hashlib.md5(str(datetime.now().timestamp()).encode()).hexdigest()[:8]
        return f"backup_{timestamp}_{random_suffix}"
    
    def _calculate_checksum(self, file_path: str) -> str:
        """파일 체크섬 계산"""
        hash_md5 = hashlib.md5()
        try:
            with open(file_path, "rb") as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    hash_md5.update(chunk)
            return hash_md5.hexdigest()
        except Exception as e:
            logger.error(f"Failed to calculate checksum for {file_path}: {e}")
            return ""
    
    def _parse_database_url(self) -> Tuple[str, str, str, str, str]:
        """데이터베이스 URL 파싱"""
        from urllib.parse import urlparse
        
        parsed = urlparse(settings.DATABASE_URL)
        
        # asyncpg:// 제거
        if parsed.scheme.startswith('postgresql+'):
            scheme = parsed.scheme.replace('postgresql+asyncpg', 'postgresql')
        else:
            scheme = 'postgresql'
        
        host = parsed.hostname or 'localhost'
        port = str(parsed.port) if parsed.port else '5432'
        username = parsed.username or 'postgres'
        password = parsed.password or ''
        database = parsed.path.lstrip('/') or 'postgres'
        
        return host, port, username, password, database
    
    async def create_full_backup(self, 
                                database_name: Optional[str] = None,
                                compress: bool = True) -> BackupInfo:
        """전체 데이터베이스 백업 생성"""
        
        backup_id = self._generate_backup_id()
        start_time = datetime.now()
        
        try:
            # 데이터베이스 연결 정보 추출
            host, port, username, password, db_name = self._parse_database_url()
            if database_name:
                db_name = database_name
            
            # 백업 파일 경로 설정
            backup_filename = f"{backup_id}_{db_name}.sql"
            if compress:
                backup_filename += ".gz"
            
            backup_file_path = self.backup_dir / backup_filename
            
            # 백업 정보 초기화
            backup_info = BackupInfo(
                backup_id=backup_id,
                backup_type=BackupType.FULL,
                timestamp=start_time,
                file_path=str(backup_file_path),
                file_size=0,
                compression=compress,
                checksum="",
                status=BackupStatus.RUNNING,
                duration_seconds=0,
                database_name=db_name,
                metadata={
                    "host": host,
                    "port": port,
                    "username": username
                }
            )
            
            self.current_backup = backup_info
            logger.info(f"Starting full backup: {backup_id}")
            
            # pg_dump 명령어 구성
            pg_dump_cmd = [
                "pg_dump",
                "-h", host,
                "-p", port,
                "-U", username,
                "-d", db_name,
                "--verbose",
                "--no-password",
                "--format=custom",
                "--no-privileges",
                "--no-owner"
            ]
            
            # 환경 변수 설정 (패스워드)
            env = os.environ.copy()
            if password:
                env["PGPASSWORD"] = password
            
            # 백업 실행
            if compress:
                # 압축과 함께 백업
                process = await asyncio.create_subprocess_exec(
                    *pg_dump_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env=env
                )
                
                stdout, stderr = await process.communicate()
                
                if process.returncode == 0:
                    # 압축 저장
                    with gzip.open(backup_file_path, 'wb') as f:
                        f.write(stdout)
                else:
                    raise subprocess.CalledProcessError(process.returncode, pg_dump_cmd, stderr)
            else:
                # 압축 없이 백업
                with open(backup_file_path, 'wb') as f:
                    process = await asyncio.create_subprocess_exec(
                        *pg_dump_cmd,
                        stdout=f,
                        stderr=asyncio.subprocess.PIPE,
                        env=env
                    )
                    
                    _, stderr = await process.communicate()
                    
                    if process.returncode != 0:
                        raise subprocess.CalledProcessError(process.returncode, pg_dump_cmd, stderr)
            
            # 백업 완료 후 정보 업데이트
            end_time = datetime.now()
            file_size = backup_file_path.stat().st_size
            checksum = self._calculate_checksum(str(backup_file_path))
            
            backup_info.file_size = file_size
            backup_info.checksum = checksum
            backup_info.status = BackupStatus.COMPLETED
            backup_info.duration_seconds = (end_time - start_time).total_seconds()
            
            # 백업 검증
            if self.verify_after_backup:
                if await self._verify_backup(backup_info):
                    backup_info.status = BackupStatus.VERIFIED
                else:
                    backup_info.status = BackupStatus.CORRUPTED
            
            # 백업 기록 저장
            self.backup_history.append(backup_info)
            self._save_backup_history()
            
            logger.info(f"Backup completed successfully: {backup_id}, Size: {file_size} bytes")
            return backup_info
            
        except Exception as e:
            # 실패한 백업 정보 업데이트
            if backup_info:
                backup_info.status = BackupStatus.FAILED
                backup_info.metadata["error"] = str(e)
                self.backup_history.append(backup_info)
                self._save_backup_history()
            
            logger.error(f"Backup failed: {e}")
            raise
        finally:
            self.current_backup = None
    
    async def _verify_backup(self, backup_info: BackupInfo) -> bool:
        """백업 파일 검증"""
        try:
            backup_file = Path(backup_info.file_path)
            
            # 파일 존재 확인
            if not backup_file.exists():
                logger.error(f"Backup file does not exist: {backup_info.file_path}")
                return False
            
            # 파일 크기 확인
            if backup_file.stat().st_size != backup_info.file_size:
                logger.error(f"Backup file size mismatch: {backup_info.file_path}")
                return False
            
            # 체크섬 확인
            current_checksum = self._calculate_checksum(backup_info.file_path)
            if current_checksum != backup_info.checksum:
                logger.error(f"Backup file checksum mismatch: {backup_info.file_path}")
                return False
            
            # 압축 파일인 경우 압축 무결성 확인
            if backup_info.compression and backup_info.file_path.endswith('.gz'):
                try:
                    with gzip.open(backup_info.file_path, 'rb') as f:
                        # 첫 몇 바이트 읽어서 압축 무결성 확인
                        f.read(1024)
                except Exception as e:
                    logger.error(f"Backup file compression integrity check failed: {e}")
                    return False
            
            logger.info(f"Backup verification successful: {backup_info.backup_id}")
            return True
            
        except Exception as e:
            logger.error(f"Backup verification failed: {e}")
            return False
    
    async def restore_backup(self, backup_id: str, target_database: Optional[str] = None) -> bool:
        """백업 복원"""
        try:
            # 백업 정보 찾기
            backup_info = None
            for backup in self.backup_history:
                if backup.backup_id == backup_id:
                    backup_info = backup
                    break
            
            if not backup_info:
                logger.error(f"Backup not found: {backup_id}")
                return False
            
            # 백업 파일 존재 확인
            backup_file = Path(backup_info.file_path)
            if not backup_file.exists():
                logger.error(f"Backup file does not exist: {backup_info.file_path}")
                return False
            
            # 백업 검증
            if not await self._verify_backup(backup_info):
                logger.error(f"Backup verification failed before restore: {backup_id}")
                return False
            
            # 데이터베이스 연결 정보
            host, port, username, password, db_name = self._parse_database_url()
            if target_database:
                db_name = target_database
            
            logger.info(f"Starting restore: {backup_id} to {db_name}")
            
            # pg_restore 명령어 구성
            pg_restore_cmd = [
                "pg_restore",
                "-h", host,
                "-p", port,
                "-U", username,
                "-d", db_name,
                "--verbose",
                "--no-password",
                "--clean",
                "--if-exists",
                "--no-privileges",
                "--no-owner"
            ]
            
            # 환경 변수 설정
            env = os.environ.copy()
            if password:
                env["PGPASSWORD"] = password
            
            # 복원 실행
            if backup_info.compression:
                # 압축된 백업 복원
                with gzip.open(backup_info.file_path, 'rb') as f:
                    process = await asyncio.create_subprocess_exec(
                        *pg_restore_cmd,
                        stdin=asyncio.subprocess.PIPE,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE,
                        env=env
                    )
                    
                    stdout, stderr = await process.communicate(input=f.read())
            else:
                # 일반 백업 복원
                pg_restore_cmd.append(backup_info.file_path)
                process = await asyncio.create_subprocess_exec(
                    *pg_restore_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env=env
                )
                
                stdout, stderr = await process.communicate()
            
            if process.returncode == 0:
                logger.info(f"Restore completed successfully: {backup_id}")
                return True
            else:
                logger.error(f"Restore failed: {stderr.decode()}")
                return False
                
        except Exception as e:
            logger.error(f"Restore failed: {e}")
            return False
    
    def cleanup_old_backups(self) -> int:
        """오래된 백업 정리"""
        try:
            cleanup_count = 0
            cutoff_date = datetime.now() - timedelta(days=self.retention_days)
            
            backups_to_remove = []
            for backup in self.backup_history:
                if backup.timestamp < cutoff_date:
                    # 백업 파일 삭제
                    backup_file = Path(backup.file_path)
                    if backup_file.exists():
                        backup_file.unlink()
                        logger.info(f"Deleted old backup file: {backup.file_path}")
                    
                    backups_to_remove.append(backup)
                    cleanup_count += 1
            
            # 기록에서 제거
            for backup in backups_to_remove:
                self.backup_history.remove(backup)
            
            # 기록 저장
            if backups_to_remove:
                self._save_backup_history()
            
            logger.info(f"Cleaned up {cleanup_count} old backups")
            return cleanup_count
            
        except Exception as e:
            logger.error(f"Backup cleanup failed: {e}")
            return 0
    
    def get_backup_statistics(self) -> Dict[str, Any]:
        """백업 통계 정보"""
        try:
            total_backups = len(self.backup_history)
            successful_backups = len([b for b in self.backup_history if b.status in [BackupStatus.COMPLETED, BackupStatus.VERIFIED]])
            failed_backups = len([b for b in self.backup_history if b.status == BackupStatus.FAILED])
            
            total_size = sum(b.file_size for b in self.backup_history)
            latest_backup = max(self.backup_history, key=lambda x: x.timestamp) if self.backup_history else None
            
            # 디스크 사용량
            disk_usage = shutil.disk_usage(self.backup_dir)
            
            return {
                "total_backups": total_backups,
                "successful_backups": successful_backups,
                "failed_backups": failed_backups,
                "success_rate": (successful_backups / total_backups * 100) if total_backups > 0 else 0,
                "total_backup_size_bytes": total_size,
                "total_backup_size_gb": total_size / (1024**3),
                "latest_backup": {
                    "backup_id": latest_backup.backup_id,
                    "timestamp": latest_backup.timestamp.isoformat(),
                    "status": latest_backup.status.value,
                    "file_size_mb": latest_backup.file_size / (1024**2)
                } if latest_backup else None,
                "disk_usage": {
                    "total_gb": disk_usage.total / (1024**3),
                    "used_gb": disk_usage.used / (1024**3),
                    "free_gb": disk_usage.free / (1024**3),
                    "backup_directory": str(self.backup_dir)
                },
                "retention_days": self.retention_days,
                "current_backup_running": self.current_backup is not None
            }
            
        except Exception as e:
            logger.error(f"Failed to get backup statistics: {e}")
            return {"error": str(e)}
    
    def list_backups(self, limit: int = 50) -> List[Dict[str, Any]]:
        """백업 목록 조회"""
        try:
            # 최신 순으로 정렬
            sorted_backups = sorted(self.backup_history, key=lambda x: x.timestamp, reverse=True)
            
            backup_list = []
            for backup in sorted_backups[:limit]:
                backup_data = asdict(backup)
                backup_data['backup_type'] = backup.backup_type.value
                backup_data['status'] = backup.status.value
                backup_data['timestamp'] = backup.timestamp.isoformat()
                backup_data['file_size_mb'] = backup.file_size / (1024**2)
                backup_list.append(backup_data)
            
            return backup_list
            
        except Exception as e:
            logger.error(f"Failed to list backups: {e}")
            return []

# 전역 백업 관리자 인스턴스
backup_manager = DatabaseBackupManager()