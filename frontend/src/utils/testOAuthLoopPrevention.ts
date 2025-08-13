/**
 * Test script for OAuth loop prevention
 * Run this in browser console to verify loop prevention is working
 */

import { oauthLoopPrevention } from './oauthInfiniteLoopPrevention';

export function testOAuthLoopPrevention() {
  console.log('🧪 Testing OAuth Loop Prevention System...\n');
  
  // Test 1: Single attempt should be allowed
  console.log('Test 1: Single attempt');
  const canAttempt1 = oauthLoopPrevention.canAttemptOAuth('auto');
  console.log('Result:', canAttempt1.allowed ? '✅ Allowed' : '❌ Blocked');
  console.log('Details:', canAttempt1);
  
  // Test 2: Record a failed attempt
  console.log('\nTest 2: Recording failed attempt');
  oauthLoopPrevention.recordAttempt('auto', false, 'Test failure');
  console.log('✅ Failed attempt recorded');
  
  // Test 3: Multiple rapid attempts (simulate loop)
  console.log('\nTest 3: Simulating rapid attempts (loop condition)');
  for (let i = 0; i < 3; i++) {
    oauthLoopPrevention.recordAttempt('auto', false, 'NS_BINDING_ABORTED', '/oauth/callback');
    console.log(`Attempt ${i + 1} recorded`);
  }
  
  // Test 4: Check if loop is detected
  console.log('\nTest 4: Loop detection');
  const loopDetection = oauthLoopPrevention.detectInfiniteLoop();
  console.log('Loop detected:', loopDetection.inLoop ? '✅ YES' : '❌ NO');
  console.log('Confidence:', loopDetection.confidence + '%');
  console.log('Indicators:', loopDetection.indicators);
  console.log('Recommendation:', loopDetection.recommendation);
  
  // Test 5: Check if new attempt is blocked
  console.log('\nTest 5: Attempt after loop detection');
  const canAttempt2 = oauthLoopPrevention.canAttemptOAuth('auto');
  console.log('Result:', canAttempt2.allowed ? '❌ Allowed (should be blocked!)' : '✅ Blocked');
  console.log('Reason:', canAttempt2.reason);
  console.log('Suggested action:', canAttempt2.suggestedAction);
  
  // Test 6: Manual attempt should still be allowed
  console.log('\nTest 6: Manual attempt during loop');
  const canAttemptManual = oauthLoopPrevention.canAttemptOAuth('manual');
  console.log('Manual attempt:', canAttemptManual.allowed ? '✅ Allowed' : '❌ Blocked');
  
  // Test 7: Get recovery actions
  console.log('\nTest 7: Recovery actions');
  const recoveryActions = oauthLoopPrevention.getRecoveryActions();
  console.log('Recovery actions available:', recoveryActions.length);
  recoveryActions.forEach((action, index) => {
    console.log(`${index + 1}. ${action.description} (Priority: ${action.priority})`);
  });
  
  // Test 8: Debug state
  console.log('\nTest 8: Debug state');
  const debugState = oauthLoopPrevention.getDebugState();
  console.log('Current state:', debugState);
  
  // Test 9: Reset and verify
  console.log('\nTest 9: Manual reset');
  oauthLoopPrevention.manualReset();
  const canAttemptAfterReset = oauthLoopPrevention.canAttemptOAuth('auto');
  console.log('After reset:', canAttemptAfterReset.allowed ? '✅ Allowed' : '❌ Blocked');
  
  console.log('\n🧪 OAuth Loop Prevention Tests Complete!');
  
  return {
    loopDetected: loopDetection.inLoop,
    preventionWorking: !canAttempt2.allowed && canAttemptManual.allowed,
    recoveryAvailable: recoveryActions.length > 0
  };
}

// Make it available globally for browser console testing
if (typeof window !== 'undefined') {
  (window as any).testOAuthLoopPrevention = testOAuthLoopPrevention;
  console.log('✅ OAuth Loop Prevention test loaded. Run testOAuthLoopPrevention() in console to test.');
}