/**
 * OAuth Callback 팝업 디버깅 스크립트
 * 팝업 창의 콘솔에서 실행하여 OAuth callback 처리 상태를 모니터링
 */

console.log('🔧 OAuth Callback Popup Debug Script Started');

// 현재 상태 정보 출력
function logCurrentState() {
  const urlParams = new URLSearchParams(window.location.search);
  const state = urlParams.get('state');
  const code = urlParams.get('code');
  const error = urlParams.get('error');
  
  console.group('📊 Current OAuth Callback State');
  console.log('URL:', window.location.href);
  console.log('State:', state ? state.substring(0, 20) + '...' : 'null');
  console.log('Code:', code ? code.substring(0, 10) + '...' : 'null');
  console.log('Error:', error || 'none');
  console.log('Is _force_ pattern:', state?.includes('_force_') || false);
  console.log('Has opener:', !!window.opener);
  console.log('Window size:', `${window.innerWidth}x${window.innerHeight}`);
  
  // SessionStorage OAuth keys
  const oauthKeys = Object.keys(sessionStorage).filter(k => k.includes('oauth'));
  console.log('SessionStorage OAuth keys:', oauthKeys);
  
  // 각 키의 값 확인
  oauthKeys.forEach(key => {
    const value = sessionStorage.getItem(key);
    if (value && value.length > 100) {
      console.log(`${key}:`, value.substring(0, 50) + '...');
    } else {
      console.log(`${key}:`, value);
    }
  });
  
  console.groupEnd();
}

// 팝업 모드 감지 테스트
function testPopupModeDetection() {
  console.group('🎯 Popup Mode Detection Test');
  
  // 다양한 감지 방법 테스트
  const methods = {
    'oauth_popup_mode flag': sessionStorage.getItem('oauth_popup_mode') === 'true',
    'oauth_window_type flag': sessionStorage.getItem('oauth_window_type') === 'popup',
    'oauth_force_account_selection flag': sessionStorage.getItem('oauth_force_account_selection') === 'true',
    'window.opener exists': !!window.opener,
    'window.parent !== window': window.parent !== window,
    'callback path': window.location.pathname.includes('/oauth/callback'),
    'small window size': window.innerWidth < 800 && window.innerHeight < 600
  };
  
  Object.entries(methods).forEach(([method, result]) => {
    console.log(`${result ? '✅' : '❌'} ${method}: ${result}`);
  });
  
  console.groupEnd();
}

// OAuth State Manager 테스트
function testStateManager() {
  console.group('🔐 OAuth State Manager Test');
  
  const urlParams = new URLSearchParams(window.location.search);
  const state = urlParams.get('state');
  
  if (state) {
    console.log('Testing state:', state.substring(0, 20) + '...');
    
    // 직접 state로 검색
    try {
      // 이 함수들이 전역으로 노출되어 있다고 가정
      if (typeof getOAuthFlow === 'function') {
        const flowState = getOAuthFlow(state);
        console.log('Direct state lookup:', flowState ? 'found' : 'not found');
        
        // _force_ pattern 테스트
        if (!flowState && state.includes('_force_')) {
          const originalState = state.split('_force_')[0];
          console.log('Trying original state:', originalState.substring(0, 20) + '...');
          const originalFlowState = getOAuthFlow(originalState);
          console.log('Original state lookup:', originalFlowState ? 'found' : 'not found');
          
          if (originalFlowState) {
            console.log('Original flow state details:', {
              flowId: originalFlowState.flowId,
              flowType: originalFlowState.flowType,
              forceAccountSelection: originalFlowState.forceAccountSelection
            });
          }
        }
        
        if (flowState) {
          console.log('Flow state details:', {
            flowId: flowState.flowId,
            flowType: flowState.flowType,
            status: flowState.status,
            forceAccountSelection: flowState.forceAccountSelection
          });
        }
      } else {
        console.log('⚠️ getOAuthFlow function not available globally');
      }
    } catch (e) {
      console.error('Error testing state manager:', e);
    }
  } else {
    console.log('❌ No state parameter in URL');
  }
  
  console.groupEnd();
}

// 통신 테스트
function testCommunication() {
  console.group('📡 Communication Test');
  
  if (window.opener) {
    console.log('Testing PostMessage to parent...');
    
    const testMessage = {
      type: 'OAUTH_TEST',
      timestamp: Date.now(),
      source: 'debug-script'
    };
    
    try {
      window.opener.postMessage(testMessage, '*');
      console.log('✅ PostMessage sent successfully');
    } catch (e) {
      console.error('❌ PostMessage failed:', e);
    }
  } else {
    console.log('❌ No window.opener available');
  }
  
  // SessionStorage 통신 테스트
  console.log('Testing SessionStorage communication...');
  const testKey = 'oauth_debug_test_' + Date.now();
  sessionStorage.setItem(testKey, JSON.stringify({
    type: 'test',
    timestamp: Date.now()
  }));
  console.log('✅ SessionStorage test data written:', testKey);
  
  console.groupEnd();
}

// 모든 테스트 실행
function runAllTests() {
  console.log('🧪 Running OAuth Callback Debug Tests...');
  logCurrentState();
  testPopupModeDetection();
  testStateManager();
  testCommunication();
  console.log('✅ All tests completed');
}

// 자동 실행
runAllTests();

// 전역 함수로 노출
window.oauthDebug = {
  runAllTests,
  logCurrentState,
  testPopupModeDetection,
  testStateManager,
  testCommunication
};

console.log('🔧 Debug functions available: window.oauthDebug.*');
console.log('📝 Available commands:');
console.log('  - oauthDebug.runAllTests()');
console.log('  - oauthDebug.logCurrentState()');
console.log('  - oauthDebug.testPopupModeDetection()');
console.log('  - oauthDebug.testStateManager()');
console.log('  - oauthDebug.testCommunication()');