import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { ArrowLeft, LogOut, User } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { getAvatarColor, getInitials } from '../../utils/avatar';

interface HeaderProps {
  showBackButton?: boolean;
  title?: string;
}

const MLLogo: React.FC = () => (
  <div className="w-12 h-12 bg-gray-900 rounded-lg flex items-center justify-center">
    <span className="text-white font-bold text-lg">ML</span>
  </div>
);

interface ProfileAvatarProps {
  user: any;
  onClick: () => void;
}

const ProfileAvatar: React.FC<ProfileAvatarProps> = ({ user, onClick }) => {
  const initials = getInitials(user.full_name || user.name, user.email);
  const avatarColor = getAvatarColor(user.id || user.email);
  
  return (
    <button
      onClick={onClick}
      className="flex items-center space-x-3 hover:bg-gray-100 rounded-lg px-3 py-2 transition-colors"
    >
      <div className="text-right">
        <div className="text-sm font-medium text-gray-900">Admin User</div>
        <div className="text-xs text-gray-500">{user.email || 'admin@test.com'}</div>
      </div>
      <div 
        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
        style={{ backgroundColor: avatarColor }}
      >
        {initials}
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
      className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
    >
      <button
        onClick={handleProfileClick}
        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
      >
        <User size={16} />
        <span>프로필 보기</span>
      </button>
      <div className="border-t border-gray-100"></div>
      <button
        onClick={onLogout}
        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
      >
        <LogOut size={16} />
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
    <header className="bg-white border-b border-gray-200">
      <div className="h-16 px-4 flex items-center justify-between">
        {/* Left section */}
        <div className="flex items-center space-x-4">
          {!isMainPage && showBackButton !== false && (
            <button
              onClick={handleBack}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft size={20} className="text-gray-600" />
            </button>
          )}
          
          <div 
            className="flex items-center space-x-3 cursor-pointer"
            onClick={handleLogoClick}
          >
            <MLLogo />
            <div>
              <h1 className="text-xl font-semibold">MAX Lab</h1>
              <p className="text-xs text-gray-500">Manufacturing AI & DX</p>
            </div>
          </div>

          {title && (
            <>
              <div className="h-8 w-px bg-gray-300" />
              <h2 className="text-lg font-medium text-gray-700">{title}</h2>
            </>
          )}
        </div>

        {/* Right section */}
        {user && (
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
        )}
      </div>
    </header>
  );
};