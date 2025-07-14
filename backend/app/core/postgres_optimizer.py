"""
PostgreSQL 프로덕션 설정 최적화 유틸리티
시스템 리소스 기반 자동 PostgreSQL 설정 생성
"""
import os
import psutil
import platform
import logging
from typing import Dict, Any, Tuple, Optional
from dataclasses import dataclass
from pathlib import Path
import subprocess

logger = logging.getLogger(__name__)

@dataclass
class SystemInfo:
    """시스템 정보"""
    total_memory_gb: float
    available_memory_gb: float
    cpu_cores: int
    cpu_threads: int
    platform: str
    disk_io_type: str  # SSD, HDD
    postgres_version: str

class PostgreSQLOptimizer:
    """PostgreSQL 설정 최적화"""
    
    def __init__(self):
        self.system_info = self._analyze_system()
        self.optimization_rules = self._load_optimization_rules()
    
    def _analyze_system(self) -> SystemInfo:
        """시스템 리소스 분석"""
        try:
            # 메모리 정보
            memory = psutil.virtual_memory()
            total_memory_gb = memory.total / (1024**3)
            available_memory_gb = memory.available / (1024**3)
            
            # CPU 정보
            cpu_cores = psutil.cpu_count(logical=False)
            cpu_threads = psutil.cpu_count(logical=True)
            
            # 플랫폼 정보
            platform_info = platform.platform()
            
            # 디스크 타입 감지 (간단한 휴리스틱)
            disk_io_type = self._detect_disk_type()
            
            # PostgreSQL 버전 감지
            postgres_version = self._detect_postgres_version()
            
            system_info = SystemInfo(
                total_memory_gb=total_memory_gb,
                available_memory_gb=available_memory_gb,
                cpu_cores=cpu_cores,
                cpu_threads=cpu_threads,
                platform=platform_info,
                disk_io_type=disk_io_type,
                postgres_version=postgres_version
            )
            
            logger.info(f"System analysis completed: {system_info}")
            return system_info
            
        except Exception as e:
            logger.error(f"System analysis failed: {e}")
            # 기본값 반환
            return SystemInfo(
                total_memory_gb=8.0,
                available_memory_gb=6.0,
                cpu_cores=4,
                cpu_threads=8,
                platform="Unknown",
                disk_io_type="SSD",
                postgres_version="15"
            )
    
    def _detect_disk_type(self) -> str:
        """디스크 타입 감지"""
        try:
            # Linux에서 /sys/block을 통한 SSD 감지
            if platform.system() == "Linux":
                for disk in os.listdir("/sys/block"):
                    if disk.startswith(("sd", "nvme")):
                        rotational_file = f"/sys/block/{disk}/queue/rotational"
                        if os.path.exists(rotational_file):
                            with open(rotational_file, 'r') as f:
                                if f.read().strip() == "0":
                                    return "SSD"
                return "HDD"
            else:
                # 다른 OS의 경우 기본값
                return "SSD"
        except Exception as e:
            logger.warning(f"Could not detect disk type: {e}")
            return "SSD"
    
    def _detect_postgres_version(self) -> str:
        """PostgreSQL 버전 감지"""
        try:
            result = subprocess.run(
                ["psql", "--version"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                version_line = result.stdout.strip()
                # "psql (PostgreSQL) 15.4" 형태에서 버전 추출
                parts = version_line.split()
                for part in parts:
                    if part.replace(".", "").isdigit():
                        return part.split(".")[0]  # 메이저 버전만 반환
            return "15"  # 기본값
        except Exception as e:
            logger.warning(f"Could not detect PostgreSQL version: {e}")
            return "15"
    
    def _load_optimization_rules(self) -> Dict[str, Any]:
        """최적화 규칙 로드"""
        return {
            "memory_ratios": {
                "shared_buffers": 0.25,      # 총 메모리의 25%
                "work_mem_per_connection": 0.004,  # 커넥션당 메모리
                "maintenance_work_mem": 0.05,      # 유지보수 작업 메모리
                "effective_cache_size": 0.75       # OS 캐시 포함 유효 캐시
            },
            "connection_limits": {
                "max_connections_per_core": 25,
                "min_max_connections": 100,
                "max_max_connections": 500
            },
            "checkpoint_settings": {
                "checkpoint_completion_target": 0.9,
                "wal_buffers_mb": 16,
                "min_wal_size_mb": 1024,
                "max_wal_size_mb": 4096
            }
        }
    
    def calculate_optimal_settings(self) -> Dict[str, Any]:
        """최적화된 PostgreSQL 설정 계산"""
        settings = {}
        
        # 메모리 설정
        memory_settings = self._calculate_memory_settings()
        settings.update(memory_settings)
        
        # 연결 설정
        connection_settings = self._calculate_connection_settings()
        settings.update(connection_settings)
        
        # 체크포인트 설정
        checkpoint_settings = self._calculate_checkpoint_settings()
        settings.update(checkpoint_settings)
        
        # 로깅 설정
        logging_settings = self._calculate_logging_settings()
        settings.update(logging_settings)
        
        # 성능 설정
        performance_settings = self._calculate_performance_settings()
        settings.update(performance_settings)
        
        # WAL 설정
        wal_settings = self._calculate_wal_settings()
        settings.update(wal_settings)
        
        return settings
    
    def _calculate_memory_settings(self) -> Dict[str, Any]:
        """메모리 관련 설정 계산"""
        total_memory_mb = self.system_info.total_memory_gb * 1024
        
        # shared_buffers: 총 메모리의 25%
        shared_buffers_mb = int(total_memory_mb * self.optimization_rules["memory_ratios"]["shared_buffers"])
        shared_buffers_mb = max(128, min(shared_buffers_mb, 8192))  # 128MB ~ 8GB 범위
        
        # work_mem: 커넥션당 작업 메모리
        max_connections = 200  # 임시값, 나중에 계산됨
        work_mem_mb = int(total_memory_mb * self.optimization_rules["memory_ratios"]["work_mem_per_connection"])
        work_mem_mb = max(4, min(work_mem_mb, 1024))  # 4MB ~ 1GB 범위
        
        # maintenance_work_mem: 유지보수 작업 메모리
        maintenance_work_mem_mb = int(total_memory_mb * self.optimization_rules["memory_ratios"]["maintenance_work_mem"])
        maintenance_work_mem_mb = max(64, min(maintenance_work_mem_mb, 2048))  # 64MB ~ 2GB 범위
        
        # effective_cache_size: OS 캐시 포함 유효 캐시
        effective_cache_size_mb = int(total_memory_mb * self.optimization_rules["memory_ratios"]["effective_cache_size"])
        
        return {
            "shared_buffers": f"{shared_buffers_mb}MB",
            "work_mem": f"{work_mem_mb}MB",
            "maintenance_work_mem": f"{maintenance_work_mem_mb}MB",
            "effective_cache_size": f"{effective_cache_size_mb}MB",
            "random_page_cost": 1.1 if self.system_info.disk_io_type == "SSD" else 4.0,
            "seq_page_cost": 1.0
        }
    
    def _calculate_connection_settings(self) -> Dict[str, Any]:
        """연결 관련 설정 계산"""
        # CPU 코어 기반 최대 연결 수
        max_connections = self.system_info.cpu_cores * self.optimization_rules["connection_limits"]["max_connections_per_core"]
        max_connections = max(
            self.optimization_rules["connection_limits"]["min_max_connections"],
            min(max_connections, self.optimization_rules["connection_limits"]["max_max_connections"])
        )
        
        return {
            "max_connections": max_connections,
            "superuser_reserved_connections": 3,
            "unix_socket_directories": "'/var/run/postgresql'",
            "unix_socket_permissions": "0777"
        }
    
    def _calculate_checkpoint_settings(self) -> Dict[str, Any]:
        """체크포인트 관련 설정 계산"""
        rules = self.optimization_rules["checkpoint_settings"]
        
        return {
            "checkpoint_completion_target": rules["checkpoint_completion_target"],
            "checkpoint_timeout": "5min",
            "checkpoint_warning": "30s",
            "wal_buffers": f"{rules['wal_buffers_mb']}MB",
            "min_wal_size": f"{rules['min_wal_size_mb']}MB",
            "max_wal_size": f"{rules['max_wal_size_mb']}MB"
        }
    
    def _calculate_logging_settings(self) -> Dict[str, Any]:
        """로깅 관련 설정 계산"""
        return {
            "log_destination": "'stderr'",
            "logging_collector": "on",
            "log_directory": "'log'",
            "log_filename": "'postgresql-%Y-%m-%d_%H%M%S.log'",
            "log_file_mode": "0600",
            "log_rotation_age": "1d",
            "log_rotation_size": "100MB",
            "log_truncate_on_rotation": "off",
            "log_min_messages": "warning",
            "log_min_error_statement": "error",
            "log_min_duration_statement": "1000",  # 1초 이상 쿼리 로깅
            "log_checkpoints": "on",
            "log_connections": "off",
            "log_disconnections": "off",
            "log_lock_waits": "on",
            "log_statement": "'ddl'",
            "log_temp_files": "10MB",
            "log_autovacuum_min_duration": "0",
            "log_error_verbosity": "default",
            "log_hostname": "off",
            "log_line_prefix": "'%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '"
        }
    
    def _calculate_performance_settings(self) -> Dict[str, Any]:
        """성능 관련 설정 계산"""
        return {
            # 쿼리 플래너
            "default_statistics_target": 100,
            "constraint_exclusion": "partition",
            "cursor_tuple_fraction": 0.1,
            "from_collapse_limit": 8,
            "join_collapse_limit": 8,
            
            # 백그라운드 프로세스
            "bgwriter_delay": "200ms",
            "bgwriter_lru_maxpages": 100,
            "bgwriter_lru_multiplier": 2.0,
            "bgwriter_flush_after": "512kB",
            
            # 동시성
            "max_worker_processes": self.system_info.cpu_threads,
            "max_parallel_workers": self.system_info.cpu_threads,
            "max_parallel_workers_per_gather": min(4, self.system_info.cpu_cores),
            "max_parallel_maintenance_workers": min(4, self.system_info.cpu_cores),
            
            # 기타
            "enable_partitionwise_join": "on",
            "enable_partitionwise_aggregate": "on",
            "jit": "off",  # 안정성을 위해 비활성화
            "track_activity_query_size": 2048,
            "track_functions": "pl",
            "track_io_timing": "on"
        }
    
    def _calculate_wal_settings(self) -> Dict[str, Any]:
        """WAL 관련 설정 계산"""
        return {
            "wal_level": "replica",
            "wal_sync_method": "fsync",
            "synchronous_commit": "on",
            "wal_compression": "on",
            "wal_writer_delay": "200ms",
            "wal_writer_flush_after": "1MB",
            "commit_delay": 0,
            "commit_siblings": 5
        }
    
    def generate_postgresql_conf(self, output_file: Optional[str] = None) -> str:
        """postgresql.conf 파일 생성"""
        settings = self.calculate_optimal_settings()
        
        conf_content = self._generate_conf_header()
        
        # 설정 섹션별로 그룹화
        sections = {
            "CONNECTION AND AUTHENTICATION": [
                "max_connections", "superuser_reserved_connections",
                "unix_socket_directories", "unix_socket_permissions"
            ],
            "RESOURCE USAGE (except WAL)": [
                "shared_buffers", "work_mem", "maintenance_work_mem",
                "effective_cache_size", "max_worker_processes",
                "max_parallel_workers", "max_parallel_workers_per_gather",
                "max_parallel_maintenance_workers"
            ],
            "WRITE-AHEAD LOG": [
                "wal_level", "wal_sync_method", "synchronous_commit",
                "wal_compression", "wal_buffers", "wal_writer_delay",
                "wal_writer_flush_after", "commit_delay", "commit_siblings",
                "checkpoint_completion_target", "checkpoint_timeout",
                "checkpoint_warning", "min_wal_size", "max_wal_size"
            ],
            "QUERY TUNING": [
                "random_page_cost", "seq_page_cost", "default_statistics_target",
                "constraint_exclusion", "cursor_tuple_fraction",
                "from_collapse_limit", "join_collapse_limit"
            ],
            "REPORTING AND LOGGING": [
                "log_destination", "logging_collector", "log_directory",
                "log_filename", "log_file_mode", "log_rotation_age",
                "log_rotation_size", "log_truncate_on_rotation",
                "log_min_messages", "log_min_error_statement",
                "log_min_duration_statement", "log_checkpoints",
                "log_connections", "log_disconnections", "log_lock_waits",
                "log_statement", "log_temp_files", "log_autovacuum_min_duration",
                "log_error_verbosity", "log_hostname", "log_line_prefix"
            ],
            "RUNTIME STATISTICS": [
                "track_activity_query_size", "track_functions", "track_io_timing"
            ],
            "BACKGROUND WRITER": [
                "bgwriter_delay", "bgwriter_lru_maxpages",
                "bgwriter_lru_multiplier", "bgwriter_flush_after"
            ],
            "ADVANCED FEATURES": [
                "enable_partitionwise_join", "enable_partitionwise_aggregate", "jit"
            ]
        }
        
        for section_name, setting_names in sections.items():
            conf_content += f"\n#------------------------------------------------------------------------------\n"
            conf_content += f"# {section_name}\n"
            conf_content += f"#------------------------------------------------------------------------------\n\n"
            
            for setting_name in setting_names:
                if setting_name in settings:
                    value = settings[setting_name]
                    if isinstance(value, str) and not value.startswith("'"):
                        # 문자열 값에 따옴표가 없으면 추가
                        if not value.replace(".", "").replace("MB", "").replace("GB", "").replace("ms", "").replace("min", "").replace("s", "").replace("kB", "").isdigit():
                            if not (value in ["on", "off"] or value.startswith("'")):
                                value = f"'{value}'"
                    
                    conf_content += f"{setting_name} = {value}\n"
            
            conf_content += "\n"
        
        # 파일 저장
        if output_file:
            output_path = Path(output_file)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, 'w') as f:
                f.write(conf_content)
            logger.info(f"PostgreSQL configuration saved to: {output_path}")
        
        return conf_content
    
    def _generate_conf_header(self) -> str:
        """설정 파일 헤더 생성"""
        from datetime import datetime
        
        return f"""# -----------------------------
# PostgreSQL configuration file
# Generated by MaxLab PostgreSQL Optimizer
# Generated on: {datetime.now().isoformat()}
# -----------------------------
#
# System Information:
# - Total Memory: {self.system_info.total_memory_gb:.1f} GB
# - CPU Cores: {self.system_info.cpu_cores} (Threads: {self.system_info.cpu_threads})
# - Disk Type: {self.system_info.disk_io_type}
# - PostgreSQL Version: {self.system_info.postgres_version}
# - Platform: {self.system_info.platform}
#
# This file consists of lines of the form:
#
#   name = value
#
# (The '=' is optional.)  Whitespace may be used.  Comments are introduced with
# '#' anywhere on a line.  The complete list of parameter names and allowed
# values can be found in the PostgreSQL documentation.
#
# IMPORTANT: You must restart PostgreSQL for these changes to take effect.
#

"""
    
    def generate_tuning_report(self) -> Dict[str, Any]:
        """튜닝 보고서 생성"""
        settings = self.calculate_optimal_settings()
        
        return {
            "system_info": {
                "total_memory_gb": self.system_info.total_memory_gb,
                "available_memory_gb": self.system_info.available_memory_gb,
                "cpu_cores": self.system_info.cpu_cores,
                "cpu_threads": self.system_info.cpu_threads,
                "platform": self.system_info.platform,
                "disk_type": self.system_info.disk_io_type,
                "postgres_version": self.system_info.postgres_version
            },
            "optimized_settings": settings,
            "recommendations": [
                "Restart PostgreSQL after applying configuration changes",
                "Monitor query performance after configuration changes",
                "Consider enabling query logging for performance analysis",
                "Set up regular VACUUM and ANALYZE schedules",
                "Monitor connection usage and adjust max_connections if needed",
                "Review and tune work_mem based on actual query workload",
                "Consider partitioning for large tables",
                "Set up pg_stat_statements extension for query analysis"
            ],
            "tuning_rationale": {
                "shared_buffers": f"Set to 25% of total memory ({settings['shared_buffers']}) for optimal caching",
                "work_mem": f"Configured per connection ({settings['work_mem']}) based on available memory and max_connections",
                "maintenance_work_mem": f"Set to {settings['maintenance_work_mem']} for efficient maintenance operations",
                "max_connections": f"Limited to {settings['max_connections']} based on CPU cores and memory constraints",
                "random_page_cost": f"Set to {settings['random_page_cost']} optimized for {self.system_info.disk_io_type}",
                "checkpoint_completion_target": "Set to 0.9 to spread checkpoint I/O over time"
            }
        }

# 전역 옵티마이저 인스턴스
postgres_optimizer = PostgreSQLOptimizer()