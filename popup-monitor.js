// 팝업 창에서 실행할 모니터링 스크립트
// 팝업 창의 콘솔에서 실행하세요

console.log('📱 Popup OAuth Monitor Started');

// 현재 URL 상태 확인
setInterval(() => {
  const currentUrl = window.location.href;
  if (currentUrl.includes('/oauth/callback')) {
    console.log('✅ OAuth callback page reached:', currentUrl);
    
    // URL에서 코드와 state 추출
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    
    console.log('📋 OAuth Callback Parameters:', {
      code: code ? code.substring(0, 10) + '...' : 'null',
      state: state ? state.substring(0, 10) + '...' : 'null',
      fullState: state,
      isForceState: state?.includes('_force_')
    });
    
    // SessionStorage 상태 확인
    const oauthKeys = Object.keys(sessionStorage).filter(k => k.includes('oauth'));
    console.log('💾 Popup SessionStorage OAuth keys:', oauthKeys);
    
    // 부모 창과의 통신 상태 확인
    console.log('🔗 Popup Communication Status:', {
      hasOpener: !!window.opener,
      openerOrigin: window.opener ? 'available' : 'none',
      currentOrigin: window.location.origin
    });
  }
}, 1000);

// 팝업이 닫히기 전 마지막 상태 확인
window.addEventListener('beforeunload', () => {
  console.log('🚪 Popup closing...');
  const finalState = {
    url: window.location.href,
    oauthKeys: Object.keys(sessionStorage).filter(k => k.includes('oauth')),
    hasResult: !!sessionStorage.getItem('oauth_result')
  };
  console.log('📊 Final popup state:', finalState);
});