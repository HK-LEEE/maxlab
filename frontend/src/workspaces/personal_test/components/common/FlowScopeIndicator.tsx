/**
 * Flow 스코프 표시 컴포넌트
 */
import React from 'react';
import { User, Users, Lock, Globe } from 'lucide-react';

// 로컬 타입 정의 (import 이슈 해결용)
type ScopeType = 'WORKSPACE' | 'USER';
type VisibilityScope = 'WORKSPACE' | 'PRIVATE';

interface FlowScopeIndicatorProps {
  scopeType: ScopeType;
  visibilityScope?: VisibilityScope;
  sharedWithWorkspace?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export const FlowScopeIndicator: React.FC<FlowScopeIndicatorProps> = ({
  scopeType,
  visibilityScope,
  sharedWithWorkspace,
  size = 'md',
  showLabel = true,
  className = ''
}) => {
  const getScopeConfig = () => {
    switch (scopeType) {
      case 'WORKSPACE':
        return {
          icon: Users,
          label: '워크스페이스 공유',
          color: 'green',
          bgColor: 'bg-green-100',
          textColor: 'text-green-800',
          iconColor: 'text-green-600'
        };
      case 'USER':
      default:
        return {
          icon: User,
          label: '개인용',
          color: 'blue',
          bgColor: 'bg-blue-100',
          textColor: 'text-blue-800',
          iconColor: 'text-blue-600'
        };
    }
  };

  const getSizeConfig = () => {
    switch (size) {
      case 'sm':
        return {
          containerClass: 'px-2 py-1 text-xs',
          iconSize: 12,
          gap: 'space-x-1'
        };
      case 'lg':
        return {
          containerClass: 'px-3 py-2 text-base',
          iconSize: 18,
          gap: 'space-x-2'
        };
      case 'md':
      default:
        return {
          containerClass: 'px-2.5 py-1.5 text-sm',
          iconSize: 14,
          gap: 'space-x-1.5'
        };
    }
  };

  const scopeConfig = getScopeConfig();
  const sizeConfig = getSizeConfig();
  const IconComponent = scopeConfig.icon;

  return (
    <div
      className={`
        inline-flex items-center rounded-full font-medium
        ${scopeConfig.bgColor} ${scopeConfig.textColor}
        ${sizeConfig.containerClass} ${sizeConfig.gap}
        ${className}
      `}
      title={`${scopeConfig.label} - ${scopeType === 'WORKSPACE' ? '워크스페이스 멤버 모두 접근 가능' : '생성자만 접근 가능'}`}
    >
      <IconComponent 
        size={sizeConfig.iconSize}
        className={scopeConfig.iconColor}
      />
      {showLabel && <span>{scopeConfig.label}</span>}
    </div>
  );
};

interface FlowScopeBadgeProps {
  scopeType: ScopeType;
  visibilityScope?: VisibilityScope;
  sharedWithWorkspace?: boolean;
  isOwner?: boolean;
  className?: string;
}

export const FlowScopeBadge: React.FC<FlowScopeBadgeProps> = ({
  scopeType,
  visibilityScope,
  sharedWithWorkspace,
  isOwner = false,
  className = ''
}) => {
  const getSecondaryIcon = () => {
    if (!isOwner && scopeType === 'USER') {
      return <Lock size={12} className="text-gray-400 ml-1" />;
    }
    if (scopeType === 'WORKSPACE' && sharedWithWorkspace) {
      return <Globe size={12} className="text-green-500 ml-1" />;
    }
    return null;
  };

  return (
    <div className={`flex items-center ${className}`}>
      <FlowScopeIndicator
        scopeType={scopeType}
        visibilityScope={visibilityScope}
        sharedWithWorkspace={sharedWithWorkspace}
        size="sm"
      />
      {getSecondaryIcon()}
    </div>
  );
};

interface ScopeFilterButtonProps {
  scopeType?: ScopeType | 'ALL';
  onScopeChange: (scope: ScopeType | 'ALL') => void;
  className?: string;
}

export const ScopeFilterButton: React.FC<ScopeFilterButtonProps> = ({
  scopeType = 'ALL',
  onScopeChange,
  className = ''
}) => {
  const filterOptions = [
    {
      value: 'ALL' as const,
      label: '전체',
      icon: Globe,
      count: 0 // 실제로는 props로 전달받아야 함
    },
    {
      value: 'WORKSPACE' as const,
      label: '워크스페이스',
      icon: Users,
      count: 0
    },
    {
      value: 'USER' as const,
      label: '개인용',
      icon: User,
      count: 0
    }
  ];

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <span className="text-sm font-medium text-gray-700">범위:</span>
      <div className="flex items-center space-x-1">
        {filterOptions.map((option) => {
          const IconComponent = option.icon;
          const isSelected = scopeType === option.value;
          
          return (
            <button
              key={option.value}
              onClick={() => onScopeChange(option.value)}
              className={`
                inline-flex items-center space-x-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                ${isSelected
                  ? 'bg-blue-100 text-blue-800 border border-blue-300'
                  : 'bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200'
                }
              `}
            >
              <IconComponent size={14} />
              <span>{option.label}</span>
              {option.count > 0 && (
                <span className={`
                  ml-1 px-1.5 py-0.5 text-xs rounded-full
                  ${isSelected ? 'bg-blue-200 text-blue-900' : 'bg-gray-200 text-gray-600'}
                `}>
                  {option.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};