"""
워크스페이스 파일 시스템 관리 서비스
각 워크스페이스의 독립된 파일 구조를 관리합니다.
"""
import os
import shutil
import json
from pathlib import Path
from typing import Dict, Any, Optional, List
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class WorkspaceManager:
    """워크스페이스 파일 시스템 관리자"""
    
    def __init__(self, base_path: str = "workspaces"):
        self.base_path = Path(base_path)
        self._ensure_base_directory()
    
    def _ensure_base_directory(self):
        """기본 워크스페이스 디렉토리 생성"""
        self.base_path.mkdir(exist_ok=True)
        logger.info(f"Workspace base directory ensured: {self.base_path}")
    
    def create_workspace_directory(self, workspace_id: str) -> Path:
        """워크스페이스 디렉토리 구조 생성"""
        workspace_path = self.base_path / workspace_id
        
        # 디렉토리 구조 생성
        directories = [
            workspace_path,
            workspace_path / "modules",
            workspace_path / "data",
            workspace_path / "uploads",
            workspace_path / "config"
        ]
        
        for directory in directories:
            directory.mkdir(parents=True, exist_ok=True)
        
        # 기본 설정 파일 생성
        config_file = workspace_path / "config.json"
        if not config_file.exists():
            default_config = {
                "workspace_id": workspace_id,
                "created_at": datetime.utcnow().isoformat(),
                "version": "1.0.0",
                "settings": {
                    "theme": "default",
                    "language": "en"
                }
            }
            with open(config_file, "w", encoding="utf-8") as f:
                json.dump(default_config, f, indent=2)
        
        logger.info(f"Created workspace directory structure: {workspace_path}")
        return workspace_path
    
    def get_workspace_path(self, workspace_id: str) -> Path:
        """워크스페이스 경로 반환"""
        return self.base_path / workspace_id
    
    def workspace_exists(self, workspace_id: str) -> bool:
        """워크스페이스 디렉토리 존재 여부 확인"""
        return self.get_workspace_path(workspace_id).exists()
    
    def create_mvp_module(self, workspace_id: str, module_name: str, template: str = "default") -> Path:
        """MVP 모듈 디렉토리 생성"""
        workspace_path = self.get_workspace_path(workspace_id)
        module_path = workspace_path / "modules" / module_name
        
        # 모듈 디렉토리 구조 생성
        directories = [
            module_path,
            module_path / "backend",
            module_path / "frontend",
            module_path / "assets",
            module_path / "config"
        ]
        
        for directory in directories:
            directory.mkdir(parents=True, exist_ok=True)
        
        # 기본 파일 생성
        self._create_module_files(module_path, module_name, template)
        
        logger.info(f"Created MVP module: {module_path}")
        return module_path
    
    def _create_module_files(self, module_path: Path, module_name: str, template: str):
        """모듈 기본 파일 생성"""
        # Backend router.py
        router_content = f'''"""
{module_name} MVP Module Router
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)
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


@router.get("/data")
async def get_module_data():
    """모듈 데이터 조회"""
    # TODO: Implement module-specific data logic
    return {{
        "data": [],
        "total": 0
    }}


@router.post("/action")
async def perform_action(payload: Dict[str, Any]):
    """모듈 액션 수행"""
    # TODO: Implement module-specific actions
    return {{
        "status": "success",
        "result": payload
    }}
'''
        
        # Frontend index.tsx
        frontend_content = f'''import React from 'react';
import {{ Card, CardContent, CardHeader, CardTitle }} from '@/components/ui/card';

export const {module_name.title().replace("_", "")}Page: React.FC = () => {{
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">{module_name.replace("_", " ").title()}</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Welcome to {module_name.replace("_", " ").title()}</CardTitle>
        </CardHeader>
        <CardContent>
          <p>This is your MVP module. Start building your functionality here.</p>
        </CardContent>
      </Card>
    </div>
  );
}};

export default {module_name.title().replace("_", "")}Page;
'''
        
        # Module config
        config_content = {
            "module_name": module_name,
            "display_name": module_name.replace("_", " ").title(),
            "version": "1.0.0",
            "template": template,
            "created_at": datetime.utcnow().isoformat(),
            "routes": {
                "main": f"/{module_name}",
                "api": f"/api/{module_name}"
            },
            "permissions": {
                "view": ["*"],
                "edit": ["admin", "editor"],
                "delete": ["admin"]
            }
        }
        
        # Write files
        (module_path / "backend" / "__init__.py").write_text('"""Backend module"""')
        (module_path / "backend" / "router.py").write_text(router_content)
        (module_path / "frontend" / "__init__.py").write_text('"""Frontend module"""')
        (module_path / "frontend" / "index.tsx").write_text(frontend_content)
        (module_path / "config" / "module.json").write_text(
            json.dumps(config_content, indent=2)
        )
    
    def list_workspace_modules(self, workspace_id: str) -> List[str]:
        """워크스페이스의 모듈 목록 조회"""
        workspace_path = self.get_workspace_path(workspace_id)
        modules_path = workspace_path / "modules"
        
        if not modules_path.exists():
            return []
        
        return [
            item.name for item in modules_path.iterdir()
            if item.is_dir() and not item.name.startswith("_")
        ]
    
    def get_module_config(self, workspace_id: str, module_name: str) -> Optional[Dict[str, Any]]:
        """모듈 설정 조회"""
        module_path = self.get_workspace_path(workspace_id) / "modules" / module_name
        config_file = module_path / "config" / "module.json"
        
        if config_file.exists():
            with open(config_file, "r", encoding="utf-8") as f:
                return json.load(f)
        
        return None
    
    def delete_workspace(self, workspace_id: str) -> bool:
        """워크스페이스 삭제 (주의: 모든 데이터 삭제됨)"""
        workspace_path = self.get_workspace_path(workspace_id)
        
        if workspace_path.exists():
            shutil.rmtree(workspace_path)
            logger.warning(f"Deleted workspace: {workspace_path}")
            return True
        
        return False
    
    def delete_module(self, workspace_id: str, module_name: str) -> bool:
        """MVP 모듈 삭제"""
        module_path = self.get_workspace_path(workspace_id) / "modules" / module_name
        
        if module_path.exists():
            shutil.rmtree(module_path)
            logger.info(f"Deleted module: {module_path}")
            return True
        
        return False
    
    def export_workspace(self, workspace_id: str, output_path: str) -> str:
        """워크스페이스 내보내기 (백업)"""
        workspace_path = self.get_workspace_path(workspace_id)
        
        if not workspace_path.exists():
            raise ValueError(f"Workspace {workspace_id} does not exist")
        
        # Create archive
        archive_path = shutil.make_archive(
            base_name=f"{output_path}/workspace_{workspace_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            format='zip',
            root_dir=workspace_path.parent,
            base_dir=workspace_path.name
        )
        
        logger.info(f"Exported workspace to: {archive_path}")
        return archive_path
    
    def import_workspace(self, workspace_id: str, archive_path: str) -> bool:
        """워크스페이스 가져오기 (복원)"""
        workspace_path = self.get_workspace_path(workspace_id)
        
        if workspace_path.exists():
            raise ValueError(f"Workspace {workspace_id} already exists")
        
        # Extract archive
        shutil.unpack_archive(archive_path, workspace_path.parent)
        
        logger.info(f"Imported workspace from: {archive_path}")
        return True