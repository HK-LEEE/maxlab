#!/usr/bin/env python3
"""Circuit Breaker 상태 확인 및 리셋"""

import asyncio
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.circuit_breaker import CircuitBreaker

async def check_and_reset_circuit_breaker():
    """Circuit Breaker 상태 확인 및 리셋"""
    # OAuth Circuit Breaker 인스턴스 생성
    cb = CircuitBreaker(
        name="OAuth",
        failure_threshold=5,
        recovery_timeout=60,
        expected_exception=Exception
    )
    
    print(f"Circuit Breaker 이름: {cb.name}")
    print(f"현재 상태: {cb.state}")
    print(f"실패 횟수: {cb.failure_count}")
    print(f"마지막 실패 시간: {cb.last_failure_time}")
    
    if cb.state == "open":
        print("\nCircuit Breaker가 OPEN 상태입니다. 리셋합니다...")
        cb.reset()
        print(f"리셋 후 상태: {cb.state}")
        print(f"리셋 후 실패 횟수: {cb.failure_count}")
    else:
        print(f"\nCircuit Breaker가 {cb.state} 상태입니다.")

if __name__ == "__main__":
    asyncio.run(check_and_reset_circuit_breaker())