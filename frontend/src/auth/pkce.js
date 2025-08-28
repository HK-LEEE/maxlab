/**
 * PKCE (Proof Key for Code Exchange) 유틸리티
 * RFC 7636 표준을 따르는 OAuth 2.0 PKCE 구현
 * 
 * SPA 환경에서 보안 강화를 위한 코드 챌린지/검증자 생성
 */

/**
 * Base64URL 인코딩 유틸리티 (패딩 제거)
 * @param {ArrayBuffer} buffer - 인코딩할 버퍼
 * @returns {string} Base64URL 인코딩된 문자열
 */
function base64URLEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * SHA256 해시 계산 (Web Crypto API 사용)
 * @param {string} plain - 해시할 평문
 * @returns {Promise<ArrayBuffer>} SHA256 해시
 */
async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return await crypto.subtle.digest('SHA-256', data);
}

/**
 * 암호학적으로 안전한 랜덤 문자열 생성
 * @param {number} length - 생성할 문자열 길이 (기본값: 128)
 * @returns {string} Base64URL 인코딩된 랜덤 문자열
 */
export function generateSecureRandomString(length = 128) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
}

/**
 * PKCE 코드 검증자(Code Verifier) 생성
 * RFC 7636 Section 4.1에 따라 43-128자의 안전한 랜덤 문자열 생성
 * @returns {string} 코드 검증자
 */
export function generateCodeVerifier() {
  // RFC 7636: code_verifier는 최소 43자, 최대 128자여야 함
  // 보안을 위해 최대값인 128자 사용
  const array = new Uint8Array(96); // 96 바이트 → 128자 Base64URL
  crypto.getRandomValues(array);
  
  const codeVerifier = base64URLEncode(array);
  
  // 길이 검증 (RFC 7636 준수)
  if (codeVerifier.length < 43 || codeVerifier.length > 128) {
    throw new Error('Code verifier length must be between 43 and 128 characters');
  }
  
  console.log(`🔐 Generated PKCE code verifier (length: ${codeVerifier.length})`);
  return codeVerifier;
}

/**
 * PKCE 코드 챌린지(Code Challenge) 생성
 * S256 방식을 사용하여 코드 검증자의 SHA256 해시 생성
 * @param {string} codeVerifier - 코드 검증자
 * @returns {Promise<string>} 코드 챌린지
 */
export async function generateCodeChallenge(codeVerifier) {
  if (!codeVerifier) {
    throw new Error('Code verifier is required');
  }
  
  // RFC 7636: S256 방식 사용 (plain 방식보다 안전)
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64URLEncode(hashed);
  
  console.log(`🔐 Generated PKCE code challenge using S256 method`);
  return codeChallenge;
}

/**
 * PKCE 플로우를 위한 코드 쌍 생성
 * 코드 검증자와 챌린지를 함께 생성하여 반환
 * @returns {Promise<{codeVerifier: string, codeChallenge: string, method: string}>} PKCE 코드 쌍
 */
export async function generatePKCEPair() {
  try {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    
    console.log(`✅ PKCE pair generated successfully`);
    
    return {
      codeVerifier,
      codeChallenge,
      method: 'S256' // 항상 S256 방식 사용
    };
  } catch (error) {
    console.error('❌ Failed to generate PKCE pair:', error);
    throw new Error(`PKCE pair generation failed: ${error.message}`);
  }
}

/**
 * PKCE 검증자 유효성 검사
 * RFC 7636 규격에 맞는지 확인
 * @param {string} codeVerifier - 검증할 코드 검증자
 * @returns {boolean} 유효성 여부
 */
export function validateCodeVerifier(codeVerifier) {
  if (!codeVerifier || typeof codeVerifier !== 'string') {
    return false;
  }
  
  // RFC 7636: 길이 검사 (43-128자)
  if (codeVerifier.length < 43 || codeVerifier.length > 128) {
    console.warn(`⚠️ Invalid code verifier length: ${codeVerifier.length} (must be 43-128)`);
    return false;
  }
  
  // RFC 7636: 허용된 문자만 사용하는지 검사
  // [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
  const validCharRegex = /^[A-Za-z0-9\-._~]+$/;
  if (!validCharRegex.test(codeVerifier)) {
    console.warn(`⚠️ Code verifier contains invalid characters`);
    return false;
  }
  
  return true;
}

/**
 * PKCE 챌린지 유효성 검사
 * @param {string} codeChallenge - 검증할 코드 챌린지
 * @returns {boolean} 유효성 여부
 */
export function validateCodeChallenge(codeChallenge) {
  if (!codeChallenge || typeof codeChallenge !== 'string') {
    return false;
  }
  
  // Base64URL 형식 검사
  const base64URLRegex = /^[A-Za-z0-9\-_]+$/;
  if (!base64URLRegex.test(codeChallenge)) {
    console.warn(`⚠️ Code challenge is not valid Base64URL format`);
    return false;
  }
  
  // SHA256 해시의 Base64URL 인코딩은 43자여야 함
  if (codeChallenge.length !== 43) {
    console.warn(`⚠️ Code challenge length should be 43 characters, got: ${codeChallenge.length}`);
    return false;
  }
  
  return true;
}

