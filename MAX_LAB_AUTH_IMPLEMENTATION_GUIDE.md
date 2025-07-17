# MAX Lab 인증 시스템 구현 가이드
## 실제 구현된 OAuth 2.0 + JWT 토큰 관리 시스템

### 목차
1. [시스템 개요](#시스템-개요)
2. [프로젝트 구조](#프로젝트-구조)
3. [Frontend 구현](#frontend-구현)
4. [Backend 구현](#backend-구현)
5. [인증 플로우](#인증-플로우)
6. [보안 기능](#보안-기능)
7. [설정 및 배포](#설정-및-배포)

---

## 시스템 개요

MAX Lab에서 구현된 인증 시스템은 **외부 인증 서버(localhost:8000)**와 통합된 OAuth 2.0 기반 시스템입니다.

### **핵심 특징**
- **OAuth 2.0 + PKCE**: 보안 강화된 Authorization Code Flow
- **JWT 토큰 관리**: Access Token + Refresh Token 이중 구조
- **자동 토큰 갱신**: 백그라운드 토큰 리프레시
- **토큰 블랙리스팅**: Redis 기반 토큰 무효화
- **Silent SSO**: 자동 백그라운드 인증
- **팝업 OAuth**: 사용자 경험 최적화

### **시스템 아키텍처**
```
[Frontend React App] ←→ [Backend FastAPI] ←→ [External Auth Server:8000]
        ↓                      ↓
   [localStorage]         [Redis Cache]
   [Zustand Store]        [Session DB]
```

---

## 프로젝트 구조

### **Frontend 구조**
```
frontend/src/
├── services/
│   ├── authService.ts           # 메인 인증 서비스
│   ├── tokenRefreshManager.ts   # 토큰 자동 갱신 관리
│   ├── refreshTokenService.ts   # 리프레시 토큰 처리
│   └── popupOAuth.ts           # OAuth 팝업 구현
├── stores/
│   └── authStore.ts            # Zustand 인증 상태 관리
├── api/
│   └── client.ts               # API 클라이언트 (토큰 인터셉터)
├── hooks/
│   ├── useAuth.ts              # 인증 커스텀 훅
│   └── useTokenRefresh.ts      # 토큰 갱신 훅
├── components/
│   ├── auth/
│   │   ├── LoginButton.tsx     # 로그인 버튼
│   │   ├── LogoutButton.tsx    # 로그아웃 버튼
│   │   └── AuthGuard.tsx       # 인증 가드
│   └── layout/
│       └── Header.tsx          # 헤더 (로그인 상태 표시)
└── utils/
    ├── crypto.ts               # 암호화 유틸리티
    └── storage.ts              # 보안 스토리지
```

### **Backend 구조**
```
backend/app/
├── core/
│   └── security.py             # 인증/인가 핵심 로직
├── services/
│   ├── session_manager.py      # 세션 관리
│   ├── token_blacklist.py      # 토큰 블랙리스트
│   └── auth_proxy.py           # 외부 인증 서버 프록시
├── routers/
│   ├── auth.py                 # 인증 라우터
│   └── auth_logout.py          # 로그아웃 라우터
├── models/
│   ├── user.py                 # 사용자 모델
│   └── session.py              # 세션 모델
├── middleware/
│   ├── auth_middleware.py      # 인증 미들웨어
│   └── cors_middleware.py      # CORS 미들웨어
└── dependencies/
    └── auth_deps.py            # 인증 의존성
```

---

## Frontend 구현

### 1. 메인 인증 서비스

**파일: `frontend/src/services/authService.ts`**

```typescript
import { TokenRefreshManager } from './tokenRefreshManager';
import { RefreshTokenService } from './refreshTokenService';
import { PopupOAuth } from './popupOAuth';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  roles: string[];
  permissions: string[];
}

export interface TokenData {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export class AuthService {
  private tokenRefreshManager: TokenRefreshManager;
  private refreshTokenService: RefreshTokenService;
  private popupOAuth: PopupOAuth;
  
  constructor() {
    this.tokenRefreshManager = new TokenRefreshManager();
    this.refreshTokenService = new RefreshTokenService();
    this.popupOAuth = new PopupOAuth();
  }

  /**
   * 팝업을 통한 OAuth 로그인
   */
  async login(): Promise<User> {
    try {
      // 1. OAuth 팝업 열기
      const authResult = await this.popupOAuth.authenticate();
      
      // 2. 토큰 저장
      this.storeTokens(authResult.tokens);
      
      // 3. 사용자 정보 조회
      const user = await this.getCurrentUser();
      
      // 4. 자동 토큰 갱신 시작
      this.tokenRefreshManager.startAutoRefresh();
      
      return user;
    } catch (error) {
      console.error('Login failed:', error);
      throw new Error('로그인에 실패했습니다.');
    }
  }

  /**
   * Silent SSO 시도
   */
  async silentLogin(): Promise<User | null> {
    try {
      // 1. 기존 토큰 확인
      const accessToken = this.getAccessToken();
      if (accessToken && !this.isTokenExpired(accessToken)) {
        return await this.getCurrentUser();
      }

      // 2. 리프레시 토큰으로 갱신 시도
      const refreshToken = await this.refreshTokenService.getRefreshToken();
      if (refreshToken && await this.refreshTokenService.isValidRefreshToken(refreshToken)) {
        await this.refreshAccessToken();
        return await this.getCurrentUser();
      }

      // 3. Silent OAuth 시도
      const silentResult = await this.popupOAuth.silentAuthenticate();
      if (silentResult) {
        this.storeTokens(silentResult.tokens);
        this.tokenRefreshManager.startAutoRefresh();
        return await this.getCurrentUser();
      }

      return null;
    } catch (error) {
      console.warn('Silent login failed:', error);
      return null;
    }
  }

  /**
   * 토큰 갱신
   */
  async refreshAccessToken(): Promise<string> {
    const refreshToken = await this.refreshTokenService.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await fetch('/api/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const tokenData: TokenData = await response.json();
      this.storeTokens(tokenData);
      
      return tokenData.access_token;
    } catch (error) {
      // 갱신 실패 시 로그아웃
      await this.logout();
      throw error;
    }
  }

  /**
   * 현재 사용자 정보 조회
   */
  async getCurrentUser(): Promise<User> {
    const accessToken = this.getAccessToken();
    if (!accessToken) {
      throw new Error('No access token available');
    }

    const response = await fetch('/api/oauth/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get user info');
    }

    return response.json();
  }

  /**
   * 로그아웃
   */
  async logout(): Promise<void> {
    try {
      // 1. 서버에 로그아웃 요청
      const refreshToken = await this.refreshTokenService.getRefreshToken();
      if (refreshToken) {
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.getAccessToken()}`,
          },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      }
    } catch (error) {
      console.warn('Server logout failed:', error);
    } finally {
      // 2. 로컬 데이터 정리
      this.clearTokens();
      this.tokenRefreshManager.stopAutoRefresh();
      
      // 3. 스토어 초기화
      const { clearAuth } = await import('../stores/authStore');
      clearAuth();
    }
  }

  /**
   * 토큰 저장
   */
  private storeTokens(tokenData: TokenData): void {
    // Access Token을 localStorage에 저장
    const expiresAt = Date.now() + (tokenData.expires_in * 1000);
    localStorage.setItem('access_token', tokenData.access_token);
    localStorage.setItem('token_expires_at', expiresAt.toString());
    localStorage.setItem('token_type', tokenData.token_type);

    // Refresh Token을 암호화하여 저장
    this.refreshTokenService.storeRefreshToken(tokenData.refresh_token);
  }

  /**
   * Access Token 조회
   */
  getAccessToken(): string | null {
    const token = localStorage.getItem('access_token');
    const expiresAt = localStorage.getItem('token_expires_at');
    
    if (!token || !expiresAt) return null;
    
    // 만료 확인 (5분 여유)
    if (Date.now() >= (parseInt(expiresAt) - 5 * 60 * 1000)) {
      return null;
    }
    
    return token;
  }

  /**
   * 토큰 만료 확인
   */
  private isTokenExpired(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return Date.now() >= (payload.exp * 1000);
    } catch {
      return true;
    }
  }

  /**
   * 토큰 정리
   */
  private clearTokens(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('token_expires_at');
    localStorage.removeItem('token_type');
    this.refreshTokenService.clearRefreshToken();
  }

  /**
   * 인증 상태 확인
   */
  isAuthenticated(): boolean {
    return !!this.getAccessToken();
  }
}

// 싱글톤 인스턴스
export const authService = new AuthService();
```

### 2. 토큰 자동 갱신 관리자

**파일: `frontend/src/services/tokenRefreshManager.ts`**

```typescript
export class TokenRefreshManager {
  private refreshTimer: NodeJS.Timeout | null = null;
  private isRefreshing = false;
  private refreshPromise: Promise<string> | null = null;

  /**
   * 자동 토큰 갱신 시작
   */
  startAutoRefresh(): void {
    this.scheduleNextRefresh();
  }

  /**
   * 자동 토큰 갱신 중지
   */
  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.isRefreshing = false;
    this.refreshPromise = null;
  }

  /**
   * 토큰 갱신 (중복 요청 방지)
   */
  async refreshToken(): Promise<string> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.performRefresh();
    
    try {
      const token = await this.refreshPromise;
      return token;
    } finally {
      this.refreshPromise = null;
    }
  }

  /**
   * 실제 토큰 갱신 수행
   */
  private async performRefresh(): Promise<string> {
    const { authService } = await import('./authService');
    
    try {
      this.isRefreshing = true;
      const newToken = await authService.refreshAccessToken();
      
      // 다음 갱신 스케줄링
      this.scheduleNextRefresh();
      
      return newToken;
    } catch (error) {
      console.error('Token refresh failed:', error);
      throw error;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * 다음 갱신 시간 스케줄링
   */
  private scheduleNextRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    const expiresAt = localStorage.getItem('token_expires_at');
    if (!expiresAt) return;

    // 만료 5분 전에 갱신
    const refreshTime = parseInt(expiresAt) - Date.now() - (5 * 60 * 1000);
    
    if (refreshTime > 0) {
      this.refreshTimer = setTimeout(() => {
        this.refreshToken().catch(console.error);
      }, refreshTime);
    }
  }

  /**
   * 갱신 중인지 확인
   */
  isRefreshInProgress(): boolean {
    return this.isRefreshing;
  }
}
```

### 3. Refresh Token 서비스

**파일: `frontend/src/services/refreshTokenService.ts`**

```typescript
import { encrypt, decrypt } from '../utils/crypto';

