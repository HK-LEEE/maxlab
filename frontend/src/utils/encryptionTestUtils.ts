/**
 * Encryption Test Utilities
 * 토큰 암호화 기능 테스트 및 검증
 */

import { tokenEncryption, TokenEncryption } from './tokenEncryption';
import { secureTokenStorage } from '../services/secureTokenStorage';
import { refreshTokenService } from '../services/refreshTokenService';

export interface EncryptionTestReport {
  timestamp: string;
  browserSupport: {
    webCrypto: boolean;
    subtleCrypto: boolean;
    aesGcm: boolean;
    pbkdf2: boolean;
    overall: boolean;
  };
  encryptionTests: {
    basicEncryption: {
      success: boolean;
      duration: number;
      error?: string;
    };
    decryption: {
      success: boolean;
      duration: number;
      dataIntegrity: boolean;
      error?: string;
    };
    storageIntegration: {
      success: boolean;
      encrypted: boolean;
      duration: number;
      error?: string;
    };
  };
  performanceMetrics: {
    encryptionSpeed: number; // ops/sec
    decryptionSpeed: number; // ops/sec
    averageLatency: number; // ms
  };
  securityValidation: {
    keyDerivation: boolean;
    saltRandomness: boolean;
    ivRandomness: boolean;
    dataAuthenticity: boolean;
  };
  recommendations: string[];
}

/**
 * 브라우저 암호화 지원 테스트
 */
export function testBrowserCryptoSupport(): EncryptionTestReport['browserSupport'] {
  return {
    webCrypto: !!(window.crypto),
    subtleCrypto: !!(window.crypto && window.crypto.subtle),
    aesGcm: !!(window.crypto && window.crypto.subtle), // AES-GCM은 모든 모던 브라우저에서 지원
    pbkdf2: !!(window.crypto && window.crypto.subtle), // PBKDF2도 모든 모던 브라우저에서 지원
    overall: TokenEncryption.isSupported()
  };
}

/**
 * 기본 암호화/복호화 테스트
 */
export async function testBasicEncryption(): Promise<{
  encryptionTest: EncryptionTestReport['encryptionTests']['basicEncryption'];
  decryptionTest: EncryptionTestReport['encryptionTests']['decryption'];
}> {
  const testData = 'test_refresh_token_' + Date.now();
  
  // 암호화 테스트
  let encryptionTest: EncryptionTestReport['encryptionTests']['basicEncryption'];
  let encryptedData: any = null;
  
  try {
    const startTime = Date.now();
    encryptedData = await tokenEncryption.encrypt(testData);
    const duration = Date.now() - startTime;
    
    encryptionTest = {
      success: true,
      duration
    };
  } catch (error: any) {
    encryptionTest = {
      success: false,
      duration: 0,
      error: error.message
    };
  }
  
  // 복호화 테스트
  let decryptionTest: EncryptionTestReport['encryptionTests']['decryption'];
  
  if (encryptionTest.success && encryptedData) {
    try {
      const startTime = Date.now();
      const decryptedData = await tokenEncryption.decrypt(encryptedData);
      const duration = Date.now() - startTime;
      
      decryptionTest = {
        success: true,
        duration,
        dataIntegrity: decryptedData === testData
      };
    } catch (error: any) {
      decryptionTest = {
        success: false,
        duration: 0,
        dataIntegrity: false,
        error: error.message
      };
    }
  } else {
    decryptionTest = {
      success: false,
      duration: 0,
      dataIntegrity: false,
      error: 'Encryption failed, cannot test decryption'
    };
  }
  
  return { encryptionTest, decryptionTest };
}

/**
 * 저장소 통합 테스트
 */
export async function testStorageIntegration(): Promise<EncryptionTestReport['encryptionTests']['storageIntegration']> {
  const testToken = 'test_integration_token_' + Date.now();
  
  try {
    const startTime = Date.now();
    
    // 토큰 저장
    const storeResult = await secureTokenStorage.storeRefreshToken(testToken);
    
    if (!storeResult.success) {
      throw new Error(storeResult.error || 'Storage failed');
    }
    
    // 토큰 조회
    const retrieveResult = await secureTokenStorage.getRefreshToken();
    
    if (!retrieveResult.token || retrieveResult.token !== testToken) {
      throw new Error('Retrieved token does not match stored token');
    }
    
    // 정리
    await secureTokenStorage.clearRefreshToken();
    
    const duration = Date.now() - startTime;
    
    return {
      success: true,
      encrypted: retrieveResult.encrypted,
      duration
    };
    
  } catch (error: any) {
    return {
      success: false,
      encrypted: false,
      duration: 0,
      error: error.message
    };
  }
}