/**
 * 세션 저장소에 PKCE 데이터 저장
 * @param {string} codeVerifier - 코드 검증자
 * @param {string} state - OAuth state 파라미터
 */
export function storePKCEData(codeVerifier, state) {
  if (!validateCodeVerifier(codeVerifier)) {
    throw new Error('Invalid code verifier');
  }
  
  if (!state) {
    throw new Error('State parameter is required');
  }
  
  try {
    // 세션 저장소에 state와 연결하여 저장
    const pkceData = {
      codeVerifier,
      timestamp: Date.now(),
      state
    };
    
    sessionStorage.setItem(`pkce_data_${state}`, JSON.stringify(pkceData));
    console.log(`🔐 PKCE data stored for state: ${state.substring(0, 8)}...`);
  } catch (error) {
    console.error('❌ Failed to store PKCE data:', error);
    throw new Error(`PKCE storage failed: ${error.message}`);
  }
}

/**
 * 세션 저장소에서 PKCE 데이터 조회
 * @param {string} state - OAuth state 파라미터
 * @returns {Object|null} PKCE 데이터 또는 null
 */
export function retrievePKCEData(state) {
  if (!state) {
    console.warn('⚠️ State parameter is required to retrieve PKCE data');
    return null;
  }
  
  try {
    const storedData = sessionStorage.getItem(`pkce_data_${state}`);
    if (!storedData) {
      console.warn(`⚠️ No PKCE data found for state: ${state.substring(0, 8)}...`);
      return null;
    }
    
    const pkceData = JSON.parse(storedData);
    
    // 만료 시간 확인 (10분)
    const maxAge = 10 * 60 * 1000; // 10 minutes
    if (Date.now() - pkceData.timestamp > maxAge) {
      console.warn(`⚠️ PKCE data expired for state: ${state.substring(0, 8)}...`);
      sessionStorage.removeItem(`pkce_data_${state}`);
      return null;
    }
    
    console.log(`🔐 PKCE data retrieved for state: ${state.substring(0, 8)}...`);
    return pkceData;
    
  } catch (error) {
    console.error('❌ Failed to retrieve PKCE data:', error);
    return null;
  }
}

/**
 * 세션 저장소에서 PKCE 데이터 제거
 * @param {string} state - OAuth state 파라미터
 */
export function clearPKCEData(state) {
  if (!state) {
    console.warn('⚠️ State parameter is required to clear PKCE data');
    return;
  }
  
  try {
    sessionStorage.removeItem(`pkce_data_${state}`);
    console.log(`🗑️ PKCE data cleared for state: ${state.substring(0, 8)}...`);
  } catch (error) {
    console.error('❌ Failed to clear PKCE data:', error);
  }
}

/**
 * 모든 PKCE 데이터 정리 (로그아웃 시 사용)
 */
export function clearAllPKCEData() {
  try {
    const keys = Object.keys(sessionStorage);
    let clearedCount = 0;
    
    keys.forEach(key => {
      if (key.startsWith('pkce_data_')) {
        sessionStorage.removeItem(key);
        clearedCount++;
      }
    });
    
    if (clearedCount > 0) {
      console.log(`🗑️ Cleared ${clearedCount} PKCE data entries`);
    }
  } catch (error) {
    console.error('❌ Failed to clear all PKCE data:', error);
  }
}

/**
 * PKCE 지원 여부 확인
 * @returns {boolean} 브라우저 지원 여부
 */
export function isPKCESupported() {
  try {
    // Web Crypto API 지원 확인
    if (!crypto || !crypto.subtle || !crypto.getRandomValues) {
      return false;
    }
    
    // TextEncoder 지원 확인
    if (!TextEncoder) {
      return false;
    }
    
    // SessionStorage 지원 확인
    if (!sessionStorage) {
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('❌ PKCE support check failed:', error);
    return false;
  }
}

/**
 * PKCE 디버깅 정보 생성
 * @returns {Object} 디버깅 정보
 */
export function getPKCEDebugInfo() {
  const keys = Object.keys(sessionStorage);
  const pkceKeys = keys.filter(key => key.startsWith('pkce_data_'));
  
  return {
    supported: isPKCESupported(),
    storedEntries: pkceKeys.length,
    entries: pkceKeys.map(key => {
      try {
        const data = JSON.parse(sessionStorage.getItem(key));
        return {
          key: key.replace('pkce_data_', ''),
          timestamp: new Date(data.timestamp).toISOString(),
          age: Math.round((Date.now() - data.timestamp) / 1000)
        };
      } catch {
        return { key: key.replace('pkce_data_', ''), error: 'Invalid data' };
      }
    })
  };
}

// 기본 내보내기
export default {
  generateCodeVerifier,
  generateCodeChallenge,
  generatePKCEPair,
  validateCodeVerifier,
  validateCodeChallenge,
  storePKCEData,
  retrievePKCEData,
  clearPKCEData,
  clearAllPKCEData,
  isPKCESupported,
  getPKCEDebugInfo,
  generateSecureRandomString
};