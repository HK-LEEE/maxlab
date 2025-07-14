#!/bin/bash
# MaxLab 데이터베이스 백업 Cron 설정 스크립트
# 
# 사용법:
# ./backup_cron.sh install   # cron 작업 설치
# ./backup_cron.sh remove    # cron 작업 제거
# ./backup_cron.sh status    # cron 작업 상태 확인

set -e

# 설정
PROJECT_ROOT="/home/lee/proejct/maxlab/backend"
BACKUP_SCRIPT="$PROJECT_ROOT/scripts/backup_scheduler.py"
LOG_FILE="$PROJECT_ROOT/logs/backup_cron.log"
PYTHON_ENV="$PROJECT_ROOT/.venv/bin/python"

# 로그 디렉토리 생성
mkdir -p "$(dirname "$LOG_FILE")"

# Cron 작업 정의
CRON_JOB="0 2 * * * cd $PROJECT_ROOT && $PYTHON_ENV $BACKUP_SCRIPT --backup >> $LOG_FILE 2>&1"
CLEANUP_JOB="0 3 * * 0 cd $PROJECT_ROOT && $PYTHON_ENV $BACKUP_SCRIPT --cleanup >> $LOG_FILE 2>&1"

install_cron() {
    echo "Installing MaxLab backup cron jobs..."
    
    # 기존 cron 작업 백업
    crontab -l > /tmp/crontab_backup_$(date +%Y%m%d_%H%M%S) 2>/dev/null || echo "No existing crontab"
    
    # 현재 crontab 가져오기
    current_cron=$(crontab -l 2>/dev/null || echo "")
    
    # MaxLab 백업 작업이 이미 있는지 확인
    if echo "$current_cron" | grep -q "backup_scheduler.py"; then
        echo "MaxLab backup cron jobs already exist. Removing old jobs..."
        # 기존 MaxLab 백업 작업 제거
        echo "$current_cron" | grep -v "backup_scheduler.py" | crontab -
        current_cron=$(crontab -l 2>/dev/null || echo "")
    fi
    
    # 새로운 cron 작업 추가
    {
        echo "$current_cron"
        echo ""
        echo "# MaxLab Database Backup Jobs"
        echo "# Daily backup at 2:00 AM"
        echo "$CRON_JOB"
        echo "# Weekly cleanup on Sunday at 3:00 AM"
        echo "$CLEANUP_JOB"
    } | crontab -
    
    echo "Cron jobs installed successfully!"
    echo "Daily backup: 2:00 AM"
    echo "Weekly cleanup: Sunday 3:00 AM"
    echo "Log file: $LOG_FILE"
}

remove_cron() {
    echo "Removing MaxLab backup cron jobs..."
    
    # 현재 crontab 가져오기
    current_cron=$(crontab -l 2>/dev/null || echo "")
    
    if echo "$current_cron" | grep -q "backup_scheduler.py"; then
        # MaxLab 백업 작업 제거
        echo "$current_cron" | grep -v "backup_scheduler.py" | grep -v "MaxLab Database Backup" | crontab -
        echo "Cron jobs removed successfully!"
    else
        echo "No MaxLab backup cron jobs found."
    fi
}

status_cron() {
    echo "=== MaxLab Backup Cron Status ==="
    
    # Cron 서비스 상태
    if systemctl is-active --quiet cron 2>/dev/null || systemctl is-active --quiet crond 2>/dev/null; then
        echo "✓ Cron service is running"
    else
        echo "✗ Cron service is not running"
    fi
    
    # Cron 작업 확인
    current_cron=$(crontab -l 2>/dev/null || echo "")
    if echo "$current_cron" | grep -q "backup_scheduler.py"; then
        echo "✓ MaxLab backup cron jobs are installed"
        echo ""
        echo "Installed jobs:"
        echo "$current_cron" | grep -A1 -B1 "backup_scheduler.py"
    else
        echo "✗ MaxLab backup cron jobs are not installed"
    fi
    
    # 로그 파일 확인
    if [ -f "$LOG_FILE" ]; then
        echo ""
        echo "✓ Log file exists: $LOG_FILE"
        echo "Last 5 lines:"
        tail -5 "$LOG_FILE" 2>/dev/null || echo "Log file is empty"
    else
        echo "✗ Log file not found: $LOG_FILE"
    fi
    
    # 백업 스크립트 확인
    if [ -x "$BACKUP_SCRIPT" ]; then
        echo "✓ Backup script is executable: $BACKUP_SCRIPT"
    else
        echo "✗ Backup script not found or not executable: $BACKUP_SCRIPT"
    fi
    
    # Python 환경 확인
    if [ -x "$PYTHON_ENV" ]; then
        echo "✓ Python environment found: $PYTHON_ENV"
    else
        echo "✗ Python environment not found: $PYTHON_ENV"
    fi
}

test_backup() {
    echo "Testing backup script..."
    
    if [ ! -x "$BACKUP_SCRIPT" ]; then
        echo "Error: Backup script not found or not executable: $BACKUP_SCRIPT"
        exit 1
    fi
    
    if [ ! -x "$PYTHON_ENV" ]; then
        echo "Error: Python environment not found: $PYTHON_ENV"
        exit 1
    fi
    
    echo "Running backup status check..."
    cd "$PROJECT_ROOT"
    "$PYTHON_ENV" "$BACKUP_SCRIPT" --status
    
    echo ""
    echo "Backup script test completed successfully!"
}

# 메인 로직
case "${1:-}" in
    install)
        install_cron
        ;;
    remove)
        remove_cron
        ;;
    status)
        status_cron
        ;;
    test)
        test_backup
        ;;
    *)
        echo "Usage: $0 {install|remove|status|test}"
        echo ""
        echo "Commands:"
        echo "  install  - Install MaxLab backup cron jobs"
        echo "  remove   - Remove MaxLab backup cron jobs"
        echo "  status   - Show cron jobs status"
        echo "  test     - Test backup script"
        echo ""
        echo "Cron Schedule:"
        echo "  Daily backup: 2:00 AM"
        echo "  Weekly cleanup: Sunday 3:00 AM"
        exit 1
        ;;
esac