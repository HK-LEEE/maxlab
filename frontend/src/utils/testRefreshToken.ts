/**
 * Test Refresh Token directly
 */

export async function testRefreshToken() {
  console.log('=== 🧪 REFRESH TOKEN TEST ===');
  
  // Get stored refresh token
  const refreshToken = localStorage.getItem('maxlab_secure_refresh_token_encrypted');
  if (!refreshToken) {
    console.error('No refresh token found!');
    return;
  }
  
  // Decrypt the token
  let actualToken: string;
  try {
    const { secureTokenStorage } = await import('../services/secureTokenStorage');
    const result = await secureTokenStorage.getRefreshToken();
    if (!result.token) {
      console.error('Failed to decrypt refresh token');
      return;
    }
    actualToken = result.token;
    console.log('✅ Refresh token decrypted:', actualToken.substring(0, 20) + '...');
  } catch (e) {
    console.error('Decryption error:', e);
    return;
  }
  
  // Test 1: Direct API call without client_secret
  console.log('\n📡 Test 1: Without client_secret');
  try {
    const response1 = await fetch('http://localhost:8000/api/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: actualToken,
        client_id: 'maxlab'
      })
    });
    
    console.log('Response status:', response1.status);
    const data1 = await response1.json();
    console.log('Response:', data1);
  } catch (e) {
    console.error('Test 1 error:', e);
  }
  
  // Test 2: Try with empty client_secret
  console.log('\n📡 Test 2: With empty client_secret');
  try {
    const response2 = await fetch('http://localhost:8000/api/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: actualToken,
        client_id: 'maxlab',
        client_secret: ''
      })
    });
    
    console.log('Response status:', response2.status);
    const data2 = await response2.json();
    console.log('Response:', data2);
  } catch (e) {
    console.error('Test 2 error:', e);
  }
  
  // Test 3: Check if token was already used
  console.log('\n📋 Token metadata:');
  console.log('- Created at:', new Date(parseInt(localStorage.getItem('refreshTokenCreatedAt') || '0')).toISOString());
  console.log('- Expires at:', new Date(parseInt(localStorage.getItem('refreshTokenExpiryTime') || '0')).toISOString());
  console.log('- Last refresh attempt:', localStorage.getItem('lastTokenRefresh') || 'Never');
  
  console.log('\n=== 🧪 END TEST ===');
}

// Export to window
if (typeof window !== 'undefined') {
  (window as any).testRefreshToken = testRefreshToken;
  // Debug utility console logs removed
}