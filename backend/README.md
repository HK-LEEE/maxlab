# Max Lab MVP Platform (Backend)

## 📖 개요

Max Lab MVP Platform은 동적 MVP 페이지 관리를 위한 종합 플랫폼입니다. 워크스페이스 기반으로 MVP 모듈을 관리하고, 외부 인증 서버와 연동하여 그룹 기반 권한 제어를 제공합니다.

## 🎯 주요 기능

### 🏢 워크스페이스 관리
- **동적 워크스페이스**: 독립적인 MVP 환경 제공
- **그룹 기반 권한**: 외부 인증 서버와 연동한 세밀한 접근 제어
- **워크스페이스별 설정**: JSON 기반 유연한 설정 관리

### 🧩 MVP 모듈 시스템
- **동적 로딩**: 런타임에 MVP 모듈 자동 스캔 및 로딩
- **모듈식 아키텍처**: 독립적인 FastAPI 라우터 기반 모듈
- **버전 관리**: 모듈별 버전 및 설정 추적

### 🔐 인증 및 보안
- **외부 인증 연동**: localhost:8000의 MAXDP 인증 서버 통합
- **JWT 토큰 검증**: 사용자 정보 및 그룹 권한 자동 확인
- **권한 레벨**: read, write, admin 3단계 권한 체계

### 📊 데이터베이스
- **PostgreSQL 17**: 최신 버전 지원
- **SQLAlchemy 2.0**: 비동기 패턴 완전 지원
- **Alembic**: 자동 마이그레이션 시스템

## 🏗️ 아키텍처

```
backend/
├── app/                     # 메인 애플리케이션
│   ├── core/               # 핵심 설정 및 데이터베이스
│   ├── models/             # SQLAlchemy 모델
│   ├── schemas/            # Pydantic 스키마
│   ├── crud/               # 데이터베이스 CRUD 로직
│   ├── routers/            # FastAPI 라우터
│   └── main.py             # 애플리케이션 진입점
├── workspaces/             # MVP 모듈 디렉토리
│   ├── dynamic_loader.py   # 동적 모듈 로더
│   └── sample_dashboard/   # 샘플 MVP 모듈
├── alembic/                # 데이터베이스 마이그레이션
└── requirements.txt        # Python 의존성
```

### MVP 모듈 구조
```
workspaces/{module_name}/
├── __init__.py
├── backend/
│   ├── __init__.py
│   └── router.py          # FastAPI 라우터 (필수)
└── frontend/              # 선택적 프론트엔드 파일
```

## 🚀 설치 및 실행

### 1. 환경 요구사항
- **Python 3.11+**
- **PostgreSQL 17**
- **Node.js 22** (프론트엔드용)

### 2. 백엔드 설정

#### 가상환경 생성 및 활성화
```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate
```

#### 의존성 설치
```bash
pip install -r requirements.txt
```

#### 환경변수 설정
`.env.example`을 복사하여 `.env` 파일을 생성하고 설정을 수정하세요:

```bash
cp .env.example .env
```

**주요 환경 변수:**
```env
# 데이터베이스
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/maxlab_mvp

# 인증 서버
AUTH_SERVER_URL=http://localhost:8000

# 보안
SECRET_KEY=your-super-secret-key
JWT_SECRET_KEY=jwt-secret-key

# 서버
HOST=0.0.0.0
PORT=8001
```

#### 데이터베이스 마이그레이션
```bash
# 초기 마이그레이션 생성
alembic revision --autogenerate -m "Initial migration"

# 마이그레이션 실행
alembic upgrade head
```

#### 애플리케이션 실행
```bash
# 개발 모드
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8001

# 또는 직접 실행
python app/main.py
```

### 3. 샘플 데이터 생성

애플리케이션 실행 후 다음 API를 통해 워크스페이스와 MVP 모듈을 생성할 수 있습니다:

```bash
# 워크스페이스 생성 (관리자 권한 필요)
curl -X POST "http://localhost:8001/api/v1/workspaces/" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "샘플 워크스페이스",
    "slug": "sample-workspace",
    "description": "샘플 워크스페이스입니다."
  }'

# MVP 모듈 등록
curl -X POST "http://localhost:8001/api/v1/workspaces/1/modules/" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "module_name": "sample_dashboard",
    "display_name": "샘플 대시보드",
    "description": "기본 대시보드 기능"
  }'
```

