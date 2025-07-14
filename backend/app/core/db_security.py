"""
데이터베이스 보안 관련 유틸리티
SSL/TLS 인증서 관리, 보안 연결 모니터링
"""
import ssl
import socket
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Tuple
from pathlib import Path
import cryptography
from cryptography import x509
from cryptography.hazmat.backends import default_backend
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

class DatabaseSecurityManager:
    """데이터베이스 보안 관리 클래스"""
    
    def __init__(self):
        self.certificate_expiry_warning_days = 30
    
    async def validate_ssl_connection(self, session: AsyncSession) -> Dict[str, Any]:
        """SSL 연결 상태 검증"""
        try:
            # PostgreSQL SSL 상태 확인 쿼리
            ssl_status_query = """
            SELECT 
                ssl,
                cipher,
                bits,
                compression,
                version()
            FROM pg_stat_ssl 
            WHERE pid = pg_backend_pid();
            """
            
            result = await session.execute(text(ssl_status_query))
            ssl_info = result.fetchone()
            
            if ssl_info:
                return {
                    "ssl_enabled": ssl_info[0],
                    "cipher": ssl_info[1],
                    "bits": ssl_info[2],
                    "compression": ssl_info[3],
                    "postgres_version": ssl_info[4],
                    "validation_time": datetime.now().isoformat()
                }
            else:
                return {
                    "ssl_enabled": False,
                    "error": "Could not retrieve SSL status",
                    "validation_time": datetime.now().isoformat()
                }
                
        except Exception as e:
            logger.error(f"SSL validation failed: {e}")
            return {
                "ssl_enabled": False,
                "error": str(e),
                "validation_time": datetime.now().isoformat()
            }
    
    def validate_certificate(self, cert_path: str) -> Dict[str, Any]:
        """SSL 인증서 유효성 검증"""
        try:
            cert_file = Path(cert_path)
            if not cert_file.exists():
                return {
                    "valid": False,
                    "error": f"Certificate file not found: {cert_path}"
                }
            
            with open(cert_path, 'rb') as f:
                cert_data = f.read()
            
            # PEM 또는 DER 형식 감지
            try:
                cert = x509.load_pem_x509_certificate(cert_data, default_backend())
            except ValueError:
                try:
                    cert = x509.load_der_x509_certificate(cert_data, default_backend())
                except ValueError as e:
                    return {
                        "valid": False,
                        "error": f"Invalid certificate format: {e}"
                    }
            
            # 인증서 정보 추출
            now = datetime.now()
            not_before = cert.not_valid_before
            not_after = cert.not_valid_after
            
            # 유효성 검사
            is_valid = not_before <= now <= not_after
            days_until_expiry = (not_after - now).days
            
            # 경고 상태 확인
            warning = days_until_expiry <= self.certificate_expiry_warning_days
            
            return {
                "valid": is_valid,
                "not_before": not_before.isoformat(),
                "not_after": not_after.isoformat(),
                "days_until_expiry": days_until_expiry,
                "expiry_warning": warning,
                "subject": str(cert.subject),
                "issuer": str(cert.issuer),
                "serial_number": str(cert.serial_number),
                "signature_algorithm": cert.signature_algorithm_oid._name,
                "validation_time": now.isoformat()
            }
            
        except Exception as e:
            logger.error(f"Certificate validation failed: {e}")
            return {
                "valid": False,
                "error": str(e),
                "validation_time": datetime.now().isoformat()
            }
    
    async def test_ssl_connection(self, host: str, port: int, timeout: int = 10) -> Dict[str, Any]:
        """SSL 연결 테스트"""
        try:
            # SSL 컨텍스트 생성
            context = ssl.create_default_context()
            
            # 소켓 연결 시도
            with socket.create_connection((host, port), timeout=timeout) as sock:
                with context.wrap_socket(sock, server_hostname=host) as ssock:
                    # SSL 연결 정보 수집
                    cipher = ssock.cipher()
                    cert = ssock.getpeercert()
                    protocol = ssock.version()
                    
                    return {
                        "connection_successful": True,
                        "protocol": protocol,
                        "cipher_suite": cipher[0] if cipher else None,
                        "cipher_version": cipher[1] if cipher else None,
                        "cipher_bits": cipher[2] if cipher else None,
                        "server_certificate": {
                            "subject": dict(x[0] for x in cert.get('subject', [])),
                            "issuer": dict(x[0] for x in cert.get('issuer', [])),
                            "version": cert.get('version'),
                            "serial_number": cert.get('serialNumber'),
                            "not_before": cert.get('notBefore'),
                            "not_after": cert.get('notAfter'),
                        } if cert else None,
                        "test_time": datetime.now().isoformat()
                    }
                    
        except ssl.SSLError as e:
            return {
                "connection_successful": False,
                "ssl_error": str(e),
                "test_time": datetime.now().isoformat()
            }
        except socket.error as e:
            return {
                "connection_successful": False,
                "socket_error": str(e),
                "test_time": datetime.now().isoformat()
            }
        except Exception as e:
            return {
                "connection_successful": False,
                "error": str(e),
                "test_time": datetime.now().isoformat()
            }
    
    async def get_database_security_status(self, session: AsyncSession) -> Dict[str, Any]:
        """데이터베이스 보안 상태 종합 조회"""
        security_queries = {
            "ssl_connections": """
                SELECT 
                    COUNT(*) as total_connections,
                    COUNT(CASE WHEN ssl THEN 1 END) as ssl_connections,
                    COUNT(CASE WHEN NOT ssl THEN 1 END) as non_ssl_connections
                FROM pg_stat_ssl;
            """,
            
            "authentication_methods": """
                SELECT DISTINCT 
                    type,
                    database,
                    user_name,
                    address,
                    auth_method
                FROM pg_hba_file_rules 
                WHERE type = 'host'
                ORDER BY line_number;
            """,
            
            "encryption_settings": """
                SELECT 
                    name,
                    setting,
                    context,
                    short_desc
                FROM pg_settings 
                WHERE name IN (
                    'ssl', 'ssl_ca_file', 'ssl_cert_file', 'ssl_key_file',
                    'ssl_ciphers', 'ssl_crl_file', 'ssl_dh_params_file',
                    'password_encryption', 'krb_server_keyfile'
                );
            """
        }
        
        results = {}
        
        for query_name, query in security_queries.items():
            try:
                result = await session.execute(text(query))
                results[query_name] = [dict(row._mapping) for row in result.fetchall()]
            except Exception as e:
                logger.warning(f"Failed to execute {query_name} query: {e}")
                results[query_name] = {"error": str(e)}
        
        return {
            "security_status": results,
            "assessment_time": datetime.now().isoformat()
        }

