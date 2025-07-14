/**
 * CSRF Protection Service
 * Implements comprehensive CSRF protection with token generation, validation,
 * and double-submit cookie pattern
 */

export interface CSRFConfig {
  tokenLength: number;
  cookieName: string;
  headerName: string;
  tokenLifetime: number; // in milliseconds
  secureCookies: boolean;
  sameSitePolicy: 'strict' | 'lax' | 'none';
}

export interface CSRFToken {
  token: string;
  timestamp: number;
  expires: number;
}

export class CSRFProtection {
  private static instance: CSRFProtection;
  private config: CSRFConfig;
  private currentToken: CSRFToken | null = null;

  private constructor(config?: Partial<CSRFConfig>) {
    this.config = {
      tokenLength: 32,
      cookieName: 'csrf_token',
      headerName: 'X-CSRF-Token',
      tokenLifetime: 60 * 60 * 1000, // 1 hour
      secureCookies: window.location.protocol === 'https:',
      sameSitePolicy: 'strict',
      ...config
    };

    // Initialize CSRF protection on instantiation
    this.initialize();
  }

  public static getInstance(config?: Partial<CSRFConfig>): CSRFProtection {
    if (!CSRFProtection.instance) {
      CSRFProtection.instance = new CSRFProtection(config);
    }
    return CSRFProtection.instance;
  }

  /**
   * Initialize CSRF protection
   */
  private initialize(): void {
    // Check if token exists and is valid
    const existingToken = this.getStoredToken();
    if (existingToken && this.isTokenValid(existingToken)) {
      this.currentToken = existingToken;
      console.log('🛡️ CSRF protection initialized with existing token');
    } else {
      // Generate new token
      this.generateNewToken();
      console.log('🛡️ CSRF protection initialized with new token');
    }

    // Set up automatic token refresh
    this.scheduleTokenRefresh();
  }

