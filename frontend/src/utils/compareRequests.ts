/**
 * Compare refresh token requests
 */

export async function compareRequests() {
  console.log('=== 🔍 COMPARE REQUESTS ===');
  
  const { refreshTokenService } = await import('../services/refreshTokenService');
  const { secureTokenStorage } = await import('../services/secureTokenStorage');
  
  // Get refresh token
  const tokenResult = await secureTokenStorage.getRefreshToken();
  if (!tokenResult.token) {
    console.error('No refresh token!');
    return;
  }
  
  const refreshToken = tokenResult.token;
  const clientId = import.meta.env.VITE_CLIENT_ID || 'maxlab';
  const authUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000';
  
  // 1. Direct fetch (working)
  console.log('\n📡 Test 1: Direct fetch (working version)');
  const params1 = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId
  });
  
  console.log('Request URL:', `${authUrl}/api/oauth/token`);
  console.log('Request body:', params1.toString());
  
  try {
    const response1 = await fetch(`${authUrl}/api/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params1
    });
    
    console.log('Response:', response1.status, response1.statusText);
    if (!response1.ok) {
      const error1 = await response1.json();
      console.error('Error:', error1);
    } else {
      console.log('✅ SUCCESS');
    }
  } catch (e) {
    console.error('Fetch error:', e);
  }
  
  // 2. Check what refreshTokenService is actually sending
  console.log('\n📡 Test 2: What refreshTokenService sends');
  
  // Intercept fetch to see the actual request
  const originalFetch = window.fetch;
  let capturedRequest: any = null;
  
  window.fetch = function(...args) {
    const [url, options] = args;
    if (url.toString().includes('/api/oauth/token')) {
      console.log('🎯 Intercepted request:');
      console.log('- URL:', url);
      console.log('- Method:', options?.method);
      console.log('- Headers:', options?.headers);
      console.log('- Body:', options?.body);
      
      // Parse body if it's URLSearchParams
      if (options?.body instanceof URLSearchParams) {
        console.log('- Parsed body:', Object.fromEntries(options.body.entries()));
      }
      
      capturedRequest = { url, options };
    }
    return originalFetch.apply(this, args as any);
  };
  
  try {
    // Try refresh with service
    await refreshTokenService.refreshWithRefreshToken();
    console.log('✅ Service request succeeded');
  } catch (e: any) {
    console.error('❌ Service request failed:', e.message);
  }
  
  // Restore original fetch
  window.fetch = originalFetch;
  
  // 3. Compare the requests
  if (capturedRequest) {
    console.log('\n🔎 Comparison:');
    console.log('Direct fetch body:', params1.toString());
    console.log('Service body:', capturedRequest.options?.body?.toString());
    
    // Check for differences
    if (params1.toString() !== capturedRequest.options?.body?.toString()) {
      console.error('⚠️ Request bodies are different!');
    } else {
      console.log('✅ Request bodies are identical');
    }
  }
  
  console.log('\n=== 🔍 END COMPARE ===');
}

// Export to window
if (typeof window !== 'undefined') {
  (window as any).compareRequests = compareRequests;
  // Debug utility console logs removed
}