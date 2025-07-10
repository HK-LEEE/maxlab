import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { ArrowLeft, LogOut, User, Bell, Sparkles, Settings } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { getAvatarColor, getInitials } from '../../utils/avatar';

interface HeaderProps {
  showBackButton?: boolean;
  title?: string;
}

const MLLogo: React.FC = () => (
  <div className="w-12 h-12 bg-gradient-to-br from-gray-900 to-gray-700 rounded-xl flex items-center justify-center shadow-lg">
    <span className="text-white font-bold text-lg font-display">ML</span>
  </div>
);

interface ProfileAvatarProps {
  user: any;
  onClick: () => void;
}

const ProfileAvatar: React.FC<ProfileAvatarProps> = ({ user, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50 transition-colors"
    >
      <div className="w-8 h-8 bg-gradient-to-br from-gray-700 to-gray-900 rounded-lg flex items-center justify-center">
        <User className="w-4 h-4 text-white" />
      </div>
      <div className="hidden md:block text-left">
        <div className="text-sm font-medium text-gray-900">
          {user?.full_name || user?.username || 'Unknown User'}
        </div>
        <div className="text-xs text-gray-500">
          {user?.email || 'No email'}
        </div>
      </div>
    </button>
  );
};

interface ProfileDropdownProps {
  user: any;
  onClose: () => void;
  onLogout: () => void;
}

const ProfileDropdown: React.FC<ProfileDropdownProps> = ({ user, onClose, onLogout }) => {
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleProfileClick = () => {
    navigate('/profile');
    onClose();
  };

  return (
    <div 
      ref={dropdownRef}
      className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-50"
    >
      <button
        onClick={handleProfileClick}
        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
      >
        <Settings className="w-4 h-4" />
        <span>설정</span>
      </button>
      <hr className="my-1 border-gray-100" />
      <button
        onClick={onLogout}
        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
      >
        <LogOut className="w-4 h-4" />
        <span>로그아웃</span>
      </button>
    </div>
  );
};

export const Header: React.FC<HeaderProps> = ({ showBackButton, title }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const isMainPage = location.pathname === '/';
  const [showDropdown, setShowDropdown] = useState(false);

  // 현재 페이지 제목 가져오기
  const getCurrentPageTitle = () => {
    if (title) return title;
    
    const path = location.pathname;
    if (path === '/') return 'Dashboard';
    if (path.startsWith('/workspaces/personal_test/process-flow/editor')) return 'Process Flow Editor';
    if (path.startsWith('/workspaces/personal_test/process-flow/monitor')) return 'Process Flow Monitor';
    if (path.startsWith('/workspaces/personal_test/process-flow/publish')) return 'Process Flow Publish';
    if (path.startsWith('/workspaces/personal_test')) return 'Personal Test Workspace';
    if (path.startsWith('/admin/workspaces')) return 'Workspace Management';
    if (path.startsWith('/admin/users')) return 'User Management';
    if (path.startsWith('/profile')) return 'Profile Settings';
    return 'MAX Lab';
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleLogoClick = () => {
    navigate('/');
  };

  const handleBack = () => {
    navigate(-1);
  };

  return (
    <nav className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div 
            onClick={handleLogoClick}
            className="flex items-center space-x-4 cursor-pointer hover:opacity-80 transition-opacity"
          >
            {!isMainPage && showBackButton !== false && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleBack();
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors mr-2"
                aria-label="Go back"
              >
                <ArrowLeft size={20} className="text-gray-600" />
              </button>
            )}
            
            <MLLogo />
            <div>
              <h1 className="text-xl font-bold text-gray-900 font-display">MAX Lab</h1>
              <p className="text-xs text-gray-500">Manufacturing AI & DX</p>
            </div>
          </div>

          {/* Right Side */}
          {user && (
            <div className="flex items-center space-x-4">
              {/* Notifications */}
              <button className="relative w-10 h-10 bg-gray-50 hover:bg-gray-100 rounded-lg flex items-center justify-center transition-colors">
                <Bell className="w-5 h-5 text-gray-600" />
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></div>
              </button>

              {/* User Menu */}
              <div className="relative">
                <ProfileAvatar 
                  user={user} 
                  onClick={() => setShowDropdown(!showDropdown)} 
                />
                {showDropdown && (
                  <ProfileDropdown 
                    user={user} 
                    onClose={() => setShowDropdown(false)}
                    onLogout={handleLogout}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};