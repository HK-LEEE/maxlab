import React, { useEffect } from 'react';
import { X, Activity, CheckCircle, AlertTriangle, XCircle, HelpCircle, TrendingUp, Clock, Settings } from 'lucide-react';
import type { Node } from 'reactflow';

interface InstrumentDetailModalProps {
  node: Node | null;
  isOpen: boolean;
  onClose: () => void;
  measurements: any[];
}

interface MeasurementData {
  measurement_code: string;
  measurement_desc: string;
  measurement_value: number | string;
  unit?: string;
  spec_status: string | number;
  upper_spec_limit?: number;
  lower_spec_limit?: number;
  usl?: number;
  lsl?: number;
  timestamp?: string;
}

export const InstrumentDetailModal: React.FC<InstrumentDetailModalProps> = ({
  node,
  isOpen,
  onClose,
  measurements = [],
}) => {
  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen || !node) return null;

  const instrumentName = node.data.label || node.data.name || 'Unknown Instrument';
  const instrumentType = node.data.type || 'instrument';
  const instrumentColor = node.data.color || '#DDA0DD';

  // Spec 상태 표시 함수
  const getSpecStatusDisplay = (specStatus: string | number) => {
    const status = String(specStatus);
    
    switch (status) {
      case '0':
      case 'IN_SPEC':
        return {
          text: '정상',
          bgColor: 'bg-green-100',
          textColor: 'text-green-800',
          icon: CheckCircle,
          iconColor: 'text-green-600',
          borderColor: 'border-green-300'
        };
      case '2':
      case 'ABOVE_SPEC':
        return {
          text: '상한 초과',
          bgColor: 'bg-red-100',
          textColor: 'text-red-800',
          icon: XCircle,
          iconColor: 'text-red-600',
          borderColor: 'border-red-300'
        };
      case '1':
      case 'BELOW_SPEC':
        return {
          text: '하한 미만',
          bgColor: 'bg-amber-100',
          textColor: 'text-amber-800',
          icon: AlertTriangle,
          iconColor: 'text-amber-600',
          borderColor: 'border-amber-300'
        };
      case '9':
      case 'NO_SPEC':
        return {
          text: '규격 없음',
          bgColor: 'bg-gray-100',
          textColor: 'text-gray-800',
          icon: HelpCircle,
          iconColor: 'text-gray-600',
          borderColor: 'border-gray-300'
        };
      default:
        return {
          text: '알 수 없음',
          bgColor: 'bg-gray-100',
          textColor: 'text-gray-800',
          icon: HelpCircle,
          iconColor: 'text-gray-600',
          borderColor: 'border-gray-300'
        };
    }
  };

  // 전체 상태 계산
  const getOverallStatus = () => {
    if (measurements.length === 0) return 'NO_DATA';
    
    const hasAlarm = measurements.some(m => m.spec_status === 2 || m.spec_status === '2' || m.spec_status === 'ABOVE_SPEC');
    const hasWarning = measurements.some(m => m.spec_status === 1 || m.spec_status === '1' || m.spec_status === 'BELOW_SPEC');
    
    if (hasAlarm) return 'ALARM';
    if (hasWarning) return 'WARNING';
    return 'NORMAL';
  };

  const overallStatus = getOverallStatus();
  
  const overallStatusConfig = {
    NORMAL: { 
      text: '정상', 
      bgColor: 'bg-green-500', 
      textColor: 'text-white',
      icon: CheckCircle
    },
    WARNING: { 
      text: '경고', 
      bgColor: 'bg-amber-500', 
      textColor: 'text-white',
      icon: AlertTriangle
    },
    ALARM: { 
      text: '알람', 
      bgColor: 'bg-red-500', 
      textColor: 'text-white',
      icon: XCircle
    },
    NO_DATA: { 
      text: '데이터 없음', 
      bgColor: 'bg-gray-500', 
      textColor: 'text-white',
      icon: HelpCircle
    }
  };

  const statusConfig = overallStatusConfig[overallStatus as keyof typeof overallStatusConfig];

  // 측정값 포맷팅
  const formatValue = (value: number | string, unit?: string) => {
    if (typeof value === 'number') {
      return `${value.toFixed(2)}${unit ? ` ${unit}` : ''}`;
    }
    return `${value}${unit ? ` ${unit}` : ''}`;
  };

  // 규격 범위 표시 (API 필드명 대응)
  const formatSpecRange = (measurement: MeasurementData) => {
    // API가 upper_spec_limit/lower_spec_limit 또는 usl/lsl 둘 다 제공할 수 있음
    const upperLimit = measurement.upper_spec_limit ?? measurement.usl;
    const lowerLimit = measurement.lower_spec_limit ?? measurement.lsl;
    
    if (lowerLimit !== undefined && upperLimit !== undefined) {
      return `${lowerLimit.toFixed(1)} ~ ${upperLimit.toFixed(1)}`;
    } else if (lowerLimit !== undefined) {
      return `≥ ${lowerLimit.toFixed(1)}`;
    } else if (upperLimit !== undefined) {
      return `≤ ${upperLimit.toFixed(1)}`;
    }
    return '규격 없음';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-blue-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div 
                className="p-2 rounded-lg"
                style={{ backgroundColor: instrumentColor + '20', color: instrumentColor }}
              >
                <Activity size={24} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{instrumentName}</h2>
                <p className="text-sm text-gray-600">계측기 상세 정보</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className={`px-3 py-1 rounded-full flex items-center space-x-2 ${statusConfig.bgColor} ${statusConfig.textColor}`}>
                <statusConfig.icon size={16} />
                <span className="font-medium text-sm">{statusConfig.text}</span>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="모달 닫기"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>
          </div>
        </div>

        {/* Quick Status Bar */}
        {measurements.length > 0 && (
          <div className="px-6 py-3 bg-gray-50 border-b">
            <div className="flex items-center space-x-4 overflow-x-auto">
              {measurements.slice(0, 4).map((measurement: MeasurementData) => {
                const specConfig = getSpecStatusDisplay(measurement.spec_status);
                return (
                  <div key={measurement.measurement_code} className="flex items-center space-x-2 min-w-0 flex-shrink-0">
                    <specConfig.icon size={14} className={specConfig.iconColor} />
                    <span className="text-xs font-medium text-gray-700 truncate">
                      {measurement.measurement_desc}
                    </span>
                    <span className="text-xs text-gray-900 font-mono">
                      {formatValue(measurement.measurement_value, measurement.unit)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {measurements.length > 0 ? (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">측정값 및 상태</h3>
              
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {measurements.map((measurement: MeasurementData) => {
                  const specConfig = getSpecStatusDisplay(measurement.spec_status);
                  
                  return (
                    <div 
                      key={measurement.measurement_code}
                      className={`p-4 rounded-lg border-2 ${specConfig.borderColor} ${specConfig.bgColor} transition-all hover:shadow-md`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-gray-900 truncate">
                            {measurement.measurement_desc}
                          </h4>
                          <p className="text-xs text-gray-600 truncate">
                            {measurement.measurement_code}
                          </p>
                        </div>
                        <div className={`p-1 rounded ${specConfig.bgColor}`}>
                          <specConfig.icon size={16} className={specConfig.iconColor} />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-baseline justify-between">
                          <span className="text-2xl font-bold text-gray-900 font-mono">
                            {formatValue(measurement.measurement_value, measurement.unit)}
                          </span>
                        </div>
                        
                        <div className="flex items-center justify-between text-xs">
                          <span className={`px-2 py-1 rounded ${specConfig.bgColor} ${specConfig.textColor} font-medium`}>
                            {specConfig.text}
                          </span>
                        </div>
                        
                        {((measurement.lower_spec_limit !== undefined || measurement.upper_spec_limit !== undefined) || 
                          (measurement.lsl !== undefined || measurement.usl !== undefined)) && (
                          <div className="text-xs text-gray-600">
                            <span className="font-medium">규격:</span> {formatSpecRange(measurement)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Activity size={48} className="text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">측정 데이터 없음</h3>
              <p className="text-gray-600">
                이 계측기에 연결된 측정 데이터가 없습니다.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <div className="flex items-center space-x-1">
                <Clock size={16} />
                <span>마지막 업데이트: {new Date().toLocaleString('ko-KR')}</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <button 
                className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors flex items-center space-x-1 opacity-50 cursor-not-allowed" 
                disabled
                title="트렌드 기능은 추후 구현 예정입니다"
              >
                <TrendingUp size={14} />
                <span>트렌드</span>
              </button>
              <button 
                className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors flex items-center space-x-1 opacity-50 cursor-not-allowed" 
                disabled
                title="설정 기능은 추후 구현 예정입니다"
              >
                <Settings size={14} />
                <span>설정</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};