import React from 'react';
import { Clock, AlertCircle, RotateCcw, X } from 'lucide-react';
import type { FlowBackupData } from '../../utils/flowBackup';

interface BackupRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRecover: (backupData: FlowBackupData) => void;
  onDiscard: () => void;
  backupData: FlowBackupData | null;
}

export const BackupRecoveryModal: React.FC<BackupRecoveryModalProps> = ({
  isOpen,
  onClose,
  onRecover,
  onDiscard,
  backupData
}) => {
  if (!isOpen || !backupData) {
    return null;
  }

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - timestamp) / (1000 * 60));
    
    if (diffMinutes < 1) {
      return '방금 전';
    } else if (diffMinutes < 60) {
      return `${diffMinutes}분 전`;
    } else if (diffMinutes < 24 * 60) {
      const hours = Math.floor(diffMinutes / 60);
      return `${hours}시간 전`;
    } else {
      return date.toLocaleString('ko-KR');
    }
  };

  const handleRecover = () => {
    onRecover(backupData);
    onClose();
  };

  const handleDiscard = () => {
    onDiscard();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-3">
            <RotateCcw className="w-6 h-6 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">
              백업 데이터 발견
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="mb-4">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5" />
              <div>
                <p className="text-gray-700 mb-2">
                  이전 작업 세션에서 저장되지 않은 변경사항이 발견되었습니다.
                </p>
                <p className="text-sm text-gray-600">
                  복구하시겠습니까?
                </p>
              </div>
            </div>
          </div>

          {/* Backup Details */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">플로우 이름:</span>
                <span className="font-medium">{backupData.flowName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">마지막 수정:</span>
                <div className="flex items-center space-x-1">
                  <Clock className="w-3 h-3 text-gray-400" />
                  <span className="font-medium">{formatTimestamp(backupData.timestamp)}</span>
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">노드 수:</span>
                <span className="font-medium">{backupData.nodes.length}개</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">연결 수:</span>
                <span className="font-medium">{backupData.edges.length}개</span>
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6">
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium mb-1">주의사항</p>
                <p>
                  복구를 선택하면 현재 화면의 모든 내용이 백업 데이터로 교체됩니다.
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex space-x-3">
            <button
              onClick={handleRecover}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
            >
              <RotateCcw size={16} />
              <span>복구하기</span>
            </button>
            <button
              onClick={handleDiscard}
              className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
            >
              삭제하기
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-full mt-3 text-gray-500 text-sm hover:text-gray-700 transition-colors"
          >
            나중에 결정
          </button>
        </div>
      </div>
    </div>
  );
};