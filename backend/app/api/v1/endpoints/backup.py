"""
백업 관리 API 엔드포인트
데이터베이스 백업, 복원, 모니터링을 위한 REST API
"""
from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends, status
from pydantic import BaseModel, Field

from ....core.backup_manager import backup_manager, BackupType, BackupStatus
from ....core.auth import get_current_admin_user
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# Pydantic 모델들
class BackupRequest(BaseModel):
    database_name: Optional[str] = None
    compress: bool = True
    backup_type: str = Field(default="full", description="Backup type: full, incremental")

class RestoreRequest(BaseModel):
    backup_id: str
    target_database: Optional[str] = None

class BackupResponse(BaseModel):
    backup_id: str
    backup_type: str
    timestamp: datetime
    file_path: str
    file_size: int
    file_size_mb: float
    compression: bool
    checksum: str
    status: str
    duration_seconds: float
    database_name: str
    metadata: Dict[str, Any]

class BackupListResponse(BaseModel):
    backups: List[BackupResponse]
    total_count: int
    page: int
    limit: int

class BackupStatsResponse(BaseModel):
    total_backups: int
    successful_backups: int
    failed_backups: int
    success_rate: float
    total_backup_size_bytes: int
    total_backup_size_gb: float
    latest_backup: Optional[Dict[str, Any]]
    disk_usage: Dict[str, Any]
    retention_days: int
    current_backup_running: bool

# 의존성: 관리자 권한 필요
async def require_admin_user(current_user: dict = Depends(get_current_admin_user)):
    return current_user

@router.get("/status", response_model=BackupStatsResponse)
async def get_backup_status(admin_user: dict = Depends(require_admin_user)):
    """백업 시스템 상태 조회"""
    try:
        stats = backup_manager.get_backup_statistics()
        return BackupStatsResponse(**stats)
    except Exception as e:
        logger.error(f"Failed to get backup status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get backup status: {str(e)}"
        )

@router.get("/list", response_model=BackupListResponse)
async def list_backups(
    page: int = 1,
    limit: int = 20,
    admin_user: dict = Depends(require_admin_user)
):
    """백업 목록 조회"""
    try:
        if page < 1 or limit < 1 or limit > 100:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid page or limit parameters"
            )
        
        # 전체 백업 목록 가져오기
        all_backups = backup_manager.list_backups(limit=1000)  # 충분히 큰 수
        total_count = len(all_backups)
        
        # 페이지네이션 적용
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        page_backups = all_backups[start_idx:end_idx]
        
        # 응답 형식으로 변환
        backup_responses = []
        for backup in page_backups:
            backup_response = BackupResponse(
                backup_id=backup['backup_id'],
                backup_type=backup['backup_type'],
                timestamp=datetime.fromisoformat(backup['timestamp']),
                file_path=backup['file_path'],
                file_size=backup['file_size'],
                file_size_mb=backup['file_size_mb'],
                compression=backup['compression'],
                checksum=backup['checksum'],
                status=backup['status'],
                duration_seconds=backup['duration_seconds'],
                database_name=backup['database_name'],
                metadata=backup['metadata']
            )
            backup_responses.append(backup_response)
        
        return BackupListResponse(
            backups=backup_responses,
            total_count=total_count,
            page=page,
            limit=limit
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to list backups: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list backups: {str(e)}"
        )

@router.post("/create")
async def create_backup(
    request: BackupRequest,
    background_tasks: BackgroundTasks,
    admin_user: dict = Depends(require_admin_user)
):
    """새로운 백업 생성"""
    try:
        # 현재 백업이 실행 중인지 확인
        if backup_manager.current_backup is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Another backup is currently running"
            )
        
        # 백업 유형 검증
        if request.backup_type not in ["full", "incremental"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid backup type. Must be 'full' or 'incremental'"
            )
        
        # 백그라운드에서 백업 실행
        async def run_backup():
            try:
                if request.backup_type == "full":
                    backup_info = await backup_manager.create_full_backup(
                        database_name=request.database_name,
                        compress=request.compress
                    )
                    logger.info(f"Background backup completed: {backup_info.backup_id}")
                else:
                    # 증분 백업은 향후 구현
                    logger.warning("Incremental backup not yet implemented")
            except Exception as e:
                logger.error(f"Background backup failed: {e}")
        
        background_tasks.add_task(run_backup)
        
        return {
            "message": "Backup started successfully",
            "backup_type": request.backup_type,
            "database_name": request.database_name,
            "compress": request.compress,
            "started_at": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to start backup: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start backup: {str(e)}"
        )

