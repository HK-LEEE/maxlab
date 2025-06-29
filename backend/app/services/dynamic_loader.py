"""
워크스페이스 기반 MVP 모듈 동적 로더
각 워크스페이스의 독립된 MVP 모듈을 동적으로 로드합니다.
"""
import os
import sys
import importlib
import importlib.util
from pathlib import Path
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, Request, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
import logging
import json

from app.models.workspace import MVPModule
from app.services.workspace_manager import WorkspaceManager
from app.core.database import get_db
from app.core.security import get_current_active_user

logger = logging.getLogger(__name__)


class WorkspaceModuleLoader:
    """워크스페이스 기반 모듈 로더"""
    
    def __init__(self):
        self.workspace_manager = WorkspaceManager()
        self.loaded_modules: Dict[str, APIRouter] = {}
        self._module_cache: Dict[str, Any] = {}
    
    async def load_workspace_modules(self, workspace_id: str, db: AsyncSession) -> List[APIRouter]:
        """워크스페이스의 활성화된 모듈 로드"""
        routers = []
        
        try:
            # 워크스페이스 존재 확인
            if not self.workspace_manager.workspace_exists(workspace_id):
                logger.warning(f"Workspace {workspace_id} does not exist")
                return routers
            
            # DB에서 활성 모듈 조회
            modules = await self._get_active_modules(workspace_id, db)
            
            for module in modules:
                try:
                    router = await self._load_module(workspace_id, module)
                    if router:
                        routers.append(router)
                        logger.info(f"Loaded module {module.module_name} for workspace {workspace_id}")
                except Exception as e:
                    logger.error(f"Failed to load module {module.module_name}: {e}")
            
            return routers
            
        except Exception as e:
            logger.error(f"Error loading workspace modules: {e}")
            return routers
    
    async def _get_active_modules(self, workspace_id: str, db: AsyncSession) -> List[MVPModule]:
        """워크스페이스의 활성 모듈 조회"""
        from sqlalchemy import select
        
        stmt = select(MVPModule).where(
            MVPModule.workspace_id == workspace_id,
            MVPModule.is_active == True,
            MVPModule.is_installed == True
        ).order_by(MVPModule.sort_order)
        
        result = await db.execute(stmt)
        return result.scalars().all()
    
    async def _load_module(self, workspace_id: str, module: MVPModule) -> Optional[APIRouter]:
        """개별 모듈 로드"""
        module_key = f"{workspace_id}_{module.module_name}"
        
        # 캐시 확인
        if module_key in self.loaded_modules:
            return self.loaded_modules[module_key]
        
        # 모듈 경로 확인
        module_path = self.workspace_manager.get_workspace_path(workspace_id) / "modules" / module.module_name
        router_file = module_path / "backend" / "router.py"
        
        if not router_file.exists():
            logger.warning(f"Router file not found: {router_file}")
            return None
        
        # 동적 모듈 로드
        spec = importlib.util.spec_from_file_location(
            f"workspace_{workspace_id}_{module.module_name}_router",
            router_file
        )
        
        if spec and spec.loader:
            module_obj = importlib.util.module_from_spec(spec)
            sys.modules[spec.name] = module_obj
            spec.loader.exec_module(module_obj)
            
            # 라우터 추출
            if hasattr(module_obj, 'router') and isinstance(module_obj.router, APIRouter):
                # 라우터 구성
                configured_router = self._configure_router(
                    module_obj.router,
                    workspace_id,
                    module
                )
                
                # 캐시에 저장
                self.loaded_modules[module_key] = configured_router
                return configured_router
        
        return None
    
    def _configure_router(self, router: APIRouter, workspace_id: str, module: MVPModule) -> APIRouter:
        """라우터 설정 및 권한 적용"""
        # 새 라우터 생성
        configured_router = APIRouter(
            prefix=f"/api/v1/workspaces/{workspace_id}/modules/{module.module_name}",
            tags=[f"{module.display_name} (WS: {workspace_id})"]
        )
        
        # 권한 체크 미들웨어 추가
        @configured_router.middleware("http")
        async def check_permissions(request: Request, call_next):
            # 권한 체크 로직
            # TODO: 실제 권한 체크 구현
            response = await call_next(request)
            return response
        
        # 기존 라우트 복사
        for route in router.routes:
            configured_router.routes.append(route)
        
        return configured_router
    
    def unload_module(self, workspace_id: str, module_name: str):
        """모듈 언로드"""
        module_key = f"{workspace_id}_{module_name}"
        if module_key in self.loaded_modules:
            del self.loaded_modules[module_key]
            logger.info(f"Unloaded module {module_name} from workspace {workspace_id}")
    
    def clear_workspace_modules(self, workspace_id: str):
        """워크스페이스의 모든 모듈 언로드"""
        keys_to_remove = [
            key for key in self.loaded_modules.keys()
            if key.startswith(f"{workspace_id}_")
        ]
        
        for key in keys_to_remove:
            del self.loaded_modules[key]
        
        logger.info(f"Cleared all modules for workspace {workspace_id}")


