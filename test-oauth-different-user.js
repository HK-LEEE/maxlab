/**
 * OAuth "다른 사용자로 로그인" 기능 테스트
 * Claude Code 자동화 테스트 스크립트
 */

const puppeteer = require('puppeteer');

async function testOAuthDifferentUserLogin() {
  console.log('🧪 OAuth Different User Login Test Starting...');
  
  const browser = await puppeteer.launch({
    headless: false,
    devtools: true,
    args: [
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-popup-blocking',
      '--allow-running-insecure-content'
    ]
  });

  try {
    const page = await browser.newPage();
    
    // 콘솔 로그 캡처
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      if (text.includes('OAuth') || text.includes('🔥') || text.includes('✅') || text.includes('❌')) {
        console.log(`[BROWSER ${type.toUpperCase()}] ${text}`);
      }
    });

    // 네트워크 요청 모니터링
    page.on('request', request => {
      if (request.url().includes('oauth') || request.url().includes('callback')) {
        console.log(`🌐 REQUEST: ${request.method()} ${request.url()}`);
      }
    });

    console.log('🌐 Navigating to login page...');
    await page.goto('http://localhost:3010/login', { waitUntil: 'networkidle2' });

    // 페이지 로드 대기
    await page.waitForTimeout(2000);

    console.log('🔍 Looking for "다른 사용자로 로그인" button...');
    
    // "다른 사용자로 로그인" 버튼 찾기
    const differentUserButton = await page.$('button:has-text("다른 사용자로 로그인")') || 
                                await page.$('button[class*="border-blue-600"]:not([class*="bg-blue-600"])');
    
    if (!differentUserButton) {
      console.log('❌ "다른 사용자로 로그인" button not found, looking for alternative selectors...');
      
      // 대안 선택자들
      const buttons = await page.$$('button');
      for (let button of buttons) {
        const text = await page.evaluate(el => el.textContent, button);
        if (text.includes('다른 사용자') || text.includes('Shield')) {
          console.log(`✅ Found button with text: "${text}"`);
          break;
        }
      }
      
      throw new Error('Different user login button not found');
    }

    console.log('✅ Found "다른 사용자로 로그인" button');

    // 팝업 감지 준비
    const popupPromise = new Promise((resolve) => {
      page.once('popup', resolve);
    });

    console.log('🖱️ Clicking "다른 사용자로 로그인" button...');
    await differentUserButton.click();

    console.log('⏳ Waiting for OAuth popup...');
    const popup = await popupPromise;
    console.log('✅ OAuth popup opened:', popup.url());

    // 팝업에서 콘솔 로그 캡처
    popup.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      if (text.includes('OAuth') || text.includes('🔥') || text.includes('✅') || text.includes('❌')) {
        console.log(`[POPUP ${type.toUpperCase()}] ${text}`);
      }
    });

    // OAuth 인증 시뮬레이션 (실제 로그인은 수동으로 수행)
    console.log('🔐 Please complete OAuth authentication in the popup window...');
    console.log('⏳ Waiting for popup to close or show success...');

    // 팝업 상태 모니터링
    let popupClosed = false;
    let timeout = 0;
    const maxTimeout = 120000; // 2분

    while (!popupClosed && timeout < maxTimeout) {
      try {
        await popup.evaluate(() => document.title);
        
        // OAuth callback 페이지인지 확인
        const currentUrl = popup.url();
        if (currentUrl.includes('/oauth/callback')) {
          console.log('✅ OAuth callback page reached:', currentUrl);
          
          // 팝업이 자동으로 닫히는지 확인
          await page.waitForTimeout(5000);
          
          try {
            await popup.evaluate(() => document.title);
            console.log('⚠️ Popup is still open after 5 seconds');
          } catch (e) {
            console.log('✅ Popup closed automatically');
            popupClosed = true;
          }
        }
        
        await page.waitForTimeout(1000);
        timeout += 1000;
      } catch (e) {
        console.log('✅ Popup closed');
        popupClosed = true;
      }
    }

    if (timeout >= maxTimeout) {
      console.log('❌ Test timeout - popup did not close within 2 minutes');
    }

    // 메인 페이지 리디렉션 확인
    console.log('🔍 Checking main page redirect...');
    await page.waitForTimeout(2000);
    
    const currentUrl = page.url();
    console.log('📍 Current page URL:', currentUrl);
    
    if (currentUrl === 'http://localhost:3010/' || currentUrl === 'http://localhost:3010') {
      console.log('✅ Successfully redirected to main page');
    } else if (currentUrl.includes('/login')) {
      console.log('❌ Still on login page - authentication may have failed');
    } else {
      console.log('ℹ️ On different page:', currentUrl);
    }

    // SessionStorage 상태 확인
    const sessionStorageState = await page.evaluate(() => {
      const oauthKeys = Object.keys(sessionStorage).filter(key => key.includes('oauth'));
      return oauthKeys.map(key => ({
        key,
        value: sessionStorage.getItem(key)?.substring(0, 100) + '...'
      }));
    });
    
    console.log('💾 OAuth SessionStorage state:', sessionStorageState);

    console.log('✅ Test completed');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
}

// 테스트 실행
testOAuthDifferentUserLogin().catch(console.error);