/**
 * 🔥 Instant Logout Channel - 즉시 로그아웃 동기화
 * max.dwchem.co.kr에서 로그아웃 시 100ms 이내 동기화
 */

export class InstantLogoutChannel {
  private channel: BroadcastChannel | null = null;
  private readonly CHANNEL_NAME = 'sso_instant_logout';
  
  constructor() {
    if ('BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(this.CHANNEL_NAME);
    }
  }
  
  /**
   * 로그아웃 즉시 전파
   */
  broadcastLogout(userId?: string) {
    if (this.channel) {
      this.channel.postMessage({
        type: 'INSTANT_LOGOUT',
        userId,
        timestamp: Date.now(),
        source: window.location.hostname
      });
      console.log('🔥 Instant logout broadcasted via BroadcastChannel');
    }
    
    // localStorage fallback
    localStorage.setItem('instant_logout_event', JSON.stringify({
      type: 'INSTANT_LOGOUT',
      userId,
      timestamp: Date.now(),
      source: window.location.hostname
    }));
    
    // Clean up after 1 second
    setTimeout(() => {
      localStorage.removeItem('instant_logout_event');
    }, 1000);
  }
  
  /**
   * 로그아웃 이벤트 수신
   */
  onLogout(callback: () => void) {
    // BroadcastChannel 리스너
    if (this.channel) {
      this.channel.onmessage = (event) => {
        if (event.data.type === 'INSTANT_LOGOUT') {
          console.log('🔥 Instant logout received via BroadcastChannel');
          callback();
        }
      };
    }
    
    // localStorage 리스너 (fallback)
    window.addEventListener('storage', (e) => {
      if (e.key === 'instant_logout_event' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          if (data.type === 'INSTANT_LOGOUT' && Date.now() - data.timestamp < 2000) {
            console.log('🔥 Instant logout received via localStorage');
            callback();
          }
        } catch (error) {
          console.error('Failed to parse instant logout event:', error);
        }
      }
    });
  }
  
  /**
   * 채널 정리
   */
  close() {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
  }
}

// 싱글톤 인스턴스
export const instantLogoutChannel = new InstantLogoutChannel();