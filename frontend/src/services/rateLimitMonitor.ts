/**
 * Rate Limit Monitoring Service
 * Tracks API rate limit status and provides warnings
 */

import { apiClient } from '../api/client';

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset_time: number;
  identifier: string;
  is_whitelisted: boolean;
  is_blacklisted: boolean;
  active_windows: any[];
}

export interface RateLimitRule {
  endpoint_pattern: string;
  requests_per_window: number;
  window_size_seconds: number;
  user_role?: string;
  method?: string;
  description: string;
}

export interface RateLimitWarning {
  type: 'approaching_limit' | 'rate_limited' | 'blacklisted';
  message: string;
  remaining: number;
  reset_time: number;
  retry_after?: number;
}

class RateLimitMonitor {
  private static instance: RateLimitMonitor;
  private currentStatus: RateLimitInfo | null = null;
  private warningCallbacks: ((warning: RateLimitWarning) => void)[] = [];
  private isMonitoring = false;
  private monitoringInterval: NodeJS.Timeout | null = null;

  static getInstance(): RateLimitMonitor {
    if (!RateLimitMonitor.instance) {
      RateLimitMonitor.instance = new RateLimitMonitor();
    }
    return RateLimitMonitor.instance;
  }

  /**
   * Start monitoring rate limit status
   */
  startMonitoring(intervalMs: number = 30000): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.checkCurrentStatus();
    }, intervalMs);

    // Initial check
    this.checkCurrentStatus();
    console.log('🔍 Rate limit monitoring started');
  }

  /**
   * Stop monitoring rate limit status
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    console.log('⏹️ Rate limit monitoring stopped');
  }

  /**
   * Subscribe to rate limit warnings
   */
  onWarning(callback: (warning: RateLimitWarning) => void): () => void {
    this.warningCallbacks.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.warningCallbacks.indexOf(callback);
      if (index > -1) {
        this.warningCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Get current rate limit status
   */
  async getCurrentStatus(): Promise<RateLimitInfo | null> {
    try {
      const response = await apiClient.get('/v1/rate-limit/current');
      this.currentStatus = response.data;
      return this.currentStatus;
    } catch (error: any) {
      console.warn('Failed to get rate limit status:', error);
      
      // Check if response contains rate limit info
      if (error.response?.status === 429) {
        const rateLimitData = error.response.data;
        this.handleRateLimitExceeded(rateLimitData);
      }
      
      return null;
    }
  }

  /**
   * Check rate limit for specific endpoint
   */
  async checkEndpoint(
    endpoint: string,
    method: string = 'GET',
    userRole?: string
  ): Promise<RateLimitInfo | null> {
    try {
      const response = await apiClient.post('/v1/rate-limit/check', {
        identifier: 'current', // Server will determine actual identifier
        endpoint,
        method,
        user_role: userRole
      });
      
      return response.data;
    } catch (error: any) {
      console.warn('Failed to check endpoint rate limit:', error);
      return null;
    }
  }

  /**
   * Get all rate limiting rules
   */
  async getRules(): Promise<RateLimitRule[]> {
    try {
      const response = await apiClient.get('/v1/rate-limit/rules');
      return response.data;
    } catch (error: any) {
      console.warn('Failed to get rate limit rules:', error);
      return [];
    }
  }

  /**
   * Get system status
   */
  async getSystemStatus(): Promise<any> {
    try {
      const response = await apiClient.get('/v1/rate-limit/status');
      return response.data;
    } catch (error: any) {
      console.warn('Failed to get rate limit system status:', error);
      return null;
    }
  }

  /**
   * Handle rate limit headers from responses
   */
  handleResponseHeaders(headers: any): void {
    const limit = headers['x-ratelimit-limit'];
    const remaining = headers['x-ratelimit-remaining'];
    const reset = headers['x-ratelimit-reset'];
    const result = headers['x-ratelimit-result'];

    if (limit && remaining && reset) {
      const rateLimitInfo: Partial<RateLimitInfo> = {
        limit: parseInt(limit),
        remaining: parseInt(remaining),
        reset_time: parseInt(reset)
      };

      this.checkForWarnings(rateLimitInfo as RateLimitInfo);

      console.debug('Rate limit info from headers:', {
        limit: rateLimitInfo.limit,
        remaining: rateLimitInfo.remaining,
        reset_time: rateLimitInfo.reset_time,
        result
      });
    }
  }

  /**
   * Handle rate limit exceeded error
   */
  private handleRateLimitExceeded(errorData: any): void {
    const warning: RateLimitWarning = {
      type: 'rate_limited',
      message: errorData.message || 'Rate limit exceeded',
      remaining: 0,
      reset_time: errorData.reset_time || Date.now() + 60000,
      retry_after: errorData.retry_after
    };

    this.emitWarning(warning);
  }

  /**
   * Check current status periodically
   */
  private async checkCurrentStatus(): Promise<void> {
    const status = await this.getCurrentStatus();
    if (status) {
      this.checkForWarnings(status);
    }
  }

  /**
   * Check for rate limit warnings
   */
  private checkForWarnings(info: RateLimitInfo): void {
    if (info.is_blacklisted) {
      this.emitWarning({
        type: 'blacklisted',
        message: 'Your identifier has been blacklisted',
        remaining: 0,
        reset_time: info.reset_time
      });
      return;
    }

    if (info.remaining <= 0) {
      this.emitWarning({
        type: 'rate_limited',
        message: 'Rate limit exceeded',
        remaining: info.remaining,
        reset_time: info.reset_time
      });
      return;
    }

    // Warning when approaching limit (less than 20% remaining)
    const warningThreshold = Math.max(1, Math.floor(info.limit * 0.2));
    if (info.remaining <= warningThreshold) {
      this.emitWarning({
        type: 'approaching_limit',
        message: `Approaching rate limit: ${info.remaining} requests remaining`,
        remaining: info.remaining,
        reset_time: info.reset_time
      });
    }
  }

  /**
   * Emit warning to all subscribers
   */
  private emitWarning(warning: RateLimitWarning): void {
    console.warn('🚨 Rate limit warning:', warning);
    
    this.warningCallbacks.forEach(callback => {
      try {
        callback(warning);
      } catch (error) {
        console.error('Error in rate limit warning callback:', error);
      }
    });
  }

  /**
   * Format time remaining until reset
   */
  formatTimeUntilReset(resetTime: number): string {
    const now = Date.now() / 1000;
    const secondsRemaining = Math.max(0, resetTime - now);
    
    if (secondsRemaining < 60) {
      return `${Math.ceil(secondsRemaining)}s`;
    } else if (secondsRemaining < 3600) {
      return `${Math.ceil(secondsRemaining / 60)}m`;
    } else {
      return `${Math.ceil(secondsRemaining / 3600)}h`;
    }
  }

  /**
   * Get current status without API call
   */
  getCachedStatus(): RateLimitInfo | null {
    return this.currentStatus;
  }

  /**
   * Check if currently rate limited
   */
  isRateLimited(): boolean {
    return this.currentStatus?.remaining === 0 || false;
  }

  /**
   * Check if blacklisted
   */
  isBlacklisted(): boolean {
    return this.currentStatus?.is_blacklisted || false;
  }

  /**
   * Check if whitelisted
   */
  isWhitelisted(): boolean {
    return this.currentStatus?.is_whitelisted || false;
  }
}

// Export singleton instance
export const rateLimitMonitor = RateLimitMonitor.getInstance();

// Utility function to add rate limit monitoring to API client
export const setupRateLimitMonitoring = () => {
  // Add response interceptor to handle rate limit headers
  apiClient.interceptors.response.use(
    (response) => {
      rateLimitMonitor.handleResponseHeaders(response.headers);
      return response;
    },
    (error) => {
      // Handle rate limit exceeded responses
      if (error.response?.status === 429) {
        rateLimitMonitor.handleResponseHeaders(error.response.headers);
      }
      return Promise.reject(error);
    }
  );

  // Start monitoring
  rateLimitMonitor.startMonitoring();
  
  console.log('✅ Rate limit monitoring configured');
};

export default rateLimitMonitor;