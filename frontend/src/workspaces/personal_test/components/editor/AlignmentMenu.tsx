import React from 'react';
import { 
  AlignHorizontalJustifyStart, 
  AlignHorizontalJustifyEnd, 
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyCenter,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter
} from 'lucide-react';

interface AlignmentMenuProps {
  position: { x: number; y: number } | null;
  onAlign: (alignment: string) => void;
  onClose: () => void;
}

export const AlignmentMenu: React.FC<AlignmentMenuProps> = ({
  position,
  onAlign,
  onClose,
}) => {
  if (!position) return null;

  const handleAlign = (alignment: string) => {
    onAlign(alignment);
    onClose();
  };

  return (
    <>
      <div 
        className="fixed inset-0 z-40" 
        onClick={onClose}
      />
      <div
        className="absolute bg-white rounded-lg shadow-lg p-2 z-50"
        style={{ left: position.x, top: position.y }}
      >
        <div className="text-xs font-medium text-gray-700 px-2 py-1 mb-1">Align Nodes</div>
        <div className="grid grid-cols-3 gap-1">
          <button
            onClick={() => handleAlign('left')}
            className="p-2 hover:bg-gray-100 rounded flex items-center justify-center"
            title="Align Left"
          >
            <AlignHorizontalJustifyStart size={16} />
          </button>
          <button
            onClick={() => handleAlign('center-h')}
            className="p-2 hover:bg-gray-100 rounded flex items-center justify-center"
            title="Align Center Horizontal"
          >
            <AlignHorizontalJustifyCenter size={16} />
          </button>
          <button
            onClick={() => handleAlign('right')}
            className="p-2 hover:bg-gray-100 rounded flex items-center justify-center"
            title="Align Right"
          >
            <AlignHorizontalJustifyEnd size={16} />
          </button>
          <button
            onClick={() => handleAlign('top')}
            className="p-2 hover:bg-gray-100 rounded flex items-center justify-center"
            title="Align Top"
          >
            <AlignVerticalJustifyStart size={16} />
          </button>
          <button
            onClick={() => handleAlign('center-v')}
            className="p-2 hover:bg-gray-100 rounded flex items-center justify-center"
            title="Align Center Vertical"
          >
            <AlignVerticalJustifyCenter size={16} />
          </button>
          <button
            onClick={() => handleAlign('bottom')}
            className="p-2 hover:bg-gray-100 rounded flex items-center justify-center"
            title="Align Bottom"
          >
            <AlignVerticalJustifyEnd size={16} />
          </button>
          <button
            onClick={() => handleAlign('distribute-h')}
            className="p-2 hover:bg-gray-100 rounded flex items-center justify-center col-span-1"
            title="Distribute Horizontally"
          >
            <AlignHorizontalDistributeCenter size={16} />
          </button>
          <button
            onClick={() => handleAlign('distribute-v')}
            className="p-2 hover:bg-gray-100 rounded flex items-center justify-center col-span-1"
            title="Distribute Vertically"
          >
            <AlignVerticalDistributeCenter size={16} />
          </button>
        </div>
      </div>
    </>
  );
};