module.exports = {
  apps: [
    {
      name: 'maxlab-backend-8010',
      script: '/home/app-user/project/maxlab/backend/.venv/bin/python',
      args: '-m uvicorn app.main:app --host 127.0.0.1 --port 8010',
      cwd: '/home/app-user/project/maxlab/backend',
      instances: 1,
      exec_mode: 'fork',
      interpreter: 'none',
      env: {
        // 중요: ENVIRONMENT 변수 추가
        ENVIRONMENT: 'production',
        PORT: '8010',
        HOST: '127.0.0.1',
        DEBUG: 'False',
        NODE_ENV: 'production',
        PYTHONPATH: '/home/app-user/project/maxlab/backend',
        // production 환경 필수 설정
        DATABASE_URL: 'postgresql+asyncpg://postgres:2300@172.28.32.1:5432/max_lab',
        AUTH_SERVER_URL: 'http://localhost:8000',
        CLIENT_ID: 'maxlab',
        // 보안 키 (production용 - 실제 운영에서는 환경변수나 시크릿 관리 도구 사용)
        SECRET_KEY: '${SECRET_KEY}',
        JWT_SECRET_KEY: '${JWT_SECRET_KEY}',
        CSRF_SECRET_KEY: '${CSRF_SECRET_KEY}',
        SESSION_SECRET_KEY: '${SESSION_SECRET_KEY}',
        // Redis
        REDIS_URL: 'redis://localhost:6379/0',
        // CORS 설정
        BACKEND_CORS_ORIGINS: 'https://maxlab.chem.co.kr,https://www.maxlab.chem.co.kr,https://app.maxlab.chem.co.kr',
        // 정적 파일 설정
        SERVE_STATIC_FILES: 'False',  // production에서는 nginx가 처리
        STATIC_FILES_DIR: '/var/www/maxlab/static',
        // 로깅
        LOG_LEVEL: 'WARNING',
        LOG_FORMAT: 'json'
      },
      watch: false,
      max_memory_restart: '1G',
      error_file: '/home/app-user/project/maxlab/backend/logs/pm2-error-8010.log',
      out_file: '/home/app-user/project/maxlab/backend/logs/pm2-out-8010.log',
      log_file: '/home/app-user/project/maxlab/backend/logs/pm2-combined-8010.log',
      time: true,
      // 자동 재시작 설정
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      // 헬스체크
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000
    },
    {
      name: 'maxlab-backend-8011',
      script: '/home/app-user/project/maxlab/backend/.venv/bin/python',
      args: '-m uvicorn app.main:app --host 127.0.0.1 --port 8011',
      cwd: '/home/app-user/project/maxlab/backend',
      instances: 1,
      exec_mode: 'fork',
      interpreter: 'none',
      env: {
        // 중요: ENVIRONMENT 변수 추가
        ENVIRONMENT: 'production',
        PORT: '8011',
        HOST: '127.0.0.1',
        DEBUG: 'False',
        NODE_ENV: 'production',
        PYTHONPATH: '/home/app-user/project/maxlab/backend',
        // production 환경 필수 설정
        DATABASE_URL: 'postgresql+asyncpg://postgres:2300@172.28.32.1:5432/max_lab',
        AUTH_SERVER_URL: 'http://localhost:8000',
        CLIENT_ID: 'maxlab',
        // 보안 키 (production용 - 실제 운영에서는 환경변수나 시크릿 관리 도구 사용)
        SECRET_KEY: '${SECRET_KEY}',
        JWT_SECRET_KEY: '${JWT_SECRET_KEY}',
        CSRF_SECRET_KEY: '${CSRF_SECRET_KEY}',
        SESSION_SECRET_KEY: '${SESSION_SECRET_KEY}',
        // Redis
        REDIS_URL: 'redis://localhost:6379/0',
        // CORS 설정
        BACKEND_CORS_ORIGINS: 'https://maxlab.chem.co.kr,https://www.maxlab.chem.co.kr,https://app.maxlab.chem.co.kr',
        // 정적 파일 설정
        SERVE_STATIC_FILES: 'False',  // production에서는 nginx가 처리
        STATIC_FILES_DIR: '/var/www/maxlab/static',
        // 로깅
        LOG_LEVEL: 'WARNING',
        LOG_FORMAT: 'json'
      },
      watch: false,
      max_memory_restart: '1G',
      error_file: '/home/app-user/project/maxlab/backend/logs/pm2-error-8011.log',
      out_file: '/home/app-user/project/maxlab/backend/logs/pm2-out-8011.log',
      log_file: '/home/app-user/project/maxlab/backend/logs/pm2-combined-8011.log',
      time: true,
      // 자동 재시작 설정
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      // 헬스체크
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000
    },
    {
      name: 'maxlab-backend-8012',
      script: '/home/app-user/project/maxlab/backend/.venv/bin/python',
      args: '-m uvicorn app.main:app --host 127.0.0.1 --port 8012',
      cwd: '/home/app-user/project/maxlab/backend',
      instances: 1,
      exec_mode: 'fork',
      interpreter: 'none',
      env: {
        // 중요: ENVIRONMENT 변수 추가
        ENVIRONMENT: 'production',
        PORT: '8012',
        HOST: '127.0.0.1',
        DEBUG: 'False',
        NODE_ENV: 'production',
        PYTHONPATH: '/home/app-user/project/maxlab/backend',
        // production 환경 필수 설정
        DATABASE_URL: 'postgresql+asyncpg://postgres:2300@172.28.32.1:5432/max_lab',
        AUTH_SERVER_URL: 'http://localhost:8000',
        CLIENT_ID: 'maxlab',
        // 보안 키 (production용 - 실제 운영에서는 환경변수나 시크릿 관리 도구 사용)
        SECRET_KEY: '${SECRET_KEY}',
        JWT_SECRET_KEY: '${JWT_SECRET_KEY}',
        CSRF_SECRET_KEY: '${CSRF_SECRET_KEY}',
        SESSION_SECRET_KEY: '${SESSION_SECRET_KEY}',
        // Redis
        REDIS_URL: 'redis://localhost:6379/0',
        // CORS 설정
        BACKEND_CORS_ORIGINS: 'https://maxlab.chem.co.kr,https://www.maxlab.chem.co.kr,https://app.maxlab.chem.co.kr',
        // 정적 파일 설정
        SERVE_STATIC_FILES: 'False',  // production에서는 nginx가 처리
        STATIC_FILES_DIR: '/var/www/maxlab/static',
        // 로깅
        LOG_LEVEL: 'WARNING',
        LOG_FORMAT: 'json'
      },
      watch: false,
      max_memory_restart: '1G',
      error_file: '/home/app-user/project/maxlab/backend/logs/pm2-error-8012.log',
      out_file: '/home/app-user/project/maxlab/backend/logs/pm2-out-8012.log',
      log_file: '/home/app-user/project/maxlab/backend/logs/pm2-combined-8012.log',
      time: true,
      // 자동 재시작 설정
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      // 헬스체크
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000
    }
  ]
}