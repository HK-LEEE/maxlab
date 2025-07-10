import React from 'react';
import { X, CheckCircle, AlertTriangle, XCircle, HelpCircle, ExternalLink } from 'lucide-react';
import type { Node } from 'reactflow';

interface EquipmentDetailModalProps {
  node: Node | null;
  isOpen: boolean;
  onClose: () => void;
  equipmentStatus: any;
  measurements: any[];
}

export const EquipmentDetailModal: React.FC<EquipmentDetailModalProps> = ({
  node,
  isOpen,
  onClose,
  equipmentStatus,
  measurements,
}) => {
  if (!isOpen || !node) return null;

  // console.log('EquipmentDetailModal props:', {
  //   node: node,
  //   nodeData: node.data,
  //   equipmentCode: node.data.equipmentCode,
  //   equipmentStatus: equipmentStatus,
  //   measurementsCount: measurements.length
  // });

  const statusConfig = {
    ACTIVE: { text: '운행중', bgColor: 'bg-green-100', textColor: 'text-green-800' },
    PAUSE: { text: '일시정지', bgColor: 'bg-yellow-100', textColor: 'text-yellow-800' },
    STOP: { text: '정지', bgColor: 'bg-red-100', textColor: 'text-red-800' },
  };

  const status = equipmentStatus?.status || 'STOP';
  const config = statusConfig[status];

  // 외부시스템 연동 - 상세 보기 버튼 클릭 처리
  const handleDetailView = (measurementCode: string) => {
    // measurement_code가 None이거나 비어있으면 반응 없음
    if (!measurementCode || measurementCode.toLowerCase() === 'none') {
      return;
    }
    return;
    
    // 외부시스템 호출 URL (필요에 따라 수정 가능)
    const externalSystemUrl = `http://localhost:3001/measurement-detail?code=${encodeURIComponent(measurementCode)}`;
    
    // 새 창에서 외부시스템 열기
    window.open(externalSystemUrl, '_blank', 'noopener,noreferrer');
  };

  // Spec 상태 표시 함수 (숫자 및 문자열 처리)
  const getSpecStatusDisplay = (specStatus: string | number) => {
    // 숫자를 문자열로 변환하여 처리
    const status = String(specStatus);
    
    switch (status) {
      case '0':
      case 'IN_SPEC':
        return {
          text: '정상',
          bgColor: 'bg-green-100',
          textColor: 'text-green-800',
          icon: CheckCircle,
          iconColor: 'text-green-600'
        };
      case '2':
      case 'ABOVE_SPEC':
        return {
          text: '상한 초과',
          bgColor: 'bg-red-100',
          textColor: 'text-red-800',
          icon: XCircle,
          iconColor: 'text-red-600'
        };
      case '1':
      case 'BELOW_SPEC':
        return {
          text: '하한 미만',
          bgColor: 'bg-orange-100',
          textColor: 'text-orange-800',
          icon: AlertTriangle,
          iconColor: 'text-orange-600'
        };
      case '9':
      case 'NO_SPEC':
        return {
          text: '규격 없음',
          bgColor: 'bg-gray-100',
          textColor: 'text-gray-800',
          icon: HelpCircle,
          iconColor: 'text-gray-600'
        };
      default:
        return {
          text: '알 수 없음',
          bgColor: 'bg-gray-100',
          textColor: 'text-gray-800',
          icon: HelpCircle,
          iconColor: 'text-gray-600'
        };
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">설비 상세 정보</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          {/* Equipment Information */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">설비 정보</h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">설비명:</span>
                <span className="font-medium">{node.data.equipmentName || node.data.label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">설비 코드:</span>
                <span className="font-medium">{node.data.equipmentCode || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">설비 타입:</span>
                <span className="font-medium">{node.data.equipmentType}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">운행 상태:</span>
                <span className={`px-3 py-1 rounded text-sm ${config.bgColor} ${config.textColor}`}>
                  {config.text}
                </span>
              </div>
              {equipmentStatus?.last_run_time && (
                <div className="flex justify-between">
                  <span className="text-gray-600">마지막 운행:</span>
                  <span className="font-medium">
                    {new Date(equipmentStatus.last_run_time).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Measurements */}
          {measurements && measurements.length > 0 ? (
            <div>
              <h3 className="text-lg font-semibold mb-3">측정값 목록</h3>
              <div className="space-y-2">
                {(() => {
                  // Remove duplicates by grouping by measurement_code and taking the latest one
                  const measurementMap = new Map();
                  measurements.forEach((measurement) => {
                    const key = measurement.measurement_code;
                    const existing = measurementMap.get(key);
                    if (!existing || new Date(measurement.timestamp) > new Date(existing.timestamp)) {
                      measurementMap.set(key, measurement);
                    }
                  });
                  const uniqueMeasurements = Array.from(measurementMap.values());
                  
                  return uniqueMeasurements.map((measurement, index) => {
                  const specStatus = getSpecStatusDisplay(measurement.spec_status ?? 9);
                  const IconComponent = specStatus.icon;
                  
                  return (
                    <div key={index} className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
                      {/* 측정값 헤더 - 높이 최소화 */}
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900 text-sm">
                            {measurement.measurement_desc} 
                            <span className="text-xs text-gray-500 ml-2">({measurement.measurement_code})</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <div className="text-xl font-bold text-gray-900">
                            {measurement.measurement_value?.toLocaleString() || 'N/A'}
                          </div>
                          <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${specStatus.bgColor} ${specStatus.textColor}`}>
                            <IconComponent size={10} className={`mr-1 ${specStatus.iconColor}`} />
                            {specStatus.text}
                          </div>
                        </div>
                      </div>
                      
                      {/* 규격 정보 - 컴팩트하게 */}
                      <div className="flex flex-wrap gap-2 mb-2">
                        {/* 하한값 (LSL) - 파란색 계열로 변경 */}
                        {(measurement.lower_spec_limit !== undefined && measurement.lower_spec_limit !== null) || 
                         (measurement.lsl !== undefined && measurement.lsl !== null) ? (
                          <div className="bg-blue-50 rounded px-2 py-1 text-xs">
                            <span className="text-blue-600 font-medium">하한값: </span>
                            <span className="text-blue-800 font-semibold">
                              {(measurement.lower_spec_limit || measurement.lsl)?.toLocaleString() || 'N/A'}
                            </span>
                          </div>
                        ) : null}
                        
                        {/* 상한값 (USL) - 빨간색 계열 유지 */}
                        {(measurement.upper_spec_limit !== undefined && measurement.upper_spec_limit !== null) || 
                         (measurement.usl !== undefined && measurement.usl !== null) ? (
                          <div className="bg-red-50 rounded px-2 py-1 text-xs">
                            <span className="text-red-600 font-medium">상한값: </span>
                            <span className="text-red-800 font-semibold">
                              {(measurement.upper_spec_limit || measurement.usl)?.toLocaleString() || 'N/A'}
                            </span>
                          </div>
                        ) : null}
                        
                        {/* 목표값 */}
                        {measurement.target_value !== undefined && measurement.target_value !== null && (
                          <div className="bg-green-50 rounded px-2 py-1 text-xs">
                            <span className="text-green-600 font-medium">목표값: </span>
                            <span className="text-green-800 font-semibold">
                              {measurement.target_value.toLocaleString()}
                            </span>
                          </div>
                        )}
                        
                        {/* 규격 없음 표시 */}
                        {!((measurement.upper_spec_limit !== undefined && measurement.upper_spec_limit !== null) || 
                            (measurement.usl !== undefined && measurement.usl !== null)) && 
                         !((measurement.lower_spec_limit !== undefined && measurement.lower_spec_limit !== null) || 
                            (measurement.lsl !== undefined && measurement.lsl !== null)) && 
                         !(measurement.target_value !== undefined && measurement.target_value !== null) && (
                          <div className="bg-gray-50 rounded px-2 py-1 text-xs">
                            <span className="text-gray-600">규격 없음</span>
                          </div>
                        )}
                      </div>
                      
                      {/* 업데이트 시간 및 상세보기 버튼 */}
                      <div className="flex justify-between items-center text-xs text-gray-500 border-t pt-2">
                        <span>마지막 업데이트: {new Date(measurement.timestamp).toLocaleString()}</span>
                        <button
                          onClick={() => handleDetailView(measurement.measurement_code)}
                          disabled={!measurement.measurement_code || measurement.measurement_code.toLowerCase() === 'none'}
                          className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium transition-colors ${
                            measurement.measurement_code && measurement.measurement_code.toLowerCase() !== 'none'
                              ? 'text-gray-600 bg-gray-50 hover:bg-gray-100 hover:text-gray-700 cursor-pointer'
                              : 'text-gray-400 bg-gray-50 cursor-not-allowed'
                          }`}
                        >
                          <ExternalLink size={12} className="mr-1" />
                          상세보기
                        </button>
                      </div>
                    </div>
                  );
                  });
                })()}
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-500">
              <div className="mb-2">측정값 데이터가 없습니다</div>
              <div className="text-sm">
                {node && node.data.displayMeasurements && node.data.displayMeasurements.length > 0 
                  ? '선택된 측정값에 대한 현재 데이터가 없습니다'
                  : '이 설비에 대해 설정된 측정값이 없습니다'
                }
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};