/**
 * Security Headers Service
 * Adds comprehensive security headers to API requests
 */

import { v4 as uuidv4 } from 'uuid';

// Fallback UUID generator if uuid package fails
const fallbackUuid = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export interface SecurityHeadersConfig {
  enableUserContext?: boolean;
  enableClientVersion?: boolean;
  enableSecurityToken?: boolean;
  enableRequestId?: boolean;
  enableTimestamp?: boolean;
  enableFingerprint?: boolean;
  clientVersion?: string;
}

export interface SecurityHeaders {
  [key: string]: string;
}

export class SecurityHeadersService {
  private static instance: SecurityHeadersService;
  private config: SecurityHeadersConfig;
  private sessionToken: string | null = null;
  private deviceFingerprint: string | null = null;

  private constructor(config: SecurityHeadersConfig = {}) {
    this.config = {
      enableUserContext: true,
      enableClientVersion: true,
      enableSecurityToken: true,
      enableRequestId: true,
      enableTimestamp: true,
      enableFingerprint: true,
      clientVersion: import.meta.env.VITE_CLIENT_VERSION || '1.0.0',
      ...config
    };

    // Generate device fingerprint on initialization
    this.generateDeviceFingerprint();
  }

  static getInstance(config?: SecurityHeadersConfig): SecurityHeadersService {
    if (!SecurityHeadersService.instance) {
      SecurityHeadersService.instance = new SecurityHeadersService(config);
    }
    return SecurityHeadersService.instance;
  }

  /**
   * Generate security headers for API request
   */
  getSecurityHeaders(userId?: string): SecurityHeaders {
    const headers: SecurityHeaders = {};

    // User Context Header
    if (this.config.enableUserContext && userId) {
      headers['X-User-Context'] = userId;
    }

    // Client Version Header
    if (this.config.enableClientVersion) {
      headers['X-Client-Version'] = this.config.clientVersion!;
    }

    // Security Token Header (session-based)
    if (this.config.enableSecurityToken) {
      headers['X-Security-Token'] = this.generateSecurityToken();
    }

    // Request ID Header (for tracing)
    if (this.config.enableRequestId) {
      try {
        headers['X-Request-Id'] = uuidv4();
      } catch {
        headers['X-Request-Id'] = fallbackUuid();
      }
    }

    // Timestamp Header (for replay attack prevention)
    if (this.config.enableTimestamp) {
      headers['X-Request-Timestamp'] = new Date().toISOString();
    }

    // Device Fingerprint Header
    if (this.config.enableFingerprint && this.deviceFingerprint) {
      headers['X-Device-Fingerprint'] = this.deviceFingerprint;
    }

    // CSRF and AJAX headers
    headers['X-Requested-With'] = 'XMLHttpRequest';
    
    // Additional security headers
    headers['X-Frame-Options'] = 'DENY';
    headers['X-Content-Type-Options'] = 'nosniff';
    headers['X-XSS-Protection'] = '1; mode=block';

    return headers;
  }

  /**
   * Generate a security token for the current session
   */
  private generateSecurityToken(): string {
    if (!this.sessionToken) {
      // Generate a new session token
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2);
      const userAgent = navigator.userAgent;
      
      // Create a hash of session data
      const sessionData = `${timestamp}-${random}-${userAgent}`;
      this.sessionToken = this.hashString(sessionData);
    }

    // Generate request-specific token
    const requestTime = Date.now();
    const requestRandom = Math.random().toString(36).substring(2);
    const requestToken = `${this.sessionToken}-${requestTime}-${requestRandom}`;
    
    return this.hashString(requestToken);
  }

  /**
   * Generate device fingerprint
   */
  private async generateDeviceFingerprint(): Promise<void> {
    try {
      const fingerPrintData = {
        userAgent: navigator.userAgent,
        language: navigator.language,
        languages: navigator.languages,
        platform: navigator.platform,
        screenResolution: `${screen.width}x${screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        cookieEnabled: navigator.cookieEnabled,
        doNotTrack: navigator.doNotTrack,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: (navigator as any).deviceMemory,
        colorDepth: screen.colorDepth,
        pixelRatio: window.devicePixelRatio,
        touchSupport: 'ontouchstart' in window,
        webGL: this.getWebGLFingerprint()
      };

      // Generate fingerprint hash
      const fingerprintString = JSON.stringify(fingerPrintData);
      this.deviceFingerprint = await this.hashStringAsync(fingerprintString);
    } catch (error) {
      console.warn('Failed to generate device fingerprint:', error);
      // Fallback to simple fingerprint
      this.deviceFingerprint = this.hashString(`${navigator.userAgent}-${screen.width}x${screen.height}`);
    }
  }

  /**
   * Get WebGL fingerprint
   */
  private getWebGLFingerprint(): string {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      
      if (!gl) {
        return 'no-webgl';
      }

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        return `${vendor}-${renderer}`;
      }

      return 'webgl-supported';
    } catch {
      return 'webgl-error';
    }
  }

  /**
   * Simple hash function for strings
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Async hash function using Web Crypto API
   */
  private async hashStringAsync(str: string): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(str);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hashHex.substring(0, 16); // Use first 16 chars
    } catch {
      // Fallback to simple hash
      return this.hashString(str);
    }
  }

  /**
   * Reset session token (should be called on login/logout)
   */
  resetSessionToken(): void {
    this.sessionToken = null;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SecurityHeadersConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): SecurityHeadersConfig {
    return { ...this.config };
  }

  /**
   * Validate incoming security headers (for responses)
   */
  validateResponseHeaders(headers: any): {
    valid: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];

    // Check for security headers in response
    if (!headers['x-content-type-options']) {
      warnings.push('Missing X-Content-Type-Options header');
    }

    if (!headers['x-frame-options']) {
      warnings.push('Missing X-Frame-Options header');
    }

    if (!headers['strict-transport-security']) {
      warnings.push('Missing Strict-Transport-Security header');
    }

    // Check for information leakage
    if (headers['server']) {
      warnings.push('Server header exposes server information');
    }

    if (headers['x-powered-by']) {
      warnings.push('X-Powered-By header exposes technology stack');
    }

    return {
      valid: warnings.length === 0,
      warnings
    };
  }
}

// Export singleton instance
export const securityHeaders = SecurityHeadersService.getInstance();

export default SecurityHeadersService;