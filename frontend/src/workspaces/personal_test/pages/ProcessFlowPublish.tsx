import React from 'react';
import { Layout } from '../../../components/common/Layout';
import { Settings, Globe, Clock, Users, RefreshCw, AlertCircle } from 'lucide-react';
import { usePublishManager } from '../hooks/usePublishManager';
import { PublishItem } from '../components/publish/PublishItem';

export const ProcessFlowPublish: React.FC = () => {
  const workspaceId = 'personal_test';
  const {
    flows,
    isLoading,
    error,
    stats,
    publishFlow,
    unpublishFlow,
    getPublicUrl,
    copyPublicUrl,
    refreshFlows,
  } = usePublishManager(workspaceId);

  return (
    <Layout title="Process Flow Publish Settings">
      <div className="max-w-6xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Settings size={32} className="text-purple-600" />
              <div>
                <h1 className="text-3xl font-bold">Publish 설정</h1>
                <p className="text-gray-600 mt-1">프로세스 플로우를 게시하거나 게시 취소할 수 있습니다.</p>
              </div>
            </div>
            <button
              onClick={refreshFlows}
              disabled={isLoading}
              className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>새로고침</span>
            </button>
          </div>
        </div>

        {/* Status Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-6 rounded-lg shadow border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">전체 플로우</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalFlows}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <Globe className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">게시된 플로우</p>
                <p className="text-2xl font-bold text-green-600">{stats.publishedFlows}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <Users className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">비공개 플로우</p>
                <p className="text-2xl font-bold text-gray-600">{stats.privateFlows}</p>
              </div>
              <div className="p-3 bg-gray-100 rounded-full">
                <Clock className="w-6 h-6 text-gray-600" />
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">총 조회수</p>
                <p className="text-2xl font-bold text-purple-600">{stats.totalViews}</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-full">
                <Globe className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <span className="text-red-800">{error}</span>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold">프로세스 플로우 목록</h2>
            <p className="text-gray-600 mt-1">각 플로우의 게시 상태를 관리하고 공개 링크를 생성할 수 있습니다.</p>
          </div>
          
          <div className="p-6">
            {isLoading ? (
              <div className="text-center py-12">
                <RefreshCw className="w-16 h-16 text-gray-400 mx-auto mb-4 animate-spin" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">플로우 로딩 중...</h3>
                <p className="text-gray-600">사용 가능한 프로세스 플로우를 불러오고 있습니다.</p>
              </div>
            ) : flows.length === 0 ? (
              <div className="text-center py-12">
                <Globe className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">플로우가 없습니다</h3>
                <p className="text-gray-600">
                  프로세스 플로우를 먼저 생성하세요. 
                  <a href="/workspaces/personal_test/process-flow/editor" className="text-blue-600 hover:text-blue-800 ml-1">
                    편집기로 이동
                  </a>
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {flows.map((flow) => (
                  <PublishItem
                    key={flow.id}
                    flow={flow}
                    onPublish={publishFlow}
                    onUnpublish={unpublishFlow}
                    onCopyUrl={copyPublicUrl}
                    getPublicUrl={getPublicUrl}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};