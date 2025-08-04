/**
 * OAuth 로그 모니터링 스크립트
 * 브라우저 콘솔에서 실행하여 OAuth 플로우를 모니터링
 */

// OAuth 테스트 모니터링 함수
function startOAuthMonitoring() {
  console.log('🧪 OAuth Monitoring Started');
  console.log('📋 Monitoring Console for OAuth-related logs...');
  
  // 원래 console.log를 저장
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  
  // OAuth 관련 로그 필터링 및 분석
  function analyzeOAuthLog(level, message) {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    
    // OAuth 관련 키워드 확인
    const oauthKeywords = [
      'OAuth', 'oauth', 'handleOAuthLogin', 'OAUTH_SUCCESS', 'OAUTH_ERROR',
      '_force_', 'State contains', 'Flow state', 'sessionStorage',
      'popup', 'PostMessage', 'BroadcastChannel', 'acknowledgment'
    ];
    
    const isOAuthRelated = oauthKeywords.some(keyword => 
      message.toString().includes(keyword)
    );
    
    if (isOAuthRelated) {
      console.group(`🔍 [${timestamp}] OAuth ${level.toUpperCase()}`);
      originalLog(`Message: ${message}`);
      
      // 중요한 이벤트 감지
      if (message.includes('handleOAuthLogin called with forceAccountSelection: true')) {
        originalLog('✅ Different User Login initiated');
      } else if (message.includes('OAuth communication keys verification')) {
        originalLog('✅ Security cleanup key preservation check');
      } else if (message.includes('State contains _force_')) {
        originalLog('✅ Force state pattern detected');
      } else if (message.includes('Found matching flow state using original state pattern')) {
        originalLog('✅ OAuth State Manager fix working');
      } else if (message.includes('OAuth result pre-stored in sessionStorage')) {
        originalLog('✅ Communication mechanism active');
      } else if (message.includes('OAuth success from sessionStorage')) {
        originalLog('✅ Popup-Parent communication successful');
      } else if (message.includes('Close attempt')) {
        originalLog('✅ Popup auto-close initiated');
      } else if (message.includes('OAuth State Validation Failed')) {
        originalLog('❌ Critical: State validation failed');
      } else if (message.includes('All error communication methods failed')) {
        originalLog('❌ Critical: Communication breakdown');
      }
      
      console.groupEnd();
    }
  }
  
  // Console 메서드 오버라이드
  console.log = function(...args) {
    analyzeOAuthLog('info', args.join(' '));
    originalLog.apply(console, args);
  };
  
  console.warn = function(...args) {
    analyzeOAuthLog('warn', args.join(' '));
    originalWarn.apply(console, args);
  };
  
  console.error = function(...args) {
    analyzeOAuthLog('error', args.join(' '));
    originalError.apply(console, args);
  };
  
  // SessionStorage 변경 모니터링
  let lastOAuthKeys = Object.keys(sessionStorage).filter(k => k.includes('oauth'));
  
  setInterval(() => {
    const currentOAuthKeys = Object.keys(sessionStorage).filter(k => k.includes('oauth'));
    
    // 새로운 키 감지
    const newKeys = currentOAuthKeys.filter(k => !lastOAuthKeys.includes(k));
    const removedKeys = lastOAuthKeys.filter(k => !currentOAuthKeys.includes(k));
    
    if (newKeys.length > 0) {
      console.log('💾 New OAuth SessionStorage keys:', newKeys);
    }
    
    if (removedKeys.length > 0) {
      console.log('🗑️ Removed OAuth SessionStorage keys:', removedKeys);
    }
    
    lastOAuthKeys = currentOAuthKeys;
  }, 500);
  
  // 테스트 결과 요약 함수
  window.summarizeOAuthTest = function() {
    console.group('📊 OAuth Test Summary');
    
    const oauthKeys = Object.keys(sessionStorage).filter(k => k.includes('oauth'));
    console.log('SessionStorage OAuth keys:', oauthKeys);
    
    const hasSuccessResult = sessionStorage.getItem('oauth_result') || 
                            sessionStorage.getItem('oauth_success') ||
                            sessionStorage.getItem('oauth_different_user_success');
                            
    const hasError = sessionStorage.getItem('oauth_error');
    const isForceLogin = sessionStorage.getItem('oauth_force_account_selection') === 'true';
    
    console.log('Test Status:', {
      hasSuccessResult: !!hasSuccessResult,
      hasError: !!hasError,
      isForceLogin,
      currentUrl: window.location.href,
      isAuthenticated: !!localStorage.getItem('accessToken')
    });
    
    if (hasSuccessResult) {
      console.log('✅ OAuth communication successful');
    }
    
    if (hasError) {
      console.log('❌ OAuth error occurred:', sessionStorage.getItem('oauth_error'));
    }
    
    console.groupEnd();
  };
  
  console.log('🔧 Monitoring functions available:');
  console.log('  - summarizeOAuthTest() - Test result summary');
  console.log('📝 Click "다른 사용자로 로그인" to start test');
}

// 자동 시작
startOAuthMonitoring();