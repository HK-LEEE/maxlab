# OAuth Production 404 Error Fix Guide

## 문제 설명
Production 환경에서 OAuth 로그인 시 callback URL (`https://maxlab.dwchem.co.kr/oauth/callback`)이 404 Not Found 오류를 반환하는 문제가 발생했습니다.

## 문제 원인

### 1. 백엔드 OAuth 설정 문제
- `backend/app/routers/oauth.py`의 `ALLOWED_REDIRECT_PATTERNS`에 production 도메인 (`maxlab.dwchem.co.kr`)이 누락되어 있었습니다
- 기존에는 `maxlab.io` 도메인만 허용되어 있었습니다

### 2. Nginx SPA 라우팅 문제
- React는 Single Page Application(SPA)으로, 모든 라우트가 클라이언트 사이드에서 처리됩니다
- Nginx가 `/oauth/callback` 경로를 파일로 찾으려 하면서 404 오류가 발생했습니다
- 모든 프론트엔드 라우트는 `index.html`을 반환하도록 설정해야 합니다

## 해결 방법

### 1. 백엔드 수정 사항 (이미 적용됨)

**파일**: `backend/app/routers/oauth.py`

다음 패턴들이 추가되었습니다:
```python
ALLOWED_REDIRECT_PATTERNS = [
    # ... 기존 패턴들 ...
    r"^https://maxlab\.dwchem\.co\.kr/oauth/callback$",  # Production domain (dwchem)
    r"^https://maxlab\.dwchem\.co\.kr/$",  # Production root (dwchem)
    r"^https://maxlab\.dwchem\.co\.kr/login$",  # Production login (dwchem)
]

# Trusted origins에도 추가
"https://maxlab.dwchem.co.kr",  # Production (dwchem)
```

### 2. Nginx 설정 (적용 필요)

**파일**: `nginx.production.conf`

핵심 설정:
```nginx
# SPA 라우팅을 위한 설정
location / {
    try_files $uri $uri/ /index.html;
}

# OAuth callback 경로 명시적 처리
location /oauth/callback {
    try_files /index.html =404;
}
```

## 배포 절차

### 자동 배포 (추천)
```bash
cd /home/lee/maxproject/maxlab
sudo ./scripts/fix-oauth-production.sh
```

### 수동 배포

#### 1. 백엔드 배포
```bash
cd /opt/maxlab/backend
git pull origin main
sudo systemctl restart maxlab-backend
```

#### 2. 프론트엔드 빌드 및 배포
```bash
cd /home/lee/maxproject/maxlab/frontend
npm install
npm run build
sudo cp -r dist/* /var/www/maxlab/frontend/dist/
```

#### 3. Nginx 설정 업데이트
```bash
sudo cp nginx.production.conf /etc/nginx/sites-available/maxlab
sudo nginx -t  # 설정 테스트
sudo systemctl reload nginx
```

## 확인 사항

### 1. OAuth Provider 설정
MAX Platform OAuth 서버에서 다음 Redirect URI가 등록되어 있는지 확인:
- `https://maxlab.dwchem.co.kr/oauth/callback`

### 2. SSL 인증서
- 도메인 `maxlab.dwchem.co.kr`에 대한 유효한 SSL 인증서가 설치되어 있어야 합니다
- Let's Encrypt 사용 시: `sudo certbot --nginx -d maxlab.dwchem.co.kr`

### 3. DNS 설정
- `maxlab.dwchem.co.kr`이 올바른 서버 IP를 가리키는지 확인

## 테스트 방법

### 1. 라우트 접근 테스트
```bash
# OAuth callback 경로 테스트
curl -I https://maxlab.dwchem.co.kr/oauth/callback

# 200 OK가 반환되어야 함
```

### 2. OAuth 플로우 테스트
1. 브라우저에서 `https://maxlab.dwchem.co.kr` 접속
2. 로그인 버튼 클릭
3. OAuth 제공자 로그인
4. 정상적으로 callback URL로 리다이렉트되고 로그인 완료되는지 확인

## 트러블슈팅

### 여전히 404 오류가 발생하는 경우

1. **Nginx 설정 확인**
```bash
sudo nginx -t
sudo cat /etc/nginx/sites-enabled/maxlab
```

2. **로그 확인**
```bash
# Nginx 에러 로그
sudo tail -f /var/log/nginx/maxlab.error.log

# Backend 로그
sudo journalctl -u maxlab-backend -f
```

3. **프론트엔드 빌드 확인**
```bash
ls -la /var/www/maxlab/frontend/dist/
# index.html 파일이 존재해야 함
```

4. **권한 확인**
```bash
# Nginx가 파일을 읽을 수 있는지 확인
sudo -u www-data ls /var/www/maxlab/frontend/dist/
```

### OAuth 토큰 문제

백엔드 로그에서 다음과 같은 오류가 보이는 경우:
```
Invalid redirect URI in token exchange: https://maxlab.dwchem.co.kr/oauth/callback
```

이는 백엔드가 아직 재시작되지 않았음을 의미합니다:
```bash
sudo systemctl restart maxlab-backend
```

## 롤백 방법

문제가 발생한 경우:

1. **Nginx 설정 롤백**
```bash
sudo mv /etc/nginx/sites-available/maxlab.backup.* /etc/nginx/sites-available/maxlab
sudo nginx -t
sudo systemctl reload nginx
```

2. **백엔드 코드 롤백**
```bash
cd /opt/maxlab/backend
git revert HEAD
sudo systemctl restart maxlab-backend
```

## 추가 보안 권장사항

1. **Content Security Policy (CSP) 헤더 추가**
2. **Rate Limiting 설정**
3. **OAuth state 파라미터 검증 강화**
4. **PKCE (Proof Key for Code Exchange) 확인**

## 관련 파일
- `/home/lee/maxproject/maxlab/backend/app/routers/oauth.py` - OAuth 라우터
- `/home/lee/maxproject/maxlab/nginx.production.conf` - Nginx 설정
- `/home/lee/maxproject/maxlab/scripts/fix-oauth-production.sh` - 자동 배포 스크립트
- `/home/lee/maxproject/maxlab/frontend/src/App.tsx` - React 라우팅