export class RefreshTokenService {
  private readonly REFRESH_TOKEN_KEY = 'refresh_token_encrypted';
  private readonly REFRESH_TOKEN_PLAIN_KEY = 'refresh_token'; // 암호화 실패 시 대체

  /**
   * Refresh Token 저장 (암호화)
   */
  async storeRefreshToken(refreshToken: string): Promise<void> {
    try {
      // 암호화 시도
      const encryptedToken = await encrypt(refreshToken);
      localStorage.setItem(this.REFRESH_TOKEN_KEY, encryptedToken);
      
      // 평문 버전 제거
      localStorage.removeItem(this.REFRESH_TOKEN_PLAIN_KEY);
    } catch (error) {
      console.warn('Token encryption failed, storing as plaintext:', error);
      // 암호화 실패 시 평문으로 저장
      localStorage.setItem(this.REFRESH_TOKEN_PLAIN_KEY, refreshToken);
    }
  }

  /**
   * Refresh Token 조회 (복호화)
   */
  async getRefreshToken(): Promise<string | null> {
    try {
      // 암호화된 토큰 시도
      const encryptedToken = localStorage.getItem(this.REFRESH_TOKEN_KEY);
      if (encryptedToken) {
        return await decrypt(encryptedToken);
      }

      // 평문 토큰 대체
      const plainToken = localStorage.getItem(this.REFRESH_TOKEN_PLAIN_KEY);
      if (plainToken) {
        // 암호화하여 다시 저장
        await this.storeRefreshToken(plainToken);
        localStorage.removeItem(this.REFRESH_TOKEN_PLAIN_KEY);
        return plainToken;
      }

      return null;
    } catch (error) {
      console.error('Failed to decrypt refresh token:', error);
      return null;
    }
  }