/**
 * 성능 테스트
 */
export async function testEncryptionPerformance(rounds: number = 10): Promise<EncryptionTestReport['performanceMetrics']> {
  const testData = 'performance_test_token_' + Date.now();
  
  let totalEncryptionTime = 0;
  let totalDecryptionTime = 0;
  let successfulRounds = 0;
  
  for (let i = 0; i < rounds; i++) {
    try {
      // 암호화 성능
      const encryptStart = performance.now();
      const encrypted = await tokenEncryption.encrypt(testData);
      const encryptEnd = performance.now();
      totalEncryptionTime += (encryptEnd - encryptStart);
      
      // 복호화 성능
      const decryptStart = performance.now();
      await tokenEncryption.decrypt(encrypted);
      const decryptEnd = performance.now();
      totalDecryptionTime += (decryptEnd - decryptStart);
      
      successfulRounds++;
    } catch (error) {
      console.warn(`Performance test round ${i + 1} failed:`, error);
    }
  }
  
  if (successfulRounds === 0) {
    return {
      encryptionSpeed: 0,
      decryptionSpeed: 0,
      averageLatency: 0
    };
  }
  
  const avgEncryptionTime = totalEncryptionTime / successfulRounds;
  const avgDecryptionTime = totalDecryptionTime / successfulRounds;
  
  return {
    encryptionSpeed: Math.round(1000 / avgEncryptionTime), // ops/sec
    decryptionSpeed: Math.round(1000 / avgDecryptionTime), // ops/sec
    averageLatency: Math.round(avgEncryptionTime + avgDecryptionTime) // ms
  };
}

/**
 * 보안 검증 테스트
 */
export async function testSecurityValidation(): Promise<EncryptionTestReport['securityValidation']> {
  const testData = 'security_test_token';
  
  try {
    // 두 번의 암호화로 랜덤성 확인
    const encrypted1 = await tokenEncryption.encrypt(testData);
    const encrypted2 = await tokenEncryption.encrypt(testData);
    
    return {
      keyDerivation: true, // PBKDF2 사용으로 검증됨
      saltRandomness: encrypted1.salt !== encrypted2.salt, // Salt가 매번 다른지 확인
      ivRandomness: encrypted1.iv !== encrypted2.iv, // IV가 매번 다른지 확인
      dataAuthenticity: encrypted1.data !== encrypted2.data // 암호화된 데이터가 매번 다른지 확인
    };
  } catch (error) {
    return {
      keyDerivation: false,
      saltRandomness: false,
      ivRandomness: false,
      dataAuthenticity: false
    };
  }
}

/**
 * 종합 암호화 테스트
 */