## 📡 API 문서

애플리케이션 실행 후 다음 URL에서 API 문서를 확인할 수 있습니다:
- **Swagger UI**: http://localhost:8001/docs
- **ReDoc**: http://localhost:8001/redoc

### 주요 API 엔드포인트

#### 워크스페이스 관리
- `GET /api/v1/workspaces/` - 워크스페이스 목록
- `POST /api/v1/workspaces/` - 워크스페이스 생성 (관리자)
- `GET /api/v1/workspaces/{id}` - 워크스페이스 상세
- `PUT /api/v1/workspaces/{id}` - 워크스페이스 수정

#### MVP 모듈 관리
- `GET /api/v1/workspaces/{id}/modules/` - 모듈 목록
- `POST /api/v1/workspaces/{id}/modules/` - 모듈 추가
- `PUT /api/v1/workspaces/{id}/modules/{module_id}` - 모듈 수정

#### 동적 MVP 모듈 API
각 워크스페이스의 MVP 모듈은 다음 패턴으로 접근:
- `GET /api/v1/workspaces/{workspace_id}/mvp/{module_name}/`

**샘플 대시보드 API:**
- `GET /api/v1/workspaces/1/mvp/sample_dashboard/stats` - 통계 데이터
- `GET /api/v1/workspaces/1/mvp/sample_dashboard/chart-data` - 차트 데이터
- `GET /api/v1/workspaces/1/mvp/sample_dashboard/activities` - 활동 로그

## 🔧 개발 가이드

### MVP 모듈 개발

1. **모듈 디렉토리 생성**
```bash
mkdir -p workspaces/my_module/backend
```

2. **라우터 작성** (`workspaces/my_module/backend/router.py`)
```python
from fastapi import APIRouter

router = APIRouter()

@router.get("/")
async def get_module_info():
    return {"module": "my_module", "status": "active"}
```

3. **모듈 등록**
   - 데이터베이스에 모듈 정보 등록
   - 애플리케이션 재시작 또는 `/api/v1/modules/reload` 호출

### 권한 관리

MVP 모듈에서 권한을 확인하려면:

```python
from app.core.security import get_current_active_user
from app.routers.workspaces import require_workspace_permission

@router.get("/protected")
async def protected_endpoint(
    current_user: dict = Depends(require_workspace_permission("write"))
):
    return {"message": "write 권한이 있는 사용자만 접근 가능"}
```

### 로깅

```python
import logging
logger = logging.getLogger(__name__)

@router.get("/example")
async def example():
    logger.info("API 호출됨")
    return {"status": "success"}
```

## 🐳 배포

### Docker 배포 (예정)
```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
```

### Windows 서비스 배포
NSSM을 사용하여 Windows 서비스로 등록할 수 있습니다.

## 🔍 모니터링

### 헬스 체크
- `GET /api/v1/health` - 기본 헬스 체크
- `GET /api/v1/info` - 애플리케이션 정보 및 로드된 모듈 현황

### 로그 레벨 설정
환경변수 `LOG_LEVEL`을 통해 로그 레벨을 조정할 수 있습니다:
- `DEBUG`: 상세한 디버깅 정보
- `INFO`: 일반 정보 (기본값)
- `WARNING`: 경고 메시지
- `ERROR`: 오류 메시지만

## 🤝 기여 가이드

1. **이슈 생성**: 버그 리포트나 기능 요청
2. **브랜치 생성**: `feature/기능명` 또는 `fix/버그명`
3. **코드 작성**: PEP 8 스타일 가이드 준수
4. **테스트 추가**: 새로운 기능에 대한 테스트 코드
5. **Pull Request**: 상세한 설명과 함께 제출

## 📝 라이선스

이 프로젝트는 Max Lab 내부 프로젝트입니다.

## 📞 지원

- **개발팀**: Max Lab Development Team
- **이슈 트래킹**: GitHub Issues
- **문서**: 이 README 및 API 문서 참조

---

**Max Lab MVP Platform** - 동적 MVP 관리의 새로운 표준 🚀 