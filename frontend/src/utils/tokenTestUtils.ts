/**
 * Token Testing Utilities
 * 토큰 갱신 테스트 및 시뮬레이션을 위한 유틸리티 함수들
 */

import { authService } from '../services/authService';
import { refreshTokenService } from '../services/refreshTokenService';
import { tokenRefreshManager } from '../services/tokenRefreshManager';
import { isDevelopment } from './logger';

export interface TokenTestReport {
  timestamp: string;
  currentState: {
    isAuthenticated: boolean;
    hasAccessToken: boolean;
    hasRefreshToken: boolean;
    accessTokenTimeToExpiry: number;
    refreshTokenTimeToExpiry: number;
    needsRefresh: boolean;
  };
  testResults: {
    manualRefreshTest?: {
      success: boolean;
      method: 'refresh_token' | 'silent_auth' | 'failed';
      duration: number;
      error?: string;
    };
    tokenValidationTest?: {
      accessTokenValid: boolean;
      refreshTokenValid: boolean;
    };
    storageConsistency?: {
      allTokensPresent: boolean;
      timesMatch: boolean;
      issues: string[];
    };
  };
}

/**
 * 현재 토큰 상태를 상세히 분석
 */
export function analyzeCurrentTokenState(): TokenTestReport['currentState'] {
  return {
    isAuthenticated: authService.isAuthenticated(),
    hasAccessToken: !!localStorage.getItem('accessToken'),
    hasRefreshToken: !!localStorage.getItem('refreshToken'),
    accessTokenTimeToExpiry: authService.getTokenTimeToExpiry(),
    refreshTokenTimeToExpiry: refreshTokenService.getRefreshTokenTimeToExpiry(),
    needsRefresh: authService.needsTokenRefresh()
  };
}

/**
 * 토큰 저장소 일관성 검사
 */
export function validateTokenStorageConsistency(): TokenTestReport['testResults']['storageConsistency'] {
  const issues: string[] = [];
  
  const accessToken = localStorage.getItem('accessToken');
  const refreshToken = localStorage.getItem('refreshToken');
  const tokenExpiryTime = localStorage.getItem('tokenExpiryTime');
  const refreshTokenExpiryTime = localStorage.getItem('refreshTokenExpiryTime');
  const tokenCreatedAt = localStorage.getItem('tokenCreatedAt');
  const refreshTokenCreatedAt = localStorage.getItem('refreshTokenCreatedAt');

  // 기본 토큰 존재 여부 확인
  const allTokensPresent = !!(accessToken && refreshToken && tokenExpiryTime && refreshTokenExpiryTime);
  
  if (!allTokensPresent) {
    if (!accessToken) issues.push('Access token missing');
    if (!refreshToken) issues.push('Refresh token missing');
    if (!tokenExpiryTime) issues.push('Token expiry time missing');
    if (!refreshTokenExpiryTime) issues.push('Refresh token expiry time missing');
  }

  // 시간 일관성 확인
  let timesMatch = true;
  if (tokenCreatedAt && refreshTokenCreatedAt) {
    const tokenTime = parseInt(tokenCreatedAt);
    const refreshTime = parseInt(refreshTokenCreatedAt);
    const timeDiff = Math.abs(tokenTime - refreshTime);
    
    // 1초 이내 차이는 허용
    if (timeDiff > 1000) {
      timesMatch = false;
      issues.push(`Token creation times don't match (diff: ${timeDiff}ms)`);
    }
  }

  // 만료 시간 검증
  if (tokenExpiryTime && refreshTokenExpiryTime) {
    const accessExpiry = parseInt(tokenExpiryTime);
    const refreshExpiry = parseInt(refreshTokenExpiryTime);
    
    if (refreshExpiry <= accessExpiry) {
      issues.push('Refresh token expires before access token');
    }
  }

  return {
    allTokensPresent,
    timesMatch,
    issues
  };
}

/**
 * 수동 토큰 갱신 테스트
 */
export async function testManualTokenRefresh(): Promise<TokenTestReport['testResults']['manualRefreshTest']> {
  const startTime = Date.now();
  
  try {
    console.log('🧪 Starting manual token refresh test...');
    
    const hasRefreshToken = refreshTokenService.isRefreshTokenValid();
    console.log(`🔍 Has valid refresh token: ${hasRefreshToken}`);
    
    const success = await authService.refreshToken();
    const duration = Date.now() - startTime;
    
    if (success) {
      console.log(`✅ Manual refresh test successful (${duration}ms)`);
      return {
        success: true,
        method: hasRefreshToken ? 'refresh_token' : 'silent_auth',
        duration
      };
    } else {
      console.log(`❌ Manual refresh test failed (${duration}ms)`);
      return {
        success: false,
        method: 'failed',
        duration,
        error: 'Token refresh returned false'
      };
    }
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`❌ Manual refresh test error (${duration}ms):`, error);
    
    return {
      success: false,
      method: 'failed',
      duration,
      error: error.message || 'Unknown error'
    };
  }
}

