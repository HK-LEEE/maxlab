#!/usr/bin/env python3
"""
PostgreSQL 설정 최적화 스크립트
시스템 리소스 기반 자동 PostgreSQL 설정 생성 및 적용
"""
import asyncio
import sys
import os
import json
import shutil
from pathlib import Path
from datetime import datetime

# 프로젝트 루트를 Python 경로에 추가
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from app.core.postgres_optimizer import postgres_optimizer
import logging

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

async def analyze_system():
    """시스템 분석 실행"""
    logger.info("Analyzing system resources...")
    
    system_info = postgres_optimizer.system_info
    
    print("=== System Analysis ===")
    print(f"Total Memory: {system_info.total_memory_gb:.1f} GB")
    print(f"Available Memory: {system_info.available_memory_gb:.1f} GB")
    print(f"CPU Cores: {system_info.cpu_cores}")
    print(f"CPU Threads: {system_info.cpu_threads}")
    print(f"Platform: {system_info.platform}")
    print(f"Disk Type: {system_info.disk_io_type}")
    print(f"PostgreSQL Version: {system_info.postgres_version}")
    
    return system_info

async def generate_configuration():
    """최적화된 PostgreSQL 설정 생성"""
    logger.info("Generating optimized PostgreSQL configuration...")
    
    # 설정 디렉토리 생성
    config_dir = Path("./postgresql_configs")
    config_dir.mkdir(exist_ok=True)
    
    # 현재 시간으로 파일명 생성
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    config_file = config_dir / f"postgresql_optimized_{timestamp}.conf"
    
    # 설정 파일 생성
    conf_content = postgres_optimizer.generate_postgresql_conf(str(config_file))
    
    print(f"✓ Optimized configuration generated: {config_file}")
    
    # 설정 요약 표시
    settings = postgres_optimizer.calculate_optimal_settings()
    print("\n=== Key Settings ===")
    print(f"shared_buffers = {settings['shared_buffers']}")
    print(f"work_mem = {settings['work_mem']}")
    print(f"maintenance_work_mem = {settings['maintenance_work_mem']}")
    print(f"effective_cache_size = {settings['effective_cache_size']}")
    print(f"max_connections = {settings['max_connections']}")
    print(f"random_page_cost = {settings['random_page_cost']}")
    
    return config_file

