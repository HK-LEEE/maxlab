import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Node } from 'reactflow';

interface TextConfigDialogProps {
  node: Node;
  isOpen: boolean;
  onClose: () => void;
  onSave: (nodeId: string, data: any) => void;
}

export const TextConfigDialog: React.FC<TextConfigDialogProps> = ({
  node,
  isOpen,
  onClose,
  onSave,
}) => {
  const [text, setText] = useState(node.data.text || 'Text');
  const [fontSize, setFontSize] = useState(node.data.fontSize || 14);
  const [fontWeight, setFontWeight] = useState(node.data.fontWeight || 'normal');
  const [color, setColor] = useState(node.data.color || '#000000');
  const [backgroundColor, setBackgroundColor] = useState(node.data.backgroundColor || '#ffffff');
  const [useTransparentBg, setUseTransparentBg] = useState(node.data.backgroundColor === 'transparent');
  const [textAlign, setTextAlign] = useState(node.data.textAlign || 'center');
  const [padding, setPadding] = useState(node.data.padding || 8);
  const [borderStyle, setBorderStyle] = useState(node.data.borderStyle || 'none');
  const [borderWidth, setBorderWidth] = useState(node.data.borderWidth || 1);
  const [borderColor, setBorderColor] = useState(node.data.borderColor || '#999999');

  useEffect(() => {
    setText(node.data.text || 'Text');
    setFontSize(node.data.fontSize || 14);
    setFontWeight(node.data.fontWeight || 'normal');
    setColor(node.data.color || '#000000');
    setBackgroundColor(node.data.backgroundColor === 'transparent' ? '#ffffff' : node.data.backgroundColor || '#ffffff');
    setUseTransparentBg(node.data.backgroundColor === 'transparent');
    setTextAlign(node.data.textAlign || 'center');
    setPadding(node.data.padding || 8);
    setBorderStyle(node.data.borderStyle || 'none');
    setBorderWidth(node.data.borderWidth || 1);
    setBorderColor(node.data.borderColor || '#999999');
  }, [node]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(node.id, {
      ...node.data,
      text,
      fontSize,
      fontWeight,
      color,
      backgroundColor: useTransparentBg ? 'transparent' : backgroundColor,
      textAlign,
      padding,
      borderStyle,
      borderWidth,
      borderColor,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-lg font-semibold">Text Properties</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Text Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Text
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
              rows={3}
              placeholder="Enter text..."
            />
          </div>

          {/* Font Size */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Font Size
            </label>
            <input
              type="number"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              min="8"
              max="72"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
            />
          </div>

          {/* Font Weight */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Font Weight
            </label>
            <select
              value={fontWeight}
              onChange={(e) => setFontWeight(e.target.value as 'normal' | 'bold')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
            >
              <option value="normal">Normal</option>
              <option value="bold">Bold</option>
            </select>
          </div>

          {/* Text Color */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Text Color
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-20"
              />
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
              />
            </div>
          </div>

          {/* Background Color */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Background
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={useTransparentBg}
                  onChange={(e) => setUseTransparentBg(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm">Transparent background</span>
              </label>
              {!useTransparentBg && (
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="h-10 w-20"
                  />
                  <input
                    type="text"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Text Align */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Text Align
            </label>
            <div className="flex space-x-2">
              <button
                onClick={() => setTextAlign('left')}
                className={`flex-1 px-3 py-2 border rounded-md ${
                  textAlign === 'left'
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Left
              </button>
              <button
                onClick={() => setTextAlign('center')}
                className={`flex-1 px-3 py-2 border rounded-md ${
                  textAlign === 'center'
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Center
              </button>
              <button
                onClick={() => setTextAlign('right')}
                className={`flex-1 px-3 py-2 border rounded-md ${
                  textAlign === 'right'
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Right
              </button>
            </div>
          </div>

          {/* Padding */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Padding
            </label>
            <input
              type="number"
              value={padding}
              onChange={(e) => setPadding(Number(e.target.value))}
              min="0"
              max="50"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
            />
          </div>

          {/* Border Style */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Border Style
            </label>
            <select
              value={borderStyle}
              onChange={(e) => setBorderStyle(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
            >
              <option value="none">None</option>
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </div>

          {/* Border Width and Color - only show if border style is not none */}
          {borderStyle !== 'none' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Border Width
                </label>
                <input
                  type="number"
                  value={borderWidth}
                  onChange={(e) => setBorderWidth(Number(e.target.value))}
                  min="1"
                  max="10"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Border Color
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={borderColor}
                    onChange={(e) => setBorderColor(e.target.value)}
                    className="h-10 w-20"
                  />
                  <input
                    type="text"
                    value={borderColor}
                    onChange={(e) => setBorderColor(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end space-x-3 px-6 py-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};