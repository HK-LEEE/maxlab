#!/usr/bin/env python3
"""
OAuth 인증 시스템 로드 테스트 스크립트
MAX Lab OAuth 인증 플로우의 성능을 테스트합니다.
"""
import asyncio
import aiohttp
import time
import statistics
from typing import List, Dict, Any
import argparse
import json


class OAuthLoadTester:
    """OAuth 시스템 로드 테스터"""
    
    def __init__(self, base_url: str = "http://localhost:8010", auth_server_url: str = "http://localhost:8000"):
        self.base_url = base_url.rstrip('/')
        self.auth_server_url = auth_server_url.rstrip('/')
        self.results = []
        
    async def get_test_token(self, session: aiohttp.ClientSession) -> str:
        """테스트용 OAuth 토큰 획득"""
        # 실제 구현에서는 OAuth 인증 플로우를 통해 토큰을 획득
        # 여기서는 테스트용 더미 토큰을 사용
        return "test_oauth_token_for_load_testing"
    
    async def test_single_auth_request(self, session: aiohttp.ClientSession, token: str) -> Dict[str, Any]:
        """단일 인증 요청 테스트"""
        start_time = time.time()
        
        try:
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
            
            async with session.get(
                f"{self.base_url}/api/v1/workspaces",
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=10)
            ) as response:
                duration_ms = (time.time() - start_time) * 1000
                success = response.status == 200
                
                return {
                    "duration_ms": duration_ms,
                    "success": success,
                    "status_code": response.status,
                    "error": None if success else f"HTTP {response.status}"
                }
                
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            return {
                "duration_ms": duration_ms,
                "success": False,
                "status_code": 0,
                "error": str(e)
            }
    
    async def run_concurrent_tests(self, concurrent_users: int, requests_per_user: int) -> List[Dict[str, Any]]:
        """동시 사용자 테스트 실행"""
        print(f"Starting load test: {concurrent_users} concurrent users, {requests_per_user} requests each")
        
        async with aiohttp.ClientSession() as session:
            # Get test token
            token = await self.get_test_token(session)
            
            # Create tasks for all concurrent users
            tasks = []
            for user_id in range(concurrent_users):
                for request_id in range(requests_per_user):
                    task = self.test_single_auth_request(session, token)
                    tasks.append(task)
            
            # Execute all tasks concurrently
            start_time = time.time()
            results = await asyncio.gather(*tasks, return_exceptions=True)
            total_duration = time.time() - start_time
            
            # Filter out exceptions and convert to results
            valid_results = []
            for result in results:
                if isinstance(result, dict):
                    valid_results.append(result)
                else:
                    valid_results.append({
                        "duration_ms": 0,
                        "success": False,
                        "status_code": 0,
                        "error": str(result)
                    })
            
            print(f"Completed {len(valid_results)} requests in {total_duration:.2f} seconds")
            return valid_results
    
    def analyze_results(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """결과 분석"""
        if not results:
            return {"error": "No results to analyze"}
        
        # Extract metrics
        durations = [r["duration_ms"] for r in results]
        successes = [r["success"] for r in results]
        
        # Calculate statistics
        success_rate = sum(successes) / len(successes)
        
        analysis = {
            "total_requests": len(results),
            "success_count": sum(successes),
            "failure_count": len(successes) - sum(successes),
            "success_rate": success_rate,
            "response_times": {
                "min_ms": min(durations),
                "max_ms": max(durations),
                "mean_ms": statistics.mean(durations),
                "median_ms": statistics.median(durations),
                "p95_ms": statistics.quantiles(durations, n=20)[18] if len(durations) > 20 else max(durations),
                "p99_ms": statistics.quantiles(durations, n=100)[98] if len(durations) > 100 else max(durations)
            },
            "performance_targets": {
                "target_response_time_ms": 200,
                "target_success_rate": 0.99,
                "meets_response_time_target": statistics.median(durations) <= 200,
                "meets_success_rate_target": success_rate >= 0.99
            }
        }
        
        # Failure analysis
        if analysis["failure_count"] > 0:
            failure_reasons = {}
            for result in results:
                if not result["success"]:
                    error = result["error"] or f"HTTP {result['status_code']}"
                    failure_reasons[error] = failure_reasons.get(error, 0) + 1
            analysis["failure_reasons"] = failure_reasons
        
        return analysis
    
    async def get_system_metrics(self) -> Dict[str, Any]:
        """시스템 메트릭 조회 (테스트 후)"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self.base_url}/api/v1/metrics/health/oauth") as response:
                    if response.status == 200:
                        return await response.json()
        except Exception as e:
            print(f"Failed to get system metrics: {e}")
        
        return {}


async def main():
    """메인 함수"""
    parser = argparse.ArgumentParser(description="OAuth Load Testing Tool")
    parser.add_argument("--users", type=int, default=10, help="Number of concurrent users")
    parser.add_argument("--requests", type=int, default=5, help="Requests per user")
    parser.add_argument("--base-url", default="http://localhost:8010", help="Base URL of the service")
    parser.add_argument("--auth-url", default="http://localhost:8000", help="Auth server URL")
    
    args = parser.parse_args()
    
    tester = OAuthLoadTester(args.base_url, args.auth_url)
    
    print("=" * 60)
    print("OAuth Authentication System Load Test")
    print("=" * 60)
    print(f"Target: {args.base_url}")
    print(f"Auth Server: {args.auth_url}")
    print(f"Test Plan: {args.users} concurrent users × {args.requests} requests each")
    print("=" * 60)
    
    # Run load test
    results = await tester.run_concurrent_tests(args.users, args.requests)
    
    # Analyze results
    analysis = tester.analyze_results(results)
    
    # Get system metrics
    system_metrics = await tester.get_system_metrics()
    
    # Print results
    print("\\nLOAD TEST RESULTS:")
    print("=" * 60)
    print(f"Total Requests: {analysis['total_requests']}")
    print(f"Success Rate: {analysis['success_rate']:.2%}")
    print(f"Response Times:")
    print(f"  Mean: {analysis['response_times']['mean_ms']:.1f}ms")
    print(f"  Median: {analysis['response_times']['median_ms']:.1f}ms")
    print(f"  95th percentile: {analysis['response_times']['p95_ms']:.1f}ms")
    print(f"  99th percentile: {analysis['response_times']['p99_ms']:.1f}ms")
    
    print(f"\\nPERFORMANCE TARGETS:")
    print(f"  Response Time (<200ms): {'✅ PASS' if analysis['performance_targets']['meets_response_time_target'] else '❌ FAIL'}")
    print(f"  Success Rate (>99%): {'✅ PASS' if analysis['performance_targets']['meets_success_rate_target'] else '❌ FAIL'}")
    
    if analysis.get("failure_reasons"):
        print(f"\\nFAILURE ANALYSIS:")
        for reason, count in analysis["failure_reasons"].items():
            print(f"  {reason}: {count} occurrences")
    
    if system_metrics:
        print(f"\\nSYSTEM HEALTH:")
        print(f"  Overall Status: {system_metrics.get('status', 'unknown')}")
        oauth_system = system_metrics.get('oauth_system', {})
        if oauth_system:
            print(f"  Circuit Breaker: {oauth_system.get('circuit_breaker', 'unknown')}")
    
    print("=" * 60)
    
    # Save detailed results to file
    full_report = {
        "test_config": {
            "concurrent_users": args.users,
            "requests_per_user": args.requests,
            "base_url": args.base_url,
            "auth_url": args.auth_url
        },
        "analysis": analysis,
        "system_metrics": system_metrics,
        "raw_results": results
    }
    
    with open("oauth_load_test_results.json", "w") as f:
        json.dump(full_report, f, indent=2)
    
    print("Detailed results saved to: oauth_load_test_results.json")


if __name__ == "__main__":
    asyncio.run(main())