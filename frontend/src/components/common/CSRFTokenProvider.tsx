/**
 * CSRF Token Provider Component
 * Initializes and manages CSRF protection for the entire application
 */

import React, { useEffect, useState } from 'react';
import { csrfProtection } from '../../services/csrfProtection';

interface CSRFTokenProviderProps {
  children: React.ReactNode;
}

interface CSRFStatus {
  initialized: boolean;
  hasToken: boolean;
  error?: string;
}

export const CSRFTokenProvider: React.FC<CSRFTokenProviderProps> = ({ children }) => {
  const [csrfStatus, setCSRFStatus] = useState<CSRFStatus>({
    initialized: false,
    hasToken: false
  });

  useEffect(() => {
    const initializeCSRF = async () => {
      try {
        console.log('🛡️ Initializing CSRF protection...');
        
        // Get initial token from the service (this will generate one if needed)
        const token = csrfProtection.getToken();
        
        if (token) {
          setCSRFStatus({
            initialized: true,
            hasToken: true
          });
          console.log('✅ CSRF protection initialized successfully');
        } else {
          setCSRFStatus({
            initialized: true,
            hasToken: false,
            error: 'Failed to generate CSRF token'
          });
          console.error('❌ Failed to initialize CSRF protection');
        }
        
      } catch (error: any) {
        console.error('❌ CSRF initialization error:', error);
        setCSRFStatus({
          initialized: true,
          hasToken: false,
          error: error.message || 'CSRF initialization failed'
        });
      }
    };

    initializeCSRF();
  }, []);

  // Optional: Add development helpers
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      // Expose CSRF utilities to window for debugging
      (window as any).csrf = {
        getToken: () => csrfProtection.getToken(),
        getStatus: () => csrfProtection.getTokenStatus(),
        regenerate: () => csrfProtection.forceRegenerate(),
        validate: (token: string) => csrfProtection.validateToken(token)
      };
      
      console.log('🔧 CSRF debugging utilities available at window.csrf');
    }
  }, [csrfStatus.initialized]);

  // Show loading state during initialization
  if (!csrfStatus.initialized) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div>🛡️ Initializing security...</div>
        <div style={{ fontSize: '0.8em', opacity: 0.7 }}>
          Setting up CSRF protection
        </div>
      </div>
    );
  }

  // Show error state if CSRF failed to initialize
  if (csrfStatus.error) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh',
        flexDirection: 'column',
        gap: '1rem',
        color: '#dc3545'
      }}>
        <div>🚫 Security initialization failed</div>
        <div style={{ fontSize: '0.8em' }}>
          {csrfStatus.error}
        </div>
        <button 
          onClick={() => window.location.reload()}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // Render children when CSRF is ready
  return <>{children}</>;
};

/**
 * Hook to get CSRF token status and utilities
 */
export const useCSRF = () => {
  const [tokenStatus, setTokenStatus] = useState(csrfProtection.getTokenStatus());

  const refreshStatus = () => {
    setTokenStatus(csrfProtection.getTokenStatus());
  };

  useEffect(() => {
    // Refresh status periodically
    const interval = setInterval(refreshStatus, 30000); // Every 30 seconds
    
    return () => clearInterval(interval);
  }, []);

  return {
    ...tokenStatus,
    getToken: () => csrfProtection.getToken(),
    getHeaders: () => csrfProtection.getHeaders(),
    validateToken: (token: string) => csrfProtection.validateToken(token),
    regenerateToken: () => {
      const newToken = csrfProtection.forceRegenerate();
      refreshStatus();
      return newToken;
    },
    refreshStatus
  };
};