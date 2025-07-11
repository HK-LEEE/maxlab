import React, { useState, useEffect } from 'react';
import type { Node } from 'reactflow';
import { X } from 'lucide-react';

interface GroupConfigDialogProps {
  node: Node;
  isOpen: boolean;
  onClose: () => void;
  onSave: (nodeId: string, data: any) => void;
}

export const GroupConfigDialog: React.FC<GroupConfigDialogProps> = ({
  node,
  isOpen,
  onClose,
  onSave,
}) => {
  const [formData, setFormData] = useState({
    label: node.data.label || 'Group',
    color: node.data.color || '#6b7280',
    backgroundColor: node.data.backgroundColor || '#6b7280',
    backgroundOpacity: node.data.backgroundOpacity || 10,
    titleSize: node.data.titleSize || 14,
    titleColor: node.data.titleColor || '#374151',
    titlePosition: node.data.titlePosition || 'top',
    zIndex: node.data.zIndex || 0,
    borderStyle: node.data.borderStyle || 'dashed',
  });

  // Update form data when node changes
  useEffect(() => {
    setFormData({
      label: node.data.label || 'Group',
      color: node.data.color || '#6b7280',
      backgroundColor: node.data.backgroundColor || '#6b7280',
      backgroundOpacity: node.data.backgroundOpacity || 10,
      titleSize: node.data.titleSize || 14,
      titleColor: node.data.titleColor || '#374151',
      titlePosition: node.data.titlePosition || 'top',
      zIndex: node.data.zIndex || 0,
      borderStyle: node.data.borderStyle || 'dashed',
    });
  }, [node]);

  const handleSave = () => {
    onSave(node.id, formData);
    onClose();
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Group Configuration</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Group Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Group Name
            </label>
            <input
              type="text"
              value={formData.label}
              onChange={(e) => handleInputChange('label', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter group name"
            />
          </div>

          {/* Border Color */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Border Color
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="color"
                value={formData.color}
                onChange={(e) => handleInputChange('color', e.target.value)}
                className="w-12 h-8 border border-gray-300 rounded cursor-pointer"
              />
              <input
                type="text"
                value={formData.color}
                onChange={(e) => handleInputChange('color', e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="#6b7280"
              />
            </div>
          </div>

          {/* Background Color */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Background Color
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="color"
                value={formData.backgroundColor}
                onChange={(e) => handleInputChange('backgroundColor', e.target.value)}
                className="w-12 h-8 border border-gray-300 rounded cursor-pointer"
              />
              <input
                type="text"
                value={formData.backgroundColor}
                onChange={(e) => handleInputChange('backgroundColor', e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="#6b7280"
              />
            </div>
          </div>

          {/* Background Opacity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Background Opacity: {formData.backgroundOpacity}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={formData.backgroundOpacity}
              onChange={(e) => handleInputChange('backgroundOpacity', parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Border Style */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Border Style
            </label>
            <select
              value={formData.borderStyle}
              onChange={(e) => handleInputChange('borderStyle', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </div>

          {/* Title Color */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title Color
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="color"
                value={formData.titleColor}
                onChange={(e) => handleInputChange('titleColor', e.target.value)}
                className="w-12 h-8 border border-gray-300 rounded cursor-pointer"
              />
              <input
                type="text"
                value={formData.titleColor}
                onChange={(e) => handleInputChange('titleColor', e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="#374151"
              />
            </div>
          </div>

          {/* Title Size */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title Size: {formData.titleSize}px
            </label>
            <input
              type="range"
              min="12"
              max="24"
              value={formData.titleSize}
              onChange={(e) => handleInputChange('titleSize', parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>12px</span>
              <span>18px</span>
              <span>24px</span>
            </div>
          </div>

          {/* Title Position */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title Position
            </label>
            <select
              value={formData.titlePosition}
              onChange={(e) => handleInputChange('titlePosition', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="top">Top</option>
              <option value="center">Center</option>
            </select>
          </div>

          {/* Z-Index */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Z-Index (Layer Order)
            </label>
            <input
              type="number"
              value={formData.zIndex}
              onChange={(e) => handleInputChange('zIndex', parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0"
              min="-10"
              max="10"
            />
            <div className="text-xs text-gray-500 mt-1">
              Higher values appear in front. Use negative values to place behind other elements.
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Preview
          </label>
          <div className="border border-gray-200 rounded p-4 bg-gray-50">
            <div
              className="relative rounded border-2"
              style={{
                width: '200px',
                height: '120px',
                borderColor: formData.color,
                borderStyle: formData.borderStyle,
                backgroundColor: (() => {
                  const color = formData.backgroundColor;
                  const opacity = formData.backgroundOpacity / 100;
                  if (color.startsWith('#')) {
                    const r = parseInt(color.slice(1, 3), 16);
                    const g = parseInt(color.slice(3, 5), 16);
                    const b = parseInt(color.slice(5, 7), 16);
                    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
                  }
                  return color;
                })(),
              }}
            >
              <div 
                className={`${formData.titlePosition === 'center' ? 'h-full flex items-center justify-center' : 'p-3'}`}
              >
                <div 
                  className="font-medium"
                  style={{
                    fontSize: `${formData.titleSize}px`,
                    color: formData.titleColor,
                  }}
                >
                  {formData.label}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};