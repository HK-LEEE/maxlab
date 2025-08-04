/**
 * User-Isolated Token Storage Service
 * Stores tokens with user-specific isolation to prevent cross-user token leakage
 */

import { secureTokenStorage } from './secureTokenStorage';

export interface UserToken {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: number;
  userId: string;
  timestamp: number;
}

export interface UserTokenStorageOptions {
  encryptTokens?: boolean;
  autoCleanupOtherUsers?: boolean;
  maxUsersToStore?: number;
}

export class UserIsolatedTokenStorage {
  private static instance: UserIsolatedTokenStorage;
  private currentUserId: string | null = null;
  private readonly storagePrefix = 'maxlab_user_auth_';
  private readonly userIndexKey = 'maxlab_auth_user_index';
  private options: UserTokenStorageOptions;

  private constructor(options: UserTokenStorageOptions = {}) {
    this.options = {
      encryptTokens: true,
      autoCleanupOtherUsers: true,
      maxUsersToStore: 5,
      ...options
    };
  }

  static getInstance(options?: UserTokenStorageOptions): UserIsolatedTokenStorage {
    if (!UserIsolatedTokenStorage.instance) {
      UserIsolatedTokenStorage.instance = new UserIsolatedTokenStorage(options);
    }
    return UserIsolatedTokenStorage.instance;
  }

  /**
   * Save tokens for a specific user with isolation
   */
  async saveTokens(tokens: {
    accessToken: string;
    refreshToken?: string;
    idToken?: string;
    expiresAt?: number;
  }, userId: string): Promise<boolean> {
    try {
      console.log(`🔐 Saving tokens for user: ${userId}`);

      // Clean up other users' tokens if enabled
      if (this.options.autoCleanupOtherUsers) {
        await this.clearOtherUserTokens(userId);
      }

      // Create user-specific token object
      const userToken: UserToken = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        idToken: tokens.idToken,
        expiresAt: tokens.expiresAt || Date.now() + 3600000, // 1 hour default
        userId: userId,
        timestamp: Date.now()
      };

      // Store with user-specific key
      const userKey = this.getUserStorageKey(userId);
      
      if (this.options.encryptTokens && tokens.refreshToken) {
        // Store refresh token securely
        await secureTokenStorage.storeRefreshToken(tokens.refreshToken);
      }

      // Store access token and metadata (less sensitive)
      const storageData = {
        ...userToken,
        refreshToken: undefined // Don't store refresh token in plain text
      };

      localStorage.setItem(userKey, JSON.stringify(storageData));

      // Update current user
      this.currentUserId = userId;

      // Update user index
      await this.updateUserIndex(userId);

      // Store current user ID for quick access
      sessionStorage.setItem('maxlab_current_user_id', userId);

      console.log(`✅ Tokens saved successfully for user: ${userId}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to save user tokens:', error);
      return false;
    }
  }

  /**
   * Get tokens for a specific user
   */
  async getTokens(userId?: string): Promise<UserToken | null> {
    try {
      const targetUserId = userId || this.currentUserId || sessionStorage.getItem('maxlab_current_user_id');
      
      if (!targetUserId) {
        console.warn('No user ID available for token retrieval');
        return null;
      }

      const userKey = this.getUserStorageKey(targetUserId);
      const storedData = localStorage.getItem(userKey);

      if (!storedData) {
        return null;
      }

      const userToken: UserToken = JSON.parse(storedData);

      // Check if tokens are expired
      if (userToken.expiresAt && Date.now() > userToken.expiresAt) {
        console.log('⏰ Tokens expired for user:', targetUserId);
        await this.clearUserTokens(targetUserId);
        return null;
      }

      // Retrieve refresh token if encrypted storage is enabled
      if (this.options.encryptTokens) {
        const refreshTokenResult = await secureTokenStorage.getRefreshToken();
        if (refreshTokenResult.token) {
          userToken.refreshToken = refreshTokenResult.token;
        }
      }

      return userToken;
    } catch (error) {
      console.error('❌ Failed to get user tokens:', error);
      return null;
    }
  }

  /**
   * Clear tokens for a specific user
   */
  async clearUserTokens(userId: string): Promise<boolean> {
    try {
      console.log(`🧹 Clearing tokens for user: ${userId}`);

      const userKey = this.getUserStorageKey(userId);
      localStorage.removeItem(userKey);

      // Clear refresh token if this is the current user
      if (userId === this.currentUserId || userId === sessionStorage.getItem('maxlab_current_user_id')) {
        await secureTokenStorage.clearRefreshToken();
        sessionStorage.removeItem('maxlab_current_user_id');
      }

      // Remove from user index
      await this.removeFromUserIndex(userId);

      if (userId === this.currentUserId) {
        this.currentUserId = null;
      }

      console.log(`✅ Tokens cleared for user: ${userId}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to clear user tokens:', error);
      return false;
    }
  }

  /**
   * Clear tokens for all users except the specified one
   */
  async clearOtherUserTokens(currentUserId: string): Promise<number> {
    try {
      console.log(`🧹 Clearing tokens for all users except: ${currentUserId}`);

      const userIndex = this.getUserIndex();
      let clearedCount = 0;

      for (const userId of userIndex) {
        if (userId !== currentUserId) {
          if (await this.clearUserTokens(userId)) {
            clearedCount++;
          }
        }
      }

      console.log(`✅ Cleared tokens for ${clearedCount} other users`);
      return clearedCount;
    } catch (error) {
      console.error('❌ Failed to clear other user tokens:', error);
      return 0;
    }
  }