  /**
   * Refresh Token 유효성 검사
   */
  async isValidRefreshToken(refreshToken: string): Promise<boolean> {
    try {
      const response = await fetch('/api/oauth/token/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      return response.ok;
    } catch (error) {
      console.error('Refresh token validation failed:', error);
      return false;
    }
  }

  /**
   * Refresh Token 정리
   */
  clearRefreshToken(): void {
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_PLAIN_KEY);
  }

  /**
   * 토큰 회전 (서버에서 새 토큰 받았을 때)
   */
  async rotateRefreshToken(oldToken: string, newToken: string): Promise<void> {
    // 이전 토큰 블랙리스트 요청
    try {
      await fetch('/api/oauth/token/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: oldToken }),
      });
    } catch (error) {
      console.warn('Failed to revoke old refresh token:', error);
    }

    // 새 토큰 저장
    await this.storeRefreshToken(newToken);
  }
}
```

### 4. OAuth 팝업 구현

**파일: `frontend/src/services/popupOAuth.ts`**

```typescript
import { generatePKCEChallenge, generateRandomState } from '../utils/crypto';

export interface AuthResult {
  tokens: {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
  };
  user: any;
}

export class PopupOAuth {
  private readonly AUTH_URL = '/api/oauth/authorize';
  private readonly TOKEN_URL = '/api/oauth/token';
  private readonly POPUP_WIDTH = 500;
  private readonly POPUP_HEIGHT = 600;