@router.post("/restore")
async def restore_backup(
    request: RestoreRequest,
    background_tasks: BackgroundTasks,
    admin_user: dict = Depends(require_admin_user)
):
    """백업 복원"""
    try:
        # 백업 ID 검증
        backup_found = False
        for backup in backup_manager.backup_history:
            if backup.backup_id == request.backup_id:
                backup_found = True
                break
        
        if not backup_found:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Backup not found: {request.backup_id}"
            )
        
        # 백그라운드에서 복원 실행
        async def run_restore():
            try:
                success = await backup_manager.restore_backup(
                    backup_id=request.backup_id,
                    target_database=request.target_database
                )
                if success:
                    logger.info(f"Background restore completed: {request.backup_id}")
                else:
                    logger.error(f"Background restore failed: {request.backup_id}")
            except Exception as e:
                logger.error(f"Background restore failed: {e}")
        
        background_tasks.add_task(run_restore)
        
        return {
            "message": "Restore started successfully",
            "backup_id": request.backup_id,
            "target_database": request.target_database,
            "started_at": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to start restore: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start restore: {str(e)}"
        )

@router.get("/backup/{backup_id}")
async def get_backup_details(
    backup_id: str,
    admin_user: dict = Depends(require_admin_user)
):
    """특정 백업 상세 정보 조회"""
    try:
        # 백업 정보 찾기
        for backup in backup_manager.backup_history:
            if backup.backup_id == backup_id:
                return BackupResponse(
                    backup_id=backup.backup_id,
                    backup_type=backup.backup_type.value,
                    timestamp=backup.timestamp,
                    file_path=backup.file_path,
                    file_size=backup.file_size,
                    file_size_mb=backup.file_size / (1024**2),
                    compression=backup.compression,
                    checksum=backup.checksum,
                    status=backup.status.value,
                    duration_seconds=backup.duration_seconds,
                    database_name=backup.database_name,
                    metadata=backup.metadata
                )
        
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Backup not found: {backup_id}"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get backup details: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get backup details: {str(e)}"
        )

@router.delete("/backup/{backup_id}")
async def delete_backup(
    backup_id: str,
    admin_user: dict = Depends(require_admin_user)
):
    """백업 삭제"""
    try:
        # 백업 정보 찾기
        backup_to_delete = None
        for backup in backup_manager.backup_history:
            if backup.backup_id == backup_id:
                backup_to_delete = backup
                break
        
        if not backup_to_delete:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Backup not found: {backup_id}"
            )
        
        # 백업 파일 삭제
        from pathlib import Path
        backup_file = Path(backup_to_delete.file_path)
        if backup_file.exists():
            backup_file.unlink()
        
        # 기록에서 제거
        backup_manager.backup_history.remove(backup_to_delete)
        backup_manager._save_backup_history()
        
        logger.info(f"Backup deleted: {backup_id}")
        
        return {
            "message": "Backup deleted successfully",
            "backup_id": backup_id,
            "deleted_at": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete backup: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete backup: {str(e)}"
        )

@router.post("/cleanup")
async def cleanup_old_backups(admin_user: dict = Depends(require_admin_user)):
    """오래된 백업 정리"""
    try:
        cleanup_count = backup_manager.cleanup_old_backups()
        
        return {
            "message": "Backup cleanup completed",
            "deleted_count": cleanup_count,
            "retention_days": backup_manager.retention_days,
            "cleaned_at": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Failed to cleanup backups: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to cleanup backups: {str(e)}"
        )

@router.post("/verify/{backup_id}")
async def verify_backup(
    backup_id: str,
    admin_user: dict = Depends(require_admin_user)
):
    """백업 파일 검증"""
    try:
        # 백업 정보 찾기
        backup_to_verify = None
        for backup in backup_manager.backup_history:
            if backup.backup_id == backup_id:
                backup_to_verify = backup
                break
        
        if not backup_to_verify:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Backup not found: {backup_id}"
            )
        
        # 백업 검증 실행
        is_valid = await backup_manager._verify_backup(backup_to_verify)
        
        # 상태 업데이트
        if is_valid:
            backup_to_verify.status = BackupStatus.VERIFIED
        else:
            backup_to_verify.status = BackupStatus.CORRUPTED
        
        backup_manager._save_backup_history()
        
        return {
            "backup_id": backup_id,
            "is_valid": is_valid,
            "status": backup_to_verify.status.value,
            "verified_at": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to verify backup: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to verify backup: {str(e)}"
        )