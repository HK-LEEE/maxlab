import React, { useState, useEffect, useMemo } from 'react';
import type { Node } from 'reactflow';
import { X, ChevronDown, ChevronUp, GripVertical, Info } from 'lucide-react';
import { apiClient } from '../../../../api/client';

interface NodeConfigDialogProps {
  node: Node;
  onClose: () => void;
  onSave: (nodeId: string, data: any) => void;
  isInstrumentNode?: boolean;
}

export const NodeConfigDialog: React.FC<NodeConfigDialogProps> = ({
  node,
  onClose,
  onSave,
  isInstrumentNode = false,
}) => {
  const [formData, setFormData] = useState({
    label: node.data.label || '',
    equipmentType: node.data.equipmentType || '',
    equipmentCode: node.data.equipmentCode || '',
    equipmentName: node.data.equipmentName || '',
    displayMeasurements: node.data.displayMeasurements || [],
    // Instrument node specific
    instrumentType: node.data.instrumentType || 'instrument',
    instrumentName: node.data.instrumentName || '계측기',
    instrumentColor: node.data.color || '#6b7280', // Gray default for instruments
    // Group node specific properties
    color: node.data.color || '#3b82f6',
    backgroundColor: node.data.backgroundColor || node.data.color || '#3b82f6',
    backgroundOpacity: node.data.backgroundOpacity || 10,
    titleSize: node.data.titleSize || 14,
    titleColor: node.data.titleColor || '#000000',
    titlePosition: node.data.titlePosition || 'top',
    zIndex: node.data.zIndex || -1,
    borderStyle: node.data.borderStyle || 'solid',
  });

  const [availableEquipment, setAvailableEquipment] = useState<any[]>([]);
  const [availableMeasurements, setAvailableMeasurements] = useState<any[]>([]);
  const [measurementDetails, setMeasurementDetails] = useState<Record<string, any>>({});
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [expandedMeasurements, setExpandedMeasurements] = useState<Set<string>>(new Set());
  const [availableMeasurementsSearchTerm, setAvailableMeasurementsSearchTerm] = useState('');

  // Check if this is a common equipment node
  const isCommonEquipment = node.id === 'common-equipment';

  // Load available equipment
  useEffect(() => {
    apiClient.get('/api/v1/personal-test/process-flow/equipment/status?workspace_id=personal_test&limit=100')
      .then((response) => {
        const equipmentList = response.data.items || response.data;
        setAvailableEquipment(equipmentList);
      })
      .catch((err) => console.error('Failed to load equipment:', err));
  }, []);

  // Load all available measurements (equipment code independent)
  useEffect(() => {
    // Load all measurements from the workspace
    apiClient.get(`/api/v1/personal-test/process-flow/measurements?workspace_id=personal_test&limit=1000`)
      .then((response) => {
        const measurements = response.data || [];
        setAvailableMeasurements(measurements);
        
        // Create a map of measurement details for preview
        const details: Record<string, any> = {};
        measurements.forEach((m: any) => {
          details[m.measurement_code] = {
            desc: m.measurement_desc,
            value: m.measurement_value,
            unit: m.unit,
            timestamp: m.timestamp,
            spec_status: m.spec_status,
            usl: m.upper_spec_limit,
            lsl: m.lower_spec_limit,
            target: m.target_value,
          };
        });
        setMeasurementDetails(details);
      })
      .catch((err) => console.error('Failed to load measurements:', err));
  }, []); // No dependencies - load all measurements once


  const filteredEquipment = availableEquipment.filter(
    (eq) => eq.equipment_type === formData.equipmentType
  );

  // Get unique measurements for the selected equipment
  const availableMeasurementsForEquipment = Array.from(
    new Map(
      availableMeasurements.map((m) => [m.measurement_code, m])
    ).values()
  );


  // Generate dynamic equipment types from available equipment
  const dynamicEquipmentTypes = useMemo(() => {
    const typeMap = new Map();
    availableEquipment.forEach(eq => {
      if (!typeMap.has(eq.equipment_type)) {
        typeMap.set(eq.equipment_type, {
          code: eq.equipment_type,
          name: `${eq.equipment_type} 설비`
        });
      }
    });
    return Array.from(typeMap.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [availableEquipment]);

  const handleSave = () => {
    if (isCommonEquipment && !formData.equipmentType) {
      alert('공통설비는 설비 타입을 반드시 선택해야 합니다.');
      return;
    }

    if (node.type === 'group') {
      onSave(node.id, {
        ...node.data,
        label: formData.label,
        color: formData.color,
        backgroundColor: formData.backgroundColor,
        backgroundOpacity: formData.backgroundOpacity,
        titleSize: formData.titleSize,
        titleColor: formData.titleColor,
        titlePosition: formData.titlePosition,
        zIndex: formData.zIndex,
        borderStyle: formData.borderStyle,
      });
    } else if (isInstrumentNode) {
      // For instrument nodes
      onSave(node.id, {
        ...node.data,
        label: formData.label,
        instrumentType: formData.instrumentType,
        instrumentName: formData.instrumentName,
        color: formData.instrumentColor,
        displayMeasurements: formData.displayMeasurements,
      });
    } else {
      // For common equipment without code, ensure we have equipment type
      if (isCommonEquipment && !formData.equipmentCode) {
        onSave(node.id, {
          ...node.data,
          equipmentType: formData.equipmentType,
          equipmentName: formData.equipmentName || `공통설비 (${formData.equipmentType})`,
          label: formData.equipmentName || `공통설비 (${formData.equipmentType})`,
          displayMeasurements: formData.displayMeasurements,
        });
        onClose();
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

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const newDisplayMeasurements = [...formData.displayMeasurements];
    const [removed] = newDisplayMeasurements.splice(draggedIndex, 1);
    newDisplayMeasurements.splice(dropIndex, 0, removed);

    setFormData({ ...formData, displayMeasurements: newDisplayMeasurements });
    setDraggedIndex(null);
  };

  const toggleMeasurementExpanded = (code: string) => {
    const newExpanded = new Set(expandedMeasurements);
    if (newExpanded.has(code)) {
      newExpanded.delete(code);
    } else {
      newExpanded.add(code);
    }
    setExpandedMeasurements(newExpanded);
  };

  const getSpecStatusColor = (status: string) => {
    switch (status) {
      case 'ABOVE_SPEC':
        return 'text-red-600';
      case 'BELOW_SPEC':
        return 'text-orange-600';
      default:
        return 'text-green-600';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <h2 className="text-lg font-semibold">
            {node.type === 'group' ? 'Configure Group' : isInstrumentNode ? 'Configure Instrument Node' : 'Configure Equipment Node'}
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
              {/* Group configuration fields remain the same */}
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

              {/* Other group fields... */}
            </>
          ) : (
            <>
              {/* Equipment Type - Hide for instrument nodes */}
              {!isInstrumentNode && (
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
                    {dynamicEquipmentTypes.map((type) => (
                      <option key={type.code} value={type.code}>
                        {type.name} ({type.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Equipment Code - Hide for instrument nodes */}
              {!isInstrumentNode && formData.equipmentType && (
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


              {/* Display Name */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Display Name
                </label>
                <input
                  type="text"
                  value={isInstrumentNode ? formData.label : formData.equipmentName}
                  onChange={(e) =>
                    setFormData({ 
                      ...formData, 
                      ...(isInstrumentNode ? { label: e.target.value } : { equipmentName: e.target.value })
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                  placeholder="Enter display name"
                />
              </div>

              {/* Instrument Node Color - Show only for instrument nodes */}
              {isInstrumentNode && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Node Color
                  </label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="color"
                      value={formData.instrumentColor}
                      onChange={(e) => setFormData({ ...formData, instrumentColor: e.target.value })}
                      className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formData.instrumentColor}
                      onChange={(e) => setFormData({ ...formData, instrumentColor: e.target.value })}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black text-sm font-mono"
                      placeholder="#6b7280"
                    />
                  </div>
                </div>
              )}


              {/* Available Measurements Section with Search */}
              {availableMeasurements.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Available Measurements (All Measurements)
                  </label>
                  <p className="text-xs text-gray-600 mb-2">
                    All measurements from the workspace - equipment code independent
                  </p>
                  
                  {/* Search input */}
                  <input
                    type="text"
                    value={availableMeasurementsSearchTerm}
                    onChange={(e) => setAvailableMeasurementsSearchTerm(e.target.value)}
                    placeholder="Search measurements by code..."
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black mb-3"
                  />
                  
                  {/* Available measurements list */}
                  <div className="space-y-2 max-h-60 overflow-y-auto border rounded p-2">
                    {Array.from(new Map(availableMeasurements.map(m => [m.measurement_code, m])).values())
                      .filter(measurement => 
                        measurement.measurement_code.toLowerCase().includes(availableMeasurementsSearchTerm.toLowerCase()) ||
                        measurement.measurement_desc.toLowerCase().includes(availableMeasurementsSearchTerm.toLowerCase())
                      )
                      .map((measurement, index) => {
                        const isSelected = formData.displayMeasurements.includes(measurement.measurement_code);
                        const details = measurementDetails[measurement.measurement_code];
                        
                        return (
                          <label
                            key={`${measurement.measurement_code}-${index}`}
                            className={`flex items-start space-x-3 p-2 rounded cursor-pointer hover:bg-gray-100 ${
                              isSelected ? 'bg-blue-50 border border-blue-200' : 'bg-white border border-gray-200'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormData({
                                    ...formData,
                                    displayMeasurements: [...formData.displayMeasurements, measurement.measurement_code]
                                  });
                                } else {
                                  setFormData({
                                    ...formData,
                                    displayMeasurements: formData.displayMeasurements.filter(code => code !== measurement.measurement_code)
                                  });
                                }
                              }}
                              className="mt-1 rounded border-gray-300 text-black focus:ring-black"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <div className="font-medium text-sm">
                                  {measurement.measurement_desc}
                                </div>
                                <div className="flex items-center space-x-1">
                                  {details && details.value !== undefined && (
                                    <span className={`text-xs font-medium ${getSpecStatusColor(details.spec_status || 'IN_SPEC')}`}>
                                      {details.value.toLocaleString()} {details.unit || ''}
                                    </span>
                                  )}
                                  {(details?.usl !== undefined || details?.lsl !== undefined) && (
                                    <Info size={12} className="text-gray-400" />
                                  )}
                                </div>
                              </div>
                              <div className="text-xs text-gray-500">Code: {measurement.measurement_code}</div>
                            </div>
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Selected Measurements Display Section */}
              {formData.displayMeasurements.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Selected Measurements
                  </label>
                  <p className="text-xs text-gray-600 mb-2">Drag to reorder selected measurements:</p>
                  <div className="space-y-2 max-h-60 overflow-y-auto border rounded p-2 bg-gray-50">
                    {formData.displayMeasurements.map((code, index) => {
                      const measurement = measurementDetails[code] || 
                        availableMeasurements.find(m => m.measurement_code === code);
                      if (!measurement) return null;
                      
                      return (
                        <div
                          key={code}
                          draggable
                          onDragStart={(e) => handleDragStart(e, index)}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, index)}
                          className="bg-white rounded border p-2 cursor-move hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center space-x-2">
                              <GripVertical size={16} className="text-gray-400" />
                              <div className="flex-1">
                                <div className="font-medium text-sm">
                                  {measurement.measurement_desc || measurement.desc}
                                </div>
                                <div className="text-xs text-gray-500">Code: {code}</div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <button
                                type="button"
                                onClick={() => toggleMeasurementExpanded(code)}
                                className="text-gray-400 hover:text-gray-600"
                              >
                                {expandedMeasurements.has(code) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setFormData({
                                    ...formData,
                                    displayMeasurements: formData.displayMeasurements.filter(m => m !== code)
                                  });
                                }}
                                className="text-red-400 hover:text-red-600"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </div>
                          
                          {expandedMeasurements.has(code) && measurement.value !== undefined && (
                            <div className="mt-2 pt-2 border-t text-xs space-y-1">
                              <div className="flex justify-between">
                                <span className="text-gray-500">Latest Value:</span>
                                <span className={`font-medium ${getSpecStatusColor(measurement.spec_status || 'IN_SPEC')}`}>
                                  {measurement.value?.toLocaleString()} {measurement.unit || ''}
                                </span>
                              </div>
                              {measurement.usl !== undefined && (
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Upper Spec Limit:</span>
                                  <span>{measurement.usl}</span>
                                </div>
                              )}
                              {measurement.lsl !== undefined && (
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Lower Spec Limit:</span>
                                  <span>{measurement.lsl}</span>
                                </div>
                              )}
                              {measurement.target !== undefined && (
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Target:</span>
                                  <span>{measurement.target}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </>
          )}
        </form>
        
        <div className="flex justify-between px-6 py-4 border-t flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};