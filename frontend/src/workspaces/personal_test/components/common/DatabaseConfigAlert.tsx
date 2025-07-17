import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, X } from 'lucide-react';

interface DatabaseConfigAlertProps {
  isVisible: boolean;
  onClose?: () => void;
}

export const DatabaseConfigAlert: React.FC<DatabaseConfigAlertProps> = ({
  isVisible,
  onClose,
}) => {
  const navigate = useNavigate();

  const handleConfirm = () => {
    if (onClose) {
      onClose();
    }
    // Navigate back to previous page
    window.history.back();
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center space-x-3 mb-4">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-8 w-8 text-orange-500" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                데이터베이스 설정 필요
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                모니터링을 위해 데이터베이스 설정이 필요합니다
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="mb-6">
            <p className="text-gray-700">
              현재 기본 데이터베이스로 설정되어 있습니다. 
              실시간 모니터링을 위해서는 적절한 데이터베이스 연결이 필요합니다.
            </p>
            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
              <p className="text-sm text-yellow-800">
                💡 에디터에서 데이터 소스를 설정한 후 다시 시도해주세요.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3">
            <button
              onClick={handleConfirm}
              className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 transition-colors"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};