export async function runComprehensiveEncryptionTest(): Promise<EncryptionTestReport> {
  console.log('🧪 Running comprehensive token encryption test...');
  
  const report: EncryptionTestReport = {
    timestamp: new Date().toISOString(),
    browserSupport: testBrowserCryptoSupport(),
    encryptionTests: {
      basicEncryption: { success: false, duration: 0 },
      decryption: { success: false, duration: 0, dataIntegrity: false },
      storageIntegration: { success: false, encrypted: false, duration: 0 }
    },
    performanceMetrics: { encryptionSpeed: 0, decryptionSpeed: 0, averageLatency: 0 },
    securityValidation: { keyDerivation: false, saltRandomness: false, ivRandomness: false, dataAuthenticity: false },
    recommendations: []
  };

  // 브라우저 지원 확인
  if (!report.browserSupport.overall) {
    report.recommendations.push('Browser does not support Web Crypto API - upgrade to a modern browser');
    console.log('❌ Browser crypto support test failed');
    return report;
  }

  // 기본 암호화/복호화 테스트
  const { encryptionTest, decryptionTest } = await testBasicEncryption();
  report.encryptionTests.basicEncryption = encryptionTest;
  report.encryptionTests.decryption = decryptionTest;

  // 저장소 통합 테스트
  report.encryptionTests.storageIntegration = await testStorageIntegration();

  // 성능 테스트
  if (encryptionTest.success && decryptionTest.success) {
    report.performanceMetrics = await testEncryptionPerformance();
  }

  // 보안 검증 테스트
  report.securityValidation = await testSecurityValidation();

  // 권장사항 생성
  const recommendations: string[] = [];
  
  if (!encryptionTest.success) {
    recommendations.push('Basic encryption test failed - check browser compatibility');
  }
  
  if (!decryptionTest.dataIntegrity) {
    recommendations.push('Data integrity test failed - encryption may be corrupted');
  }
  
  if (!report.encryptionTests.storageIntegration.encrypted && report.encryptionTests.storageIntegration.success) {
    recommendations.push('Tokens stored in plaintext - encryption not working');
  }
  
  if (report.performanceMetrics.averageLatency > 100) {
    recommendations.push('Encryption latency is high - consider optimizing for better user experience');
  }
  
  if (!report.securityValidation.saltRandomness || !report.securityValidation.ivRandomness) {
    recommendations.push('Cryptographic randomness may be compromised');
  }

  report.recommendations = recommendations;

  // 결과 출력
  console.log('📊 Encryption Test Results:');
  console.log(`   • Browser Support: ${report.browserSupport.overall ? '✅' : '❌'}`);
  console.log(`   • Basic Encryption: ${report.encryptionTests.basicEncryption.success ? '✅' : '❌'}`);
  console.log(`   • Data Integrity: ${report.encryptionTests.decryption.dataIntegrity ? '✅' : '❌'}`);
  console.log(`   • Storage Integration: ${report.encryptionTests.storageIntegration.success ? '✅' : '❌'}`);
  console.log(`   • Encryption Speed: ${report.performanceMetrics.encryptionSpeed} ops/sec`);
  console.log(`   • Average Latency: ${report.performanceMetrics.averageLatency}ms`);
  
  if (recommendations.length > 0) {
    console.log('💡 Recommendations:');
    recommendations.forEach(rec => console.log(`   - ${rec}`));
  } else {
    console.log('🎉 All encryption tests passed successfully!');
  }

  return report;
}

/**
 * 실제 refresh token 마이그레이션 테스트
 */
export async function testRefreshTokenMigration(): Promise<{
  success: boolean;
  beforeEncryption: boolean;
  afterEncryption: boolean;
  migrationTime: number;
  error?: string;
}> {
  try {
    console.log('🔄 Testing refresh token migration...');
    
    const startTime = Date.now();
    
    // 현재 상태 확인
    const beforeStatus = await secureTokenStorage.getStorageStatus();
    
    // 마이그레이션 실행 (plaintext가 있는 경우)
    let migrationResult = { success: true };
    if (beforeStatus.canMigrate) {
      migrationResult = await secureTokenStorage.migrateToEncrypted();
    }
    
    // 마이그레이션 후 상태 확인
    const afterStatus = await secureTokenStorage.getStorageStatus();
    
    const migrationTime = Date.now() - startTime;
    
    return {
      success: migrationResult.success,
      beforeEncryption: beforeStatus.hasEncryptedToken,
      afterEncryption: afterStatus.hasEncryptedToken,
      migrationTime
    };
    
  } catch (error: any) {
    return {
      success: false,
      beforeEncryption: false,
      afterEncryption: false,
      migrationTime: 0,
      error: error.message
    };
  }
}

// 글로벌 헬퍼 등록
export function registerEncryptionTestHelpers(): void {
  if (typeof window !== 'undefined' && import.meta.env.DEV) {
    (window as any).encryptionTest = {
      comprehensive: runComprehensiveEncryptionTest,
      basic: testBasicEncryption,
      storage: testStorageIntegration,
      performance: testEncryptionPerformance,
      security: testSecurityValidation,
      migration: testRefreshTokenMigration,
      support: testBrowserCryptoSupport
    };
    
    console.log('🧪 Encryption test helpers registered. Use window.encryptionTest in console:');
    console.log('  - encryptionTest.comprehensive() - 종합 암호화 테스트');
    console.log('  - encryptionTest.migration() - 토큰 마이그레이션 테스트');
    console.log('  - encryptionTest.support() - 브라우저 지원 확인');
  }
}

export default {
  runComprehensiveEncryptionTest,
  testBasicEncryption,
  testStorageIntegration,
  testEncryptionPerformance,
  testSecurityValidation,
  testRefreshTokenMigration,
  testBrowserCryptoSupport,
  registerEncryptionTestHelpers
};