/**
 * Security Features Test Suite
 * Run these tests in the browser console to verify security implementations
 */

import { browserSecurityCleanup } from './browserSecurityCleanup';
import { userIsolatedTokenStorage } from '../services/userIsolatedTokenStorage';
import { securityHeaders } from '../services/securityHeaders';
import { authService } from '../services/authService';

export const testSecurityFeatures = {
  /**
   * Test 1: Browser Security Cleanup
   */
  async testBrowserCleanup() {
    console.log('🧪 Test 1: Browser Security Cleanup');
    console.log('=====================================');
    
    // Get initial storage report
    const beforeReport = await browserSecurityCleanup.getStorageReport();
    console.log('📊 Storage before cleanup:', beforeReport);
    
    // Add test data
    localStorage.setItem('test_key_1', 'test_value_1');
    localStorage.setItem('test_key_2', 'test_value_2');
    sessionStorage.setItem('test_session_1', 'session_value_1');
    document.cookie = 'test_cookie=test_value; path=/';
    
    // Perform cleanup
    console.log('\n🧹 Performing security cleanup...');
    const cleanupResult = await browserSecurityCleanup.performSecurityCleanup({
      clearLocalStorage: true,
      clearSessionStorage: true,
      clearCookies: true,
      clearIndexedDB: true,
      clearCacheStorage: true,
      preserveKeys: ['theme', 'language']
    });
    
    console.log('✅ Cleanup result:', cleanupResult);
    
    // Get final storage report
    const afterReport = await browserSecurityCleanup.getStorageReport();
    console.log('📊 Storage after cleanup:', afterReport);
    
    // Verify cleanup
    const testsPassed = {
      localStorage: !localStorage.getItem('test_key_1') && !localStorage.getItem('test_key_2'),
      sessionStorage: !sessionStorage.getItem('test_session_1'),
      success: cleanupResult.success
    };
    
    console.log('\n🎯 Test Results:', testsPassed);
    return testsPassed;
  },

  /**
   * Test 2: User-Isolated Token Storage
   */
  async testUserIsolatedStorage() {
    console.log('\n🧪 Test 2: User-Isolated Token Storage');
    console.log('=====================================');
    
    // Clear any existing tokens
    await userIsolatedTokenStorage.clearAllTokens();
    
    // Test user 1
    const user1Id = 'test_user_1';
    const user1Tokens = {
      accessToken: 'user1_access_token',
      refreshToken: 'user1_refresh_token',
      idToken: 'user1_id_token',
      expiresAt: Date.now() + 3600000
    };
    
    console.log(`\n👤 Saving tokens for ${user1Id}...`);
    const saved1 = await userIsolatedTokenStorage.saveTokens(user1Tokens, user1Id);
    console.log('Saved:', saved1);
    
    // Test user 2
    const user2Id = 'test_user_2';
    const user2Tokens = {
      accessToken: 'user2_access_token',
      refreshToken: 'user2_refresh_token',
      idToken: 'user2_id_token',
      expiresAt: Date.now() + 3600000
    };
    
    console.log(`\n👤 Saving tokens for ${user2Id}...`);
    const saved2 = await userIsolatedTokenStorage.saveTokens(user2Tokens, user2Id);
    console.log('Saved:', saved2);
    
    // Retrieve tokens
    console.log('\n🔍 Retrieving tokens...');
    const retrieved1 = await userIsolatedTokenStorage.getTokens(user1Id);
    const retrieved2 = await userIsolatedTokenStorage.getTokens(user2Id);
    
    console.log('User 1 tokens:', retrieved1);
    console.log('User 2 tokens:', retrieved2);
    
    // Test isolation
    const isolated = retrieved1?.accessToken !== retrieved2?.accessToken;
    console.log('✅ Token isolation working:', isolated);
    
    // Security audit
    console.log('\n🔒 Running security audit...');
    const audit = await userIsolatedTokenStorage.performSecurityAudit();
    console.log('Audit results:', audit);
    
    // Cleanup
    await userIsolatedTokenStorage.clearAllTokens();
    
    return {
      saved: saved1 && saved2,
      isolated,
      auditPassed: audit.totalUsers === 2
    };
  },

  /**
   * Test 3: Security Headers
   */
  testSecurityHeaders() {
    console.log('\n🧪 Test 3: Security Headers');
    console.log('=====================================');
    
    // Test without user
    console.log('\n📋 Headers without user:');
    const headersNoUser = securityHeaders.getSecurityHeaders();
    console.log(headersNoUser);
    
    // Test with user
    console.log('\n📋 Headers with user:');
    const headersWithUser = securityHeaders.getSecurityHeaders('test_user_123');
    console.log(headersWithUser);
    
    // Verify required headers
    const requiredHeaders = [
      'X-Client-Version',
      'X-Security-Token',
      'X-Request-Id',
      'X-Request-Timestamp',
      'X-Frame-Options',
      'X-Content-Type-Options',
      'X-XSS-Protection'
    ];
    
    const allHeadersPresent = requiredHeaders.every(header => headersNoUser[header]);
    const userContextPresent = headersWithUser['X-User-Context'] === 'test_user_123';
    
    console.log('\n🎯 Test Results:');
    console.log('All required headers present:', allHeadersPresent);
    console.log('User context working:', userContextPresent);
    
    return {
      allHeadersPresent,
      userContextPresent,
      deviceFingerprintPresent: !!headersNoUser['X-Device-Fingerprint']
    };
  },

  /**
   * Test 4: Login Flow with Security
   */
  async testLoginFlowSecurity() {
    console.log('\n🧪 Test 4: Login Flow Security Check');
    console.log('=====================================');
    
    // Check current auth state
    const isAuthenticated = authService.isAuthenticated();
    const currentUser = authService.getStoredUser();
    
    console.log('Current auth state:', { isAuthenticated, currentUser });
    
    // Get storage report
    const storageReport = await browserSecurityCleanup.getStorageReport();
    console.log('Current storage usage:', storageReport);
    
    // Check token isolation
    const storedUsers = userIsolatedTokenStorage.getStoredUsers();
    console.log('Users with stored tokens:', storedUsers);
    
    // Security recommendations
    if (isAuthenticated && storedUsers.length > 1) {
      console.log('\n⚠️  Security Warning: Multiple users detected in token storage');
      console.log('Recommendation: Use "다른 사용자로 로그인" button for secure user switching');
    }
    
    return {
      isAuthenticated,
      multipleUsers: storedUsers.length > 1,
      storageReport
    };
  },

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('🚀 Running ALL Security Tests...\n');
    
    const results = {
      browserCleanup: await this.testBrowserCleanup(),
      userIsolatedStorage: await this.testUserIsolatedStorage(),
      securityHeaders: this.testSecurityHeaders(),
      loginFlow: await this.testLoginFlowSecurity()
    };
    
    console.log('\n📊 FINAL TEST SUMMARY:');
    console.log('====================');
    console.log(results);
    
    const allPassed = 
      results.browserCleanup.success &&
      results.userIsolatedStorage.saved &&
      results.userIsolatedStorage.isolated &&
      results.securityHeaders.allHeadersPresent &&
      results.securityHeaders.userContextPresent;
    
    console.log('\n' + (allPassed ? '✅ ALL TESTS PASSED!' : '❌ Some tests failed'));
    
    return results;
  }
};

// Export for browser console usage
if (typeof window !== 'undefined') {
  (window as any).testSecurityFeatures = testSecurityFeatures;
  console.log('🔧 Security test suite loaded. Run: testSecurityFeatures.runAllTests()');
}