import React from 'react';
import { Trash2 } from 'lucide-react';
import type { Node, Edge } from 'reactflow';

interface FloatingActionButtonProps {
  nodes: Node[];
  edges: Edge[];
  onDelete: (elementId: string, elementType: 'node' | 'edge') => void;
}

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  nodes,
  edges,
  onDelete,
}) => {
  const selectedNodes = nodes.filter(n => n.selected);
  const selectedEdges = edges.filter(e => e.selected);
  const selectedElements = {
    nodes: selectedNodes.length,
    edges: selectedEdges.length,
  };

  if (selectedElements.nodes === 0 && selectedElements.edges === 0) {
    return null;
  }

  const handleDelete = () => {
    selectedNodes.forEach(node => onDelete(node.id, 'node'));
    selectedEdges.forEach(edge => onDelete(edge.id, 'edge'));
  };

  return (
    <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-50">
      <button
        onClick={handleDelete}
        className="flex items-center space-x-2 px-6 py-3 bg-red-600 text-white rounded-full shadow-lg hover:bg-red-700 transition-all transform hover:scale-105"
      >
        <Trash2 size={20} />
        <span>
          Delete {selectedElements.nodes > 0 && `${selectedElements.nodes} node${selectedElements.nodes > 1 ? 's' : ''}`}
          {selectedElements.nodes > 0 && selectedElements.edges > 0 && ' and '}
          {selectedElements.edges > 0 && `${selectedElements.edges} edge${selectedElements.edges > 1 ? 's' : ''}`}
        </span>
      </button>
    </div>
  );
};