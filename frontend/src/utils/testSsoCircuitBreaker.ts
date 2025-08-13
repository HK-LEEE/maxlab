/**
 * Test utility to verify SSO Circuit Breaker functionality
 * Run this in browser console to test the circuit breaker
 */

import { SsoRefreshCircuitBreaker } from './ssoRefreshCircuitBreaker';

export function testSsoCircuitBreaker() {
  console.log('🧪 Testing SSO Circuit Breaker...');
  
  // Reset circuit breaker
  SsoRefreshCircuitBreaker.reset();
  console.log('1. ✅ Reset circuit breaker');
  
  // Initial state should allow SSO refresh
  let canAttempt = SsoRefreshCircuitBreaker.canAttemptSsoRefresh();
  console.log('2. Initial state:', canAttempt);
  console.assert(canAttempt.allowed === true, 'Should allow initial attempt');
  
  // Simulate first failure
  SsoRefreshCircuitBreaker.recordFailure('login_required', 'sso_refresh_test1');
  canAttempt = SsoRefreshCircuitBreaker.canAttemptSsoRefresh();
  console.log('3. After 1 failure:', canAttempt);
  console.assert(canAttempt.allowed === true, 'Should still allow after 1 failure');
  
  // Simulate second failure  
  SsoRefreshCircuitBreaker.recordFailure('login_required', 'sso_refresh_test2');
  canAttempt = SsoRefreshCircuitBreaker.canAttemptSsoRefresh();
  console.log('4. After 2 failures:', canAttempt);
  console.assert(canAttempt.allowed === true, 'Should still allow after 2 failures');
  
  // Simulate third failure - should open circuit breaker
  SsoRefreshCircuitBreaker.recordFailure('login_required', 'sso_refresh_test3');
  canAttempt = SsoRefreshCircuitBreaker.canAttemptSsoRefresh();
  console.log('5. After 3 failures (circuit should be open):', canAttempt);
  console.assert(canAttempt.allowed === false, 'Should block after 3 failures');
  console.assert(SsoRefreshCircuitBreaker.isCircuitOpen() === true, 'Circuit should be open');
  
  // Test debug info
  const debugInfo = SsoRefreshCircuitBreaker.getDebugInfo();
  console.log('6. Debug info:', debugInfo);
  console.assert(debugInfo.isCircuitOpen === true, 'Debug should show circuit open');
  console.assert(debugInfo.recentFailures === 3, 'Debug should show 3 recent failures');
  
  // Test success resets circuit
  SsoRefreshCircuitBreaker.recordSuccess();
  canAttempt = SsoRefreshCircuitBreaker.canAttemptSsoRefresh();
  console.log('7. After recording success:', canAttempt);
  console.assert(canAttempt.allowed === true, 'Should allow after success');
  console.assert(SsoRefreshCircuitBreaker.isCircuitOpen() === false, 'Circuit should be closed');
  
  console.log('✅ All SSO Circuit Breaker tests passed!');
  
  // Cleanup
  SsoRefreshCircuitBreaker.reset();
  
  return true;
}

// Make it available in global scope for browser console testing
if (typeof window !== 'undefined') {
  (window as any).testSsoCircuitBreaker = testSsoCircuitBreaker;
}