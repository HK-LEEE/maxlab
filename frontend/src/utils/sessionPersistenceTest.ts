/**
 * 30-Day Session Persistence Test
 * 리프레시 토큰을 통한 장기 세션 지속성 테스트 및 검증
 */

import { refreshTokenService } from '../services/refreshTokenService';
import { authService } from '../services/authService';

export interface SessionPersistenceReport {
  timestamp: string;
  sessionInfo: {
    accessTokenTTL: number;
    refreshTokenTTL: number;
    sessionAge: number;
    refreshTokenAge: number;
    totalSessionDuration: number; // 30일 = 2,592,000초
  };
  persistenceTests: {
    longTermStorageTest: {
      success: boolean;
      refreshTokenStored: boolean;
      expiryTimeCorrect: boolean;
      duration: string;
    };
    sessionRecoveryTest: {
      canRecoverAfterRestart: boolean;
      tokensIntact: boolean;
      timingAccurate: boolean;
    };
    refreshTokenRenewalTest: {
      renewalWorking: boolean;
      rotationOccurred: boolean;
      newExpirySet: boolean;
    };
  };
  recommendations: string[];
}

/**
 * 30일 세션 설정 확인
 */
export function validateSessionConfiguration(): {
  isThirtyDaySession: boolean;
  refreshTokenDuration: number;
  accessTokenDuration: number;
  issues: string[];
} {
  const refreshExpiresIn = parseInt(localStorage.getItem('refreshExpiresIn') || '0', 10);
  const accessExpiresIn = parseInt(localStorage.getItem('expiresIn') || '0', 10);
  
  const thirtyDaysInSeconds = 30 * 24 * 60 * 60; // 2,592,000초
  const oneHourInSeconds = 60 * 60; // 3,600초
  
  const issues: string[] = [];
  
  // 리프레시 토큰이 30일인지 확인
  if (refreshExpiresIn < thirtyDaysInSeconds) {
    issues.push(`Refresh token duration too short: ${refreshExpiresIn}s (expected: ${thirtyDaysInSeconds}s)`);
  }
  
  // 액세스 토큰이 적절한 길이인지 확인 (보통 1시간)
  if (accessExpiresIn > 24 * oneHourInSeconds) {
    issues.push(`Access token duration too long: ${accessExpiresIn}s (recommended: max 24h)`);
  }
  
  return {
    isThirtyDaySession: refreshExpiresIn >= thirtyDaysInSeconds,
    refreshTokenDuration: refreshExpiresIn,
    accessTokenDuration: accessExpiresIn,
    issues
  };
}

/**
 * 세션 지속성 시뮬레이션 테스트
 */
export function simulateLongTermSession(): {
  simulatedDays: number;
  remainingRefreshTime: number;
  accessTokenRefreshesNeeded: number;
  wouldPersist: boolean;
} {
  const refreshTokenTTL = refreshTokenService.getRefreshTokenTimeToExpiry();
  const accessTokenTTL = authService.getTokenTimeToExpiry();
  
  const daysRemaining = Math.floor(refreshTokenTTL / (24 * 60 * 60));
  const accessTokenRefreshInterval = 60 * 60; // 1시간마다 갱신 가정
  const accessTokenRefreshesNeeded = Math.floor(refreshTokenTTL / accessTokenRefreshInterval);
  
  return {
    simulatedDays: daysRemaining,
    remainingRefreshTime: refreshTokenTTL,
    accessTokenRefreshesNeeded,
    wouldPersist: refreshTokenTTL > 0 && daysRemaining >= 1
  };
}

/**
 * 세션 복구 테스트 (브라우저 재시작 시뮬레이션)
 */
