/**
 * Test Refresh Token with client secret
 */

export async function testRefreshTokenWithSecret() {
  console.log('=== 🧪 REFRESH TOKEN WITH SECRET TEST ===');
  
  // Get client secret from env
  const clientSecret = import.meta.env.VITE_CLIENT_SECRET || '';
  console.log('Client Secret configured:', !!clientSecret);
  
  // Get stored refresh token
  const { secureTokenStorage } = await import('../services/secureTokenStorage');
  const result = await secureTokenStorage.getRefreshToken();
  
  if (!result.token) {
    console.error('No refresh token found!');
    return;
  }
  
  const refreshToken = result.token;
  console.log('✅ Refresh token:', refreshToken.substring(0, 20) + '...');
  
  // Test with client_secret
  console.log('\n📡 Testing with client_secret...');
  try {
    const response = await fetch('http://localhost:8000/api/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: 'maxlab',
        client_secret: clientSecret
      })
    });
    
    console.log('Response status:', response.status);
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ SUCCESS! New tokens received:');
      console.log('- New access_token:', !!data.access_token);
      console.log('- New refresh_token:', !!data.refresh_token);
      console.log('- Token type:', data.token_type);
      console.log('- Expires in:', data.expires_in);
      console.log('- Scope:', data.scope);
    } else {
      console.error('❌ FAILED:', data);
    }
    
    return data;
  } catch (e) {
    console.error('Test error:', e);
  }
}

// Export to window
if (typeof window !== 'undefined') {
  (window as any).testRefreshTokenWithSecret = testRefreshTokenWithSecret;
  // Debug utility console logs removed
}