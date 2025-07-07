import React from 'react';
import { X } from 'lucide-react';
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Equipment Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
          {/* Equipment Information */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Equipment Information</h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Name:</span>
                <span className="font-medium">{node.data.equipmentName || node.data.label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Code:</span>
                <span className="font-medium">{node.data.equipmentCode || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Type:</span>
                <span className="font-medium">{node.data.equipmentType}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Status:</span>
                <span className={`px-3 py-1 rounded text-sm ${config.bgColor} ${config.textColor}`}>
                  {config.text}
                </span>
              </div>
              {equipmentStatus?.last_run_time && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Last Run:</span>
                  <span className="font-medium">
                    {new Date(equipmentStatus.last_run_time).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Measurements */}
          {measurements && measurements.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Measurements</h3>
              <div className="space-y-3">
                {measurements.map((measurement, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-medium">{measurement.measurement_desc}</div>
                        <div className="text-sm text-gray-600">Code: {measurement.measurement_code}</div>
                      </div>
                      <div className="text-2xl font-bold text-gray-800">
                        {measurement.measurement_value.toLocaleString()}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">
                      Last updated: {new Date(measurement.timestamp).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No Measurements */}
          {(!measurements || measurements.length === 0) && (
            <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-500">
              No measurement data available
            </div>
          )}
        </div>
      </div>
    </div>
  );
};