  /**
   * 팝업을 통한 OAuth 인증
   */
  async authenticate(): Promise<AuthResult> {
    // 1. PKCE 챌린지 생성
    const { codeVerifier, codeChallenge } = await generatePKCEChallenge();
    const state = generateRandomState();

    // 2. 인증 URL 생성
    const authUrl = this.buildAuthUrl(codeChallenge, state);

    // 3. 팝업 열기
    const popup = this.openPopup(authUrl);

    try {
      // 4. 인증 코드 받기
      const authCode = await this.waitForAuthCode(popup, state);

      // 5. 토큰 교환
      const tokens = await this.exchangeCodeForTokens(authCode, codeVerifier);

      return { tokens, user: null };
    } finally {
      popup?.close();
    }
  }

  /**
   * Silent OAuth 인증 시도
   */
  async silentAuthenticate(): Promise<AuthResult | null> {
    try {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = `${this.AUTH_URL}?prompt=none&response_type=code`;
      
      document.body.appendChild(iframe);

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          document.body.removeChild(iframe);
          resolve(null);
        }, 5000);

        iframe.onload = () => {
          clearTimeout(timeout);
          document.body.removeChild(iframe);
          resolve(null);
        };
      });
    } catch (error) {
      console.warn('Silent authentication failed:', error);
      return null;
    }
  }

  /**
   * 인증 URL 생성
   */
  private buildAuthUrl(codeChallenge: string, state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: 'maxlab-frontend',
      redirect_uri: `${window.location.origin}/auth/callback`,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: state,
      scope: 'openid profile email',
    });

    return `${this.AUTH_URL}?${params.toString()}`;
  }

  /**
   * 팝업 창 열기
   */
  private openPopup(url: string): Window | null {
    const left = window.screenX + (window.outerWidth - this.POPUP_WIDTH) / 2;
    const top = window.screenY + (window.outerHeight - this.POPUP_HEIGHT) / 2;

    const popup = window.open(
      url,
      'oauth_popup',
      `width=${this.POPUP_WIDTH},height=${this.POPUP_HEIGHT},left=${left},top=${top},scrollbars=yes,resizable=yes`
    );

    return popup;
  }

  /**
   * 인증 코드 대기
   */
  private async waitForAuthCode(popup: Window | null, expectedState: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!popup) {
        reject(new Error('Failed to open popup'));
        return;
      }

      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          reject(new Error('Authentication cancelled'));
        }
      }, 1000);

      const messageHandler = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;

        if (event.data?.type === 'OAUTH_SUCCESS') {
          clearInterval(checkClosed);
          window.removeEventListener('message', messageHandler);

          const { code, state } = event.data;

          // State 검증
          if (state !== expectedState) {
            reject(new Error('Invalid state parameter'));
            return;
          }

          resolve(code);
        } else if (event.data?.type === 'OAUTH_ERROR') {
          clearInterval(checkClosed);
          window.removeEventListener('message', messageHandler);
          reject(new Error(event.data.error || 'Authentication failed'));
        }
      };

      window.addEventListener('message', messageHandler);
    });
  }

  /**
   * 인증 코드를 토큰으로 교환
   */
  private async exchangeCodeForTokens(code: string, codeVerifier: string): Promise<any> {
    const response = await fetch(this.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: `${window.location.origin}/auth/callback`,
        code_verifier: codeVerifier,
        client_id: 'maxlab-frontend',
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to exchange code for tokens');
    }

    return response.json();
  }
}
```

### 5. Zustand 인증 스토어

**파일: `frontend/src/stores/authStore.ts`**

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '../services/authService';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  lastActivity: number;
}

interface AuthActions {
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  updateLastActivity: () => void;
  clearAuth: () => void;
  checkAdminRole: () => boolean;
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // State
      user: null,
      isAuthenticated: false,
      isLoading: true,
      lastActivity: Date.now(),

      // Actions
      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
          isLoading: false,
        }),

      setLoading: (loading) => set({ isLoading: loading }),

      updateLastActivity: () => set({ lastActivity: Date.now() }),

      clearAuth: () =>
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          lastActivity: Date.now(),
        }),

      checkAdminRole: () => {
        const { user } = get();
        return user?.roles?.includes('admin') || false;
      },
    }),
    {
      name: 'auth-store',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        lastActivity: state.lastActivity,
      }),
    }
  )
);

// 편의 함수들
export const { setUser, setLoading, updateLastActivity, clearAuth } = useAuthStore.getState();
```

