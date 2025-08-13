/**
 * OAuth Request Coordinator
 * Manages sequential processing of OAuth requests to prevent race conditions
 * Specifically designed to fix OAuth redirect loop issues
 */

interface OAuthRequestInfo {
  id: string;
  type: 'sync' | 'authorize' | 'token_refresh' | 'silent_login' | 'logout';
  url: string;
  timestamp: number;
  promise: Promise<any>;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  abortController?: AbortController;
}

interface QueueStats {
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
  totalRequests: number;
}

class OAuthRequestCoordinator {
  private static instance: OAuthRequestCoordinator;
  private requestQueue: OAuthRequestInfo[] = [];
  private activeRequests: Map<string, OAuthRequestInfo> = new Map();
  private isProcessing = false;
  private maxConcurrent = 1; // 🔧 CRITICAL: Only 1 concurrent OAuth request to prevent race conditions
  private requestTimeout = 15000; // 15 seconds
  private debugEnabled = true;

  static getInstance(): OAuthRequestCoordinator {
    if (!OAuthRequestCoordinator.instance) {
      OAuthRequestCoordinator.instance = new OAuthRequestCoordinator();
    }
    return OAuthRequestCoordinator.instance;
  }

  private constructor() {
    this.log('🏗️ OAuth Request Coordinator initialized');
    
    // Clean up expired requests every minute
    setInterval(() => this.cleanupExpiredRequests(), 60000);
  }

  /**
   * Queue OAuth request for sequential processing
   */
  async queueRequest<T>(
    type: OAuthRequestInfo['type'], 
    url: string, 
    requestFn: (abortSignal?: AbortSignal) => Promise<T>,
    priority = 0
  ): Promise<T> {
    const requestId = this.generateRequestId(type);
    const abortController = new AbortController();
    
    this.log(`📝 Queuing ${type} request: ${requestId}`, { url, priority });

    // Create request info
    const requestInfo: OAuthRequestInfo = {
      id: requestId,
      type,
      url: url.replace(/token=[^&]+/g, 'token=***'), // Sanitize logs
      timestamp: Date.now(),
      promise: this.createManagedPromise(requestFn, abortController.signal),
      status: 'pending',
      abortController
    };

    // Add to queue with priority handling
    if (priority > 0) {
      // High priority requests go to the front
      this.requestQueue.unshift(requestInfo);
    } else {
      this.requestQueue.push(requestInfo);
    }

    // Start processing if not already running
    this.processQueue();

    try {
      const result = await requestInfo.promise;
      requestInfo.status = 'completed';
      this.log(`✅ ${type} request completed: ${requestId}`);
      return result;
    } catch (error: any) {
      requestInfo.status = 'failed';
      this.log(`❌ ${type} request failed: ${requestId}`, { error: error.message });
      throw error;
    } finally {
      this.activeRequests.delete(requestId);
      this.cleanupRequest(requestInfo);
    }
  }

  /**
   * Process the request queue sequentially
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    this.log('🔄 Starting OAuth request queue processing');

    try {
      while (this.requestQueue.length > 0 && this.activeRequests.size < this.maxConcurrent) {
        const requestInfo = this.requestQueue.shift();
        if (!requestInfo) continue;

        // Check if request is still valid (not timed out)
        const age = Date.now() - requestInfo.timestamp;
        if (age > this.requestTimeout) {
          this.log(`⏰ Request ${requestInfo.id} expired (age: ${age}ms), skipping`);
          requestInfo.status = 'failed';
          requestInfo.abortController?.abort();
          continue;
        }

        // Start processing the request
        this.activeRequests.set(requestInfo.id, requestInfo);
        requestInfo.status = 'in_progress';
        
        this.log(`🚀 Processing ${requestInfo.type} request: ${requestInfo.id}`);
        
        // Wait a bit before processing next request to ensure proper sequencing
        if (this.activeRequests.size >= this.maxConcurrent) {
          // Wait for at least one request to complete before starting another
          await this.waitForSlot();
        }
      }
    } finally {
      this.isProcessing = false;
      
      // Continue processing if there are more requests
      if (this.requestQueue.length > 0) {
        setTimeout(() => this.processQueue(), 100);
      }
    }
  }

  /**
   * Wait for a processing slot to become available
   */
  private async waitForSlot(): Promise<void> {
    const maxWaitTime = 30000; // 30 seconds max wait
    const checkInterval = 100; // Check every 100ms
    const startTime = Date.now();

    return new Promise((resolve) => {
      const checkSlot = () => {
        const elapsed = Date.now() - startTime;
        
        if (this.activeRequests.size < this.maxConcurrent) {
          resolve();
        } else if (elapsed > maxWaitTime) {
          this.log(`⚠️ Wait for slot timeout after ${elapsed}ms, proceeding anyway`);
          resolve();
        } else {
          setTimeout(checkSlot, checkInterval);
        }
      };
      
      checkSlot();
    });
  }

