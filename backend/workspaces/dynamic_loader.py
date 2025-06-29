"""
MVP 모듈 동적 로더
파일시스템에서 MVP 모듈을 스캔하고 FastAPI 애플리케이션에 동적으로 로드합니다.
"""
import os
import importlib
import inspect
import sys
from typing import List, Dict, Any, Optional, Set
from fastapi import APIRouter
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
import logging
from pathlib import Path

# 상대 임포트 문제 해결을 위한 경로 추가
current_dir = Path(__file__).parent.parent
if str(current_dir) not in sys.path:
    sys.path.insert(0, str(current_dir))

from app.models.workspace import MVPModule
from app.core.config import settings

logger = logging.getLogger(__name__)


class MVPModuleInfo:
    """MVP 모듈 정보 클래스"""
    
    def __init__(
        self,
        module_name: str,
        workspace_id: int,
        display_name: str,
        router: APIRouter,
        config: Dict[str, Any] = None
    ):
        self.module_name = module_name
        self.workspace_id = workspace_id
        self.display_name = display_name
        self.router = router
        self.config = config or {}
        self.is_loaded = False


class MVPDynamicLoader:
    """MVP 모듈 동적 로더 클래스"""
    
    def __init__(self):
        self.loaded_modules: Dict[str, MVPModuleInfo] = {}
        self.workspaces_dir = settings.MVP_MODULES_DIR
        self.available_modules: Set[str] = set()
        self._ensure_workspaces_dir()
    
    def _ensure_workspaces_dir(self):
        """워크스페이스 디렉토리 생성 및 초기화"""
        workspaces_path = Path(self.workspaces_dir)
        
        if not workspaces_path.exists():
            workspaces_path.mkdir(parents=True, exist_ok=True)
            logger.info(f"Created workspaces directory: {workspaces_path}")
        
        # __init__.py 파일 생성 (없는 경우)
        init_file = workspaces_path / "__init__.py"
        if not init_file.exists():
            with open(init_file, "w", encoding="utf-8") as f:
                f.write('"""MVP Modules Directory"""\n')
                f.write('__version__ = "1.0.0"\n')
    
    def scan_available_modules(self) -> List[str]:
        """사용 가능한 MVP 모듈 스캔"""
        available_modules = []
        workspaces_path = Path(self.workspaces_dir)
        
        if not workspaces_path.exists():
            logger.warning(f"Workspaces directory not found: {workspaces_path}")
            return available_modules
        
        try:
            for item in workspaces_path.iterdir():
                if item.is_dir() and not item.name.startswith('__'):
                    # backend/router.py 파일이 있는지 확인
                    router_file = item / "backend" / "router.py"
                    if router_file.exists():
                        available_modules.append(item.name)
                        logger.debug(f"Found MVP module: {item.name}")
            
            self.available_modules = set(available_modules)
            logger.info(f"Scanned {len(available_modules)} available MVP modules")
            
        except Exception as e:
            logger.error(f"Error scanning available modules: {e}")
        
        return available_modules
    
    async def scan_and_load_mvp_modules(self, db: AsyncSession) -> List[APIRouter]:
        """활성화된 MVP 모듈을 스캔하고 라우터 반환"""
        routers = []
        
        try:
            # 사용 가능한 모듈 스캔
            self.scan_available_modules()
            
            # DB에서 활성화된 MVP 모듈 조회
            active_modules = await self._get_active_modules(db)
            logger.info(f"Found {len(active_modules)} active MVP modules in database")
            
            for module_info in active_modules:
                try:
                    router = await self._load_module_router(module_info)
                    if router:
                        routers.append(router)
                        logger.info(f"✅ Loaded MVP module: {module_info['module_name']} for workspace {module_info['workspace_id']}")
                except Exception as e:
                    logger.error(f"❌ Failed to load MVP module {module_info['module_name']}: {e}")
            
            logger.info(f"Successfully loaded {len(routers)} MVP module routers")
            
        except Exception as e:
            logger.error(f"Error in scan_and_load_mvp_modules: {e}")
        
        return routers
    
    async def _get_active_modules(self, db: AsyncSession) -> List[Dict[str, Any]]:
        """DB에서 활성화된 MVP 모듈 조회"""
        try:
            stmt = select(MVPModule).where(
                and_(
                    MVPModule.is_active == True,
                    MVPModule.module_name.in_(self.available_modules)
                )
            ).order_by(MVPModule.workspace_id, MVPModule.sort_order)
            
            result = await db.execute(stmt)
            modules = result.scalars().all()
            
            return [
                {
                    "id": module.id,
                    "workspace_id": module.workspace_id,
                    "module_name": module.module_name,
                    "display_name": module.display_name,
                    "config": module.config or {},
                    "version": module.version
                }
                for module in modules
            ]
            
        except Exception as e:
            logger.error(f"Error getting active modules from database: {e}")
            return []
    
    async def _load_module_router(self, module_info: Dict[str, Any]) -> Optional[APIRouter]:
        """개별 MVP 모듈의 라우터 로딩"""
        module_name = module_info['module_name']
        workspace_id = module_info['workspace_id']
        
        try:
            # 모듈 경로 확인
            module_dir = Path(self.workspaces_dir) / module_name
            if not module_dir.exists():
                logger.warning(f"Module directory not found: {module_dir}")
                return None
            
            router_file = module_dir / "backend" / "router.py"
            if not router_file.exists():
                logger.warning(f"Router file not found: {router_file}")
                return None
            
            # 모듈 임포트 경로 생성
            module_path = f"{self.workspaces_dir}.{module_name}.backend.router"
            
            # 모듈 로드
            if module_path in sys.modules:
                # 이미 로드된 경우 리로드
                importlib.reload(sys.modules[module_path])
                logger.debug(f"Reloaded module: {module_path}")
            else:
                importlib.import_module(module_path)
                logger.debug(f"Imported module: {module_path}")
            
            module = sys.modules[module_path]
            
            # 모듈에서 APIRouter 인스턴스 찾기
            router = self._extract_router_from_module(module, module_name)
            if not router:
                logger.warning(f"No APIRouter found in module: {module_path}")
                return None
            
            # 라우터 설정
            configured_router = self._configure_router(
                router, module_info, workspace_id, module_name
            )
            
            # 로드된 모듈 정보 저장
            self.loaded_modules[f"{workspace_id}_{module_name}"] = MVPModuleInfo(
                module_name=module_name,
                workspace_id=workspace_id,
                display_name=module_info['display_name'],
                router=configured_router,
                config=module_info['config']
            )
            
            return configured_router
            
        except ImportError as e:
            logger.error(f"Import error for module {module_name}: {e}")
        except Exception as e:
            logger.error(f"Unexpected error loading module {module_name}: {e}")
        
        return None
    
    def _extract_router_from_module(self, module, module_name: str) -> Optional[APIRouter]:
        """모듈에서 APIRouter 인스턴스 추출"""
        router = None
        
        # 1. 'router' 변수명으로 찾기
        if hasattr(module, 'router') and isinstance(module.router, APIRouter):
            router = module.router
        
        # 2. 모든 멤버에서 APIRouter 인스턴스 찾기
        if not router:
            for name, obj in inspect.getmembers(module):
                if isinstance(obj, APIRouter):
                    router = obj
                    break
        
        return router
    
    def _configure_router(
        self, 
        router: APIRouter, 
        module_info: Dict[str, Any], 
        workspace_id: int, 
        module_name: str
    ) -> APIRouter:
        """라우터 설정 및 경로 prefix 적용"""
        
        # 새로운 라우터 인스턴스 생성 (기존 라우터 복사)
        configured_router = APIRouter(
            prefix=f"/api/v1/workspaces/{workspace_id}/mvp/{module_name}",
            tags=[f"MVP-{module_info['display_name']} (WS-{workspace_id})"],
            responses={
                404: {"description": "MVP module not found"},
                403: {"description": "Access denied"},
            }
        )
        
        # 기존 라우터의 모든 경로를 새 라우터에 복사
        for route in router.routes:
            configured_router.routes.append(route)
        
        # 의존성 복사 (있는 경우)
        if hasattr(router, 'dependencies'):
            configured_router.dependencies = router.dependencies
        
        return configured_router
    
    def get_loaded_module_info(self, workspace_id: int, module_name: str) -> Optional[MVPModuleInfo]:
        """로드된 모듈 정보 조회"""
        module_key = f"{workspace_id}_{module_name}"
        return self.loaded_modules.get(module_key)
    
    def get_all_loaded_modules(self) -> Dict[str, MVPModuleInfo]:
        """모든 로드된 모듈 정보 반환"""
        return self.loaded_modules.copy()
    
    def unload_module(self, workspace_id: int, module_name: str) -> bool:
        """모듈 언로드"""
        module_key = f"{workspace_id}_{module_name}"
        if module_key in self.loaded_modules:
            del self.loaded_modules[module_key]
            logger.info(f"Unloaded MVP module: {module_name} for workspace {workspace_id}")
            return True
        return False
    
    def reload_module(self, workspace_id: int, module_name: str) -> bool:
        """모듈 리로드"""
        try:
            module_path = f"{self.workspaces_dir}.{module_name}.backend.router"
            if module_path in sys.modules:
                importlib.reload(sys.modules[module_path])
                logger.info(f"Reloaded MVP module: {module_name}")
                return True
        except Exception as e:
            logger.error(f"Failed to reload module {module_name}: {e}")
        return False
    
    def create_sample_module(self, module_name: str) -> bool:
        """샘플 MVP 모듈 생성 (개발용)"""
        try:
            module_dir = Path(self.workspaces_dir) / module_name
            backend_dir = module_dir / "backend"
            
            # 디렉토리 생성
            backend_dir.mkdir(parents=True, exist_ok=True)
            
            # __init__.py 파일들 생성
            (module_dir / "__init__.py").write_text('"""MVP Module"""\n')
            (backend_dir / "__init__.py").write_text('"""Backend Module"""\n')
            
            # 샘플 router.py 생성
            router_content = f'''"""
{module_name} MVP 모듈 라우터
"""
from fastapi import APIRouter, Depends
from typing import Dict, Any

router = APIRouter()

@router.get("/")
async def get_module_info():
    """모듈 정보 조회"""
    return {{
        "module_name": "{module_name}",
        "version": "1.0.0",
        "description": "{module_name} MVP module",
        "status": "active"
    }}

@router.get("/health")
async def health_check():
    """헬스 체크"""
    return {{"status": "healthy", "module": "{module_name}"}}
'''
            
            (backend_dir / "router.py").write_text(router_content)
            
            logger.info(f"Created sample MVP module: {module_name}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to create sample module {module_name}: {e}")
            return False


# 전역 로더 인스턴스
mvp_loader = MVPDynamicLoader() 