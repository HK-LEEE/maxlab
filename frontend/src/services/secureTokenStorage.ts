/**
 * Secure Token Storage Service
 * 암호화된 refresh token 저장소 관리
 */

import { tokenEncryption, TokenEncryption } from '../utils/tokenEncryption';

// Local type definition to avoid import issues
interface EncryptedData {
  data: string;
  iv: string;
  salt: string;
  timestamp: number;
}

export interface SecureStorageConfig {
  encryptionEnabled: boolean;
  fallbackToPlaintext: boolean;
  storagePrefix: string;
  maxRetries: number;
}

export interface StorageResult {
  success: boolean;
  encrypted: boolean;
  error?: string;
}

export class SecureTokenStorage {
  private static instance: SecureTokenStorage;
  private config: SecureStorageConfig;
  private encryptionSupported: boolean;

  private constructor(config?: Partial<SecureStorageConfig>) {
    this.config = {
      encryptionEnabled: true,
      fallbackToPlaintext: true,
      storagePrefix: 'maxlab_secure_',
      maxRetries: 3,
      ...config
    };

    this.encryptionSupported = TokenEncryption.isSupported();
    
    if (!this.encryptionSupported && this.config.encryptionEnabled) {
      console.warn('⚠️ Browser does not support Web Crypto API. Tokens will be stored in plaintext.');
    }
  }

  static getInstance(config?: Partial<SecureStorageConfig>): SecureTokenStorage {
    if (!SecureTokenStorage.instance) {
      SecureTokenStorage.instance = new SecureTokenStorage(config);
    }
    return SecureTokenStorage.instance;
  }

  /**
   * Refresh token 안전하게 저장
   */
  async storeRefreshToken(refreshToken: string): Promise<StorageResult> {
    const key = `${this.config.storagePrefix}refresh_token`;
    
    // 암호화 지원 여부 및 설정 확인
    if (this.config.encryptionEnabled && this.encryptionSupported) {
      return this.storeEncrypted(key, refreshToken);
    } else if (this.config.fallbackToPlaintext) {
      return this.storePlaintext(key, refreshToken);
    } else {
      return {
        success: false,
        encrypted: false,
        error: 'Encryption not supported and fallback disabled'
      };
    }
  }

  /**
   * Refresh token 안전하게 조회
   */
  async getRefreshToken(): Promise<{ token: string | null; encrypted: boolean; error?: string }> {
    const key = `${this.config.storagePrefix}refresh_token`;
    
    // 먼저 암호화된 버전 시도
    if (this.config.encryptionEnabled && this.encryptionSupported) {
      const encryptedResult = await this.getEncrypted(key);
      if (encryptedResult.success && encryptedResult.data) {
        return {
          token: encryptedResult.data,
          encrypted: true
        };
      }
    }
    
    // 암호화 실패 시 plaintext 시도
    if (this.config.fallbackToPlaintext) {
      const plaintextResult = this.getPlaintext(key);
      if (plaintextResult.success && plaintextResult.data) {
        return {
          token: plaintextResult.data,
          encrypted: false
        };
      }
    }

    return {
      token: null,
      encrypted: false,
      error: 'No refresh token found'
    };
  }

  /**
   * Refresh token 삭제
   */
  async clearRefreshToken(): Promise<StorageResult> {
    const key = `${this.config.storagePrefix}refresh_token`;
    
    try {
      // 암호화된 버전과 plaintext 버전 모두 삭제
      localStorage.removeItem(key);
      localStorage.removeItem(`${key}_encrypted`);
      
      console.log('🧹 Refresh token cleared from secure storage');
      return {
        success: true,
        encrypted: false
      };
    } catch (error: any) {
      console.error('❌ Failed to clear refresh token:', error);
      return {
        success: false,
        encrypted: false,
        error: error.message
      };
    }
  }

  /**
   * 암호화된 저장
   */
  private async storeEncrypted(key: string, data: string): Promise<StorageResult> {
    let attempt = 0;
    let lastError: string | null = null;

    while (attempt < this.config.maxRetries) {
      try {
        console.log(`🔐 Attempting to encrypt and store token (attempt ${attempt + 1}/${this.config.maxRetries})...`);
        
        const encryptedData = await tokenEncryption.encrypt(data);
        const storageData = JSON.stringify(encryptedData);
        
        localStorage.setItem(`${key}_encrypted`, storageData);
        
        // 암호화 저장 성공 시 plaintext 버전 제거
        localStorage.removeItem(key);
        
        console.log('✅ Token encrypted and stored successfully');
        return {
          success: true,
          encrypted: true
        };

      } catch (error: any) {
        lastError = error.message;
        console.warn(`⚠️ Encryption attempt ${attempt + 1} failed:`, error.message);
        attempt++;
        
        if (attempt < this.config.maxRetries) {
          // 재시도 전 짧은 지연
          await new Promise(resolve => setTimeout(resolve, 100 * attempt));
        }
      }
    }

    console.error('❌ All encryption attempts failed, falling back to plaintext');
    
    // 암호화 실패 시 fallback
    if (this.config.fallbackToPlaintext) {
      return this.storePlaintext(key, data);
    }

    return {
      success: false,
      encrypted: false,
      error: `Encryption failed after ${this.config.maxRetries} attempts: ${lastError}`
    };
  }

