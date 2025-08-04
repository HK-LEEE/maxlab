/**
 * Authentication Diagnostics Utility
 * Helps debug authentication initialization issues
 */

import { useAuthStore } from '../stores/authStore';

export interface AuthDiagnosticsReport {
  timestamp: string;
  authState: {
    isAuthenticated: boolean;
    initState: string;
    error: any;
    user: any;
    progressPercentage: number;
    timeInState: number;
  };
  storage: {
    localStorage: {
      accessToken: string | null;
      tokenExpiryTime: string | null;
      user: string | null;
    };
    sessionStorage: {
      oauth_state: string | null;
      silent_oauth_state: string | null;
    };
  };
  network: {
    online: boolean;
    connection: any;
  };
  security: {
    origin: string;
    protocol: string;
    isSecureContext: boolean;
    cookieEnabled: boolean;
  };
}

export class AuthDiagnostics {
  
  /**
   * Generate comprehensive diagnostics report
   */
  static generateReport(): AuthDiagnosticsReport {
    const authState = useAuthStore.getState();
    
    return {
      timestamp: new Date().toISOString(),
      authState: {
        isAuthenticated: authState.isAuthenticated,
        initState: authState.initState,
        error: authState.error,
        user: authState.user ? {
          id: authState.user.id,
          email: authState.user.email,
          is_admin: authState.user.is_admin
        } : null,
        progressPercentage: authState.getProgressPercentage(),
        timeInState: authState.getTimeInState()
      },
      storage: {
        localStorage: {
          accessToken: localStorage.getItem('accessToken'),
          tokenExpiryTime: localStorage.getItem('tokenExpiryTime'),
          user: localStorage.getItem('user')
        },
        sessionStorage: {
          oauth_state: sessionStorage.getItem('oauth_state'),
          silent_oauth_state: sessionStorage.getItem('silent_oauth_state')
        }
      },
      network: {
        online: navigator.onLine,
        connection: (navigator as any).connection || null
      },
      security: {
        origin: window.location.origin,
        protocol: window.location.protocol,
        isSecureContext: window.isSecureContext,
        cookieEnabled: navigator.cookieEnabled
      }
    };
  }

  /**
   * Log detailed diagnostics to console
   */
  static logDiagnostics(): void {
    const report = this.generateReport();
    
    console.group('🔍 Authentication Diagnostics Report');
    console.log('📊 Report generated at:', report.timestamp);
    
    console.group('🔐 Authentication State');
    console.log('Is Authenticated:', report.authState.isAuthenticated);
    console.log('Init State:', report.authState.initState);
    console.log('Progress:', `${report.authState.progressPercentage}%`);
    console.log('Time in State:', `${Math.round(report.authState.timeInState / 1000)}s`);
    console.log('Error:', report.authState.error);
    console.log('User:', report.authState.user);
    console.groupEnd();

    console.group('💾 Storage Analysis');
    console.log('localStorage:', report.storage.localStorage);
    console.log('sessionStorage:', report.storage.sessionStorage);
    console.groupEnd();

    console.group('🌐 Network Status');
    console.log('Online:', report.network.online);
    console.log('Connection:', report.network.connection);
    console.groupEnd();

    console.group('🔒 Security Context');
    console.log('Origin:', report.security.origin);
    console.log('Protocol:', report.security.protocol);
    console.log('Secure Context:', report.security.isSecureContext);
    console.log('Cookies Enabled:', report.security.cookieEnabled);
    console.groupEnd();

    console.groupEnd();
  }

  /**
   * Monitor authentication state changes
   */
  static startMonitoring(): () => void {
    let lastState = '';
    
    const monitor = () => {
      const currentState = useAuthStore.getState().initState;
      if (currentState !== lastState) {
        console.log(`🔄 Auth State Change: ${lastState} → ${currentState}`);
        lastState = currentState;
        
        // Log detailed info on state changes
        if (currentState === 'error') {
          console.error('❌ Authentication Error:', useAuthStore.getState().error);
          this.logDiagnostics();
        }
      }
    };

    const intervalId = setInterval(monitor, 1000);
    
    // Initial state
    lastState = useAuthStore.getState().initState;
    console.log('👀 Started authentication monitoring');
    
    return () => {
      clearInterval(intervalId);
      console.log('🛑 Stopped authentication monitoring');
    };
  }

  /**
   * Test API connectivity
   */
  static async testAPIConnectivity(): Promise<{
    authServer: { status: string; url: string; error?: string };
    apiServer: { status: string; url: string; error?: string };
  }> {
    const authServerUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000';
    const apiServerUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8010';
    
    const testConnection = async (url: string, endpoint: string = '/health', fallbackEndpoints: string[] = []) => {
      const endpoints = [endpoint, ...fallbackEndpoints];
      
      for (const testEndpoint of endpoints) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          
          const response = await fetch(`${url}${testEndpoint}`, {
            method: 'GET',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json'
            }
          });
          
          clearTimeout(timeoutId);
          
          // If successful, return connection status with endpoint used
          return { 
            status: response.ok ? 'connected' : 'partial', 
            url, 
            endpoint: testEndpoint,
            statusCode: response.status
          };
        } catch (error: any) {
          // Try next endpoint if available
          if (testEndpoint === endpoints[endpoints.length - 1]) {
            // Last endpoint failed
            if (error.name === 'AbortError') {
              return { status: 'timeout', url, error: 'Connection timeout' };
            }
            return { status: 'error', url, error: error.message };
          }
          // Continue to next endpoint
        }
      }
      
      return { status: 'error', url, error: 'All endpoints failed' };
    };

    const [authResult, apiResult] = await Promise.all([
      testConnection(authServerUrl, '/api/health', ['/api/oauth/authorize', '/health']), // Auth server endpoints
      testConnection(apiServerUrl, '/api/v1/health/', ['/health', '/api/health']) // MAX Lab backend endpoints
    ]);

    return {
      authServer: authResult,
      apiServer: apiResult
    };
  }

  /**
   * Check for common security issues
   */
  static checkSecurityIssues(): string[] {
    const issues: string[] = [];
    
    // Check for mixed content
    if (window.location.protocol === 'https:' && 
        (import.meta.env.VITE_AUTH_SERVER_URL?.startsWith('http:') || 
         import.meta.env.VITE_API_BASE_URL?.startsWith('http:'))) {
      issues.push('Mixed content detected: HTTPS page loading HTTP resources');
    }

    // Check for missing environment variables
    if (!import.meta.env.VITE_AUTH_SERVER_URL) {
      issues.push('Missing VITE_AUTH_SERVER_URL environment variable');
    }

    if (!import.meta.env.VITE_CLIENT_ID) {
      issues.push('Missing VITE_CLIENT_ID environment variable');
    }

    // Check for local storage availability
    try {
      localStorage.setItem('test', 'test');
      localStorage.removeItem('test');
    } catch (e) {
      issues.push('localStorage is not available (incognito mode?)');
    }

    // Check for session storage availability
    try {
      sessionStorage.setItem('test', 'test');
      sessionStorage.removeItem('test');
    } catch (e) {
      issues.push('sessionStorage is not available');
    }

    return issues;
  }
}

// Global access for debugging
if (typeof window !== 'undefined') {
  (window as any).AuthDiagnostics = AuthDiagnostics;
}

export default AuthDiagnostics;