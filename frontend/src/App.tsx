import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './stores/authStore';
import { authService } from './services/authService';
import { useAuthRefresh } from './hooks/useAuthRefresh';
import { Login } from './pages/Login';
import { OAuthCallback } from './pages/OAuthCallback';
import { Dashboard } from './pages/Dashboard';
import { QueryDetail } from './pages/QueryDetail';
import { WorkspaceManagement } from './pages/admin/WorkspaceManagement';
import { UserManagement } from './pages/admin/UserManagement';
import { PersonalTestWorkspace } from './pages/PersonalTestWorkspace';
import { ProcessFlowEditor } from './workspaces/personal_test/pages/ProcessFlowEditor';
import { ProcessFlowMonitor } from './workspaces/personal_test/pages/ProcessFlowMonitor';
import { ProcessFlowPublish } from './workspaces/personal_test/pages/ProcessFlowPublish';
import { PublicProcessFlowMonitor } from './workspaces/personal_test/pages/PublicProcessFlowMonitor';
import { Profile } from './pages/Profile';
import { TokenExpiryNotification, TokenStatusDebug } from './components/TokenExpiryNotification';
import TokenRefreshTester from './components/TokenRefreshTester';
import { registerGlobalTokenTestHelpers } from './utils/tokenTestUtils';
import { registerOAuthTestHelpers } from './utils/oauthServerTest';
import { registerSessionTestHelpers } from './utils/sessionPersistenceTest';
import { registerTokenRotationTestHelpers } from './utils/tokenRotationTest';
import { registerEncryptionTestHelpers } from './utils/encryptionTestUtils';
import { registerSecurityEventTestHelpers } from './utils/securityEventTestUtils';
import { registerTokenFlowTestHelpers } from './utils/tokenFlowAutomatedTest';
import './styles/index.css';

console.log('App.tsx loaded');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.is_admin || user?.role === 'admin';
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};

const AuthRefreshProvider: React.FC = () => {
  useAuthRefresh();
  return null;
};

