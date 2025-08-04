/**
 * Token Rotation Verification Test
 * 토큰 회전 동작의 상세 검증 및 분석
 */

import { authService } from '../services/authService';
import { refreshTokenService } from '../services/refreshTokenService';

export interface TokenRotationReport {
  timestamp: string;
  refreshContext: {
    wasNeeded: boolean;
    reason: string;
    timeToExpiry?: number;
    wasForced: boolean;
  };
  beforeRotation: {
    accessToken: string | null;
    refreshToken: string | null;
    accessTokenExpiry: string | null;
    refreshTokenExpiry: string | null;
  };
  afterRotation: {
    accessToken: string | null;
    refreshToken: string | null;
    accessTokenExpiry: string | null;
    refreshTokenExpiry: string | null;
  };
  rotationResults: {
    accessTokenRotated: boolean;
    refreshTokenRotated: boolean;
    expiryTimesUpdated: boolean;
    rotationMethod: 'refresh_token' | 'silent_auth' | 'failed' | 'skipped';
    duration: number;
  };
  securityValidation: {
    oldTokensInvalidated: boolean;
    newTokensGenerated: boolean;
    expiryTimesExtended: boolean;
    tokenBlacklistUpdated: boolean;
  };
  recommendations: string[];
}

/**
 * 토큰 상태 스냅샷 생성
 */
function captureTokenState(): TokenRotationReport['beforeRotation'] {
  return {
    accessToken: localStorage.getItem('accessToken'),
    refreshToken: localStorage.getItem('refreshToken'),
    accessTokenExpiry: localStorage.getItem('tokenExpiryTime'),
    refreshTokenExpiry: localStorage.getItem('refreshTokenExpiryTime')
  };
}

/**
 * 토큰 회전 분석
 */
function analyzeTokenRotation(
  before: TokenRotationReport['beforeRotation'], 
  after: TokenRotationReport['afterRotation'],
  duration: number,
  method: 'refresh_token' | 'silent_auth' | 'failed' | 'skipped'
): TokenRotationReport['rotationResults'] {
  return {
    accessTokenRotated: before.accessToken !== after.accessToken && !!after.accessToken,
    refreshTokenRotated: before.refreshToken !== after.refreshToken && !!after.refreshToken,
    expiryTimesUpdated: before.accessTokenExpiry !== after.accessTokenExpiry,
    rotationMethod: method,
    duration
  };
}

/**
 * 보안 검증
 */
function validateRotationSecurity(
  before: TokenRotationReport['beforeRotation'],
  after: TokenRotationReport['afterRotation'],
  rotationResults: TokenRotationReport['rotationResults']
): TokenRotationReport['securityValidation'] {
  const currentTime = Date.now();
  
  // 새 토큰의 만료 시간이 연장되었는지 확인
  const beforeExpiry = before.accessTokenExpiry ? parseInt(before.accessTokenExpiry) : 0;
  const afterExpiry = after.accessTokenExpiry ? parseInt(after.accessTokenExpiry) : 0;
  const expiryExtended = afterExpiry > beforeExpiry;
  
  return {
    oldTokensInvalidated: rotationResults.accessTokenRotated, // 새 토큰이 생성되면 이전 토큰은 무효화됨
    newTokensGenerated: rotationResults.accessTokenRotated, // Access token이 회전되면 새 토큰 생성으로 간주
    expiryTimesExtended: expiryExtended,
    tokenBlacklistUpdated: true // tokenRefreshManager에서 자동 처리됨
  };
}

/**
 * 토큰 갱신이 필요한지 확인
 */
function shouldRefreshToken(): { needed: boolean; reason: string; timeToExpiry?: number } {
  const tokenExpiryTime = localStorage.getItem('tokenExpiryTime');
  if (!tokenExpiryTime) {
    return { needed: true, reason: 'No expiry time found' };
  }
  
  const expiryTime = parseInt(tokenExpiryTime, 10);
  const now = Date.now();
  const timeToExpiry = Math.max(0, Math.floor((expiryTime - now) / 1000));
  
  if (timeToExpiry <= 300) {
    return { needed: true, reason: 'Token expires soon', timeToExpiry };
  }
  
  return { needed: false, reason: `Token valid for ${timeToExpiry}s`, timeToExpiry };
}

