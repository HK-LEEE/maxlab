/**
 * Token Blacklist Service
 * Manages JWT token blacklisting with backend integration
 */

import { apiClient } from '../api/client';

export interface BlacklistTokenRequest {
  token?: string;
  reason?: string;
  user_id?: string;
}

export interface BlacklistTokenResponse {
  success: boolean;
  message: string;
  token_hash?: string;
  blacklisted_count?: number;
}

export interface TokenInfoResponse {
  is_blacklisted: boolean;
  blacklist_entry?: {
    user_id: string;
    reason: string;
    blacklisted_at: number;
    expires_at?: number;
  };
  token_info?: {
    sub: string;
    exp: number;
    iat: number;
    iss: string;
  };
}

export interface BlacklistStatsResponse {
  total_blacklisted_tokens: number;
  blacklist_by_reason: Record<string, number>;
  redis_connected: boolean;
  timestamp: number;
}

class TokenBlacklistService {
  private static instance: TokenBlacklistService;

  static getInstance(): TokenBlacklistService {
    if (!TokenBlacklistService.instance) {
      TokenBlacklistService.instance = new TokenBlacklistService();
    }
    return TokenBlacklistService.instance;
  }

  /**
   * Blacklist current user's token
   */
  async blacklistCurrentToken(reason: string = 'user_logout'): Promise<BlacklistTokenResponse> {
    try {
      const response = await apiClient.post<BlacklistTokenResponse>('/v1/token-blacklist/blacklist', {
        reason
      });
      
      console.log('🚫 Current token blacklisted:', reason);
      return response.data;
    } catch (error: any) {
      console.error('Failed to blacklist current token:', error);
      throw new Error(error.response?.data?.detail || 'Failed to blacklist token');
    }
  }

  /**
   * Blacklist a specific token
   */
  async blacklistToken(request: BlacklistTokenRequest): Promise<BlacklistTokenResponse> {
    try {
      const response = await apiClient.post<BlacklistTokenResponse>('/v1/token-blacklist/blacklist', request);
      
      console.log('🚫 Token blacklisted:', request.reason);
      return response.data;
    } catch (error: any) {
      console.error('Failed to blacklist token:', error);
      throw new Error(error.response?.data?.detail || 'Failed to blacklist token');
    }
  }

  /**
   * Check if current token is blacklisted
   */
  async checkCurrentToken(): Promise<TokenInfoResponse> {
    try {
      const response = await apiClient.get<TokenInfoResponse>('/v1/token-blacklist/check');
      return response.data;
    } catch (error: any) {
      console.error('Failed to check current token:', error);
      throw new Error(error.response?.data?.detail || 'Failed to check token');
    }
  }

  /**
   * Check if a specific token is blacklisted
   */
  async checkToken(token: string): Promise<TokenInfoResponse> {
    try {
      const response = await apiClient.get<TokenInfoResponse>('/v1/token-blacklist/check', {
        params: { token }
      });
      return response.data;
    } catch (error: any) {
      console.error('Failed to check token:', error);
      throw new Error(error.response?.data?.detail || 'Failed to check token');
    }
  }

  /**
   * Get blacklisted tokens for current user
   */
  async getCurrentUserBlacklistedTokens(): Promise<any[]> {
    try {
      // Get current user ID (this might need to be passed as parameter)
      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      const userId = currentUser.id;
      
      if (!userId) {
        throw new Error('No current user ID available');
      }

      const response = await apiClient.get(`/v1/token-blacklist/user/${userId}`);
      return response.data;
    } catch (error: any) {
      console.error('Failed to get user blacklisted tokens:', error);
      throw new Error(error.response?.data?.detail || 'Failed to get blacklisted tokens');
    }
  }

  /**
   * Get blacklisted tokens for a specific user (admin only)
   */
  async getUserBlacklistedTokens(userId: string): Promise<any[]> {
    try {
      const response = await apiClient.get(`/v1/token-blacklist/user/${userId}`);
      return response.data;
    } catch (error: any) {
      console.error('Failed to get user blacklisted tokens:', error);
      throw new Error(error.response?.data?.detail || 'Failed to get blacklisted tokens');
    }
  }

