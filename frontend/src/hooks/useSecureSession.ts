/**
 * Secure Session Management Hook
 * Provides session handling with security monitoring and automatic refresh
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { apiClient } from '../api/client';

export interface SessionInfo {
  session_id: string;
  user_id: string;
  created_at: string;
  last_accessed: string;
  expires_at: string;
  ip_address: string;
  user_agent: string;
  is_active: boolean;
  time_remaining_seconds: number;
}

export interface SessionSecurityInfo {
  session_security: {
    session_age_seconds: number;
    time_since_last_access_seconds: number;
    ip_address_match: boolean;
    user_agent_match: boolean;
    session_ip: string;
    current_ip: string;
    created_at: string;
    last_accessed: string;
    expires_at: string;
  };
  security_recommendations: string[];
}

export interface SessionHookState {
  session: SessionInfo | null;
  securityInfo: SessionSecurityInfo | null;
  isLoading: boolean;
  error: string | null;
  timeRemaining: number;
  needsRenewal: boolean;
}

export const useSecureSession = () => {
  const [state, setState] = useState<SessionHookState>({
    session: null,
    securityInfo: null,
    isLoading: true,
    error: null,
    timeRemaining: 0,
    needsRenewal: false
  });

  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const securityCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Fetch current session information
   */
  const fetchSessionInfo = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const response = await apiClient.get('/v1/session/current');
      const sessionData = response.data;
      
      if (sessionData) {
        setState(prev => ({
          ...prev,
          session: sessionData,
          timeRemaining: sessionData.time_remaining_seconds,
          needsRenewal: sessionData.time_remaining_seconds < 300, // 5 minutes
          isLoading: false
        }));
      } else {
        setState(prev => ({
          ...prev,
          session: null,
          timeRemaining: 0,
          needsRenewal: false,
          isLoading: false
        }));
      }
    } catch (error: any) {
      console.error('Failed to fetch session info:', error);
      setState(prev => ({
        ...prev,
        error: error.message || 'Failed to fetch session info',
        isLoading: false
      }));
    }
  }, []);

  /**
   * Fetch session security information
   */
  const fetchSecurityInfo = useCallback(async () => {
    try {
      const response = await apiClient.get('/v1/session/security-info');
      setState(prev => ({
        ...prev,
        securityInfo: response.data
      }));
    } catch (error: any) {
      console.error('Failed to fetch security info:', error);
      // Don't set error state for security info - it's optional
    }
  }, []);

  /**
   * Regenerate session ID for security
   */
  const regenerateSession = useCallback(async (): Promise<boolean> => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const response = await apiClient.post('/v1/session/regenerate');
      const newSession = response.data;
      
      setState(prev => ({
        ...prev,
        session: newSession,
        timeRemaining: newSession.time_remaining_seconds,
        needsRenewal: false,
        isLoading: false
      }));
      
      console.log('✅ Session ID regenerated successfully');
      return true;
    } catch (error: any) {
      console.error('Failed to regenerate session:', error);
      setState(prev => ({
        ...prev,
        error: error.message || 'Failed to regenerate session',
        isLoading: false
      }));
      return false;
    }
  }, []);

  /**
   * Logout current session
   */
  const logoutSession = useCallback(async (): Promise<boolean> => {
    try {
      await apiClient.post('/v1/session/logout');
      
      setState({
        session: null,
        securityInfo: null,
        isLoading: false,
        error: null,
        timeRemaining: 0,
        needsRenewal: false
      });
      
      console.log('✅ Session logged out successfully');
      return true;
    } catch (error: any) {
      console.error('Failed to logout session:', error);
      setState(prev => ({
        ...prev,
        error: error.message || 'Failed to logout session'
      }));
      return false;
    }
  }, []);

  /**
   * Logout all sessions for current user
   */
  const logoutAllSessions = useCallback(async (): Promise<boolean> => {
    try {
      const response = await apiClient.post('/v1/session/logout-all');
      
      setState({
        session: null,
        securityInfo: null,
        isLoading: false,
        error: null,
        timeRemaining: 0,
        needsRenewal: false
      });
      
      console.log('✅ All sessions logged out successfully');
      return true;
    } catch (error: any) {
      console.error('Failed to logout all sessions:', error);
      setState(prev => ({
        ...prev,
        error: error.message || 'Failed to logout all sessions'
      }));
      return false;
    }
  }, []);

  /**
   * Get all user sessions
   */
  const getUserSessions = useCallback(async (): Promise<SessionInfo[]> => {
    try {
      const response = await apiClient.get('/v1/session/list');
      return response.data.sessions;
    } catch (error: any) {
      console.error('Failed to get user sessions:', error);
      return [];
    }
  }, []);

  /**
   * Update time remaining counter
   */
  const updateTimeRemaining = useCallback(() => {
    setState(prev => {
      if (!prev.session) return prev;
      
      const newTimeRemaining = Math.max(0, prev.timeRemaining - 1);
      const needsRenewal = newTimeRemaining < 300; // 5 minutes
      
      // Automatically regenerate session if it's about to expire
      if (needsRenewal && newTimeRemaining > 0 && !prev.needsRenewal) {
        console.log('🔄 Session expires soon, considering regeneration...');
      }
      
      return {
        ...prev,
        timeRemaining: newTimeRemaining,
        needsRenewal
      };
    });
  }, []);

  /**
   * Handle session expiration
   */
  useEffect(() => {
    if (state.session && state.timeRemaining <= 0) {
      console.log('⏰ Session expired, logging out...');
      logoutSession();
      
      // Dispatch session expired event
      window.dispatchEvent(new CustomEvent('session:expired', {
        detail: { reason: 'timeout' }
      }));
    }
  }, [state.timeRemaining, state.session, logoutSession]);

  /**
   * Initialize session monitoring
   */
  useEffect(() => {
    fetchSessionInfo();
    fetchSecurityInfo();

    // Set up refresh interval (every 30 seconds)
    refreshIntervalRef.current = setInterval(() => {
      updateTimeRemaining();
    }, 1000);

    // Set up security check interval (every 5 minutes)
    securityCheckIntervalRef.current = setInterval(() => {
      fetchSecurityInfo();
    }, 5 * 60 * 1000);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
      if (securityCheckIntervalRef.current) {
        clearInterval(securityCheckIntervalRef.current);
      }
    };
  }, [fetchSessionInfo, fetchSecurityInfo, updateTimeRemaining]);

  /**
   * Listen for session events
   */
  useEffect(() => {
    const handleSessionEvent = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log('Session event received:', customEvent.type, customEvent.detail);
      
      // Refresh session info on session events
      fetchSessionInfo();
    };

    window.addEventListener('session:regenerated', handleSessionEvent);
    window.addEventListener('session:logout', handleSessionEvent);
    
    return () => {
      window.removeEventListener('session:regenerated', handleSessionEvent);
      window.removeEventListener('session:logout', handleSessionEvent);
    };
  }, [fetchSessionInfo]);

  /**
   * Security monitoring
   */
  useEffect(() => {
    if (state.securityInfo) {
      const { session_security } = state.securityInfo;
      
      // Check for security issues
      if (!session_security.ip_address_match) {
        console.warn('🚨 Security alert: IP address mismatch detected');
        window.dispatchEvent(new CustomEvent('session:security-alert', {
          detail: { 
            type: 'ip_mismatch',
            message: 'Your IP address has changed since login',
            recommendations: state.securityInfo.security_recommendations
          }
        }));
      }
      
      if (!session_security.user_agent_match) {
        console.warn('🚨 Security alert: User agent mismatch detected');
        window.dispatchEvent(new CustomEvent('session:security-alert', {
          detail: { 
            type: 'user_agent_mismatch',
            message: 'Your browser/device has changed since login',
            recommendations: state.securityInfo.security_recommendations
          }
        }));
      }
    }
  }, [state.securityInfo]);

  return {
    ...state,
    actions: {
      regenerateSession,
      logoutSession,
      logoutAllSessions,
      getUserSessions,
      refreshSessionInfo: fetchSessionInfo,
      refreshSecurityInfo: fetchSecurityInfo
    },
    utils: {
      formatTimeRemaining: (seconds: number): string => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
          return `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
          return `${minutes}m ${secs}s`;
        } else {
          return `${secs}s`;
        }
      },
      isSessionHealthy: (): boolean => {
        if (!state.securityInfo) return true;
        
        const { session_security } = state.securityInfo;
        return session_security.ip_address_match && 
               session_security.user_agent_match &&
               session_security.session_age_seconds < 24 * 3600; // Less than 24 hours
      }
    }
  };
};