  /**
   * Create a managed promise with timeout and abort handling
   */
  private createManagedPromise<T>(
    requestFn: (abortSignal?: AbortSignal) => Promise<T>,
    abortSignal: AbortSignal
  ): Promise<T> {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.log('⏰ Request timeout, aborting...');
        abortSignal.dispatchEvent(new Event('abort'));
        reject(new Error('OAuth request timeout'));
      }, this.requestTimeout);

      try {
        const result = await requestFn(abortSignal);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Check if there are any OAuth sync requests in progress
   */
  hasActiveOAuthSync(): boolean {
    return Array.from(this.activeRequests.values()).some(
      req => req.type === 'sync' && req.status === 'in_progress'
    );
  }

  /**
   * Check if there are any silent authentication requests in progress
   */
  hasActiveSilentAuth(): boolean {
    return Array.from(this.activeRequests.values()).some(
      req => req.type === 'silent_login' && req.status === 'in_progress'
    );
  }

  /**
   * Check if any authentication operation is in progress (silent auth, token refresh, etc.)
   */
  hasActiveAuthOperation(): boolean {
    return Array.from(this.activeRequests.values()).some(
      req => (req.type === 'silent_login' || req.type === 'token_refresh' || req.type === 'sync') 
        && req.status === 'in_progress'
    );
  }

  /**
   * Wait for all OAuth sync requests to complete
   */
  async waitForOAuthSync(maxWaitMs = 10000): Promise<void> {
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const checkSync = () => {
        const elapsed = Date.now() - startTime;
        const hasActiveSync = this.hasActiveOAuthSync();
        
        if (!hasActiveSync) {
          this.log(`✅ No active OAuth sync requests, proceeding`);
          resolve();
        } else if (elapsed > maxWaitMs) {
          this.log(`⚠️ OAuth sync wait timeout after ${elapsed}ms, proceeding anyway`);
          resolve();
        } else {
          this.log(`⏳ Waiting for OAuth sync to complete... (${elapsed}ms elapsed)`);
          setTimeout(checkSync, 200);
        }
      };
      
      checkSync();
    });
  }

  /**
   * Wait for all authentication operations to complete before allowing logout
   */
  async waitForAuthOperations(maxWaitMs = 10000): Promise<void> {
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const checkAuth = () => {
        const elapsed = Date.now() - startTime;
        const hasActiveAuth = this.hasActiveAuthOperation();
        
        if (!hasActiveAuth) {
          this.log(`✅ No active authentication operations, proceeding with logout`);
          resolve();
        } else if (elapsed > maxWaitMs) {
          this.log(`⚠️ Auth operation wait timeout after ${elapsed}ms, proceeding anyway`);
          resolve();
        } else {
          this.log(`⏳ Waiting for authentication operations to complete before logout... (${elapsed}ms elapsed)`);
          setTimeout(checkAuth, 200);
        }
      };
      
      checkAuth();
    });
  }

  /**
   * Cancel all pending requests of a specific type
   */
  cancelRequestsByType(type: OAuthRequestInfo['type']): number {
    let cancelledCount = 0;

    // Cancel pending requests in queue
    this.requestQueue = this.requestQueue.filter(req => {
      if (req.type === type) {
        this.log(`🚫 Cancelling pending ${type} request: ${req.id}`);
        req.abortController?.abort();
        req.status = 'failed';
        cancelledCount++;
        return false;
      }
      return true;
    });

    // Cancel active requests
    for (const [id, req] of this.activeRequests.entries()) {
      if (req.type === type) {
        this.log(`🚫 Cancelling active ${type} request: ${id}`);
        req.abortController?.abort();
        req.status = 'failed';
        this.activeRequests.delete(id);
        cancelledCount++;
      }
    }

    this.log(`📊 Cancelled ${cancelledCount} ${type} requests`);
    return cancelledCount;
  }

  /**
   * Get current queue statistics
   */
  getQueueStats(): QueueStats {
    const activeStats = Array.from(this.activeRequests.values());
    const queueStats = this.requestQueue;
    
    return {
      pending: queueStats.filter(r => r.status === 'pending').length,
      inProgress: activeStats.filter(r => r.status === 'in_progress').length,
      completed: 0, // Active requests that completed are removed
      failed: 0, // Active requests that failed are removed
      totalRequests: this.requestQueue.length + this.activeRequests.size
    };
  }

  /**
   * Clear all requests (emergency reset)
   */
  clearAllRequests(): void {
    this.log('🚨 Emergency: Clearing all OAuth requests');

    // Abort all active requests
    for (const [id, req] of this.activeRequests.entries()) {
      req.abortController?.abort();
      req.status = 'failed';
    }
    this.activeRequests.clear();

    // Clear queue
    this.requestQueue.forEach(req => {
      req.abortController?.abort();
      req.status = 'failed';
    });
    this.requestQueue = [];

    this.isProcessing = false;
    this.log('✅ All OAuth requests cleared');
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(type: string): string {
    return `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up expired requests
   */
  private cleanupExpiredRequests(): void {
    const now = Date.now();
    const expiredThreshold = this.requestTimeout * 2; // 2x timeout for cleanup

    // Clean up queue
    const originalQueueSize = this.requestQueue.length;
    this.requestQueue = this.requestQueue.filter(req => {
      const age = now - req.timestamp;
      if (age > expiredThreshold) {
        this.log(`🧹 Cleaning up expired queued request: ${req.id} (age: ${age}ms)`);
        req.abortController?.abort();
        return false;
      }
      return true;
    });

    // Clean up active requests
    const expiredActive: string[] = [];
    for (const [id, req] of this.activeRequests.entries()) {
      const age = now - req.timestamp;
      if (age > expiredThreshold) {
        this.log(`🧹 Cleaning up expired active request: ${id} (age: ${age}ms)`);
        req.abortController?.abort();
        expiredActive.push(id);
      }
    }

    expiredActive.forEach(id => this.activeRequests.delete(id));

    const cleanedCount = (originalQueueSize - this.requestQueue.length) + expiredActive.length;
    if (cleanedCount > 0) {
      this.log(`🧹 Cleaned up ${cleanedCount} expired OAuth requests`);
    }
  }

  /**
   * Clean up individual request
   */
  private cleanupRequest(requestInfo: OAuthRequestInfo): void {
    if (requestInfo.abortController) {
      requestInfo.abortController.abort();
    }
  }

  /**
   * Debug logging
   */
  private log(message: string, details?: any): void {
    if (this.debugEnabled) {
      const timestamp = new Date().toISOString().substr(11, 8);
      const stats = this.getQueueStats();
      const context = `[${timestamp}][Q:${stats.totalRequests}|A:${stats.inProgress}]`;
      
      if (details) {
        console.log(`🔀 OAuth Coordinator ${context}: ${message}`, details);
      } else {
        console.log(`🔀 OAuth Coordinator ${context}: ${message}`);
      }
    }
  }

  /**
   * Enable/disable debug logging
   */
  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
    this.log(`Debug logging ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get debug information
   */
  getDebugInfo(): any {
    return {
      queueStats: this.getQueueStats(),
      activeRequests: Array.from(this.activeRequests.values()).map(req => ({
        id: req.id,
        type: req.type,
        status: req.status,
        age: Date.now() - req.timestamp
      })),
      queuedRequests: this.requestQueue.map(req => ({
        id: req.id,
        type: req.type,
        status: req.status,
        age: Date.now() - req.timestamp
      })),
      configuration: {
        maxConcurrent: this.maxConcurrent,
        requestTimeout: this.requestTimeout,
        isProcessing: this.isProcessing
      }
    };
  }
}

// Export singleton instance
export const oauthRequestCoordinator = OAuthRequestCoordinator.getInstance();
export default oauthRequestCoordinator;