async def generate_tuning_report():
    """튜닝 보고서 생성"""
    logger.info("Generating tuning report...")
    
    report = postgres_optimizer.generate_tuning_report()
    
    # 보고서 파일 저장
    report_dir = Path("./postgresql_configs")
    report_dir.mkdir(exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_file = report_dir / f"tuning_report_{timestamp}.json"
    
    with open(report_file, 'w') as f:
        json.dump(report, f, indent=2)
    
    print(f"✓ Tuning report generated: {report_file}")
    
    # 보고서 요약 표시
    print("\n=== Tuning Report Summary ===")
    
    print(f"\nSystem Information:")
    sys_info = report['system_info']
    print(f"  Memory: {sys_info['total_memory_gb']:.1f} GB")
    print(f"  CPU: {sys_info['cpu_cores']} cores / {sys_info['cpu_threads']} threads")
    print(f"  Disk: {sys_info['disk_type']}")
    print(f"  PostgreSQL: {sys_info['postgres_version']}")
    
    print(f"\nKey Recommendations:")
    for rec in report['recommendations'][:5]:  # 상위 5개만 표시
        print(f"  • {rec}")
    
    print(f"\nTuning Rationale:")
    for setting, rationale in list(report['tuning_rationale'].items())[:3]:
        print(f"  • {setting}: {rationale}")
    
    return report_file

async def backup_current_config():
    """현재 PostgreSQL 설정 백업"""
    logger.info("Backing up current PostgreSQL configuration...")
    
    # 일반적인 PostgreSQL 설정 파일 위치들
    possible_config_paths = [
        "/etc/postgresql/*/main/postgresql.conf",
        "/var/lib/postgresql/data/postgresql.conf",
        "/usr/local/pgsql/data/postgresql.conf",
        "/opt/postgresql/*/data/postgresql.conf"
    ]
    
    backup_dir = Path("./postgresql_configs/backups")
    backup_dir.mkdir(parents=True, exist_ok=True)
    
    import glob
    
    for pattern in possible_config_paths:
        config_files = glob.glob(pattern)
        for config_file in config_files:
            config_path = Path(config_file)
            if config_path.exists():
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                backup_file = backup_dir / f"postgresql_backup_{timestamp}.conf"
                
                try:
                    shutil.copy2(config_path, backup_file)
                    print(f"✓ Backed up: {config_path} -> {backup_file}")
                    return backup_file
                except PermissionError:
                    print(f"⚠ Permission denied accessing: {config_path}")
                except Exception as e:
                    print(f"⚠ Failed to backup {config_path}: {e}")
    
    print("⚠ No PostgreSQL configuration files found for backup")
    return None

async def compare_configurations(current_config: str, optimized_config: str):
    """설정 파일 비교"""
    logger.info("Comparing configurations...")
    
    if not Path(current_config).exists():
        print("⚠ Current configuration file not found for comparison")
        return
    
    print("\n=== Configuration Comparison ===")
    print(f"Current config: {current_config}")
    print(f"Optimized config: {optimized_config}")
    
    # 간단한 설정 추출 및 비교
    def extract_settings(config_file):
        settings = {}
        try:
            with open(config_file, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, value = line.split('=', 1)
                        settings[key.strip()] = value.strip()
        except Exception as e:
            logger.error(f"Failed to parse {config_file}: {e}")
        return settings
    
    current_settings = extract_settings(current_config)
    optimized_settings = extract_settings(optimized_config)
    
    # 주요 설정 비교
    key_settings = [
        'shared_buffers', 'work_mem', 'maintenance_work_mem',
        'effective_cache_size', 'max_connections', 'random_page_cost'
    ]
    
    print("\nKey Setting Changes:")
    for setting in key_settings:
        current_val = current_settings.get(setting, "Not set")
        optimized_val = optimized_settings.get(setting, "Not set")
        
        if current_val != optimized_val:
            print(f"  {setting}:")
            print(f"    Current:   {current_val}")
            print(f"    Optimized: {optimized_val}")

async def validate_configuration(config_file: str):
    """설정 파일 검증"""
    logger.info(f"Validating configuration: {config_file}")
    
    if not Path(config_file).exists():
        print(f"✗ Configuration file not found: {config_file}")
        return False
    
    print(f"\n=== Configuration Validation ===")
    
    # 기본 파일 검증
    try:
        with open(config_file, 'r') as f:
            lines = f.readlines()
        
        print(f"✓ File readable: {len(lines)} lines")
        
        # 설정 파싱 검증
        settings_count = 0
        errors = []
        
        for i, line in enumerate(lines, 1):
            line = line.strip()
            if line and not line.startswith('#'):
                if '=' in line:
                    settings_count += 1
                    key, value = line.split('=', 1)
                    key = key.strip()
                    value = value.strip()
                    
                    # 기본 검증
                    if not key:
                        errors.append(f"Line {i}: Empty setting name")
                    if not value:
                        errors.append(f"Line {i}: Empty setting value")
        
        print(f"✓ Settings found: {settings_count}")
        
        if errors:
            print("✗ Validation errors:")
            for error in errors:
                print(f"  {error}")
            return False
        else:
            print("✓ Configuration validation passed")
            return True
            
    except Exception as e:
        print(f"✗ Validation failed: {e}")
        return False

async def show_installation_instructions(config_file: str):
    """설치 지침 표시"""
    print(f"\n=== Installation Instructions ===")
    print(f"Generated configuration: {config_file}")
    print()
    print("To apply the optimized configuration:")
    print()
    print("1. Stop PostgreSQL service:")
    print("   sudo systemctl stop postgresql")
    print()
    print("2. Backup current configuration:")
    print("   sudo cp /etc/postgresql/*/main/postgresql.conf /etc/postgresql/*/main/postgresql.conf.backup")
    print()
    print("3. Copy optimized configuration:")
    print(f"   sudo cp {config_file} /etc/postgresql/*/main/postgresql.conf")
    print()
    print("4. Verify configuration syntax:")
    print("   sudo -u postgres postgres --check-config")
    print()
    print("5. Start PostgreSQL service:")
    print("   sudo systemctl start postgresql")
    print()
    print("6. Verify settings are applied:")
    print("   sudo -u postgres psql -c \"SHOW ALL;\" | grep -E '(shared_buffers|work_mem|max_connections)'")
    print()
    print("⚠ Important Notes:")
    print("  • Test in a development environment first")
    print("  • Monitor performance after changes")
    print("  • Adjust settings based on actual workload")
    print("  • Some settings require PostgreSQL restart")

async def main():
    """메인 함수"""
    import argparse
    
    parser = argparse.ArgumentParser(description="PostgreSQL configuration optimizer")
    parser.add_argument("--analyze", action="store_true", help="Analyze system resources")
    parser.add_argument("--generate", action="store_true", help="Generate optimized configuration")
    parser.add_argument("--report", action="store_true", help="Generate tuning report")
    parser.add_argument("--backup", action="store_true", help="Backup current configuration")
    parser.add_argument("--validate", type=str, help="Validate configuration file")
    parser.add_argument("--compare", nargs=2, metavar=("CURRENT", "OPTIMIZED"), 
                       help="Compare two configuration files")
    parser.add_argument("--all", action="store_true", help="Run complete optimization process")
    
    args = parser.parse_args()
    
    try:
        if args.analyze:
            await analyze_system()
            
        elif args.generate:
            config_file = await generate_configuration()
            await show_installation_instructions(config_file)
            
        elif args.report:
            await generate_tuning_report()
            
        elif args.backup:
            await backup_current_config()
            
        elif args.validate:
            await validate_configuration(args.validate)
            
        elif args.compare:
            await compare_configurations(args.compare[0], args.compare[1])
            
        elif args.all:
            # 전체 최적화 프로세스 실행
            print("=== PostgreSQL Optimization Process ===")
            
            # 1. 시스템 분석
            await analyze_system()
            
            # 2. 현재 설정 백업
            backup_file = await backup_current_config()
            
            # 3. 최적화된 설정 생성
            config_file = await generate_configuration()
            
            # 4. 튜닝 보고서 생성
            report_file = await generate_tuning_report()
            
            # 5. 설정 검증
            await validate_configuration(config_file)
            
            # 6. 설정 비교 (백업 파일이 있는 경우)
            if backup_file:
                await compare_configurations(backup_file, config_file)
            
            # 7. 설치 지침 표시
            await show_installation_instructions(config_file)
            
        else:
            # 기본: 시스템 분석
            await analyze_system()
            
    except KeyboardInterrupt:
        logger.info("Operation interrupted by user")
    except Exception as e:
        logger.error(f"Operation failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())