/**
 * 스코프 선택 기능이 포함된 Flow 저장 다이얼로그
 */
import React, { useState } from 'react';
import { X, User, Users, Shield, Globe, Info } from 'lucide-react';

// 로컬 타입 정의 (import 이슈 해결용)
type ScopeType = 'WORKSPACE' | 'USER';

interface SaveFlowDialogData {
  name: string;
  scopeType: ScopeType;
  description?: string;
}

interface ScopeOption {
  value: ScopeType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

interface ScopeSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: SaveFlowDialogData) => void;
  currentFlowName?: string;
  isLoading?: boolean;
}

const scopeOptions: ScopeOption[] = [
  {
    value: 'USER',
    label: '개인용 (USER)',
    description: '나만 볼 수 있는 개인 Flow',
    icon: User,
    color: 'blue'
  },
  {
    value: 'WORKSPACE',
    label: '워크스페이스 공유 (WORKSPACE)',
    description: '워크스페이스 멤버 모두가 볼 수 있는 공유 Flow',
    icon: Users,
    color: 'green'
  }
];

export const ScopeSelectionDialog: React.FC<ScopeSelectionDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  currentFlowName = '',
  isLoading = false
}) => {
  // Clear the flow name for imported flows or new flows
  const [flowName, setFlowName] = useState(
    currentFlowName === 'New Process Flow' || currentFlowName === 'Imported Flow' ? '' : currentFlowName
  );
  const [scopeType, setScopeType] = useState<ScopeType>('USER');
  const [description, setDescription] = useState('');

  const handleSave = () => {
    if (!flowName.trim()) {
      return;
    }

    onSave({
      name: flowName.trim(),
      scopeType,
      description: description.trim() || undefined
    });

    // Reset form
    setFlowName('');
    setScopeType('USER');
    setDescription('');
  };

  const handleClose = () => {
    setFlowName(currentFlowName === 'New Process Flow' || currentFlowName === 'Imported Flow' ? '' : currentFlowName);
    setScopeType('USER');
    setDescription('');
    onClose();
  };

  const selectedOption = scopeOptions.find(option => option.value === scopeType);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h3 className="text-lg font-semibold text-gray-900">
            Process Flow 저장
          </h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isLoading}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Flow Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Flow 이름 *
            </label>
            <input
              type="text"
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Flow 이름을 입력하세요"
              disabled={isLoading}
              required
            />
          </div>

          {/* Scope Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              저장 범위 선택 *
            </label>
            <div className="space-y-3">
              {scopeOptions.map((option) => {
                const IconComponent = option.icon;
                const isSelected = scopeType === option.value;
                
                return (
                  <label
                    key={option.value}
                    className={`
                      flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-all
                      ${isSelected 
                        ? `border-${option.color}-500 bg-${option.color}-50` 
                        : 'border-gray-200 hover:border-gray-300'
                      }
                      ${isLoading ? 'cursor-not-allowed opacity-50' : ''}
                    `}
                  >
                    <input
                      type="radio"
                      name="scopeType"
                      value={option.value}
                      checked={isSelected}
                      onChange={(e) => setScopeType(e.target.value as ScopeType)}
                      className="sr-only"
                      disabled={isLoading}
                    />
                    <div className={`
                      w-5 h-5 mt-0.5 flex-shrink-0
                      ${isSelected ? `text-${option.color}-600` : 'text-gray-400'}
                    `}>
                      <IconComponent size={20} />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">
                        {option.label}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        {option.description}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Permission Info */}
          {selectedOption && (
            <div className={`
              bg-${selectedOption.color}-50 border border-${selectedOption.color}-200 rounded-lg p-3
            `}>
              <div className="flex items-start space-x-2">
                <div className={`text-${selectedOption.color}-600 mt-0.5`}>
                  {selectedOption.value === 'USER' ? (
                    <Shield size={16} />
                  ) : (
                    <Globe size={16} />
                  )}
                </div>
                <div className="text-sm">
                  {selectedOption.value === 'USER' ? (
                    <>
                      <strong>개인용</strong>으로 저장하면 <strong>나만</strong> 이 Flow를 보고 편집할 수 있습니다.
                    </>
                  ) : (
                    <>
                      <strong>워크스페이스 공유</strong>로 저장하면 <strong>워크스페이스의 모든 멤버</strong>가 
                      이 Flow를 보고 편집할 수 있습니다.
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Description (Optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              설명 (선택사항)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="Flow에 대한 간단한 설명을 입력하세요"
              rows={3}
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t bg-gray-50">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            disabled={isLoading}
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!flowName.trim() || isLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>저장 중...</span>
              </div>
            ) : (
              '저장'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};