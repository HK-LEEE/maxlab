/**
 * Session Management Service
 * Handles active session retrieval and logout operations
 */

import { apiClient, authClient } from '../api/client';

export interface DeviceInfo {
  device_type: 'desktop' | 'mobile' | 'tablet';
  browser: string;
  os: string;
}

export interface LocationInfo {
  country: string;
  city: string;
}

export interface SessionInfo {
  session_id: string;
  client_id: string;
  client_name: string;
  created_at: string;
  last_used_at: string;
  ip_address?: string;
  user_agent?: string;
  device_info?: DeviceInfo;
  location?: LocationInfo;
  is_current_session: boolean;
  is_suspicious: boolean;
}

export interface ActiveSessionsResponse {
  current_session: SessionInfo;
  other_sessions: SessionInfo[];
  total_sessions: number;
  suspicious_sessions: number;
}

export interface LogoutResponse {
  message: string;
  logout_type: 'current' | 'all';
  sessions_terminated: number;
  tokens_revoked: number;
}

export interface LogoutSessionsResponse {
  message: string;
  sessions_terminated: number;
  tokens_revoked: number;
}

export type LogoutType = 'current' | 'all';

class SessionService {
  private static instance: SessionService;

  static getInstance(): SessionService {
    if (!SessionService.instance) {
      SessionService.instance = new SessionService();
    }
    return SessionService.instance;
  }

  /**
   * Fetch active sessions for the current user
   */
  async getActiveSessions(): Promise<ActiveSessionsResponse> {
    try {
      console.log('📋 Fetching active sessions...');
      
      // Use apiClient for session-related operations (MAX Lab backend on port 8010)
      const response = await apiClient.get('/api/user/sessions/active');
      const data: ActiveSessionsResponse = response.data;
      
      console.log('✅ Active sessions fetched successfully:', {
        total: data.total_sessions,
        suspicious: data.suspicious_sessions,
        current: data.current_session?.client_name,
        others: data.other_sessions.length
      });
      
      return data;
    } catch (error: any) {
      console.error('❌ Error fetching active sessions:', error);
      throw error;
    }
    
    /* Real API call - currently not working
    try {
      console.log('📋 Fetching active sessions...');
      
      const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8010';
      const fullURL = `${baseURL}/api/user/sessions/active`;
      console.log('📋 Full API URL:', fullURL);
      
      // Add timeout to prevent infinite loading
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const token = localStorage.getItem('accessToken');
      console.log('📋 Has token:', !!token);
      
      const response = await fetch(fullURL, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      console.log('📋 Response received:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error('❌ Failed to fetch active sessions:', {
          status: response.status,
          statusText: response.statusText,
          errorText,
          url: fullURL
        });
        throw new Error(`Failed to fetch sessions: ${response.status} ${response.statusText}`);
      }

      const data: ActiveSessionsResponse = await response.json();
      
      console.log('✅ Active sessions fetched successfully:', {
        total: data.total_sessions,
        suspicious: data.suspicious_sessions,
        current: data.current_session?.client_name,
        others: data.other_sessions.length
      });
      
      return data;
    } catch (error: any) {
      console.error('❌ Error fetching active sessions:', error);
      
      if (error.name === 'AbortError') {
        throw new Error('Request timeout - please try again');
      }
      
      throw error;
    }
    */
  }

