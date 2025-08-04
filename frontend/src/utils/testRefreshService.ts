/**
 * Test RefreshTokenService directly
 */

export async function testRefreshService() {
  console.log('=== 🧪 REFRESH SERVICE TEST ===');
  
  const { refreshTokenService } = await import('../services/refreshTokenService');
  
  // Check service configuration
  const debugInfo = await refreshTokenService.getDebugInfo();
  console.log('📋 Service Configuration:');
  console.log('- Client ID:', debugInfo.clientId);
  console.log('- Has Client Secret:', debugInfo.hasClientSecret);
  console.log('- Has Refresh Token:', debugInfo.hasRefreshToken);
  
  if (!debugInfo.hasRefreshToken) {
    console.error('❌ No refresh token!');
    return;
  }
  
  // Try refresh
  console.log('\n🔄 Attempting refresh via service...');
  
  try {
    const result = await refreshTokenService.refreshWithRefreshToken();
    console.log('✅ SUCCESS!');
    console.log('- New access token:', !!result.access_token);
    console.log('- New refresh token:', !!result.refresh_token);
    console.log('- Expires in:', result.expires_in);
    return result;
  } catch (error: any) {
    console.error('❌ FAILED:', error.message);
    console.error('Full error:', error);
    
    // Check if it's a network error or token error
    if (error.message.includes('network')) {
      console.error('💡 Network issue - check if OAuth server is running');
    } else if (error.message.includes('invalid')) {
      console.error('💡 Token invalid - may need to login again');
    }
  }
  
  console.log('\n=== 🧪 END TEST ===');
}

// Export to window
if (typeof window !== 'undefined') {
  (window as any).testRefreshService = testRefreshService;
  // Debug utility console logs removed
}