/**
 * 토큰 만료 시뮬레이션 (테스트용)
 */
export function simulateTokenExpiry(secondsUntilExpiry: number = 300): void {
  const currentTime = Date.now();
  const newExpiryTime = currentTime + (secondsUntilExpiry * 1000);
  
  localStorage.setItem('tokenExpiryTime', newExpiryTime.toString());
  console.log(`🧪 Simulated token expiry set to ${secondsUntilExpiry} seconds from now`);
}

/**
 * 리프레시 토큰 만료 시뮬레이션 (테스트용)
 */
export function simulateRefreshTokenExpiry(secondsUntilExpiry: number = 86400): void {
  const currentTime = Date.now();
  const newExpiryTime = currentTime + (secondsUntilExpiry * 1000);
  
  localStorage.setItem('refreshTokenExpiryTime', newExpiryTime.toString());
  console.log(`🧪 Simulated refresh token expiry set to ${secondsUntilExpiry} seconds from now`);
}

/**
 * 종합 토큰 테스트 실행
 */
export async function runComprehensiveTokenTest(): Promise<TokenTestReport> {
  console.log('🧪 Running comprehensive token test...');
  
  const report: TokenTestReport = {
    timestamp: new Date().toISOString(),
    currentState: analyzeCurrentTokenState(),
    testResults: {}
  };

  // 저장소 일관성 검사
  report.testResults.storageConsistency = validateTokenStorageConsistency();
  
  // 토큰 유효성 검사
  report.testResults.tokenValidationTest = {
    accessTokenValid: authService.isAuthenticated(),
    refreshTokenValid: refreshTokenService.isRefreshTokenValid()
  };

  // 수동 갱신 테스트 (인증된 경우에만)
  if (report.currentState.isAuthenticated) {
    report.testResults.manualRefreshTest = await testManualTokenRefresh();
  }

  console.log('📊 Token test report:', report);
  return report;
}

/**
 * 토큰 갱신 시나리오 테스트
 */
export async function testTokenRefreshScenarios(): Promise<void> {
  console.log('🧪 Testing various token refresh scenarios...');
  
  // 시나리오 1: 정상적인 토큰 갱신
  console.log('\n🔬 Scenario 1: Normal token refresh');
  await runComprehensiveTokenTest();
  
  // 시나리오 2: Access token 만료 임박 상황
  console.log('\n🔬 Scenario 2: Access token near expiry');
  simulateTokenExpiry(240); // 4분 후 만료
  await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기
  await runComprehensiveTokenTest();
  
  // 시나리오 3: Access token 만료 직전 상황
  console.log('\n🔬 Scenario 3: Access token very near expiry');
  simulateTokenExpiry(120); // 2분 후 만료
  await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기
  await runComprehensiveTokenTest();
  
  console.log('🧪 Token refresh scenario testing completed');
}

/**
 * 개발자 콘솔에서 사용할 수 있는 헬퍼 함수들을 전역에 등록
 */
export function registerGlobalTokenTestHelpers(): void {
  if (typeof window !== 'undefined' && import.meta.env.DEV) {
    (window as any).tokenTest = {
      analyze: analyzeCurrentTokenState,
      validate: validateTokenStorageConsistency,
      refresh: testManualTokenRefresh,
      comprehensive: runComprehensiveTokenTest,
      scenarios: testTokenRefreshScenarios,
      simulateExpiry: simulateTokenExpiry,
      simulateRefreshExpiry: simulateRefreshTokenExpiry,
      getDebugInfo: () => authService.getAuthDebugInfo(),
      getRefreshInfo: () => refreshTokenService.getDebugInfo(),
      getManagerStatus: () => tokenRefreshManager.getRefreshStatus()
    };
    
    // Debug utility console logs removed
    console.log('  - tokenTest.simulateExpiry(seconds) - 만료 시뮬레이션');
  }
}

export default {
  analyzeCurrentTokenState,
  validateTokenStorageConsistency,
  testManualTokenRefresh,
  runComprehensiveTokenTest,
  testTokenRefreshScenarios,
  simulateTokenExpiry,
  simulateRefreshTokenExpiry,
  registerGlobalTokenTestHelpers
};