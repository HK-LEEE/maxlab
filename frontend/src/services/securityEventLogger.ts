/**
 * Security Event Logger Service
 * 보안 이벤트를 서버로 전송하여 중앙 집중식 모니터링
 */

export interface SecurityEvent {
  eventId: string;
  timestamp: string;
  eventType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  userId?: string;
  sessionId: string;
  details: Record<string, any>;
  context: {
    userAgent: string;
    ip?: string;
    url: string;
    referrer: string;
    browserFingerprint: string;
  };
  metadata?: Record<string, any>;
}

export interface SecurityEventConfig {
  enabled: boolean;
  serverEndpoint: string;
  batchSize: number;
  flushInterval: number; // ms
  maxRetries: number;
  retryDelay: number; // ms
  enableLocalStorage: boolean;
  compressionEnabled: boolean;
}

export class SecurityEventLogger {
  private static instance: SecurityEventLogger;
  private config: SecurityEventConfig;
  private eventQueue: SecurityEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private sessionId: string;
  private browserFingerprint: string = '';

  private constructor(config?: Partial<SecurityEventConfig>) {
    this.config = {
      enabled: true,
      serverEndpoint: '/api/security/events',
      batchSize: 10,
      flushInterval: 30000, // 30초
      maxRetries: 3,
      retryDelay: 1000,
      enableLocalStorage: true,
      compressionEnabled: false,
      ...config
    };

    this.sessionId = this.generateSessionId();
    this.initializeBrowserFingerprint();
    this.startFlushTimer();
    this.loadQueuedEvents();

    // 페이지 언로드 시 즉시 플러시
    window.addEventListener('beforeunload', () => {
      this.flush(true);
    });
  }

  static getInstance(config?: Partial<SecurityEventConfig>): SecurityEventLogger {
    if (!SecurityEventLogger.instance) {
      SecurityEventLogger.instance = new SecurityEventLogger(config);
    }
    return SecurityEventLogger.instance;
  }

  /**
   * 보안 이벤트 로깅
   */
  logSecurityEvent(
    eventType: string,
    severity: SecurityEvent['severity'],
    details: Record<string, any>,
    metadata?: Record<string, any>
  ): void {
    if (!this.config.enabled) {
      return;
    }

    const event: SecurityEvent = {
      eventId: this.generateEventId(),
      timestamp: new Date().toISOString(),
      eventType,
      severity,
      source: 'frontend',
      userId: this.getCurrentUserId(),
      sessionId: this.sessionId,
      details: this.sanitizeDetails(details),
      context: {
        userAgent: navigator.userAgent,
        url: window.location.href,
        referrer: document.referrer,
        browserFingerprint: this.browserFingerprint
      },
      metadata
    };

    this.eventQueue.push(event);
    console.log(`🔒 Security event logged: ${eventType} (${severity})`, event);

    // 로컬 스토리지에도 저장 (백업용)
    if (this.config.enableLocalStorage) {
      this.saveToLocalStorage(event);
    }

    // 긴급 이벤트는 즉시 전송
    if (severity === 'critical') {
      this.flush(true);
    } else if (this.eventQueue.length >= this.config.batchSize) {
      this.flush();
    }
  }

  /**
   * 토큰 관련 보안 이벤트 전용 메서드들
   */
  logTokenEvent(eventType: string, details: Record<string, any>): void {
    const severity = this.determineTokenEventSeverity(eventType);
    this.logSecurityEvent(`token_${eventType}`, severity, details);
  }

  logRefreshTokenEvent(eventType: string, details: Record<string, any>): void {
    const severity = this.determineRefreshTokenEventSeverity(eventType);
    this.logSecurityEvent(`refresh_token_${eventType}`, severity, details);
  }

  logAuthenticationEvent(eventType: string, details: Record<string, any>): void {
    const severity = this.determineAuthEventSeverity(eventType);
    this.logSecurityEvent(`auth_${eventType}`, severity, details);
  }

  logEncryptionEvent(eventType: string, details: Record<string, any>): void {
    const severity = this.determineEncryptionEventSeverity(eventType);
    this.logSecurityEvent(`encryption_${eventType}`, severity, details);
  }

