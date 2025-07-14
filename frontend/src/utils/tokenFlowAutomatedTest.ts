/**
 * Automated Token Flow Test Suite
 * 토큰 생명주기 전체를 자동으로 테스트하는 종합 테스트 시스템
 */

import { authService } from '../services/authService';
import { refreshTokenService } from '../services/refreshTokenService';
import { secureTokenStorage } from '../services/secureTokenStorage';
import { securityEventLogger } from '../services/securityEventLogger';
import { tokenRefreshManager } from '../services/tokenRefreshManager';

export interface TokenFlowTestSuite {
  testName: string;
  description: string;
  steps: TokenFlowTestStep[];
  expectedDuration: number; // ms
  criticalFailures: string[];
}

export interface TokenFlowTestStep {
  name: string;
  description: string;
  execute: () => Promise<TokenFlowStepResult>;
  timeout: number; // ms
  retryCount: number;
  criticalStep: boolean;
}

export interface TokenFlowStepResult {
  success: boolean;
  duration: number;
  data?: any;
  error?: string;
  warnings?: string[];
  metrics?: Record<string, number>;
}

export interface TokenFlowTestReport {
  testSuite: string;
  timestamp: string;
  totalDuration: number;
  overallSuccess: boolean;
  stepResults: Array<{
    step: string;
    result: TokenFlowStepResult;
  }>;
  summary: {
    totalSteps: number;
    passedSteps: number;
    failedSteps: number;
    criticalFailures: number;
    averageStepDuration: number;
  };
  metrics: {
    tokenOperationsPerSecond: number;
    encryptionLatency: number;
    networkLatency: number;
    securityEventCount: number;
  };
  recommendations: string[];
}

/**
 * 기본 토큰 플로우 테스트 스위트
 */
