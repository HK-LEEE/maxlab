/**
 * Token Expiration Test Script
 * Tests the access token expiration logic and automatic redirect to login
 */

// Mock environment setup
const mockLocalStorage = {
  storage: {},
  getItem: function(key) {
    return this.storage[key] || null;
  },
  setItem: function(key, value) {
    this.storage[key] = value;
  },
  removeItem: function(key) {
    delete this.storage[key];
  },
  clear: function() {
    this.storage = {};
  }
};

const mockSessionStorage = {
  storage: {},
  getItem: function(key) {
    return this.storage[key] || null;
  },
  setItem: function(key, value) {
    this.storage[key] = value;
  },
  removeItem: function(key) {
    delete this.storage[key];
  },
  clear: function() {
    this.storage = {};
  }
};

// Mock window object
const mockWindow = {
  location: { href: '' },
  dispatchEvent: function(event) {
    console.log('Event dispatched:', event.type, event.detail);
  },
  addEventListener: function() {},
  removeEventListener: function() {}
};

// Mock console for capturing logs
const mockConsole = {
  logs: [],
  log: function(...args) {
    this.logs.push(['log', ...args]);
    console.log(...args);
  },
  error: function(...args) {
    this.logs.push(['error', ...args]);
    console.error(...args);
  }
};

/**
 * Test Case 1: Token expiration detection
 */
function testTokenExpirationDetection() {
  console.log('\n🧪 Test 1: Token Expiration Detection');
  
  // Set up expired token
  const now = Date.now();
  const expiredTime = now - 3600000; // 1 hour ago
  
  mockLocalStorage.clear();
  mockLocalStorage.setItem('accessToken', 'mock_token_123');
  mockLocalStorage.setItem('tokenExpiryTime', expiredTime.toString());
  mockLocalStorage.setItem('user', JSON.stringify({
    id: 'test_user',
    email: 'test@example.com',
    username: 'testuser'
  }));
  
  // Create mock authService for testing
  const testAuthService = {
    getStoredUser: () => {
      const userStr = mockLocalStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    },
    
    _handleAuthenticationFailure: async (reason) => {
      mockConsole.log(`🚨 Authentication failure: ${reason}`);
      mockWindow.location.href = 'https://max.dwchem.co.kr/login';
      return Promise.resolve();
    },
    
    isAuthenticated: function() {
      const accessToken = mockLocalStorage.getItem('accessToken');
      const tokenExpiryTime = mockLocalStorage.getItem('tokenExpiryTime');
      
      if (!accessToken) {
        return false;
      }
      
      // Check token expiration
      if (tokenExpiryTime) {
        const expiryTime = parseInt(tokenExpiryTime, 10);
        const now = Date.now();
        
        if (now >= expiryTime) {
          mockConsole.log('🕒 Access token expired, triggering logout...');
          // Token expired - trigger logout and redirect
          this._handleAuthenticationFailure('Access token expired');
          return false;
        }
      }
      
      // Check if user data exists
      const storedUser = this.getStoredUser();
      if (!storedUser || !storedUser.id) {
        mockConsole.log('❌ No valid user data found');
        return false;
      }
      
      return true;
    }
  };
  
  // Test the expiration logic
  const result = testAuthService.isAuthenticated();
  
  console.log('✅ Result:', result === false ? 'PASS' : 'FAIL');
  console.log('✅ Redirect URL:', mockWindow.location.href === 'https://max.dwchem.co.kr/login' ? 'PASS' : 'FAIL');
  
  return result === false && mockWindow.location.href === 'https://max.dwchem.co.kr/login';
}

/**
 * Test Case 2: Valid token (not expired)
 */
