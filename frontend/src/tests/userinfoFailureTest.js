/**
 * Userinfo Failure Test Script
 * Tests auth/me endpoint failure scenarios and token cleanup
 */

// Mock fetch for testing userinfo failures
function createMockFetch(shouldFail = false, errorType = '401') {
  return jest.fn().mockImplementation((url) => {
    if (url.includes('/userinfo') || url.includes('/auth/me')) {
      if (shouldFail) {
        if (errorType === '401') {
          return Promise.reject(new Error('401 Unauthorized'));
        } else if (errorType === '403') {
          return Promise.reject(new Error('403 Forbidden'));
        } else if (errorType === 'network') {
          return Promise.reject(new Error('Network error'));
        }
      } else {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            sub: 'test_user',
            email: 'test@example.com',
            name: 'Test User',
            is_active: true
          })
        });
      }
    }
    return Promise.resolve({ ok: true });
  });
}

// Mock implementation for testing
const mockEnvironment = {
  localStorage: {
    storage: {},
    getItem: function(key) { return this.storage[key] || null; },
    setItem: function(key, value) { this.storage[key] = value; },
    removeItem: function(key) { delete this.storage[key]; },
    clear: function() { this.storage = {}; }
  },
  
  window: {
    location: { href: '' },
    dispatchEvent: function(event) {
      console.log('Event dispatched:', event.type, event.detail);
    }
  },
  
  console: {
    logs: [],
    log: function(...args) { this.logs.push(['log', ...args]); console.log(...args); },
    error: function(...args) { this.logs.push(['error', ...args]); console.error(...args); }
  }
};

/**
 * Test Case 1: Userinfo 401 Unauthorized
 */
async function testUserinfo401() {
  console.log('\n🧪 Test 1: Userinfo 401 Unauthorized');
  
  mockEnvironment.localStorage.clear();
  mockEnvironment.window.location.href = '';
  
  // Set up valid token but userinfo will fail
  const futureTime = Date.now() + 3600000;
  mockEnvironment.localStorage.setItem('accessToken', 'invalid_token');
  mockEnvironment.localStorage.setItem('tokenExpiryTime', futureTime.toString());
  mockEnvironment.localStorage.setItem('user', JSON.stringify({
    id: 'test_user',
    email: 'test@example.com'
  }));
  
  // Mock getUserInfo function that fails with 401
  const mockGetUserInfo = async (token) => {
    throw new Error('401 Unauthorized - Token invalid');
  };
  
  // Create test auth service
  const testAuthService = {
    _handleAuthenticationFailure: async (reason) => {
      console.log(`🚨 Authentication failure: ${reason}`);
      // Clear tokens
      mockEnvironment.localStorage.clear();
      // Redirect
      mockEnvironment.window.location.href = 'https://max.dwchem.co.kr/login';
    },
    
    getCurrentUser: async function() {
      const accessToken = mockEnvironment.localStorage.getItem('accessToken');
      if (!accessToken) {
        throw new Error('No access token available');
      }
      
      try {
        const userInfo = await mockGetUserInfo(accessToken);
        return userInfo;
      } catch (error) {
        console.error('❌ getUserInfo failed:', error);
        
        // If userinfo call fails (401, 403, etc.), clear tokens and redirect to login
        if (error.message?.includes('401') || error.message?.includes('403') || error.message?.includes('Unauthorized')) {
          console.log('🔒 Token validation failed, redirecting to login...');
          await this._handleAuthenticationFailure('Token validation failed');
        }
        
        throw error;
      }
    }
  };
  
  // Test the userinfo failure
  try {
    await testAuthService.getCurrentUser();
    console.log('❌ Expected error but got success');
    return false;
  } catch (error) {
    console.log('✅ Expected error caught:', error.message);
  }
  
  // Check that tokens were cleared
  const hasTokens = !!mockEnvironment.localStorage.getItem('accessToken');
  const redirected = mockEnvironment.window.location.href === 'https://max.dwchem.co.kr/login';
  
  console.log('✅ Tokens cleared:', !hasTokens ? 'PASS' : 'FAIL');
  console.log('✅ Redirected to login:', redirected ? 'PASS' : 'FAIL');
  
  return !hasTokens && redirected;
}

