import React, { useState } from 'react';
import { Globe, Copy, ExternalLink, Calendar, User, Loader2, Lock } from 'lucide-react';

interface ProcessFlow {
  id: string;
  name: string;
  workspace_id: string;
  flow_data: any;
  created_at: string;
  updated_at: string;
  is_published: boolean;
  publish_token?: string;
  published_at?: string;
  created_by?: string;
}

interface PublishItemProps {
  flow: ProcessFlow;
  onPublish: (flowId: string) => Promise<any>;
  onUnpublish: (flowId: string) => Promise<void>;
  onCopyUrl: (publishToken: string) => void;
  getPublicUrl: (publishToken: string) => string;
}

export const PublishItem: React.FC<PublishItemProps> = ({
  flow,
  onPublish,
  onUnpublish,
  onCopyUrl,
  getPublicUrl,
}) => {
  const [isToggling, setIsToggling] = useState(false);

  const handleTogglePublish = async () => {
    setIsToggling(true);
    try {
      if (flow.is_published) {
        await onUnpublish(flow.id);
      } else {
        await onPublish(flow.id);
      }
    } catch (error) {
      console.error('Failed to toggle publish status:', error);
    } finally {
      setIsToggling(false);
    }
  };

  const handleCopyUrl = () => {
    if (flow.publish_token) {
      onCopyUrl(flow.publish_token);
    }
  };

  const handleOpenPublic = () => {
    if (flow.publish_token) {
      const url = getPublicUrl(flow.publish_token);
      window.open(url, '_blank');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="bg-white border rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <h3 className="text-lg font-semibold text-gray-900">{flow.name}</h3>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              flow.is_published 
                ? 'bg-green-100 text-green-800' 
                : 'bg-gray-100 text-gray-800'
            }`}>
              {flow.is_published ? (
                <>
                  <Globe className="w-3 h-3 mr-1" />
                  게시됨
                </>
              ) : (
                <>
                  <Lock className="w-3 h-3 mr-1" />
                  비공개
                </>
              )}
            </span>
          </div>
          
          <div className="space-y-1 text-sm text-gray-600 mb-4">
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4" />
              <span>생성: {formatDate(flow.created_at)}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4" />
              <span>수정: {formatDate(flow.updated_at)}</span>
            </div>
            {flow.published_at && (
              <div className="flex items-center space-x-2">
                <Globe className="w-4 h-4" />
                <span>게시: {formatDate(flow.published_at)}</span>
              </div>
            )}
          </div>

          {flow.is_published && flow.publish_token && (
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700 mb-1">공개 링크</p>
                  <code className="text-xs text-gray-600 bg-white px-2 py-1 rounded border">
                    {getPublicUrl(flow.publish_token).substring(0, 60)}...
                  </code>
                </div>
                <div className="flex space-x-2 ml-4">
                  <button
                    onClick={handleCopyUrl}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                    title="링크 복사"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleOpenPublic}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                    title="새 탭에서 열기"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col space-y-2 ml-6">
          <button
            onClick={handleTogglePublish}
            disabled={isToggling}
            className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md transition-colors ${
              flow.is_published
                ? 'text-red-700 bg-red-100 hover:bg-red-200 focus:ring-red-500'
                : 'text-green-700 bg-green-100 hover:bg-green-200 focus:ring-green-500'
            } focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50`}
          >
            {isToggling ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : flow.is_published ? (
              <Lock className="w-4 h-4 mr-2" />
            ) : (
              <Globe className="w-4 h-4 mr-2" />
            )}
            {isToggling ? '처리 중...' : flow.is_published ? '게시 취소' : '게시하기'}
          </button>
        </div>
      </div>
    </div>
  );
};