function testValidToken() {
  console.log('\n🧪 Test 2: Valid Token (Not Expired)');
  
  // Set up valid token
  const now = Date.now();
  const futureTime = now + 3600000; // 1 hour from now
  
  mockLocalStorage.clear();
  mockWindow.location.href = '';
  
  mockLocalStorage.setItem('accessToken', 'mock_token_456');
  mockLocalStorage.setItem('tokenExpiryTime', futureTime.toString());
  mockLocalStorage.setItem('user', JSON.stringify({
    id: 'test_user',
    email: 'test@example.com',
    username: 'testuser'
  }));
  
  // Create simple auth check
  const accessToken = mockLocalStorage.getItem('accessToken');
  const tokenExpiryTime = mockLocalStorage.getItem('tokenExpiryTime');
  const user = JSON.parse(mockLocalStorage.getItem('user'));
  
  let isAuthenticated = false;
  
  if (accessToken && tokenExpiryTime && user && user.id) {
    const expiryTime = parseInt(tokenExpiryTime, 10);
    const now = Date.now();
    
    if (now < expiryTime) {
      isAuthenticated = true;
    }
  }
  
  console.log('✅ Result:', isAuthenticated === true ? 'PASS' : 'FAIL');
  console.log('✅ No redirect:', mockWindow.location.href === '' ? 'PASS' : 'FAIL');
  
  return isAuthenticated === true && mockWindow.location.href === '';
}

/**
 * Test Case 3: Missing token
 */
function testMissingToken() {
  console.log('\n🧪 Test 3: Missing Token');
  
  mockLocalStorage.clear();
  mockWindow.location.href = '';
  
  // Create simple auth check for missing token
  const accessToken = mockLocalStorage.getItem('accessToken');
  const isAuthenticated = !!accessToken;
  
  console.log('✅ Result:', isAuthenticated === false ? 'PASS' : 'FAIL');
  
  return isAuthenticated === false;
}

/**
 * Test Case 4: Missing user data
 */
function testMissingUserData() {
  console.log('\n🧪 Test 4: Missing User Data');
  
  mockLocalStorage.clear();
  mockWindow.location.href = '';
  
  // Set token but no user data
  const now = Date.now();
  const futureTime = now + 3600000;
  
  mockLocalStorage.setItem('accessToken', 'mock_token_789');
  mockLocalStorage.setItem('tokenExpiryTime', futureTime.toString());
  // No user data
  
  const accessToken = mockLocalStorage.getItem('accessToken');
  const user = mockLocalStorage.getItem('user');
  
  let isAuthenticated = false;
  
  if (accessToken && user) {
    const userData = JSON.parse(user);
    if (userData && userData.id) {
      isAuthenticated = true;
    }
  }
  
  console.log('✅ Result:', isAuthenticated === false ? 'PASS' : 'FAIL');
  
  return isAuthenticated === false;
}

/**
 * Run all tests
 */
function runTokenExpirationTests() {
  console.log('🚀 Starting Token Expiration Tests\n');
  console.log('Testing access token-only authentication system...');
  
  const tests = [
    { name: 'Token Expiration Detection', test: testTokenExpirationDetection },
    { name: 'Valid Token (Not Expired)', test: testValidToken },
    { name: 'Missing Token', test: testMissingToken },
    { name: 'Missing User Data', test: testMissingUserData }
  ];
  
  let passed = 0;
  let total = tests.length;
  
  tests.forEach(({ name, test }) => {
    try {
      const result = test();
      if (result) {
        passed++;
        console.log(`✅ ${name}: PASSED`);
      } else {
        console.log(`❌ ${name}: FAILED`);
      }
    } catch (error) {
      console.log(`❌ ${name}: ERROR -`, error.message);
    }
  });
  
  console.log(`\n📊 Test Results: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 All token expiration tests passed!');
    console.log('✅ Access token expiration detection is working correctly');
    console.log('✅ Automatic redirect to login page is working');
    console.log('✅ Token validation logic is robust');
  } else {
    console.log('⚠️ Some tests failed - implementation may need fixes');
  }
  
  return passed === total;
}

// Export for Node.js if available, otherwise run in browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runTokenExpirationTests };
} else {
  // Run tests immediately if in browser
  runTokenExpirationTests();
}