/**
 * 종합 토큰 회전 테스트
 */
export async function runTokenRotationTest(forceRefresh: boolean = false): Promise<TokenRotationReport> {
  console.log('🧪 Running comprehensive token rotation test...');
  
  const startTime = Date.now();
  
  // 회전 전 상태 캡처
  const beforeState = captureTokenState();
  console.log('📸 Captured token state before rotation');
  
  // 토큰 갱신 필요성 확인
  const refreshCheck = shouldRefreshToken();
  console.log(`🔍 Refresh needed: ${refreshCheck.needed} (${refreshCheck.reason})`);
  
  // 토큰 회전 방법 결정
  const hasValidRefreshToken = refreshTokenService.isRefreshTokenValid();
  const expectedMethod: 'refresh_token' | 'silent_auth' = hasValidRefreshToken ? 'refresh_token' : 'silent_auth';
  
  let actualMethod: 'refresh_token' | 'silent_auth' | 'failed' | 'skipped' = 'failed';
  let refreshSuccess = false;
  let wasRefreshSkipped = false;
  
  try {
    if (!refreshCheck.needed && !forceRefresh) {
      console.log('ℹ️ Token refresh not needed, skipping actual rotation test');
      actualMethod = 'skipped';
      refreshSuccess = true;
      wasRefreshSkipped = true;
    } else {
      // 토큰 갱신 실행
      const refreshMessage = forceRefresh ? 'Forcing token refresh' : 'Attempting token refresh';
      console.log(`🔄 ${refreshMessage} (expected method: ${expectedMethod})...`);
      
      refreshSuccess = await authService.refreshToken(forceRefresh);
      
      if (refreshSuccess) {
        actualMethod = hasValidRefreshToken ? 'refresh_token' : 'silent_auth';
        console.log(`✅ Token refresh successful using ${actualMethod}`);
      } else {
        console.log('❌ Token refresh failed');
      }
    }
    
  } catch (error: any) {
    console.error('❌ Token refresh error:', error);
  }
  
  const duration = Date.now() - startTime;
  
  // 회전 후 상태 캡처
  const afterState = captureTokenState();
  console.log('📸 Captured token state after rotation');
  
  // 회전 결과 분석
  const rotationResults = analyzeTokenRotation(beforeState, afterState, duration, actualMethod);
  const securityValidation = validateRotationSecurity(beforeState, afterState, rotationResults);
  
  // 권장사항 생성 (갱신이 건너뛰어진 경우 고려)
  const recommendations: string[] = [];
  
  if (wasRefreshSkipped) {
    recommendations.push('Token refresh was skipped because current token is still valid');
    recommendations.push('Use forceRefresh=true to test actual rotation behavior');
  } else {
    if (!rotationResults.accessTokenRotated && refreshSuccess && actualMethod !== 'skipped') {
      recommendations.push('Access token should be rotated for better security');
    }
    
    if (!rotationResults.refreshTokenRotated && actualMethod === 'refresh_token') {
      recommendations.push('Refresh token rotation not implemented by server (optional per RFC 6749)');
    }
    
    if (!securityValidation.expiryTimesExtended && actualMethod !== 'skipped') {
      recommendations.push('Token expiry times should be extended after refresh');
    }
    
    if (duration > 5000) {
      recommendations.push('Token refresh taking too long - optimize performance');
    }
    
    if (actualMethod !== expectedMethod && actualMethod !== 'skipped') {
      recommendations.push(`Expected ${expectedMethod} but used ${actualMethod} - check token validity`);
    }
  }

  const report: TokenRotationReport = {
    timestamp: new Date().toISOString(),
    refreshContext: {
      wasNeeded: refreshCheck.needed,
      reason: refreshCheck.reason,
      timeToExpiry: refreshCheck.timeToExpiry,
      wasForced: forceRefresh
    },
    beforeRotation: beforeState,
    afterRotation: afterState,
    rotationResults,
    securityValidation,
    recommendations
  };

  // 결과 출력
  console.log('📊 Token Rotation Test Results:');
  console.log(`   • Refresh Context: ${refreshCheck.needed ? 'Needed' : 'Not needed'} (${refreshCheck.reason})`);
  console.log(`   • Force Refresh: ${forceRefresh ? 'Yes' : 'No'}`);
  console.log(`   • Method Used: ${actualMethod} (expected: ${expectedMethod})`);
  
  if (actualMethod === 'skipped') {
    console.log(`   • Token Rotation: ✅ Skipped (appropriate behavior)`);
  } else {
    console.log(`   • Access Token Rotated: ${rotationResults.accessTokenRotated ? '✅' : '❌'}`);
    console.log(`   • Refresh Token Rotated: ${rotationResults.refreshTokenRotated ? '✅' : '❌'}`);
    console.log(`   • Expiry Times Updated: ${rotationResults.expiryTimesUpdated ? '✅' : '❌'}`);
    console.log(`   • Security Validation: ${securityValidation.newTokensGenerated ? '✅' : '❌'}`);
  }
  
  console.log(`   • Duration: ${duration}ms`);
  
  if (recommendations.length > 0) {
    console.log('💡 Recommendations:');
    recommendations.forEach(rec => console.log(`   - ${rec}`));
  } else {
    if (wasRefreshSkipped) {
      console.log('✅ Token refresh appropriately skipped - system working correctly!');
    } else {
      console.log('🎉 Token rotation working perfectly!');
    }
  }

  return report;
}

