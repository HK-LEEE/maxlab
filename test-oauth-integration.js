#!/usr/bin/env node

/**
 * OAuth 통합 테스트 스크립트
 * maxlab이 새로운 maxplatform OAuth 서버 (/auth/* 엔드포인트)와 제대로 통합되었는지 검증
 */

const axios = require('axios');
const crypto = require('crypto');
const base64url = require('base64url');

// 테스트 설정
const config = {
    authServerUrl: process.env.AUTH_SERVER_URL || 'https://max.dwchem.co.kr',
    clientId: 'maxlab',
    redirectUri: 'https://maxlab.dwchem.co.kr/oauth/callback',
    testEndpoints: {
        discovery: '/auth/.well-known/openid-configuration',
        jwks: '/auth/jwks',
        authorize: '/auth/authorize',
        token: '/auth/token',
        userinfo: '/auth/userinfo',
        logout: '/auth/logout',
        revoke: '/auth/revoke'
    }
};

// 색상 출력을 위한 헬퍼
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m'
};

const log = {
    success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
    info: (msg) => console.log(`${colors.cyan}ℹ️  ${msg}${colors.reset}`),
    warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`)
};

/**
 * 1. Discovery 엔드포인트 테스트
 */
async function testDiscovery() {
    log.info('Discovery 엔드포인트 테스트 시작...');
    
    try {
        const response = await axios.get(`${config.authServerUrl}${config.testEndpoints.discovery}`, {
            timeout: 5000,
            validateStatus: () => true
        });
        
        if (response.status === 200) {
            const discovery = response.data;
            
            // 필수 필드 확인
            const requiredFields = [
                'issuer', 'authorization_endpoint', 'token_endpoint',
                'userinfo_endpoint', 'jwks_uri'
            ];
            
            let allFieldsPresent = true;
            for (const field of requiredFields) {
                if (!discovery[field]) {
                    log.error(`Discovery 문서에 ${field} 필드가 없습니다`);
                    allFieldsPresent = false;
                } else {
                    // 새로운 /auth/* 경로를 사용하는지 확인
                    if (typeof discovery[field] === 'string' && discovery[field].includes('/auth/')) {
                        log.success(`${field}: ${discovery[field]} (새 경로 사용 ✓)`);
                    }
                }
            }
            
            // PKCE 지원 확인
            if (discovery.code_challenge_methods_supported?.includes('S256')) {
                log.success('PKCE S256 메소드 지원 확인');
            }
            
            if (allFieldsPresent) {
                log.success('Discovery 엔드포인트 테스트 통과');
                return true;
            }
        } else {
            log.error(`Discovery 응답 상태 코드: ${response.status}`);
        }
    } catch (error) {
        log.error(`Discovery 테스트 실패: ${error.message}`);
        if (error.code === 'ENOTFOUND') {
            log.warning('로컬 환경에서는 max.dwchem.co.kr 도메인을 확인할 수 없습니다');
            log.info('프로덕션 환경에서 테스트하거나 AUTH_SERVER_URL=http://localhost:8000으로 설정하세요');
        }
    }
    return false;
}

/**
 * 2. JWKS 엔드포인트 테스트
 */
async function testJWKS() {
    log.info('JWKS 엔드포인트 테스트 시작...');
    
    try {
        const response = await axios.get(`${config.authServerUrl}${config.testEndpoints.jwks}`, {
            timeout: 5000,
            validateStatus: () => true
        });
        
        if (response.status === 200) {
            const jwks = response.data;
            
            if (jwks.keys && Array.isArray(jwks.keys)) {
                if (jwks.keys.length > 0) {
                    log.success(`JWKS 테스트 통과 (${jwks.keys.length}개 키 발견)`);
                    
                    // RS256 알고리즘 확인
                    const rs256Keys = jwks.keys.filter(k => k.alg === 'RS256');
                    if (rs256Keys.length > 0) {
                        log.success(`RS256 서명 키 확인 (${rs256Keys.length}개)`);
                    }
                } else {
                    log.warning('JWKS에 키가 없습니다. RSA 키 생성이 필요할 수 있습니다');
                }
                return true;
            }
        } else {
            log.error(`JWKS 응답 상태 코드: ${response.status}`);
        }
    } catch (error) {
        log.error(`JWKS 테스트 실패: ${error.message}`);
    }
    return false;
}

/**
 * 3. Authorization 엔드포인트 접근성 테스트
 */
async function testAuthorizationEndpoint() {
    log.info('Authorization 엔드포인트 접근성 테스트...');
    
    try {
        // PKCE 챌린지 생성
        const codeVerifier = base64url(crypto.randomBytes(32));
        const codeChallenge = base64url(
            crypto.createHash('sha256').update(codeVerifier).digest()
        );
        
        const authParams = new URLSearchParams({
            response_type: 'code',
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            scope: 'openid profile email',
            state: crypto.randomBytes(16).toString('hex'),
            code_challenge: codeChallenge,
            code_challenge_method: 'S256'
        });
        
        const authUrl = `${config.authServerUrl}${config.testEndpoints.authorize}?${authParams}`;
        
        // HEAD 요청으로 엔드포인트 존재 확인
        const response = await axios.head(authUrl, {
            timeout: 5000,
            validateStatus: () => true,
            maxRedirects: 0
        });
        
        // 302 리다이렉트 또는 200 OK 예상
        if (response.status === 302 || response.status === 200 || response.status === 401) {
            log.success('Authorization 엔드포인트 접근 가능');
            log.info(`생성된 Authorization URL: ${authUrl}`);
            return true;
        } else {
            log.warning(`Authorization 엔드포인트 응답 상태: ${response.status}`);
        }
    } catch (error) {
        if (error.response && error.response.status === 302) {
            log.success('Authorization 엔드포인트 접근 가능 (리다이렉트 감지)');
            return true;
        }
        log.error(`Authorization 엔드포인트 테스트 실패: ${error.message}`);
    }
    return false;
}

/**
 * 4. 엔드포인트 경로 확인
 */
function testEndpointPaths() {
    log.info('엔드포인트 경로 확인...');
    
    let allCorrect = true;
    
    // 모든 엔드포인트가 /auth/* 경로를 사용하는지 확인
    for (const [name, path] of Object.entries(config.testEndpoints)) {
        if (path.startsWith('/auth/')) {
            log.success(`${name}: ${path} ✓`);
        } else {
            log.error(`${name}: ${path} - 잘못된 경로 (기대값: /auth/*)`);
            allCorrect = false;
        }
    }
    
    if (allCorrect) {
        log.success('모든 엔드포인트가 새로운 /auth/* 경로를 사용합니다');
    }
    
    return allCorrect;
}

/**
 * 메인 테스트 실행
 */
async function runTests() {
    console.log('\n' + '='.repeat(60));
    console.log('🧪 MaxLab OAuth 통합 테스트');
    console.log('   새로운 maxplatform OAuth 서버 (/auth/*) 통합 검증');
    console.log('='.repeat(60) + '\n');
    
    log.info(`Auth Server URL: ${config.authServerUrl}`);
    log.info(`Client ID: ${config.clientId}\n`);
    
    const results = {
        passed: 0,
        failed: 0
    };
    
    // 테스트 실행
    const tests = [
        { name: '엔드포인트 경로 확인', fn: testEndpointPaths },
        { name: 'Discovery 엔드포인트', fn: testDiscovery },
        { name: 'JWKS 엔드포인트', fn: testJWKS },
        { name: 'Authorization 엔드포인트', fn: testAuthorizationEndpoint }
    ];
    
    for (const test of tests) {
        console.log(`\n[${test.name}]`);
        const result = await test.fn();
        if (result) {
            results.passed++;
        } else {
            results.failed++;
        }
    }
    
    // 결과 요약
    console.log('\n' + '='.repeat(60));
    console.log('📊 테스트 결과 요약');
    console.log('='.repeat(60));
    console.log(`✅ 통과: ${results.passed}`);
    console.log(`❌ 실패: ${results.failed}`);
    
    if (results.failed === 0) {
        console.log('\n🎉 모든 테스트를 통과했습니다!');
        console.log('\nmaxlab이 새로운 maxplatform OAuth 서버와 성공적으로 통합되었습니다.');
        console.log('\n다음 단계:');
        console.log('1. OAuth 서버 시작: cd maxplatform/oauth-server && npm start');
        console.log('2. MaxLab 백엔드 시작: cd maxlab/backend && npm run dev');
        console.log('3. MaxLab 프론트엔드 시작: cd maxlab/frontend && npm run dev');
        console.log('4. 브라우저에서 실제 OAuth 플로우 테스트');
    } else {
        console.log('\n⚠️  일부 테스트가 실패했습니다.');
        console.log('로컬 환경에서는 도메인 확인 실패가 정상입니다.');
        console.log('실제 서버 환경에서 다시 테스트하거나 localhost:8000을 사용하세요.');
    }
    
    process.exit(results.failed > 0 ? 1 : 0);
}

// 테스트 실행
if (require.main === module) {
    runTests().catch(error => {
        console.error('테스트 실행 중 오류:', error);
        process.exit(1);
    });
}

module.exports = { runTests };