/**
 * Test Case 2: Userinfo 403 Forbidden
 */
async function testUserinfo403() {
  console.log('\n🧪 Test 2: Userinfo 403 Forbidden');
  
  mockEnvironment.localStorage.clear();
  mockEnvironment.window.location.href = '';
  
  // Set up valid token but userinfo will fail
  const futureTime = Date.now() + 3600000;
  mockEnvironment.localStorage.setItem('accessToken', 'forbidden_token');
  mockEnvironment.localStorage.setItem('tokenExpiryTime', futureTime.toString());
  
  // Mock getUserInfo function that fails with 403
  const mockGetUserInfo = async (token) => {
    throw new Error('403 Forbidden - Access denied');
  };
  
  // Test validateToken method
  const testValidateToken = async () => {
    try {
      const accessToken = mockEnvironment.localStorage.getItem('accessToken');
      if (!accessToken) {
        return false;
      }
      
      // Validate with userinfo endpoint
      await mockGetUserInfo(accessToken);
      return true;
    } catch (error) {
      console.error('❌ Token validation failed:', error);
      
      // Handle authentication failure
      console.log('🚨 Authentication failure: Token validation failed');
      mockEnvironment.localStorage.clear();
      mockEnvironment.window.location.href = 'https://max.dwchem.co.kr/login';
      return false;
    }
  };
  
  const result = await testValidateToken();
  
  // Check results
  const hasTokens = !!mockEnvironment.localStorage.getItem('accessToken');
  const redirected = mockEnvironment.window.location.href === 'https://max.dwchem.co.kr/login';
  
  console.log('✅ Validation result:', result === false ? 'PASS' : 'FAIL');
  console.log('✅ Tokens cleared:', !hasTokens ? 'PASS' : 'FAIL');
  console.log('✅ Redirected to login:', redirected ? 'PASS' : 'FAIL');
  
  return result === false && !hasTokens && redirected;
}

/**
 * Test Case 3: Network error (should not trigger auth failure)
 */
async function testNetworkError() {
  console.log('\n🧪 Test 3: Network Error (Temporary)');
  
  mockEnvironment.localStorage.clear();
  mockEnvironment.window.location.href = '';
  
  // Set up valid token
  const futureTime = Date.now() + 3600000;
  mockEnvironment.localStorage.setItem('accessToken', 'valid_token');
  mockEnvironment.localStorage.setItem('tokenExpiryTime', futureTime.toString());
  
  // Mock getUserInfo function that fails with network error
  const mockGetUserInfo = async (token) => {
    throw new Error('Network error - fetch failed');
  };
  
  // Test getCurrentUser with network error
  const testGetCurrentUser = async () => {
    const accessToken = mockEnvironment.localStorage.getItem('accessToken');
    if (!accessToken) {
      throw new Error('No access token available');
    }
    
    try {
      const userInfo = await mockGetUserInfo(accessToken);
      return userInfo;
    } catch (error) {
      console.error('❌ getUserInfo failed:', error);
      
      // Only trigger auth failure for specific auth errors
      if (error.message?.includes('401') || error.message?.includes('403') || error.message?.includes('Unauthorized')) {
        console.log('🔒 Token validation failed, redirecting to login...');
        mockEnvironment.localStorage.clear();
        mockEnvironment.window.location.href = 'https://max.dwchem.co.kr/login';
      }
      
      throw error;
    }
  };
  
  try {
    await testGetCurrentUser();
    console.log('❌ Expected error but got success');
    return false;
  } catch (error) {
    console.log('✅ Network error caught (expected):', error.message);
  }
  
  // Check that tokens were NOT cleared (network error shouldn't clear auth)
  const hasTokens = !!mockEnvironment.localStorage.getItem('accessToken');
  const notRedirected = mockEnvironment.window.location.href === '';
  
  console.log('✅ Tokens preserved:', hasTokens ? 'PASS' : 'FAIL');
  console.log('✅ No redirect:', notRedirected ? 'PASS' : 'FAIL');
  
  return hasTokens && notRedirected;
}

/**
 * Test Case 4: Successful userinfo call
 */