  /**
   * Clear all user tokens
   */
  async clearAllTokens(): Promise<number> {
    try {
      console.log('🧹 Clearing all user tokens...');

      const userIndex = this.getUserIndex();
      let clearedCount = 0;

      for (const userId of userIndex) {
        if (await this.clearUserTokens(userId)) {
          clearedCount++;
        }
      }

      // Clear any remaining auth data
      await secureTokenStorage.clearRefreshToken();
      sessionStorage.removeItem('maxlab_current_user_id');
      localStorage.removeItem(this.userIndexKey);
      this.currentUserId = null;

      console.log(`✅ Cleared tokens for ${clearedCount} users`);
      return clearedCount;
    } catch (error) {
      console.error('❌ Failed to clear all tokens:', error);
      return 0;
    }
  }

  /**
   * Get current user ID
   */
  getCurrentUserId(): string | null {
    return this.currentUserId || sessionStorage.getItem('maxlab_current_user_id');
  }

  /**
   * Set current user ID
   */
  setCurrentUserId(userId: string): void {
    this.currentUserId = userId;
    sessionStorage.setItem('maxlab_current_user_id', userId);
  }

  /**
   * Check if tokens exist for any user
   */
  hasAnyTokens(): boolean {
    const userIndex = this.getUserIndex();
    return userIndex.length > 0;
  }

  /**
   * Get list of users with stored tokens
   */
  getStoredUsers(): string[] {
    return this.getUserIndex();
  }

  /**
   * Perform security audit of stored tokens
   */
  async performSecurityAudit(): Promise<{
    totalUsers: number;
    expiredTokens: string[];
    currentUser: string | null;
    oldestToken: { userId: string; age: number } | null;
    recommendations: string[];
  }> {
    const userIndex = this.getUserIndex();
    const expiredTokens: string[] = [];
    let oldestToken: { userId: string; age: number } | null = null;
    const recommendations: string[] = [];

    for (const userId of userIndex) {
      const userKey = this.getUserStorageKey(userId);
      const storedData = localStorage.getItem(userKey);

      if (storedData) {
        try {
          const userToken: UserToken = JSON.parse(storedData);
          
          // Check for expired tokens
          if (userToken.expiresAt && Date.now() > userToken.expiresAt) {
            expiredTokens.push(userId);
            recommendations.push(`Remove expired tokens for user: ${userId}`);
          }

          // Track oldest token
          const age = Date.now() - userToken.timestamp;
          if (!oldestToken || age > oldestToken.age) {
            oldestToken = { userId, age };
          }
        } catch (error) {
          recommendations.push(`Remove corrupted token data for user: ${userId}`);
        }
      }
    }

    // Check if too many users stored
    if (userIndex.length > this.options.maxUsersToStore!) {
      recommendations.push(`Consider removing old user tokens. Current: ${userIndex.length}, Max: ${this.options.maxUsersToStore}`);
    }

    // Check for old tokens
    if (oldestToken && oldestToken.age > 7 * 24 * 60 * 60 * 1000) { // 7 days
      recommendations.push(`Consider removing old tokens for user: ${oldestToken.userId} (${Math.floor(oldestToken.age / (24 * 60 * 60 * 1000))} days old)`);
    }

    return {
      totalUsers: userIndex.length,
      expiredTokens,
      currentUser: this.getCurrentUserId(),
      oldestToken,
      recommendations
    };
  }

  /**
   * Get user-specific storage key
   */
  private getUserStorageKey(userId: string): string {
    // Sanitize userId to prevent storage key injection
    const sanitizedUserId = userId.replace(/[^a-zA-Z0-9-_]/g, '_');
    return `${this.storagePrefix}${sanitizedUserId}`;
  }

  /**
   * Get user index from storage
   */
  private getUserIndex(): string[] {
    try {
      const indexData = localStorage.getItem(this.userIndexKey);
      return indexData ? JSON.parse(indexData) : [];
    } catch {
      return [];
    }
  }

  /**
   * Update user index
   */
  private async updateUserIndex(userId: string): Promise<void> {
    try {
      let userIndex = this.getUserIndex();
      
      // Add user if not in index
      if (!userIndex.includes(userId)) {
        userIndex.push(userId);
        
        // Enforce max users limit
        if (userIndex.length > this.options.maxUsersToStore!) {
          // Remove oldest users
          const usersToRemove = userIndex.slice(0, userIndex.length - this.options.maxUsersToStore!);
          for (const oldUserId of usersToRemove) {
            await this.clearUserTokens(oldUserId);
          }
          userIndex = userIndex.slice(-this.options.maxUsersToStore!);
        }
        
        localStorage.setItem(this.userIndexKey, JSON.stringify(userIndex));
      }
    } catch (error) {
      console.error('Failed to update user index:', error);
    }
  }

  /**
   * Remove user from index
   */
  private async removeFromUserIndex(userId: string): Promise<void> {
    try {
      let userIndex = this.getUserIndex();
      userIndex = userIndex.filter(id => id !== userId);
      localStorage.setItem(this.userIndexKey, JSON.stringify(userIndex));
    } catch (error) {
      console.error('Failed to remove from user index:', error);
    }
  }
}

// Export singleton instance
export const userIsolatedTokenStorage = UserIsolatedTokenStorage.getInstance();

export default UserIsolatedTokenStorage;