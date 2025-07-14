#!/usr/bin/env python3
"""
데이터베이스 SSL/TLS 보안 테스트 스크립트
"""
import asyncio
import sys
import os
from pathlib import Path

# 프로젝트 루트를 Python 경로에 추가
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from app.core.database import AsyncSessionLocal
from app.core.db_security import (
    security_manager,
    generate_ssl_certificate_self_signed,
    setup_postgresql_ssl
)
from app.core.config import settings
import logging

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

async def test_ssl_configuration():
    """SSL 설정 테스트"""
    logger.info("Testing SSL configuration...")
    
    async with AsyncSessionLocal() as session:
        try:
            # SSL 연결 상태 확인
            ssl_status = await security_manager.validate_ssl_connection(session)
            logger.info("=== SSL Connection Status ===")
            logger.info(f"SSL Enabled: {ssl_status.get('ssl_enabled', False)}")
            
            if ssl_status.get('ssl_enabled'):
                logger.info(f"Cipher: {ssl_status.get('cipher', 'Unknown')}")
                logger.info(f"Bits: {ssl_status.get('bits', 'Unknown')}")
                logger.info(f"Compression: {ssl_status.get('compression', 'Unknown')}")
            else:
                logger.warning("SSL is not enabled for database connection")
                if 'error' in ssl_status:
                    logger.error(f"SSL validation error: {ssl_status['error']}")
            
            # 데이터베이스 보안 상태 종합 조회
            security_status = await security_manager.get_database_security_status(session)
            
            logger.info("=== Database Security Status ===")
            
            # SSL 연결 통계
            ssl_conn_stats = security_status.get('security_status', {}).get('ssl_connections', [])
            if ssl_conn_stats and len(ssl_conn_stats) > 0:
                stats = ssl_conn_stats[0]
                total = stats.get('total_connections', 0)
                ssl_conns = stats.get('ssl_connections', 0)
                non_ssl = stats.get('non_ssl_connections', 0)
                
                logger.info(f"Total connections: {total}")
                logger.info(f"SSL connections: {ssl_conns}")
                logger.info(f"Non-SSL connections: {non_ssl}")
                
                if total > 0:
                    ssl_percentage = (ssl_conns / total) * 100
                    logger.info(f"SSL connection percentage: {ssl_percentage:.1f}%")
            
            # 암호화 설정
            encryption_settings = security_status.get('security_status', {}).get('encryption_settings', [])
            if encryption_settings:
                logger.info("=== Encryption Settings ===")
                for setting in encryption_settings:
                    name = setting.get('name', '')
                    value = setting.get('setting', '')
                    desc = setting.get('short_desc', '')
                    logger.info(f"{name}: {value} ({desc})")
            
            return ssl_status
            
        except Exception as e:
            logger.error(f"SSL configuration test failed: {e}")
            return {"ssl_enabled": False, "error": str(e)}

async def test_certificate_validation():
    """인증서 유효성 검증 테스트"""
    logger.info("Testing certificate validation...")
    
    # 설정된 인증서 경로 확인
    cert_paths_to_test = []
    
    if settings.DB_SSL_CERT_PATH:
        cert_paths_to_test.append(settings.DB_SSL_CERT_PATH)
    
    if settings.DB_SSL_CA_PATH:
        cert_paths_to_test.append(settings.DB_SSL_CA_PATH)
    
    if not cert_paths_to_test:
        logger.info("No SSL certificates configured for validation")
        return
    
    logger.info("=== Certificate Validation Results ===")
    
    for cert_path in cert_paths_to_test:
        logger.info(f"Validating certificate: {cert_path}")
        validation_result = security_manager.validate_certificate(cert_path)
        
        if validation_result.get('valid'):
            logger.info(f"✓ Certificate is valid")
            logger.info(f"  Subject: {validation_result.get('subject', 'Unknown')}")
            logger.info(f"  Issuer: {validation_result.get('issuer', 'Unknown')}")
            logger.info(f"  Valid until: {validation_result.get('not_after', 'Unknown')}")
            logger.info(f"  Days until expiry: {validation_result.get('days_until_expiry', 'Unknown')}")
            
            if validation_result.get('expiry_warning'):
                logger.warning(f"⚠ Certificate expires soon!")
        else:
            logger.error(f"✗ Certificate validation failed")
            if 'error' in validation_result:
                logger.error(f"  Error: {validation_result['error']}")

async def generate_dev_certificates():
    """개발용 자체 서명 인증서 생성"""
    logger.info("Generating development SSL certificates...")
    
    try:
        result = await generate_ssl_certificate_self_signed(
            hostname="localhost",
            output_dir="./ssl_certs"
        )
        
        if result.get('status') == 'success':
            logger.info("✓ Development certificates generated successfully")
            logger.info(f"Certificate: {result.get('certificate_path')}")
            logger.info(f"Private key: {result.get('private_key_path')}")
            logger.info(f"Valid until: {result.get('valid_until')}")
            
            logger.info("\nTo use these certificates, update your .env file:")
            logger.info(f"DB_SSL_MODE=require")
            logger.info(f"DB_SSL_CERT_PATH={result.get('certificate_path')}")
            logger.info(f"DB_SSL_KEY_PATH={result.get('private_key_path')}")
            
        else:
            logger.error(f"Certificate generation failed: {result.get('error')}")
            
    except Exception as e:
        logger.error(f"Failed to generate certificates: {e}")

async def show_ssl_setup_guide():
    """SSL 설정 가이드 출력"""
    logger.info("=== PostgreSQL SSL Setup Guide ===")
    guide = await setup_postgresql_ssl()
    print(guide)

async def main():
    """메인 테스트 함수"""
    logger.info("Starting SSL/TLS security test...")
    
    # 현재 설정 표시
    logger.info("=== Current SSL Configuration ===")
    logger.info(f"Database URL: {settings.DATABASE_URL}")
    logger.info(f"SSL Mode: {settings.DB_SSL_MODE}")
    logger.info(f"SSL Cert Path: {settings.DB_SSL_CERT_PATH or 'Not configured'}")
    logger.info(f"SSL Key Path: {settings.DB_SSL_KEY_PATH or 'Not configured'}")
    logger.info(f"SSL CA Path: {settings.DB_SSL_CA_PATH or 'Not configured'}")
    
    # SSL 연결 테스트
    ssl_status = await test_ssl_configuration()
    
    # 인증서 유효성 검증
    await test_certificate_validation()
    
    # 설정 가이드 표시
    await show_ssl_setup_guide()
    
    logger.info("SSL/TLS security test completed")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Database SSL/TLS security test script")
    parser.add_argument("--generate-certs", action="store_true", 
                       help="Generate development SSL certificates")
    parser.add_argument("--test-only", action="store_true",
                       help="Run SSL tests only without generating certificates")
    
    args = parser.parse_args()
    
    if args.generate_certs:
        asyncio.run(generate_dev_certificates())
    elif args.test_only:
        asyncio.run(test_ssl_configuration())
    else:
        asyncio.run(main())