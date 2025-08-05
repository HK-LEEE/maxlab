#!/usr/bin/env python3
"""
암호화 키 수정 테스트 스크립트
"""
import os
import sys
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv(override=True)

# 경로 설정
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.security import get_or_create_encryption_key, encrypt_connection_string, decrypt_connection_string

def test_encryption():
    """암호화 기능 테스트"""
    print("🔧 암호화 키 테스트 시작...")
    
    # 1. 환경 변수 확인
    env_key = os.getenv("ENCRYPTION_KEY")
    print(f"\n📋 환경 변수 ENCRYPTION_KEY: {'설정됨' if env_key else '없음'}")
    if env_key:
        print(f"   - 키 끝부분: ...{env_key[-8:]}")
    
    # 2. get_or_create_encryption_key 테스트
    print("\n🔑 get_or_create_encryption_key() 테스트:")
    key_bytes = get_or_create_encryption_key()
    key_str = key_bytes.decode() if isinstance(key_bytes, bytes) else key_bytes
    print(f"   - 반환된 키 끝부분: ...{key_str[-8:]}")
    print(f"   - 환경 변수와 일치: {'✅ 예' if env_key == key_str else '❌ 아니오'}")
    
    # 3. 암호화/복호화 테스트
    print("\n🔐 암호화/복호화 테스트:")
    test_strings = [
        "postgresql://user:password@localhost/db",
        "DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost;DATABASE=test;UID=sa;PWD=password",
        "my-secret-api-key-12345"
    ]
    
    for test_str in test_strings:
        print(f"\n   테스트 문자열: {test_str[:30]}...")
        
        # 암호화
        encrypted = encrypt_connection_string(test_str)
        print(f"   암호화됨: {encrypted[:50]}..." if encrypted else "   암호화 실패")
        
        # 복호화
        if encrypted:
            decrypted = decrypt_connection_string(encrypted)
            success = decrypted == test_str
            print(f"   복호화 성공: {'✅' if success else '❌'}")
            if not success:
                print(f"   예상: {test_str}")
                print(f"   실제: {decrypted}")
    
    # 4. .env 파일 중복 확인
    print("\n📄 .env 파일 확인:")
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            lines = f.readlines()
        
        encryption_key_lines = [i+1 for i, line in enumerate(lines) if line.strip().startswith("ENCRYPTION_KEY=")]
        print(f"   - ENCRYPTION_KEY 발견 위치: {encryption_key_lines}")
        print(f"   - 개수: {len(encryption_key_lines)}개")
        
        if len(encryption_key_lines) > 1:
            print("   ⚠️  경고: 중복된 ENCRYPTION_KEY가 있습니다!")
        elif len(encryption_key_lines) == 1:
            print("   ✅ 정상: ENCRYPTION_KEY가 하나만 있습니다.")
        else:
            print("   ❌ 오류: ENCRYPTION_KEY가 없습니다!")
    
    print("\n✅ 테스트 완료")


if __name__ == "__main__":
    test_encryption()