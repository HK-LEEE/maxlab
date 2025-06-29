import { create } from 'zustand';
import type { User } from '../types/auth';

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  setAuth: (token, user) => {
    // Normalize user data - ensure user_id is set
    const normalizedUser = {
      ...user,
      user_id: user.user_id || user.id || user.email,
    };
    set({ token, user: normalizedUser, isAuthenticated: true });
  },
  logout: () => set({ token: null, user: null, isAuthenticated: false }),
}));