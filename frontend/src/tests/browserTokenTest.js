/**
 * Browser Token Expiration Test
 * To be run in browser console to test actual authService implementation
 * 
 * Usage:
 * 1. Open maxlab.dwchem.co.kr in browser
 * 2. Open developer console
 * 3. Copy and paste this script
 * 4. Run: testTokenExpiration()
 */

window.testTokenExpiration = function() {
  console.log('🧪 Testing Token Expiration in Browser Environment');
  
  // Backup current auth state
  const backup = {
    accessToken: localStorage.getItem('accessToken'),
    tokenExpiryTime: localStorage.getItem('tokenExpiryTime'),
    tokenType: localStorage.getItem('tokenType'),
    user: localStorage.getItem('user'),
    scope: localStorage.getItem('scope'),
    tokenCreatedAt: localStorage.getItem('tokenCreatedAt')
  };
  
  console.log('💾 Backed up current auth state');
  
  // Test 1: Set expired token and test detection
  console.log('\n--- Test 1: Expired Token Detection ---');
  
  const expiredTime = Date.now() - 3600000; // 1 hour ago
  localStorage.setItem('accessToken', 'test_expired_token');
  localStorage.setItem('tokenExpiryTime', expiredTime.toString());
  localStorage.setItem('tokenType', 'Bearer');
  localStorage.setItem('user', JSON.stringify({
    id: 'test_user_expired',
    email: 'test@example.com',
    username: 'test_expired'
  }));
  
  console.log('⏰ Set expired token (1 hour ago)');
  console.log('🔍 Testing authService.isAuthenticated()...');
  
  // Note: This should trigger redirect in real environment
  // We'll catch any potential redirect and restore state
  const originalLocation = window.location.href;
  
  try {
    const isAuth = window.authService?.isAuthenticated();
    console.log('Result:', isAuth);
    
    if (window.location.href !== originalLocation) {
      console.log('🔄 Redirect triggered (expected behavior)');
      console.log('🎯 Redirect URL:', window.location.href);
    }
  } catch (error) {
    console.log('❌ Error during test:', error);
  }
  
  // Test 2: Valid token
  console.log('\n--- Test 2: Valid Token ---');
  
  const futureTime = Date.now() + 3600000; // 1 hour from now
  localStorage.setItem('accessToken', 'test_valid_token');
  localStorage.setItem('tokenExpiryTime', futureTime.toString());
  localStorage.setItem('user', JSON.stringify({
    id: 'test_user_valid',
    email: 'test@example.com',
    username: 'test_valid'
  }));
  
  console.log('✅ Set valid token (1 hour from now)');
  
  try {
    // Prevent redirect by temporarily overriding the method
    const originalHandleFailure = window.authService?._handleAuthenticationFailure;
    let failureCalled = false;
    
    if (window.authService) {
      window.authService._handleAuthenticationFailure = async (reason) => {
        failureCalled = true;
        console.log('🚨 Authentication failure would be called:', reason);
        return Promise.resolve();
      };
    }
    
    const isAuth = window.authService?.isAuthenticated();
    console.log('Result:', isAuth);
    console.log('Failure called:', failureCalled);
    
    // Restore original method
    if (window.authService && originalHandleFailure) {
      window.authService._handleAuthenticationFailure = originalHandleFailure;
    }
    
  } catch (error) {
    console.log('❌ Error during valid token test:', error);
  }
  
  // Test 3: Check debug info
  console.log('\n--- Test 3: Debug Information ---');
  
  try {
    const debugInfo = window.authService?.getAuthDebugInfo();
    console.log('🔍 Auth Debug Info:', debugInfo);
  } catch (error) {
    console.log('❌ Error getting debug info:', error);
  }
  
  // Restore original auth state
  console.log('\n--- Restoring Original State ---');
  
  Object.keys(backup).forEach(key => {
    if (backup[key] !== null) {
      localStorage.setItem(key, backup[key]);
    } else {
      localStorage.removeItem(key);
    }
  });
  
  console.log('✅ Original auth state restored');
  console.log('🏁 Token expiration test completed');
  
  return {
    testCompleted: true,
    message: 'Check console output above for test results'
  };
};

// Also provide a simple monitoring function
window.monitorTokenExpiration = function() {
  console.log('🕒 Starting Token Expiration Monitor');
  
  const monitor = setInterval(() => {
    if (window.authService) {
      const timeToExpiry = window.authService.getTokenTimeToExpiry();
      const needsRenewal = window.authService.needsTokenRenewal();
      const isAuth = window.authService.isAuthenticated();
      
      console.log('⏰ Token Status:', {
        isAuthenticated: isAuth,
        timeToExpiry: timeToExpiry + 's',
        needsRenewal: needsRenewal,
        timestamp: new Date().toISOString()
      });
      
      if (!isAuth) {
        console.log('🛑 Authentication lost - stopping monitor');
        clearInterval(monitor);
      }
    }
  }, 10000); // Check every 10 seconds
  
  console.log('📊 Monitor started - will check every 10 seconds');
  console.log('Use clearInterval(' + monitor + ') to stop');
  
  return monitor;
};

console.log('🧪 Token expiration test functions loaded!');
console.log('📝 Available functions:');
console.log('  - testTokenExpiration() - Run full test suite');
console.log('  - monitorTokenExpiration() - Monitor token status');
console.log('');
console.log('⚠️  Note: The expiration test may trigger a redirect to login page');
console.log('    This is expected behavior for the access token-only system');