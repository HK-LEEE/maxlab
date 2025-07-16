/**
 * OAuth Server Integration Test
 * OAuth 서버의 refresh token 지원 여부 및 엔드포인트 테스트
 */

export interface OAuthServerTestResult {
  timestamp: string;
  serverInfo: {
    authUrl: string;
    clientId: string;
    hasClientSecret: boolean;
  };
  endpointTests: {
    wellKnown?: {
      available: boolean;
      supportsRefreshToken: boolean;
      grantTypes: string[];
      error?: string;
    };
    tokenEndpoint?: {
      available: boolean;
      supportsRefreshGrant: boolean;
      error?: string;
    };
    revokeEndpoint?: {
      available: boolean;
      error?: string;
    };
  };
  compatibilityIssues: string[];
  recommendations: string[];
}

/**
 * OAuth 서버의 well-known 구성 확인
 */
export async function testWellKnownEndpoint(): Promise<OAuthServerTestResult['endpointTests']['wellKnown']> {
  const authUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000';
  const wellKnownUrl = `${authUrl}/.well-known/oauth-authorization-server`;
  
  try {
    console.log('🔍 Testing well-known OAuth configuration...');
    
    const response = await fetch(wellKnownUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      return {
        available: false,
        supportsRefreshToken: false,
        grantTypes: [],
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }

    const config = await response.json();
    console.log('📋 OAuth server configuration:', config);

    const grantTypes = config.grant_types_supported || [];
    const supportsRefreshToken = grantTypes.includes('refresh_token');

    return {
      available: true,
      supportsRefreshToken,
      grantTypes,
    };

  } catch (error: any) {
    console.error('❌ Well-known endpoint test failed:', error);
    return {
      available: false,
      supportsRefreshToken: false,
      grantTypes: [],
      error: error.message
    };
  }
}

/**
 * Token 엔드포인트의 refresh_token grant 지원 테스트
 */
export async function testTokenEndpointCapabilities(): Promise<OAuthServerTestResult['endpointTests']['tokenEndpoint']> {
  const authUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000';
  const tokenUrl = `${authUrl}/api/oauth/token`;

  try {
    console.log('🔍 Testing token endpoint capabilities...');
    
    // OPTIONS 요청으로 엔드포인트 확인
    const optionsResponse = await fetch(tokenUrl, {
      method: 'OPTIONS'
    });

    if (!optionsResponse.ok && optionsResponse.status !== 405) {
      return {
        available: false,
        supportsRefreshGrant: false,
        error: `Token endpoint not accessible: HTTP ${optionsResponse.status}`
      };
    }

    // 잘못된 refresh_token으로 테스트 (엔드포인트 존재 여부만 확인)
    const clientSecret = import.meta.env.VITE_CLIENT_SECRET;
    const requestBody = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: 'test_invalid_token',
      client_id: import.meta.env.VITE_CLIENT_ID || 'maxlab'
    });
    
    // Client secret이 설정되어 있으면 추가
    if (clientSecret) {
      requestBody.append('client_secret', clientSecret);
      console.log('🔐 Including client_secret in test request');
    }
    
    const testResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: requestBody
    });

    // 400 (Bad Request) 또는 401 (Unauthorized)은 엔드포인트가 존재함을 의미
    const supportsRefreshGrant = testResponse.status === 400 || testResponse.status === 401;

    return {
      available: true,
      supportsRefreshGrant
    };

  } catch (error: any) {
    console.error('❌ Token endpoint test failed:', error);
    return {
      available: false,
      supportsRefreshGrant: false,
      error: error.message
    };
  }
}

/**
 * Token revoke 엔드포인트 테스트
 */
export async function testRevokeEndpoint(): Promise<OAuthServerTestResult['endpointTests']['revokeEndpoint']> {
  const authUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000';
  const revokeUrl = `${authUrl}/api/oauth/revoke`;

  try {
    console.log('🔍 Testing revoke endpoint...');
    
    // OPTIONS 요청으로 엔드포인트 확인
    const optionsResponse = await fetch(revokeUrl, {
      method: 'OPTIONS'
    });

    if (!optionsResponse.ok && optionsResponse.status !== 405) {
      return {
        available: false,
        error: `Revoke endpoint not accessible: HTTP ${optionsResponse.status}`
      };
    }

    return {
      available: true
    };

  } catch (error: any) {
    console.error('❌ Revoke endpoint test failed:', error);
    return {
      available: false,
      error: error.message
    };
  }
}

/**
 * 종합 OAuth 서버 호환성 테스트
 */
