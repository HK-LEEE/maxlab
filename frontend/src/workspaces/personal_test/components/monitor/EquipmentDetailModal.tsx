import React from 'react';
import { Node } from 'reactflow';
import { AlertCircle, CheckCircle, PauseCircle, TrendingUp, TrendingDown, Minus, X } from 'lucide-react';

interface EquipmentStatus {
  equipment_type: string;
  equipment_code: string;
  equipment_name: string;
  status: 'ACTIVE' | 'PAUSE' | 'STOP';
  last_run_time: string | null;
}

interface MeasurementData {
  id: number;
  equipment_type: string;
  equipment_code: string;
  measurement_code: string;
  measurement_desc: string;
  measurement_value: number;
  timestamp: string;
  usl?: number;
  lsl?: number;
  spec_status?: number; // 0: within spec, 1: out of spec
}

interface EquipmentDetailModalProps {
  node: Node | null;
  isOpen: boolean;
  onClose: () => void;
  equipmentStatus?: EquipmentStatus;
  measurements: MeasurementData[];
}

const statusConfig = {
  ACTIVE: { 
    color: 'bg-green-100 text-green-800', 
    icon: <CheckCircle className="w-4 h-4" />,
    label: 'Active'
  },
  PAUSE: { 
    color: 'bg-yellow-100 text-yellow-800', 
    icon: <PauseCircle className="w-4 h-4" />,
    label: 'Paused'
  },
  STOP: { 
    color: 'bg-red-100 text-red-800', 
    icon: <AlertCircle className="w-4 h-4" />,
    label: 'Stopped'
  },
};

export const EquipmentDetailModal: React.FC<EquipmentDetailModalProps> = ({
  node,
  isOpen,
  onClose,
  equipmentStatus,
  measurements,
}) => {
  if (!node || !isOpen) return null;

  const status = equipmentStatus?.status || 'STOP';
  const statusInfo = statusConfig[status];

  const getSpecIcon = (measurement: MeasurementData) => {
    if (measurement.spec_status === 1) {
      // Out of spec
      if (measurement.usl !== undefined && measurement.measurement_value > measurement.usl) {
        return <TrendingUp className="w-4 h-4 text-red-500" title="Above USL" />;
      } else if (measurement.lsl !== undefined && measurement.measurement_value < measurement.lsl) {
        return <TrendingDown className="w-4 h-4 text-red-500" title="Below LSL" />;
      } else {
        return <AlertCircle className="w-4 h-4 text-red-500" title="Out of Spec" />;
      }
    } else if (measurement.spec_status === 0) {
      return <CheckCircle className="w-4 h-4 text-green-500" title="Within Spec" />;
    } else {
      return <Minus className="w-4 h-4 text-gray-400" title="No Spec Defined" />;
    }
  };

  const formatValue = (value: number, unit?: string) => {
    return `${value.toLocaleString()}${unit ? ` ${unit}` : ''}`;
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  // Group measurements by code to show latest values with history
  const measurementGroups = measurements.reduce((acc, m) => {
    if (!acc[m.measurement_code]) {
      acc[m.measurement_code] = [];
    }
    acc[m.measurement_code].push(m);
    return acc;
  }, {} as Record<string, MeasurementData[]>);

  // Sort each group by timestamp (newest first)
  Object.values(measurementGroups).forEach(group => {
    group.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">{node.data.label}</h2>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-sm font-medium ${statusInfo.color}`}>
              {statusInfo.icon}
              <span className="ml-1">{statusInfo.label}</span>
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 p-6 pb-0">
          <div>
            <p className="text-sm text-gray-500">Equipment Code</p>
            <p className="font-medium">{node.data.equipmentCode || 'N/A'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Equipment Type</p>
            <p className="font-medium">{node.data.equipmentType || 'N/A'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Last Run Time</p>
            <p className="font-medium">
              {equipmentStatus?.last_run_time 
                ? formatTimestamp(equipmentStatus.last_run_time)
                : 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Measurements</p>
            <p className="font-medium">{Object.keys(measurementGroups).length}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 p-6 pt-2">
          {Object.entries(measurementGroups).map(([code, groupMeasurements]) => {
            const latest = groupMeasurements[0];
            const isOutOfSpec = latest.spec_status === 1;
            
            return (
              <div key={code} className={`border rounded-lg ${isOutOfSpec ? 'border-red-300' : 'border-gray-200'}`}>
                <div className="p-4 pb-3 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{code}: {latest.measurement_desc}</span>
                      {getSpecIcon(latest)}
                    </div>
                    <span className="text-2xl font-bold">
                      {formatValue(latest.measurement_value)}
                    </span>
                  </div>
                </div>
                <div className="p-4">
                  {/* Spec Information */}
                  {(latest.lsl !== undefined || latest.usl !== undefined) && (
                    <div className="mb-3 p-3 bg-gray-50 rounded">
                      <div className="text-sm space-y-1">
                        {latest.lsl !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Lower Spec Limit (LSL):</span>
                            <span className="font-medium">{formatValue(latest.lsl)}</span>
                          </div>
                        )}
                        {latest.usl !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Upper Spec Limit (USL):</span>
                            <span className="font-medium">{formatValue(latest.usl)}</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Visual Spec Range */}
                      {latest.lsl !== undefined && latest.usl !== undefined && (
                        <div className="mt-3">
                          <div className="relative h-6 bg-gray-200 rounded">
                            <div className="absolute h-full bg-green-300" 
                              style={{
                                left: '0%',
                                width: '100%',
                              }}
                            />
                            <div className="absolute h-full w-1 bg-black"
                              style={{
                                left: `${Math.max(0, Math.min(100, 
                                  ((latest.measurement_value - latest.lsl) / 
                                  (latest.usl - latest.lsl)) * 100))}%`
                              }}
                            >
                              <div className="absolute -top-1 -left-1 w-3 h-3 bg-black rounded-full" />
                            </div>
                          </div>
                          <div className="flex justify-between mt-1 text-xs text-gray-600">
                            <span>{latest.lsl}</span>
                            <span className={`font-bold ${isOutOfSpec ? 'text-red-600' : ''}`}>
                              Current: {latest.measurement_value}
                            </span>
                            <span>{latest.usl}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* History */}
                  <div>
                    <p className="text-sm font-medium mb-2">Recent History</p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {groupMeasurements.slice(0, 5).map((m) => (
                        <div key={m.id} className="flex justify-between text-sm">
                          <span className="text-gray-600">{formatTimestamp(m.timestamp)}</span>
                          <span className={`font-medium ${
                            m.spec_status === 1 ? 'text-red-600' : ''
                          }`}>
                            {formatValue(m.measurement_value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};