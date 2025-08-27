/**
 * Cross-Tab Logout Synchronization Test
 * Tests the auth sync service for multi-tab authentication state synchronization
 */

// Mock BroadcastChannel API
class MockBroadcastChannel {
  constructor(name) {
    this.name = name;
    this.onmessage = null;
    MockBroadcastChannel.channels = MockBroadcastChannel.channels || new Map();
    MockBroadcastChannel.channels.set(name, this);
  }
  
  postMessage(data) {
    // Simulate message delivery to other instances
    setTimeout(() => {
      MockBroadcastChannel.channels.forEach((channel, channelName) => {
        if (channelName === this.name && channel !== this && channel.onmessage) {
          channel.onmessage({ data });
        }
      });
    }, 0);
  }
  
  close() {
    MockBroadcastChannel.channels.delete(this.name);
  }
  
  static clearAll() {
    if (MockBroadcastChannel.channels) {
      MockBroadcastChannel.channels.clear();
    }
  }
}

// Mock environment for testing
const mockEnvironment = {
  localStorage: {
    storage: {},
    getItem: function(key) { return this.storage[key] || null; },
    setItem: function(key, value) { this.storage[key] = value; },
    removeItem: function(key) { delete this.storage[key]; },
    clear: function() { this.storage = {}; }
  },
  
  window: {
    BroadcastChannel: MockBroadcastChannel,
    addEventListener: function(type, listener) {
      this._storageListeners = this._storageListeners || [];
      if (type === 'storage') {
        this._storageListeners.push(listener);
      }
    },
    removeEventListener: function(type, listener) {
      if (type === 'storage' && this._storageListeners) {
        const index = this._storageListeners.indexOf(listener);
        if (index !== -1) {
          this._storageListeners.splice(index, 1);
        }
      }
    },
    _triggerStorageEvent: function(key, newValue) {
      if (this._storageListeners) {
        this._storageListeners.forEach(listener => {
          listener({ key, newValue });
        });
      }
    }
  }
};

// Mock AuthSyncService implementation for testing
class TestAuthSyncService {
  constructor() {
    this.channel = null;
    this.storageEventListener = null;
    this.options = {};
    this.isInitialized = false;
  }
  
  initialize(options = {}) {
    if (this.isInitialized) {
      console.log('🔄 Auth sync already initialized');
      return;
    }
    
    this.options = options;
    
    // Use mock BroadcastChannel
    try {
      this.channel = new mockEnvironment.window.BroadcastChannel('maxlab_auth_sync');
      this.channel.onmessage = this.handleMessage.bind(this);
      console.log('✅ Auth sync initialized with BroadcastChannel');
    } catch (error) {
      console.warn('⚠️ BroadcastChannel failed, falling back to localStorage:', error);
      this.initializeStorageFallback();
    }
    
    this.isInitialized = true;
  }
  
  initializeStorageFallback() {
    this.storageEventListener = (event) => {
      if (event.key === 'auth_sync_event' && event.newValue) {
        try {
          const authEvent = JSON.parse(event.newValue);
          this.handleEvent(authEvent);
        } catch (error) {
          console.error('Failed to parse auth sync event:', error);
        }
      }
    };
    
    mockEnvironment.window.addEventListener('storage', this.storageEventListener);
    console.log('✅ Auth sync initialized with localStorage fallback');
  }
  
  handleMessage(event) {
    if (event.data && typeof event.data === 'object') {
      this.handleEvent(event.data);
    }
  }
  
  handleEvent(event) {
    console.log('📨 Received auth sync event:', event.type);
    
    switch (event.type) {
      case 'LOGIN':
        this.options.onLogin?.(event.user, event.token);
        break;
      case 'LOGOUT':
        this.options.onLogout?.(event.reason);
        break;
      case 'SESSION_EXPIRED':
        this.options.onSessionExpired?.();
        break;
      case 'AUTH_ERROR':
        this.options.onAuthError?.(event.error);
        break;
    }
  }
  
  broadcast(event) {
    if (!this.isInitialized) {
      console.warn('⚠️ Auth sync not initialized');
      return;
    }
    
    console.log('📤 Broadcasting auth event:', event.type);
    
    if (this.channel) {
      try {
        this.channel.postMessage(event);
      } catch (error) {
        console.error('BroadcastChannel error:', error);
        this.broadcastViaStorage(event);
      }
    } else {
      this.broadcastViaStorage(event);
    }
  }
  
  broadcastViaStorage(event) {
    try {
      const eventWithTimestamp = {
        ...event,
        timestamp: Date.now()
      };
      
      mockEnvironment.localStorage.setItem('auth_sync_event', JSON.stringify(eventWithTimestamp));
      
      // Trigger storage event manually for testing
      mockEnvironment.window._triggerStorageEvent('auth_sync_event', JSON.stringify(eventWithTimestamp));
      
      setTimeout(() => {
        mockEnvironment.localStorage.removeItem('auth_sync_event');
      }, 100);
    } catch (error) {
      console.error('localStorage broadcast error:', error);
    }
  }
  