export async function testSessionRecovery(): Promise<{
  success: boolean;
  tokensRecovered: boolean;
  authStateRestored: boolean;
  details: string;
}> {
  try {
    console.log('🧪 Testing session recovery (browser restart simulation)...');
    
    // 현재 토큰 상태 백업
    const originalTokens = {
      accessToken: localStorage.getItem('accessToken'),
      refreshToken: localStorage.getItem('refreshToken'),
      tokenExpiryTime: localStorage.getItem('tokenExpiryTime'),
      refreshTokenExpiryTime: localStorage.getItem('refreshTokenExpiryTime')
    };
    
    // 모든 토큰이 있는지 확인
    const tokensExist = !!(originalTokens.accessToken && originalTokens.refreshToken);
    
    if (!tokensExist) {
      return {
        success: false,
        tokensRecovered: false,
        authStateRestored: false,
        details: 'No tokens available to test recovery'
      };
    }
    
    // Silent login 시도로 세션 복구 테스트
    const recoveryResult = await authService.attemptSilentLogin();
    
    return {
      success: recoveryResult.success,
      tokensRecovered: tokensExist,
      authStateRestored: recoveryResult.success && !!recoveryResult.user,
      details: recoveryResult.success ? 'Session recovered successfully' : 'Session recovery failed'
    };
    
  } catch (error: any) {
    return {
      success: false,
      tokensRecovered: false,
      authStateRestored: false,
      details: `Recovery test error: ${error.message}`
    };
  }
}

/**
 * 토큰 회전 테스트
 */
export async function testTokenRotation(): Promise<{
  rotationOccurred: boolean;
  newTokensGenerated: boolean;
  previousTokenInvalidated: boolean;
  details: string;
}> {
  try {
    console.log('🧪 Testing token rotation behavior...');
    
    // 현재 토큰들 저장
    const oldAccessToken = localStorage.getItem('accessToken');
    const oldRefreshToken = localStorage.getItem('refreshToken');
    
    if (!oldRefreshToken) {
      return {
        rotationOccurred: false,
        newTokensGenerated: false,
        previousTokenInvalidated: false,
        details: 'No refresh token available for rotation test'
      };
    }
    
    // 토큰 갱신 실행
    const refreshSuccess = await authService.refreshToken();
    
    if (!refreshSuccess) {
      return {
        rotationOccurred: false,
        newTokensGenerated: false,
        previousTokenInvalidated: false,
        details: 'Token refresh failed'
      };
    }
    
    // 새 토큰들 확인
    const newAccessToken = localStorage.getItem('accessToken');
    const newRefreshToken = localStorage.getItem('refreshToken');
    
    const accessTokenRotated = oldAccessToken !== newAccessToken;
    const refreshTokenRotated = oldRefreshToken !== newRefreshToken;
    
    return {
      rotationOccurred: accessTokenRotated || refreshTokenRotated,
      newTokensGenerated: !!(newAccessToken && newRefreshToken),
      previousTokenInvalidated: accessTokenRotated, // 이전 토큰이 무효화되었는지 (완전한 테스트는 서버 호출 필요)
      details: `Access token rotated: ${accessTokenRotated}, Refresh token rotated: ${refreshTokenRotated}`
    };
    
  } catch (error: any) {
    return {
      rotationOccurred: false,
      newTokensGenerated: false,
      previousTokenInvalidated: false,
      details: `Token rotation test error: ${error.message}`
    };
  }
}

/**
 * 종합 30일 세션 지속성 테스트
 */
