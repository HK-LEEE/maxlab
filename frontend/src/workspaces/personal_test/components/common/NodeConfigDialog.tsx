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
    backgroundColor: '',
    backgroundOpacity: 10,
    titleSize: 14,
    titleColor: '#374151',
    titlePosition: 'top' as 'top' | 'center',
    zIndex: 0,
    borderStyle: 'dashed' as 'solid' | 'dashed',
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
        backgroundColor: node.data.backgroundColor || '',
        backgroundOpacity: node.data.backgroundOpacity ?? 10,
        titleSize: node.data.titleSize || 14,
        titleColor: node.data.titleColor || '#374151',
        titlePosition: node.data.titlePosition || 'top',
        zIndex: node.data.zIndex || 0,
        borderStyle: node.data.borderStyle || 'dashed',
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
        backgroundColor: formData.backgroundColor || formData.color,
        backgroundOpacity: formData.backgroundOpacity,
        titleSize: formData.titleSize,
        titleColor: formData.titleColor,
        titlePosition: formData.titlePosition,
        zIndex: formData.zIndex,
        borderStyle: formData.borderStyle,
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
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

        <form className="p-6 space-y-4 overflow-y-auto flex-1">
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
                  Border Color
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

              {/* Background Color */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Background Color
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={formData.backgroundColor || formData.color}
                    onChange={(e) => setFormData({ ...formData, backgroundColor: e.target.value })}
                    className="h-10 w-20 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.backgroundColor || formData.color}
                    onChange={(e) => setFormData({ ...formData, backgroundColor: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                    placeholder="Same as border color"
                  />
                </div>
              </div>

              {/* Background Opacity */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Background Opacity: {formData.backgroundOpacity}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={formData.backgroundOpacity}
                  onChange={(e) => setFormData({ ...formData, backgroundOpacity: Number(e.target.value) })}
                  className="w-full"
                />
              </div>

              {/* Title Size */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Title Size
                </label>
                <input
                  type="number"
                  min="12"
                  max="24"
                  value={formData.titleSize}
                  onChange={(e) => setFormData({ ...formData, titleSize: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                />
              </div>

              {/* Title Color */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Title Color
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={formData.titleColor}
                    onChange={(e) => setFormData({ ...formData, titleColor: e.target.value })}
                    className="h-10 w-20 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.titleColor}
                    onChange={(e) => setFormData({ ...formData, titleColor: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                  />
                </div>
              </div>

              {/* Title Position */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Title Position
                </label>
                <div className="flex space-x-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="top"
                      checked={formData.titlePosition === 'top'}
                      onChange={(e) => setFormData({ ...formData, titlePosition: e.target.value as 'top' | 'center' })}
                      className="mr-2"
                    />
                    <span className="text-sm">Top</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="center"
                      checked={formData.titlePosition === 'center'}
                      onChange={(e) => setFormData({ ...formData, titlePosition: e.target.value as 'top' | 'center' })}
                      className="mr-2"
                    />
                    <span className="text-sm">Center</span>
                  </label>
                </div>
              </div>

              {/* Z-Index */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Z-Index
                </label>
                <input
                  type="number"
                  min="-999"
                  max="999"
                  value={formData.zIndex}
                  onChange={(e) => setFormData({ ...formData, zIndex: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                />
              </div>

              {/* Border Style */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Border Style
                </label>
                <select
                  value={formData.borderStyle}
                  onChange={(e) => setFormData({ ...formData, borderStyle: e.target.value as 'solid' | 'dashed' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                </select>
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
                  
                  // Don't automatically select all measurements for common equipment
                  setFormData({
                    ...formData,
                    equipmentCode: e.target.value,
                    equipmentName: equipment?.equipment_name || '',
                    displayMeasurements: [],
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
              </label>
              <div className="space-y-2 max-h-40 overflow-y-auto border rounded p-2">
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
                      onChange={(e) => {
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
        </form>
        
        <div className="flex justify-between px-6 py-4 border-t flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              const templateName = prompt('Enter template name:');
              if (templateName) {
                const templates = JSON.parse(localStorage.getItem('nodeTemplates') || '[]');
                const newTemplate = {
                  id: Date.now().toString(),
                  name: templateName,
                  data: node.type === 'group' ? {
                    label: formData.label,
                    color: formData.color,
                    backgroundColor: formData.backgroundColor || formData.color,
                    backgroundOpacity: formData.backgroundOpacity,
                    titleSize: formData.titleSize,
                    titleColor: formData.titleColor,
                    titlePosition: formData.titlePosition,
                    zIndex: formData.zIndex,
                    borderStyle: formData.borderStyle,
                  } : {
                    ...node.data,
                    equipmentType: formData.equipmentType,
                    equipmentCode: formData.equipmentCode,
                    equipmentName: formData.equipmentName,
                    label: formData.equipmentName,
                    displayMeasurements: formData.displayMeasurements,
                  }
                };
                templates.push(newTemplate);
                localStorage.setItem('nodeTemplates', JSON.stringify(templates));
                window.dispatchEvent(new Event('templatesUpdated'));
                alert('Template saved successfully!');
              }
            }}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 rounded"
          >
            Save as Template
          </button>
          
          <div className="flex space-x-3">
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
        </div>
      </div>
    </div>
  );
};