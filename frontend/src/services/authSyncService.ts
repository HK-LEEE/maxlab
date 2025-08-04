/**
 * Auth Synchronization Service
 * Handles multi-tab authentication state synchronization
 */

export type AuthEvent = 
  | { type: 'LOGIN'; user: any; token: string }
  | { type: 'LOGOUT'; reason?: string }
  | { type: 'TOKEN_REFRESH'; token: string }
  | { type: 'SESSION_EXPIRED' }
  | { type: 'AUTH_ERROR'; error: string };

interface AuthSyncOptions {
  onLogin?: (user: any, token: string) => void;
  onLogout?: (reason?: string) => void;
  onTokenRefresh?: (token: string) => void;
  onSessionExpired?: () => void;
  onAuthError?: (error: string) => void;
}

class AuthSyncService {
  private channel: BroadcastChannel | null = null;
  private storageEventListener: ((event: StorageEvent) => void) | null = null;
  private options: AuthSyncOptions = {};
  private isInitialized = false;

  /**
   * Initialize the auth sync service
   */
  initialize(options: AuthSyncOptions = {}): void {
    if (this.isInitialized) {
      console.log('🔄 Auth sync already initialized');
      return;
    }

    this.options = options;
    
    // Try to use BroadcastChannel API
    if ('BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('auth_sync');
        this.channel.onmessage = this.handleMessage.bind(this);
        console.log('✅ Auth sync initialized with BroadcastChannel');
      } catch (error) {
        console.warn('⚠️ BroadcastChannel failed, falling back to localStorage:', error);
        this.initializeStorageFallback();
      }
    } else {
      // Fallback to localStorage events
      this.initializeStorageFallback();
    }
    
    this.isInitialized = true;
  }

  /**
   * Initialize localStorage-based fallback
   */
  private initializeStorageFallback(): void {
    this.storageEventListener = (event: StorageEvent) => {
      if (event.key === 'auth_sync_event' && event.newValue) {
        try {
          const authEvent = JSON.parse(event.newValue);
          this.handleEvent(authEvent);
        } catch (error) {
          console.error('Failed to parse auth sync event:', error);
        }
      }
    };
    
    window.addEventListener('storage', this.storageEventListener);
    console.log('✅ Auth sync initialized with localStorage fallback');
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(event: MessageEvent): void {
    if (event.data && typeof event.data === 'object') {
      this.handleEvent(event.data as AuthEvent);
    }
  }

  /**
   * Handle auth events
   */
  private handleEvent(event: AuthEvent): void {
    console.log('📨 Received auth sync event:', event.type);
    
    switch (event.type) {
      case 'LOGIN':
        this.options.onLogin?.(event.user, event.token);
        break;
      
      case 'LOGOUT':
        this.options.onLogout?.(event.reason);
        break;
      
      case 'TOKEN_REFRESH':
        this.options.onTokenRefresh?.(event.token);
        break;
      
      case 'SESSION_EXPIRED':
        this.options.onSessionExpired?.();
        break;
      
      case 'AUTH_ERROR':
        this.options.onAuthError?.(event.error);
        break;
    }
  }

  /**
   * Broadcast an auth event to other tabs
   */
  broadcast(event: AuthEvent): void {
    if (!this.isInitialized) {
      console.warn('⚠️ Auth sync not initialized');
      return;
    }
    
    console.log('📤 Broadcasting auth event:', event.type);
    
    // Try BroadcastChannel first
    if (this.channel) {
      try {
        this.channel.postMessage(event);
      } catch (error) {
        console.error('BroadcastChannel error:', error);
        this.broadcastViaStorage(event);
      }
    } else {
      // Use localStorage fallback
      this.broadcastViaStorage(event);
    }
  }

  /**
   * Broadcast via localStorage
   */
  private broadcastViaStorage(event: AuthEvent): void {
    try {
      // Add timestamp to ensure storage event fires even for same value
      const eventWithTimestamp = {
        ...event,
        timestamp: Date.now()
      };
      
      localStorage.setItem('auth_sync_event', JSON.stringify(eventWithTimestamp));
      
      // Clean up after a short delay
      setTimeout(() => {
        localStorage.removeItem('auth_sync_event');
      }, 100);
    } catch (error) {
      console.error('localStorage broadcast error:', error);
    }
  }

  /**
   * Broadcast login event
   */
  broadcastLogin(user: any, token: string): void {
    this.broadcast({
      type: 'LOGIN',
      user,
      token
    });
  }

  /**
   * Broadcast logout event
   */
  broadcastLogout(reason?: string): void {
    this.broadcast({
      type: 'LOGOUT',
      reason
    });
  }

  /**
   * Broadcast token refresh event
   */
  broadcastTokenRefresh(token: string): void {
    this.broadcast({
      type: 'TOKEN_REFRESH',
      token
    });
  }

  /**
   * Broadcast session expired event
   */
  broadcastSessionExpired(): void {
    this.broadcast({
      type: 'SESSION_EXPIRED'
    });
  }

  /**
   * Broadcast auth error event
   */
  broadcastAuthError(error: string): void {
    this.broadcast({
      type: 'AUTH_ERROR',
      error
    });
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    
    if (this.storageEventListener) {
      window.removeEventListener('storage', this.storageEventListener);
      this.storageEventListener = null;
    }
    
    this.isInitialized = false;
    console.log('🧹 Auth sync service destroyed');
  }
}

// Export singleton instance
export const authSyncService = new AuthSyncService();