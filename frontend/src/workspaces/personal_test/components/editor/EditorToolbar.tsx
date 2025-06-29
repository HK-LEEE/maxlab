import React from 'react';
import { Save, Plus, Trash2, Play, Pause, AlertCircle, Square, FileText } from 'lucide-react';

interface EditorToolbarProps {
  flowName: string;
  isSaving: boolean;
  isLoadFlowOpen: boolean;
  hasFlows: boolean;
  selectedElements: { nodes: number; edges: number };
  onFlowNameChange: (name: string) => void;
  onSave: () => void;
  onToggleLoadFlow: () => void;
  onAddGroup: () => void;
  onDeleteSelected: () => void;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  flowName,
  isSaving,
  isLoadFlowOpen,
  hasFlows,
  selectedElements,
  onFlowNameChange,
  onSave,
  onToggleLoadFlow,
  onAddGroup,
  onDeleteSelected,
}) => {
  const hasSelectedElements = selectedElements.nodes > 0 || selectedElements.edges > 0;

  return (
    <div className="absolute top-4 left-4 bg-white p-3 rounded-lg shadow-lg z-10">
      <div className="flex items-center space-x-3">
        <input
          type="text"
          value={flowName}
          onChange={(e) => onFlowNameChange(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
          placeholder="Flow name"
        />
        <button
          onClick={onSave}
          disabled={isSaving}
          className="flex items-center space-x-1 px-3 py-1.5 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50 text-sm"
        >
          <Save size={16} />
          <span>{isSaving ? 'Saving...' : 'Save'}</span>
        </button>
        <button
          onClick={onToggleLoadFlow}
          className="flex items-center space-x-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm"
        >
          <FileText size={16} />
          <span>Load</span>
        </button>
        <div className="h-6 w-px bg-gray-300" />
        <button
          onClick={onAddGroup}
          className="flex items-center space-x-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm"
          title="Add group rectangle"
        >
          <Square size={16} />
          <span>Group</span>
        </button>
        {hasSelectedElements && (
          <button
            onClick={onDeleteSelected}
            className="flex items-center space-x-1 px-3 py-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm"
          >
            <Trash2 size={16} />
            <span>Delete ({selectedElements.nodes + selectedElements.edges})</span>
          </button>
        )}
      </div>
    </div>
  );
};