### 6. API 클라이언트 (토큰 인터셉터)

**파일: `frontend/src/api/client.ts`**

```typescript
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { authService } from '../services/authService';
import { useAuthStore } from '../stores/authStore';

class ApiClient {
  private apiClient: AxiosInstance;
  private authClient: AxiosInstance;
  private isRefreshing = false;
  private failedQueue: Array<{
    resolve: (token: string) => void;
    reject: (error: any) => void;
  }> = [];

  constructor() {
    // API 클라이언트 (토큰 자동 주입)
    this.apiClient = axios.create({
      baseURL: '/api',
      timeout: 30000,
    });

    // 인증 클라이언트 (토큰 없이)
    this.authClient = axios.create({
      baseURL: '/api',
      timeout: 30000,
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // API 클라이언트 인터셉터
    this.setupApiInterceptors();
    
    // 인증 클라이언트는 인터셉터 없음 (무한 루프 방지)
  }

  private setupApiInterceptors(): void {
    // 요청 인터셉터 - 토큰 자동 주입
    this.apiClient.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        // 활동 시간 업데이트
        useAuthStore.getState().updateLastActivity();

        // 토큰 주입
        const token = authService.getAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // CSRF 토큰 주입
        const csrfToken = this.getCSRFToken();
        if (csrfToken) {
          config.headers['X-CSRF-Token'] = csrfToken;
        }

        return config;
      },
      (error) => Promise.reject(error)
    );

    // 응답 인터셉터 - 토큰 갱신
    this.apiClient.interceptors.response.use(
      (response: AxiosResponse) => response,
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          if (this.isRefreshing) {
            // 이미 갱신 중이면 대기열에 추가
            return this.addToQueue(originalRequest);
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            // 토큰 갱신 시도
            const newToken = await authService.refreshAccessToken();
            
            // 대기 중인 요청들 재시도
            this.processQueue(null, newToken);
            
            // 원래 요청 재시도
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return this.apiClient(originalRequest);
          } catch (refreshError) {
            // 갱신 실패 시 로그아웃
            this.processQueue(refreshError, null);
            await authService.logout();
            
            // 로그인 페이지로 리다이렉트
            if (typeof window !== 'undefined') {
              window.location.href = '/login';
            }
            
            return Promise.reject(refreshError);
          } finally {
            this.isRefreshing = false;
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private addToQueue(originalRequest: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.failedQueue.push({
        resolve: (token: string) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          resolve(this.apiClient(originalRequest));
        },
        reject: (error: any) => {
          reject(error);
        },
      });
    });
  }

  private processQueue(error: any, token: string | null): void {
    this.failedQueue.forEach(({ resolve, reject }) => {
      if (error) {
        reject(error);
      } else {
        resolve(token!);
      }
    });

    this.failedQueue = [];
  }

  private getCSRFToken(): string | null {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || null;
  }

  // API 메서드들
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.apiClient.get(url, config);
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.apiClient.post(url, data, config);
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.apiClient.put(url, data, config);
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.apiClient.delete(url, config);
  }

  // 인증 요청용 (토큰 없이)
  async authRequest<T = any>(method: string, url: string, data?: any): Promise<AxiosResponse<T>> {
    return this.authClient.request({
      method,
      url,
      data,
    });
  }
}

// 싱글톤 인스턴스
export const apiClient = new ApiClient();
```