class ModuleTemplateManager:
    """MVP 모듈 템플릿 관리자"""
    
    def __init__(self):
        self.templates_dir = Path("app/templates/mvp_modules")
        self._ensure_templates_directory()
    
    def _ensure_templates_directory(self):
        """템플릿 디렉토리 생성"""
        self.templates_dir.mkdir(parents=True, exist_ok=True)
        
        # 기본 템플릿 생성
        self._create_default_templates()
    
    def _create_default_templates(self):
        """기본 템플릿 생성"""
        templates = {
            "dashboard": self._dashboard_template(),
            "analytics": self._analytics_template(),
            "report": self._report_template(),
            "custom": self._custom_template()
        }
        
        for name, content in templates.items():
            template_dir = self.templates_dir / name
            template_dir.mkdir(exist_ok=True)
            
            # Backend router template
            (template_dir / "router.py.template").write_text(content["backend"])
            
            # Frontend component template
            (template_dir / "index.tsx.template").write_text(content["frontend"])
            
            # Config template
            (template_dir / "config.json.template").write_text(
                json.dumps(content["config"], indent=2)
            )
    
    def _dashboard_template(self) -> Dict[str, Any]:
        """대시보드 템플릿"""
        return {
            "backend": '''"""
{module_name} Dashboard Module
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any, List
from datetime import datetime, timedelta

router = APIRouter()

@router.get("/stats")
async def get_dashboard_stats():
    """대시보드 통계 조회"""
    return {
        "total_items": 150,
        "active_users": 25,
        "recent_activities": 89,
        "performance_score": 92.5
    }

@router.get("/charts/overview")
async def get_overview_chart_data():
    """개요 차트 데이터"""
    return {
        "labels": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        "datasets": [{
            "label": "Activity",
            "data": [65, 59, 80, 81, 56, 55, 40]
        }]
    }

@router.get("/recent-activities")
async def get_recent_activities():
    """최근 활동 목록"""
    return {
        "activities": [
            {"id": 1, "action": "Created", "target": "Report #123", "timestamp": datetime.now().isoformat()},
            {"id": 2, "action": "Updated", "target": "Dataset A", "timestamp": datetime.now().isoformat()},
        ],
        "total": 2
    }
''',
            "frontend": '''import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Users, TrendingUp, BarChart3 } from 'lucide-react';

export const {module_title}Page: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  
  useEffect(() => {
    // TODO: Fetch dashboard stats
  }, []);
  
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">150</div>
            <p className="text-xs text-muted-foreground">+20% from last month</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">25</div>
            <p className="text-xs text-muted-foreground">+5 new this week</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Activities</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">89</div>
            <p className="text-xs text-muted-foreground">In the last 24 hours</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Performance</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">92.5%</div>
            <p className="text-xs text-muted-foreground">+2.5% improvement</p>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Recent Activities</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">No recent activities</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default {module_title}Page;
''',
            "config": {
                "module_type": "dashboard",
                "features": {
                    "stats": True,
                    "charts": True,
                    "activities": True
                },
                "refresh_interval": 30000
            }
        }
    
    def _analytics_template(self) -> Dict[str, Any]:
        """분석 템플릿"""
        return {
            "backend": '''"""
{module_name} Analytics Module
"""
from fastapi import APIRouter, Depends, Query
from typing import Dict, Any, List, Optional
from datetime import datetime, date

router = APIRouter()

@router.get("/metrics")
async def get_metrics(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    metric_type: Optional[str] = Query(None)
):
    """메트릭 데이터 조회"""
    return {
        "metrics": [
            {"name": "Page Views", "value": 15234, "change": 12.5},
            {"name": "Unique Visitors", "value": 3421, "change": -2.3},
            {"name": "Avg. Session Duration", "value": "3m 42s", "change": 5.8},
            {"name": "Bounce Rate", "value": "42.3%", "change": -3.2}
        ]
    }

@router.get("/trends")
async def get_trend_data(period: str = Query("week")):
    """트렌드 데이터 조회"""
    return {
        "period": period,
        "data": {
            "labels": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
            "datasets": [
                {
                    "label": "This Week",
                    "data": [420, 380, 510, 490, 620, 580, 690]
                },
                {
                    "label": "Last Week", 
                    "data": [380, 340, 480, 450, 560, 520, 610]
                }
            ]
        }
    }
''',
            "frontend": '''import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';

export const {module_title}Page: React.FC = () => {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Analytics</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Page Views</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">15,234</div>
            <div className="flex items-center text-sm text-green-600">
              <TrendingUp className="h-4 w-4 mr-1" />
              12.5%
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Unique Visitors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3,421</div>
            <div className="flex items-center text-sm text-red-600">
              <TrendingDown className="h-4 w-4 mr-1" />
              2.3%
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Traffic Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            Chart will be displayed here
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default {module_title}Page;
''',
            "config": {
                "module_type": "analytics",
                "features": {
                    "metrics": True,
                    "trends": True,
                    "export": True
                }
            }
        }
    
    def _report_template(self) -> Dict[str, Any]:
        """리포트 템플릿"""
        return {
            "backend": '''"""
{module_name} Report Module
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any, List
from datetime import datetime

router = APIRouter()

@router.get("/")
async def get_reports():
    """리포트 목록 조회"""
    return {
        "reports": [
            {
                "id": "1",
                "title": "Monthly Sales Report",
                "type": "sales",
                "created_at": datetime.now().isoformat(),
                "status": "completed"
            },
            {
                "id": "2", 
                "title": "User Activity Analysis",
                "type": "analytics",
                "created_at": datetime.now().isoformat(),
                "status": "processing"
            }
        ],
        "total": 2
    }

@router.post("/generate")
async def generate_report(report_config: Dict[str, Any]):
    """새 리포트 생성"""
    return {
        "id": "3",
        "status": "queued",
        "message": "Report generation started"
    }
''',
            "frontend": '''import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Download, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const {module_title}Page: React.FC = () => {
  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Reports</h1>
        <Button>Generate New Report</Button>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Recent Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded">
              <div className="flex items-center space-x-4">
                <FileText className="h-8 w-8 text-muted-foreground" />
                <div>
                  <h3 className="font-medium">Monthly Sales Report</h3>
                  <p className="text-sm text-muted-foreground">Generated 2 hours ago</p>
                </div>
              </div>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>
            
            <div className="flex items-center justify-between p-4 border rounded">
              <div className="flex items-center space-x-4">
                <Clock className="h-8 w-8 text-muted-foreground animate-pulse" />
                <div>
                  <h3 className="font-medium">User Activity Analysis</h3>
                  <p className="text-sm text-muted-foreground">Processing...</p>
                </div>
              </div>
              <Button variant="outline" size="sm" disabled>
                Processing
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default {module_title}Page;
''',
            "config": {
                "module_type": "report",
                "features": {
                    "generate": True,
                    "schedule": True,
                    "export": True
                }
            }
        }
    
    def _custom_template(self) -> Dict[str, Any]:
        """커스텀 템플릿"""
        return {
            "backend": '''"""
{module_name} Custom Module
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any

router = APIRouter()

@router.get("/")
async def get_module_info():
    """모듈 정보 조회"""
    return {
        "module_name": "{module_name}",
        "version": "1.0.0",
        "description": "Custom MVP module"
    }

@router.get("/data")
async def get_data():
    """데이터 조회"""
    # TODO: Implement your custom logic here
    return {
        "data": [],
        "total": 0
    }

@router.post("/action")
async def perform_action(payload: Dict[str, Any]):
    """액션 수행"""
    # TODO: Implement your custom action
    return {
        "status": "success",
        "result": payload
    }
''',
            "frontend": '''import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const {module_title}Page: React.FC = () => {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">{display_name}</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Welcome to {display_name}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            This is your custom MVP module. Start building your functionality here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default {module_title}Page;
''',
            "config": {
                "module_type": "custom",
                "features": {}
            }
        }
    
    def get_template(self, template_name: str) -> Dict[str, Any]:
        """템플릿 가져오기"""
        template_dir = self.templates_dir / template_name
        
        if not template_dir.exists():
            template_name = "custom"
            template_dir = self.templates_dir / template_name
        
        result = {}
        
        # Load templates
        backend_file = template_dir / "router.py.template"
        if backend_file.exists():
            result["backend"] = backend_file.read_text()
        
        frontend_file = template_dir / "index.tsx.template"
        if frontend_file.exists():
            result["frontend"] = frontend_file.read_text()
        
        config_file = template_dir / "config.json.template"
        if config_file.exists():
            with open(config_file, "r") as f:
                result["config"] = json.load(f)
        
        return result
    
    def apply_template(self, template: Dict[str, Any], context: Dict[str, str]) -> Dict[str, Any]:
        """템플릿에 컨텍스트 적용"""
        result = {}
        
        # Apply context to templates
        if "backend" in template:
            result["backend"] = template["backend"].format(**context)
        
        if "frontend" in template:
            result["frontend"] = template["frontend"].format(**context)
        
        if "config" in template:
            result["config"] = template["config"]
        
        return result


# 전역 인스턴스
workspace_module_loader = WorkspaceModuleLoader()
module_template_manager = ModuleTemplateManager()