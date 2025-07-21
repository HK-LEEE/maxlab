#!/usr/bin/env python3
"""
워크스페이스 권한 시스템 UUID 마이그레이션 스크립트
기존 String 기반 사용자/그룹 식별자를 UUID 기반으로 변환합니다.

주의: 실행 전 반드시 데이터베이스 백업을 수행하세요!
"""
import asyncio
import sys
import os
import logging
from datetime import datetime
from typing import List, Dict, Any
import uuid

# Add the app directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import text, select, update, delete, func
from app.core.config import settings
from app.models.workspace import WorkspaceUser, WorkspaceGroup
from app.services.user_mapping import user_mapping_service
from app.services.group_mapping import group_mapping_service

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(f'workspace_migration_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class WorkspaceUUIDMigration:
    """워크스페이스 UUID 마이그레이션 클래스"""
    
    def __init__(self):
        self.engine = create_async_engine(
            settings.DATABASE_URL,
            echo=False,
            future=True
        )
        self.async_session = async_sessionmaker(
            self.engine, 
            class_=AsyncSession, 
            expire_on_commit=False
        )
    
    async def run_migration(self, dry_run: bool = True):
        """마이그레이션 실행"""
        logger.info("=" * 80)
        logger.info("워크스페이스 UUID 마이그레이션 시작")
        logger.info(f"모드: {'DRY RUN (실제 변경 없음)' if dry_run else 'LIVE RUN (실제 변경 수행)'}")
        logger.info("=" * 80)
        
        try:
            async with self.async_session() as session:
                # 1. 현재 데이터 상태 확인
                await self._check_current_data(session)
                
                # 2. 백업 테이블 생성 (live run 시)
                if not dry_run:
                    await self._create_backup_tables(session)
                
                # 3. 사용자 데이터 마이그레이션
                await self._migrate_workspace_users(session, dry_run)
                
                # 4. 그룹 데이터 마이그레이션
                await self._migrate_workspace_groups(session, dry_run)
                
                # 5. 검증
                await self._validate_migration(session, dry_run)
                
                if not dry_run:
                    await session.commit()
                    logger.info("마이그레이션이 성공적으로 완료되었습니다!")
                else:
                    logger.info("DRY RUN 완료. 실제 변경사항은 적용되지 않았습니다.")
                    
        except Exception as e:
            logger.error(f"마이그레이션 중 오류 발생: {e}")
            raise
    
    async def _check_current_data(self, session: AsyncSession):
        """현재 데이터 상태 확인"""
        logger.info("현재 데이터 상태 확인 중...")
        
        # WorkspaceUser 테이블 확인
        user_count_query = select(func.count(WorkspaceUser.id))
        user_count = await session.scalar(user_count_query)
        
        # WorkspaceGroup 테이블 확인
        group_count_query = select(func.count(WorkspaceGroup.id))
        group_count = await session.scalar(group_count_query)
        
        logger.info(f"현재 WorkspaceUser 레코드 수: {user_count}")
        logger.info(f"현재 WorkspaceGroup 레코드 수: {group_count}")
        
        # 샘플 데이터 확인
        sample_users = await session.execute(
            select(WorkspaceUser.user_id).limit(5)
        )
        sample_groups = await session.execute(
            select(WorkspaceGroup.group_name).limit(5)
        )
        
        logger.info("샘플 사용자 식별자:")
        for row in sample_users:
            logger.info(f"  - {row[0]}")
        
        logger.info("샘플 그룹명:")
        for row in sample_groups:
            logger.info(f"  - {row[0]}")
    
    async def _create_backup_tables(self, session: AsyncSession):
        """백업 테이블 생성"""
        logger.info("백업 테이블 생성 중...")
        
        backup_queries = [
            "CREATE TABLE workspace_users_backup AS SELECT * FROM workspace_users",
            "CREATE TABLE workspace_groups_backup AS SELECT * FROM workspace_groups"
        ]
        
        for query in backup_queries:
            try:
                await session.execute(text(query))
                logger.info(f"백업 테이블 생성: {query}")
            except Exception as e:
                logger.warning(f"백업 테이블 생성 실패 (이미 존재할 수 있음): {e}")
    
    async def _migrate_workspace_users(self, session: AsyncSession, dry_run: bool):
        """WorkspaceUser 마이그레이션"""
        logger.info("WorkspaceUser 마이그레이션 시작...")
        
        # 모든 사용자 레코드 조회
        users_query = select(WorkspaceUser)
        result = await session.execute(users_query)
        users = result.scalars().all()
        
        user_mapping = {}
        failed_mappings = []
        
        for user in users:
            try:
                # 사용자 식별자를 UUID로 매핑
                current_user_id = user.user_id
                
                # 이미 UUID인지 확인
                try:
                    uuid.UUID(str(current_user_id))
                    logger.info(f"사용자 {current_user_id}는 이미 UUID 형식입니다.")
                    continue
                except ValueError:
                    pass
                
                # UUID 매핑 시도
                if '@' in current_user_id:
                    # 이메일 기반 매핑
                    mapped_uuid = await user_mapping_service.get_user_uuid_by_email(current_user_id)
                else:
                    # 사용자명 기반 매핑
                    mapped_uuid = await user_mapping_service.get_user_uuid_by_identifier(current_user_id)
                
                if mapped_uuid is None:
                    # 외부 시스템에서 찾을 수 없는 경우 결정적 UUID 생성
                    mapped_uuid = user_mapping_service.generate_deterministic_uuid(current_user_id)
                    logger.warning(f"사용자 {current_user_id}를 외부 시스템에서 찾을 수 없어 결정적 UUID 생성: {mapped_uuid}")
                
                user_mapping[current_user_id] = mapped_uuid
                
                if not dry_run:
                    # 실제 업데이트 수행
                    user.user_id = mapped_uuid
                    if '@' in current_user_id:
                        user.user_email = current_user_id
                    user.user_info_updated_at = datetime.now()
                    user.updated_at = datetime.now()
                
                logger.info(f"사용자 매핑: {current_user_id} -> {mapped_uuid}")
                
            except Exception as e:
                logger.error(f"사용자 {user.user_id} 매핑 실패: {e}")
                failed_mappings.append(user.user_id)
        
        logger.info(f"WorkspaceUser 마이그레이션 완료: {len(user_mapping)}개 성공, {len(failed_mappings)}개 실패")
        
        if failed_mappings:
            logger.error(f"실패한 사용자 매핑: {failed_mappings}")
            if not dry_run:
                raise Exception("사용자 매핑 실패로 인해 마이그레이션을 중단합니다.")
    
    async def _migrate_workspace_groups(self, session: AsyncSession, dry_run: bool):
        """WorkspaceGroup 마이그레이션"""
        logger.info("WorkspaceGroup 마이그레이션 시작...")
        
        # 모든 그룹 레코드 조회
        groups_query = select(WorkspaceGroup)
        result = await session.execute(groups_query)
        groups = result.scalars().all()
        
        group_mapping = {}
        failed_mappings = []
        
        for group in groups:
            try:
                current_group_name = group.group_name
                
                # 그룹 UUID 매핑 시도
                # For migration script, use a service token from environment
                migration_token = os.getenv("MIGRATION_TOKEN") or os.getenv("SERVICE_TOKEN")
                if not migration_token:
                    logger.error("MIGRATION_TOKEN or SERVICE_TOKEN environment variable is required for migration")
                    raise ValueError("Migration token not provided")
                    
                mapped_uuid = await group_mapping_service.get_group_uuid_by_name(current_group_name, migration_token)
                
                if mapped_uuid is None:
                    # 외부 시스템에서 찾을 수 없는 경우 결정적 UUID 생성
                    mapped_uuid = group_mapping_service.generate_deterministic_uuid(current_group_name)
                    logger.warning(f"그룹 {current_group_name}을 외부 시스템에서 찾을 수 없어 결정적 UUID 생성: {mapped_uuid}")
                
                group_mapping[current_group_name] = mapped_uuid
                
                if not dry_run:
                    # 실제 업데이트 수행
                    group.group_id = mapped_uuid
                    # group_name은 캐싱용으로 유지
                    group.group_info_updated_at = datetime.now()
                    group.updated_at = datetime.now()
                
                logger.info(f"그룹 매핑: {current_group_name} -> {mapped_uuid}")
                
            except Exception as e:
                logger.error(f"그룹 {group.group_name} 매핑 실패: {e}")
                failed_mappings.append(group.group_name)
        
        logger.info(f"WorkspaceGroup 마이그레이션 완료: {len(group_mapping)}개 성공, {len(failed_mappings)}개 실패")
        
        if failed_mappings:
            logger.error(f"실패한 그룹 매핑: {failed_mappings}")
            if not dry_run:
                raise Exception("그룹 매핑 실패로 인해 마이그레이션을 중단합니다.")
    
    async def _validate_migration(self, session: AsyncSession, dry_run: bool):
        """마이그레이션 검증"""
        logger.info("마이그레이션 검증 중...")
        
        if dry_run:
            logger.info("DRY RUN 모드에서는 검증을 수행하지 않습니다.")
            return
        
        # 사용자 테이블 검증
        user_count_query = select(func.count(WorkspaceUser.id))
        user_count = await session.scalar(user_count_query)
        
        null_user_id_query = select(func.count(WorkspaceUser.id)).where(WorkspaceUser.user_id.is_(None))
        null_user_count = await session.scalar(null_user_id_query)
        
        # 그룹 테이블 검증
        group_count_query = select(func.count(WorkspaceGroup.id))
        group_count = await session.scalar(group_count_query)
        
        null_group_id_query = select(func.count(WorkspaceGroup.id)).where(WorkspaceGroup.group_id.is_(None))
        null_group_count = await session.scalar(null_group_id_query)
        
        logger.info(f"검증 결과:")
        logger.info(f"  - WorkspaceUser 총 레코드: {user_count}")
        logger.info(f"  - NULL user_id 레코드: {null_user_count}")
        logger.info(f"  - WorkspaceGroup 총 레코드: {group_count}")
        logger.info(f"  - NULL group_id 레코드: {null_group_count}")
        
        if null_user_count > 0 or null_group_count > 0:
            raise Exception("마이그레이션 검증 실패: NULL UUID가 발견되었습니다.")
        
        logger.info("마이그레이션 검증 완료!")


async def main():
    """메인 실행 함수"""
    import argparse
    
    parser = argparse.ArgumentParser(description='워크스페이스 UUID 마이그레이션')
    parser.add_argument('--live', action='store_true', help='실제 마이그레이션 실행 (기본값: dry run)')
    parser.add_argument('--force', action='store_true', help='확인 없이 실행')
    
    args = parser.parse_args()
    
    if args.live and not args.force:
        print("경고: 실제 데이터베이스 변경을 수행합니다!")
        print("계속하려면 'YES'를 입력하세요:")
        confirmation = input().strip()
        if confirmation != 'YES':
            print("마이그레이션이 취소되었습니다.")
            return
    
    migration = WorkspaceUUIDMigration()
    await migration.run_migration(dry_run=not args.live)


if __name__ == "__main__":
    asyncio.run(main())