### 7. 암호화 유틸리티

**파일: `frontend/src/utils/crypto.ts`**

```typescript
/**
 * Web Crypto API를 사용한 암호화/복호화
 */

// 암호화 키 생성 또는 가져오기
async function getEncryptionKey(): Promise<CryptoKey> {
  const keyData = localStorage.getItem('encryption_key');
  
  if (keyData) {
    // 기존 키 가져오기
    const keyBuffer = new Uint8Array(JSON.parse(keyData));
    return await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  } else {
    // 새 키 생성
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    
    // 키 저장
    const keyBuffer = await crypto.subtle.exportKey('raw', key);
    localStorage.setItem('encryption_key', JSON.stringify(Array.from(new Uint8Array(keyBuffer))));
    
    return key;
  }
}

/**
 * 텍스트 암호화
 */
export async function encrypt(text: string): Promise<string> {
  try {
    const key = await getEncryptionKey();
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    
    // 랜덤 IV 생성
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // 암호화
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    
    // IV + 암호화된 데이터 결합
    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encrypted), iv.length);
    
    // Base64 인코딩
    return btoa(String.fromCharCode(...result));
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * 텍스트 복호화
 */
export async function decrypt(encryptedText: string): Promise<string> {
  try {
    const key = await getEncryptionKey();
    
    // Base64 디코딩
    const data = new Uint8Array(
      atob(encryptedText)
        .split('')
        .map(char => char.charCodeAt(0))
    );
    
    // IV와 암호화된 데이터 분리
    const iv = data.slice(0, 12);
    const encrypted = data.slice(12);
    
    // 복호화
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );
    
    // 텍스트로 변환
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * PKCE Code Verifier와 Challenge 생성
 */
export async function generatePKCEChallenge(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
}> {
  // Code Verifier 생성 (43-128자의 URL-safe 문자열)
  const codeVerifier = generateRandomString(128);
  
  // Code Challenge 생성 (SHA256 해시)
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  
  // Base64 URL-safe 인코딩
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return { codeVerifier, codeChallenge };
}

/**
 * 랜덤 문자열 생성
 */
export function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomValues = crypto.getRandomValues(new Uint8Array(length));
  
  return Array.from(randomValues)
    .map(value => chars[value % chars.length])
    .join('');
}

/**
 * 랜덤 State 생성 (CSRF 보호용)
 */
export function generateRandomState(): string {
  return generateRandomString(32);
}
```

---

(계속해서 Backend 구현 부분을 작성하겠습니다...)