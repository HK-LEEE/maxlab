/**
 * Auth Debug Utility
 * 인증 상태를 디버깅하기 위한 유틸리티
 */

import { authService } from '../services/authService';
import { refreshTokenService } from '../services/refreshTokenService';
import { secureTokenStorage } from '../services/secureTokenStorage';

export async function debugAuthState() {
  console.log('=== 🔍 AUTH DEBUG START ===');
  
  // 1. 기본 인증 상태
  console.log('\n📋 Basic Auth State:');
  console.log('- isAuthenticated:', authService.isAuthenticated());
  console.log('- needsTokenRefresh:', authService.needsTokenRefresh());
  console.log('- tokenTimeToExpiry:', authService.getTokenTimeToExpiry(), 'seconds');
  
  // 2. Access Token 정보
  console.log('\n🎫 Access Token Info:');
  const accessToken = localStorage.getItem('accessToken');
  console.log('- hasAccessToken:', !!accessToken);
  console.log('- tokenType:', localStorage.getItem('tokenType'));
  console.log('- scope:', localStorage.getItem('scope'));
  console.log('- expiresIn:', localStorage.getItem('expiresIn'));
  console.log('- tokenExpiryTime:', localStorage.getItem('tokenExpiryTime') ? new Date(parseInt(localStorage.getItem('tokenExpiryTime')!)).toISOString() : 'N/A');
  console.log('- tokenCreatedAt:', localStorage.getItem('tokenCreatedAt') ? new Date(parseInt(localStorage.getItem('tokenCreatedAt')!)).toISOString() : 'N/A');
  
  // 3. Refresh Token 정보
  console.log('\n🔄 Refresh Token Info:');
  const refreshTokenDebug = await refreshTokenService.getDebugInfo();
  console.log('- hasRefreshToken:', refreshTokenDebug.hasRefreshToken);
  console.log('- isRefreshTokenValid:', refreshTokenDebug.isRefreshTokenValid);
  console.log('- refreshTokenTimeToExpiry:', refreshTokenDebug.refreshTokenTimeToExpiry, 'seconds');
  console.log('- needsRefreshTokenRenewal:', refreshTokenDebug.needsRefreshTokenRenewal);
  console.log('- refreshTokenExpiryTime:', refreshTokenDebug.refreshTokenExpiryTime);
  
  // 4. 암호화 스토리지 상태
  console.log('\n🔐 Secure Storage Status:');
  const storageStatus = await secureTokenStorage.getStorageStatus();
  console.log('- encryptionSupported:', storageStatus.encryptionSupported);
  console.log('- hasEncryptedToken:', storageStatus.hasEncryptedToken);
  console.log('- hasPlaintextToken:', storageStatus.hasPlaintextToken);
  console.log('- canMigrate:', storageStatus.canMigrate);
  console.log('- recommendation:', storageStatus.recommendation);
  
  // 5. 사용자 정보
  console.log('\n👤 User Info:');
  const user = authService.getStoredUser();
  if (user) {
    console.log('- id:', user.id);
    console.log('- email:', user.email);
    console.log('- username:', user.username);
    console.log('- is_admin:', user.is_admin);
    console.log('- groups:', user.groups);
  } else {
    console.log('- No user data found');
  }
  
  // 6. 서버 연결 상태
  console.log('\n🌐 Server Connectivity:');
  try {
    const connectivity = await refreshTokenService.checkServerConnectivity();
    console.log('- isOnline:', connectivity.isOnline);
    console.log('- serverUrl:', connectivity.serverUrl);
    console.log('- clientId:', connectivity.clientId);
    console.log('- hasClientSecret:', connectivity.hasClientSecret);
    console.log('- responseTime:', connectivity.responseTime, 'ms');
    if (connectivity.error) {
      console.log('- error:', connectivity.error);
    }
  } catch (error) {
    console.log('- Server connectivity check failed:', error);
  }
  
  // 7. 전체 디버그 정보
  console.log('\n📊 Full Debug Info:');
  const fullDebug = authService.getAuthDebugInfo();
  console.log(JSON.stringify(fullDebug, null, 2));
  
  console.log('\n=== 🔍 AUTH DEBUG END ===');
  
  return {
    isAuthenticated: authService.isAuthenticated(),
    hasAccessToken: !!accessToken,
    hasRefreshToken: refreshTokenDebug.hasRefreshToken,
    needsRefresh: authService.needsTokenRefresh(),
    storageStatus,
    user,
    fullDebug
  };
}

// 브라우저 콘솔에서 쉽게 사용할 수 있도록 전역 함수로 노출
if (typeof window !== 'undefined') {
  (window as any).debugAuth = debugAuthState;
  (window as any).authService = authService;
  (window as any).refreshTokenService = refreshTokenService;
  // Debug utility console logs removed
}