import React from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, AlertCircle } from 'lucide-react';

interface EquipmentStatus {
  equipment_type: string;
  equipment_code: string;
  equipment_name: string;
  status: 'ACTIVE' | 'PAUSE' | 'STOP';
  last_run_time: string | null;
}

interface MeasurementData {
  equipment_code: string;
  measurement_desc: string;
  measurement_value: number;
  spec_status?: number;
  usl?: number;
  lsl?: number;
}

interface EquipmentSidebarProps {
  isOpen: boolean;
  isLoading: boolean;
  equipmentStatuses: EquipmentStatus[];
  measurements: MeasurementData[];
  onToggle: () => void;
}

export const EquipmentSidebar: React.FC<EquipmentSidebarProps> = ({
  isOpen,
  isLoading,
  equipmentStatuses,
  measurements,
  onToggle,
}) => {
  const statusConfig = {
    ACTIVE: 'bg-green-100 text-green-800',
    PAUSE: 'bg-yellow-100 text-yellow-800',
    STOP: 'bg-red-100 text-red-800',
  };

  return (
    <>
      {/* Sidebar Toggle Button */}
      <button
        onClick={onToggle}
        className="absolute left-0 top-4 z-10 bg-white border border-gray-300 rounded-r-md p-2 hover:bg-gray-50 transition-all"
        style={{ left: isOpen ? '320px' : '0px' }}
      >
        {isOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
      </button>
      
      {/* Equipment List */}
      <div className={`bg-white border-r overflow-y-auto transition-all duration-300 ${isOpen ? 'w-80 p-4' : 'w-0 p-0'}`}>
        {isOpen && (
          <>
            <h3 className="font-semibold mb-4">Equipment Status</h3>
            {isLoading ? (
              <div className="text-center py-4 text-gray-500">
                <RefreshCw className="animate-spin mx-auto mb-2" size={24} />
                <p>Loading equipment data...</p>
              </div>
            ) : (
              <div className="space-y-2">
                {equipmentStatuses.map((equipment) => {
                  const equipmentMeasurements = measurements.filter(
                    (m) => m.equipment_code === equipment.equipment_code
                  );
                  const hasAlarm = equipmentMeasurements.some(m => m.spec_status === 1);
                  
                  return (
                    <div
                      key={equipment.equipment_code}
                      className={`p-3 border rounded-lg hover:bg-gray-50 ${
                        hasAlarm ? 'border-red-300 bg-red-50' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="font-medium">{equipment.equipment_name}</div>
                          {hasAlarm && (
                            <AlertCircle className="w-4 h-4 text-red-500" title="Out of Spec" />
                          )}
                        </div>
                        <span
                          className={`text-xs px-2 py-1 rounded ${
                            statusConfig[equipment.status]
                          }`}
                        >
                          {equipment.status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600">
                        Code: {equipment.equipment_code}
                      </div>
                      {equipmentMeasurements.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {equipmentMeasurements.slice(0, 2).map((measurement, idx) => (
                            <div key={idx} className="text-xs bg-gray-50 rounded p-2">
                              <div>{measurement.measurement_desc}</div>
                              <div className={`font-bold ${
                                measurement.spec_status === 1 ? 'text-red-600' : ''
                              }`}>
                                {measurement.measurement_value.toLocaleString()}
                                {measurement.spec_status === 1 && ' ⚠️'}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {equipment.last_run_time && (
                        <div className="text-xs text-gray-500 mt-1">
                          Last run: {new Date(equipment.last_run_time).toLocaleString()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
};