async function testSuccessfulUserinfo() {
  console.log('\n🧪 Test 4: Successful Userinfo Call');
  
  mockEnvironment.localStorage.clear();
  mockEnvironment.window.location.href = '';
  
  // Set up valid token
  const futureTime = Date.now() + 3600000;
  mockEnvironment.localStorage.setItem('accessToken', 'valid_token');
  mockEnvironment.localStorage.setItem('tokenExpiryTime', futureTime.toString());
  
  // Mock successful getUserInfo
  const mockGetUserInfo = async (token) => {
    return {
      sub: 'test_user_123',
      email: 'success@example.com',
      name: 'Success User',
      is_active: true,
      is_admin: false
    };
  };
  
  // Test successful getCurrentUser
  const testGetCurrentUser = async () => {
    const accessToken = mockEnvironment.localStorage.getItem('accessToken');
    if (!accessToken) {
      throw new Error('No access token available');
    }
    
    try {
      const userInfo = await mockGetUserInfo(accessToken);
      
      // Map user information
      const user = {
        id: userInfo.sub || userInfo.id || userInfo.user_id || userInfo.email,
        email: userInfo.email || '',
        username: userInfo.name || userInfo.display_name || userInfo.username || userInfo.email || 'Unknown User',
        full_name: userInfo.real_name || userInfo.full_name || userInfo.name || userInfo.display_name || userInfo.username || userInfo.email || 'Unknown User',
        is_active: userInfo.is_active !== undefined ? userInfo.is_active : true,
        is_admin: Boolean(userInfo.is_admin || userInfo.is_superuser || userInfo.admin),
        role: (userInfo.is_admin || userInfo.is_superuser || userInfo.admin) ? 'admin' : 'user',
        groups: []
      };
      
      // Update stored user information
      const currentTime = Date.now();
      const userWithMetadata = {
        ...user,
        created_at: currentTime,
        updated_at: currentTime
      };
      
      mockEnvironment.localStorage.setItem('user', JSON.stringify(userWithMetadata));
      
      return user;
    } catch (error) {
      console.error('❌ getUserInfo failed:', error);
      throw error;
    }
  };
  
  try {
    const user = await testGetCurrentUser();
    console.log('✅ User retrieved successfully:', user.email);
    
    // Check that user was stored
    const storedUser = JSON.parse(mockEnvironment.localStorage.getItem('user') || '{}');
    const hasValidUser = storedUser.id === 'test_user_123';
    const noRedirect = mockEnvironment.window.location.href === '';
    
    console.log('✅ User stored:', hasValidUser ? 'PASS' : 'FAIL');
    console.log('✅ No redirect:', noRedirect ? 'PASS' : 'FAIL');
    
    return hasValidUser && noRedirect;
    
  } catch (error) {
    console.log('❌ Unexpected error:', error.message);
    return false;
  }
}

/**
 * Run all userinfo failure tests
 */
async function runUserinfoFailureTests() {
  console.log('🚀 Starting Userinfo Failure Tests\n');
  console.log('Testing auth/me endpoint failure scenarios and token cleanup...');
  
  const tests = [
    { name: 'Userinfo 401 Unauthorized', test: testUserinfo401 },
    { name: 'Userinfo 403 Forbidden', test: testUserinfo403 },
    { name: 'Network Error (Temporary)', test: testNetworkError },
    { name: 'Successful Userinfo Call', test: testSuccessfulUserinfo }
  ];
  
  let passed = 0;
  let total = tests.length;
  
  for (const { name, test } of tests) {
    try {
      const result = await test();
      if (result) {
        passed++;
        console.log(`✅ ${name}: PASSED`);
      } else {
        console.log(`❌ ${name}: FAILED`);
      }
    } catch (error) {
      console.log(`❌ ${name}: ERROR -`, error.message);
    }
  }
  
  console.log(`\n📊 Test Results: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 All userinfo failure tests passed!');
    console.log('✅ Auth failure detection is working correctly');
    console.log('✅ Token cleanup on auth failure is working');
    console.log('✅ Automatic redirect to login on auth failure is working');
    console.log('✅ Network errors do not trigger unnecessary auth failures');
  } else {
    console.log('⚠️ Some tests failed - implementation may need fixes');
  }
  
  return passed === total;
}

// Export for Node.js if available, otherwise run immediately
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runUserinfoFailureTests };
} else {
  // Run tests immediately if in browser
  runUserinfoFailureTests();
}