function App() {
  console.log('App component rendering');
  const [isInitializing, setIsInitializing] = useState(true);
  const setAuth = useAuthStore((state) => state.setAuth);
  const logout = useAuthStore((state) => state.logout);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  
  // 통합 인증 상태 관리 및 리다이렉트 시스템
  useEffect(() => {
    const handleAutoLogout = (event: CustomEvent) => {
      console.log('🔓 Auto logout triggered:', event.detail);
      
      const currentPath = window.location.pathname;
      const currentSearch = window.location.search;
      const isPublicPage = currentPath.startsWith('/public/flow/');
      const isLoginPage = currentPath === '/login';
      const isOAuthCallback = currentPath === '/oauth/callback';
      
      // 이미 로그인 페이지나 OAuth 콜백 페이지에 있으면 추가 처리 불요
      if (isLoginPage || isOAuthCallback) {
        console.log('Already on auth page, skipping redirect');
        logout();
        return;
      }
      
      logout();
      
      // Public 페이지가 아닌 경우에만 로그인 페이지로 리다이렉트
      if (!isPublicPage) {
        console.log('Session expired, redirecting to login...');
        // 현재 페이지를 기억해서 로그인 후 돌아올 수 있도록
        const returnUrl = encodeURIComponent(currentPath + currentSearch);
        window.location.href = `/login?return=${returnUrl}`;
      } else {
        console.log('Session expired on public page, staying on current page...');
      }
    };

    // 토큰 만료 경고 이벤트 리스너
    const handleTokenExpiring = (event: CustomEvent) => {
      console.log('⚠️ Token expiring soon:', event.detail);
      
      // 사용자에게 세션 만료 임박 알림
      const timeToExpiry = event.detail.timeToExpiry;
      const message = event.detail.message || 'Your session will expire soon. Please save your work.';
      
      // 커스텀 이벤트로 UI 컴포넌트에 알림 전달
      window.dispatchEvent(new CustomEvent('ui:show_expiry_warning', {
        detail: { timeToExpiry, message }
      }));
    };

    // Refresh Token 만료 임박 이벤트 리스너
    const handleRefreshTokenExpiring = (event: CustomEvent) => {
      console.log('⚠️ Refresh token expiring soon:', event.detail);
      
      const timeToExpiry = event.detail.timeToExpiry;
      const message = event.detail.message || 'Your session will expire soon. Please log in again to maintain access.';
      
      // 중요한 경고이므로 더 강한 알림
      window.dispatchEvent(new CustomEvent('ui:show_critical_warning', {
        detail: { timeToExpiry, message, action: 'login' }
      }));
    };

    // 네트워크 오류로 인한 토큰 갱신 실패 이벤트 리스너
    const handleTokenRefreshNetworkError = (event: CustomEvent) => {
      console.log('🌐 Token refresh network error:', event.detail);
      
      // 네트워크 오류는 일시적일 수 있으므로 즉시 로그아웃하지 않음
      window.dispatchEvent(new CustomEvent('ui:show_network_warning', {
        detail: { 
          message: 'Connection issues detected. Your session may expire if the problem persists.',
          canRetry: true
        }
      }));
    };

    // 이벤트 리스너 등록
    window.addEventListener('auth:logout', handleAutoLogout as EventListener);
    window.addEventListener('auth:token_expiring', handleTokenExpiring as EventListener);
    window.addEventListener('auth:refresh_token_expiring', handleRefreshTokenExpiring as EventListener);
    window.addEventListener('auth:network_error', handleTokenRefreshNetworkError as EventListener);
    
    return () => {
      window.removeEventListener('auth:logout', handleAutoLogout as EventListener);
      window.removeEventListener('auth:token_expiring', handleTokenExpiring as EventListener);
      window.removeEventListener('auth:refresh_token_expiring', handleRefreshTokenExpiring as EventListener);
      window.removeEventListener('auth:network_error', handleTokenRefreshNetworkError as EventListener);
    };
  }, [logout]);
  
  // 개발 환경에서 토큰 테스트 헬퍼 등록
  useEffect(() => {
    registerGlobalTokenTestHelpers();
    registerOAuthTestHelpers();
    registerSessionTestHelpers();
    registerTokenRotationTestHelpers();
    registerEncryptionTestHelpers();
    registerSecurityEventTestHelpers();
    registerTokenFlowTestHelpers();
  }, []);
  
  // App 시작 시 자동 Silent 로그인 시도
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // 이미 인증된 상태라면 skip
        if (isAuthenticated) {
          setIsInitializing(false);
          return;
        }
        
        console.log('🔄 Initializing app authentication...');
        
        // Silent 로그인 시도
        const result = await authService.attemptSilentLogin();
        
        if (result.success && result.user) {
          const token = localStorage.getItem('accessToken') || '';
          setAuth(token, result.user);
          console.log('✅ App initialized with silent login');
        } else {
          console.log('ℹ️ Silent login not available, user needs to login manually');
        }
      } catch (error) {
        console.log('⚠️ Silent login failed during app initialization:', error);
      } finally {
        setIsInitializing(false);
      }
    };

    initializeAuth();
  }, [setAuth, isAuthenticated]);
  
  // 초기화 중 로딩 화면
  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center max-w-md w-full mx-4">
          <div className="flex justify-center mb-6">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          </div>
          
          <div className="flex flex-col items-center mb-4">
            <div className="w-16 h-16 bg-gray-900 rounded-xl flex items-center justify-center mb-4">
              <span className="text-white font-bold text-2xl">ML</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">MAX Lab</h1>
            <p className="text-gray-500 text-sm mt-1">Manufacturing AI & DX Platform</p>
          </div>
          
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            시스템 초기화 중
          </h2>
          <p className="text-gray-600 text-sm">
            인증 상태를 확인하고 있습니다...
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <AuthRefreshProvider />
        <TokenExpiryNotification />
        <TokenStatusDebug />
        <TokenRefreshTester />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/oauth/callback" element={<OAuthCallback />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/workspace/:workspaceId/query/:queryId"
            element={
              <PrivateRoute>
                <QueryDetail />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/workspaces"
            element={
              <AdminRoute>
                <WorkspaceManagement />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <AdminRoute>
                <UserManagement />
              </AdminRoute>
            }
          />
          <Route
            path="/workspaces/personal_test"
            element={
              <PrivateRoute>
                <PersonalTestWorkspace />
              </PrivateRoute>
            }
          />
          <Route
            path="/workspaces/personal_test/process-flow/editor"
            element={
              <AdminRoute>
                <ProcessFlowEditor />
              </AdminRoute>
            }
          />
          <Route
            path="/workspaces/personal_test/process-flow/monitor"
            element={
              <PrivateRoute>
                <ProcessFlowMonitor />
              </PrivateRoute>
            }
          />
          <Route
            path="/workspaces/personal_test/process-flow/publish"
            element={
              <PrivateRoute>
                <ProcessFlowPublish />
              </PrivateRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <PrivateRoute>
                <Profile />
              </PrivateRoute>
            }
          />
          <Route
            path="/public/flow/:publishToken"
            element={<PublicProcessFlowMonitor />}
          />
        </Routes>
      </Router>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#000',
            color: '#fff',
          },
        }}
      />
    </QueryClientProvider>
  );
}

export default App;