# 전역 보안 관리자 인스턴스
security_manager = DatabaseSecurityManager()

async def generate_ssl_certificate_self_signed(
    hostname: str = "localhost",
    output_dir: str = "./ssl_certs"
) -> Dict[str, str]:
    """자체 서명 SSL 인증서 생성 (개발 환경용)"""
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.x509.oid import NameOID
        import ipaddress
        
        # 출력 디렉토리 생성
        cert_dir = Path(output_dir)
        cert_dir.mkdir(exist_ok=True)
        
        # 개인키 생성
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
            backend=default_backend()
        )
        
        # 인증서 정보 설정
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, "KR"),
            x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "Seoul"),
            x509.NameAttribute(NameOID.LOCALITY_NAME, "Seoul"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "MaxLab"),
            x509.NameAttribute(NameOID.COMMON_NAME, hostname),
        ])
        
        # 인증서 생성
        certificate = x509.CertificateBuilder().subject_name(
            subject
        ).issuer_name(
            issuer
        ).public_key(
            private_key.public_key()
        ).serial_number(
            x509.random_serial_number()
        ).not_valid_before(
            datetime.now()
        ).not_valid_after(
            datetime.now() + timedelta(days=365)
        ).add_extension(
            x509.SubjectAlternativeName([
                x509.DNSName(hostname),
                x509.DNSName("localhost"),
                x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
            ]),
            critical=False,
        ).add_extension(
            x509.KeyUsage(
                digital_signature=True,
                key_encipherment=True,
                key_agreement=False,
                key_cert_sign=False,
                crl_sign=False,
                content_commitment=False,
                data_encipherment=False,
                encipher_only=False,
                decipher_only=False
            ),
            critical=True,
        ).add_extension(
            x509.ExtendedKeyUsage([
                x509.oid.ExtendedKeyUsageOID.SERVER_AUTH,
                x509.oid.ExtendedKeyUsageOID.CLIENT_AUTH,
            ]),
            critical=True,
        ).sign(private_key, hashes.SHA256(), default_backend())
        
        # 파일 경로 설정
        cert_file = cert_dir / f"{hostname}.crt"
        key_file = cert_dir / f"{hostname}.key"
        
        # 인증서 파일 저장
        with open(cert_file, "wb") as f:
            f.write(certificate.public_bytes(serialization.Encoding.PEM))
        
        # 개인키 파일 저장
        with open(key_file, "wb") as f:
            f.write(private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption()
            ))
        
        # 파일 권한 설정 (보안 강화)
        cert_file.chmod(0o644)
        key_file.chmod(0o600)
        
        logger.info(f"Self-signed certificate generated: {cert_file}")
        logger.info(f"Private key generated: {key_file}")
        
        return {
            "certificate_path": str(cert_file),
            "private_key_path": str(key_file),
            "hostname": hostname,
            "valid_from": datetime.now().isoformat(),
            "valid_until": (datetime.now() + timedelta(days=365)).isoformat(),
            "status": "success"
        }
        
    except Exception as e:
        logger.error(f"Failed to generate SSL certificate: {e}")
        return {
            "status": "error",
            "error": str(e)
        }

async def setup_postgresql_ssl():
    """PostgreSQL SSL 설정 가이드"""
    instructions = """
    PostgreSQL SSL 설정 가이드:
    
    1. PostgreSQL 설정 파일 (postgresql.conf) 수정:
       ssl = on
       ssl_cert_file = 'server.crt'
       ssl_key_file = 'server.key'
       ssl_ca_file = 'ca.crt'  # (선택사항)
       
    2. 클라이언트 인증 설정 (pg_hba.conf):
       # SSL 연결만 허용
       hostssl all all 0.0.0.0/0 md5
       
       # 인증서 기반 인증
       hostssl all all 0.0.0.0/0 cert
       
    3. MaxLab 환경 변수 설정:
       DB_SSL_MODE=require
       DB_SSL_CERT_PATH=/path/to/client.crt
       DB_SSL_KEY_PATH=/path/to/client.key
       DB_SSL_CA_PATH=/path/to/ca.crt
    
    4. PostgreSQL 재시작 필요
    """
    
    return instructions