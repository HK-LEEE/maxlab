import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/common/Layout';
import { Activity, Monitor, Factory } from 'lucide-react';

export const PersonalTestWorkspace: React.FC = () => {
  const navigate = useNavigate();

  const features = [
    {
      id: 'process-editor',
      title: '케미칼 공장 프로세스 구성도 편집',
      description: '공정 흐름도를 생성하고 편집합니다. 설비를 배치하고 연결하여 공정을 구성할 수 있습니다.',
      icon: Activity,
      path: '/workspaces/personal_test/process-flow/editor',
      bgColor: 'bg-blue-100',
      iconColor: 'text-blue-600',
      adminOnly: true,
    },
    {
      id: 'process-monitor',
      title: '케미칼 공장 프로세스 모니터링',
      description: '실시간으로 설비 운행 상태와 측정값을 모니터링합니다. 각 설비의 상세 정보를 확인할 수 있습니다.',
      icon: Monitor,
      path: '/workspaces/personal_test/process-flow/monitor',
      bgColor: 'bg-green-100',
      iconColor: 'text-green-600',
      adminOnly: false,
    },
  ];

  const handleFeatureClick = (path: string) => {
    navigate(path);
  };

  return (
    <Layout title="Personal Test Workspace">
      <div className="max-w-6xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-3">
            <Factory size={32} className="text-gray-700" />
            <div>
              <h1 className="text-3xl font-bold">Personal Test - Chemical Plant</h1>
              <p className="text-gray-600 mt-1">케미칼 공장 프로세스 플로우 관리 시스템</p>
            </div>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <button
                key={feature.id}
                onClick={() => handleFeatureClick(feature.path)}
                className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6 text-left border border-gray-200 hover:border-gray-300"
              >
                <div className="flex items-start space-x-4">
                  <div className={`p-3 rounded-lg ${feature.bgColor}`}>
                    <Icon size={24} className={feature.iconColor} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                    <p className="text-gray-600 text-sm">{feature.description}</p>
                    {feature.adminOnly && (
                      <span className="inline-block mt-2 px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded">
                        Admin Only
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Additional Information */}
        <div className="mt-12 bg-gray-50 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-3">시스템 정보</h2>
          <div className="space-y-2 text-sm text-gray-600">
            <p>• 실시간 설비 상태 모니터링</p>
            <p>• 드래그 앤 드롭 방식의 공정도 편집</p>
            <p>• 10가지 설비 타입 지원</p>
            <p>• 측정값 실시간 업데이트 (5초 주기)</p>
            <p>• 설비별 상세 정보 조회</p>
          </div>
        </div>
      </div>
    </Layout>
  );
};