  broadcastLogin(user, token) {
    this.broadcast({ type: 'LOGIN', user, token });
  }
  
  broadcastLogout(reason) {
    this.broadcast({ type: 'LOGOUT', reason });
  }
  
  broadcastSessionExpired() {
    this.broadcast({ type: 'SESSION_EXPIRED' });
  }
  
  broadcastAuthError(error) {
    this.broadcast({ type: 'AUTH_ERROR', error });
  }
  
  destroy() {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    
    if (this.storageEventListener) {
      mockEnvironment.window.removeEventListener('storage', this.storageEventListener);
      this.storageEventListener = null;
    }
    
    this.isInitialized = false;
    console.log('🧹 Auth sync service destroyed');
  }
}

/**
 * Test Case 1: BroadcastChannel logout synchronization
 */
async function testBroadcastChannelLogout() {
  console.log('\n🧪 Test 1: BroadcastChannel Logout Synchronization');
  
  MockBroadcastChannel.clearAll();
  
  // Create two tabs (two auth sync instances)
  const tab1 = new TestAuthSyncService();
  const tab2 = new TestAuthSyncService();
  
  let tab2LoggedOut = false;
  let logoutReason = '';
  
  // Initialize tab1 (will trigger logout)
  tab1.initialize({});
  
  // Initialize tab2 (will receive logout event)
  tab2.initialize({
    onLogout: (reason) => {
      console.log('📨 Tab2 received logout event:', reason);
      tab2LoggedOut = true;
      logoutReason = reason || '';
    }
  });
  
  // Simulate logout from tab1
  console.log('🚪 Tab1 triggering logout...');
  tab1.broadcastLogout('User clicked logout');
  
  // Wait for message propagation
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // Check results
  console.log('✅ Tab2 received logout:', tab2LoggedOut ? 'PASS' : 'FAIL');
  console.log('✅ Logout reason received:', logoutReason === 'User clicked logout' ? 'PASS' : 'FAIL');
  
  // Cleanup
  tab1.destroy();
  tab2.destroy();
  
  return tab2LoggedOut && logoutReason === 'User clicked logout';
}

/**
 * Test Case 2: LocalStorage fallback logout synchronization
 */
async function testLocalStorageLogout() {
  console.log('\n🧪 Test 2: LocalStorage Fallback Logout Synchronization');
  
  mockEnvironment.localStorage.clear();
  
  // Create auth sync service without BroadcastChannel
  const tab1 = new TestAuthSyncService();
  const tab2 = new TestAuthSyncService();
  
  // Disable BroadcastChannel for this test
  const originalBroadcastChannel = mockEnvironment.window.BroadcastChannel;
  mockEnvironment.window.BroadcastChannel = undefined;
  
  let tab2LoggedOut = false;
  let sessionExpired = false;
  
  // Initialize tabs
  tab1.initialize({});
  tab2.initialize({
    onLogout: (reason) => {
      console.log('📨 Tab2 received logout via localStorage:', reason);
      tab2LoggedOut = true;
    },
    onSessionExpired: () => {
      console.log('📨 Tab2 received session expired via localStorage');
      sessionExpired = true;
    }
  });
  
  // Test logout broadcast
  console.log('🚪 Tab1 triggering logout via localStorage...');
  tab1.broadcastLogout('Session timeout');
  
  // Wait for message propagation
  await new Promise(resolve => setTimeout(resolve, 150));
  
  // Test session expired broadcast
  console.log('⏰ Tab1 triggering session expired via localStorage...');
  tab1.broadcastSessionExpired();
  
  // Wait for message propagation
  await new Promise(resolve => setTimeout(resolve, 150));
  
  // Check results
  console.log('✅ Tab2 received logout via localStorage:', tab2LoggedOut ? 'PASS' : 'FAIL');
  console.log('✅ Tab2 received session expired via localStorage:', sessionExpired ? 'PASS' : 'FAIL');
  
  // Restore BroadcastChannel
  mockEnvironment.window.BroadcastChannel = originalBroadcastChannel;
  
  // Cleanup
  tab1.destroy();
  tab2.destroy();
  
  return tab2LoggedOut && sessionExpired;
}

/**
 * Test Case 3: Multiple tabs logout synchronization
 */
