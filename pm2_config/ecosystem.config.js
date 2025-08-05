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
        PORT: '8010',  // 중요: 각 인스턴스마다 다른 포트 지정
        HOST: '127.0.0.1',
        DEBUG: 'False',
        NODE_ENV: 'production',
        PYTHONPATH: '/home/app-user/project/maxlab/backend'
      },
      watch: false,
      max_memory_restart: '1G',
      error_file: '/home/app-user/project/maxlab/backend/logs/pm2-error-8010.log',
      out_file: '/home/app-user/project/maxlab/backend/logs/pm2-out-8010.log',
      log_file: '/home/app-user/project/maxlab/backend/logs/pm2-combined-8010.log',
      time: true
    },
    {
      name: 'maxlab-backend-8011',
      script: '/home/app-user/project/maxlab/backend/.venv/bin/python',
      args: '-m uvicorn app.main:app --host 127.0.0.1 --port 8011',
      cwd: '/home/app-user/project/maxlab/backend/',
      instances: 1,
      exec_mode: 'fork',
      interpreter: 'none',
      env: {
        PORT: '8011',  // 중요: 각 인스턴스마다 다른 포트 지정
        HOST: '127.0.0.1',
        DEBUG: 'False',
        NODE_ENV: 'production',
        PYTHONPATH: '/home/app-user/project/maxlab/backend'
      },
      watch: false,
      max_memory_restart: '1G',
      error_file: '/home/app-user/project/maxlab/backend/logs/pm2-error-8011.log',
      out_file: '/home/app-user/project/maxlab/backend/logs/pm2-out-8011.log',
      log_file: '/home/app-user/project/maxlab/backend/logs/pm2-combined-8011.log',
      time: true
    },
    {
      name: 'maxlab-backend-8012',
      script: '/home/app-user/project/maxlab/backend/.venv/bin/python',
      args: '-m uvicorn app.main:app --host 127.0.0.1 --port 8012',
      cwd: '/home/app-user/project/maxlab/backend/',
      instances: 1,
      exec_mode: 'fork',
      interpreter: 'none',
      env: {
        PORT: '8012',  // 중요: 각 인스턴스마다 다른 포트 지정
        HOST: '127.0.0.1',
        DEBUG: 'False',
        NODE_ENV: 'production',
        PYTHONPATH: '/home/app-user/project/maxlab/backend'
      },
      watch: false,
      max_memory_restart: '1G',
      error_file: '/home/app-user/project/maxlab/backend/logs/pm2-error-8012.log',
      out_file: '/home/app-user/project/maxlab/backend/logs/pm2-out-8012.log',
      log_file: '/home/app-user/project/maxlab/backend/logs/pm2-combined-8012.log',
      time: true
    }
  ]
}