  /**
   * 이벤트 일괄 전송
   */
  async flush(immediate: boolean = false): Promise<void> {
    if (this.eventQueue.length === 0) {
      return;
    }

    const eventsToSend = [...this.eventQueue];
    this.eventQueue = [];

    try {
      await this.sendEventsToServer(eventsToSend);
      this.clearLocalStorageEvents(eventsToSend);
    } catch (error: any) {
      console.error('❌ Failed to send security events:', error);
      
      // 전송 실패 시 큐에 다시 추가
      this.eventQueue.unshift(...eventsToSend);
      
      if (!immediate) {
        // 재시도 스케줄링
        setTimeout(() => {
          this.flush();
        }, this.config.retryDelay);
      }
    }
  }

  /**
   * 서버로 이벤트 전송
   */
  private async sendEventsToServer(events: SecurityEvent[]): Promise<void> {
    const authUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000';
    const endpoint = `${authUrl}${this.config.serverEndpoint}`;

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < this.config.maxRetries) {
      try {
        const payload = {
          events,
          batchId: this.generateEventId(),
          timestamp: new Date().toISOString(),
          source: 'maxlab-frontend',
          version: '1.0.0'
        };

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('accessToken') || ''}`,
            'X-Session-ID': this.sessionId,
            'X-Browser-Fingerprint': this.browserFingerprint
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        console.log(`✅ Sent ${events.length} security events to server`);
        return;

      } catch (error: any) {
        lastError = error;
        attempt++;
        
        if (attempt < this.config.maxRetries) {
          console.warn(`⚠️ Security event send attempt ${attempt} failed, retrying...`);
          await this.delay(this.config.retryDelay * attempt);
        }
      }
    }

    throw new Error(`Failed to send security events after ${this.config.maxRetries} attempts: ${lastError?.message}`);
  }

  /**
   * 이벤트 심각도 결정 로직
   */
  private determineTokenEventSeverity(eventType: string): SecurityEvent['severity'] {
    const criticalEvents = ['blacklisted', 'compromised', 'stolen'];
    const highEvents = ['expired', 'invalid', 'revoked'];
    const mediumEvents = ['refresh_failed', 'validation_failed'];
    
    if (criticalEvents.includes(eventType)) return 'critical';
    if (highEvents.includes(eventType)) return 'high';
    if (mediumEvents.includes(eventType)) return 'medium';
    return 'low';
  }

  private determineRefreshTokenEventSeverity(eventType: string): SecurityEvent['severity'] {
    const criticalEvents = ['stolen', 'replay_attack', 'invalid_rotation'];
    const highEvents = ['expired', 'invalid', 'failed_multiple'];
    const mediumEvents = ['failed', 'retry'];
    
    if (criticalEvents.includes(eventType)) return 'critical';
    if (highEvents.includes(eventType)) return 'high';
    if (mediumEvents.includes(eventType)) return 'medium';
    return 'low';
  }

  private determineAuthEventSeverity(eventType: string): SecurityEvent['severity'] {
    const criticalEvents = ['brute_force', 'account_takeover'];
    const highEvents = ['failed_login_multiple', 'suspicious_location'];
    const mediumEvents = ['failed_login', 'password_reset'];
    
    if (criticalEvents.includes(eventType)) return 'critical';
    if (highEvents.includes(eventType)) return 'high';
    if (mediumEvents.includes(eventType)) return 'medium';
    return 'low';
  }

  private determineEncryptionEventSeverity(eventType: string): SecurityEvent['severity'] {
    const criticalEvents = ['key_compromise', 'decryption_failed_multiple'];
    const highEvents = ['encryption_failed', 'key_derivation_failed'];
    const mediumEvents = ['fallback_plaintext', 'migration_needed'];
    
    if (criticalEvents.includes(eventType)) return 'critical';
    if (highEvents.includes(eventType)) return 'high';
    if (mediumEvents.includes(eventType)) return 'medium';
    return 'low';
  }

  /**
   * 브라우저 fingerprint 생성
   */
  private async initializeBrowserFingerprint(): Promise<void> {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('Security fingerprint', 2, 2);
      }

      const fingerprint = [
        navigator.userAgent,
        navigator.language,
        screen.width,
        screen.height,
        screen.colorDepth,
        new Date().getTimezoneOffset(),
        canvas.toDataURL(),
        navigator.hardwareConcurrency || 4,
        navigator.maxTouchPoints || 0,
        localStorage.length,
        Object.keys(window).length
      ].join('|');

      const encoder = new TextEncoder();
      const data = encoder.encode(fingerprint);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      
      this.browserFingerprint = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .substring(0, 16); // 16자리로 축약

    } catch (error) {
      this.browserFingerprint = 'unknown_' + Math.random().toString(36).substring(2, 10);
    }
  }

  /**
   * 세션 ID 생성
   */
  private generateSessionId(): string {
    return 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
  }

  /**
   * 이벤트 ID 생성
   */
  private generateEventId(): string {
    return 'evt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
  }

  /**
   * 현재 사용자 ID 가져오기
   */
  private getCurrentUserId(): string | undefined {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      return user.id || user.email || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * 민감한 정보 제거
   */
  private sanitizeDetails(details: Record<string, any>): Record<string, any> {
    const sanitized = { ...details };
    
    // 민감한 키워드 패턴
    const sensitivePatterns = [
      /token/i,
      /password/i,
      /secret/i,
      /key/i,
      /credential/i
    ];

    const sanitizeValue = (value: any): any => {
      if (typeof value === 'string') {
        // 토큰이나 민감한 정보를 마스킹
        if (value.length > 20 && (value.includes('Bearer') || value.includes('token'))) {
          return value.substring(0, 8) + '***masked***';
        }
        return value;
      }
      
      if (typeof value === 'object' && value !== null) {
        const sanitizedObj: any = {};
        for (const [key, val] of Object.entries(value)) {
          if (sensitivePatterns.some(pattern => pattern.test(key))) {
            sanitizedObj[key] = '***masked***';
          } else {
            sanitizedObj[key] = sanitizeValue(val);
          }
        }
        return sanitizedObj;
      }
      
      return value;
    };

    for (const [key, value] of Object.entries(sanitized)) {
      if (sensitivePatterns.some(pattern => pattern.test(key))) {
        sanitized[key] = '***masked***';
      } else {
        sanitized[key] = sanitizeValue(value);
      }
    }

    return sanitized;
  }

  /**
   * 로컬 스토리지 관리
   */
  private saveToLocalStorage(event: SecurityEvent): void {
    try {
      const key = 'security_events_backup';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      existing.push(event);
      
      // 최대 50개 이벤트만 보관
      if (existing.length > 50) {
        existing.splice(0, existing.length - 50);
      }
      
      localStorage.setItem(key, JSON.stringify(existing));
    } catch (error) {
      console.warn('Failed to save security event to localStorage:', error);
    }
  }

  private loadQueuedEvents(): void {
    if (!this.config.enableLocalStorage) return;

    try {
      const key = 'security_events_backup';
      const events = JSON.parse(localStorage.getItem(key) || '[]');
      
      if (events.length > 0) {
        console.log(`📁 Loaded ${events.length} queued security events from localStorage`);
        this.eventQueue.push(...events);
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.warn('Failed to load queued security events:', error);
    }
  }

  private clearLocalStorageEvents(sentEvents: SecurityEvent[]): void {
    try {
      const key = 'security_events_backup';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      
      // 전송된 이벤트들을 제거
      const remaining = existing.filter((event: SecurityEvent) => 
        !sentEvents.some(sent => sent.eventId === event.eventId)
      );
      
      if (remaining.length > 0) {
        localStorage.setItem(key, JSON.stringify(remaining));
      } else {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.warn('Failed to clear localStorage events:', error);
    }
  }

  /**
   * 플러시 타이머 관리
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      if (this.eventQueue.length > 0) {
        this.flush();
      }
    }, this.config.flushInterval);
  }

  /**
   * 유틸리티 메서드
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 설정 및 상태 조회
   */
  getConfig(): SecurityEventConfig {
    return { ...this.config };
  }

  getQueueStatus(): {
    queueLength: number;
    sessionId: string;
    browserFingerprint: string;
    isEnabled: boolean;
  } {
    return {
      queueLength: this.eventQueue.length,
      sessionId: this.sessionId,
      browserFingerprint: this.browserFingerprint,
      isEnabled: this.config.enabled
    };
  }

  /**
   * 설정 업데이트
   */
  updateConfig(newConfig: Partial<SecurityEventConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.flushInterval) {
      this.startFlushTimer();
    }
  }

  /**
   * 서비스 중지
   */
  shutdown(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    
    // 남은 이벤트들 즉시 전송
    this.flush(true);
  }
}

// 전역 인스턴스 export
export const securityEventLogger = SecurityEventLogger.getInstance();

export default SecurityEventLogger;