import React from 'react';
import { Settings } from 'lucide-react';

interface EditorPanelProps {
  edgeType: string;
  nodeSize: '1' | '2' | '3';
  autoScroll: boolean;
  selectedElements: { nodes: number; edges: number };
  onEdgeTypeChange: (type: string) => void;
  onNodeSizeChange: (size: '1' | '2' | '3') => void;
  onAutoScrollChange: (enabled: boolean) => void;
}

export const EditorPanel: React.FC<EditorPanelProps> = ({
  edgeType,
  nodeSize,
  autoScroll,
  selectedElements,
  onEdgeTypeChange,
  onNodeSizeChange,
  onAutoScrollChange,
}) => {
  const selectedNodes = selectedElements.nodes;

  return (
    <div className="absolute bottom-4 right-4 bg-white p-3 rounded-lg shadow-lg">
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <Settings size={16} className="text-gray-600" />
          <span className="text-sm font-medium">Settings</span>
        </div>
        
        <div className="h-6 w-px bg-gray-300" />
        
        <div className="flex items-center space-x-2">
          <label className="text-sm text-gray-600">Edge Type:</label>
          <select
            value={edgeType}
            onChange={(e) => onEdgeTypeChange(e.target.value)}
            className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
          >
            <option value="straight">Straight</option>
            <option value="step">Step (90°)</option>
            <option value="smoothstep">Smooth Step</option>
            <option value="default">Bezier</option>
          </select>
        </div>

        {selectedNodes > 0 && (
          <>
            <div className="h-6 w-px bg-gray-300" />
            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-600">Node Size:</label>
              <select
                value={nodeSize}
                onChange={(e) => onNodeSizeChange(e.target.value as '1' | '2' | '3')}
                className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
              >
                <option value="1">1개</option>
                <option value="2">2개</option>
                <option value="3">3개+</option>
              </select>
            </div>
          </>
        )}

        <div className="h-6 w-px bg-gray-300" />
        
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => onAutoScrollChange(e.target.checked)}
            className="rounded border-gray-300 text-black focus:ring-black"
          />
          <span className="text-sm text-gray-600">Auto Scroll</span>
        </label>
      </div>
    </div>
  );
};