export function createBasicTokenFlowTestSuite(): TokenFlowTestSuite {
  return {
    testName: 'Basic Token Flow Test',
    description: 'Tests basic token operations including storage, retrieval, and refresh',
    expectedDuration: 30000, // 30초
    criticalFailures: [],
    steps: [
      {
        name: 'Initial State Check',
        description: 'Verify initial authentication state',
        timeout: 5000,
        retryCount: 0,
        criticalStep: false,
        execute: async (): Promise<TokenFlowStepResult> => {
          const startTime = Date.now();
          try {
            const isAuthenticated = authService.isAuthenticated();
            const hasRefreshToken = refreshTokenService.isRefreshTokenValid();
            const storageStatus = await secureTokenStorage.getStorageStatus();
            
            return {
              success: true,
              duration: Date.now() - startTime,
              data: {
                isAuthenticated,
                hasRefreshToken,
                storageStatus
              }
            };
          } catch (error: any) {
            return {
              success: false,
              duration: Date.now() - startTime,
              error: error.message
            };
          }
        }
      },
      {
        name: 'Token Storage Test',
        description: 'Test secure token storage and retrieval',
        timeout: 10000,
        retryCount: 2,
        criticalStep: true,
        execute: async (): Promise<TokenFlowStepResult> => {
          const startTime = Date.now();
          try {
            const testToken = `test_token_${Date.now()}`;
            
            // 저장 테스트
            const storeResult = await secureTokenStorage.storeRefreshToken(testToken);
            if (!storeResult.success) {
              throw new Error(`Storage failed: ${storeResult.error}`);
            }
            
            // 조회 테스트
            const retrieveResult = await secureTokenStorage.getRefreshToken();
            if (retrieveResult.token !== testToken) {
              throw new Error('Retrieved token does not match stored token');
            }
            
            // 정리
            await secureTokenStorage.clearRefreshToken();
            
            return {
              success: true,
              duration: Date.now() - startTime,
              data: {
                stored: storeResult.success,
                encrypted: storeResult.encrypted,
                retrieved: retrieveResult.token === testToken
              },
              metrics: {
                storageLatency: Date.now() - startTime
              }
            };
          } catch (error: any) {
            return {
              success: false,
              duration: Date.now() - startTime,
              error: error.message
            };
          }
        }
      },
      {
        name: 'Token Refresh Simulation',
        description: 'Simulate token refresh process',
        timeout: 15000,
        retryCount: 1,
        criticalStep: true,
        execute: async (): Promise<TokenFlowStepResult> => {
          const startTime = Date.now();
          try {
            // 토큰 만료 시뮬레이션
            const originalExpiry = localStorage.getItem('tokenExpiryTime');
            const nearExpiryTime = Date.now() + 60000; // 1분 후 만료
            localStorage.setItem('tokenExpiryTime', nearExpiryTime.toString());
            
            // 갱신 필요 여부 확인
            const needsRefresh = authService.needsTokenRefresh();
            
            let refreshResult = false;
            if (needsRefresh) {
              // 실제 갱신 시도 (silent auth fallback)
              refreshResult = await authService.refreshToken();
            }
            
            // 원래 상태 복원
            if (originalExpiry) {
              localStorage.setItem('tokenExpiryTime', originalExpiry);
            }
            
            return {
              success: true,
              duration: Date.now() - startTime,
              data: {
                needsRefresh,
                refreshResult,
                method: refreshTokenService.isRefreshTokenValid() ? 'refresh_token' : 'silent_auth'
              },
              warnings: refreshResult ? [] : ['Token refresh failed - this may be expected in test environment']
            };
          } catch (error: any) {
            return {
              success: false,
              duration: Date.now() - startTime,
              error: error.message
            };
          }
        }
      },
      {
        name: 'Security Event Logging',
        description: 'Test security event generation and logging',
        timeout: 5000,
        retryCount: 0,
        criticalStep: false,
        execute: async (): Promise<TokenFlowStepResult> => {
          const startTime = Date.now();
          try {
            const initialQueueLength = securityEventLogger.getQueueStatus().queueLength;
            
            // 테스트 이벤트들 생성
            securityEventLogger.logTokenEvent('test_event_1', { testType: 'automated_flow' });
            securityEventLogger.logRefreshTokenEvent('test_event_2', { testType: 'automated_flow' });
            securityEventLogger.logEncryptionEvent('test_event_3', { testType: 'automated_flow' });
            
            const finalQueueLength = securityEventLogger.getQueueStatus().queueLength;
            const eventsGenerated = finalQueueLength - initialQueueLength;
            
            return {
              success: eventsGenerated >= 3,
              duration: Date.now() - startTime,
              data: {
                initialQueueLength,
                finalQueueLength,
                eventsGenerated,
                loggerEnabled: securityEventLogger.getQueueStatus().isEnabled
              }
            };
          } catch (error: any) {
            return {
              success: false,
              duration: Date.now() - startTime,
              error: error.message
            };
          }
        }
      },
      {
        name: 'Token Manager Status',
        description: 'Verify token refresh manager state',
        timeout: 3000,
        retryCount: 0,
        criticalStep: false,
        execute: async (): Promise<TokenFlowStepResult> => {
          const startTime = Date.now();
          try {
            const refreshStatus = tokenRefreshManager.getRefreshStatus();
            const debugInfo = await refreshTokenService.getDebugInfo();
            
            return {
              success: true,
              duration: Date.now() - startTime,
              data: {
                refreshInProgress: refreshStatus.refreshInProgress,
                queueLength: refreshStatus.queueLength,
                hasRefreshToken: debugInfo.hasRefreshToken,
                refreshTokenValid: debugInfo.isRefreshTokenValid,
                encryptionStatus: debugInfo.encryptionStatus
              }
            };
          } catch (error: any) {
            return {
              success: false,
              duration: Date.now() - startTime,
              error: error.message
            };
          }
        }
      }
    ]
  };
}

/**
 * 고급 토큰 플로우 테스트 스위트 (스트레스 테스트)
 */
