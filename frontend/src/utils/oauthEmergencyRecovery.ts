/**
 * 🚨 OAuth Emergency Recovery System
 * 
 * Handles critical OAuth failures and provides recovery mechanisms.
 * Used when normal OAuth flows fail repeatedly.
 */

import { emergencyOAuthCleanup, cleanupOAuth } from './oauthStateManager';

export interface EmergencyRecoveryOptions {
  // Clear all OAuth state (aggressive cleanup)
  clearAllState?: boolean;
  // Reset browser storage
  resetStorage?: boolean;
  // Force page reload after cleanup
  forceReload?: boolean;
  // Show user guidance
  showUserGuidance?: boolean;
}

export interface RecoveryResult {
  success: boolean;
  actionsPerformed: string[];
  userMessage?: string;
  requiresReload?: boolean;
}

/**
 * 🚨 Emergency OAuth Recovery
 * 
 * Performs comprehensive cleanup and recovery when OAuth flows fail
 */
export async function performEmergencyOAuthRecovery(
  options: EmergencyRecoveryOptions = {}
): Promise<RecoveryResult> {
  const {
    clearAllState = true,
    resetStorage = false,
    forceReload = false,
    showUserGuidance = true
  } = options;

  const actionsPerformed: string[] = [];
  let success = false;

  try {
    console.log('🚨 Starting OAuth emergency recovery...');
    
    // Step 1: Clear all OAuth state
    if (clearAllState) {
      const cleanedCount = emergencyOAuthCleanup();
      actionsPerformed.push(`Cleaned ${cleanedCount} OAuth state entries`);
      console.log(`🧹 Emergency cleanup: removed ${cleanedCount} OAuth entries`);
    }

    // Step 2: Clear related browser storage
    if (resetStorage) {
      try {
        // Clear OAuth-related localStorage
        const localStorageKeys = Object.keys(localStorage).filter(key => 
          key.includes('oauth') || 
          key.includes('token') || 
          key.includes('auth') ||
          key.includes('user')
        );
        
        localStorageKeys.forEach(key => {
          localStorage.removeItem(key);
        });
        
        actionsPerformed.push(`Cleared ${localStorageKeys.length} localStorage entries`);
        console.log(`🧹 Cleared ${localStorageKeys.length} localStorage OAuth entries`);
      } catch (error) {
        console.error('Failed to clear localStorage:', error);
      }
    }

    // Step 3: Clear any lingering popup references
    try {
      // Close any open OAuth popups
      if (window.name && window.name.includes('oauth')) {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({
            type: 'OAUTH_ERROR',
            error: 'OAuth flow reset - please try again'
          }, '*');
        }
        window.close();
        actionsPerformed.push('Closed OAuth popup window');
      }
    } catch (error) {
      console.warn('Could not close popup:', error);
    }

    // Step 4: Reset browser state flags
    try {
      // Remove any DOM markers
      document.body.removeAttribute('data-oauth-processing');
      document.body.removeAttribute('data-auth-state');
      
      // Clear any temporary CSS classes
      document.body.classList.remove('oauth-loading', 'auth-processing');
      
      actionsPerformed.push('Reset DOM state markers');
    } catch (error) {
      console.warn('Could not reset DOM state:', error);
    }

    success = true;
    console.log('✅ OAuth emergency recovery completed successfully');

  } catch (error) {
    console.error('❌ OAuth emergency recovery failed:', error);
    actionsPerformed.push(`Recovery failed: ${error.message}`);
  }

  // Generate user message
  let userMessage: string | undefined;
  if (showUserGuidance) {
    if (success) {
      userMessage = "OAuth session has been reset. Please try logging in again.";
    } else {
      userMessage = "OAuth recovery failed. Please refresh the page and try again, or contact support if the problem persists.";
    }
  }

  const result: RecoveryResult = {
    success,
    actionsPerformed,
    userMessage,
    requiresReload: forceReload || (!success && resetStorage)
  };

  // Perform forced reload if requested
  if (forceReload) {
    console.log('🔄 Forcing page reload after OAuth emergency recovery...');
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  }

  return result;
}

/**
 * 🔍 Detect if OAuth emergency recovery is needed
 */
