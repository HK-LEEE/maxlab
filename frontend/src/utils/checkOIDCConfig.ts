/**
 * Check OIDC Configuration
 */

export async function checkOIDCConfig() {
  console.log('=== 🔍 OIDC CONFIGURATION CHECK ===');
  
  const authUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000';
  
  // Test all available endpoints
  const endpoints = [
    '/api/oauth/.well-known/oauth-authorization-server',
    '/api/oauth/.well-known/openid-configuration',
    '/.well-known/openid-configuration'
  ];
  
  for (const endpoint of endpoints) {
    console.log(`\n📡 Testing: ${authUrl}${endpoint}`);
    
    try {
      const response = await fetch(`${authUrl}${endpoint}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const config = await response.json();
        console.log('✅ SUCCESS - Configuration found:');
        console.log('- Issuer:', config.issuer);
        console.log('- Authorization endpoint:', config.authorization_endpoint);
        console.log('- Token endpoint:', config.token_endpoint);
        console.log('- JWKS URI:', config.jwks_uri);
        console.log('- Supported scopes:', config.scopes_supported);
        console.log('- Response types:', config.response_types_supported);
        console.log('- Grant types:', config.grant_types_supported);
        
        // Check if refresh_token grant is supported
        if (config.grant_types_supported?.includes('refresh_token')) {
          console.log('✅ Refresh token grant is supported');
        } else {
          console.log('⚠️ Refresh token grant support not explicitly listed');
        }
        
        // Full config
        console.log('\n📋 Full configuration:', config);
        
        return config;
      } else {
        console.log(`❌ Failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.log('❌ Error:', error);
    }
  }
  
  console.log('\n=== 🔍 END CHECK ===');
}

// Export to window
if (typeof window !== 'undefined') {
  (window as any).checkOIDCConfig = checkOIDCConfig;
  // Debug utility console logs removed
}