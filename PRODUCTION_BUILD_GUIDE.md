# Production Build 가이드

## 문제 해결 요약

Production에서 OAuth 로그인 시 `localhost:3000`으로 리다이렉트되는 문제를 해결하기 위한 완전한 가이드입니다.

## 즉시 적용 방법 (재빌드 없이)

### 1. 런타임 설정 적용
```bash
cd /home/lee/maxproject/maxlab
sudo ./scripts/fix-oauth-localhost-production.sh
```

이 스크립트는:
- `/var/www/maxlab/frontend/dist/config.js` 생성
- Production URL 설정 주입
- index.html에 config.js 로드 추가

### 2. 확인
```bash
# 브라우저에서 https://maxlab.dwchem.co.kr 접속
# 개발자 콘솔(F12)에서 실행:
console.log(window.ENV_CONFIG);
# AUTH_SERVER_URL이 'https://max.dwchem.co.kr'인지 확인
```

## 완전한 해결 방법 (재빌드)

### 1. package.json 수정
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "build:production": "tsc -b && vite build --mode production",
    "build:staging": "tsc -b && vite build --mode staging",
    "lint": "eslint .",
    "preview": "vite preview"
  }
}
```

### 2. Production 빌드
```bash
cd /home/lee/maxproject/maxlab/frontend

# 환경 변수 파일 확인
cat .env.production

# Production 빌드 실행
npm run build:production

# 또는 환경 변수 직접 지정
VITE_AUTH_SERVER_URL=https://max.dwchem.co.kr \
VITE_CLIENT_ID=maxlab \
VITE_REDIRECT_URI=https://maxlab.dwchem.co.kr/oauth/callback \
VITE_API_BASE_URL=https://maxlab.dwchem.co.kr/api \
npm run build
```

### 3. 배포
```bash
# 빌드 결과물 배포
sudo cp -r dist/* /var/www/maxlab/frontend/dist/

# 권한 설정
sudo chown -R www-data:www-data /var/www/maxlab/frontend/dist/

# 런타임 설정 파일도 함께 배포
sudo cp public/config.production.js /var/www/maxlab/frontend/dist/config.js
```

### 4. 빌드 검증
```bash
# 빌드에 localhost가 포함되었는지 확인
grep -r "localhost:3000\|localhost:8000" dist/

# 없어야 정상
```

## 환경별 설정 파일

### Development (.env.development)
```env
VITE_AUTH_SERVER_URL=http://localhost:8000
VITE_CLIENT_ID=maxlab
VITE_REDIRECT_URI=http://localhost:3010/oauth/callback
VITE_API_BASE_URL=http://localhost:8010
```

### Staging (.env.staging)
```env
VITE_AUTH_SERVER_URL=https://devmax.dwchem.co.kr
VITE_CLIENT_ID=maxlab-staging
VITE_REDIRECT_URI=https://devmaxlab.dwchem.co.kr/oauth/callback
VITE_API_BASE_URL=https://devmaxlab.dwchem.co.kr/api
```

### Production (.env.production)
```env
VITE_AUTH_SERVER_URL=https://max.dwchem.co.kr
VITE_CLIENT_ID=maxlab
VITE_REDIRECT_URI=https://maxlab.dwchem.co.kr/oauth/callback
VITE_API_BASE_URL=https://maxlab.dwchem.co.kr/api
```

## 자동화 배포 스크립트

### deploy-production.sh
```bash
#!/bin/bash
set -e

echo "Building for production..."
cd /home/lee/maxproject/maxlab/frontend

# Clean and build
rm -rf dist
npm run build:production

# Deploy
echo "Deploying to production..."
sudo rm -rf /var/www/maxlab/frontend/dist.old
sudo mv /var/www/maxlab/frontend/dist /var/www/maxlab/frontend/dist.old || true
sudo cp -r dist /var/www/maxlab/frontend/
sudo cp public/config.production.js /var/www/maxlab/frontend/dist/config.js

# Set permissions
sudo chown -R www-data:www-data /var/www/maxlab/frontend/dist

# Clear nginx cache
sudo nginx -s reload

echo "✅ Production deployment complete!"
```

## 트러블슈팅

### 여전히 localhost:3000으로 가는 경우

1. **브라우저 캐시 지우기**
   - Ctrl+Shift+Del → 캐시된 이미지 및 파일 삭제
   - 또는 시크릿/프라이빗 모드 사용

2. **OAuth 서버 확인**
   ```bash
   # OAuth authorize URL 직접 테스트
   curl -I "https://max.dwchem.co.kr/api/oauth/authorize?client_id=maxlab&redirect_uri=https://maxlab.dwchem.co.kr/oauth/callback"
   ```

3. **런타임 설정 확인**
   ```javascript
   // 브라우저 콘솔에서
   console.log('Config loaded:', window.ENV_CONFIG);
   console.log('Auth URL:', window.ENV_CONFIG?.AUTH_SERVER_URL);
   ```

4. **네트워크 탭 확인**
   - F12 → Network 탭
   - OAuth authorize 요청 URL 확인
   - Location 헤더 확인

### OAuth 서버 측 설정 필요 (백엔드 팀)

OAuth 서버에서 확인/수정 필요한 사항:

1. **계정 선택 화면 URL**
   - `prompt=login` 처리 시 리다이렉트 URL
   - 하드코딩된 `localhost:3000` 제거

2. **환경 변수 설정**
   ```python
   # OAuth 서버 설정
   FRONTEND_URL = os.getenv('FRONTEND_URL', 'https://max.dwchem.co.kr')
   MAXLAB_FRONTEND_URL = os.getenv('MAXLAB_FRONTEND_URL', 'https://maxlab.dwchem.co.kr')
   ```

3. **Allowed Redirect URIs**
   ```python
   ALLOWED_REDIRECT_URIS = [
       'https://maxlab.dwchem.co.kr/oauth/callback',
       'http://localhost:3010/oauth/callback',  # Dev only
   ]
   ```

## 모니터링

### 로그 확인
```bash
# Nginx 로그
sudo tail -f /var/log/nginx/maxlab.dwchem.co.kr_access.log
sudo tail -f /var/log/nginx/maxlab.dwchem.co.kr_error.log

# Backend 로그
sudo journalctl -u maxlab-backend -f
```

### 성공 지표
- ✅ OAuth 팝업이 `https://max.dwchem.co.kr`로 열림
- ✅ 로그인 완료 후 `https://maxlab.dwchem.co.kr`로 돌아옴
- ✅ "다른 사용자로 로그인" 정상 작동
- ✅ 네트워크 탭에 `localhost` 참조 없음

## 연락처
- Frontend 이슈: DevOps 팀
- OAuth 서버 설정: Backend 팀
- 인프라/네트워크: Infrastructure 팀