export function shouldPerformEmergencyRecovery(): {
  needed: boolean;
  reasons: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
} {
  const reasons: string[] = [];
  let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';

  // Check for multiple failed OAuth attempts
  const recentErrors = getRecentOAuthErrors();
  if (recentErrors.length >= 3) {
    reasons.push(`${recentErrors.length} recent OAuth failures`);
    severity = 'high';
  }

  // Check for stuck OAuth flows
  const stuckFlows = getStuckOAuthFlows();
  if (stuckFlows > 0) {
    reasons.push(`${stuckFlows} stuck OAuth flows detected`);
    if (severity === 'low') severity = 'medium';
  }

  // Check for browser storage corruption
  const storageIssues = detectStorageCorruption();
  if (storageIssues.length > 0) {
    reasons.push(`Storage corruption: ${storageIssues.join(', ')}`);
    if (severity === 'low' || severity === 'medium') severity = 'high';
  }

  // Check for popup communication failures
  const popupIssues = detectPopupCommunicationIssues();
  if (popupIssues.length > 0) {
    reasons.push(`Popup issues: ${popupIssues.join(', ')}`);
    if (severity === 'low') severity = 'medium';
  }

  return {
    needed: reasons.length > 0,
    reasons,
    severity
  };
}

/**
 * 🔧 Helper functions for detection
 */
function getRecentOAuthErrors(): any[] {
  try {
    const errors = JSON.parse(sessionStorage.getItem('oauth_security_violations') || '[]');
    const recentErrors = errors.filter((error: any) => {
      const errorTime = new Date(error.timestamp).getTime();
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      return errorTime > fiveMinutesAgo;
    });
    return recentErrors;
  } catch {
    return [];
  }
}

function getStuckOAuthFlows(): number {
  try {
    let stuckCount = 0;
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('oauth_flow_')) {
        const flowData = JSON.parse(sessionStorage.getItem(key) || '{}');
        const flowAge = Date.now() - flowData.createdAt;
        // Flows older than 10 minutes are considered stuck
        if (flowAge > 10 * 60 * 1000 && flowData.status === 'in_progress') {
          stuckCount++;
        }
      }
    }
    return stuckCount;
  } catch {
    return 0;
  }
}

function detectStorageCorruption(): string[] {
  const issues: string[] = [];
  
  try {
    // Check for malformed OAuth data
    const testKey = 'oauth_test_' + Date.now();
    sessionStorage.setItem(testKey, 'test');
    const retrieved = sessionStorage.getItem(testKey);
    sessionStorage.removeItem(testKey);
    
    if (retrieved !== 'test') {
      issues.push('SessionStorage read/write failure');
    }
  } catch {
    issues.push('SessionStorage access failure');
  }

  try {
    // Check localStorage
    const testKey = 'oauth_test_' + Date.now();
    localStorage.setItem(testKey, 'test');
    const retrieved = localStorage.getItem(testKey);
    localStorage.removeItem(testKey);
    
    if (retrieved !== 'test') {
      issues.push('LocalStorage read/write failure');
    }
  } catch {
    issues.push('LocalStorage access failure');
  }

  return issues;
}

function detectPopupCommunicationIssues(): string[] {
  const issues: string[] = [];
  
  // Check for popup blocker
  try {
    const testPopup = window.open('about:blank', 'test', 'width=1,height=1');
    if (!testPopup) {
      issues.push('Popup blocked by browser');
    } else {
      testPopup.close();
    }
  } catch {
    issues.push('Popup creation failed');
  }

  // Check for cross-origin restrictions
  if (document.referrer && document.referrer !== window.location.origin) {
    try {
      const referrerOrigin = new URL(document.referrer).origin;
      if (referrerOrigin !== window.location.origin) {
        issues.push('Cross-origin communication detected');
      }
    } catch {
      issues.push('Referrer parsing failed');
    }
  }

  return issues;
}

/**
 * 🔄 Auto-recovery system
 */
export function enableAutoRecovery(): void {
  // Set up automatic recovery detection
  const checkInterval = setInterval(() => {
    const recoveryCheck = shouldPerformEmergencyRecovery();
    
    if (recoveryCheck.needed && recoveryCheck.severity === 'critical') {
      console.warn('🚨 Critical OAuth issue detected, performing automatic recovery...');
      performEmergencyOAuthRecovery({
        clearAllState: true,
        resetStorage: true,
        showUserGuidance: true
      }).then(result => {
        console.log('🔄 Automatic OAuth recovery completed:', result);
        if (result.requiresReload) {
          window.location.reload();
        }
      });
      
      // Clear the interval after recovery
      clearInterval(checkInterval);
    }
  }, 30000); // Check every 30 seconds

  // Store interval ID for cleanup
  (window as any).__oauthAutoRecoveryInterval = checkInterval;
}

/**
 * 🛑 Disable auto-recovery
 */
export function disableAutoRecovery(): void {
  const intervalId = (window as any).__oauthAutoRecoveryInterval;
  if (intervalId) {
    clearInterval(intervalId);
    delete (window as any).__oauthAutoRecoveryInterval;
  }
}