/**
 * Rate Limit React Hook
 * Provides rate limit monitoring and status for React components
 */

import { useState, useEffect, useCallback } from 'react';
import { rateLimitMonitor, RateLimitInfo, RateLimitWarning, RateLimitRule } from '../services/rateLimitMonitor';

export interface RateLimitHookState {
  status: RateLimitInfo | null;
  warnings: RateLimitWarning[];
  rules: RateLimitRule[];
  isMonitoring: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface RateLimitHookActions {
  startMonitoring: () => void;
  stopMonitoring: () => void;
  refreshStatus: () => Promise<void>;
  checkEndpoint: (endpoint: string, method?: string) => Promise<RateLimitInfo | null>;
  clearWarnings: () => void;
  dismissWarning: (index: number) => void;
}

export interface RateLimitHookUtils {
  isRateLimited: boolean;
  isBlacklisted: boolean;
  isWhitelisted: boolean;
  remainingPercentage: number;
  timeUntilReset: string;
  shouldShowWarning: boolean;
}

export const useRateLimit = () => {
  const [state, setState] = useState<RateLimitHookState>({
    status: null,
    warnings: [],
    rules: [],
    isMonitoring: false,
    isLoading: false,
    error: null
  });

  /**
   * Handle rate limit warnings
   */
  const handleWarning = useCallback((warning: RateLimitWarning) => {
    setState(prev => ({
      ...prev,
      warnings: [...prev.warnings, { ...warning, timestamp: Date.now() }]
    }));

    // Auto-dismiss warnings after 10 seconds
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        warnings: prev.warnings.filter(w => w !== warning)
      }));
    }, 10000);
  }, []);

  /**
   * Start monitoring rate limits
   */
  const startMonitoring = useCallback(() => {
    rateLimitMonitor.startMonitoring(30000); // Check every 30 seconds
    setState(prev => ({ ...prev, isMonitoring: true }));
  }, []);

  /**
   * Stop monitoring rate limits
   */
  const stopMonitoring = useCallback(() => {
    rateLimitMonitor.stopMonitoring();
    setState(prev => ({ ...prev, isMonitoring: false }));
  }, []);

  /**
   * Refresh current rate limit status
   */
  const refreshStatus = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const status = await rateLimitMonitor.getCurrentStatus();
      setState(prev => ({
        ...prev,
        status,
        isLoading: false
      }));
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        error: error.message || 'Failed to refresh status',
        isLoading: false
      }));
    }
  }, []);

  /**
   * Check rate limit for specific endpoint
   */
  const checkEndpoint = useCallback(async (endpoint: string, method: string = 'GET') => {
    try {
      return await rateLimitMonitor.checkEndpoint(endpoint, method);
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        error: error.message || 'Failed to check endpoint'
      }));
      return null;
    }
  }, []);

  /**
   * Clear all warnings
   */
  const clearWarnings = useCallback(() => {
    setState(prev => ({ ...prev, warnings: [] }));
  }, []);

  /**
   * Dismiss specific warning
   */
  const dismissWarning = useCallback((index: number) => {
    setState(prev => ({
      ...prev,
      warnings: prev.warnings.filter((_, i) => i !== index)
    }));
  }, []);

  /**
   * Load rate limiting rules
   */
  const loadRules = useCallback(async () => {
    try {
      const rules = await rateLimitMonitor.getRules();
      setState(prev => ({ ...prev, rules }));
    } catch (error: any) {
      console.warn('Failed to load rate limit rules:', error);
    }
  }, []);

  /**
   * Initialize hook
   */
  useEffect(() => {
    // Subscribe to warnings
    const unsubscribe = rateLimitMonitor.onWarning(handleWarning);

    // Load initial data
    refreshStatus();
    loadRules();

    return () => {
      unsubscribe();
    };
  }, [handleWarning, refreshStatus, loadRules]);

  /**
   * Update status from cached data periodically
   */
  useEffect(() => {
    const interval = setInterval(() => {
      const cachedStatus = rateLimitMonitor.getCachedStatus();
      if (cachedStatus) {
        setState(prev => ({ ...prev, status: cachedStatus }));
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Calculate derived values
  const isRateLimited = state.status?.remaining === 0 || false;
  const isBlacklisted = state.status?.is_blacklisted || false;
  const isWhitelisted = state.status?.is_whitelisted || false;
  const remainingPercentage = state.status 
    ? Math.round((state.status.remaining / state.status.limit) * 100)
    : 100;
  const timeUntilReset = state.status 
    ? rateLimitMonitor.formatTimeUntilReset(state.status.reset_time)
    : '';
  const shouldShowWarning = state.warnings.length > 0 || isRateLimited || isBlacklisted;

  const actions: RateLimitHookActions = {
    startMonitoring,
    stopMonitoring,
    refreshStatus,
    checkEndpoint,
    clearWarnings,
    dismissWarning
  };

  const utils: RateLimitHookUtils = {
    isRateLimited,
    isBlacklisted,
    isWhitelisted,
    remainingPercentage,
    timeUntilReset,
    shouldShowWarning
  };

  return {
    ...state,
    actions,
    utils
  };
};

export default useRateLimit;