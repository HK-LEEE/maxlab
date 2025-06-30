import React from 'react';
import { 
  AlignHorizontalJustifyStart, 
  AlignHorizontalJustifyEnd, 
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyCenter,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  Grid3X3,
  Maximize2,
  Circle
} from 'lucide-react';

interface AlignmentMenuProps {
  onAlign: (alignment: string) => void;
}

export const AlignmentMenu: React.FC<AlignmentMenuProps> = ({
  onAlign,
}) => {
  const handleAlign = (alignment: string) => {
    onAlign(alignment);
  };

  return (
    <div
      className="fixed right-4 top-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg p-2 z-40"
    >
        <div className="text-xs font-medium text-gray-700 px-2 py-1 mb-1">Align Nodes</div>
        <div className="grid grid-cols-3 gap-1 mb-2">
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
        
        <div className="text-xs font-medium text-gray-700 px-2 py-1 mb-1 mt-2 border-t pt-2">Advanced</div>
        <div className="grid grid-cols-3 gap-1">
          <button
            onClick={() => handleAlign('grid')}
            className="p-2 hover:bg-gray-100 rounded flex items-center justify-center"
            title="Align to Grid"
          >
            <Grid3X3 size={16} />
          </button>
          <button
            onClick={() => handleAlign('canvas-center')}
            className="p-2 hover:bg-gray-100 rounded flex items-center justify-center"
            title="Center on Canvas"
          >
            <Maximize2 size={16} />
          </button>
          <button
            onClick={() => handleAlign('circular')}
            className="p-2 hover:bg-gray-100 rounded flex items-center justify-center"
            title="Arrange in Circle"
          >
            <Circle size={16} />
          </button>
        </div>
      </div>
  );
};