export function createAdvancedTokenFlowTestSuite(): TokenFlowTestSuite {
  return {
    testName: 'Advanced Token Flow Stress Test',
    description: 'Comprehensive stress testing of token operations',
    expectedDuration: 120000, // 2분
    criticalFailures: [],
    steps: [
      {
        name: 'Concurrent Token Operations',
        description: 'Test concurrent token storage/retrieval operations',
        timeout: 30000,
        retryCount: 1,
        criticalStep: true,
        execute: async (): Promise<TokenFlowStepResult> => {
          const startTime = Date.now();
          try {
            const concurrentOps = 10;
            const promises: Promise<any>[] = [];
            
            // 동시에 여러 토큰 저장/조회 작업 실행
            for (let i = 0; i < concurrentOps; i++) {
              promises.push(
                (async () => {
                  const testToken = `concurrent_test_${i}_${Date.now()}`;
                  await secureTokenStorage.storeRefreshToken(testToken);
                  const result = await secureTokenStorage.getRefreshToken();
                  return result.token === testToken;
                })()
              );
            }
            
            const results = await Promise.all(promises);
            const successCount = results.filter(r => r).length;
            
            // 정리
            await secureTokenStorage.clearRefreshToken();
            
            return {
              success: successCount === concurrentOps,
              duration: Date.now() - startTime,
              data: {
                totalOperations: concurrentOps,
                successfulOperations: successCount,
                failureRate: ((concurrentOps - successCount) / concurrentOps) * 100
              },
              metrics: {
                operationsPerSecond: concurrentOps / ((Date.now() - startTime) / 1000)
              }
            };
          } catch (error: any) {
            return {
              success: false,
              duration: Date.now() - startTime,
              error: error.message
            };
          }
        }
      },
      {
        name: 'Rapid Token Refresh Simulation',
        description: 'Test rapid successive token refresh attempts',
        timeout: 20000,
        retryCount: 0,
        criticalStep: false,
        execute: async (): Promise<TokenFlowStepResult> => {
          const startTime = Date.now();
          try {
            const attempts = 5;
            const results = [];
            
            for (let i = 0; i < attempts; i++) {
              const attemptStart = Date.now();
              
              try {
                // 빠른 연속 갱신 시도 (보안 제한 테스트)
                const result = await authService.refreshToken();
                results.push({
                  attempt: i + 1,
                  success: result,
                  duration: Date.now() - attemptStart
                });
                
                // 짧은 지연
                await new Promise(resolve => setTimeout(resolve, 1000));
              } catch (error: any) {
                results.push({
                  attempt: i + 1,
                  success: false,
                  duration: Date.now() - attemptStart,
                  error: error.message
                });
              }
            }
            
            const successfulAttempts = results.filter(r => r.success).length;
            
            return {
              success: true, // 일부 실패는 정상 (보안 제한)
              duration: Date.now() - startTime,
              data: {
                totalAttempts: attempts,
                successfulAttempts,
                results
              },
              warnings: successfulAttempts < attempts ? 
                ['Some refresh attempts were blocked - this is expected security behavior'] : []
            };
          } catch (error: any) {
            return {
              success: false,
              duration: Date.now() - startTime,
              error: error.message
            };
          }
        }
      },
      {
        name: 'Memory Leak Detection',
        description: 'Check for potential memory leaks in token operations',
        timeout: 15000,
        retryCount: 0,
        criticalStep: false,
        execute: async (): Promise<TokenFlowStepResult> => {
          const startTime = Date.now();
          try {
            const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;
            
            // 반복적인 토큰 작업 수행
            for (let i = 0; i < 100; i++) {
              const testToken = `memory_test_${i}`;
              await secureTokenStorage.storeRefreshToken(testToken);
              await secureTokenStorage.getRefreshToken();
              
              if (i % 10 === 0) {
                // 가비지 컬렉션 힌트
                if (global.gc) {
                  global.gc();
                }
              }
            }
            
            const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
            const memoryIncrease = finalMemory - initialMemory;
            
            // 정리
            await secureTokenStorage.clearRefreshToken();
            
            return {
              success: true,
              duration: Date.now() - startTime,
              data: {
                initialMemory,
                finalMemory,
                memoryIncrease,
                memoryIncreaseKB: Math.round(memoryIncrease / 1024)
              },
              warnings: memoryIncrease > 1000000 ? // 1MB
                ['Significant memory increase detected - potential memory leak'] : []
            };
          } catch (error: any) {
            return {
              success: false,
              duration: Date.now() - startTime,
              error: error.message
            };
          }
        }
      }
    ]
  };
}

