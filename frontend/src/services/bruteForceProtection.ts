/**
 * Brute Force Protection Service
 * Implements comprehensive protection against brute force attacks
 */

import { securityEventLogger } from './securityEventLogger';

export interface FailedAttempt {
  email: string;
  ip: string;
  timestamp: number;
  userAgent: string;
}

export interface AccountLockout {
  email: string;
  lockedAt: number;
  unlockAt: number;
  attemptCount: number;
  reason: string;
}

export interface BruteForceConfig {
  maxAttempts: number;
  lockoutDuration: number; // milliseconds
  progressiveDelayBase: number; // milliseconds
  maxProgressiveDelay: number; // milliseconds
  ipRateLimitWindow: number; // milliseconds
  ipMaxAttempts: number;
  suspiciousThreshold: number; // attempts before requiring CAPTCHA
}

export class BruteForceProtection {
  private readonly config: BruteForceConfig;
  private readonly storagePrefix = 'bruteforce_';
  
  constructor(config?: Partial<BruteForceConfig>) {
    this.config = {
      maxAttempts: 5,
      lockoutDuration: 30 * 60 * 1000, // 30 minutes
      progressiveDelayBase: 1000, // 1 second
      maxProgressiveDelay: 60 * 1000, // 60 seconds
      ipRateLimitWindow: 15 * 60 * 1000, // 15 minutes
      ipMaxAttempts: 20,
      suspiciousThreshold: 3,
      ...config
    };
  }

  /**
   * Record a failed login attempt
   */
  recordFailedAttempt(email: string, ip: string, userAgent: string = ''): void {
    const now = Date.now();
    const attempt: FailedAttempt = {
      email: email.toLowerCase(),
      ip,
      timestamp: now,
      userAgent
    };

    // Store individual attempt
    this.storeFailedAttempt(attempt);

    // Update account attempt count
    const accountAttempts = this.getAccountAttempts(email);
    const newCount = accountAttempts + 1;
    
    localStorage.setItem(
      `${this.storagePrefix}account_${email.toLowerCase()}`,
      JSON.stringify({
        count: newCount,
        lastAttempt: now,
        attempts: this.getRecentAttempts(email)
      })
    );

    // Check if account should be locked
    if (newCount >= this.config.maxAttempts) {
      this.lockAccount(email, 'max_attempts_exceeded');
    }

    // Log security event
    securityEventLogger.logEvent({
      type: 'failed_login_attempt',
      severity: newCount >= this.config.suspiciousThreshold ? 'high' : 'medium',
      details: {
        email,
        ip,
        attemptCount: newCount,
        userAgent,
        timestamp: now
      },
      userId: email
    });

    console.log(`🚨 Failed login attempt recorded for ${email} (${newCount}/${this.config.maxAttempts})`);
  }

  /**
   * Clear failed attempts for successful login
   */
  clearFailedAttempts(email: string): void {
    const emailKey = email.toLowerCase();
    
    // Remove account attempts
    localStorage.removeItem(`${this.storagePrefix}account_${emailKey}`);
    
    // Remove lockout if exists
    localStorage.removeItem(`${this.storagePrefix}lockout_${emailKey}`);
    
    // Remove recent attempts
    const attempts = this.getAllStoredAttempts();
    const filteredAttempts = attempts.filter(attempt => 
      attempt.email !== emailKey
    );
    
    localStorage.setItem(
      `${this.storagePrefix}attempts`,
      JSON.stringify(filteredAttempts)
    );

    console.log(`✅ Cleared failed attempts for ${email}`);
  }

  /**
   * Check if account is locked
   */
  isAccountLocked(email: string): boolean {
    const lockout = this.getAccountLockout(email);
    if (!lockout) return false;

    const now = Date.now();
    if (now >= lockout.unlockAt) {
      // Lockout expired, remove it
      this.clearAccountLockout(email);
      return false;
    }

    return true;
  }

  /**
   * Get account lockout information
   */
  getAccountLockout(email: string): AccountLockout | null {
    const lockoutData = localStorage.getItem(
      `${this.storagePrefix}lockout_${email.toLowerCase()}`
    );
    
    if (!lockoutData) return null;
    
    try {
      return JSON.parse(lockoutData);
    } catch {
      return null;
    }
  }

  /**
   * Lock an account
   */
  private lockAccount(email: string, reason: string): void {
    const now = Date.now();
    const lockout: AccountLockout = {
      email: email.toLowerCase(),
      lockedAt: now,
      unlockAt: now + this.config.lockoutDuration,
      attemptCount: this.getAccountAttempts(email),
      reason
    };

    localStorage.setItem(
      `${this.storagePrefix}lockout_${email.toLowerCase()}`,
      JSON.stringify(lockout)
    );

    // Log security event
    securityEventLogger.logEvent({
      type: 'account_locked',
      severity: 'high',
      details: {
        email,
        reason,
        duration: this.config.lockoutDuration,
        unlockAt: lockout.unlockAt,
        attemptCount: lockout.attemptCount
      },
      userId: email
    });

    console.log(`🔒 Account locked: ${email} (reason: ${reason})`);
  }

