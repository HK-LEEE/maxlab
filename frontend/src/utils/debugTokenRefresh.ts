/**
 * Debug Token Refresh Error
 */

export async function debugTokenRefresh() {
  console.log('=== 🔍 TOKEN REFRESH DEBUG ===');
  
  const { refreshTokenService } = await import('../services/refreshTokenService');
  const { secureTokenStorage } = await import('../services/secureTokenStorage');
  
  // 1. Get current refresh token
  const tokenResult = await secureTokenStorage.getRefreshToken();
  if (!tokenResult.token) {
    console.error('❌ No refresh token found!');
    return;
  }
  
  const refreshToken = tokenResult.token;
  console.log('📋 Current refresh token:', refreshToken.substring(0, 20) + '...');
  
  // 2. Check client configuration
  const clientId = import.meta.env.VITE_CLIENT_ID || 'maxlab';
  const clientSecret = import.meta.env.VITE_CLIENT_SECRET || '';
  
  console.log('\n🔧 Client Configuration:');
  console.log('- Client ID:', clientId);
  console.log('- Client Secret:', clientSecret ? '***configured***' : 'NOT configured (public client)');
  
  // 3. Test direct API call with detailed error capture
  console.log('\n📡 Testing refresh token API call...');
  
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId
  });
  
  // Only add client_secret if it exists
  if (clientSecret) {
    params.append('client_secret', clientSecret);
  }
  
  console.log('Request parameters:', Object.fromEntries(params.entries()));
  
  try {
    const response = await fetch('http://localhost:8000/api/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params
    });
    
    const responseData = await response.json();
    
    console.log('\n📨 Response:');
    console.log('- Status:', response.status, response.statusText);
    console.log('- Headers:', Object.fromEntries(response.headers.entries()));
    console.log('- Body:', responseData);
    
    if (!response.ok) {
      console.error('\n❌ Error Details:');
      console.error('- Error:', responseData.error || 'Unknown error');
      console.error('- Error Description:', responseData.error_description || 'No description');
      console.error('- Error URI:', responseData.error_uri || 'No URI');
      
      // Common error interpretations
      if (responseData.error === 'invalid_grant') {
        console.error('\n💡 Invalid Grant - Possible causes:');
        console.error('1. Refresh token has already been used (token rotation)');
        console.error('2. Refresh token has expired');
        console.error('3. Refresh token was revoked');
        console.error('4. Token belongs to different client');
      } else if (responseData.error === 'invalid_client') {
        console.error('\n💡 Invalid Client - Possible causes:');
        console.error('1. Client ID is incorrect');
        console.error('2. Client secret is required but not provided');
        console.error('3. Client secret is incorrect');
        console.error('4. Client is disabled or doesn\'t exist');
      } else if (responseData.error === 'unsupported_grant_type') {
        console.error('\n💡 Unsupported Grant Type - Server doesn\'t support refresh_token grant');
      }
    } else {
      console.log('\n✅ Success! New tokens received');
    }
    
  } catch (error) {
    console.error('\n❌ Network error:', error);
  }
  
  console.log('\n=== 🔍 END DEBUG ===');
}

// Export to window
if (typeof window !== 'undefined') {
  (window as any).debugTokenRefresh = debugTokenRefresh;
  // Debug utility console log removed
}