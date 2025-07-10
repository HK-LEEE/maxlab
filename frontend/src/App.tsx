import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
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

function App() {
  console.log('App component rendering');
  const [isInitializing, setIsInitializing] = useState(true);
  const setAuth = useAuthStore((state) => state.setAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  
  // 자동 토큰 갱신 시작
  useAuthRefresh();
  
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