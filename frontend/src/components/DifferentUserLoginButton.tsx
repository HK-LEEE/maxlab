import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { authService } from '../services/authService';
import { useAuthStore } from '../stores/authStore';

interface DifferentUserLoginButtonProps {
  onLoginClick: () => void;
}

export const DifferentUserLoginButton: React.FC<DifferentUserLoginButtonProps> = ({ 
  onLoginClick 
}) => {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { user } = useAuthStore();

  const handleDifferentUserLogin = async () => {
    // If user is logged in, show logout confirmation
    if (user) {
      const confirmed = window.confirm(
        `현재 ${user.username}(으)로 로그인되어 있습니다.\n\n` +
        `다른 사용자로 로그인하려면 먼저 로그아웃해야 합니다.\n` +
        `로그아웃하고 다시 로그인하시겠습니까?`
      );

      if (!confirmed) return;

      setIsLoggingOut(true);
      try {
        // Perform logout
        await authService.logout();
        toast.success('로그아웃되었습니다. 다시 로그인해주세요.');
        
        // Wait a bit for logout to complete
        setTimeout(() => {
          // Now trigger normal login
          onLoginClick();
        }, 500);
      } catch (error) {
        console.error('Logout error:', error);
        toast.error('로그아웃 중 오류가 발생했습니다.');
      } finally {
        setIsLoggingOut(false);
      }
    } else {
      // No user logged in, just do normal login
      onLoginClick();
    }
  };

  return (
    <button
      onClick={handleDifferentUserLogin}
      disabled={isLoggingOut}
      className="w-full py-2 text-sm font-medium rounded-lg border-2 border-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 transition-colors flex items-center justify-center space-x-2 text-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
      <span>{isLoggingOut ? '로그아웃 중...' : '다른 사용자로 로그인'}</span>
    </button>
  );
};