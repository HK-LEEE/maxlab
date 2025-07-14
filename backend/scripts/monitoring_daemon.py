#!/usr/bin/env python3
"""
데이터베이스 모니터링 데몬
지속적인 모니터링, 알림, 보고서 생성
"""
import asyncio
import sys
import os
import json
import signal
from datetime import datetime, timedelta
from pathlib import Path
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# 프로젝트 루트를 Python 경로에 추가
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from app.core.db_monitoring import db_monitor
from app.core.config import settings
import logging

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('monitoring_daemon.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class MonitoringDaemon:
    """모니터링 데몬 클래스"""
    
    def __init__(self):
        self.running = False
        self.monitoring_interval = 300  # 5분
        self.alert_interval = 600       # 10분
        self.report_interval = 3600     # 1시간
        
        # 알림 설정
        self.notification_config = {
            "email_enabled": False,
            "smtp_server": "localhost",
            "smtp_port": 587,
            "smtp_username": "",
            "smtp_password": "",
            "alert_recipients": [],
            "slack_webhook": None,
            "discord_webhook": None
        }
        
        # 알림 상태 추적
        self.last_alert_time = {}
        self.alert_cooldown = 1800  # 30분 쿨다운
        
    async def setup_monitoring_extensions(self):
        """모니터링 확장 초기화"""
        try:
            from app.core.database import AsyncSessionLocal
            
            async with AsyncSessionLocal() as session:
                extensions = await db_monitor.setup_monitoring_extensions(session)
                
                if extensions.get("pg_stat_statements"):
                    logger.info("✓ pg_stat_statements extension enabled")
                else:
                    logger.warning("✗ pg_stat_statements extension not available")
                
                if extensions.get("pg_buffercache"):
                    logger.info("✓ pg_buffercache extension enabled")
                else:
                    logger.info("○ pg_buffercache extension not available (optional)")
                
                return extensions
                
        except Exception as e:
            logger.error(f"Failed to setup monitoring extensions: {e}")
            return {}
    
    async def collect_and_analyze(self):
        """모니터링 데이터 수집 및 분석"""
        try:
            logger.info("Collecting monitoring data...")
            
            # 종합 보고서 생성
            report = await db_monitor.generate_comprehensive_report()
            
            # 보고서 저장
            await self.save_report(report)
            
            # 알림 확인 및 발송
            alerts = report.get("alerts", [])
            if alerts:
                await self.process_alerts(alerts, report)
            
            # 상태 로깅
            health_score = report.get("health_score", 0)
            connection_usage = report.get("connections", {}).get("usage_percent", 0)
            cache_hit_ratio = report.get("database_overview", {}).get("cache_hit_ratio", 0)
            
            logger.info(f"Health Score: {health_score}/100, "
                       f"Connections: {connection_usage:.1f}%, "
                       f"Cache Hit: {cache_hit_ratio:.1f}%, "
                       f"Alerts: {len(alerts)}")
            
            return report
            
        except Exception as e:
            logger.error(f"Failed to collect and analyze monitoring data: {e}")
            return None
    
    async def save_report(self, report: dict):
        """보고서 파일 저장"""
        try:
            reports_dir = Path("./monitoring_reports")
            reports_dir.mkdir(exist_ok=True)
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            report_file = reports_dir / f"monitoring_report_{timestamp}.json"
            
            with open(report_file, 'w') as f:
                json.dump(report, f, indent=2)
            
            # 오래된 보고서 정리 (7일 이상)
            cutoff_date = datetime.now() - timedelta(days=7)
            for old_file in reports_dir.glob("monitoring_report_*.json"):
                try:
                    file_date = datetime.strptime(old_file.stem.split("_")[-2] + "_" + old_file.stem.split("_")[-1], "%Y%m%d_%H%M%S")
                    if file_date < cutoff_date:
                        old_file.unlink()
                        logger.debug(f"Deleted old report: {old_file}")
                except Exception:
                    pass
            
        except Exception as e:
            logger.error(f"Failed to save monitoring report: {e}")
    
    async def process_alerts(self, alerts: list, report: dict):
        """알림 처리"""
        try:
            critical_alerts = [a for a in alerts if a.get("severity") == "critical"]
            warning_alerts = [a for a in alerts if a.get("severity") == "warning"]
            
            # Critical 알림은 즉시 발송
            for alert in critical_alerts:
                await self.send_alert(alert, report, force=True)
            
            # Warning 알림은 쿨다운 적용
            for alert in warning_alerts:
                await self.send_alert(alert, report, force=False)
            
        except Exception as e:
            logger.error(f"Failed to process alerts: {e}")
    
    async def send_alert(self, alert: dict, report: dict, force: bool = False):
        """알림 발송"""
        try:
            alert_type = alert.get("type", "unknown")
            current_time = datetime.now()
            
            # 쿨다운 확인 (force=True인 경우 무시)
            if not force and alert_type in self.last_alert_time:
                time_diff = current_time - self.last_alert_time[alert_type]
                if time_diff.total_seconds() < self.alert_cooldown:
                    logger.debug(f"Alert {alert_type} in cooldown, skipping")
                    return
            
            # 알림 메시지 생성
            message = self.format_alert_message(alert, report)
            
            # 다양한 채널로 알림 발송
            sent_channels = []
            
            # 이메일 알림
            if self.notification_config["email_enabled"]:
                if await self.send_email_alert(message, alert):
                    sent_channels.append("email")
            
            # 콘솔 로그
            severity = alert.get("severity", "info").upper()
            logger.warning(f"[{severity} ALERT] {alert.get('message', 'Unknown alert')}")
            sent_channels.append("console")
            
            # 알림 발송 시간 기록
            self.last_alert_time[alert_type] = current_time
            
            if sent_channels:
                logger.info(f"Alert sent via: {', '.join(sent_channels)}")
            
        except Exception as e:
            logger.error(f"Failed to send alert: {e}")
    
    def format_alert_message(self, alert: dict, report: dict) -> str:
        """알림 메시지 포맷팅"""
        severity = alert.get("severity", "info").upper()
        alert_type = alert.get("type", "unknown")
        message = alert.get("message", "Unknown alert")
        timestamp = alert.get("timestamp", datetime.now().isoformat())
        
        # 시스템 정보 추가
        health_score = report.get("health_score", 0)
        db_name = report.get("database_overview", {}).get("name", "unknown")
        
        formatted_message = f"""
🚨 MaxLab Database Alert - {severity}

Alert Type: {alert_type}
Message: {message}
Timestamp: {timestamp}

Database: {db_name}
Health Score: {health_score}/100

Current Status:
- Connections: {report.get('connections', {}).get('total_connections', 0)}/{report.get('connections', {}).get('max_connections', 0)} ({report.get('connections', {}).get('usage_percent', 0):.1f}%)
- Cache Hit Ratio: {report.get('database_overview', {}).get('cache_hit_ratio', 0):.1f}%
- Database Size: {report.get('database_overview', {}).get('size_gb', 0):.1f} GB
- Active Queries: {report.get('connections', {}).get('active_connections', 0)}
- Slow Queries: {len(report.get('query_performance', {}).get('slow_queries', []))}

System Resources:
- CPU Usage: {report.get('system_resources', {}).get('cpu', {}).get('usage_percent', 0):.1f}%
- Memory Usage: {report.get('system_resources', {}).get('memory', {}).get('used_percent', 0):.1f}%
- Disk Usage: {report.get('system_resources', {}).get('disk', {}).get('used_percent', 0):.1f}%

---
MaxLab Monitoring System
        """.strip()
        
        return formatted_message
    
    async def send_email_alert(self, message: str, alert: dict) -> bool:
        """이메일 알림 발송"""
        try:
            if not self.notification_config["alert_recipients"]:
                return False
            
            # 이메일 구성
            msg = MIMEMultipart()
            msg['From'] = self.notification_config["smtp_username"]
            msg['Subject'] = f"MaxLab Database Alert - {alert.get('severity', 'info').upper()}: {alert.get('type', 'unknown')}"
            
            msg.attach(MIMEText(message, 'plain'))
            
            # SMTP 연결 및 발송
            server = smtplib.SMTP(
                self.notification_config["smtp_server"],
                self.notification_config["smtp_port"]
            )
            server.starttls()
            server.login(
                self.notification_config["smtp_username"],
                self.notification_config["smtp_password"]
            )
            
            for recipient in self.notification_config["alert_recipients"]:
                msg['To'] = recipient
                server.send_message(msg)
                del msg['To']
            
            server.quit()
            logger.info(f"Email alert sent to {len(self.notification_config['alert_recipients'])} recipients")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send email alert: {e}")
            return False
    
    async def generate_daily_report(self):
        """일일 보고서 생성"""
        try:
            logger.info("Generating daily report...")
            
            # 24시간 히스토리 수집
            history = db_monitor.get_metrics_history(24)
            
            if not history:
                logger.warning("No historical data available for daily report")
                return
            
            # 통계 계산
            health_scores = [h.get("health_score", 0) for h in history]
            cache_ratios = [h.get("database_overview", {}).get("cache_hit_ratio", 0) for h in history]
            connection_usages = [h.get("connections", {}).get("usage_percent", 0) for h in history]
            
            daily_stats = {
                "date": datetime.now().strftime("%Y-%m-%d"),
                "period_hours": 24,
                "total_reports": len(history),
                "health_score": {
                    "average": sum(health_scores) / len(health_scores) if health_scores else 0,
                    "minimum": min(health_scores) if health_scores else 0,
                    "maximum": max(health_scores) if health_scores else 0
                },
                "cache_hit_ratio": {
                    "average": sum(cache_ratios) / len(cache_ratios) if cache_ratios else 0,
                    "minimum": min(cache_ratios) if cache_ratios else 0
                },
                "connection_usage": {
                    "average": sum(connection_usages) / len(connection_usages) if connection_usages else 0,
                    "maximum": max(connection_usages) if connection_usages else 0
                },
                "total_alerts": sum(len(h.get("alerts", [])) for h in history),
                "critical_alerts": sum(len([a for a in h.get("alerts", []) if a.get("severity") == "critical"]) for h in history)
            }
            
            # 보고서 저장
            reports_dir = Path("./monitoring_reports")
            reports_dir.mkdir(exist_ok=True)
            
            daily_report_file = reports_dir / f"daily_report_{datetime.now().strftime('%Y%m%d')}.json"
            with open(daily_report_file, 'w') as f:
                json.dump(daily_stats, f, indent=2)
            
            logger.info(f"Daily report saved: {daily_report_file}")
            
            # 요약 로그
            logger.info(f"Daily Summary - Health: {daily_stats['health_score']['average']:.1f}/100, "
                       f"Cache: {daily_stats['cache_hit_ratio']['average']:.1f}%, "
                       f"Alerts: {daily_stats['total_alerts']}")
            
            return daily_stats
            
        except Exception as e:
            logger.error(f"Failed to generate daily report: {e}")
            return None
    
    async def monitoring_loop(self):
        """메인 모니터링 루프"""
        logger.info("Starting monitoring loop...")
        self.running = True
        
        last_report_time = datetime.min
        last_daily_report_date = None
        
        while self.running:
            try:
                current_time = datetime.now()
                
                # 정기 모니터링 실행
                if (current_time - last_report_time).total_seconds() >= self.monitoring_interval:
                    await self.collect_and_analyze()
                    last_report_time = current_time
                
                # 일일 보고서 생성 (매일 자정)
                current_date = current_time.date()
                if last_daily_report_date != current_date and current_time.hour == 0:
                    await self.generate_daily_report()
                    last_daily_report_date = current_date
                
                # 대기
                await asyncio.sleep(60)  # 1분마다 체크
                
            except asyncio.CancelledError:
                logger.info("Monitoring loop cancelled")
                break
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}")
                await asyncio.sleep(60)
    
    def stop(self):
        """모니터링 중지"""
        logger.info("Stopping monitoring daemon...")
        self.running = False