  /**
   * Clear account lockout
   */
  private clearAccountLockout(email: string): void {
    localStorage.removeItem(`${this.storagePrefix}lockout_${email.toLowerCase()}`);
    console.log(`🔓 Account lockout cleared: ${email}`);
  }

  /**
   * Get current attempt count for account
   */
  getAccountAttempts(email: string): number {
    const data = localStorage.getItem(
      `${this.storagePrefix}account_${email.toLowerCase()}`
    );
    
    if (!data) return 0;
    
    try {
      const parsed = JSON.parse(data);
      return parsed.count || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Calculate progressive delay for failed attempts
   */
  calculateProgressiveDelay(attemptCount: number): number {
    if (attemptCount <= 1) return 0;
    
    // Exponential backoff: base * (2^(attempts-2))
    const delay = this.config.progressiveDelayBase * Math.pow(2, attemptCount - 2);
    return Math.min(delay, this.config.maxProgressiveDelay);
  }

  /**
   * Check if IP is rate limited
   */
  isIpRateLimited(ip: string): boolean {
    const attempts = this.getIpAttempts(ip);
    return attempts.length >= this.config.ipMaxAttempts;
  }

  /**
   * Get recent attempts for an IP
   */
  private getIpAttempts(ip: string): FailedAttempt[] {
    const now = Date.now();
    const windowStart = now - this.config.ipRateLimitWindow;
    
    return this.getAllStoredAttempts()
      .filter(attempt => 
        attempt.ip === ip && 
        attempt.timestamp >= windowStart
      );
  }

  /**
   * Check if account requires CAPTCHA
   */
  requiresCaptcha(email: string): boolean {
    const attempts = this.getAccountAttempts(email);
    return attempts >= this.config.suspiciousThreshold;
  }

  /**
   * Store failed attempt
   */
  private storeFailedAttempt(attempt: FailedAttempt): void {
    const attempts = this.getAllStoredAttempts();
    
    // Add new attempt
    attempts.push(attempt);
    
    // Keep only recent attempts (last 24 hours)
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const recentAttempts = attempts.filter(a => a.timestamp >= oneDayAgo);
    
    localStorage.setItem(
      `${this.storagePrefix}attempts`,
      JSON.stringify(recentAttempts)
    );
  }

  /**
   * Get all stored attempts
   */
  private getAllStoredAttempts(): FailedAttempt[] {
    const data = localStorage.getItem(`${this.storagePrefix}attempts`);
    if (!data) return [];
    
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  /**
   * Get recent attempts for account
   */
  private getRecentAttempts(email: string): FailedAttempt[] {
    const now = Date.now();
    const windowStart = now - this.config.ipRateLimitWindow;
    
    return this.getAllStoredAttempts()
      .filter(attempt => 
        attempt.email === email.toLowerCase() && 
        attempt.timestamp >= windowStart
      );
  }

  /**
   * Get lockout time remaining in milliseconds
   */
  getLockoutTimeRemaining(email: string): number {
    const lockout = this.getAccountLockout(email);
    if (!lockout) return 0;
    
    const now = Date.now();
    return Math.max(0, lockout.unlockAt - now);
  }

  /**
   * Format lockout time remaining for display
   */
  formatLockoutTime(email: string): string {
    const remaining = this.getLockoutTimeRemaining(email);
    if (remaining <= 0) return '';
    
    const minutes = Math.ceil(remaining / (60 * 1000));
    if (minutes < 60) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (remainingMinutes === 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    }
    
    return `${hours}h ${remainingMinutes}m`;
  }

  /**
   * Clean up expired data
   */
  cleanup(): void {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    
    // Clean expired attempts
    const attempts = this.getAllStoredAttempts()
      .filter(attempt => attempt.timestamp >= oneDayAgo);
    
    localStorage.setItem(
      `${this.storagePrefix}attempts`,
      JSON.stringify(attempts)
    );
    
    // Clean expired lockouts
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(`${this.storagePrefix}lockout_`)) {
        const lockoutData = localStorage.getItem(key);
        if (lockoutData) {
          try {
            const lockout: AccountLockout = JSON.parse(lockoutData);
            if (now >= lockout.unlockAt) {
              localStorage.removeItem(key);
            }
          } catch {
            localStorage.removeItem(key);
          }
        }
      }
    }
    
    console.log('🧹 Brute force protection cleanup completed');
  }
}

// Create singleton instance
export const bruteForceProtection = new BruteForceProtection();

// Auto-cleanup every hour
if (typeof window !== 'undefined') {
  setInterval(() => {
    bruteForceProtection.cleanup();
  }, 60 * 60 * 1000); // 1 hour
}