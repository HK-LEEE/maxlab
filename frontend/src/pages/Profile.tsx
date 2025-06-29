import React from 'react';
import { useAuthStore } from '../stores/authStore';
import { getAvatarColor, getInitials } from '../utils/avatar';
import { User, Mail, Shield, Calendar } from 'lucide-react';

export const Profile: React.FC = () => {
  const { user } = useAuthStore();

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">사용자 정보를 불러올 수 없습니다.</div>
      </div>
    );
  }

  const initials = getInitials(user.full_name || user.name, user.email);
  const avatarColor = getAvatarColor(user.id || user.email);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {/* Profile Header */}
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center space-x-6">
              <div 
                className="w-24 h-24 rounded-full flex items-center justify-center text-white text-2xl font-medium"
                style={{ backgroundColor: avatarColor }}
              >
                {initials}
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">
                  {user.full_name || user.name || 'Admin User'}
                </h1>
                <p className="text-gray-500 mt-1">{user.email || 'admin@test.com'}</p>
              </div>
            </div>
          </div>

          {/* Profile Details */}
          <div className="p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">프로필 정보</h2>
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <User className="w-5 h-5 text-gray-400" />
                <div>
                  <div className="text-sm text-gray-500">사용자 ID</div>
                  <div className="text-gray-900">{user.id || 'N/A'}</div>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <Mail className="w-5 h-5 text-gray-400" />
                <div>
                  <div className="text-sm text-gray-500">이메일</div>
                  <div className="text-gray-900">{user.email || 'admin@test.com'}</div>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <Shield className="w-5 h-5 text-gray-400" />
                <div>
                  <div className="text-sm text-gray-500">권한</div>
                  <div className="text-gray-900">
                    {user.is_admin ? '관리자' : '일반 사용자'}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <Calendar className="w-5 h-5 text-gray-400" />
                <div>
                  <div className="text-sm text-gray-500">마지막 로그인</div>
                  <div className="text-gray-900">
                    {new Date().toLocaleString('ko-KR')}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Additional Settings */}
          <div className="p-6 border-t border-gray-200">
            <h2 className="text-lg font-medium text-gray-900 mb-4">설정</h2>
            <div className="space-y-3">
              <button className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                <div className="font-medium text-gray-900">비밀번호 변경</div>
                <div className="text-sm text-gray-500 mt-1">계정 보안을 위해 주기적으로 비밀번호를 변경하세요</div>
              </button>
              
              <button className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                <div className="font-medium text-gray-900">알림 설정</div>
                <div className="text-sm text-gray-500 mt-1">이메일 및 시스템 알림을 관리합니다</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};