import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types/auth';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  setAuth: (token: string, user: User) => void;
  setUser: (user: User) => void;
  logout: () => void;
  isAdmin: () => boolean;
  hasPermission: (requiredRole?: 'admin' | 'user') => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      
      setAuth: (token, user) => {
        // OAuth 토큰은 localStorage에서 별도 관리
        localStorage.setItem('accessToken', token);
        
        // Normalize user data with enhanced admin checking
        const normalizedUser = {
          ...user,
          user_id: user.user_id || user.id || user.email,
          is_admin: user.is_admin || user.role === 'admin' || false,
        };
        
        set({ user: normalizedUser, isAuthenticated: true });
      },
      
      setUser: (user) => {
        const normalizedUser = {
          ...user,
          user_id: user.user_id || user.id || user.email,
          is_admin: user.is_admin || user.role === 'admin' || false,
        };
        set({ user: normalizedUser, isAuthenticated: true });
      },
      
      logout: async () => {
        // Enhanced logout with token revocation
        try {
          // Import authService dynamically to avoid circular dependencies
          const { authService } = await import('../services/authService');
          await authService.logout();
        } catch (error) {
          console.error('Enhanced logout failed, performing basic cleanup:', error);
          
          // Fallback: basic cleanup
          localStorage.removeItem('accessToken');
          localStorage.removeItem('tokenType');
          localStorage.removeItem('expiresIn');
          localStorage.removeItem('scope');
          sessionStorage.clear();
        }
        
        // Always clear auth store state
        set({ user: null, isAuthenticated: false });
      },
      
      isAdmin: () => {
        const user = get().user;
        return user?.is_admin || user?.role === 'admin' || false;
      },
      
      hasPermission: (requiredRole = 'user') => {
        const state = get();
        if (!state.isAuthenticated || !state.user) {
          return false;
        }
        
        if (requiredRole === 'admin') {
          return state.isAdmin();
        }
        
        return true; // 모든 인증된 사용자는 기본 권한 보유
      },
    }),
    {
      name: 'maxlab-auth-storage',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);