export async function runOAuthServerCompatibilityTest(): Promise<OAuthServerTestResult> {
  console.log('🧪 Running OAuth server compatibility test...');
  
  const authUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000';
  const clientId = import.meta.env.VITE_CLIENT_ID || 'maxlab';
  const hasClientSecret = !!(import.meta.env.VITE_CLIENT_SECRET);

  const result: OAuthServerTestResult = {
    timestamp: new Date().toISOString(),
    serverInfo: {
      authUrl,
      clientId,
      hasClientSecret
    },
    endpointTests: {},
    compatibilityIssues: [],
    recommendations: []
  };

  // Well-known 구성 테스트
  result.endpointTests.wellKnown = await testWellKnownEndpoint();

  // Token 엔드포인트 테스트
  result.endpointTests.tokenEndpoint = await testTokenEndpointCapabilities();

  // Revoke 엔드포인트 테스트
  result.endpointTests.revokeEndpoint = await testRevokeEndpoint();

  // 호환성 이슈 분석
  const issues: string[] = [];
  const recommendations: string[] = [];

  if (!result.endpointTests.wellKnown?.available) {
    issues.push('Well-known OAuth configuration endpoint not available');
    recommendations.push('Implement /.well-known/oauth-authorization-server endpoint');
  }

  if (!result.endpointTests.wellKnown?.supportsRefreshToken) {
    issues.push('Server does not advertise refresh_token grant support');
    recommendations.push('Add "refresh_token" to grant_types_supported in OAuth metadata');
  }

  if (!result.endpointTests.tokenEndpoint?.available) {
    issues.push('Token endpoint not accessible');
    recommendations.push('Ensure /api/oauth/token endpoint is available and accessible');
  }

  if (!result.endpointTests.tokenEndpoint?.supportsRefreshGrant) {
    issues.push('Token endpoint does not support refresh_token grant');
    recommendations.push('Implement refresh_token grant type in token endpoint');
  }

  if (!result.endpointTests.revokeEndpoint?.available) {
    issues.push('Token revoke endpoint not available');
    recommendations.push('Implement /api/oauth/revoke endpoint for secure logout');
  }

  if (hasClientSecret) {
    issues.push('Client secret configured in frontend (security risk)');
    recommendations.push('Use public OAuth client without client_secret in frontend applications');
  }

  result.compatibilityIssues = issues;
  result.recommendations = recommendations;

  console.log('📊 OAuth server compatibility test results:', result);
  
  if (issues.length === 0) {
    console.log('✅ OAuth server is fully compatible with refresh token implementation');
  } else {
    console.warn(`⚠️ Found ${issues.length} compatibility issues that need attention`);
    console.log('💡 Recommendations:', recommendations);
  }

  return result;
}

/**
 * 현재 저장된 refresh token으로 실제 갱신 테스트
 */
export async function testActualRefreshTokenCall(): Promise<{
  success: boolean;
  method: 'server_refresh_token' | 'fallback_silent_auth' | 'failed';
  response?: any;
  error?: string;
  duration: number;
}> {
  const startTime = Date.now();
  
  try {
    console.log('🧪 Testing actual refresh token call to server...');
    
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      return {
        success: false,
        method: 'failed',
        error: 'No refresh token available',
        duration: Date.now() - startTime
      };
    }

    const authUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000';
    const clientId = import.meta.env.VITE_CLIENT_ID || 'maxlab';
    const clientSecret = import.meta.env.VITE_CLIENT_SECRET;

    const response = await fetch(`${authUrl}/api/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        ...(clientSecret && { client_secret: clientSecret })
      })
    });

    const responseData = await response.json();
    const duration = Date.now() - startTime;

    if (response.ok) {
      console.log('✅ Server refresh token call successful:', responseData);
      return {
        success: true,
        method: 'server_refresh_token',
        response: responseData,
        duration
      };
    } else {
      console.warn('⚠️ Server refresh token call failed, will fallback to silent auth:', responseData);
      return {
        success: false,
        method: 'fallback_silent_auth',
        error: responseData.error_description || responseData.error || 'Server refresh failed',
        response: responseData,
        duration
      };
    }

  } catch (error: any) {
    console.error('❌ Refresh token call error:', error);
    return {
      success: false,
      method: 'failed',
      error: error.message,
      duration: Date.now() - startTime
    };
  }
}

// 글로벌 헬퍼 등록
export function registerOAuthTestHelpers(): void {
  if (typeof window !== 'undefined' && import.meta.env.DEV) {
    (window as any).oauthTest = {
      compatibility: runOAuthServerCompatibilityTest,
      wellKnown: testWellKnownEndpoint,
      tokenEndpoint: testTokenEndpointCapabilities,
      revokeEndpoint: testRevokeEndpoint,
      actualRefresh: testActualRefreshTokenCall
    };
    
    console.log('🧪 OAuth test helpers registered. Use window.oauthTest in console:');
    console.log('  - oauthTest.compatibility() - 서버 호환성 종합 테스트');
    console.log('  - oauthTest.actualRefresh() - 실제 refresh token 호출 테스트');
  }
}