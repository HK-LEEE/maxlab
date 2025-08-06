# Nginx OAuth 라우팅 수정 가이드

## 문제 상황
현재 `nginx-production.conf`에서 `/oauth/` 경로가 모두 백엔드로 프록시되고 있어, React 앱에서 처리해야 할 `/oauth/callback`도 백엔드로 가서 404 오류 발생

## 핵심 변경사항

### 기존 설정 (문제)
```nginx
# OAuth callback routes
location /oauth/ {
    proxy_pass http://maxlab_backend;  # 모든 /oauth/* 경로가 백엔드로
    include /etc/nginx/proxy_params;
}
```

### 수정된 설정 (해결)
```nginx
# OAuth API endpoints ONLY (백엔드에서 처리해야 하는 것들만)
location ~ ^/oauth/(token|revoke|userinfo|logout|validate-config)$ {
    proxy_pass http://maxlab_backend;
    include /etc/nginx/proxy_params;
}

# OAuth callback - React Router에서 처리 (중요!)
location /oauth/callback {
    try_files /index.html =404;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
}
```

## 적용 방법

### 1. 현재 설정 백업
```bash
sudo cp /etc/nginx/sites-available/maxlab /etc/nginx/sites-available/maxlab.backup.$(date +%Y%m%d)
```

### 2. maxlab.dwchem.co.kr 서버 블록만 수정
```bash
# nginx-production.conf 파일에서 maxlab.dwchem.co.kr 블록(line 252-371)을
# nginx-production-fixed.conf의 내용으로 교체

sudo nano /etc/nginx/sites-available/maxlab
# 또는
sudo vim /etc/nginx/sites-available/maxlab
```

### 3. 설정 테스트 및 적용
```bash
# 설정 테스트
sudo nginx -t

# 문제 없으면 reload
sudo systemctl reload nginx
```

## OAuth 경로 분류

### 백엔드에서 처리 (API)
- `/oauth/token` - 토큰 교환
- `/oauth/revoke` - 토큰 취소
- `/oauth/userinfo` - 사용자 정보 조회
- `/oauth/logout` - 로그아웃
- `/oauth/validate-config` - 설정 검증

### 프론트엔드에서 처리 (React)
- `/oauth/callback` - OAuth 인증 후 콜백 처리

## 테스트 확인

### 1. OAuth callback 접근 테스트
```bash
# 200 OK와 HTML이 반환되어야 함
curl -I https://maxlab.dwchem.co.kr/oauth/callback

# 실제 HTML 내용 확인
curl https://maxlab.dwchem.co.kr/oauth/callback | grep -o '<title>.*</title>'
```

### 2. OAuth API 엔드포인트 테스트
```bash
# 백엔드 API로 정상 프록시되는지 확인
curl -I https://maxlab.dwchem.co.kr/oauth/token
# 405 Method Not Allowed 또는 400 Bad Request가 정상 (GET 요청이므로)
```

### 3. 실제 OAuth 플로우 테스트
1. 브라우저에서 https://maxlab.dwchem.co.kr 접속
2. 로그인 클릭
3. OAuth 제공자에서 인증
4. `/oauth/callback`로 리다이렉트되어 정상 로그인 완료 확인

## 주의사항

### 1. location 블록 순서 중요
- 더 구체적인 경로가 먼저 와야 함
- `/oauth/callback`이 `/` 보다 위에 있어야 함

### 2. 정규표현식 location 사용
```nginx
location ~ ^/oauth/(token|revoke|userinfo|logout|validate-config)$
```
- `~` : 정규표현식 매칭
- `^` : 시작
- `$` : 끝
- 정확히 지정된 경로만 백엔드로 프록시

### 3. try_files 지시어
```nginx
try_files /index.html =404;
```
- React SPA를 위해 항상 index.html 반환
- 404는 index.html이 없을 때만 발생

## 롤백 방법
```bash
# 문제 발생 시 백업 복원
sudo cp /etc/nginx/sites-available/maxlab.backup.YYYYMMDD /etc/nginx/sites-available/maxlab
sudo nginx -t
sudo systemctl reload nginx
```

## 다른 도메인에도 동일 적용 필요

동일한 문제가 있을 수 있는 도메인:
- `max.dwchem.co.kr` (line 101-105)
- `devmax.dwchem.co.kr` (line 191-195)
- `devmaxlab.dwchem.co.kr` (line 415-419)

각 도메인도 동일한 방식으로 수정 필요