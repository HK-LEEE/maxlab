import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { LogIn, Shield } from 'lucide-react';
import { authService } from '../services/authService';
import { useAuthStore } from '../stores/authStore';

const MLLogo: React.FC = () => (
  <div className="w-16 h-16 bg-gray-900 rounded-xl flex items-center justify-center">
    <span className="text-white font-bold text-2xl">ML</span>
  </div>
);

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [silentLoginAttempting, setSilentLoginAttempting] = useState(true);

  // 페이지 로드 시 자동 Silent 로그인 시도
  useEffect(() => {
    const attemptSilentLogin = async () => {
      try {
        const result = await authService.attemptSilentLogin();
        
        if (result.success && result.user) {
          const token = localStorage.getItem('accessToken') || '';
          setAuth(token, result.user);
          toast.success(`자동 로그인되었습니다. 환영합니다, ${result.user.full_name || result.user.username}!`);
          navigate('/');
        } else {
          console.log('Silent login failed, showing manual login options');
        }
      } catch (error) {
        console.log('Silent login error:', error);
      } finally {
        setSilentLoginAttempting(false);
      }
    };

    attemptSilentLogin();
  }, [navigate, setAuth]);

  const handleOAuthLogin = async () => {
    setOauthLoading(true);
    
    try {
      const user = await authService.loginWithPopupOAuth();
      
      // Create token for compatibility with existing auth store
      const token = localStorage.getItem('accessToken') || '';
      setAuth(token, user);
      
      toast.success(`Welcome back, ${user.full_name || user.username}!`);
      navigate('/');
      
    } catch (error: any) {
      console.error('OAuth login error:', error);
      
      if (error.message?.includes('blocked')) {
        toast.error('Popup was blocked. Please allow popups for this site and try again.', {
          duration: 8000
        });
      } else if (error.message?.includes('cancelled')) {
        toast('Login was cancelled by user.', { icon: 'ℹ️' });
      } else if (error.message?.includes('login_required')) {
        toast.error('Please log in to MAX Platform first, then try again.', {
          duration: 12000
        });
      } else {
        toast.error(error.message || 'OAuth login failed. Please try again.', {
          duration: 8000
        });
      }
    } finally {
      setOauthLoading(false);
    }
  };

  const handleSignupRedirect = () => {
    authService.redirectToSignup();
  };

  // Silent 로그인 진행 중 UI
  if (silentLoginAttempting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center max-w-md w-full mx-4">
          <div className="flex justify-center mb-6">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          </div>
          
          <div className="flex flex-col items-center mb-4">
            <MLLogo />
            <h1 className="text-2xl font-bold mt-4 text-gray-900">MAX Lab</h1>
            <p className="text-gray-500 text-sm mt-1">Manufacturing AI & DX Platform</p>
          </div>
          
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            로그인 상태 확인 중
          </h2>
          <p className="text-gray-600 text-sm">
            MAX Platform 로그인 상태를 확인하고 있습니다...
          </p>
          <p className="text-gray-500 text-xs mt-2">
            이미 로그인되어 있다면 자동으로 연결됩니다
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="w-full max-w-md mx-4">
        <div className="bg-white rounded-xl shadow-lg p-8">
          {/* Logo and Title */}
          <div className="flex flex-col items-center mb-8">
            <MLLogo />
            <h1 className="text-3xl font-bold mt-4 text-gray-900">MAX Lab</h1>
            <p className="text-gray-500 text-sm mt-1">Manufacturing AI & DX Platform</p>
          </div>

          {/* SSO Login Section */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-blue-600 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">보안 로그인</h2>
            </div>
            <p className="text-gray-600 text-sm mb-6">
              MAX Platform 통합 인증으로 안전하게 로그인하세요
            </p>

            {/* OAuth Login Button */}
            <button
              onClick={handleOAuthLogin}
              disabled={oauthLoading}
              className="w-full py-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 transition-colors flex items-center justify-center space-x-3 shadow-md"
            >
              <LogIn size={24} />
              <span className="text-lg">
                {oauthLoading ? 'MAX Platform 연결 중...' : 'MAX Platform으로 로그인'}
              </span>
            </button>
          </div>

          {/* Benefits Section */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-sm font-medium text-gray-900 mb-3">통합 인증의 장점</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                하나의 계정으로 모든 MAX 솔루션 접근
              </li>
              <li className="flex items-center">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                향상된 보안 및 권한 관리
              </li>
              <li className="flex items-center">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                자동 로그인으로 편리한 사용
              </li>
            </ul>
          </div>

          {/* Sign Up Link */}
          <div className="mt-6 text-center text-sm text-gray-600 border-t border-gray-200 pt-4">
            MAX Platform 계정이 없으신가요?{' '}
            <button 
              onClick={handleSignupRedirect}
              className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
            >
              회원가입하기
            </button>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-6 text-center text-xs text-gray-500">
          © 2025 MAX Platform. All rights reserved.
        </div>
      </div>
    </div>
  );
};