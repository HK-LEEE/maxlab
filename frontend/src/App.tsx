import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './stores/authStore';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { QueryDetail } from './pages/QueryDetail';
import { WorkspaceManagement } from './pages/admin/WorkspaceManagement';
import { UserManagement } from './pages/admin/UserManagement';
import { PersonalTestWorkspace } from './pages/PersonalTestWorkspace';
import { ProcessFlowEditor } from './workspaces/personal_test/pages/ProcessFlowEditor';
import { ProcessFlowMonitor } from './workspaces/personal_test/pages/ProcessFlowMonitor';
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
  
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
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
            path="/profile"
            element={
              <PrivateRoute>
                <Profile />
              </PrivateRoute>
            }
          />
          <Route
            path="/public/monitor/:publishToken"
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