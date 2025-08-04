/**
 * Comprehensive Authentication Initialization Debugger
 * Run this to diagnose authentication startup issues
 */

import { useAuthStore } from '../stores/authStore';
import AuthDiagnostics from './authDiagnostics';

export interface AuthInitDebugReport {
  timestamp: string;
  issue: string;
  currentState: any;
  possibleCauses: string[];
  recommendedActions: string[];
  technicalDetails: any;
}

export class AuthInitDebugger {
  
  /**
   * Debug authentication initialization issues
   */
  static async debugInitialization(): Promise<AuthInitDebugReport> {
    console.group('🔍 Authentication Initialization Debug Session');
    
    const report: AuthInitDebugReport = {
      timestamp: new Date().toISOString(),
      issue: 'Authentication initialization analysis',
      currentState: {},
      possibleCauses: [],
      recommendedActions: [],
      technicalDetails: {}
    };

    try {
      // Get current auth state
      const authState = useAuthStore.getState();
      report.currentState = {
        initState: authState.initState,
        isAuthenticated: authState.isAuthenticated,
        progressPercentage: authState.getProgressPercentage(),
        error: authState.error,
        user: authState.user ? { id: authState.user.id, email: authState.user.email } : null
      };

      console.log('📊 Current State:', report.currentState);

      // Check if stuck at 0%
      if (authState.getProgressPercentage() === 0) {
        report.issue = 'Authentication progress stuck at 0%';
        
        if (authState.initState === 'idle') {
          report.possibleCauses.push('App initialization not triggered (fixed in latest version)');
          report.recommendedActions.push('Refresh page - initialization should now work');
        }

        if (authState.error) {
          report.possibleCauses.push(`Error preventing initialization: ${authState.error.type}`);
          report.recommendedActions.push('Check error details and resolve underlying issue');
        }
      }

      // Test API connectivity
      console.log('🌐 Testing API connectivity...');
      const connectivity = await AuthDiagnostics.testAPIConnectivity();
      report.technicalDetails.connectivity = connectivity;

      if (connectivity.authServer.status !== 'connected') {
        report.possibleCauses.push('Authentication server not accessible');
        report.recommendedActions.push('Check if authentication server is running on the correct port');
      }

      if (connectivity.apiServer.status !== 'connected') {
        report.possibleCauses.push('MAX Lab API server not accessible');
        report.recommendedActions.push('Check if MAX Lab backend is running on the correct port');
      }

      // Check security issues
      console.log('🔒 Checking security configuration...');
      const securityIssues = AuthDiagnostics.checkSecurityIssues();
      if (securityIssues.length > 0) {
        report.possibleCauses.push(...securityIssues);
        report.recommendedActions.push('Fix security configuration issues listed above');
      }

      // Check localStorage/sessionStorage
      console.log('💾 Checking storage availability...');
      try {
        const storedData = {
          accessToken: !!localStorage.getItem('accessToken'),
          user: !!localStorage.getItem('user'),
          authStorage: !!localStorage.getItem('maxlab-auth-storage')
        };
        report.technicalDetails.storage = storedData;

        if (storedData.authStorage && !storedData.accessToken) {
          report.possibleCauses.push('Auth storage exists but access token missing - possible token expiry');
          report.recommendedActions.push('Clear browser storage and try fresh login');
        }
      } catch (e) {
        report.possibleCauses.push('Browser storage not available (incognito mode?)');
        report.recommendedActions.push('Try in normal browser mode, not incognito');
      }

      // Environment variables check
      console.log('⚙️ Checking environment configuration...');
      const envConfig = {
        authServerUrl: import.meta.env.VITE_AUTH_SERVER_URL || 'default: http://localhost:8000',
        apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'default: http://localhost:8010',
        clientId: import.meta.env.VITE_CLIENT_ID || 'default: maxlab'
      };
      report.technicalDetails.environment = envConfig;

      // Network status
      report.technicalDetails.network = {
        online: navigator.onLine,
        userAgent: navigator.userAgent,
        cookieEnabled: navigator.cookieEnabled
      };

      // Final recommendations
      if (report.possibleCauses.length === 0) {
        if (authState.initState === 'ready' && !authState.isAuthenticated) {
          report.issue = 'System ready for manual login';
          report.recommendedActions.push('Click login button to authenticate');
        } else if (authState.isAuthenticated) {
          report.issue = 'Authentication successful';
          report.recommendedActions.push('System is working correctly');
        } else {
          report.issue = 'Authentication in progress';
          report.recommendedActions.push('Wait for initialization to complete');
        }
      }

    } catch (error: any) {
      report.possibleCauses.push(`Debug script error: ${error.message}`);
      report.recommendedActions.push('Contact technical support with this error');
      console.error('Debug script error:', error);
    }

    console.groupEnd();
    return report;
  }