# 전역 데몬 인스턴스
monitoring_daemon = MonitoringDaemon()

def setup_signal_handlers():
    """시그널 핸들러 설정"""
    def signal_handler(signum, frame):
        logger.info(f"Received signal {signum}, shutting down...")
        monitoring_daemon.stop()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

async def main():
    """메인 함수"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Database monitoring daemon")
    parser.add_argument("--setup", action="store_true", help="Setup monitoring extensions")
    parser.add_argument("--check", action="store_true", help="Run single monitoring check")
    parser.add_argument("--report", action="store_true", help="Generate daily report")
    parser.add_argument("--daemon", action="store_true", help="Run as daemon")
    parser.add_argument("--interval", type=int, default=300, help="Monitoring interval in seconds")
    
    args = parser.parse_args()
    
    # 모니터링 간격 설정
    if args.interval:
        monitoring_daemon.monitoring_interval = args.interval
        logger.info(f"Monitoring interval set to {args.interval} seconds")
    
    try:
        if args.setup:
            # 확장 설정
            extensions = await monitoring_daemon.setup_monitoring_extensions()
            logger.info(f"Setup completed: {extensions}")
            
        elif args.check:
            # 단일 모니터링 체크
            report = await monitoring_daemon.collect_and_analyze()
            if report:
                print(json.dumps({
                    "health_score": report.get("health_score", 0),
                    "alerts": len(report.get("alerts", [])),
                    "timestamp": report.get("report_timestamp")
                }, indent=2))
            
        elif args.report:
            # 일일 보고서 생성
            daily_report = await monitoring_daemon.generate_daily_report()
            if daily_report:
                print(json.dumps(daily_report, indent=2))
            
        elif args.daemon:
            # 데몬 모드
            setup_signal_handlers()
            await monitoring_daemon.setup_monitoring_extensions()
            await monitoring_daemon.monitoring_loop()
            
        else:
            # 기본: 단일 체크
            await monitoring_daemon.collect_and_analyze()
            
    except KeyboardInterrupt:
        logger.info("Operation interrupted by user")
    except Exception as e:
        logger.error(f"Operation failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())