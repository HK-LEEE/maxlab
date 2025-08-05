#!/usr/bin/env python3
"""
암호화된 데이터 복구 스크립트
여러 암호화 키로 시도하여 데이터를 복구하고 현재 키로 재암호화합니다.
"""
import asyncio
import logging
import base64
from cryptography.fernet import Fernet
from sqlalchemy import select, text
from app.core.database import get_async_session
from app.core.security import get_or_create_encryption_key

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 가능한 모든 암호화 키들 (이전에 사용되었던 키들)
POSSIBLE_KEYS = [
    "TH6_-mkyZxAEHQOKH1qYY-zQjr4f0H5bPmTC5_2u0qc=",  # 현재 .env에 있는 키
    "NNSTRgpOKG4rtA2JAOIZjVJH2csy2Pu7y3NvqY_awJg=",
    "_I_Y8Gz3_bDFADp8pCkkdzke0s5TMsB02LHWhsqctyE=",
    "ujZQkR63aZ9VL-lNZRHZFcqfEU-fSF0FSWmf-d6_3M4="
]


async def try_decrypt_with_keys(encrypted_value: str, possible_keys: list) -> tuple[str, str]:
    """
    여러 키로 복호화 시도
    
    Returns:
        tuple: (decrypted_value, successful_key) or (None, None)
    """
    if not encrypted_value:
        return None, None
    
    for key_str in possible_keys:
        try:
            f = Fernet(key_str.encode())
            # Base64 디코딩 후 복호화 시도
            encrypted_bytes = base64.b64decode(encrypted_value.encode())
            decrypted = f.decrypt(encrypted_bytes)
            logger.info(f"✅ 복호화 성공 with key ending in ...{key_str[-8:]}")
            return decrypted.decode(), key_str
        except Exception as e:
            # 이 키로는 복호화 실패, 다음 키 시도
            continue
    
    # 모든 키로 실패한 경우, 암호화되지 않은 값으로 간주
    logger.warning("⚠️  모든 키로 복호화 실패, 평문으로 간주")
    return encrypted_value, None


async def recover_data_sources():
    """data_sources 테이블의 암호화된 데이터 복구"""
    
    async for session in get_async_session():
        try:
            # 현재 사용할 암호화 키
            current_key_bytes = get_or_create_encryption_key()
            current_key_str = current_key_bytes.decode() if isinstance(current_key_bytes, bytes) else current_key_bytes
            current_fernet = Fernet(current_key_str.encode() if isinstance(current_key_str, str) else current_key_str)
            
            logger.info(f"🔑 현재 암호화 키: ...{current_key_str[-8:]}")
            
            # 모든 데이터 소스 조회
            result = await session.execute(
                text("""
                    SELECT id, workspace_id, source_type, 
                           connection_string, mssql_connection_string, api_key
                    FROM data_sources
                    WHERE connection_string IS NOT NULL 
                       OR mssql_connection_string IS NOT NULL 
                       OR api_key IS NOT NULL
                """)
            )
            
            data_sources = result.fetchall()
            logger.info(f"📊 총 {len(data_sources)}개의 데이터 소스 발견")
            
            recovered_count = 0
            failed_count = 0
            
            for ds in data_sources:
                logger.info(f"\n🔄 데이터 소스 ID {ds.id} 처리 중 (workspace: {ds.workspace_id}, type: {ds.source_type})")
                updates = {}
                
                # connection_string 복구
                if ds.connection_string:
                    decrypted, used_key = await try_decrypt_with_keys(ds.connection_string, POSSIBLE_KEYS)
                    if decrypted and used_key and used_key != current_key_str:
                        # 다른 키로 복호화 성공한 경우, 현재 키로 재암호화
                        new_encrypted = base64.b64encode(
                            current_fernet.encrypt(decrypted.encode())
                        ).decode()
                        updates['connection_string'] = new_encrypted
                        logger.info(f"  ✅ connection_string 재암호화 완료")
                
                # mssql_connection_string 복구
                if ds.mssql_connection_string:
                    decrypted, used_key = await try_decrypt_with_keys(ds.mssql_connection_string, POSSIBLE_KEYS)
                    if decrypted and used_key and used_key != current_key_str:
                        # 다른 키로 복호화 성공한 경우, 현재 키로 재암호화
                        new_encrypted = base64.b64encode(
                            current_fernet.encrypt(decrypted.encode())
                        ).decode()
                        updates['mssql_connection_string'] = new_encrypted
                        logger.info(f"  ✅ mssql_connection_string 재암호화 완료")
                
                # api_key 복구
                if ds.api_key:
                    decrypted, used_key = await try_decrypt_with_keys(ds.api_key, POSSIBLE_KEYS)
                    if decrypted and used_key and used_key != current_key_str:
                        # 다른 키로 복호화 성공한 경우, 현재 키로 재암호화
                        new_encrypted = base64.b64encode(
                            current_fernet.encrypt(decrypted.encode())
                        ).decode()
                        updates['api_key'] = new_encrypted
                        logger.info(f"  ✅ api_key 재암호화 완료")
                
                # 업데이트 실행
                if updates:
                    try:
                        set_clause = ", ".join([f"{k} = :{k}" for k in updates.keys()])
                        await session.execute(
                            text(f"UPDATE data_sources SET {set_clause} WHERE id = :id"),
                            {**updates, 'id': ds.id}
                        )
                        await session.commit()
                        recovered_count += 1
                        logger.info(f"  ✅ 데이터 소스 ID {ds.id} 복구 완료")
                    except Exception as e:
                        await session.rollback()
                        failed_count += 1
                        logger.error(f"  ❌ 데이터 소스 ID {ds.id} 업데이트 실패: {e}")
                else:
                    logger.info(f"  ℹ️  데이터 소스 ID {ds.id}는 이미 현재 키로 암호화되어 있거나 복구 불필요")
            
            logger.info(f"\n📊 복구 완료:")
            logger.info(f"  - 성공: {recovered_count}개")
            logger.info(f"  - 실패: {failed_count}개")
            logger.info(f"  - 변경 없음: {len(data_sources) - recovered_count - failed_count}개")
            
        except Exception as e:
            logger.error(f"❌ 복구 프로세스 오류: {e}")
            await session.rollback()
        finally:
            await session.close()


async def test_current_encryption():
    """현재 암호화 키 테스트"""
    try:
        current_key_bytes = get_or_create_encryption_key()
        current_key_str = current_key_bytes.decode() if isinstance(current_key_bytes, bytes) else current_key_bytes
        
        logger.info(f"\n🔑 현재 암호화 키 테스트:")
        logger.info(f"  - 키 끝부분: ...{current_key_str[-8:]}")
        
        # 테스트 암호화/복호화
        test_string = "Test connection string"
        f = Fernet(current_key_str.encode() if isinstance(current_key_str, str) else current_key_str)
        
        encrypted = base64.b64encode(f.encrypt(test_string.encode())).decode()
        decrypted = f.decrypt(base64.b64decode(encrypted)).decode()
        
        if test_string == decrypted:
            logger.info("  ✅ 암호화/복호화 테스트 성공")
        else:
            logger.error("  ❌ 암호화/복호화 테스트 실패")
            
    except Exception as e:
        logger.error(f"❌ 암호화 테스트 오류: {e}")


async def main():
    """메인 실행 함수"""
    logger.info("🚀 암호화 데이터 복구 시작...")
    
    # 현재 암호화 키 테스트
    await test_current_encryption()
    
    # 데이터 복구 실행
    await recover_data_sources()
    
    logger.info("\n✅ 복구 프로세스 완료")


if __name__ == "__main__":
    asyncio.run(main())