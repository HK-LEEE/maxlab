/**
 * Token Encryption Utilities
 * Refresh Token 보안 저장을 위한 클라이언트 사이드 암호화
 */

export interface EncryptedData {
  data: string;
  iv: string;
  salt: string;
  timestamp: number;
}

export interface TokenEncryptionConfig {
  keyDerivationIterations: number;
  algorithmName: string;
  ivLength: number;
  saltLength: number;
  tagLength: number;
}

export class TokenEncryption {
  private static instance: TokenEncryption;
  private config: TokenEncryptionConfig;
  private masterKey: CryptoKey | null = null;

  private constructor(config?: Partial<TokenEncryptionConfig>) {
    this.config = {
      keyDerivationIterations: 100000, // PBKDF2 반복 횟수
      algorithmName: 'AES-GCM',        // 대칭 암호화 알고리즘
      ivLength: 12,                    // IV 길이 (bytes)
      saltLength: 16,                  // Salt 길이 (bytes)
      tagLength: 128,                  // Authentication tag 길이 (bits)
      ...config
    };
  }

  static getInstance(config?: Partial<TokenEncryptionConfig>): TokenEncryption {
    if (!TokenEncryption.instance) {
      TokenEncryption.instance = new TokenEncryption(config);
    }
    return TokenEncryption.instance;
  }

  /**
   * 브라우저 지원 확인
   */
  static isSupported(): boolean {
    return !!(
      window.crypto &&
      window.crypto.subtle &&
      window.crypto.getRandomValues
    );
  }

  /**
   * 디바이스 고유 키 생성 (브라우저 fingerprint 기반)
   */
  private async generateDeviceKey(): Promise<string> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillText('Device fingerprint', 2, 2);
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
      navigator.maxTouchPoints || 0
    ].join('|');

    // SHA-256 해시 생성
    const encoder = new TextEncoder();
    const data = encoder.encode(fingerprint);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * 마스터 키 유도
   */
  private async deriveMasterKey(salt: Uint8Array): Promise<CryptoKey> {
    const deviceKey = await this.generateDeviceKey();
    const encoder = new TextEncoder();
    const keyMaterial = encoder.encode(deviceKey);

    // PBKDF2로 키 유도
    const baseKey = await crypto.subtle.importKey(
      'raw',
      keyMaterial,
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: this.config.keyDerivationIterations,
        hash: 'SHA-256'
      },
      baseKey,
      {
        name: this.config.algorithmName,
        length: 256
      },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * 데이터 암호화
   */
  async encrypt(data: string): Promise<EncryptedData> {
    if (!TokenEncryption.isSupported()) {
      throw new Error('Crypto API not supported in this browser');
    }

    try {
      // 랜덤 salt와 IV 생성
      const salt = crypto.getRandomValues(new Uint8Array(this.config.saltLength));
      const iv = crypto.getRandomValues(new Uint8Array(this.config.ivLength));

      // 마스터 키 유도
      const key = await this.deriveMasterKey(salt);

      // 데이터 암호화
      const encoder = new TextEncoder();
      const encodedData = encoder.encode(data);
      
      const encryptedBuffer = await crypto.subtle.encrypt(
        {
          name: this.config.algorithmName,
          iv: iv,
          tagLength: this.config.tagLength
        },
        key,
        encodedData
      );

      // Base64 인코딩
      const encryptedData = Array.from(new Uint8Array(encryptedBuffer))
        .map(b => String.fromCharCode(b))
        .join('');

      return {
        data: btoa(encryptedData),
        iv: btoa(String.fromCharCode.apply(null, Array.from(iv))),
        salt: btoa(String.fromCharCode.apply(null, Array.from(salt))),
        timestamp: Date.now()
      };

    } catch (error: any) {
      console.error('❌ Token encryption failed:', error);
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * 데이터 복호화
   */
  async decrypt(encryptedData: EncryptedData): Promise<string> {
    if (!TokenEncryption.isSupported()) {
      throw new Error('Crypto API not supported in this browser');
    }

    try {
      // Base64 디코딩
      const data = Uint8Array.from(atob(encryptedData.data), c => c.charCodeAt(0));
      const iv = Uint8Array.from(atob(encryptedData.iv), c => c.charCodeAt(0));
      const salt = Uint8Array.from(atob(encryptedData.salt), c => c.charCodeAt(0));

      // 마스터 키 유도 (같은 salt 사용)
      const key = await this.deriveMasterKey(salt);

      // 데이터 복호화
      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: this.config.algorithmName,
          iv: iv,
          tagLength: this.config.tagLength
        },
        key,
        data
      );

      // 결과 디코딩
      const decoder = new TextDecoder();
      return decoder.decode(decryptedBuffer);

    } catch (error: any) {
      console.error('❌ Token decryption failed:', error);
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * 암호화된 데이터 유효성 검증
   */
  validateEncryptedData(encryptedData: any): encryptedData is EncryptedData {
    return !!(
      encryptedData &&
      typeof encryptedData.data === 'string' &&
      typeof encryptedData.iv === 'string' &&
      typeof encryptedData.salt === 'string' &&
      typeof encryptedData.timestamp === 'number'
    );
  }

  /**
   * 암호화된 데이터 만료 확인
   */
  isEncryptedDataExpired(encryptedData: EncryptedData, maxAge: number = 30 * 24 * 60 * 60 * 1000): boolean {
    const now = Date.now();
    return (now - encryptedData.timestamp) > maxAge;
  }

  /**
   * 설정 정보 반환
   */
  getConfig(): TokenEncryptionConfig {
    return { ...this.config };
  }

  /**
   * 브라우저 지원 상태 보고서
   */
  static getSupportReport(): {
    supported: boolean;
    features: {
      webCrypto: boolean;
      subtleCrypto: boolean;
      getRandomValues: boolean;
      aesGcm: boolean;
      pbkdf2: boolean;
    };
    recommendation: string;
  } {
    const features = {
      webCrypto: !!(window.crypto),
      subtleCrypto: !!(window.crypto && window.crypto.subtle),
      getRandomValues: !!(window.crypto && window.crypto.getRandomValues),
      aesGcm: true, // 대부분의 모던 브라우저에서 지원
      pbkdf2: true  // 대부분의 모던 브라우저에서 지원
    };

    const supported = Object.values(features).every(Boolean);

    let recommendation = '';
    if (!supported) {
      recommendation = 'Modern browser required for token encryption. Consider fallback to unencrypted storage.';
    } else {
      recommendation = 'Browser fully supports token encryption features.';
    }

    return {
      supported,
      features,
      recommendation
    };
  }
}

// 글로벌 인스턴스 export
export const tokenEncryption = TokenEncryption.getInstance();

export default TokenEncryption;