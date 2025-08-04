/**
 * Enhanced Authentication State Types
 * Provides granular state management for better UX
 */

export type AuthInitState = 
  | 'idle'           // 초기 상태
  | 'hydrating'      // localStorage에서 복원 중
  | 'syncing'        // 서버와 동기화 중
  | 'silent_auth'    // Silent authentication 시도 중
  | 'ready'          // 인증 상태 확정 완료
  | 'error';         // 에러 상태

export interface AuthError {
  type: 'network' | 'token_expired' | 'server_error' | 'silent_auth_timeout' | 'unknown';
  message: string;
  recoverable: boolean;
  retryCount?: number;
}

export interface EnhancedAuthState {
  initState: AuthInitState;
  error: AuthError | null;
  lastSyncTime: number | null;
  retryCount: number;
}

// 사용자 친화적 메시지 매핑
export const AUTH_STATE_MESSAGES: Record<AuthInitState, string> = {
  idle: '초기화 중...',
  hydrating: '사용자 정보 복원 중...',
  syncing: '서버와 동기화 중...',
  silent_auth: '자동 로그인 시도 중...',
  ready: '준비 완료',
  error: '인증 오류 발생'
};

// 에러 타입별 사용자 메시지
export const ERROR_MESSAGES: Record<AuthError['type'], string> = {
  network: '네트워크 연결을 확인해주세요',
  token_expired: '로그인이 만료되었습니다. 다시 로그인해주세요',
  server_error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요',
  silent_auth_timeout: '자동 로그인 시간이 초과되었습니다',
  unknown: '알 수 없는 오류가 발생했습니다'
};