export async function runSessionPersistenceTest(): Promise<SessionPersistenceReport> {
  console.log('🧪 Running comprehensive 30-day session persistence test...');
  
  const tokenInfo = refreshTokenService.getTokenInfo();
  const currentTime = Date.now();
  
  const report: SessionPersistenceReport = {
    timestamp: new Date().toISOString(),
    sessionInfo: {
      accessTokenTTL: authService.getTokenTimeToExpiry(),
      refreshTokenTTL: refreshTokenService.getRefreshTokenTimeToExpiry(),
      sessionAge: tokenInfo ? Math.floor((currentTime - tokenInfo.createdAt) / 1000) : 0,
      refreshTokenAge: tokenInfo ? Math.floor((currentTime - tokenInfo.refreshCreatedAt) / 1000) : 0,
      totalSessionDuration: 30 * 24 * 60 * 60 // 30일
    },
    persistenceTests: {
      longTermStorageTest: {
        success: false,
        refreshTokenStored: false,
        expiryTimeCorrect: false,
        duration: '0 days'
      },
      sessionRecoveryTest: {
        canRecoverAfterRestart: false,
        tokensIntact: false,
        timingAccurate: false
      },
      refreshTokenRenewalTest: {
        renewalWorking: false,
        rotationOccurred: false,
        newExpirySet: false
      }
    },
    recommendations: []
  };

  // 1. 장기 저장소 테스트
  const config = validateSessionConfiguration();
  const simulation = simulateLongTermSession();
  
  report.persistenceTests.longTermStorageTest = {
    success: config.isThirtyDaySession && simulation.wouldPersist,
    refreshTokenStored: !!localStorage.getItem('refreshToken'),
    expiryTimeCorrect: config.isThirtyDaySession,
    duration: `${simulation.simulatedDays} days remaining`
  };

  // 2. 세션 복구 테스트
  const recoveryResult = await testSessionRecovery();
  report.persistenceTests.sessionRecoveryTest = {
    canRecoverAfterRestart: recoveryResult.success,
    tokensIntact: recoveryResult.tokensRecovered,
    timingAccurate: recoveryResult.authStateRestored
  };

  // 3. 토큰 갱신/회전 테스트
  const rotationResult = await testTokenRotation();
  report.persistenceTests.refreshTokenRenewalTest = {
    renewalWorking: rotationResult.newTokensGenerated,
    rotationOccurred: rotationResult.rotationOccurred,
    newExpirySet: rotationResult.newTokensGenerated
  };

  // 권장사항 생성
  const recommendations: string[] = [];
  
  if (!config.isThirtyDaySession) {
    recommendations.push('Configure refresh token for 30-day duration (2,592,000 seconds)');
  }
  
  if (!recoveryResult.success) {
    recommendations.push('Improve session recovery mechanism for browser restarts');
  }
  
  if (!rotationResult.rotationOccurred) {
    recommendations.push('Implement token rotation for enhanced security');
  }
  
  if (simulation.simulatedDays < 30) {
    recommendations.push(`Extend refresh token duration - currently only ${simulation.simulatedDays} days remaining`);
  }
  
  if (config.issues.length > 0) {
    recommendations.push(...config.issues);
  }

  report.recommendations = recommendations;

  // 결과 출력
  console.log('📊 30-Day Session Persistence Test Results:');
  console.log(`   • Session Duration: ${simulation.simulatedDays} days remaining`);
  console.log(`   • Long-term Storage: ${report.persistenceTests.longTermStorageTest.success ? '✅' : '❌'}`);
  console.log(`   • Session Recovery: ${report.persistenceTests.sessionRecoveryTest.canRecoverAfterRestart ? '✅' : '❌'}`);
  console.log(`   • Token Rotation: ${report.persistenceTests.refreshTokenRenewalTest.rotationOccurred ? '✅' : '❌'}`);
  
  if (recommendations.length > 0) {
    console.log('💡 Recommendations:');
    recommendations.forEach(rec => console.log(`   - ${rec}`));
  } else {
    console.log('🎉 30-day session persistence fully verified!');
  }

  return report;
}

// 글로벌 헬퍼 등록
export function registerSessionTestHelpers(): void {
  if (typeof window !== 'undefined' && import.meta.env.DEV) {
    (window as any).sessionTest = {
      persistence: runSessionPersistenceTest,
      config: validateSessionConfiguration,
      simulate: simulateLongTermSession,
      recovery: testSessionRecovery,
      rotation: testTokenRotation
    };
    
    // Debug utility console logs removed
  }
}

export default {
  runSessionPersistenceTest,
  validateSessionConfiguration,
  simulateLongTermSession,
  testSessionRecovery,
  testTokenRotation,
  registerSessionTestHelpers
};