  /**
   * 암호화된 조회
   */
  private async getEncrypted(key: string): Promise<{ success: boolean; data?: string; error?: string }> {
    try {
      const storedData = localStorage.getItem(`${key}_encrypted`);
      if (!storedData) {
        return { success: false, error: 'No encrypted data found' };
      }

      const encryptedData: EncryptedData = JSON.parse(storedData);
      
      // 데이터 유효성 검증
      if (!tokenEncryption.validateEncryptedData(encryptedData)) {
        throw new Error('Invalid encrypted data format');
      }

      // 만료 확인
      if (tokenEncryption.isEncryptedDataExpired(encryptedData)) {
        localStorage.removeItem(`${key}_encrypted`);
        throw new Error('Encrypted data expired');
      }

      const decryptedData = await tokenEncryption.decrypt(encryptedData);
      
      console.log('🔓 Token decrypted successfully');
      return {
        success: true,
        data: decryptedData
      };

    } catch (error: any) {
      console.warn('⚠️ Failed to decrypt token:', error.message);
      
      // 복호화 실패 시 손상된 데이터 제거
      localStorage.removeItem(`${key}_encrypted`);
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Plaintext 저장 (fallback)
   */
  private storePlaintext(key: string, data: string): StorageResult {
    try {
      localStorage.setItem(key, data);
      console.log('💾 Token stored in plaintext (fallback mode)');
      return {
        success: true,
        encrypted: false
      };
    } catch (error: any) {
      console.error('❌ Failed to store token in plaintext:', error);
      return {
        success: false,
        encrypted: false,
        error: error.message
      };
    }
  }

  /**
   * Plaintext 조회 (fallback)
   */
  private getPlaintext(key: string): { success: boolean; data?: string; error?: string } {
    try {
      const data = localStorage.getItem(key);
      if (!data) {
        return { success: false, error: 'No plaintext data found' };
      }

      console.log('📄 Token retrieved from plaintext storage');
      return {
        success: true,
        data
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 스토리지 마이그레이션 (plaintext → encrypted)
   */
  async migrateToEncrypted(): Promise<StorageResult> {
    if (!this.encryptionSupported) {
      return {
        success: false,
        encrypted: false,
        error: 'Encryption not supported'
      };
    }

    const key = `${this.config.storagePrefix}refresh_token`;
    const plaintextData = localStorage.getItem(key);
    
    if (!plaintextData) {
      return {
        success: false,
        encrypted: false,
        error: 'No plaintext data to migrate'
      };
    }

    console.log('🔄 Migrating token storage from plaintext to encrypted...');
    
    // 암호화하여 저장
    const result = await this.storeEncrypted(key, plaintextData);
    
    if (result.success) {
      // 마이그레이션 성공 시 plaintext 버전 삭제
      localStorage.removeItem(key);
      console.log('✅ Token migration completed');
    }

    return result;
  }

  /**
   * 스토리지 상태 진단
   */
  async getStorageStatus(): Promise<{
    encryptionSupported: boolean;
    hasEncryptedToken: boolean;
    hasPlaintextToken: boolean;
    canMigrate: boolean;
    recommendation: string;
  }> {
    const key = `${this.config.storagePrefix}refresh_token`;
    const hasEncrypted = !!localStorage.getItem(`${key}_encrypted`);
    const hasPlaintext = !!localStorage.getItem(key);
    
    let recommendation = '';
    if (!this.encryptionSupported) {
      recommendation = 'Browser does not support encryption. Consider using a modern browser.';
    } else if (hasPlaintext && !hasEncrypted) {
      recommendation = 'Token stored in plaintext. Consider migrating to encrypted storage.';
    } else if (hasEncrypted) {
      recommendation = 'Token securely encrypted and stored.';
    } else {
      recommendation = 'No refresh token found in storage.';
    }

    return {
      encryptionSupported: this.encryptionSupported,
      hasEncryptedToken: hasEncrypted,
      hasPlaintextToken: hasPlaintext,
      canMigrate: this.encryptionSupported && hasPlaintext,
      recommendation
    };
  }

  /**
   * 설정 정보 반환
   */
  getConfig(): SecureStorageConfig {
    return { ...this.config };
  }

  /**
   * 디버그 정보 반환
   */
  getDebugInfo(): {
    config: SecureStorageConfig;
    encryptionSupported: boolean;
    cryptoSupport: ReturnType<typeof TokenEncryption.getSupportReport>;
    storageStatus: any;
  } {
    return {
      config: this.getConfig(),
      encryptionSupported: this.encryptionSupported,
      cryptoSupport: TokenEncryption.getSupportReport(),
      storageStatus: 'Use getStorageStatus() for detailed storage information'
    };
  }
}

// 전역 인스턴스 export
export const secureTokenStorage = SecureTokenStorage.getInstance();

export default SecureTokenStorage;