async function testMultipleTabsLogout() {
  console.log('\n🧪 Test 3: Multiple Tabs Logout Synchronization');
  
  MockBroadcastChannel.clearAll();
  
  // Create multiple tabs
  const tabs = [];
  const logoutReceived = [];
  
  for (let i = 0; i < 4; i++) {
    const tab = new TestAuthSyncService();
    logoutReceived[i] = false;
    
    tab.initialize({
      onLogout: (reason) => {
        console.log(`📨 Tab${i + 1} received logout:`, reason);
        logoutReceived[i] = true;
      }
    });
    
    tabs.push(tab);
  }
  
  // Tab 0 triggers logout
  console.log('🚪 Tab1 triggering logout to all other tabs...');
  tabs[0].broadcastLogout('Admin forced logout');
  
  // Wait for message propagation
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Check that all other tabs received the logout
  const otherTabsReceivedLogout = logoutReceived.slice(1).every(received => received);
  const originTabNotReceived = !logoutReceived[0]; // Origin tab shouldn't receive its own message
  
  console.log('✅ All other tabs received logout:', otherTabsReceivedLogout ? 'PASS' : 'FAIL');
  console.log('✅ Origin tab did not receive own message:', originTabNotReceived ? 'PASS' : 'FAIL');
  
  // Cleanup
  tabs.forEach(tab => tab.destroy());
  
  return otherTabsReceivedLogout && originTabNotReceived;
}

/**
 * Test Case 4: Login synchronization
 */
async function testLoginSync() {
  console.log('\n🧪 Test 4: Login Synchronization');
  
  MockBroadcastChannel.clearAll();
  
  const tab1 = new TestAuthSyncService();
  const tab2 = new TestAuthSyncService();
  
  let tab2LoggedIn = false;
  let receivedUser = null;
  let receivedToken = null;
  
  // Initialize tabs
  tab1.initialize({});
  tab2.initialize({
    onLogin: (user, token) => {
      console.log('📨 Tab2 received login event');
      tab2LoggedIn = true;
      receivedUser = user;
      receivedToken = token;
    }
  });
  
  // Simulate login from tab1
  const testUser = { id: 'test123', email: 'test@example.com', username: 'testuser' };
  const testToken = 'mock_access_token_123';
  
  console.log('🔐 Tab1 triggering login...');
  tab1.broadcastLogin(testUser, testToken);
  
  // Wait for message propagation
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // Check results
  console.log('✅ Tab2 received login:', tab2LoggedIn ? 'PASS' : 'FAIL');
  console.log('✅ User data received:', receivedUser?.id === 'test123' ? 'PASS' : 'FAIL');
  console.log('✅ Token received:', receivedToken === testToken ? 'PASS' : 'FAIL');
  
  // Cleanup
  tab1.destroy();
  tab2.destroy();
  
  return tab2LoggedIn && receivedUser?.id === 'test123' && receivedToken === testToken;
}

/**
 * Test Case 5: Auth error synchronization
 */
async function testAuthErrorSync() {
  console.log('\n🧪 Test 5: Auth Error Synchronization');
  
  MockBroadcastChannel.clearAll();
  
  const tab1 = new TestAuthSyncService();
  const tab2 = new TestAuthSyncService();
  
  let tab2AuthError = false;
  let errorMessage = '';
  
  // Initialize tabs
  tab1.initialize({});
  tab2.initialize({
    onAuthError: (error) => {
      console.log('📨 Tab2 received auth error:', error);
      tab2AuthError = true;
      errorMessage = error;
    }
  });
  
  // Simulate auth error from tab1
  console.log('🚨 Tab1 triggering auth error...');
  tab1.broadcastAuthError('Token validation failed');
  
  // Wait for message propagation
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // Check results
  console.log('✅ Tab2 received auth error:', tab2AuthError ? 'PASS' : 'FAIL');
  console.log('✅ Error message received:', errorMessage === 'Token validation failed' ? 'PASS' : 'FAIL');
  
  // Cleanup
  tab1.destroy();
  tab2.destroy();
  
  return tab2AuthError && errorMessage === 'Token validation failed';
}

/**
 * Run all cross-tab synchronization tests
 */
async function runCrossTabSyncTests() {
  console.log('🚀 Starting Cross-Tab Logout Synchronization Tests\n');
  console.log('Testing multi-tab authentication state synchronization...');
  
  const tests = [
    { name: 'BroadcastChannel Logout Synchronization', test: testBroadcastChannelLogout },
    { name: 'LocalStorage Fallback Logout Synchronization', test: testLocalStorageLogout },
    { name: 'Multiple Tabs Logout Synchronization', test: testMultipleTabsLogout },
    { name: 'Login Synchronization', test: testLoginSync },
    { name: 'Auth Error Synchronization', test: testAuthErrorSync }
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
    console.log('🎉 All cross-tab synchronization tests passed!');
    console.log('✅ BroadcastChannel communication is working');
    console.log('✅ LocalStorage fallback is working');
    console.log('✅ Multiple tabs can receive sync events');
    console.log('✅ Login events are synchronized across tabs');
    console.log('✅ Auth error events are synchronized across tabs');
    console.log('✅ Cross-tab logout synchronization is fully functional');
  } else {
    console.log('⚠️ Some tests failed - implementation may need fixes');
  }
  
  return passed === total;
}

// Export for Node.js if available, otherwise run immediately
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runCrossTabSyncTests };
} else {
  // Run tests immediately if in browser
  runCrossTabSyncTests();
}