  /**
   * Blacklist all tokens for a user (admin only)
   */
  async blacklistUserTokens(userId: string, reason: string = 'admin_action'): Promise<BlacklistTokenResponse> {
    try {
      const response = await apiClient.post<BlacklistTokenResponse>(
        `/v1/token-blacklist/blacklist-user/${userId}`,
        null,
        { params: { reason } }
      );
      
      console.log(`🚫 All tokens blacklisted for user ${userId}:`, reason);
      return response.data;
    } catch (error: any) {
      console.error('Failed to blacklist user tokens:', error);
      throw new Error(error.response?.data?.detail || 'Failed to blacklist user tokens');
    }
  }

  /**
   * Unblock a token (admin only)
   */
  async unblockToken(token: string): Promise<BlacklistTokenResponse> {
    try {
      const response = await apiClient.delete<BlacklistTokenResponse>('/v1/token-blacklist/unblock', {
        params: { token }
      });
      
      console.log('✅ Token unblocked');
      return response.data;
    } catch (error: any) {
      console.error('Failed to unblock token:', error);
      throw new Error(error.response?.data?.detail || 'Failed to unblock token');
    }
  }

  /**
   * Get blacklist statistics (admin only)
   */
  async getBlacklistStats(): Promise<BlacklistStatsResponse> {
    try {
      const response = await apiClient.get<BlacklistStatsResponse>('/v1/token-blacklist/stats');
      return response.data;
    } catch (error: any) {
      console.error('Failed to get blacklist stats:', error);
      throw new Error(error.response?.data?.detail || 'Failed to get statistics');
    }
  }

  /**
   * Clean up expired blacklist entries (admin only)
   */
  async cleanupExpiredEntries(): Promise<{ message: string; cleaned_count: number }> {
    try {
      const response = await apiClient.post('/v1/token-blacklist/cleanup');
      
      console.log('🧹 Blacklist cleanup completed:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('Failed to cleanup blacklist:', error);
      throw new Error(error.response?.data?.detail || 'Failed to cleanup blacklist');
    }
  }

  /**
   * Enhanced logout with token blacklisting
   */
  async secureLogout(reason: string = 'user_logout'): Promise<void> {
    try {
      // First blacklist the current token
      await this.blacklistCurrentToken(reason);
      
      // Then perform normal logout cleanup
      localStorage.removeItem('accessToken');
      localStorage.removeItem('tokenType');
      localStorage.removeItem('expiresIn');
      localStorage.removeItem('tokenExpiryTime');
      localStorage.removeItem('tokenCreatedAt');
      localStorage.removeItem('user');
      localStorage.removeItem('scope');

      console.log('🔐 Secure logout completed');
    } catch (error) {
      console.error('Error during secure logout:', error);
      
      // Even if blacklisting fails, still clear local storage
      localStorage.removeItem('accessToken');
      localStorage.removeItem('tokenType');
      localStorage.removeItem('expiresIn');
      localStorage.removeItem('tokenExpiryTime');
      localStorage.removeItem('tokenCreatedAt');
      localStorage.removeItem('user');
      localStorage.removeItem('scope');
      
      throw error;
    }
  }

  /**
   * Check if current session is secure (token not blacklisted)
   */
  async validateCurrentSession(): Promise<boolean> {
    try {
      const tokenInfo = await this.checkCurrentToken();
      
      if (tokenInfo.is_blacklisted) {
        console.warn('🚨 Current token is blacklisted, clearing session');
        
        // Clear local storage immediately
        localStorage.clear();
        
        // Dispatch event to notify other components
        window.dispatchEvent(new CustomEvent('token:blacklisted', {
          detail: {
            reason: tokenInfo.blacklist_entry?.reason || 'unknown',
            blacklisted_at: tokenInfo.blacklist_entry?.blacklisted_at
          }
        }));
        
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Failed to validate current session:', error);
      // Return true to avoid blocking on validation errors
      return true;
    }
  }
}

// Export singleton instance
export const tokenBlacklistService = TokenBlacklistService.getInstance();

// Enhanced logout function for use throughout the app
export const performSecureLogout = async (reason: string = 'user_logout'): Promise<void> => {
  try {
    await tokenBlacklistService.secureLogout(reason);
    
    // Redirect to login
    window.location.href = '/login';
  } catch (error) {
    console.error('Error during secure logout:', error);
    
    // Still redirect even if logout fails
    window.location.href = '/login';
  }
};

export default tokenBlacklistService;