  /**
   * Generate a cryptographically secure random token
   */
  private generateSecureToken(): string {
    const array = new Uint8Array(this.config.tokenLength);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Generate a new CSRF token
   */
  public generateNewToken(): string {
    const now = Date.now();
    const token = this.generateSecureToken();
    
    this.currentToken = {
      token,
      timestamp: now,
      expires: now + this.config.tokenLifetime
    };

    // Store in session storage for persistence
    this.storeToken(this.currentToken);
    
    // Set cookie for double-submit pattern
    this.setCookie(token);

    console.log('🛡️ New CSRF token generated');
    return token;
  }

  /**
   * Get current CSRF token (generate if needed)
   */
  public getToken(): string {
    if (!this.currentToken || !this.isTokenValid(this.currentToken)) {
      return this.generateNewToken();
    }
    return this.currentToken.token;
  }

  /**
   * Validate CSRF token
   */
  public validateToken(providedToken: string): boolean {
    if (!providedToken) {
      console.warn('🚫 CSRF validation failed: No token provided');
      return false;
    }

    if (!this.currentToken) {
      console.warn('🚫 CSRF validation failed: No current token');
      return false;
    }

    // Check token match
    if (providedToken !== this.currentToken.token) {
      console.warn('🚫 CSRF validation failed: Token mismatch');
      return false;
    }

    // Check expiration
    if (!this.isTokenValid(this.currentToken)) {
      console.warn('🚫 CSRF validation failed: Token expired');
      return false;
    }

    // Validate against cookie (double-submit pattern)
    const cookieToken = this.getCookieToken();
    if (cookieToken !== providedToken) {
      console.warn('🚫 CSRF validation failed: Cookie token mismatch');
      return false;
    }

    console.log('✅ CSRF token validated successfully');
    return true;
  }

  /**
   * Check if token is valid and not expired
   */
  private isTokenValid(token: CSRFToken): boolean {
    return Date.now() < token.expires;
  }

  /**
   * Store token in session storage
   */
  private storeToken(token: CSRFToken): void {
    try {
      sessionStorage.setItem('csrf_token_data', JSON.stringify(token));
    } catch (error) {
      console.error('Failed to store CSRF token:', error);
    }
  }

  /**
   * Get stored token from session storage
   */
  private getStoredToken(): CSRFToken | null {
    try {
      const stored = sessionStorage.getItem('csrf_token_data');
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Failed to retrieve CSRF token:', error);
      return null;
    }
  }

  /**
   * Set CSRF token cookie for double-submit pattern
   */
  private setCookie(token: string): void {
    const expires = new Date(Date.now() + this.config.tokenLifetime);
    const cookieOptions = [
      `${this.config.cookieName}=${token}`,
      `expires=${expires.toUTCString()}`,
      'path=/',
      `SameSite=${this.config.sameSitePolicy}`
    ];

    if (this.config.secureCookies) {
      cookieOptions.push('Secure');
    }

    // HttpOnly is intentionally omitted for double-submit pattern
    document.cookie = cookieOptions.join('; ');
  }

  /**
   * Get CSRF token from cookie
   */
  private getCookieToken(): string | null {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === this.config.cookieName) {
        return value;
      }
    }
    return null;
  }

  /**
   * Clear CSRF token and cookie
   */
  public clearToken(): void {
    this.currentToken = null;
    sessionStorage.removeItem('csrf_token_data');
    
    // Clear cookie
    document.cookie = `${this.config.cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=${this.config.sameSitePolicy}${this.config.secureCookies ? '; Secure' : ''}`;
    
    console.log('🛡️ CSRF token cleared');
  }

  /**
   * Schedule automatic token refresh
   */
  private scheduleTokenRefresh(): void {
    // Refresh token when it's 75% expired
    const refreshTime = this.config.tokenLifetime * 0.75;
    
    setTimeout(() => {
      if (this.currentToken && this.isTokenValid(this.currentToken)) {
        console.log('🔄 Refreshing CSRF token');
        this.generateNewToken();
      }
      
      // Schedule next refresh
      this.scheduleTokenRefresh();
    }, refreshTime);
  }

  /**
   * Get headers for AJAX requests
   */
  public getHeaders(): Record<string, string> {
    return {
      [this.config.headerName]: this.getToken()
    };
  }

  /**
   * Add CSRF token to form data
   */
  public addToFormData(formData: FormData): void {
    formData.append('csrf_token', this.getToken());
  }

  /**
   * Add CSRF token to URL search params
   */
  public addToSearchParams(params: URLSearchParams): void {
    params.append('csrf_token', this.getToken());
  }

  /**
   * Create CSRF-protected fetch wrapper
   */
  public createProtectedFetch() {
    return async (url: string, options: RequestInit = {}) => {
      // Only add CSRF token for state-changing requests
      const method = options.method?.toUpperCase() || 'GET';
      const needsCSRF = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

      if (needsCSRF) {
        // Add CSRF header
        options.headers = {
          ...options.headers,
          ...this.getHeaders()
        };

        // If body is FormData, add CSRF token
        if (options.body instanceof FormData) {
          this.addToFormData(options.body);
        }
      }

      return fetch(url, options);
    };
  }

  /**
   * Get configuration
   */
  public getConfig(): CSRFConfig {
    return { ...this.config };
  }

  /**
   * Get token status for debugging
   */
  public getTokenStatus() {
    return {
      hasToken: !!this.currentToken,
      token: this.currentToken?.token.substring(0, 8) + '...',
      isValid: this.currentToken ? this.isTokenValid(this.currentToken) : false,
      expires: this.currentToken?.expires,
      timeToExpiry: this.currentToken ? Math.max(0, this.currentToken.expires - Date.now()) : 0,
      cookiePresent: !!this.getCookieToken(),
      cookieMatches: this.currentToken ? this.getCookieToken() === this.currentToken.token : false
    };
  }

  /**
   * Force token regeneration (for testing or security incidents)
   */
  public forceRegenerate(): string {
    console.log('🛡️ Forcing CSRF token regeneration');
    this.clearToken();
    return this.generateNewToken();
  }
}

// Singleton instance
export const csrfProtection = CSRFProtection.getInstance();

// Utility functions for easy integration
export const getCSRFToken = (): string => csrfProtection.getToken();
export const getCSRFHeaders = (): Record<string, string> => csrfProtection.getHeaders();
export const validateCSRFToken = (token: string): boolean => csrfProtection.validateToken(token);
export const protectedFetch = csrfProtection.createProtectedFetch();