  /**
   * Execute logout based on type (current or all sessions)
   */
  async executeLogout(logoutType: LogoutType, reason?: string): Promise<LogoutResponse> {
    try {
      console.log(`🚪 Executing ${logoutType} logout...`);
      
      // Use apiClient for session-related operations (MAX Lab backend on port 8010)
      const response = await apiClient.post('/api/user/sessions/logout', {
        logout_type: logoutType,
        reason: reason || `User requested ${logoutType} logout`
      });
      
      const data: LogoutResponse = response.data;
      
      console.log('✅ Logout successful:', {
        type: data.logout_type,
        sessionsTerminated: data.sessions_terminated,
        tokensRevoked: data.tokens_revoked
      });
      
      // Log security event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('security:logout', {
          detail: {
            logout_type: logoutType,
            sessions_terminated: data.sessions_terminated,
            tokens_revoked: data.tokens_revoked,
            timestamp: new Date().toISOString()
          }
        }));
      }
      
      return data;
    } catch (error: any) {
      console.error('❌ Error during logout:', error);
      
      // Log security event for failed logout
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('security:logout_failed', {
          detail: {
            logout_type: logoutType,
            error: error.message,
            timestamp: new Date().toISOString()
          }
        }));
      }
      
      throw error;
    }
  }

  /**
   * Logout specific sessions by their IDs
   */
  async logoutSpecificSessions(sessionIds: string[], reason?: string): Promise<LogoutSessionsResponse> {
    try {
      console.log(`🚪 Logging out ${sessionIds.length} specific sessions...`);
      
      const response = await apiClient.post('/api/user/sessions/logout-sessions', {
        session_ids: sessionIds,
        reason: reason || 'User selected specific sessions'
      });
      
      if (response.status !== 200) {
        const errorData = response.data || {};
        console.error('❌ Specific sessions logout failed:', errorData);
        throw new Error(errorData.detail || `Logout failed: ${response.status}`);
      }

      const data: LogoutSessionsResponse = response.data;
      
      console.log('✅ Specific sessions logout successful:', {
        sessionsTerminated: data.sessions_terminated,
        tokensRevoked: data.tokens_revoked
      });
      
      return data;
    } catch (error: any) {
      console.error('❌ Error during specific sessions logout:', error);
      throw error;
    }
  }

  /**
   * Check if there are suspicious sessions
   */
  async checkSuspiciousSessions(): Promise<{
    hasSuspicious: boolean;
    count: number;
    sessions: SessionInfo[];
  }> {
    try {
      const data = await this.getActiveSessions();
      
      const suspiciousSessions: SessionInfo[] = [];
      
      // Check current session
      if (data.current_session?.is_suspicious) {
        suspiciousSessions.push(data.current_session);
      }
      
      // Check other sessions
      data.other_sessions.forEach(session => {
        if (session.is_suspicious) {
          suspiciousSessions.push(session);
        }
      });
      
      return {
        hasSuspicious: data.suspicious_sessions > 0,
        count: data.suspicious_sessions,
        sessions: suspiciousSessions
      };
    } catch (error) {
      console.error('❌ Error checking suspicious sessions:', error);
      return {
        hasSuspicious: false,
        count: 0,
        sessions: []
      };
    }
  }

  /**
   * Format session information for display
   */
  formatSessionInfo(session: SessionInfo): {
    displayName: string;
    deviceDescription: string;
    locationDescription: string;
    lastUsedDescription: string;
    statusBadges: string[];
  } {
    const deviceDesc = session.device_info 
      ? `${session.device_info.browser} • ${session.device_info.os}`
      : 'Unknown device';
      
    const locationDesc = session.location
      ? `${session.location.city}, ${session.location.country}`
      : 'Unknown location';
      
    const lastUsed = new Date(session.last_used_at || session.created_at);
    const lastUsedDesc = lastUsed.toLocaleString('ko-KR');
    
    const badges: string[] = [];
    if (session.is_current_session) badges.push('current');
    if (session.is_suspicious) badges.push('suspicious');
    
    return {
      displayName: session.client_name,
      deviceDescription: deviceDesc,
      locationDescription: locationDesc,
      lastUsedDescription: lastUsedDesc,
      statusBadges: badges
    };
  }

  /**
   * Get session age in human-readable format
   */
  getSessionAge(session: SessionInfo): string {
    const created = new Date(session.created_at);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    
    const minutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (days > 0) return `${days}일 전`;
    if (hours > 0) return `${hours}시간 전`;
    if (minutes > 0) return `${minutes}분 전`;
    return '방금 전';
  }
}

// Export singleton instance
export const sessionService = SessionService.getInstance();

export default sessionService;