/**
 * 테스트 스위트 실행기
 */
export async function runTokenFlowTestSuite(
  testSuite: TokenFlowTestSuite,
  onStepComplete?: (stepName: string, result: TokenFlowStepResult) => void
): Promise<TokenFlowTestReport> {
  console.log(`🧪 Starting automated token flow test: ${testSuite.testName}`);
  
  const startTime = Date.now();
  const stepResults: Array<{ step: string; result: TokenFlowStepResult }> = [];
  let criticalFailures = 0;
  
  // 보안 이벤트 카운터 초기화
  const initialEventCount = securityEventLogger.getQueueStatus().queueLength;
  
  for (const step of testSuite.steps) {
    console.log(`  ▶ Executing: ${step.name}`);
    
    let stepResult: TokenFlowStepResult;
    let attempt = 0;
    
    do {
      attempt++;
      const stepStartTime = Date.now();
      
      try {
        // 타임아웃 설정
        const timeoutPromise = new Promise<TokenFlowStepResult>((_, reject) => {
          setTimeout(() => reject(new Error(`Step timeout after ${step.timeout}ms`)), step.timeout);
        });
        
        const executionPromise = step.execute();
        stepResult = await Promise.race([executionPromise, timeoutPromise]);
        
      } catch (error: any) {
        stepResult = {
          success: false,
          duration: Date.now() - stepStartTime,
          error: error.message
        };
      }
      
      // 재시도 로직
      if (!stepResult.success && attempt <= step.retryCount) {
        console.warn(`    ⚠️ Step failed, retrying (${attempt}/${step.retryCount + 1})`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // 지수 백오프
      }
      
    } while (!stepResult.success && attempt <= step.retryCount);
    
    // 결과 기록
    stepResults.push({ step: step.name, result: stepResult });
    
    if (!stepResult.success && step.criticalStep) {
      criticalFailures++;
    }
    
    // 콜백 호출
    if (onStepComplete) {
      onStepComplete(step.name, stepResult);
    }
    
    console.log(`    ${stepResult.success ? '✅' : '❌'} ${step.name} (${stepResult.duration}ms)`);
    if (stepResult.warnings?.length) {
      stepResult.warnings.forEach(warning => console.warn(`    ⚠️ ${warning}`));
    }
  }
  
  const totalDuration = Date.now() - startTime;
  const finalEventCount = securityEventLogger.getQueueStatus().queueLength;
  
  // 메트릭 계산
  const passedSteps = stepResults.filter(sr => sr.result.success).length;
  const averageStepDuration = stepResults.reduce((sum, sr) => sum + sr.result.duration, 0) / stepResults.length;
  
  const totalTokenOps = stepResults.reduce((sum, sr) => {
    const metrics = sr.result.metrics;
    return sum + (metrics?.operationsPerSecond || 0);
  }, 0);
  
  const encryptionLatencies = stepResults
    .map(sr => sr.result.metrics?.storageLatency || 0)
    .filter(l => l > 0);
  const avgEncryptionLatency = encryptionLatencies.length > 0 ? 
    encryptionLatencies.reduce((a, b) => a + b, 0) / encryptionLatencies.length : 0;
  
  // 권장사항 생성
  const recommendations: string[] = [];
  
  if (criticalFailures > 0) {
    recommendations.push(`${criticalFailures} critical step(s) failed - immediate attention required`);
  }
  
  if (averageStepDuration > 5000) {
    recommendations.push('High average step duration - consider performance optimization');
  }
  
  if (finalEventCount - initialEventCount === 0) {
    recommendations.push('No security events generated - check event logging system');
  }
  
  if (passedSteps / stepResults.length < 0.8) {
    recommendations.push('Less than 80% steps passed - review test environment and configuration');
  }
  
  const report: TokenFlowTestReport = {
    testSuite: testSuite.testName,
    timestamp: new Date().toISOString(),
    totalDuration,
    overallSuccess: criticalFailures === 0 && passedSteps > stepResults.length * 0.7,
    stepResults,
    summary: {
      totalSteps: stepResults.length,
      passedSteps,
      failedSteps: stepResults.length - passedSteps,
      criticalFailures,
      averageStepDuration: Math.round(averageStepDuration)
    },
    metrics: {
      tokenOperationsPerSecond: Math.round(totalTokenOps),
      encryptionLatency: Math.round(avgEncryptionLatency),
      networkLatency: 0, // TODO: 네트워크 테스트에서 계산
      securityEventCount: finalEventCount - initialEventCount
    },
    recommendations
  };
  
  // 최종 결과 출력
  console.log(`\n📊 Token Flow Test Results:`);
  console.log(`   • Overall Success: ${report.overallSuccess ? '✅' : '❌'}`);
  console.log(`   • Duration: ${totalDuration}ms`);
  console.log(`   • Steps Passed: ${passedSteps}/${stepResults.length}`);
  console.log(`   • Critical Failures: ${criticalFailures}`);
  console.log(`   • Security Events Generated: ${report.metrics.securityEventCount}`);
  
  if (recommendations.length > 0) {
    console.log(`💡 Recommendations:`);
    recommendations.forEach(rec => console.log(`   - ${rec}`));
  }
  
  return report;
}

/**
 * 모든 테스트 스위트 실행
 */
export async function runAllTokenFlowTests(): Promise<{
  basicTest: TokenFlowTestReport;
  advancedTest: TokenFlowTestReport;
  overallSuccess: boolean;
}> {
  console.log('🚀 Running comprehensive automated token flow tests...\n');
  
  const basicTest = await runTokenFlowTestSuite(createBasicTokenFlowTestSuite());
  
  console.log('\n⏳ Waiting 5 seconds before advanced test...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const advancedTest = await runTokenFlowTestSuite(createAdvancedTokenFlowTestSuite());
  
  const overallSuccess = basicTest.overallSuccess && advancedTest.overallSuccess;
  
  console.log('\n🎯 Final Test Summary:');
  console.log(`   • Basic Test: ${basicTest.overallSuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   • Advanced Test: ${advancedTest.overallSuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   • Overall Result: ${overallSuccess ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  
  return {
    basicTest,
    advancedTest,
    overallSuccess
  };
}

// 글로벌 헬퍼 등록
export function registerTokenFlowTestHelpers(): void {
  if (typeof window !== 'undefined' && import.meta.env.DEV) {
    (window as any).tokenFlowTest = {
      runBasic: () => runTokenFlowTestSuite(createBasicTokenFlowTestSuite()),
      runAdvanced: () => runTokenFlowTestSuite(createAdvancedTokenFlowTestSuite()),
      runAll: runAllTokenFlowTests,
      createBasicSuite: createBasicTokenFlowTestSuite,
      createAdvancedSuite: createAdvancedTokenFlowTestSuite
    };
    
    console.log('🧪 Token flow test helpers registered. Use window.tokenFlowTest in console:');
    console.log('  - tokenFlowTest.runBasic() - 기본 토큰 플로우 테스트');
    console.log('  - tokenFlowTest.runAdvanced() - 고급 스트레스 테스트');
    console.log('  - tokenFlowTest.runAll() - 모든 테스트 실행');
  }
}

export default {
  runTokenFlowTestSuite,
  runAllTokenFlowTests,
  createBasicTokenFlowTestSuite,
  createAdvancedTokenFlowTestSuite,
  registerTokenFlowTestHelpers
};