  /**
   * Print user-friendly debug report
   */
  static async printDebugReport(): Promise<void> {
    const report = await this.debugInitialization();

    console.group('🩺 Authentication Debug Report');
    console.log('⏰ Generated:', report.timestamp);
    console.log('🔍 Issue:', report.issue);
    
    if (report.possibleCauses.length > 0) {
      console.group('🤔 Possible Causes:');
      report.possibleCauses.forEach((cause, i) => {
        console.log(`${i + 1}. ${cause}`);
      });
      console.groupEnd();
    }

    if (report.recommendedActions.length > 0) {
      console.group('✅ Recommended Actions:');
      report.recommendedActions.forEach((action, i) => {
        console.log(`${i + 1}. ${action}`);
      });
      console.groupEnd();
    }

    console.group('📋 Technical Details:');
    console.log('Current State:', report.currentState);
    console.log('Connectivity:', report.technicalDetails.connectivity);
    console.log('Storage:', report.technicalDetails.storage);
    console.log('Environment:', report.technicalDetails.environment);
    console.log('Network:', report.technicalDetails.network);
    console.groupEnd();

    console.groupEnd();
  }

  /**
   * Quick fix helper - attempt common solutions
   */
  static async attemptQuickFix(): Promise<string[]> {
    const actions: string[] = [];
    
    try {
      const authState = useAuthStore.getState();
      
      // 🔧 CRITICAL FIX: Handle authenticated user stuck in idle
      if (authState.isAuthenticated && authState.user && authState.initState === 'idle') {
        console.log('🔧 Fixing authenticated user stuck in idle state');
        authState.setAuthState('hydrating');
        actions.push('Fixed authenticated user stuck in idle state - set to hydrating');
        
        // Trigger sync with server
        setTimeout(() => {
          authState.setAuthState('syncing');
          actions.push('Initiated server sync');
        }, 100);
      }
      
      // Clear potentially corrupted auth storage
      const authStorage = localStorage.getItem('maxlab-auth-storage');
      if (authStorage) {
        const parsedStorage = JSON.parse(authStorage);
        if (parsedStorage?.state?.user && !localStorage.getItem('accessToken')) {
          localStorage.removeItem('maxlab-auth-storage');
          actions.push('Cleared corrupted auth storage');
        }
      }

      // Force re-initialization for other cases
      if (authState.error) {
        authState.clearError();
        authState.resetRetry();
        actions.push('Cleared authentication errors');
      }

    } catch (error: any) {
      actions.push(`Quick fix error: ${error.message}`);
    }

    return actions;
  }
  
  /**
   * Force authenticated user to proper state
   */
  static forceAuthenticatedUserSync(): void {
    const authState = useAuthStore.getState();
    
    if (authState.isAuthenticated && authState.user) {
      console.log('🔧 Force syncing authenticated user...');
      authState.setAuthState('syncing');
      
      // Import and trigger server sync
      import('../services/authService').then(({ authService }) => {
        authService.attemptSilentLogin().then(result => {
          if (result.success && result.user) {
            console.log('✅ Force sync successful');
            authState.setAuth(localStorage.getItem('accessToken') || '', result.user);
          } else {
            console.log('⚠️ Force sync failed, but keeping current auth state');
            authState.setAuthState('ready');
          }
        });
      });
    }
  }
}

// Global access for debugging
if (typeof window !== 'undefined') {
  (window as any).AuthInitDebugger = AuthInitDebugger;
  
  // Convenient global functions
  (window as any).debugAuth = AuthInitDebugger.printDebugReport;
  (window as any).fixAuth = AuthInitDebugger.attemptQuickFix;
  (window as any).forceAuthSync = AuthInitDebugger.forceAuthenticatedUserSync;
}

export default AuthInitDebugger;