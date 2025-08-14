/**
 * Optimized Silent Auth Manager
 * Improves performance by reusing iframe and implementing smart caching
 */

import { SilentAuth } from '../utils/silentAuth';

interface SilentAuthCacheEntry {
  timestamp: number;
  result: {
    success: boolean;
    token?: string;
    tokenData?: any;
    error?: string;
  };
}

export class OptimizedSilentAuthManager {
  private static instance: OptimizedSilentAuthManager;
  private iframe: HTMLIFrameElement | null = null;
  private iframeReady = false;
  private iframeInitPromise: Promise<void> | null = null;
  private cache: SilentAuthCacheEntry | null = null;
  private readonly CACHE_DURATION = 30000; // 30 seconds
  private readonly IFRAME_TIMEOUT = 5000; // 5 seconds for iframe init
  
  private constructor() {
    this.preInitializeIframe();
  }
  
  public static getInstance(): OptimizedSilentAuthManager {
    if (!OptimizedSilentAuthManager.instance) {
      OptimizedSilentAuthManager.instance = new OptimizedSilentAuthManager();
    }
    return OptimizedSilentAuthManager.instance;
  }
  
  /**
   * Pre-initialize iframe for faster silent auth
   */
  private async preInitializeIframe(): Promise<void> {
    if (this.iframeInitPromise) {
      return this.iframeInitPromise;
    }
    
    this.iframeInitPromise = new Promise((resolve) => {
      console.log('🚀 Pre-initializing silent auth iframe');
      
      // Create hidden iframe
      this.iframe = document.createElement('iframe');
      this.iframe.style.display = 'none';
      this.iframe.style.position = 'absolute';
      this.iframe.style.top = '-1000px';
      this.iframe.style.left = '-1000px';
      this.iframe.style.width = '1px';
      this.iframe.style.height = '1px';
      this.iframe.setAttribute('aria-hidden', 'true');
      this.iframe.setAttribute('title', 'Silent authentication frame');
      
      // Set sandbox for security
      this.iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
      
      // Load a minimal page to warm up the iframe
      const warmupUrl = `${window.location.origin}/silent-auth-warmup.html`;
      this.iframe.src = 'about:blank'; // Start with blank
      
      // Add to DOM
      document.body.appendChild(this.iframe);
      
      // Mark as ready after a short delay
      setTimeout(() => {
        this.iframeReady = true;
        console.log('✅ Silent auth iframe ready');
        resolve();
      }, 100);
    });
    
    return this.iframeInitPromise;
  }
  
  /**
   * Attempt silent authentication with optimizations
   */
  public async attemptSilentAuth(
    options?: {
      skipCache?: boolean;
      maxAge?: number;
      abortSignal?: AbortSignal;
    }
  ): Promise<{
    success: boolean;
    token?: string;
    tokenData?: any;
    error?: string;
    fromCache?: boolean;
  }> {
    // Check cache first
    if (!options?.skipCache && this.cache) {
      const cacheAge = Date.now() - this.cache.timestamp;
      if (cacheAge < this.CACHE_DURATION) {
        console.log('📦 Using cached silent auth result');
        return {
          ...this.cache.result,
          fromCache: true
        };
      }
    }
    
    // Ensure iframe is ready
    if (!this.iframeReady) {
      await this.preInitializeIframe();
    }
    
    // Check abort signal
    if (options?.abortSignal?.aborted) {
      return {
        success: false,
        error: 'Request aborted'
      };
    }
    
    try {
      // Use the standard SilentAuth but with performance optimizations
      const silentAuth = new SilentAuth();
      const result = await this.performOptimizedSilentAuth(silentAuth, options);
      
      // Cache successful results
      if (result.success) {
        this.cache = {
          timestamp: Date.now(),
          result
        };
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ Optimized silent auth error:', error);
      return {
        success: false,
        error: error.message || 'Silent auth failed'
      };
    }
  }
  
  /**
   * Perform optimized silent authentication
   */
  private async performOptimizedSilentAuth(
    silentAuth: SilentAuth,
    options?: {
      maxAge?: number;
      abortSignal?: AbortSignal;
    }
  ): Promise<any> {
    // Add performance markers
    const startTime = performance.now();
    
    try {
      const result = await silentAuth.attemptSilentAuth(
        options?.maxAge,
        options?.abortSignal
      );
      
      const duration = performance.now() - startTime;
      console.log(`⏱️ Silent auth completed in ${duration.toFixed(2)}ms`);
      
      // Log performance metrics
      if (window.performance && window.performance.measure) {
        window.performance.measure('silent-auth-duration', {
          start: startTime,
          end: performance.now()
        });
      }
      
      return result;
    } finally {
      silentAuth.forceCleanup();
    }
  }
  
  /**
   * Warm up the silent auth connection
   */
  public async warmup(): Promise<void> {
    if (!this.iframeReady) {
      await this.preInitializeIframe();
    }
    
    // Pre-fetch the auth endpoint to warm up the connection
    const authUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000';
    try {
      // Use fetch with keepalive to establish connection
      await fetch(`${authUrl}/api/health`, {
        method: 'HEAD',
        keepalive: true,
        mode: 'no-cors'
      });
      console.log('🔥 Silent auth connection warmed up');
    } catch (error) {
      // Ignore errors, this is just a warmup
      console.debug('Warmup fetch failed (expected):', error);
    }
  }
  
  /**
   * Clear the cache
   */
  public clearCache(): void {
    this.cache = null;
    console.log('🧹 Silent auth cache cleared');
  }
  
  /**
   * Cleanup resources
   */
  public cleanup(): void {
    if (this.iframe && this.iframe.parentNode) {
      this.iframe.parentNode.removeChild(this.iframe);
    }
    this.iframe = null;
    this.iframeReady = false;
    this.iframeInitPromise = null;
    this.cache = null;
    console.log('🧹 Silent auth manager cleaned up');
  }
  
  /**
   * Get current status
   */
  public getStatus(): {
    iframeReady: boolean;
    cacheValid: boolean;
    cacheAge: number | null;
  } {
    return {
      iframeReady: this.iframeReady,
      cacheValid: this.cache !== null && (Date.now() - this.cache.timestamp) < this.CACHE_DURATION,
      cacheAge: this.cache ? Date.now() - this.cache.timestamp : null
    };
  }
}

// Export singleton instance
export const optimizedSilentAuthManager = OptimizedSilentAuthManager.getInstance();

// Auto-warmup on page load (after a delay)
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    setTimeout(() => {
      optimizedSilentAuthManager.warmup().catch(console.debug);
    }, 2000); // Warmup after 2 seconds
  });
}