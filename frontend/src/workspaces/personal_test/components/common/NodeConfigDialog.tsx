import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Node } from 'reactflow';

interface NodeConfigDialogProps {
  node: Node | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (nodeId: string, data: any) => void;
  equipmentTypes: Array<{ code: string; name: string }>;
  availableEquipment: Array<{ 
    equipment_code: string; 
    equipment_name: string; 
    equipment_type: string;
  }>;
  availableMeasurements: Array<{
    equipment_code: string;
    measurement_code: string;
    measurement_desc: string;
  }>;
}

export const NodeConfigDialog: React.FC<NodeConfigDialogProps> = ({
  node,
  isOpen,
  onClose,
  onSave,
  equipmentTypes,
  availableEquipment,
  availableMeasurements,
}) => {
  const [formData, setFormData] = useState({
    equipmentType: '',
    equipmentCode: '',
    equipmentName: '',
    displayMeasurements: [] as string[],
    label: '',
    color: '#3b82f6',
  });
  const [isCommonEquipment, setIsCommonEquipment] = useState(false);

  useEffect(() => {
    if (node) {
      const isCommon = !node.data.equipmentType || node.data.equipmentType === '';
      setIsCommonEquipment(isCommon);
      setFormData({
        equipmentType: node.data.equipmentType || '',
        equipmentCode: node.data.equipmentCode || '',
        equipmentName: node.data.equipmentName || node.data.label || '',
        displayMeasurements: node.data.displayMeasurements || [],
        label: node.data.label || '',
        color: node.data.color || '#3b82f6',
      });
    }
  }, [node]);

  if (!isOpen || !node) return null;

  const filteredEquipment = availableEquipment.filter(
    (eq) => eq.equipment_type === formData.equipmentType
  );

  const availableMeasurementsForEquipment = availableMeasurements.filter(
    (m) => m.equipment_code === formData.equipmentCode
  );

  const handleSave = () => {
    if (node.type === 'group') {
      onSave(node.id, {
        ...node.data,
        label: formData.label,
        color: formData.color,
      });
    } else {
      // Validate common equipment
      if (isCommonEquipment && !formData.equipmentType) {
        alert('공통설비는 설비 타입을 반드시 선택해야 합니다.');
        return;
      }

      const selectedEquipment = availableEquipment.find(
        (eq) => eq.equipment_code === formData.equipmentCode
      );

      onSave(node.id, {
        ...node.data,
        equipmentType: formData.equipmentType,
        equipmentCode: formData.equipmentCode,
        equipmentName: formData.equipmentName,
        label: formData.equipmentName,
        displayMeasurements: formData.displayMeasurements,
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">
            {node.type === 'group' ? 'Configure Group' : 'Configure Equipment Node'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        <form className="p-6 space-y-4">
          {node.type === 'group' ? (
            <>
              {/* Group Label */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Group Label
                </label>
                <input
                  type="text"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                />
              </div>

              {/* Group Color */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Group Color
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="h-10 w-20 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                    placeholder="#3b82f6"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
          {/* Equipment Type */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Equipment Type {isCommonEquipment && <span className="text-red-500">*</span>}
            </label>
            {isCommonEquipment && (
              <p className="text-xs text-gray-500 mb-2">
                공통설비는 설비 타입을 반드시 선택해야 합니다.
              </p>
            )}
            <select
              value={formData.equipmentType}
              onChange={(e) => {
                setFormData({
                  ...formData,
                  equipmentType: e.target.value,
                  equipmentCode: '',
                  displayMeasurements: [],
                });
              }}
              className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black ${
                isCommonEquipment && !formData.equipmentType ? 'border-red-300' : 'border-gray-300'
              }`}
            >
              <option value="">Select equipment type</option>
              {equipmentTypes.map((type) => (
                <option key={type.code} value={type.code}>
                  {type.name} ({type.code})
                </option>
              ))}
            </select>
          </div>

          {/* Equipment Code */}
          {formData.equipmentType && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Equipment Code
              </label>
              <select
                value={formData.equipmentCode}
                onChange={(e) => {
                  const equipment = availableEquipment.find(
                    (eq) => eq.equipment_code === e.target.value
                  );
                  
                  // For common equipment, automatically select all measurements
                  const equipmentMeasurements = availableMeasurements
                    .filter(m => m.equipment_code === e.target.value)
                    .map(m => m.measurement_code);
                  
                  setFormData({
                    ...formData,
                    equipmentCode: e.target.value,
                    equipmentName: equipment?.equipment_name || '',
                    displayMeasurements: isCommonEquipment ? equipmentMeasurements : [],
                  });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
              >
                <option value="">Select equipment</option>
                {filteredEquipment.map((equipment) => (
                  <option key={equipment.equipment_code} value={equipment.equipment_code}>
                    {equipment.equipment_code} - {equipment.equipment_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Equipment Name */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Display Name
            </label>
            <input
              type="text"
              value={formData.equipmentName}
              onChange={(e) =>
                setFormData({ ...formData, equipmentName: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
              placeholder="Enter display name"
            />
          </div>

          {/* Measurements to Display */}
          {formData.equipmentCode && availableMeasurementsForEquipment.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Display Measurements
                {isCommonEquipment && (
                  <span className="text-xs text-gray-500 ml-2">
                    (공통설비는 모든 측정값이 자동 선택됩니다)
                  </span>
                )}
              </label>
              <div className={`space-y-2 max-h-40 overflow-y-auto border rounded p-2 ${
                isCommonEquipment ? 'bg-gray-50' : ''
              }`}>
                {availableMeasurementsForEquipment.map((measurement) => (
                  <label
                    key={measurement.measurement_code}
                    className="flex items-center space-x-2"
                  >
                    <input
                      type="checkbox"
                      value={measurement.measurement_code}
                      checked={formData.displayMeasurements.includes(
                        measurement.measurement_code
                      )}
                      disabled={isCommonEquipment}
                      onChange={(e) => {
                        if (!isCommonEquipment) {
                          if (e.target.checked) {
                            setFormData({
                              ...formData,
                              displayMeasurements: [
                                ...formData.displayMeasurements,
                                measurement.measurement_code,
                              ],
                            });
                          } else {
                          setFormData({
                            ...formData,
                            displayMeasurements: formData.displayMeasurements.filter(
                              (code) => code !== measurement.measurement_code
                            ),
                          });
                          }
                        }
                      }}
                      className="rounded"
                    />
                    <span className="text-sm">
                      {measurement.measurement_desc} ({measurement.measurement_code})
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
            </>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 text-sm bg-black text-white hover:bg-gray-800 rounded"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};