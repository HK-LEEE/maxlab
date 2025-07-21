#!/usr/bin/env python3
"""
OAuth 플로우 통합 테스트
완전한 OAuth 인증 플로우를 테스트합니다.
"""
import asyncio
import aiohttp
import time
import json
from typing import Dict, Optional, Tuple
from datetime import datetime


class OAuthFlowTester:
    """OAuth 플로우 테스터"""
    
    def __init__(self, base_url: str = "http://localhost:8010", auth_server_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.auth_server_url = auth_server_url
        self.results = []
        
    async def test_health_check(self) -> Dict:
        """헬스 체크 테스트"""
        print("\n🔍 Testing Health Check...")
        start_time = time.time()
        
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(f"{self.base_url}/") as response:
                    data = await response.json()
                    elapsed = (time.time() - start_time) * 1000
                    
                    result = {
                        "test": "Health Check",
                        "status": "PASS" if response.status == 200 else "FAIL",
                        "response_time": f"{elapsed:.2f}ms",
                        "details": data
                    }
                    
                    if response.status == 200:
                        print(f"✅ Health Check: OK ({elapsed:.2f}ms)")
                    else:
                        print(f"❌ Health Check: Failed (Status: {response.status})")
                    
                    return result
                    
            except Exception as e:
                return {
                    "test": "Health Check",
                    "status": "ERROR",
                    "error": str(e)
                }
    
    async def test_unauthorized_access(self) -> Dict:
        """인증되지 않은 접근 테스트"""
        print("\n🔍 Testing Unauthorized Access...")
        
        async with aiohttp.ClientSession() as session:
            try:
                # 인증 없이 보호된 엔드포인트 접근
                async with session.get(f"{self.base_url}/api/v1/workspaces") as response:
                    data = await response.json()
                    
                    result = {
                        "test": "Unauthorized Access",
                        "status": "PASS" if response.status in [401, 403] else "FAIL",
                        "expected_status": "401 or 403",
                        "actual_status": response.status,
                        "error_code": data.get("error_code"),
                        "details": data
                    }
                    
                    if response.status in [401, 403]:
                        print(f"✅ Unauthorized Access: Correctly blocked (Status: {response.status})")
                        if data.get("error_code"):
                            print(f"   Error Code: {data.get('error_code')}")
                    else:
                        print(f"❌ Unauthorized Access: Unexpected response (Status: {response.status})")
                    
                    return result
                    
            except Exception as e:
                return {
                    "test": "Unauthorized Access",
                    "status": "ERROR",
                    "error": str(e)
                }
    
    async def test_oauth_login_flow(self, test_token: Optional[str] = None) -> Tuple[Dict, Optional[str]]:
        """OAuth 로그인 플로우 테스트"""
        print("\n🔍 Testing OAuth Login Flow...")
        
        if test_token:
            # 테스트 토큰이 제공된 경우
            print(f"   Using provided test token: {test_token[:20]}...")
            return {
                "test": "OAuth Login Flow",
                "status": "SIMULATED",
                "token": test_token,
                "message": "Using provided test token"
            }, test_token
        
        # 실제 OAuth 플로우는 브라우저 상호작용이 필요하므로 시뮬레이션
        print("   ⚠️  OAuth flow requires browser interaction - simulating...")
        return {
            "test": "OAuth Login Flow",
            "status": "SIMULATED",
            "message": "OAuth flow requires browser interaction"
        }, None
    
    async def test_authenticated_access(self, token: str) -> Dict:
        """인증된 접근 테스트"""
        print("\n🔍 Testing Authenticated Access...")
        start_time = time.time()
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json"
        }
        
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(
                    f"{self.base_url}/api/v1/workspaces",
                    headers=headers
                ) as response:
                    elapsed = (time.time() - start_time) * 1000
                    
                    if response.status == 200:
                        data = await response.json()
                        result = {
                            "test": "Authenticated Access",
                            "status": "PASS",
                            "response_time": f"{elapsed:.2f}ms",
                            "workspaces_count": len(data.get("items", [])),
                            "details": {
                                "total": data.get("total", 0),
                                "has_pagination": "page" in data
                            }
                        }
                        print(f"✅ Authenticated Access: Success ({elapsed:.2f}ms, {result['workspaces_count']} workspaces)")
                    else:
                        data = await response.json()
                        result = {
                            "test": "Authenticated Access",
                            "status": "FAIL",
                            "response_time": f"{elapsed:.2f}ms",
                            "status_code": response.status,
                            "error": data
                        }
                        print(f"❌ Authenticated Access: Failed (Status: {response.status})")
                    
                    return result
                    
            except Exception as e:
                return {
                    "test": "Authenticated Access",
                    "status": "ERROR",
                    "error": str(e)
                }
    
    async def test_user_groups_mapping(self, token: str) -> Dict:
        """사용자/그룹 매핑 테스트"""
        print("\n🔍 Testing User/Group Mapping...")
        start_time = time.time()
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json"
        }
        
        async with aiohttp.ClientSession() as session:
            try:
                # 현재 사용자 정보 가져오기
                async with session.get(
                    f"{self.base_url}/api/v1/users/me",
                    headers=headers
                ) as response:
                    elapsed = (time.time() - start_time) * 1000
                    
                    if response.status == 200:
                        data = await response.json()
                        result = {
                            "test": "User/Group Mapping",
                            "status": "PASS",
                            "response_time": f"{elapsed:.2f}ms",
                            "user_uuid": data.get("uuid"),
                            "groups_count": len(data.get("groups", [])),
                            "details": {
                                "username": data.get("username"),
                                "email": data.get("email"),
                                "groups": [g.get("name") for g in data.get("groups", [])]
                            }
                        }
                        print(f"✅ User/Group Mapping: Success ({elapsed:.2f}ms, {result['groups_count']} groups)")
                    else:
                        data = await response.json()
                        result = {
                            "test": "User/Group Mapping",
                            "status": "FAIL",
                            "response_time": f"{elapsed:.2f}ms",
                            "status_code": response.status,
                            "error": data
                        }
                        print(f"❌ User/Group Mapping: Failed (Status: {response.status})")
                    
                    return result
                    
            except Exception as e:
                return {
                    "test": "User/Group Mapping",
                    "status": "ERROR",
                    "error": str(e)
                }
    
    async def test_workspace_permissions(self, token: str) -> Dict:
        """워크스페이스 권한 테스트"""
        print("\n🔍 Testing Workspace Permissions...")
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        async with aiohttp.ClientSession() as session:
            try:
                # 1. 워크스페이스 생성 시도
                workspace_data = {
                    "name": f"Test Workspace {datetime.now().strftime('%Y%m%d_%H%M%S')}",
                    "description": "OAuth flow test workspace",
                    "is_active": True
                }
                
                async with session.post(
                    f"{self.base_url}/api/v1/workspaces",
                    headers=headers,
                    json=workspace_data
                ) as response:
                    if response.status == 201:
                        workspace = await response.json()
                        workspace_id = workspace.get("id")
                        
                        # 2. 생성된 워크스페이스 접근 테스트
                        async with session.get(
                            f"{self.base_url}/api/v1/workspaces/{workspace_id}",
                            headers=headers
                        ) as get_response:
                            if get_response.status == 200:
                                result = {
                                    "test": "Workspace Permissions",
                                    "status": "PASS",
                                    "workspace_created": True,
                                    "workspace_accessible": True,
                                    "workspace_id": workspace_id,
                                    "details": workspace
                                }
                                print(f"✅ Workspace Permissions: All checks passed")
                            else:
                                result = {
                                    "test": "Workspace Permissions",
                                    "status": "PARTIAL",
                                    "workspace_created": True,
                                    "workspace_accessible": False,
                                    "error": await get_response.json()
                                }
                                print(f"⚠️  Workspace Permissions: Created but not accessible")
                        
                        # 3. 정리: 테스트 워크스페이스 삭제
                        await session.delete(
                            f"{self.base_url}/api/v1/workspaces/{workspace_id}",
                            headers=headers
                        )
                        
                        return result
                    else:
                        error_data = await response.json()
                        return {
                            "test": "Workspace Permissions",
                            "status": "FAIL",
                            "workspace_created": False,
                            "status_code": response.status,
                            "error": error_data
                        }
                        
            except Exception as e:
                return {
                    "test": "Workspace Permissions",
                    "status": "ERROR",
                    "error": str(e)
                }
    
    async def test_error_handling(self, token: str) -> Dict:
        """에러 처리 테스트"""
        print("\n🔍 Testing Error Handling...")
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json"
        }
        
        test_cases = []
        
        async with aiohttp.ClientSession() as session:
            # 1. 존재하지 않는 리소스 접근
            async with session.get(
                f"{self.base_url}/api/v1/workspaces/99999999",
                headers=headers
            ) as response:
                if response.status == 404:
                    data = await response.json()
                    test_cases.append({
                        "case": "Non-existent resource",
                        "passed": True,
                        "error_code": data.get("error_code"),
                        "has_structured_error": all(k in data for k in ["error_code", "user_message"])
                    })
                else:
                    test_cases.append({
                        "case": "Non-existent resource",
                        "passed": False,
                        "unexpected_status": response.status
                    })
            
            # 2. 잘못된 토큰으로 접근
            bad_headers = {
                "Authorization": "Bearer invalid_token_12345",
                "Accept": "application/json"
            }
            async with session.get(
                f"{self.base_url}/api/v1/workspaces",
                headers=bad_headers
            ) as response:
                if response.status == 401:
                    data = await response.json()
                    test_cases.append({
                        "case": "Invalid token",
                        "passed": True,
                        "error_code": data.get("error_code"),
                        "has_structured_error": all(k in data for k in ["error_code", "user_message"])
                    })
                else:
                    test_cases.append({
                        "case": "Invalid token",
                        "passed": False,
                        "unexpected_status": response.status
                    })
            
            # 3. 권한 없는 작업 시도 (다른 사용자의 워크스페이스 수정)
            # 이 테스트는 실제 다른 사용자의 워크스페이스 ID가 필요하므로 스킵
            
            all_passed = all(tc.get("passed", False) for tc in test_cases)
            
            result = {
                "test": "Error Handling",
                "status": "PASS" if all_passed else "FAIL",
                "test_cases": test_cases,
                "summary": f"{sum(1 for tc in test_cases if tc.get('passed'))} / {len(test_cases)} passed"
            }
            
            if all_passed:
                print(f"✅ Error Handling: All error cases handled correctly")
            else:
                print(f"❌ Error Handling: Some error cases failed")
            
            return result
    
    async def test_performance(self, token: str) -> Dict:
        """성능 테스트"""
        print("\n🔍 Testing Performance...")
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json"
        }
        
        response_times = []
        
        async with aiohttp.ClientSession() as session:
            # 10회 반복 측정
            for i in range(10):
                start_time = time.time()
                async with session.get(
                    f"{self.base_url}/api/v1/workspaces",
                    headers=headers
                ) as response:
                    if response.status == 200:
                        _ = await response.json()
                        elapsed = (time.time() - start_time) * 1000
                        response_times.append(elapsed)
                
                await asyncio.sleep(0.1)  # 과부하 방지
            
            if response_times:
                avg_time = sum(response_times) / len(response_times)
                min_time = min(response_times)
                max_time = max(response_times)
                
                result = {
                    "test": "Performance",
                    "status": "PASS" if avg_time < 200 else "FAIL",
                    "measurements": len(response_times),
                    "average_response_time": f"{avg_time:.2f}ms",
                    "min_response_time": f"{min_time:.2f}ms",
                    "max_response_time": f"{max_time:.2f}ms",
                    "target": "< 200ms",
                    "details": {
                        "all_times": [f"{t:.2f}ms" for t in response_times]
                    }
                }
                
                if avg_time < 200:
                    print(f"✅ Performance: Target met (Avg: {avg_time:.2f}ms < 200ms)")
                else:
                    print(f"❌ Performance: Target not met (Avg: {avg_time:.2f}ms > 200ms)")
            else:
                result = {
                    "test": "Performance",
                    "status": "ERROR",
                    "error": "No measurements collected"
                }
            
            return result
    
    async def run_all_tests(self, test_token: Optional[str] = None):
        """모든 테스트 실행"""
        print("\n" + "="*60)
        print("🚀 MAX Lab OAuth Flow Integration Test")
        print("="*60)
        print(f"Base URL: {self.base_url}")
        print(f"Auth Server URL: {self.auth_server_url}")
        print(f"Test Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        # 1. 헬스 체크
        health_result = await self.test_health_check()
        self.results.append(health_result)
        
        # 2. 인증되지 않은 접근 테스트
        unauth_result = await self.test_unauthorized_access()
        self.results.append(unauth_result)
        
        # 3. OAuth 로그인 플로우
        login_result, token = await self.test_oauth_login_flow(test_token)
        self.results.append(login_result)
        
        if token:
            # 4. 인증된 접근 테스트
            auth_result = await self.test_authenticated_access(token)
            self.results.append(auth_result)
            
            # 5. 사용자/그룹 매핑 테스트
            mapping_result = await self.test_user_groups_mapping(token)
            self.results.append(mapping_result)
            
            # 6. 워크스페이스 권한 테스트
            perm_result = await self.test_workspace_permissions(token)
            self.results.append(perm_result)
            
            # 7. 에러 처리 테스트
            error_result = await self.test_error_handling(token)
            self.results.append(error_result)
            
            # 8. 성능 테스트
            perf_result = await self.test_performance(token)
            self.results.append(perf_result)
        else:
            print("\n⚠️  No token available - skipping authenticated tests")
        
        # 결과 요약
        self.print_summary()
    
    def print_summary(self):
        """테스트 결과 요약 출력"""
        print("\n" + "="*60)
        print("📊 Test Summary")
        print("="*60)
        
        passed = sum(1 for r in self.results if r.get("status") == "PASS")
        failed = sum(1 for r in self.results if r.get("status") == "FAIL")
        errors = sum(1 for r in self.results if r.get("status") == "ERROR")
        simulated = sum(1 for r in self.results if r.get("status") == "SIMULATED")
        
        print(f"\nTotal Tests: {len(self.results)}")
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        print(f"⚠️  Errors: {errors}")
        print(f"🔄 Simulated: {simulated}")
        
        print("\nDetailed Results:")
        for result in self.results:
            status_icon = {
                "PASS": "✅",
                "FAIL": "❌",
                "ERROR": "⚠️",
                "SIMULATED": "🔄",
                "PARTIAL": "⚠️"
            }.get(result.get("status", ""), "❓")
            
            print(f"\n{status_icon} {result.get('test', 'Unknown Test')}")
            if result.get("response_time"):
                print(f"   Response Time: {result.get('response_time')}")
            if result.get("error"):
                print(f"   Error: {result.get('error')}")
            if result.get("error_code"):
                print(f"   Error Code: {result.get('error_code')}")
            if result.get("summary"):
                print(f"   Summary: {result.get('summary')}")
        
        # 최종 결과
        print("\n" + "="*60)
        if failed == 0 and errors == 0:
            print("🎉 All tests passed successfully!")
        else:
            print("❌ Some tests failed. Please check the results above.")
        print("="*60)


async def main():
    """메인 함수"""
    import argparse
    
    parser = argparse.ArgumentParser(description="OAuth Flow Integration Test")
    parser.add_argument(
        "--token",
        help="OAuth access token for testing (optional)"
    )
    parser.add_argument(
        "--base-url",
        default="http://localhost:8010",
        help="Base URL of MAX Lab API (default: http://localhost:8010)"
    )
    parser.add_argument(
        "--auth-url",
        default="http://localhost:8000",
        help="Auth server URL (default: http://localhost:8000)"
    )
    
    args = parser.parse_args()
    
    # 테스터 생성 및 실행
    tester = OAuthFlowTester(args.base_url, args.auth_url)
    await tester.run_all_tests(args.token)


if __name__ == "__main__":
    asyncio.run(main())