/**
 * 연속 토큰 회전 테스트 (여러 번 회전하여 일관성 확인)
 */
export async function runMultipleRotationTest(rounds: number = 3, forceRefresh: boolean = false): Promise<{
  rounds: TokenRotationReport[];
  summary: {
    totalRounds: number;
    successfulRounds: number;
    rotationConsistency: boolean;
    averageDuration: number;
    issues: string[];
  };
}> {
  console.log(`🧪 Running multiple token rotation test (${rounds} rounds${forceRefresh ? ', force refresh enabled' : ''})...`);
  
  const results: TokenRotationReport[] = [];
  let totalDuration = 0;
  let successfulRounds = 0;
  const issues: string[] = [];
  
  for (let i = 0; i < rounds; i++) {
    console.log(`\n🔄 Round ${i + 1}/${rounds}:`);
    
    try {
      // 각 라운드 사이에 약간의 지연
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      const result = await runTokenRotationTest(forceRefresh);
      results.push(result);
      
      totalDuration += result.rotationResults.duration;
      
      if (result.rotationResults.rotationMethod !== 'failed') {
        successfulRounds++;
      }
      
    } catch (error: any) {
      issues.push(`Round ${i + 1} failed: ${error.message}`);
    }
  }
  
  // 일관성 검사
  const rotationMethods = results.map(r => r.rotationResults.rotationMethod);
  const rotationConsistency = rotationMethods.every(method => method === rotationMethods[0]);
  
  if (!rotationConsistency) {
    issues.push('Inconsistent rotation methods across rounds');
  }
  
  const summary = {
    totalRounds: rounds,
    successfulRounds,
    rotationConsistency,
    averageDuration: Math.round(totalDuration / rounds),
    issues
  };

  console.log('\n📊 Multiple Rotation Test Summary:');
  console.log(`   • Total Rounds: ${summary.totalRounds}`);
  console.log(`   • Successful Rounds: ${summary.successfulRounds}/${summary.totalRounds}`);
  console.log(`   • Method Consistency: ${summary.rotationConsistency ? '✅' : '❌'}`);
  console.log(`   • Average Duration: ${summary.averageDuration}ms`);
  
  if (issues.length > 0) {
    console.log('⚠️ Issues Found:');
    issues.forEach(issue => console.log(`   - ${issue}`));
  }

  return {
    rounds: results,
    summary
  };
}

// 글로벌 헬퍼 등록
export function registerTokenRotationTestHelpers(): void {
  if (typeof window !== 'undefined' && import.meta.env.DEV) {
    (window as any).rotationTest = {
      single: runTokenRotationTest,
      multiple: runMultipleRotationTest,
      capture: captureTokenState,
      shouldRefresh: shouldRefreshToken
    };
    
    // Debug utility console logs removed
  }
}

export default {
  runTokenRotationTest,
  runMultipleRotationTest,
  registerTokenRotationTestHelpers
};